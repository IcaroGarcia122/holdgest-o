import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanString, normalizePhone } from "./security.js";
import {
  checkAndNotifyRaffleComplete,
  dispatchOutboundEvent,
} from "./webhook.js";

/**
 * Shared admin business logic (used by both the web panel `/api/admin/*` and
 * the WhatsApp bot `/api/bot/admin/*` endpoints) plus the deterministic
 * in-memory `RaffleEngine` mirroring PostgreSQL RPCs for unit tests.
 */

export type ConfirmationMode = "banco" | "manual" | "ia";

export const ALLOWED_CONFIRMATION_MODES: readonly ConfirmationMode[] = [
  "banco",
  "manual",
  "ia",
];

export function parseConfirmationMode(raw: unknown): ConfirmationMode | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "banco" || trimmed === "manual" || trimmed === "ia") {
    return trimmed;
  }
  return null;
}

export interface ParsedAiSettings {
  aiMinConfidence: number;
  aiMaxAmount: number;
  aiMaxPerPhoneDay: number;
}

export function parseAiSettingsInput(
  body: Record<string, unknown>
):
  | { ok: true; value: ParsedAiSettings }
  | { ok: false; error: string; message: string } {
  const rawConf = body.aiMinConfidence;
  const aiMinConfidence =
    rawConf === undefined || rawConf === null || rawConf === ""
      ? 0.9
      : Number(rawConf);
  if (
    !Number.isFinite(aiMinConfidence) ||
    aiMinConfidence < 0.5 ||
    aiMinConfidence > 1.0
  ) {
    return {
      ok: false,
      error: "invalid_ai_min_confidence",
      message: "aiMinConfidence deve estar entre 0.5 e 1.0.",
    };
  }

  const rawMaxAmt = body.aiMaxAmount;
  const aiMaxAmount =
    rawMaxAmt === undefined || rawMaxAmt === null || rawMaxAmt === ""
      ? 100
      : Number(rawMaxAmt);
  if (!Number.isFinite(aiMaxAmount) || aiMaxAmount <= 0) {
    return {
      ok: false,
      error: "invalid_ai_max_amount",
      message: "aiMaxAmount deve ser maior que zero.",
    };
  }

  const rawMaxDay = body.aiMaxPerPhoneDay;
  const aiMaxPerPhoneDay =
    rawMaxDay === undefined || rawMaxDay === null || rawMaxDay === ""
      ? 5
      : Number(rawMaxDay);
  if (!Number.isInteger(aiMaxPerPhoneDay) || aiMaxPerPhoneDay < 1) {
    return {
      ok: false,
      error: "invalid_ai_max_per_phone_day",
      message: "aiMaxPerPhoneDay deve ser um número inteiro maior ou igual a 1.",
    };
  }

  return {
    ok: true,
    value: {
      aiMinConfidence: Number(aiMinConfidence.toFixed(3)),
      aiMaxAmount: Number(aiMaxAmount.toFixed(2)),
      aiMaxPerPhoneDay,
    },
  };
}

export function formatBotReceiptResponse(
  payload: Record<string, unknown>,
  receiptCode: string | null
) {
  return {
    result: payload.result,
    receiptId: payload.receiptId,
    receiptCode,
    autoConfirmed: Boolean(payload.autoConfirmed),
    order: payload.order,
    shortfall: payload.shortfall,
    surplus: payload.surplus,
    reason: payload.reason,
  };
}

export interface AdminReceiptSummary {
  id: string;
  code: string | null;
  status: string;
}

export interface AdminOrderSummary {
  id: string;
  code: string;
  buyerName: string;
  phone: string;
  quotas: number[];
  totalAmount: number;
  paidAmount: number;
  status: string;
}

export interface PendingAdminItem {
  type: "receipt" | "conflict" | "partial_expired";
  id: string;
  code: string | null;
  orderId: string | null;
  orderCode: string | null;
  buyerName: string | null;
  phone: string;
  status: string;
  amount: number | null;
  payerName: string | null;
  e2e: string | null;
  reasons: string[];
  orderTotal: number | null;
  orderPaid: number | null;
  createdAt: string;
}

export interface UnpaidAdminOrderItem {
  orderCode: string;
  buyerName: string;
  phone: string;
  quotas: number[];
  totalAmount: number;
  paidAmount: number;
  createdAt: string;
  expiresAt: string | null;
}

export type AdminActionResultName =
  | "confirmado"
  | "parcial"
  | "rejeitado"
  | "cancelado"
  | "revertido"
  | "vinculado"
  | "ja_processado";

export interface AdminActionSuccess {
  ok: true;
  status: 200;
  result: AdminActionResultName;
  receipt: AdminReceiptSummary | null;
  order: AdminOrderSummary | null;
  shortfall: number;
  surplus: number;
  refundAmount: number;
  nextOrderStatus?: string;
  creditResult?: Record<string, unknown>;
}

export interface AdminActionFailure {
  ok: false;
  status: 403 | 404 | 409 | 422 | 500;
  error:
    | "not_admin"
    | "not_found"
    | "invalid_state"
    | "invalid_payload"
    | "rpc_error"
    | "db_error";
  message: string;
}

export type AdminActionResult = AdminActionSuccess | AdminActionFailure;

export interface ActionHooks {
  dispatchOutboundEvent?: typeof dispatchOutboundEvent;
  checkAndNotifyRaffleComplete?: typeof checkAndNotifyRaffleComplete;
}

const DEFAULT_HOOKS: Required<ActionHooks> = {
  dispatchOutboundEvent,
  checkAndNotifyRaffleComplete,
};

export function formatOrderSummary(ord: Record<string, unknown>): AdminOrderSummary {
  return {
    id: String(ord.id),
    code: String(ord.code || ""),
    buyerName: String(ord.buyer_name || ""),
    phone: String(ord.buyer_phone || ""),
    quotas: Array.isArray(ord.quotas) ? ord.quotas.map(Number) : [],
    totalAmount: Number(ord.total_amount || 0),
    paidAmount: Number(ord.paid_amount || 0),
    status: String(ord.status || ""),
  };
}

export function formatReceiptSummary(
  rcp: Record<string, unknown>
): AdminReceiptSummary {
  return {
    id: String(rcp.id),
    code: rcp.code ? String(rcp.code) : null,
    status: String(rcp.status || ""),
  };
}

export function parseOptionalPositiveAmount(
  raw: unknown
): { ok: true; value: number | undefined } | { ok: false } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: undefined };
  }
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) {
    return { ok: false };
  }
  return { ok: true, value: Number(num.toFixed(2)) };
}

export async function verifyBotAdminActor(
  supabase: SupabaseClient,
  rawActor: unknown
): Promise<
  | { ok: true; phone: string; actorLabel: string }
  | AdminActionFailure
> {
  const actorPhone = normalizePhone(rawActor);
  if (!actorPhone) {
    return {
      ok: false,
      status: 403,
      error: "not_admin",
      message: "Telefone de administrador obrigatório.",
    };
  }

  const { data: settings, error } = await supabase
    .from("bot_settings")
    .select("admin_phones")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      error: "db_error",
      message: error.message,
    };
  }

  const adminPhones = Array.isArray(settings?.admin_phones)
    ? settings.admin_phones.map((p) => normalizePhone(p)).filter(Boolean)
    : [];

  if (adminPhones.length === 0 || !adminPhones.includes(actorPhone)) {
    return {
      ok: false,
      status: 403,
      error: "not_admin",
      message: "Número não autorizado como administrador.",
    };
  }

  return {
    ok: true,
    phone: actorPhone,
    actorLabel: `whatsapp:${actorPhone}`,
  };
}

export async function resolveReceiptByRef(
  supabase: SupabaseClient,
  rawRef: string
): Promise<Record<string, unknown> | null> {
  const ref = cleanString(rawRef, 80);
  if (!ref) return null;

  const { data: byId } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", ref)
    .maybeSingle();
  if (byId) return byId as Record<string, unknown>;

  const upper = ref.toUpperCase();
  const { data: byCode } = await supabase
    .from("receipts")
    .select("*")
    .eq("code", upper)
    .maybeSingle();

  return (byCode as Record<string, unknown> | null) ?? null;
}

export async function resolveOrderByRef(
  supabase: SupabaseClient,
  rawRef: string
): Promise<Record<string, unknown> | null> {
  const ref = cleanString(rawRef, 80);
  if (!ref) return null;

  const { data: byId } = await supabase
    .from("orders")
    .select("*")
    .eq("id", ref)
    .maybeSingle();
  if (byId) return byId as Record<string, unknown>;

  const upper = ref.toUpperCase();
  const { data: byCode } = await supabase
    .from("orders")
    .select("*")
    .eq("code", upper)
    .maybeSingle();

  return (byCode as Record<string, unknown> | null) ?? null;
}

