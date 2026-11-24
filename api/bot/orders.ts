import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { getQueryParam, readJsonBody, sendJson } from "../_lib/http.js";
import {
  cleanString,
  enforceRateLimit,
  normalizePhone,
  validateQuotasInput,
  verifyBotToken,
} from "../_lib/security.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "../_lib/supabase.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!verifyBotToken(req, res)) return;
  if (!isSupabaseConfigured()) {
    return sendJson(res, 503, { error: "supabase_unconfigured" });
  }

  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    const rawPhone = getQueryParam(req, "phone");
    const phone = normalizePhone(rawPhone);
    if (!enforceRateLimit(req, res, "bot_orders_get", phone, 90, 45)) return;
    if (phone.length < 8) {
      return sendJson(res, 422, { error: "invalid_phone" });
    }

    const { data: camp } = await supabase
      .from("campaigns")
      .select("id")
      .eq("status", "ativa")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!camp) {
      return sendJson(res, 200, { orders: [] });
    }

    const { data: orders, error } = await supabase
      .from("orders")
      .select(
        "id, code, buyer_name, buyer_phone, quotas, total_amount, paid_amount, status, expires_at, created_at"
      )
      .eq("campaign_id", camp.id)
      .in("status", ["pendente", "em_analise"])
      .order("created_at", { ascending: false });

    if (error) {
      return sendJson(res, 500, { error: "db_error", message: error.message });
    }

    const matched = (orders ?? []).filter(
      (o) => normalizePhone(o.buyer_phone) === phone
    );

    return sendJson(res, 200, {
      orders: matched.map((o) => ({
        id: o.id,
        code: o.code,
        buyerName: o.buyer_name,
        quotas: o.quotas,
        totalAmount: Number(o.total_amount),
        paidAmount: Number(o.paid_amount || 0),
        status: o.status,
        expiresAt: o.expires_at,
      })),
    });
  }

  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: "invalid_json" });
    }

    const phone = cleanString(body.phone, 30);
    const normalizedPhone = normalizePhone(phone);
    if (!enforceRateLimit(req, res, "bot_orders_post", normalizedPhone, 60, 20)) {
      return;
    }

    if (normalizedPhone.length < 8) {
      return sendJson(res, 422, { error: "invalid_phone", message: "Telefone inválido." });
    }

    const buyerName = cleanString(body.buyerName, 120);
    if (!buyerName) {
      return sendJson(res, 422, { error: "invalid_buyer_name", message: "Nome obrigatório." });
    }
    const holderName = cleanString(body.holderName, 120) || null;
    const sourceMessageId = cleanString(body.sourceMessageId, 160) || null;

    let quotas: number[] | null = null;
    let quantity: number | null = null;

    if (body.quotas !== undefined && body.quotas !== null) {
      quotas = validateQuotasInput(body.quotas);
      if (!quotas) {
        return sendJson(res, 422, {
          error: "invalid_quotas",
          message: "Informe números inteiros válidos entre 1 e 100 (máximo 20).",
        });
      }
    } else if (body.quantity !== undefined && body.quantity !== null) {
      const q = Number(body.quantity);
      if (!Number.isInteger(q) || q < 1 || q > 20) {
        return sendJson(res, 422, {
          error: "invalid_quantity",
          message: "Quantidade deve ser um inteiro entre 1 e 20.",
        });
      }
      quantity = q;
    } else {
      return sendJson(res, 422, {
        error: "missing_quotas_or_quantity",
        message: "Informe quotas ou quantity.",
      });
    }

    const { data: camp } = await supabase
      .from("campaigns")
      .select("id")
      .eq("status", "ativa")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!camp) {
      return sendJson(res, 404, { error: "no_active_campaign" });
    }

    const { data: rpcRes, error } = await supabase.rpc("create_order", {
      p_campaign_id: camp.id,
      p_phone: phone,
      p_buyer_name: buyerName,
      p_holder_name: holderName,
      p_quotas: quotas,
      p_quantity: quantity,
      p_source_message_id: sourceMessageId,
    });

    if (error) {
      return sendJson(res, 500, { error: "rpc_error", message: error.message });
    }

    const payload = rpcRes as Record<string, unknown>;
    const statusCode = Number(payload.status) || (payload.ok ? 201 : 400);

    if (!payload.ok) {
      return sendJson(res, statusCode, {
        error: payload.error,
        taken: payload.taken,
        suggestions: payload.suggestions,
        message: payload.message,
      });
    }

    return sendJson(res, 201, { order: payload.order });
  }

  return sendJson(res, 405, { error: "method_not_allowed" });
}
