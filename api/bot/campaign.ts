import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { sendJson } from "../_lib/http.js";
import { enforceRateLimit, verifyBotToken } from "../_lib/security.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "../_lib/supabase.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  if (!verifyBotToken(req, res)) return;
  if (!enforceRateLimit(req, res, "bot_campaign", undefined, 120, 60)) return;
  if (!isSupabaseConfigured()) {
    return sendJson(res, 503, { error: "supabase_unconfigured" });
  }

  const supabase = getSupabaseAdmin();
  const { data: camp, error } = await supabase
    .from("campaigns")
    .select(
      "id, code, title, week_label, ticket_price, total_quotas, pix_key, pix_beneficiary, reservation_minutes, confirmation_mode"
    )
    .eq("status", "ativa")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return sendJson(res, 500, { error: "db_error", message: error.message });
  }
  if (!camp) {
    return sendJson(res, 404, { error: "no_active_campaign" });
  }

  const [{ count: availableCount }, { data: settings }] = await Promise.all([
    supabase
      .from("quotas")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", camp.id)
      .eq("status", "disponivel"),
    supabase
      .from("bot_settings")
      .select("admin_phones, group_jid")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  return sendJson(res, 200, {
    id: camp.id,
    code: camp.code,
    title: camp.title,
    weekLabel: camp.week_label,
    ticketPrice: Number(camp.ticket_price),
    totalQuotas: camp.total_quotas,
    pixKey: camp.pix_key || "",
    pixBeneficiary: camp.pix_beneficiary || "",
    reservationMinutes: camp.reservation_minutes ?? 30,
    confirmationMode: camp.confirmation_mode || "manual",
    availableCount: availableCount ?? 0,
    adminPhones: settings?.admin_phones ?? [],
    groupJid: settings?.group_jid ?? "",
  });
}
