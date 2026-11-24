import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiRequest, ApiResponse } from "../../_lib/http.js";
import { getQueryParam, sendJson } from "../../_lib/http.js";
import { enforceRateLimit, verifyBotToken } from "../../_lib/security.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "../../_lib/supabase.js";

export async function handleSummaryDaily(
  req: ApiRequest,
  res: ApiResponse,
  supabaseOverride?: SupabaseClient
): Promise<void> {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  if (!verifyBotToken(req, res)) return;
  if (!enforceRateLimit(req, res, "bot_summary_daily", undefined, 60, 30)) return;

  if (!supabaseOverride && !isSupabaseConfigured()) {
    return sendJson(res, 503, { error: "supabase_unconfigured" });
  }

  const peekParam = getQueryParam(req, "peek").trim().toLowerCase();
  const isPeek = peekParam === "1" || peekParam === "true";

  const supabase = supabaseOverride ?? getSupabaseAdmin();
  const { data, error } = await supabase.rpc("ai_daily_summary", {
    p_mark: !isPeek,
  });

  if (error) {
    return sendJson(res, 500, { error: "rpc_error", message: error.message });
  }

  return sendJson(res, 200, data ?? { count: 0, total: 0, items: [] });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return handleSummaryDaily(req, res);
}