export async function listPendingAdminItems(
  supabase: SupabaseClient
): Promise<
  | { ok: true; items: PendingAdminItem[] }
  | AdminActionFailure
> {
  const nowIso = new Date().toISOString();

  const [
    { data: pendingReceipts, error: rErr },
    { data: conflictOrders, error: cErr },
    { data: partialExpiredOrders, error: pErr },
  ] = await Promise.all([
    supabase
      .from("receipts")
      .select("*")
      .in("status", ["em_analise", "revisao", "orfao"])
      .order("created_at", { ascending: true }),
    supabase
      .from("orders")
      .select("*")
      .eq("conflict_reason", "conflito_reembolso")
      .eq("needs_admin", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("orders")
      .select("*")
      .eq("status", "pendente")
      .gt("paid_amount", 0)
      .not("expires_at", "is", null)
      .lte("expires_at", nowIso)
      .order("created_at", { ascending: true }),
  ]);

  const firstErr = rErr || cErr || pErr;
  if (firstErr) {
    return {
      ok: false,
      status: 500,
      error: "db_error",
      message: firstErr.message,
    };
  }

  const orderIds = Array.from(
    new Set(
      (pendingReceipts ?? [])
        .map((r) => (r.order_id ? String(r.order_id) : ""))
        .filter(Boolean)
    )
  );

  const linkedOrderMap = new Map<string, Record<string, unknown>>();
  if (orderIds.length > 0) {
    const { data: linkedOrders } = await supabase
      .from("orders")
      .select("*")
      .in("id", orderIds);

    for (const o of linkedOrders ?? []) {
      linkedOrderMap.set(String(o.id), o as Record<string, unknown>);
    }
  }

  const items: PendingAdminItem[] = [];

  for (const r of pendingReceipts ?? []) {
    const ord = r.order_id ? linkedOrderMap.get(String(r.order_id)) : undefined;
    if (ord && String(ord.status) === "cancelado") {
      continue;
    }
    items.push({
      type: "receipt",
      id: String(r.id),
      code: r.code ? String(r.code) : null,
      orderId: r.order_id ? String(r.order_id) : null,
      orderCode: ord?.code ? String(ord.code) : null,
      buyerName: ord?.buyer_name
        ? String(ord.buyer_name)
        : r.payer_name
        ? String(r.payer_name)
        : null,
      phone: String(r.buyer_phone || ""),
      status: String(r.status),
      amount: r.amount !== null && r.amount !== undefined ? Number(r.amount) : null,
      payerName: r.payer_name ? String(r.payer_name) : null,
      e2e: r.e2e ? String(r.e2e) : null,
      reasons: Array.isArray(r.reasons) ? r.reasons.map(String) : [],
      orderTotal: ord ? Number(ord.total_amount) : null,
      orderPaid: ord ? Number(ord.paid_amount || 0) : null,
      createdAt: String(r.created_at),
    });
  }

  for (const o of conflictOrders ?? []) {
    items.push({
      type: "conflict",
      id: String(o.id),
      code: o.code ? String(o.code) : null,
      orderId: String(o.id),
      orderCode: o.code ? String(o.code) : null,
      buyerName: o.buyer_name ? String(o.buyer_name) : null,
      phone: String(o.buyer_phone || ""),
      status: String(o.conflict_reason || "conflito_reembolso"),
      amount: Number(o.paid_amount || 0),
      payerName: null,
      e2e: null,
      reasons: [],
      orderTotal: Number(o.total_amount || 0),
      orderPaid: Number(o.paid_amount || 0),
      createdAt: String(o.created_at),
    });
  }

  for (const o of partialExpiredOrders ?? []) {
    items.push({
      type: "partial_expired",
      id: String(o.id),
      code: o.code ? String(o.code) : null,
      orderId: String(o.id),
      orderCode: o.code ? String(o.code) : null,
      buyerName: o.buyer_name ? String(o.buyer_name) : null,
      phone: String(o.buyer_phone || ""),
      status: "partial_expired",
      amount: Number(o.paid_amount || 0),
      payerName: null,
      e2e: null,
      reasons: [],
      orderTotal: Number(o.total_amount || 0),
      orderPaid: Number(o.paid_amount || 0),
      createdAt: String(o.created_at),
    });
  }

  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { ok: true, items };
}

export async function listUnpaidAdminOrders(
  supabase: SupabaseClient
): Promise<
  | { ok: true; items: UnpaidAdminOrderItem[] }
  | AdminActionFailure
> {
  const { data: camp, error: campErr } = await supabase
    .from("campaigns")
    .select("id")
    .eq("status", "ativa")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (campErr) {
    return {
      ok: false,
      status: 500,
      error: "db_error",
      message: campErr.message,
    };
  }

  if (!camp) {
    return { ok: true, items: [] };
  }

  const { data: orders, error: ordErr } = await supabase
    .from("orders")
    .select(
      "code, buyer_name, buyer_phone, quotas, total_amount, paid_amount, created_at, expires_at"
    )
    .eq("campaign_id", camp.id)
    .eq("status", "pendente")
    .order("created_at", { ascending: true });

  if (ordErr) {
    return {
      ok: false,
      status: 500,
      error: "db_error",
      message: ordErr.message,
    };
  }

  const items: UnpaidAdminOrderItem[] = (orders ?? [])
    .filter((o) => {
      const total = Number(o.total_amount || 0);
      const paid = Number(o.paid_amount || 0);
      return total <= 0 || paid < total;
    })
    .map((o) => ({
      orderCode: String(o.code || ""),
      buyerName: String(o.buyer_name || ""),
      phone: String(o.buyer_phone || ""),
      quotas: Array.isArray(o.quotas) ? o.quotas.map(Number) : [],
      totalAmount: Number(o.total_amount || 0),
      paidAmount: Number(o.paid_amount || 0),
      createdAt: String(o.created_at),
      expiresAt: o.expires_at ? String(o.expires_at) : null,
    }));

  items.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return { ok: true, items };
}

export async function approveReceiptAction(
  supabase: SupabaseClient,
  input: {
    ref: string;
    actor: string;
    decidedBy: string;
    amount?: unknown;
  },
  hooks: ActionHooks = DEFAULT_HOOKS
): Promise<AdminActionResult> {
  const parsedAmount = parseOptionalPositiveAmount(input.amount);
  if (!parsedAmount.ok) {
    return {
      ok: false,
      status: 422,
      error: "invalid_payload",
      message: "Valor informado para crédito é inválido.",
    };
  }

  const rcp = await resolveReceiptByRef(supabase, input.ref);
  if (!rcp) {
    return {
      ok: false,
      status: 404,
      error: "not_found",
      message: "Comprovante não encontrado.",
    };
  }

  const receiptId = String(rcp.id);

  if (rcp.status === "confirmado") {
    const ord = rcp.order_id
      ? await resolveOrderByRef(supabase, String(rcp.order_id))
      : null;
    return {
      ok: true,
      status: 200,
      result: "ja_processado",
      receipt: formatReceiptSummary(rcp),
      order: ord ? formatOrderSummary(ord) : null,
      shortfall: 0,
      surplus: ord ? Number(ord.surplus_amount || 0) : 0,
      refundAmount: 0,
    };
  }

  if (rcp.status === "rejeitado") {
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message: "Este comprovante já foi rejeitado.",
    };
  }

  if (!rcp.order_id) {
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message: "Vincule este comprovante a um pedido antes de aprovar.",
    };
  }

  const ord = await resolveOrderByRef(supabase, String(rcp.order_id));
  if (!ord) {
    return {
      ok: false,
      status: 404,
      error: "not_found",
      message: "Pedido vinculado não encontrado.",
    };
  }

  if (ord.status === "cancelado") {
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message: "Não é possível aprovar comprovante de pedido cancelado.",
    };
  }

  if (ord.status === "pago") {
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message: "Este pedido já está integralmente pago.",
    };
  }

  const creditAmount =
    parsedAmount.value !== undefined
      ? parsedAmount.value
      : rcp.amount !== null && rcp.amount !== undefined && Number(rcp.amount) > 0
      ? Number(rcp.amount)
      : Math.max(0.01, Number(ord.total_amount) - Number(ord.paid_amount || 0));

  const { data: creditRes, error } = await supabase.rpc("credit_order", {
    p_order_id: String(ord.id),
    p_amount: creditAmount,
    p_origin: input.actor,
  });

  if (error) {
    return {
      ok: false,
      status: 500,
      error: "rpc_error",
      message: error.message,
    };
  }

  const payload = (creditRes ?? {}) as Record<string, unknown>;
  const creditResultStr = String(payload.result || "");

  if (creditResultStr === "conflito") {
    await supabase
      .from("receipts")
      .update({
        status: "revisao",
        summary: "Pagamento tardio em pedido expirado com números já vendidos.",
      })
      .eq("id", receiptId);
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message:
        "Pedido expirado com números já reservados/vendidos para outro participante.",
    };
  }

  if (creditResultStr === "cancelado" || creditResultStr === "nao_encontrado") {
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message: String(payload.error || "Não foi possível creditar este pedido."),
    };
  }

  const nowIso = new Date().toISOString();
  await supabase
    .from("receipts")
    .update({
      status: "confirmado",
      decided_by: input.decidedBy,
      decided_at: nowIso,
      summary: "Aprovado manualmente pelo administrador.",
    })
    .eq("id", receiptId);

  await supabase.from("audit_log").insert({
    actor: input.actor,
    action: "RECEIPT_APPROVED",
    details: {
      receiptId,
      receiptCode: rcp.code ?? null,
      orderId: ord.id,
      orderCode: ord.code,
      amount: creditAmount,
    },
  });

  if (creditResultStr === "confirmado") {
    const dispatchFn = hooks.dispatchOutboundEvent ?? dispatchOutboundEvent;
    const completeFn =
      hooks.checkAndNotifyRaffleComplete ?? checkAndNotifyRaffleComplete;
    await dispatchFn("ORDER_PAID", {
      orderId: ord.id,
      orderCode: ord.code,
      campaignId: ord.campaign_id,
      buyerName: ord.buyer_name,
      quotas: ord.quotas,
      totalAmount: Number(ord.total_amount),
    });
    await completeFn(String(ord.campaign_id));
  }

  const [freshRcp, freshOrd] = await Promise.all([
    resolveReceiptByRef(supabase, receiptId),
    resolveOrderByRef(supabase, String(ord.id)),
  ]);

  return {
    ok: true,
    status: 200,
    result: creditResultStr === "parcial" ? "parcial" : "confirmado",
    receipt: formatReceiptSummary(freshRcp ?? { ...rcp, status: "confirmado" }),
    order: formatOrderSummary(freshOrd ?? ord),
    shortfall: Number(payload.shortfall || 0),
    surplus: Number(payload.surplus || 0),
    refundAmount: 0,
    creditResult: payload,
  };
}

