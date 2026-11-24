import type { ApiRequest, ApiResponse } from "../../../_lib/http.js";
import { getPathParamId, readJsonBody, sendJson } from "../../../_lib/http.js";
import {
  enforceRateLimit,
  normalizePhone,
  verifyBotToken,
} from "../../../_lib/security.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "../../../_lib/supabase.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  if (!verifyBotToken(req, res)) return;
  if (!isSupabaseConfigured()) {
    return sendJson(res, 503, { error: "supabase_unconfigured" });
  }

  const orderId = getPathParamId(req, "orders");
  if (!orderId) {
    return sendJson(res, 422, { error: "missing_order_id" });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "invalid_json" });
  }

  const phone = normalizePhone(body.phone);
  if (!enforceRateLimit(req, res, "bot_order_cancel", phone, 40, 15)) return;
  if (phone.length < 8) {
    return sendJson(res, 422, { error: "invalid_phone" });
  }

  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, campaign_id, buyer_phone, status, paid_amount")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    return sendJson(res, 500, { error: "db_error", message: error.message });
  }
  if (!order) {
    return sendJson(res, 404, { error: "order_not_found" });
  }

  if (normalizePhone(order.buyer_phone) !== phone) {
    return sendJson(res, 403, {
      error: "forbidden",
      message: "Apenas o dono do pedido pode cancelar.",
    });
  }

  if (order.status !== "pendente" || Number(order.paid_amount || 0) > 0) {
    return sendJson(res, 409, {
      error: "cannot_cancel",
      message: "Pedido já possui pagamento ou não está mais pendente.",
    });
  }

  const { count: activeReceipts } = await supabase
    .from("receipts")
    .select("*", { count: "exact", head: true })
    .eq("order_id", order.id)
    .in("status", ["em_analise", "revisao", "confirmado", "reenvio"]);

  if ((activeReceipts ?? 0) > 0) {
    return sendJson(res, 409, {
      error: "receipt_attached",
      message: "Pedido possui comprovante em análise ou confirmado.",
    });
  }

  await supabase
    .from("orders")
    .update({ status: "cancelado" })
    .eq("id", order.id);

  await supabase
    .from("quotas")
    .update({ status: "disponivel", order_id: null, updated_at: new Date().toISOString() })
    .eq("campaign_id", order.campaign_id)
    .eq("order_id", order.id)
    .eq("status", "reservada");

  await supabase.from("audit_log").insert({
    actor: `bot:${phone}`,
    action: "BOT_ORDER_CANCELLED",
    details: { orderId: order.id },
  });

  return sendJson(res, 200, { ok: true, orderId: order.id, status: "cancelado" });
}
