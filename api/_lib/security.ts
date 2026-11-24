import crypto from "node:crypto";
import net from "node:net";
import type { ApiRequest, ApiResponse } from "./http.js";
import { getClientIp, sendJson } from "./http.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase.js";

const rateBucket = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = rateBucket.get(key);
  if (!entry || now > entry.resetAt) {
    rateBucket.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function enforceRateLimit(
  req: ApiRequest,
  res: ApiResponse,
  scope: string,
  phone?: string,
  maxPerIp = 60,
  maxPerPhone = 30
): boolean {
  const ip = getClientIp(req);
  if (!checkRateLimit(`${scope}:ip:${ip}`, maxPerIp, 60_000)) {
    sendJson(res, 429, { error: "rate_limit_ip", message: "Muitas requisições deste IP." });
    return false;
  }
  if (phone) {
    const clean = normalizePhone(phone);
    if (clean && !checkRateLimit(`${scope}:phone:${clean}`, maxPerPhone, 60_000)) {
      sendJson(res, 429, { error: "rate_limit_phone", message: "Muitas requisições para este telefone." });
      return false;
    }
  }
  return true;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    // Compare against self to keep constant timing regardless of length mismatch
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function extractBearerToken(req: ApiRequest): string {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}

export function verifyBotToken(req: ApiRequest, res: ApiResponse): boolean {
  const expected = process.env.BOT_API_TOKEN || "";
  if (!expected) {
    sendJson(res, 503, { error: "bot_token_unconfigured", message: "BOT_API_TOKEN não configurado no servidor." });
    return false;
  }
  const provided = extractBearerToken(req);
  if (!provided || !constantTimeEqual(provided, expected)) {
    sendJson(res, 401, { error: "unauthorized", message: "Token de autenticação inválido." });
    return false;
  }
  return true;
}

export async function verifyAdminSession(
  req: ApiRequest,
  res: ApiResponse
): Promise<{ id: string; email: string } | null> {
  if (!isSupabaseConfigured()) {
    sendJson(res, 503, {
      error: "supabase_unconfigured",
      message: "Variáveis do Supabase não configuradas no servidor.",
    });
    return null;
  }

  let token = extractBearerToken(req);
  if (!token && typeof req.headers.cookie === "string") {
    const match = req.headers.cookie.match(/(?:^|;\s*)hp_access_token=([^;]+)/);
    if (match) {
      token = decodeURIComponent(match[1]);
    }
  }

  if (!token) {
    sendJson(res, 401, { error: "unauthorized", message: "Sessão administrativa obrigatória." });
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    sendJson(res, 401, { error: "invalid_session", message: "Sessão inválida ou expirada." });
    return null;
  }

  return { id: data.user.id, email: data.user.email || "admin" };
}

export function normalizePhone(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 15);
}

export function cleanString(raw: unknown, maxLen = 200): string {
  return String(raw ?? "").trim().slice(0, maxLen);
}

export function validateQuotasInput(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const nums: number[] = [];
  for (const item of raw) {
    const n = Number(item);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return null;
    }
    if (!nums.includes(n)) nums.push(n);
  }
  if (nums.length === 0 || nums.length > 20) return null;
  return nums.sort((a, b) => a - b);
}

export function isSafeWebhookUrl(rawUrl: string): boolean {
  if (!rawUrl || !rawUrl.trim()) return true;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host === "169.254.169.254"
  ) {
    return false;
  }
  const ipType = net.isIP(host);
  if (ipType === 4) {
    const parts = host.split(".").map(Number);
    if (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    ) {
      return false;
    }
  } else if (ipType === 6) {
    if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
      return false;
    }
  }
  return true;
}