export async function rejectReceiptAction(
  supabase: SupabaseClient,
  input: {
    ref: string;
    actor: string;
    decidedBy: string;
    reason?: unknown;
  }
): Promise<AdminActionResult> {
  const rcp = await resolveReceiptByRef(supabase, input.ref);
  if (!rcp) {
    return {
      ok: false,
      status: 404,
      error: "not_found",
      message: "Comprovante não encontrado.",
    };
  }

  const receiptId = String(rcp.id);

  if (rcp.status === "rejeitado") {
    const ord = rcp.order_id
      ? await resolveOrderByRef(supabase, String(rcp.order_id))
      : null;
    return {
      ok: true,
      status: 200,
      result: "ja_processado",
      receipt: formatReceiptSummary(rcp),
      order: ord ? formatOrderSummary(ord) : null,
      shortfall: 0,
      surplus: 0,
      refundAmount: 0,
      nextOrderStatus: ord ? String(ord.status) : undefined,
    };
  }

  if (rcp.status === "confirmado") {
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message:
        "Comprovante já foi confirmado. Reverta o pagamento do pedido se necessário.",
    };
  }

  const reasonText =
    cleanString(input.reason, 200) || "Rejeitado pelo administrador.";

  await supabase
    .from("receipts")
    .update({
      status: "rejeitado",
      decided_by: input.decidedBy,
      decided_at: new Date().toISOString(),
      summary: reasonText,
    })
    .eq("id", receiptId);

  let nextOrderStatus: string | undefined;

  if (rcp.order_id) {
    const orderId = String(rcp.order_id);
    const [{ count: remainingInAnalysis }, { data: ord }] = await Promise.all([
      supabase
        .from("receipts")
        .select("*", { count: "exact", head: true })
        .eq("order_id", orderId)
        .neq("id", receiptId)
        .in("status", ["em_analise", "revisao", "reenvio"]),
      supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle(),
    ]);

    if (ord && (remainingInAnalysis ?? 0) === 0) {
      const hasConflict =
        ord.conflict_reason === "conflito_reembolso" ||
        ord.conflict_reason === "excedente";

      if (ord.status === "em_analise") {
        const currentExp = ord.expires_at
          ? new Date(String(ord.expires_at)).getTime()
          : 0;
        const minFutureExp = Date.now() + 15 * 60_000;
        const nextExpiresAt =
          currentExp > Date.now()
            ? String(ord.expires_at)
            : new Date(minFutureExp).toISOString();

        await supabase
          .from("orders")
          .update({
            status: "pendente",
            needs_admin: hasConflict,
            expires_at: nextExpiresAt,
          })
          .eq("id", ord.id);
        nextOrderStatus = "pendente";
      } else if (ord.status === "pendente" && !hasConflict) {
        await supabase
          .from("orders")
          .update({ needs_admin: false })
          .eq("id", ord.id);
        nextOrderStatus = "pendente";
      } else {
        nextOrderStatus = String(ord.status);
      }
    } else if (ord) {
      nextOrderStatus = String(ord.status);
    }
  }

  await supabase.from("audit_log").insert({
    actor: input.actor,
    action: "RECEIPT_REJECTED",
    details: {
      receiptId,
      receiptCode: rcp.code ?? null,
      orderId: rcp.order_id ?? null,
      nextOrderStatus,
    },
  });

  const [freshRcp, freshOrd] = await Promise.all([
    resolveReceiptByRef(supabase, receiptId),
    rcp.order_id
      ? resolveOrderByRef(supabase, String(rcp.order_id))
      : Promise.resolve(null),
  ]);

  return {
    ok: true,
    status: 200,
    result: "rejeitado",
    receipt: formatReceiptSummary(freshRcp ?? { ...rcp, status: "rejeitado" }),
    order: freshOrd ? formatOrderSummary(freshOrd) : null,
    shortfall: 0,
    surplus: 0,
    refundAmount: 0,
    nextOrderStatus,
  };
}

export async function linkReceiptAction(
  supabase: SupabaseClient,
  input: {
    receiptRef: string;
    orderRef: string;
    actor: string;
  }
): Promise<AdminActionResult> {
  const orderRef = cleanString(input.orderRef, 80);
  if (!orderRef) {
    return {
      ok: false,
      status: 422,
      error: "invalid_payload",
      message: "Informe o código ou ID do pedido.",
    };
  }

  const rcp = await resolveReceiptByRef(supabase, input.receiptRef);
  if (!rcp) {
    return {
      ok: false,
      status: 404,
      error: "not_found",
      message: "Comprovante não encontrado.",
    };
  }

  const ord = await resolveOrderByRef(supabase, orderRef);
  if (!ord) {
    return {
      ok: false,
      status: 404,
      error: "not_found",
      message: "Pedido não encontrado.",
    };
  }

  if (rcp.order_id === ord.id && rcp.status === "em_analise") {
    return {
      ok: true,
      status: 200,
      result: "ja_processado",
      receipt: formatReceiptSummary(rcp),
      order: formatOrderSummary(ord),
      shortfall: 0,
      surplus: 0,
      refundAmount: 0,
    };
  }

  if (rcp.status === "confirmado" || rcp.status === "rejeitado") {
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message: "Comprovante já processado não pode ser vinculado.",
    };
  }

  if (ord.status === "cancelado") {
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message: "Não é possível vincular comprovante a um pedido cancelado.",
    };
  }

  const receiptId = String(rcp.id);
  const orderId = String(ord.id);

  await supabase
    .from("receipts")
    .update({
      order_id: orderId,
      campaign_id: ord.campaign_id,
      status: "em_analise",
      summary: "Vinculado manualmente a um pedido pelo administrador.",
    })
    .eq("id", receiptId);

  if (ord.status === "pendente") {
    await supabase
      .from("orders")
      .update({ status: "em_analise", needs_admin: true })
      .eq("id", orderId);
  }

  await supabase.from("audit_log").insert({
    actor: input.actor,
    action: "RECEIPT_LINKED",
    details: {
      receiptId,
      receiptCode: rcp.code ?? null,
      orderId,
      orderCode: ord.code,
    },
  });

  const [freshRcp, freshOrd] = await Promise.all([
    resolveReceiptByRef(supabase, receiptId),
    resolveOrderByRef(supabase, orderId),
  ]);

  return {
    ok: true,
    status: 200,
    result: "vinculado",
    receipt: formatReceiptSummary(freshRcp ?? { ...rcp, status: "em_analise" }),
    order: formatOrderSummary(freshOrd ?? ord),
    shortfall: 0,
    surplus: 0,
    refundAmount: 0,
  };
}

