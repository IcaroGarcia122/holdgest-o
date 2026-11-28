import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiRequest, ApiResponse } from "../api/_lib/http.js";
import {
  RaffleEngine,
  approveReceiptAction,
  cancelOrderAction,
  formatBotReceiptResponse,
  linkReceiptAction,
  listPendingAdminItems,
  parseAiSettingsInput,
  parseConfirmationMode,
  payOrderManualAction,
  rejectReceiptAction,
  revertOrderAction,
  verifyBotAdminActor,
} from "../api/_lib/raffleEngine.js";
import { handleSummaryDaily } from "../api/bot/summary/daily.js";
import { handleBotAdmin } from "../api/bot/admin.js";

function makeEngine(confirmationMode: "banco" | "manual" = "banco") {
  const engine = new RaffleEngine();
  engine.seedCampaign({
    id: "camp-1",
    ticketPrice: 100,
    reservationMinutes: 30,
    confirmationMode,
    status: "ativa",
  });
  return engine;
}

test("1. Reservas simultâneas do mesmo número são tudo-ou-nada (409 + sugestões)", () => {
  const engine = makeEngine();

  const first = engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990001",
    buyerName: "Lucas Silva",
    quotas: [7, 8],
    sourceMessageId: "msg-1",
  });
  assert.equal(first.ok, true);
  assert.equal(first.status, 201);

  // Segundo comprador tenta [8, 9] — número 8 ocupado impede reserva do 9 também
  const second = engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990002",
    buyerName: "Maria Souza",
    quotas: [8, 9],
    sourceMessageId: "msg-2",
  });
  assert.equal(second.ok, false);
  assert.equal(second.status, 409);
  assert.equal(second.error, "quotas_taken");
  assert.deepEqual(second.taken, [8]);
  assert.ok(second.suggestions && second.suggestions.length === 5);

  // Número 9 deve continuar disponível porque a operação é tudo-ou-nada
  const q9 = engine.quotas.get("camp-1")![8];
  assert.equal(q9.status, "disponivel");
});

test("2. Bloqueia comprovante duplicado por E2E e por hash de imagem", () => {
  const engine = makeEngine("manual");
  engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990001",
    buyerName: "Carlos",
    quotas: [10],
  });

  const first = engine.registerReceipt({
    phone: "5511999990001",
    sourceMessageId: "msg-rcp-1",
    e2e: "E2E123456",
    imageHash: "hash-abc",
    amount: 100,
  });
  assert.equal(first.result, "em_analise");

  // Mesmo E2E com imagem diferente
  const dupE2E = engine.registerReceipt({
    phone: "5511999990001",
    sourceMessageId: "msg-rcp-2",
    e2e: "E2E123456",
    imageHash: "hash-xyz",
    amount: 100,
  });
  assert.equal(dupE2E.result, "duplicado");
  assert.equal(dupE2E.reason, "e2e_duplicado");

  // Mesmo hash de imagem sem E2E
  const dupHash = engine.registerReceipt({
    phone: "5511999990001",
    sourceMessageId: "msg-rcp-3",
    e2e: "E2E999999",
    imageHash: "hash-abc",
    amount: 100,
  });
  assert.equal(dupHash.result, "duplicado");
  assert.equal(dupHash.reason, "image_hash_duplicado");
});

test("3. Pagamento parcial mantém pendente, estende prazo e completa no segundo crédito", () => {
  const engine = makeEngine("banco");
  const t0 = 1_700_000_000_000;

  const created = engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990003",
    buyerName: "Fernanda",
    quotas: [1, 2],
    now: t0,
  });
  const order = created.order!;
  const initialExpiry = order.expiresAt;

  // Regra de ouro: credita valor real do banco (R$ 120 de R$ 200)
  const partial = engine.creditOrder(order.id, 120, t0 + 10_000);
  assert.equal(partial.result, "parcial");
  assert.equal(partial.shortfall, 80);
  assert.equal(order.status, "pendente");
  assert.ok(order.expiresAt > initialExpiry);

  const complete = engine.creditOrder(order.id, 80, t0 + 20_000);
  assert.equal(complete.result, "confirmado");
  assert.equal(complete.surplus, 0);
  assert.equal(order.status, "pago");
  assert.equal(engine.quotas.get("camp-1")![0].status, "paga");
  assert.equal(engine.quotas.get("camp-1")![1].status, "paga");
});

test("4. Pagamento excedente confirma pedido e sinaliza excedente para o admin", () => {
  const engine = makeEngine("banco");
  const created = engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990004",
    buyerName: "Rafael",
    quotas: [20],
  });
  const order = created.order!;

  // Registra Pix no banco com R$ 150 para pedido de R$ 100
  engine.registerPix({ e2e: "E2E-EXCEDENTE", amount: 150 });
  const rcp = engine.registerReceipt({
    phone: "5511999990004",
    sourceMessageId: "msg-exc-1",
    e2e: "E2E-EXCEDENTE",
    imageHash: "hash-exc-1",
    amount: 100, // imagem dizia 100, mas banco recebeu 150 -> vale o do banco!
  });

  assert.equal(rcp.result, "confirmado");
  assert.equal(rcp.surplus, 50);
  assert.equal(order.paidAmount, 150);
  assert.equal(order.surplusAmount, 50);
  assert.equal(order.needsAdmin, true);
  assert.equal(order.conflictReason, "excedente");
});

