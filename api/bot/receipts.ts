import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { readJsonBody, sendJson } from "../_lib/http.js";
import {
  cleanString,
  enforceRateLimit,
  normalizePhone,
  verifyBotToken,
} from "../_lib/security.js";
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
  uploadReceiptImageToStorage,
} from "../_lib/supabase.js";
import {
  checkAndNotifyRaffleComplete,
  dispatchOutboundEvent,
} from "../_lib/webhook.js";
import { formatBotReceiptResponse } from "../_lib/raffleEngine.js";

const ALLOWED_PRE_STATUS = new Set(["ok", "revisar", "rejeitar", "reenvio"]);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  if (!verifyBotToken(req, res)) return;
  if (!isSupabaseConfigured()) {
    return sendJson(res, 503, { error: "supabase_unconfigured" });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "invalid_json" });
  }

  const phone = cleanString(body.phone, 30);
  const normalizedPhone = normalizePhone(phone);
  if (!enforceRateLimit(req, res, "bot_receipts", normalizedPhone, 60, 25)) {
    return;
  }
  if (normalizedPhone.length < 8) {
    return sendJson(res, 422, { error: "invalid_phone" });
  }

  const sourceMessageId = cleanString(body.sourceMessageId, 160);
  if (!sourceMessageId) {
    return sendJson(res, 422, { error: "missing_source_message_id" });
  }

  const preStatusRaw = cleanString(body.preStatus || "ok", 20).toLowerCase();
  const preStatus = ALLOWED_PRE_STATUS.has(preStatusRaw) ? preStatusRaw : "revisar";

  const e2e = cleanString(body.e2e, 100) || null;
  let imageHash = cleanString(body.imageHash, 128) || null;
  const payerName = cleanString(body.payerName, 140) || null;
  const recipientName = cleanString(body.recipientName, 140) || null;
  const amount =
    body.amount !== undefined && body.amount !== null && body.amount !== ""
      ? Number(body.amount)
      : null;

  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    return sendJson(res, 422, { error: "invalid_amount" });
  }

  let paidAtIso: string | null = null;
  if (body.paidAt) {
    const dt = new Date(String(body.paidAt));
    if (!Number.isNaN(dt.getTime())) {
      paidAtIso = dt.toISOString();
    }
  }

  const reasons = Array.isArray(body.reasons)
    ? body.reasons.map((r) => cleanString(r, 200)).filter(Boolean).slice(0, 15)
    : [];
  const confidence =
    body.confidence !== undefined && body.confidence !== null
      ? Math.max(0, Math.min(1, Number(body.confidence) || 0))
      : null;

  let imagePath: string | null = null;
  let fileName: string | null = null;
  if (typeof body.imageBase64 === "string" && body.imageBase64.trim().length > 0) {
    try {
      const uploaded = await uploadReceiptImageToStorage(
        body.imageBase64,
        normalizedPhone
      );
      imagePath = uploaded.path;
      fileName = uploaded.fileName;
      if (!imageHash) imageHash = uploaded.imageHash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar imagem.";
      return sendJson(res, 422, { error: "invalid_image", message: msg });
    }
  }

  const supabase = getSupabaseAdmin();
  const { data: rpcRes, error } = await supabase.rpc("register_receipt", {
    p_phone: phone,
    p_source_message_id: sourceMessageId,
    p_e2e: e2e,
    p_image_hash: imageHash,
    p_amount: amount,
    p_payer_name: payerName,
    p_recipient_name: recipientName,
    p_paid_at: paidAtIso,
    p_pre_status: preStatus,
    p_reasons: reasons,
    p_confidence: confidence,
    p_image_path: imagePath,
    p_file_name: fileName,
  });

  if (error) {
    return sendJson(res, 500, { error: "rpc_error", message: error.message });
  }

  const payload = rpcRes as Record<string, unknown>;
  if (payload.result === "confirmado" && payload.order && typeof payload.order === "object") {
    const orderObj = payload.order as Record<string, unknown>;
    if (typeof orderObj.id === "string") {
      const { data: ord } = await supabase
        .from("orders")
        .select("id, code, campaign_id, buyer_name, quotas, total_amount")
        .eq("id", orderObj.id)
        .maybeSingle();
      if (ord?.campaign_id) {
        await dispatchOutboundEvent("ORDER_PAID", {
          orderId: ord.id,
          orderCode: ord.code,
          campaignId: ord.campaign_id,
          buyerName: ord.buyer_name,
          quotas: ord.quotas,
          totalAmount: Number(ord.total_amount),
          autoConfirmed: Boolean(payload.autoConfirmed),
        });
        await checkAndNotifyRaffleComplete(ord.campaign_id);
      }
    }
  }

  let receiptCode: string | null =
    typeof payload.receiptCode === "string" ? payload.receiptCode : null;
  if (!receiptCode && typeof payload.receiptId === "string" && payload.receiptId) {
    const { data: rcpRow } = await supabase
      .from("receipts")
      .select("code")
      .eq("id", payload.receiptId)
      .maybeSingle();
    receiptCode = rcpRow?.code ? String(rcpRow.code) : null;
  }

  return sendJson(res, 200, formatBotReceiptResponse(payload, receiptCode));
}