export async function payOrderManualAction(
  supabase: SupabaseClient,
  input: {
    ref: string;
    actor: string;
    decidedBy: string;
    amount?: unknown;
  },
  hooks: ActionHooks = DEFAULT_HOOKS
): Promise<AdminActionResult> {
  const parsedAmount = parseOptionalPositiveAmount(input.amount);
  if (!parsedAmount.ok) {
    return {
      ok: false,
      status: 422,
      error: "invalid_payload",
      message: "Valor informado para pagamento é inválido.",
    };
  }

  const ord = await resolveOrderByRef(supabase, input.ref);
  if (!ord) {
    return {
      ok: false,
      status: 404,
      error: "not_found",
      message: "Pedido não encontrado.",
    };
  }

  if (ord.status === "pago") {
    return {
      ok: true,
      status: 200,
      result: "ja_processado",
      receipt: null,
      order: formatOrderSummary(ord),
      shortfall: 0,
      surplus: Number(ord.surplus_amount || 0),
      refundAmount: 0,
    };
  }

  if (ord.status === "cancelado") {
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message: "Pedido já está cancelado.",
    };
  }

  const orderId = String(ord.id);
  const remaining = Math.max(
    0.01,
    Number(ord.total_amount) - Number(ord.paid_amount || 0)
  );
  const creditAmount =
    parsedAmount.value !== undefined ? parsedAmount.value : remaining;

  const { data: creditRes, error } = await supabase.rpc("credit_order", {
    p_order_id: orderId,
    p_amount: creditAmount,
    p_origin: input.actor,
  });

  if (error) {
    return {
      ok: false,
      status: 500,
      error: "rpc_error",
      message: error.message,
    };
  }

  const payload = (creditRes ?? {}) as Record<string, unknown>;
  const creditResultStr = String(payload.result || "");

  if (creditResultStr === "conflito") {
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message:
        "Pedido expirado com números já reservados/vendidos para outro participante.",
    };
  }

  if (creditResultStr === "cancelado" || creditResultStr === "nao_encontrado") {
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message: String(payload.error || "Não foi possível creditar este pedido."),
    };
  }

  if (creditResultStr === "confirmado") {
    await supabase
      .from("receipts")
      .update({
        status: "confirmado",
        decided_by: input.decidedBy,
        decided_at: new Date().toISOString(),
      })
      .eq("order_id", orderId)
      .in("status", ["em_analise", "revisao", "reenvio"]);

    const dispatchFn = hooks.dispatchOutboundEvent ?? dispatchOutboundEvent;
    const completeFn =
      hooks.checkAndNotifyRaffleComplete ?? checkAndNotifyRaffleComplete;
    await dispatchFn("ORDER_PAID", {
      orderId,
      orderCode: ord.code,
      campaignId: ord.campaign_id,
      buyerName: ord.buyer_name,
      quotas: ord.quotas,
      totalAmount: Number(ord.total_amount),
    });
    await completeFn(String(ord.campaign_id));
  }

  const freshOrd = await resolveOrderByRef(supabase, orderId);

  return {
    ok: true,
    status: 200,
    result: creditResultStr === "parcial" ? "parcial" : "confirmado",
    receipt: null,
    order: formatOrderSummary(freshOrd ?? ord),
    shortfall: Number(payload.shortfall || 0),
    surplus: Number(payload.surplus || 0),
    refundAmount: 0,
    creditResult: payload,
  };
}

export async function cancelOrderAction(
  supabase: SupabaseClient,
  input: {
    ref: string;
    actor: string;
    decidedBy: string;
  },
  hooks: ActionHooks = DEFAULT_HOOKS
): Promise<AdminActionResult> {
  const ord = await resolveOrderByRef(supabase, input.ref);
  if (!ord) {
    return {
      ok: false,
      status: 404,
      error: "not_found",
      message: "Pedido não encontrado.",
    };
  }

  const orderId = String(ord.id);
  const refundAmount = Number(ord.paid_amount || 0);

  if (ord.status === "cancelado") {
    return {
      ok: true,
      status: 200,
      result: "ja_processado",
      receipt: null,
      order: formatOrderSummary(ord),
      shortfall: 0,
      surplus: 0,
      refundAmount,
    };
  }

  const nowIso = new Date().toISOString();

  await supabase
    .from("orders")
    .update({ status: "cancelado", needs_admin: false })
    .eq("id", orderId);

  await supabase
    .from("quotas")
    .update({ status: "disponivel", order_id: null, updated_at: nowIso })
    .eq("campaign_id", ord.campaign_id)
    .eq("order_id", orderId);

  await supabase
    .from("receipts")
    .update({
      status: "rejeitado",
      decided_by: input.decidedBy,
      decided_at: nowIso,
      summary: "Pedido cancelado pelo administrador.",
    })
    .eq("order_id", orderId)
    .in("status", ["em_analise", "revisao", "reenvio"]);

  await supabase.from("audit_log").insert({
    actor: input.actor,
    action: "ORDER_CANCELLED",
    details: { orderId, code: ord.code, refundAmount },
  });

  const dispatchFn = hooks.dispatchOutboundEvent ?? dispatchOutboundEvent;
  await dispatchFn("ORDER_CANCELLED", {
    orderId,
    orderCode: ord.code,
    campaignId: ord.campaign_id,
    buyerName: ord.buyer_name,
    quotas: ord.quotas,
    refundAmount,
  });

  const freshOrd = await resolveOrderByRef(supabase, orderId);

  return {
    ok: true,
    status: 200,
    result: "cancelado",
    receipt: null,
    order: formatOrderSummary(freshOrd ?? { ...ord, status: "cancelado" }),
    shortfall: 0,
    surplus: 0,
    refundAmount,
  };
}

export async function revertOrderAction(
  supabase: SupabaseClient,
  input: {
    ref: string;
    actor: string;
  }
): Promise<AdminActionResult> {
  const ord = await resolveOrderByRef(supabase, input.ref);
  if (!ord) {
    return {
      ok: false,
      status: 404,
      error: "not_found",
      message: "Pedido não encontrado.",
    };
  }

  const orderId = String(ord.id);

  if (ord.status === "pendente" && Number(ord.paid_amount || 0) === 0) {
    return {
      ok: true,
      status: 200,
      result: "ja_processado",
      receipt: null,
      order: formatOrderSummary(ord),
      shortfall: 0,
      surplus: 0,
      refundAmount: 0,
    };
  }

  if (ord.status === "cancelado" || ord.status === "expirado") {
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message: "Pedidos cancelados ou expirados não podem ser revertidos.",
    };
  }

  if (ord.status !== "pago" && Number(ord.paid_amount || 0) === 0) {
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message: "Este pedido não possui pagamento confirmado para reverter.",
    };
  }

  const { data: camp } = await supabase
    .from("campaigns")
    .select("reservation_minutes")
    .eq("id", ord.campaign_id)
    .maybeSingle();

  const reservationMinutes = Math.max(5, Number(camp?.reservation_minutes || 30));
  const nowIso = new Date().toISOString();

  await supabase
    .from("orders")
    .update({
      status: "pendente",
      paid_amount: 0,
      paid_at: null,
      surplus_amount: 0,
      needs_admin: false,
      conflict_reason: null,
      expiry_warned_at: null,
      expires_at: new Date(
        Date.now() + reservationMinutes * 60_000
      ).toISOString(),
    })
    .eq("id", orderId);

  await supabase
    .from("quotas")
    .update({ status: "reservada", order_id: orderId, updated_at: nowIso })
    .eq("campaign_id", ord.campaign_id)
    .eq("order_id", orderId);

  await supabase
    .from("receipts")
    .update({ status: "em_analise", decided_by: null, decided_at: null })
    .eq("order_id", orderId)
    .eq("status", "confirmado");

  await supabase.from("audit_log").insert({
    actor: input.actor,
    action: "ORDER_PAYMENT_REVERTED",
    details: { orderId, code: ord.code },
  });

  const freshOrd = await resolveOrderByRef(supabase, orderId);

  return {
    ok: true,
    status: 200,
    result: "revertido",
    receipt: null,
    order: formatOrderSummary(freshOrd ?? { ...ord, status: "pendente", paid_amount: 0 }),
    shortfall: 0,
    surplus: 0,
    refundAmount: 0,
  };
}

// ============================================================================
// Deterministic In-Memory Transactional Engine (for automated unit tests)
// ============================================================================

export interface EngineCampaign {
  id: string;
  ticketPrice: number;
  reservationMinutes: number;
  confirmationMode: ConfirmationMode;
  status: "ativa" | "encerrada";
}

export interface EngineQuota {
  campaignId: string;
  number: number;
  status: "disponivel" | "reservada" | "paga";
  orderId: string | null;
}

export interface EngineOrder {
  id: string;
  code: string;
  campaignId: string;
  buyerName: string;
  buyerPhone: string;
  quotas: number[];
  totalAmount: number;
  paidAmount: number;
  surplusAmount: number;
  needsAdmin: boolean;
  conflictReason: string | null;
  status: "pendente" | "em_analise" | "pago" | "cancelado" | "expirado";
  expiresAt: number;
  expiryWarned: boolean;
  sourceMessageId?: string | null;
  createdAt: number;
}

