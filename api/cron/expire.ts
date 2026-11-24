import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { sendJson } from "../_lib/http.js";
import { enforceRateLimit, verifyBotToken } from "../_lib/security.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "../_lib/supabase.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  if (!verifyBotToken(req, res)) return;
  if (!enforceRateLimit(req, res, "cron_expire", undefined, 30, 30)) return;
  if (!isSupabaseConfigured()) {
    return sendJson(res, 503, { error: "supabase_unconfigured" });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("expire_orders");
  if (error) {
    return sendJson(res, 500, { error: "rpc_error", message: error.message });
  }

  const payload = (data ?? { expired: [], warnings: [], needsAdmin: [] }) as {
    expired: unknown[];
    warnings: unknown[];
    needsAdmin: unknown[];
  };

  return sendJson(res, 200, {
    expired: payload.expired ?? [],
    warnings: payload.warnings ?? [],
    needsAdmin: payload.needsAdmin ?? [],
  });
}