test("5. Pagamento tardio em pedido expirado com números ainda livres reativa e confirma", () => {
  const engine = makeEngine("banco");
  const t0 = 1_700_000_000_000;

  const created = engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990005",
    buyerName: "Juliana",
    quotas: [30, 31],
    now: t0,
  });
  const order = created.order!;

  // Expira após 31 minutos
  const exp = engine.expireOrders(t0 + 31 * 60_000);
  assert.deepEqual(exp.expired, [order.id]);
  assert.equal(order.status, "expirado");

  // Cliente paga 10 minutos depois; números ainda livres -> reativa
  engine.registerPix({ e2e: "E2E-LATE-FREE", amount: 200, now: t0 + 41 * 60_000 });
  const rcp = engine.registerReceipt({
    phone: "5511999990005",
    sourceMessageId: "msg-late-free",
    e2e: "E2E-LATE-FREE",
    imageHash: "hash-late-free",
    amount: 200,
    now: t0 + 41 * 60_000,
  });

  assert.equal(rcp.result, "confirmado");
  assert.equal(order.status, "pago");
  assert.equal(engine.quotas.get("camp-1")![29].status, "paga");
  assert.equal(engine.quotas.get("camp-1")![30].status, "paga");
});

test("6. Pagamento tardio quando algum número já foi vendido gera conflito_reembolso sem sobrescrever", () => {
  const engine = makeEngine("banco");
  const t0 = 1_700_000_000_000;

  const lateRes = engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990006",
    buyerName: "Bruno",
    quotas: [40, 41],
    now: t0,
  });
  const lateOrder = lateRes.order!;

  engine.expireOrders(t0 + 35 * 60_000);
  assert.equal(lateOrder.status, "expirado");

  // Outro comprador pega o número 41
  const newOwnerRes = engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990007",
    buyerName: "Patrícia",
    quotas: [41],
    now: t0 + 36 * 60_000,
  });
  engine.creditOrder(newOwnerRes.order!.id, 100, t0 + 37 * 60_000);

  // Bruno paga tarde: número 41 já é de Patrícia -> conflito_reembolso
  engine.registerPix({ e2e: "E2E-CONFLITO", amount: 200, now: t0 + 40 * 60_000 });
  const rcp = engine.registerReceipt({
    phone: "5511999990006",
    sourceMessageId: "msg-conflito",
    e2e: "E2E-CONFLITO",
    imageHash: "hash-conflito",
    amount: 200,
    now: t0 + 40 * 60_000,
  });

  assert.equal(rcp.result, "conflito");
  assert.equal(lateOrder.conflictReason, "conflito_reembolso");
  assert.equal(lateOrder.needsAdmin, true);
  // Garante que Patrícia manteve o número 41
  assert.equal(engine.quotas.get("camp-1")![40].orderId, newOwnerRes.order!.id);
  assert.equal(engine.quotas.get("camp-1")![40].status, "paga");
});

test("7. Expiração libera somente pedidos sem comprovante em análise e sem pagamento parcial + aviso único aos 5 min", () => {
  const engine = makeEngine("banco");
  const t0 = 1_700_000_000_000;

  // Pedido A: pendente sem comprovante -> deve avisar aos 25 min e expirar aos 30 min
  const oA = engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990010",
    buyerName: "A",
    quotas: [50],
    now: t0,
  }).order!;

  // Pedido B: pendente com comprovante em análise -> NÃO expira
  const oB = engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990011",
    buyerName: "B",
    quotas: [51],
    now: t0,
  }).order!;
  engine.registerReceipt({
    phone: "5511999990011",
    sourceMessageId: "msg-b",
    e2e: "E2E-SEM-BANCO",
    imageHash: "hash-b",
    amount: 100,
    now: t0 + 60_000,
  });

  // Pedido C: pagamento parcial -> NÃO expira nos 30 min originais
  const oC = engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990012",
    buyerName: "C",
    quotas: [52, 53],
    now: t0,
  }).order!;
  engine.creditOrder(oC.id, 100, t0 + 60_000);

  // Aos 26 min: Pedido A recebe aviso uma única vez
  const w1 = engine.expireOrders(t0 + 26 * 60_000);
  assert.deepEqual(w1.warnings, [oA.id]);
  const w2 = engine.expireOrders(t0 + 27 * 60_000);
  assert.deepEqual(w2.warnings, []);

  // Aos 31 min: apenas Pedido A expira
  const exp = engine.expireOrders(t0 + 31 * 60_000);
  assert.deepEqual(exp.expired, [oA.id]);
  assert.equal(oA.status, "expirado");
  assert.equal(engine.quotas.get("camp-1")![49].status, "disponivel");
  assert.equal(oB.status, "em_analise");
  assert.equal(oC.status, "pendente");
});