export interface EngineReceipt {
  id: string;
  code: string;
  orderId: string | null;
  buyerPhone: string;
  e2e: string | null;
  imageHash: string | null;
  amount: number | null;
  payerName?: string | null;
  reasons?: string[];
  status:
    | "orfao"
    | "em_analise"
    | "revisao"
    | "confirmado"
    | "rejeitado"
    | "reenvio";
  createdAt: number;
}

export interface EnginePix {
  e2e: string;
  amount: number;
  usedOrderId: string | null;
  paidAt: number;
}

export interface EngineAuditEntry {
  actor: string;
  action: string;
  details: Record<string, unknown>;
}

export class RaffleEngine {
  campaigns = new Map<string, EngineCampaign>();
  quotas = new Map<string, EngineQuota[]>();
  orders = new Map<string, EngineOrder>();
  receipts = new Map<string, EngineReceipt>();
  pixReceived = new Map<string, EnginePix>();
  messagesLog = new Map<string, unknown>();
  adminPhones: string[] = [];
  auditLog: EngineAuditEntry[] = [];
  outboundEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
  private seq = 0;

  private normPhone(raw: string): string {
    return raw.replace(/\D/g, "");
  }

  private nextReceiptCode(): string {
    return `C${String(this.seq).padStart(4, "0")}`;
  }

  setAdminPhones(phones: string[]): void {
    this.adminPhones = phones.map((p) => this.normPhone(p)).filter(Boolean);
  }

  checkAdminActor(
    rawPhone: string
  ): { ok: true; phone: string; actor: string } | AdminActionFailure {
    const phone = this.normPhone(rawPhone);
    if (!phone || this.adminPhones.length === 0 || !this.adminPhones.includes(phone)) {
      return {
        ok: false,
        status: 403,
        error: "not_admin",
        message: "Número não autorizado como administrador.",
      };
    }
    return { ok: true, phone, actor: `whatsapp:${phone}` };
  }

  findReceiptByRef(ref: string): EngineReceipt | undefined {
    const trimmed = ref.trim();
    if (!trimmed) return undefined;
    const byId = this.receipts.get(trimmed);
    if (byId) return byId;
    const upper = trimmed.toUpperCase();
    for (const r of this.receipts.values()) {
      if (r.code.toUpperCase() === upper) return r;
    }
    return undefined;
  }

  findOrderByRef(ref: string): EngineOrder | undefined {
    const trimmed = ref.trim();
    if (!trimmed) return undefined;
    const byId = this.orders.get(trimmed);
    if (byId) return byId;
    const upper = trimmed.toUpperCase();
    for (const o of this.orders.values()) {
      if (o.code.toUpperCase() === upper) return o;
    }
    return undefined;
  }

  private toOrderSummary(o: EngineOrder): AdminOrderSummary {
    return {
      id: o.id,
      code: o.code,
      buyerName: o.buyerName,
      phone: o.buyerPhone,
      quotas: [...o.quotas],
      totalAmount: o.totalAmount,
      paidAmount: o.paidAmount,
      status: o.status,
    };
  }

  private toReceiptSummary(r: EngineReceipt): AdminReceiptSummary {
    return {
      id: r.id,
      code: r.code,
      status: r.status,
    };
  }

  seedCampaign(camp: EngineCampaign): void {
    this.campaigns.set(camp.id, { ...camp });
    const rows: EngineQuota[] = [];
    for (let n = 1; n <= 100; n++) {
      rows.push({
        campaignId: camp.id,
        number: n,
        status: "disponivel",
        orderId: null,
      });
    }
    this.quotas.set(camp.id, rows);
  }

  createOrder(input: {
    campaignId: string;
    phone: string;
    buyerName: string;
    quotas?: number[];
    quantity?: number;
    sourceMessageId?: string;
    now?: number;
  }): {
    ok: boolean;
    status: number;
    error?: string;
    taken?: number[];
    suggestions?: number[];
    order?: EngineOrder;
  } {
    if (input.sourceMessageId && this.messagesLog.has(input.sourceMessageId)) {
      return this.messagesLog.get(input.sourceMessageId) as ReturnType<
        RaffleEngine["createOrder"]
      >;
    }

    const now = input.now ?? Date.now();
    const camp = this.campaigns.get(input.campaignId);
    if (!camp || camp.status !== "ativa") {
      return { ok: false, status: 404, error: "campaign_not_found" };
    }

    const phone = this.normPhone(input.phone);
    if (phone.length < 8) {
      return { ok: false, status: 422, error: "invalid_phone" };
    }

    const pendingCount = Array.from(this.orders.values()).filter(
      (o) =>
        o.campaignId === camp.id &&
        this.normPhone(o.buyerPhone) === phone &&
        (o.status === "pendente" || o.status === "em_analise")
    ).length;

    if (pendingCount >= 3) {
      return { ok: false, status: 429, error: "too_many_pending_orders" };
    }

    const campQuotas = this.quotas.get(camp.id) ?? [];
    let chosen: number[] = [];

    if (input.quotas && input.quotas.length > 0) {
      chosen = Array.from(new Set(input.quotas)).sort((a, b) => a - b);
      if (chosen.length > 20) {
        return { ok: false, status: 422, error: "max_quotas_exceeded" };
      }
      if (chosen.some((n) => !Number.isInteger(n) || n < 1 || n > 100)) {
        return { ok: false, status: 422, error: "invalid_quota_number" };
      }

      const taken: number[] = [];
      for (const n of chosen) {
        const row = campQuotas[n - 1];
        if (!row || row.status !== "disponivel") {
          taken.push(n);
        }
      }

      if (taken.length > 0) {
        const suggestions = campQuotas
          .filter((r) => r.status === "disponivel")
          .slice(0, 5)
          .map((r) => r.number);

        const conflictRes = {
          ok: false,
          status: 409,
          error: "quotas_taken",
          taken,
          suggestions,
        };
        if (input.sourceMessageId) {
          this.messagesLog.set(input.sourceMessageId, conflictRes);
        }
        return conflictRes;
      }
    } else if (input.quantity && input.quantity >= 1 && input.quantity <= 20) {
      const free = campQuotas.filter((r) => r.status === "disponivel");
      if (free.length < input.quantity) {
        return { ok: false, status: 409, error: "insufficient_quotas" };
      }
      chosen = free.slice(0, input.quantity).map((r) => r.number);
    } else {
      return { ok: false, status: 422, error: "invalid_quantity" };
    }

    this.seq += 1;
    const orderId = `ord-${this.seq}`;
    const order: EngineOrder = {
      id: orderId,
      code: `R${String(this.seq).padStart(4, "0")}`,
      campaignId: camp.id,
      buyerName: input.buyerName,
      buyerPhone: input.phone,
      quotas: chosen,
      totalAmount: Number((chosen.length * camp.ticketPrice).toFixed(2)),
      paidAmount: 0,
      surplusAmount: 0,
      needsAdmin: false,
      conflictReason: null,
      status: "pendente",
      expiresAt: now + camp.reservationMinutes * 60_000,
      expiryWarned: false,
      sourceMessageId: input.sourceMessageId ?? null,
      createdAt: now,
    };

    for (const n of chosen) {
      campQuotas[n - 1].status = "reservada";
      campQuotas[n - 1].orderId = orderId;
    }
    this.orders.set(orderId, order);

    // Link recent orphan receipts from the same phone
    for (const rcp of this.receipts.values()) {
      if (
        rcp.status === "orfao" &&
        this.normPhone(rcp.buyerPhone) === phone &&
        now - rcp.createdAt <= 24 * 3600_000
      ) {
        rcp.orderId = orderId;
        rcp.status = "em_analise";
        order.status = "em_analise";
        order.needsAdmin = true;
      }
    }

    const res = { ok: true, status: 201, order };
    if (input.sourceMessageId) {
      this.messagesLog.set(input.sourceMessageId, res);
    }
    return res;
  }

