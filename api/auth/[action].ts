import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { getRouteSegment, readJsonBody, sendJson } from "../_lib/http.js";
import {
  cleanString,
  enforceRateLimit,
  extractBearerToken,
} from "../_lib/security.js";
import {
  createEphemeralAuthClient,
  getSupabaseAdmin,
  isSupabaseConfigured,
} from "../_lib/supabase.js";

function buildSessionCookie(
  req: ApiRequest,
  token: string,
  maxAgeSec: number
): string {
  const isHttps =
    req.headers["x-forwarded-proto"] === "https" ||
    process.env.NODE_ENV === "production";
  if (isHttps) {
    return `hp_access_token=${encodeURIComponent(
      token
    )}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${maxAgeSec}`;
  }
  return `hp_access_token=${encodeURIComponent(
    token
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const action = getRouteSegment(req, "action");

  if (action === "session" && req.method === "GET") {
    if (!isSupabaseConfigured()) {
      return sendJson(res, 200, {
        configured: false,
        authenticated: false,
        user: null,
      });
    }

    let token = extractBearerToken(req);
    if (!token && typeof req.headers.cookie === "string") {
      const m = req.headers.cookie.match(/(?:^|;\s*)hp_access_token=([^;]+)/);
      if (m) token = decodeURIComponent(m[1]);
    }

    if (!token) {
      return sendJson(res, 200, {
        configured: true,
        authenticated: false,
        user: null,
      });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return sendJson(res, 200, {
        configured: true,
        authenticated: false,
        user: null,
      });
    }

    return sendJson(res, 200, {
      configured: true,
      authenticated: true,
      user: { id: data.user.id, email: data.user.email || "admin" },
    });
  }

  if (action === "login" && req.method === "POST") {
    if (!enforceRateLimit(req, res, "auth_login", undefined, 20, 20)) return;
    if (!isSupabaseConfigured()) {
      return sendJson(res, 503, {
        error: "supabase_unconfigured",
        message:
          "Configure SUPABASE_URL e SUPABASE_SECRET_KEY nas variáveis de ambiente do servidor.",
      });
    }

    let body: Record<string, unknown>;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: "invalid_json" });
    }

    const email = cleanString(body.email, 160).toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password) {
      return sendJson(res, 422, {
        error: "missing_credentials",
        message: "Informe e-mail e senha.",
      });
    }

    const authClient = createEphemeralAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      return sendJson(res, 401, {
        error: "invalid_credentials",
        message: "E-mail ou senha inválidos.",
      });
    }

    res.setHeader(
      "Set-Cookie",
      buildSessionCookie(req, data.session.access_token, 60 * 60 * 12)
    );

    return sendJson(res, 200, {
      ok: true,
      accessToken: data.session.access_token,
      user: { id: data.user.id, email: data.user.email || email },
    });
  }

  if (action === "logout" && req.method === "POST") {
    res.setHeader("Set-Cookie", buildSessionCookie(req, "", 0));
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: "unknown_auth_action" });
}