test("Regra de ouro: imagem sozinha nunca confirma pagamento em modo banco", () => {
  const engine = makeEngine("banco");
  const ord = engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990020",
    buyerName: "Imagem Sem Pix",
    quotas: [60],
  }).order!;

  const res = engine.registerReceipt({
    phone: "5511999990020",
    sourceMessageId: "msg-img-only",
    e2e: "E2E-NAO-RECEBIDO-NO-BANCO",
    imageHash: "hash-img-only",
    amount: 100,
    preStatus: "ok",
  });

  assert.equal(res.result, "em_analise");
  assert.equal(ord.status, "em_analise");
  assert.equal(engine.quotas.get("camp-1")![59].status, "reservada");

  // Quando o banco confirma o Pix posteriormente, o pedido é conciliado automaticamente
  const pixRes = engine.registerPix({
    e2e: "E2E-NAO-RECEBIDO-NO-BANCO",
    amount: 100,
  });
  assert.equal(pixRes.result, "confirmado");
  assert.equal(ord.status, "pago");
  assert.equal(engine.quotas.get("camp-1")![59].status, "paga");
});

test("9. Rejeitar comprovante volta pedido para pendente somente se não houver outro comprovante em análise", () => {
  const engine = makeEngine("manual");
  const ord = engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990030",
    buyerName: "Gabriel",
    quotas: [70],
  }).order!;

  engine.registerReceipt({
    phone: "5511999990030",
    sourceMessageId: "msg-rej-1",
    e2e: "E2E-REJ-1",
    imageHash: "hash-rej-1",
    amount: 100,
  });
  engine.registerReceipt({
    phone: "5511999990030",
    sourceMessageId: "msg-rej-2",
    e2e: "E2E-REJ-2",
    imageHash: "hash-rej-2",
    amount: 100,
    preStatus: "reenvio",
  });

  const receiptsForOrder = Array.from(engine.receipts.values()).filter(
    (r) => r.orderId === ord.id
  );
  assert.equal(receiptsForOrder.length, 2);
  assert.equal(ord.status, "em_analise");

  // Rejeita o primeiro: ainda há outro comprovante em análise -> continua em_analise
  const firstRej = engine.rejectReceipt(receiptsForOrder[0].id);
  assert.equal(firstRej.ok, true);
  assert.equal(firstRej.orderStatus, "em_analise");
  assert.equal(ord.status, "em_analise");

  // Rejeita o segundo: não há mais nenhum em análise -> volta para pendente
  const secondRej = engine.rejectReceipt(receiptsForOrder[1].id);
  assert.equal(secondRej.ok, true);
  assert.equal(secondRej.orderStatus, "pendente");
  assert.equal(ord.status, "pendente");
  assert.equal(ord.needsAdmin, false);
});

test("10. Bot Admin: não-admin recebe 403 (inclusive quando admin_phones está vazio)", () => {
  const engine = makeEngine("manual");
  const ord = engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990040",
    buyerName: "Teste Auth",
    quotas: [75],
  }).order!;

  // admin_phones vazio -> 403
  const emptyListRes = engine.payOrderManual({
    ref: ord.code,
    actorPhone: "5543999999999",
  });
  assert.equal(emptyListRes.ok, false);
  if (!emptyListRes.ok) {
    assert.equal(emptyListRes.status, 403);
    assert.equal(emptyListRes.error, "not_admin");
  }

  // Com admin configurado, telefone comum continua recebendo 403
  engine.setAdminPhones(["5543999999999"]);
  const nonAdminPending = engine.listPendingForBot("5511999990040");
  assert.equal(nonAdminPending.ok, false);
  if (!nonAdminPending.ok) {
    assert.equal(nonAdminPending.status, 403);
    assert.equal(nonAdminPending.error, "not_admin");
  }

  const nonAdminPay = engine.payOrderManual({
    ref: ord.code,
    actorPhone: "+55 (11) 99999-0040",
  });
  assert.equal(nonAdminPay.ok, false);
  if (!nonAdminPay.ok) {
    assert.equal(nonAdminPay.status, 403);
    assert.equal(nonAdminPay.error, "not_admin");
  }
});

test("11. Bot Admin: admin aprova comprovante (credita uma vez) e aprovação repetida é idempotente", () => {
  const engine = makeEngine("manual");
  engine.setAdminPhones(["+55 (43) 99999-9999"]);

  const ord = engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990041",
    buyerName: "Mariana",
    quotas: [80, 81],
  }).order!;

  const rcpRes = engine.registerReceipt({
    phone: "5511999990041",
    sourceMessageId: "msg-bot-approve-1",
    e2e: "E2E-BOT-APPROVE-1",
    imageHash: "hash-bot-approve-1",
    amount: 200,
  });
  assert.equal(rcpRes.result, "em_analise");
  assert.ok(rcpRes.receiptCode);

  // Admin aprova usando código curto em minúsculas
  const approve1 = engine.approveReceipt({
    ref: rcpRes.receiptCode!.toLowerCase(),
    actorPhone: "5543999999999",
  });
  assert.equal(approve1.ok, true);
  if (approve1.ok) {
    assert.equal(approve1.result, "confirmado");
    assert.equal(approve1.order?.status, "pago");
    assert.equal(approve1.order?.paidAmount, 200);
    assert.equal(approve1.receipt?.status, "confirmado");
    assert.equal(approve1.shortfall, 0);
    assert.equal(approve1.surplus, 0);
  }
  assert.equal(engine.auditLog[0]?.actor, "whatsapp:5543999999999");
  assert.equal(engine.auditLog[0]?.action, "RECEIPT_APPROVED");
  assert.equal(engine.outboundEvents.length, 1);
  assert.equal(engine.outboundEvents[0]?.event, "ORDER_PAID");

  // Segunda aprovação do mesmo comprovante é idempotente e não credita de novo
  const approve2 = engine.approveReceipt({
    ref: rcpRes.receiptId!,
    actorPhone: "5543999999999",
  });
  assert.equal(approve2.ok, true);
  if (approve2.ok) {
    assert.equal(approve2.result, "ja_processado");
    assert.equal(approve2.order?.paidAmount, 200);
  }
  assert.equal(ord.paidAmount, 200);
  assert.equal(engine.outboundEvents.length, 1);
});

