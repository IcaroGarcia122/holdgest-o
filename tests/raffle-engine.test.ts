import test from "node:test";
import assert from "node:assert/strict";
import { RaffleEngine } from "../api/_lib/raffleEngine.js";

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