  creditOrder(
    orderId: string,
    amount: number,
    now = Date.now()
  ): {
    ok: boolean;
    result: string;
    shortfall?: number;
    surplus?: number;
    taken?: number[];
  } {
    const order = this.orders.get(orderId);
    if (!order) return { ok: false, result: "nao_encontrado" };
    if (order.status === "cancelado") return { ok: false, result: "cancelado" };

    const campQuotas = this.quotas.get(order.campaignId) ?? [];

    if (order.status === "expirado") {
      const taken = order.quotas.filter(
        (n) => campQuotas[n - 1]?.status !== "disponivel"
      );
      if (taken.length > 0) {
        order.needsAdmin = true;
        order.conflictReason = "conflito_reembolso";
        order.paidAmount = Number((order.paidAmount + amount).toFixed(2));
        return { ok: false, result: "conflito", taken };
      }
      for (const n of order.quotas) {
        campQuotas[n - 1].status = "reservada";
        campQuotas[n - 1].orderId = order.id;
      }
    }

    const newPaid = Number((order.paidAmount + amount).toFixed(2));
    if (newPaid >= order.totalAmount) {
      const surplus = Number(Math.max(0, newPaid - order.totalAmount).toFixed(2));
      order.paidAmount = newPaid;
      order.surplusAmount = surplus;
      order.status = "pago";
      order.needsAdmin = surplus > 0;
      order.conflictReason = surplus > 0 ? "excedente" : null;
      for (const n of order.quotas) {
        campQuotas[n - 1].status = "paga";
        campQuotas[n - 1].orderId = order.id;
      }
      return { ok: true, result: "confirmado", surplus };
    } else {
      const shortfall = Number((order.totalAmount - newPaid).toFixed(2));
      order.paidAmount = newPaid;
      order.status = "pendente";
      order.expiresAt = Math.max(order.expiresAt, now) + 30 * 60_000;
      return { ok: true, result: "parcial", shortfall };
    }
  }

  registerReceipt(input: {
    phone: string;
    sourceMessageId: string;
    e2e?: string | null;
    imageHash?: string | null;
    amount?: number | null;
    preStatus?: "ok" | "revisar" | "rejeitar" | "reenvio";
    now?: number;
  }): {
    result: string;
    reason?: string;
    receiptId?: string;
    receiptCode?: string;
    order?: EngineOrder;
    shortfall?: number;
    surplus?: number;
  } {
    if (this.messagesLog.has(input.sourceMessageId)) {
      return this.messagesLog.get(input.sourceMessageId) as ReturnType<
        RaffleEngine["registerReceipt"]
      >;
    }
    const now = input.now ?? Date.now();
    const phone = this.normPhone(input.phone);

    // Duplicate check on E2E and imageHash
    for (const r of this.receipts.values()) {
      if (!["orfao", "em_analise", "revisao", "confirmado"].includes(r.status)) {
        continue;
      }
      if (input.e2e && r.e2e === input.e2e) {
        return { result: "duplicado", reason: "e2e_duplicado" };
      }
      if (input.imageHash && r.imageHash === input.imageHash) {
        return { result: "duplicado", reason: "image_hash_duplicado" };
      }
    }

    const openOrders = Array.from(this.orders.values()).filter(
      (o) =>
        this.normPhone(o.buyerPhone) === phone &&
        (o.status === "pendente" || o.status === "em_analise")
    );

    let targetOrder: EngineOrder | undefined;
    if (openOrders.length === 1) {
      targetOrder = openOrders[0];
    } else if (openOrders.length > 1 && input.amount != null) {
      const matches = openOrders.filter(
        (o) => Math.abs(o.totalAmount - o.paidAmount - input.amount!) <= 0.05
      );
      if (matches.length === 1) {
        targetOrder = matches[0];
      } else {
        this.seq += 1;
        const rcpId = `rcp-${this.seq}`;
        const rcpCode = this.nextReceiptCode();
        this.receipts.set(rcpId, {
          id: rcpId,
          code: rcpCode,
          orderId: null,
          buyerPhone: input.phone,
          e2e: input.e2e ?? null,
          imageHash: input.imageHash ?? null,
          amount: input.amount ?? null,
          status: "revisao",
          createdAt: now,
        });
        return { result: "ambiguo", receiptId: rcpId, receiptCode: rcpCode };
      }
    } else if (openOrders.length > 1) {
      return { result: "ambiguo" };
    } else {
      const lateExpired = Array.from(this.orders.values())
        .filter(
          (o) =>
            this.normPhone(o.buyerPhone) === phone &&
            o.status === "expirado" &&
            now - o.expiresAt <= 24 * 3600_000
        )
        .sort((a, b) => b.expiresAt - a.expiresAt)[0];

      if (lateExpired) {
        targetOrder = lateExpired;
      }
    }

    this.seq += 1;
    const rcpId = `rcp-${this.seq}`;
    const rcpCode = this.nextReceiptCode();

    if (!targetOrder) {
      this.receipts.set(rcpId, {
        id: rcpId,
        code: rcpCode,
        orderId: null,
        buyerPhone: input.phone,
        e2e: input.e2e ?? null,
        imageHash: input.imageHash ?? null,
        amount: input.amount ?? null,
        status: "orfao",
        createdAt: now,
      });
      return { result: "orfao", receiptId: rcpId, receiptCode: rcpCode };
    }

    const camp = this.campaigns.get(targetOrder.campaignId);
    const pix = input.e2e ? this.pixReceived.get(input.e2e) : undefined;
    const preStatus = input.preStatus ?? "ok";

    if (preStatus === "rejeitar") {
      this.receipts.set(rcpId, {
        id: rcpId,
        code: rcpCode,
        orderId: targetOrder.id,
        buyerPhone: input.phone,
        e2e: input.e2e ?? null,
        imageHash: input.imageHash ?? null,
        amount: input.amount ?? null,
        status: "rejeitado",
        createdAt: now,
      });
      return {
        result: "rejeitado",
        receiptId: rcpId,
        receiptCode: rcpCode,
        order: targetOrder,
      };
    }

    // Golden rule: image alone NEVER confirms payment
    if (
      camp?.confirmationMode === "banco" &&
      pix &&
      !pix.usedOrderId &&
      preStatus === "ok"
    ) {
      const credit = this.creditOrder(targetOrder.id, pix.amount, now);
      if (credit.result === "conflito") {
        this.receipts.set(rcpId, {
          id: rcpId,
          code: rcpCode,
          orderId: targetOrder.id,
          buyerPhone: input.phone,
          e2e: input.e2e ?? null,
          imageHash: input.imageHash ?? null,
          amount: pix.amount,
          status: "revisao",
          createdAt: now,
        });
        return {
          result: "conflito",
          receiptId: rcpId,
          receiptCode: rcpCode,
          order: targetOrder,
        };
      }

      pix.usedOrderId = targetOrder.id;
      this.receipts.set(rcpId, {
        id: rcpId,
        code: rcpCode,
        orderId: targetOrder.id,
        buyerPhone: input.phone,
        e2e: input.e2e ?? null,
        imageHash: input.imageHash ?? null,
        amount: pix.amount,
        status: "confirmado",
        createdAt: now,
      });
      return {
        result: credit.result,
        receiptId: rcpId,
        receiptCode: rcpCode,
        order: targetOrder,
        shortfall: credit.shortfall,
        surplus: credit.surplus,
      };
    }

    // Otherwise leave in analysis for admin
    this.receipts.set(rcpId, {
      id: rcpId,
      code: rcpCode,
      orderId: targetOrder.id,
      buyerPhone: input.phone,
      e2e: input.e2e ?? null,
      imageHash: input.imageHash ?? null,
      amount: input.amount ?? null,
      status: preStatus === "revisar" ? "revisao" : "em_analise",
      createdAt: now,
    });
    if (targetOrder.status === "pendente") {
      targetOrder.status = "em_analise";
      targetOrder.needsAdmin = true;
    }
    return {
      result: "em_analise",
      receiptId: rcpId,
      receiptCode: rcpCode,
      order: targetOrder,
    };
  }

  registerPix(input: { e2e: string; amount: number; now?: number }) {
    if (this.pixReceived.has(input.e2e)) {
      return { result: "duplicado" };
    }
    const now = input.now ?? Date.now();
    const pix: EnginePix = {
      e2e: input.e2e,
      amount: input.amount,
      usedOrderId: null,
      paidAt: now,
    };
    this.pixReceived.set(input.e2e, pix);

    for (const rcp of this.receipts.values()) {
      if (
        rcp.e2e === input.e2e &&
        rcp.orderId &&
        (rcp.status === "em_analise" || rcp.status === "revisao")
      ) {
        const order = this.orders.get(rcp.orderId);
        const camp = order ? this.campaigns.get(order.campaignId) : undefined;
        if (camp?.confirmationMode === "banco" && order) {
          const credit = this.creditOrder(order.id, input.amount, now);
          if (credit.result !== "conflito") {
            pix.usedOrderId = order.id;
            rcp.status = "confirmado";
            return { result: credit.result, matchedReceipt: true };
          }
          return { result: "conflito", matchedReceipt: true };
        }
      }
    }

    return { result: "registrado", matchedReceipt: false };
  }