test("12. Bot Admin: rejeitar comprovante volta pedido a pendente; link, pay manual, cancel e revert por :ref (código curto e id)", () => {
  const engine = makeEngine("manual");
  engine.setAdminPhones(["5543999998888"]);

  // Cria comprovante órfão e depois vincula via linkReceipt
  const orphanRes = engine.registerReceipt({
    phone: "5511999990042",
    sourceMessageId: "msg-bot-orphan-1",
    e2e: "E2E-BOT-ORPHAN-1",
    imageHash: "hash-bot-orphan-1",
    amount: 100,
  });
  assert.equal(orphanRes.result, "orfao");

  const ord = engine.createOrder({
    campaignId: "camp-1",
    phone: "5511999990043",
    buyerName: "Pedro",
    quotas: [90, 91],
  }).order!;

  // Vincula órfão pelo código curto do comprovante e código curto do pedido (case-insensitive)
  const linked = engine.linkReceipt({
    receiptRef: orphanRes.receiptCode!.toLowerCase(),
    orderRef: ord.code.toLowerCase(),
    actorPhone: "5543999998888",
  });
  assert.equal(linked.ok, true);
  if (linked.ok) {
    assert.equal(linked.result, "vinculado");
    assert.equal(linked.order?.status, "em_analise");
  }

  // Lista pendentes inclui esse comprovante
  const pending = engine.listPendingForBot("5543999998888");
  assert.equal(pending.ok, true);
  if (pending.ok) {
    assert.equal(pending.items.length, 1);
    assert.equal(pending.items[0]?.code, orphanRes.receiptCode);
  }

  // Rejeitar devolve o pedido para pendente
  const rejected = engine.rejectReceiptByRef({
    ref: orphanRes.receiptCode!,
    actorPhone: "5543999998888",
    reason: "Comprovante divergente",
  });
  assert.equal(rejected.ok, true);
  if (rejected.ok) {
    assert.equal(rejected.result, "rejeitado");
    assert.equal(rejected.order?.status, "pendente");
  }

  // Pay manual pelo código curto (Rxxxx)
  const paid = engine.payOrderManual({
    ref: ord.code.toLowerCase(),
    actorPhone: "5543999998888",
  });
  assert.equal(paid.ok, true);
  if (paid.ok) {
    assert.equal(paid.result, "confirmado");
    assert.equal(paid.order?.status, "pago");
    assert.equal(paid.order?.paidAmount, 200);
  }
  assert.equal(engine.quotas.get("camp-1")![89].status, "paga");
  assert.equal(engine.quotas.get("camp-1")![90].status, "paga");

  // Revert pelo id do pedido volta para pendente e cotas para reservada
  const reverted = engine.revertOrder({
    ref: ord.id,
    actorPhone: "5543999998888",
  });
  assert.equal(reverted.ok, true);
  if (reverted.ok) {
    assert.equal(reverted.result, "revertido");
    assert.equal(reverted.order?.status, "pendente");
    assert.equal(reverted.order?.paidAmount, 0);
  }
  assert.equal(engine.quotas.get("camp-1")![89].status, "reservada");
  assert.equal(engine.quotas.get("camp-1")![90].status, "reservada");

  // Paga parcial e depois cancela -> libera números e devolve refundAmount
  const partialPay = engine.payOrderManual({
    ref: ord.code,
    actorPhone: "5543999998888",
    amount: 50,
  });
  assert.equal(partialPay.ok, true);
  if (partialPay.ok) {
    assert.equal(partialPay.result, "parcial");
    assert.equal(partialPay.shortfall, 150);
  }

  const cancelled = engine.cancelOrder({
    ref: ord.id,
    actorPhone: "5543999998888",
  });
  assert.equal(cancelled.ok, true);
  if (cancelled.ok) {
    assert.equal(cancelled.result, "cancelado");
    assert.equal(cancelled.order?.status, "cancelado");
    assert.equal(cancelled.refundAmount, 50);
  }
  assert.equal(engine.quotas.get("camp-1")![89].status, "disponivel");
  assert.equal(engine.quotas.get("camp-1")![89].orderId, null);
  assert.equal(engine.quotas.get("camp-1")![90].status, "disponivel");
});

