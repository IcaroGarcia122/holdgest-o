import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { readJsonBody, sendJson } from "../_lib/http.js";
import { cleanString, enforceRateLimit, verifyBotToken } from "../_lib/security.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "../_lib/supabase.js";
import {
  checkAndNotifyRaffleComplete,
  dispatchOutboundEvent,
} from "../_lib/webhook.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  if (!verifyBotToken(req, res)) return;
  if (!enforceRateLimit(req, res, "bot_pix", undefined, 120, 60)) return;
  if (!isSupabaseConfigured()) {
    return sendJson(res, 503, { error: "supabase_unconfigured" });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "invalid_json" });
  }

  const e2e = cleanString(body.e2e, 100);
  const amount = Number(body.amount);
  if (!e2e || !Number.isFinite(amount) || amount <= 0) {
    return sendJson(res, 422, {
      error: "invalid_pix_payload",
      message: "e2e e amount positivo são obrigatórios.",
    });
  }

  const txid = cleanString(body.txid, 100) || null;
  const payer = cleanString(body.payer, 140) || null;
  let paidAtIso = new Date().toISOString();
  if (body.paidAt) {
    const dt = new Date(String(body.paidAt));
    if (!Number.isNaN(dt.getTime())) paidAtIso = dt.toISOString();
  }

  const supabase = getSupabaseAdmin();
  const { data: rpcRes, error } = await supabase.rpc("register_pix", {
    p_e2e: e2e,
    p_amount: amount,
    p_txid: txid,
    p_payer: payer,
    p_paid_at: paidAtIso,
    p_raw: body,
  });

  if (error) {
    return sendJson(res, 500, { error: "rpc_error", message: error.message });
  }

  const payload = rpcRes as Record<string, unknown>;
  const creditResult = payload.creditResult as Record<string, unknown> | undefined;
  if (creditResult?.result === "confirmado" && typeof creditResult.order_id === "string") {
    const { data: ord } = await supabase
      .from("orders")
      .select("id, code, campaign_id, buyer_name, quotas, total_amount")
      .eq("id", creditResult.order_id)
      .maybeSingle();
    if (ord) {
      await dispatchOutboundEvent("ORDER_PAID", {
        orderId: ord.id,
        orderCode: ord.code,
        campaignId: ord.campaign_id,
        buyerName: ord.buyer_name,
        quotas: ord.quotas,
        totalAmount: Number(ord.total_amount),
      });
      await checkAndNotifyRaffleComplete(ord.campaign_id);
    }
  }

  return sendJson(res, 200, payload);
}