  listPendingForBot(
    actorPhone: string,
    now = Date.now()
  ): { ok: true; items: PendingAdminItem[] } | AdminActionFailure {
    const auth = this.checkAdminActor(actorPhone);
    if (!auth.ok) return auth;

    const items: PendingAdminItem[] = [];
    for (const r of this.receipts.values()) {
      if (!["em_analise", "revisao", "orfao"].includes(r.status)) continue;
      const ord = r.orderId ? this.orders.get(r.orderId) : undefined;
      if (ord && ord.status === "cancelado") continue;
      items.push({
        type: "receipt",
        id: r.id,
        code: r.code,
        orderId: r.orderId,
        orderCode: ord?.code ?? null,
        buyerName: ord?.buyerName ?? r.payerName ?? null,
        phone: r.buyerPhone,
        status: r.status,
        amount: r.amount,
        payerName: r.payerName ?? null,
        e2e: r.e2e,
        reasons: r.reasons ?? [],
        orderTotal: ord?.totalAmount ?? null,
        orderPaid: ord?.paidAmount ?? null,
        createdAt: new Date(r.createdAt).toISOString(),
      });
    }

    for (const o of this.orders.values()) {
      if (o.conflictReason === "conflito_reembolso" && o.needsAdmin) {
        items.push({
          type: "conflict",
          id: o.id,
          code: o.code,
          orderId: o.id,
          orderCode: o.code,
          buyerName: o.buyerName,
          phone: o.buyerPhone,
          status: o.conflictReason,
          amount: o.paidAmount,
          payerName: null,
          e2e: null,
          reasons: [],
          orderTotal: o.totalAmount,
          orderPaid: o.paidAmount,
          createdAt: new Date(o.createdAt).toISOString(),
        });
      }
      if (o.status === "pendente" && o.paidAmount > 0 && o.expiresAt <= now) {
        items.push({
          type: "partial_expired",
          id: o.id,
          code: o.code,
          orderId: o.id,
          orderCode: o.code,
          buyerName: o.buyerName,
          phone: o.buyerPhone,
          status: "partial_expired",
          amount: o.paidAmount,
          payerName: null,
          e2e: null,
          reasons: [],
          orderTotal: o.totalAmount,
          orderPaid: o.paidAmount,
          createdAt: new Date(o.createdAt).toISOString(),
        });
      }
    }

    return { ok: true, items };
  }

  approveReceipt(input: {
    ref: string;
    actorPhone?: string;
    amount?: number;
    now?: number;
  }): AdminActionResult {
    let actor = "admin:panel";
    if (input.actorPhone !== undefined) {
      const auth = this.checkAdminActor(input.actorPhone);
      if (!auth.ok) return auth;
      actor = auth.actor;
    }

    const rcp = this.findReceiptByRef(input.ref);
    if (!rcp) {
      return {
        ok: false,
        status: 404,
        error: "not_found",
        message: "Comprovante não encontrado.",
      };
    }

    if (rcp.status === "confirmado") {
      const ord = rcp.orderId ? this.orders.get(rcp.orderId) : undefined;
      return {
        ok: true,
        status: 200,
        result: "ja_processado",
        receipt: this.toReceiptSummary(rcp),
        order: ord ? this.toOrderSummary(ord) : null,
        shortfall: 0,
        surplus: ord?.surplusAmount ?? 0,
        refundAmount: 0,
      };
    }

    if (rcp.status === "rejeitado") {
      return {
        ok: false,
        status: 409,
        error: "invalid_state",
        message: "Comprovante já foi rejeitado.",
      };
    }

    if (!rcp.orderId) {
      return {
        ok: false,
        status: 409,
        error: "invalid_state",
        message: "Vincule este comprovante a um pedido antes de aprovar.",
      };
    }

    const ord = this.orders.get(rcp.orderId);
    if (!ord) {
      return {
        ok: false,
        status: 404,
        error: "not_found",
        message: "Pedido não encontrado.",
      };
    }
    if (ord.status === "cancelado") {
      return {
        ok: false,
        status: 409,
        error: "invalid_state",
        message: "Pedido cancelado.",
      };
    }
    if (ord.status === "pago") {
      return {
        ok: false,
        status: 409,
        error: "invalid_state",
        message: "Pedido já está pago.",
      };
    }

    const creditAmount =
      input.amount !== undefined && input.amount > 0
        ? input.amount
        : rcp.amount && rcp.amount > 0
        ? rcp.amount
        : Math.max(0.01, ord.totalAmount - ord.paidAmount);

    const credit = this.creditOrder(ord.id, creditAmount, input.now);
    if (credit.result === "conflito") {
      rcp.status = "revisao";
      return {
        ok: false,
        status: 409,
        error: "invalid_state",
        message: "Conflito de números já vendidos.",
      };
    }

    rcp.status = "confirmado";
    this.auditLog.push({
      actor,
      action: "RECEIPT_APPROVED",
      details: { receiptId: rcp.id, orderId: ord.id, amount: creditAmount },
    });
    if (credit.result === "confirmado") {
      this.outboundEvents.push({
        event: "ORDER_PAID",
        payload: { orderId: ord.id, orderCode: ord.code },
      });
    }

    return {
      ok: true,
      status: 200,
      result: credit.result === "parcial" ? "parcial" : "confirmado",
      receipt: this.toReceiptSummary(rcp),
      order: this.toOrderSummary(ord),
      shortfall: credit.shortfall ?? 0,
      surplus: credit.surplus ?? 0,
      refundAmount: 0,
    };
  }

  rejectReceiptByRef(input: {
    ref: string;
    actorPhone?: string;
    reason?: string;
    now?: number;
  }): AdminActionResult {
    let actor = "admin:panel";
    if (input.actorPhone !== undefined) {
      const auth = this.checkAdminActor(input.actorPhone);
      if (!auth.ok) return auth;
      actor = auth.actor;
    }

    const rcp = this.findReceiptByRef(input.ref);
    if (!rcp) {
      return {
        ok: false,
        status: 404,
        error: "not_found",
        message: "Comprovante não encontrado.",
      };
    }

    if (rcp.status === "rejeitado") {
      const ord = rcp.orderId ? this.orders.get(rcp.orderId) : undefined;
      return {
        ok: true,
        status: 200,
        result: "ja_processado",
        receipt: this.toReceiptSummary(rcp),
        order: ord ? this.toOrderSummary(ord) : null,
        shortfall: 0,
        surplus: 0,
        refundAmount: 0,
      };
    }

    if (rcp.status === "confirmado") {
      return {
        ok: false,
        status: 409,
        error: "invalid_state",
        message: "Comprovante já foi confirmado.",
      };
    }

    const rej = this.rejectReceipt(rcp.id, input.now);
    const ord = rcp.orderId ? this.orders.get(rcp.orderId) : undefined;
    this.auditLog.push({
      actor,
      action: "RECEIPT_REJECTED",
      details: {
        receiptId: rcp.id,
        orderId: rcp.orderId,
        nextOrderStatus: rej.orderStatus,
        reason: input.reason ?? null,
      },
    });

    return {
      ok: true,
      status: 200,
      result: "rejeitado",
      receipt: this.toReceiptSummary(rcp),
      order: ord ? this.toOrderSummary(ord) : null,
      shortfall: 0,
      surplus: 0,
      refundAmount: 0,
      nextOrderStatus: rej.orderStatus,
    };
  }

  linkReceipt(input: {
    receiptRef: string;
    orderRef: string;
    actorPhone?: string;
  }): AdminActionResult {
    let actor = "admin:panel";
    if (input.actorPhone !== undefined) {
      const auth = this.checkAdminActor(input.actorPhone);
      if (!auth.ok) return auth;
      actor = auth.actor;
    }

    const rcp = this.findReceiptByRef(input.receiptRef);
    if (!rcp) {
      return {
        ok: false,
        status: 404,
        error: "not_found",
        message: "Comprovante não encontrado.",
      };
    }

    const ord = this.findOrderByRef(input.orderRef);
    if (!ord) {
      return {
        ok: false,
        status: 404,
        error: "not_found",
        message: "Pedido não encontrado.",
      };
    }

    if (rcp.orderId === ord.id && rcp.status === "em_analise") {
      return {
        ok: true,
        status: 200,
        result: "ja_processado",
        receipt: this.toReceiptSummary(rcp),
        order: this.toOrderSummary(ord),
        shortfall: 0,
        surplus: 0,
        refundAmount: 0,
      };
    }

    if (rcp.status === "confirmado" || rcp.status === "rejeitado") {
      return {
        ok: false,
        status: 409,
        error: "invalid_state",
        message: "Comprovante já processado.",
      };
    }

    if (ord.status === "cancelado") {
      return {
        ok: false,
        status: 409,
        error: "invalid_state",
        message: "Pedido cancelado.",
      };
    }

    rcp.orderId = ord.id;
    rcp.status = "em_analise";
    if (ord.status === "pendente") {
      ord.status = "em_analise";
      ord.needsAdmin = true;
    }

    this.auditLog.push({
      actor,
      action: "RECEIPT_LINKED",
      details: { receiptId: rcp.id, orderId: ord.id },
    });

    return {
      ok: true,
      status: 200,
      result: "vinculado",
      receipt: this.toReceiptSummary(rcp),
      order: this.toOrderSummary(ord),
      shortfall: 0,
      surplus: 0,
      refundAmount: 0,
    };
  }