function createFakeSupabase() {
  const db: Record<string, Array<Record<string, unknown>>> = {
    bot_settings: [{ id: 1, admin_phones: ["+55 (43) 99999-9999"] }],
    campaigns: [{ id: "camp-1", reservation_minutes: 30, status: "ativa" }],
    orders: [
      {
        id: "ord-100",
        code: "R3F9A",
        campaign_id: "camp-1",
        buyer_name: "Ana Paula",
        buyer_phone: "5511988887777",
        quotas: [12, 15],
        total_amount: 20,
        paid_amount: 0,
        surplus_amount: 0,
        needs_admin: true,
        conflict_reason: null,
        status: "em_analise",
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        created_at: new Date().toISOString(),
      },
    ],
    quotas: [
      { campaign_id: "camp-1", number: 12, status: "reservada", order_id: "ord-100" },
      { campaign_id: "camp-1", number: 15, status: "reservada", order_id: "ord-100" },
    ],
    receipts: [
      {
        id: "rcp-100",
        code: "C3F9A",
        order_id: "ord-100",
        campaign_id: "camp-1",
        buyer_phone: "5511988887777",
        amount: 20,
        payer_name: "Ana Paula",
        e2e: "E2E-100",
        reasons: [],
        status: "em_analise",
        created_at: new Date().toISOString(),
      },
    ],
    audit_log: [],
  };

  class QueryBuilder {
    private table: string;
    private filters: Array<(row: Record<string, unknown>) => boolean> = [];
    private op: "select" | "update" | "insert" = "select";
    private patch: Record<string, unknown> = {};
    private headOnly = false;

    private orderCol: string | null = null;
    private orderAsc = true;
    private limitCount: number | null = null;

    constructor(table: string) {
      this.table = table;
    }

    select(_cols = "*", opts?: { count?: string; head?: boolean }) {
      this.op = "select";
      this.headOnly = Boolean(opts?.head);
      return this;
    }
    update(patch: Record<string, unknown>) {
      this.op = "update";
      this.patch = patch;
      return this;
    }
    insert(row: Record<string, unknown>) {
      db[this.table].push({ ...row });
      return Promise.resolve({ data: row, error: null });
    }
    eq(col: string, val: unknown) {
      this.filters.push((r) => r[col] === val);
      return this;
    }
    neq(col: string, val: unknown) {
      this.filters.push((r) => r[col] !== val);
      return this;
    }
    in(col: string, vals: unknown[]) {
      this.filters.push((r) => vals.includes(r[col]));
      return this;
    }
    gt(col: string, val: number) {
      this.filters.push((r) => Number(r[col] ?? 0) > val);
      return this;
    }
    lte(col: string, val: string) {
      this.filters.push((r) => String(r[col] ?? "") <= val);
      return this;
    }
    not(col: string, _op: string, val: unknown) {
      this.filters.push((r) => r[col] !== val && r[col] !== undefined);
      return this;
    }
    order(col?: string, opts?: { ascending?: boolean }) {
      this.orderCol = col ?? null;
      this.orderAsc = opts?.ascending !== false;
      return this;
    }
    limit(n: number) {
      this.limitCount = n;
      return this;
    }
    private execute() {
      const rows = db[this.table] ?? [];
      let matched = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "update") {
        for (const row of matched) {
          Object.assign(row, this.patch);
        }
        return { data: matched, count: matched.length, error: null };
      }
      if (this.orderCol) {
        const col = this.orderCol;
        const dir = this.orderAsc ? 1 : -1;
        matched = [...matched].sort(
          (a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * dir
        );
      }
      if (this.limitCount !== null) {
        matched = matched.slice(0, this.limitCount);
      }
      if (this.headOnly) {
        return { data: null, count: matched.length, error: null };
      }
      return { data: matched.map((r) => ({ ...r })), count: matched.length, error: null };
    }
    maybeSingle() {
      const res = this.execute();
      const first = Array.isArray(res.data) ? res.data[0] ?? null : null;
      return Promise.resolve({ data: first, error: null });
    }
    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
    }
  }

  const client = {
    from(table: string) {
      return new QueryBuilder(table);
    },
    async rpc(fn: string, params: Record<string, unknown>) {
      if (fn !== "credit_order") {
        return { data: null, error: { message: "unknown_rpc" } };
      }
      const ord = db.orders.find((o) => o.id === params.p_order_id);
      if (!ord) return { data: { result: "nao_encontrado" }, error: null };
      const amount = Number(params.p_amount || 0);
      const nextPaid = Number((Number(ord.paid_amount || 0) + amount).toFixed(2));
      ord.paid_amount = nextPaid;
      if (nextPaid >= Number(ord.total_amount)) {
        const surplus = Number((nextPaid - Number(ord.total_amount)).toFixed(2));
        ord.status = "pago";
        ord.surplus_amount = surplus;
        for (const q of db.quotas) {
          if (q.order_id === ord.id) q.status = "paga";
        }
        db.audit_log.push({
          actor: params.p_origin,
          action: "ORDER_CREDITED_PAID",
          details: { order_id: ord.id, amount },
        });
        return { data: { ok: true, result: "confirmado", surplus }, error: null };
      }
      const shortfall = Number((Number(ord.total_amount) - nextPaid).toFixed(2));
      ord.status = "pendente";
      return { data: { ok: true, result: "parcial", shortfall }, error: null };
    },
  };

  return { client: client as unknown as SupabaseClient, db };
}

