import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { sendJson } from "../_lib/http.js";
import { enforceRateLimit, verifyBotToken } from "../_lib/security.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "../_lib/supabase.js";

function firstNameOnly(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] || null;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  if (!verifyBotToken(req, res)) return;
  if (!enforceRateLimit(req, res, "bot_quotas", undefined, 120, 60)) return;
  if (!isSupabaseConfigured()) {
    return sendJson(res, 503, { error: "supabase_unconfigured" });
  }

  const supabase = getSupabaseAdmin();
  const { data: camp } = await supabase
    .from("campaigns")
    .select("id")
    .eq("status", "ativa")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!camp) {
    return sendJson(res, 404, { error: "no_active_campaign", numbers: [] });
  }

  const { data: quotas, error } = await supabase
    .from("quotas")
    .select("number, status, order_id")
    .eq("campaign_id", camp.id)
    .order("number", { ascending: true });

  if (error) {
    return sendJson(res, 500, { error: "db_error", message: error.message });
  }

  const orderIds = Array.from(
    new Set((quotas ?? []).map((q) => q.order_id).filter(Boolean))
  ) as string[];

  const buyerByOrderId = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, buyer_name")
      .in("id", orderIds);

    for (const o of orders ?? []) {
      buyerByOrderId.set(o.id, o.buyer_name);
    }
  }

  const numbers = (quotas ?? []).map((q) => ({
    number: q.number,
    status: q.status,
    buyerName:
      q.status === "disponivel" || !q.order_id
        ? null
        : firstNameOnly(buyerByOrderId.get(q.order_id)),
  }));

  return sendJson(res, 200, { campaignId: camp.id, numbers });
}