  payOrderManual(input: {
    ref: string;
    actorPhone?: string;
    amount?: number;
    now?: number;
  }): AdminActionResult {
    let actor = "admin:panel";
    if (input.actorPhone !== undefined) {
      const auth = this.checkAdminActor(input.actorPhone);
      if (!auth.ok) return auth;
      actor = auth.actor;
    }

    const ord = this.findOrderByRef(input.ref);
    if (!ord) {
      return {
        ok: false,
        status: 404,
        error: "not_found",
        message: "Pedido não encontrado.",
      };
    }

    if (ord.status === "pago") {
      return {
        ok: true,
        status: 200,
        result: "ja_processado",
        receipt: null,
        order: this.toOrderSummary(ord),
        shortfall: 0,
        surplus: ord.surplusAmount,
        refundAmount: 0,
      };
    }

    if (ord.status === "cancelado") {
      return {
        ok: false,
        status: 409,
        error: "invalid_state",
        message: "Pedido já cancelado.",
      };
    }

    const remaining = Math.max(0.01, ord.totalAmount - ord.paidAmount);
    const amount = input.amount !== undefined && input.amount > 0 ? input.amount : remaining;
    const credit = this.creditOrder(ord.id, amount, input.now);

    if (credit.result === "conflito") {
      return {
        ok: false,
        status: 409,
        error: "invalid_state",
        message: "Conflito de números já vendidos.",
      };
    }

    if (credit.result === "confirmado") {
      for (const r of this.receipts.values()) {
        if (
          r.orderId === ord.id &&
          ["em_analise", "revisao", "reenvio"].includes(r.status)
        ) {
          r.status = "confirmado";
        }
      }
      this.outboundEvents.push({
        event: "ORDER_PAID",
        payload: { orderId: ord.id, orderCode: ord.code },
      });
    }

    this.auditLog.push({
      actor,
      action: credit.result === "confirmado" ? "ORDER_CREDITED_PAID" : "ORDER_CREDITED_PARTIAL",
      details: { orderId: ord.id, amount },
    });

    return {
      ok: true,
      status: 200,
      result: credit.result === "parcial" ? "parcial" : "confirmado",
      receipt: null,
      order: this.toOrderSummary(ord),
      shortfall: credit.shortfall ?? 0,
      surplus: credit.surplus ?? 0,
      refundAmount: 0,
    };
  }

  cancelOrder(input: { ref: string; actorPhone?: string }): AdminActionResult {
    let actor = "admin:panel";
    if (input.actorPhone !== undefined) {
      const auth = this.checkAdminActor(input.actorPhone);
      if (!auth.ok) return auth;
      actor = auth.actor;
    }

    const ord = this.findOrderByRef(input.ref);
    if (!ord) {
      return {
        ok: false,
        status: 404,
        error: "not_found",
        message: "Pedido não encontrado.",
      };
    }

    const refundAmount = ord.paidAmount;
    if (ord.status === "cancelado") {
      return {
        ok: true,
        status: 200,
        result: "ja_processado",
        receipt: null,
        order: this.toOrderSummary(ord),
        shortfall: 0,
        surplus: 0,
        refundAmount,
      };
    }

    ord.status = "cancelado";
    ord.needsAdmin = false;

    const campQuotas = this.quotas.get(ord.campaignId) ?? [];
    for (const q of campQuotas) {
      if (q.orderId === ord.id) {
        q.status = "disponivel";
        q.orderId = null;
      }
    }

    for (const r of this.receipts.values()) {
      if (
        r.orderId === ord.id &&
        ["em_analise", "revisao", "reenvio"].includes(r.status)
      ) {
        r.status = "rejeitado";
      }
    }

    this.auditLog.push({
      actor,
      action: "ORDER_CANCELLED",
      details: { orderId: ord.id, code: ord.code, refundAmount },
    });
    this.outboundEvents.push({
      event: "ORDER_CANCELLED",
      payload: { orderId: ord.id, orderCode: ord.code, refundAmount },
    });

    return {
      ok: true,
      status: 200,
      result: "cancelado",
      receipt: null,
      order: this.toOrderSummary(ord),
      shortfall: 0,
      surplus: 0,
      refundAmount,
    };
  }

  revertOrder(input: {
    ref: string;
    actorPhone?: string;
    now?: number;
  }): AdminActionResult {
    let actor = "admin:panel";
    if (input.actorPhone !== undefined) {
      const auth = this.checkAdminActor(input.actorPhone);
      if (!auth.ok) return auth;
      actor = auth.actor;
    }

    const ord = this.findOrderByRef(input.ref);
    if (!ord) {
      return {
        ok: false,
        status: 404,
        error: "not_found",
        message: "Pedido não encontrado.",
      };
    }

    if (ord.status === "pendente" && ord.paidAmount === 0) {
      return {
        ok: true,
        status: 200,
        result: "ja_processado",
        receipt: null,
        order: this.toOrderSummary(ord),
        shortfall: 0,
        surplus: 0,
        refundAmount: 0,
      };
    }

    if (ord.status === "cancelado" || ord.status === "expirado") {
      return {
        ok: false,
        status: 409,
        error: "invalid_state",
        message: "Pedidos cancelados ou expirados não podem ser revertidos.",
      };
    }

    const now = input.now ?? Date.now();
    const camp = this.campaigns.get(ord.campaignId);
    const reservationMinutes = camp?.reservationMinutes ?? 30;

    ord.status = "pendente";
    ord.paidAmount = 0;
    ord.surplusAmount = 0;
    ord.needsAdmin = false;
    ord.conflictReason = null;
    ord.expiryWarned = false;
    ord.expiresAt = now + reservationMinutes * 60_000;

    const campQuotas = this.quotas.get(ord.campaignId) ?? [];
    for (const q of campQuotas) {
      if (q.orderId === ord.id) {
        q.status = "reservada";
      }
    }

    for (const r of this.receipts.values()) {
      if (r.orderId === ord.id && r.status === "confirmado") {
        r.status = "em_analise";
      }
    }

    this.auditLog.push({
      actor,
      action: "ORDER_PAYMENT_REVERTED",
      details: { orderId: ord.id, code: ord.code },
    });

    return {
      ok: true,
      status: 200,
      result: "revertido",
      receipt: null,
      order: this.toOrderSummary(ord),
      shortfall: 0,
      surplus: 0,
      refundAmount: 0,
    };
  }

  rejectReceipt(
    receiptId: string,
    now = Date.now()
  ): {
    ok: boolean;
    orderStatus?: EngineOrder["status"];
  } {
    const rcp = this.receipts.get(receiptId);
    if (!rcp) return { ok: false };

    rcp.status = "rejeitado";

    if (!rcp.orderId) {
      return { ok: true };
    }

    const order = this.orders.get(rcp.orderId);
    if (!order) return { ok: true };

    const hasOtherInAnalysis = Array.from(this.receipts.values()).some(
      (r) =>
        r.id !== receiptId &&
        r.orderId === rcp.orderId &&
        (r.status === "em_analise" ||
          r.status === "revisao" ||
          r.status === "reenvio")
    );

    if (!hasOtherInAnalysis) {
      const hasConflict =
        order.conflictReason === "conflito_reembolso" ||
        order.conflictReason === "excedente";

      if (order.status === "em_analise") {
        order.status = "pendente";
        order.needsAdmin = hasConflict;
        if (order.expiresAt <= now) {
          order.expiresAt = now + 15 * 60_000;
        }
      } else if (order.status === "pendente" && !hasConflict) {
        order.needsAdmin = false;
      }
    }

    return { ok: true, orderStatus: order.status };
  }

  expireOrders(now = Date.now()) {
    const expired: string[] = [];
    const warnings: string[] = [];
    const needsAdmin: string[] = [];

    for (const order of this.orders.values()) {
      if (order.needsAdmin) needsAdmin.push(order.id);
      if (order.status !== "pendente") continue;

      const hasReceiptInAnalysis = Array.from(this.receipts.values()).some(
        (r) =>
          r.orderId === order.id &&
          ["em_analise", "revisao", "reenvio"].includes(r.status)
      );

      if (
        order.expiresAt <= now &&
        order.paidAmount === 0 &&
        !hasReceiptInAnalysis
      ) {
        order.status = "expirado";
        const campQuotas = this.quotas.get(order.campaignId) ?? [];
        for (const n of order.quotas) {
          if (campQuotas[n - 1]?.orderId === order.id) {
            campQuotas[n - 1].status = "disponivel";
            campQuotas[n - 1].orderId = null;
          }
        }
        expired.push(order.id);
      } else if (
        order.expiresAt > now &&
        order.expiresAt <= now + 5 * 60_000 &&
        !order.expiryWarned &&
        order.paidAmount === 0
      ) {
        order.expiryWarned = true;
        warnings.push(order.id);
      }
    }

    return { expired, warnings, needsAdmin };
  }
}