test("13. Funções compartilhadas (raffleEngine -> Supabase): auth, :ref curto/id, idempotência, rejeição, pay, revert, cancel e audit_log", async () => {
  const { client, db } = createFakeSupabase();
  const events: string[] = [];
  const hooks = {
    dispatchOutboundEvent: async (ev: string) => {
      events.push(ev);
    },
    checkAndNotifyRaffleComplete: async () => false,
  };

  // Não-admin -> 403
  const denied = await verifyBotAdminActor(client, "5511000000000");
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.status, 403);

  // Admin válido
  const allowed = await verifyBotAdminActor(client, "5543999999999");
  assert.equal(allowed.ok, true);
  if (!allowed.ok) return;
  assert.equal(allowed.actorLabel, "whatsapp:5543999999999");

  // Pending lista o comprovante
  const pend = await listPendingAdminItems(client);
  assert.equal(pend.ok, true);
  if (pend.ok) assert.equal(pend.items[0]?.code, "C3F9A");

  // Aprovar por código curto em minúsculas
  const app1 = await approveReceiptAction(
    client,
    { ref: "c3f9a", actor: allowed.actorLabel, decidedBy: allowed.actorLabel },
    hooks
  );
  assert.equal(app1.ok, true);
  if (app1.ok) {
    assert.equal(app1.result, "confirmado");
    assert.equal(app1.order?.status, "pago");
    assert.equal(app1.order?.paidAmount, 20);
  }
  assert.deepEqual(events, ["ORDER_PAID"]);

  // Re-aprovar por ID é idempotente (ja_processado)
  const app2 = await approveReceiptAction(
    client,
    { ref: "rcp-100", actor: allowed.actorLabel, decidedBy: allowed.actorLabel },
    hooks
  );
  assert.equal(app2.ok, true);
  if (app2.ok) assert.equal(app2.result, "ja_processado");
  assert.equal(db.orders[0].paid_amount, 20);

  // Revert por código curto volta pedido a pendente e comprovante a em_analise
  const rev = await revertOrderAction(client, {
    ref: "r3f9a",
    actor: allowed.actorLabel,
  });
  assert.equal(rev.ok, true);
  if (rev.ok) {
    assert.equal(rev.result, "revertido");
    assert.equal(rev.order?.status, "pendente");
    assert.equal(rev.order?.paidAmount, 0);
  }
  assert.equal(db.receipts[0].status, "em_analise");

  // Link + Reject
  db.orders[0].status = "em_analise";
  const rej = await rejectReceiptAction(client, {
    ref: "C3F9A",
    actor: allowed.actorLabel,
    decidedBy: allowed.actorLabel,
    reason: "Ilegível",
  });
  assert.equal(rej.ok, true);
  if (rej.ok) {
    assert.equal(rej.result, "rejeitado");
    assert.equal(rej.order?.status, "pendente");
  }

  // Novo órfão vinculado via código curto
  db.receipts.push({
    id: "rcp-101",
    code: "C9999",
    order_id: null,
    campaign_id: null,
    buyer_phone: "5511988887777",
    amount: 20,
    payer_name: "Ana",
    e2e: "E2E-101",
    reasons: [],
    status: "orfao",
    created_at: new Date().toISOString(),
  });
  const lnk = await linkReceiptAction(client, {
    receiptRef: "c9999",
    orderRef: "r3f9a",
    actor: allowed.actorLabel,
  });
  assert.equal(lnk.ok, true);
  if (lnk.ok) {
    assert.equal(lnk.result, "vinculado");
    assert.equal(lnk.order?.status, "em_analise");
  }

  // Pay manual parcial + cancel retorna refundAmount e libera números
  const payPart = await payOrderManualAction(
    client,
    { ref: "R3F9A", actor: allowed.actorLabel, decidedBy: allowed.actorLabel, amount: 10 },
    hooks
  );
  assert.equal(payPart.ok, true);
  if (payPart.ok) {
    assert.equal(payPart.result, "parcial");
    assert.equal(payPart.shortfall, 10);
  }

  const can = await cancelOrderAction(
    client,
    { ref: "ord-100", actor: allowed.actorLabel, decidedBy: allowed.actorLabel },
    hooks
  );
  assert.equal(can.ok, true);
  if (can.ok) {
    assert.equal(can.result, "cancelado");
    assert.equal(can.refundAmount, 10);
  }
  assert.ok(db.quotas.every((q) => q.status === "disponivel" && q.order_id === null));
  assert.ok(
    db.audit_log.some(
      (a) => a.actor === "whatsapp:5543999999999" && a.action === "ORDER_CANCELLED"
    )
  );
});

test("14. Modo 'ia' é aceito/recusado corretamente na validação e limites de IA são validados", () => {
  assert.equal(parseConfirmationMode("ia"), "ia");
  assert.equal(parseConfirmationMode(" IA "), "ia");
  assert.equal(parseConfirmationMode("banco"), "banco");
  assert.equal(parseConfirmationMode("manual"), "manual");
  assert.equal(parseConfirmationMode("pix"), null);
  assert.equal(parseConfirmationMode(""), null);
  assert.equal(parseConfirmationMode(null), null);

  // Padrões quando omitidos
  const defaults = parseAiSettingsInput({});
  assert.equal(defaults.ok, true);
  if (defaults.ok) {
    assert.equal(defaults.value.aiMinConfidence, 0.9);
    assert.equal(defaults.value.aiMaxAmount, 100);
    assert.equal(defaults.value.aiMaxPerPhoneDay, 5);
  }

  // Valores válidos nos limites
  const valid = parseAiSettingsInput({
    aiMinConfidence: 0.5,
    aiMaxAmount: 250.5,
    aiMaxPerPhoneDay: 3,
  });
  assert.equal(valid.ok, true);

  // Fora da faixa 0.5..1.0 -> erro
  const lowConf = parseAiSettingsInput({ aiMinConfidence: 0.49 });
  assert.equal(lowConf.ok, false);
  const highConf = parseAiSettingsInput({ aiMinConfidence: 1.05 });
  assert.equal(highConf.ok, false);

  // Valor máximo <= 0 ou limite diário inválido -> erro
  const badAmt = parseAiSettingsInput({ aiMaxAmount: 0 });
  assert.equal(badAmt.ok, false);
  const badDay = parseAiSettingsInput({ aiMaxPerPhoneDay: 1.5 });
  assert.equal(badDay.ok, false);
});

function createMockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
    },
    end(raw?: string) {
      body = raw ? JSON.parse(raw) : null;
    },
  } as unknown as ApiResponse;

  return {
    res,
    getStatus: () => statusCode,
    getHeaders: () => headers,
    getBody: () => body as Record<string, unknown>,
  };
}

test("15. POST /api/bot/summary/daily exige BOT_API_TOKEN, envia Cache-Control: no-store e respeita ?peek=1", async () => {
  const prevToken = process.env.BOT_API_TOKEN;
  process.env.BOT_API_TOKEN = "test-bot-secret-token";

  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  const fakeSupabase = {
    async rpc(fn: string, params: Record<string, unknown>) {
      rpcCalls.push({ fn, params });
      return {
        data: {
          count: 1,
          total: 50,
          items: [
            {
              receiptCode: "C7A1B",
              orderCode: "R9K2M",
              buyerName: "João",
              phone: "5511999990000",
              quotas: [10],
              amount: 50,
              payerName: "JOAO SILVA",
              e2e: "E2E-AI-01",
              paidAt: "2026-11-24T12:00:00Z",
              confirmedAt: "2026-11-24T12:01:00Z",
            },
          ],
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient;

  try {
    // Sem token -> 401 + Cache-Control: no-store
    const noAuthReq = {
      method: "POST",
      url: "/api/bot/summary/daily",
      headers: {},
      ip: "127.0.0.1",
    } as unknown as ApiRequest;
    const noAuthRes = createMockRes();
    await handleSummaryDaily(noAuthReq, noAuthRes.res, fakeSupabase);
    assert.equal(noAuthRes.getStatus(), 401);
    assert.equal(noAuthRes.getHeaders()["Cache-Control"], "no-store");
    assert.equal(rpcCalls.length, 0);

    // Token errado -> 401
    const badAuthReq = {
      method: "POST",
      url: "/api/bot/summary/daily",
      headers: { authorization: "Bearer wrong-token" },
      ip: "127.0.0.1",
    } as unknown as ApiRequest;
    const badAuthRes = createMockRes();
    await handleSummaryDaily(badAuthReq, badAuthRes.res, fakeSupabase);
    assert.equal(badAuthRes.getStatus(), 401);
    assert.equal(rpcCalls.length, 0);

    // Token válido com ?peek=1 -> p_mark: false
    const peekReq = {
      method: "POST",
      url: "/api/bot/summary/daily?peek=1",
      headers: { authorization: "Bearer test-bot-secret-token" },
      ip: "127.0.0.1",
    } as unknown as ApiRequest;
    const peekRes = createMockRes();
    await handleSummaryDaily(peekReq, peekRes.res, fakeSupabase);
    assert.equal(peekRes.getStatus(), 200);
    assert.equal(peekRes.getHeaders()["Cache-Control"], "no-store");
    assert.deepEqual(rpcCalls[0], {
      fn: "ai_daily_summary",
      params: { p_mark: false },
    });
    assert.equal(peekRes.getBody().count, 1);

    // Token válido sem ?peek -> p_mark: true
    const markReq = {
      method: "POST",
      url: "/api/bot/summary/daily",
      headers: { authorization: "Bearer test-bot-secret-token" },
      ip: "127.0.0.1",
    } as unknown as ApiRequest;
    const markRes = createMockRes();
    await handleSummaryDaily(markReq, markRes.res, fakeSupabase);
    assert.equal(markRes.getStatus(), 200);
    assert.deepEqual(rpcCalls[1], {
      fn: "ai_daily_summary",
      params: { p_mark: true },
    });
  } finally {
    if (prevToken === undefined) {
      delete process.env.BOT_API_TOKEN;
    } else {
      process.env.BOT_API_TOKEN = prevToken;
    }
  }
});

test("16. Resposta de /api/bot/receipts inclui autoConfirmed e receiptCode", () => {
  const autoRes = formatBotReceiptResponse(
    {
      result: "confirmado",
      receiptId: "rcp-ai-1",
      autoConfirmed: true,
      order: { id: "ord-1", code: "R1A2B", status: "pago" },
      shortfall: 0,
      surplus: 0,
      reason: null,
    },
    "C1A2B"
  );
  assert.equal(autoRes.result, "confirmado");
  assert.equal(autoRes.autoConfirmed, true);
  assert.equal(autoRes.receiptCode, "C1A2B");

  const manualRes = formatBotReceiptResponse(
    {
      result: "em_analise",
      receiptId: "rcp-man-1",
      order: { id: "ord-2", status: "em_analise" },
    },
    "C9Z8Y"
  );
  assert.equal(manualRes.autoConfirmed, false);
  assert.equal(manualRes.receiptCode, "C9Z8Y");
});

test("17. GET /api/bot/admin/unpaid: não-admin recebe 403; admin recebe pendentes da rifa ativa ordenados do mais antigo ao mais novo", async () => {
  const prevToken = process.env.BOT_API_TOKEN;
  process.env.BOT_API_TOKEN = "test-bot-secret-token";

  const { client, db } = createFakeSupabase();
  db.campaigns = [
    {
      id: "camp-old",
      reservation_minutes: 30,
      status: "encerrada",
      created_at: "2026-11-01T10:00:00Z",
    },
    {
      id: "camp-1",
      reservation_minutes: 30,
      status: "ativa",
      created_at: "2026-11-27T10:00:00Z",
    },
  ];
  // Inseridos propositalmente fora de ordem cronológica e com vários status
  db.orders = [
    {
      id: "ord-partial",
      code: "RA075",
      campaign_id: "camp-1",
      buyer_name: "Bruno Dias",
      buyer_phone: "5543977776666",
      quotas: [20],
      total_amount: 10,
      paid_amount: 4,
      status: "pendente",
      created_at: "2026-11-27T21:00:00Z",
      expires_at: "2026-11-28T21:00:00Z",
    },
    {
      id: "ord-paid",
      code: "RA070",
      campaign_id: "camp-1",
      buyer_name: "Pago",
      buyer_phone: "5543911110000",
      quotas: [1],
      total_amount: 2,
      paid_amount: 2,
      status: "pago",
      created_at: "2026-11-27T18:00:00Z",
      expires_at: "2026-11-28T18:00:00Z",
    },
    {
      id: "ord-cancel",
      code: "RA071",
      campaign_id: "camp-1",
      buyer_name: "Cancelado",
      buyer_phone: "5543922220000",
      quotas: [2],
      total_amount: 2,
      paid_amount: 0,
      status: "cancelado",
      created_at: "2026-11-27T18:30:00Z",
      expires_at: "2026-11-28T18:30:00Z",
    },
    {
      id: "ord-exp",
      code: "RA072",
      campaign_id: "camp-1",
      buyer_name: "Expirado",
      buyer_phone: "5543933330000",
      quotas: [3],
      total_amount: 2,
      paid_amount: 0,
      status: "expirado",
      created_at: "2026-11-27T19:00:00Z",
      expires_at: "2026-11-27T19:30:00Z",
    },
    {
      id: "ord-closed-camp",
      code: "RA073",
      campaign_id: "camp-old",
      buyer_name: "Campanha Encerrada",
      buyer_phone: "5543944440000",
      quotas: [4],
      total_amount: 2,
      paid_amount: 0,
      status: "pendente",
      created_at: "2026-11-27T19:15:00Z",
      expires_at: "2026-11-28T19:15:00Z",
    },
    {
      id: "ord-oldest",
      code: "RA074",
      campaign_id: "camp-1",
      buyer_name: "Ana Lima",
      buyer_phone: "5543988887777",
      quotas: [12, 15],
      total_amount: 2,
      paid_amount: 0,
      status: "pendente",
      created_at: "2026-11-27T20:00:43Z",
      expires_at: "2026-11-28T20:00:43Z",
    },
  ];

  try {
    // Não-admin -> 403 { error: "not_admin" }
    const nonAdminReq = {
      method: "GET",
      url: "/api/bot/admin/unpaid?actor=5511000000000",
      headers: { authorization: "Bearer test-bot-secret-token" },
      ip: "127.0.0.1",
    } as unknown as ApiRequest;
    const nonAdminRes = createMockRes();
    await handleBotAdmin(nonAdminReq, nonAdminRes.res, client);
    assert.equal(nonAdminRes.getStatus(), 403);
    assert.equal(nonAdminRes.getHeaders()["Cache-Control"], "no-store");
    assert.equal(nonAdminRes.getBody().error, "not_admin");

    // Admin autenticado -> 200 com count=2 ordenados do mais antigo ao mais novo
    const adminReq = {
      method: "GET",
      url: "/api/bot/admin/unpaid?actor=5543999999999",
      headers: { authorization: "Bearer test-bot-secret-token" },
      ip: "127.0.0.1",
    } as unknown as ApiRequest;
    const adminRes = createMockRes();
    await handleBotAdmin(adminReq, adminRes.res, client);
    assert.equal(adminRes.getStatus(), 200);
    assert.equal(adminRes.getHeaders()["Cache-Control"], "no-store");

    const body = adminRes.getBody() as {
      count: number;
      items: Array<Record<string, unknown>>;
    };
    assert.equal(body.count, 2);
    assert.equal(body.items.length, 2);
    assert.deepEqual(body.items[0], {
      orderCode: "RA074",
      buyerName: "Ana Lima",
      phone: "5543988887777",
      quotas: [12, 15],
      totalAmount: 2,
      paidAmount: 0,
      createdAt: "2026-11-27T20:00:43Z",
      expiresAt: "2026-11-28T20:00:43Z",
    });
    assert.deepEqual(body.items[1], {
      orderCode: "RA075",
      buyerName: "Bruno Dias",
      phone: "5543977776666",
      quotas: [20],
      totalAmount: 10,
      paidAmount: 4,
      createdAt: "2026-11-27T21:00:00Z",
      expiresAt: "2026-11-28T21:00:00Z",
    });
  } finally {
    if (prevToken === undefined) {
      delete process.env.BOT_API_TOKEN;
    } else {
      process.env.BOT_API_TOKEN = prevToken;
    }
  }
});





