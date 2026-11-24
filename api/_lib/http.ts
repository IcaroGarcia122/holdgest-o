import type { IncomingMessage, ServerResponse } from "node:http";

export interface ApiRequest extends IncomingMessage {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  ip?: string;
}

export interface ApiResponse extends ServerResponse {
  status?: (code: number) => ApiResponse;
  json?: (data: unknown) => void;
}

export function sendJson(res: ApiResponse, statusCode: number, data: unknown): void {
  res.setHeader("Cache-Control", "no-store");
  const statusFn = res.status;
  const jsonFn = res.json;
  if (typeof statusFn === "function" && typeof jsonFn === "function") {
    statusFn.call(res, statusCode);
    jsonFn.call(res, data);
    return;
  }
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export async function readJsonBody(req: ApiRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === "object") {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === "string" && req.body.trim()) {
    return JSON.parse(req.body) as Record<string, unknown>;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

export function getQueryParam(req: ApiRequest, key: string): string {
  if (req.query && req.query[key] !== undefined) {
    const v = req.query[key];
    return Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
  }
  const urlStr = req.url || "/";
  try {
    const parsed = new URL(urlStr, "http://localhost");
    return parsed.searchParams.get(key) ?? "";
  } catch {
    return "";
  }
}

export function getClientIp(req: ApiRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) {
    return fwd.split(",")[0].trim();
  }
  if (Array.isArray(fwd) && fwd[0]) {
    return fwd[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function getPathParamId(req: ApiRequest, segmentBeforeId = "orders"): string {
  const reqAny = req as unknown as {
    params?: Record<string, string>;
    originalUrl?: string;
  };
  if (reqAny.params?.id) return reqAny.params.id;
  if (req.query && typeof req.query.id === "string" && req.query.id) {
    return req.query.id;
  }
  const urlPath = (reqAny.originalUrl || req.url || "").split("?")[0];
  const parts = urlPath.split("/").filter(Boolean);
  const idx = parts.lastIndexOf(segmentBeforeId);
  if (idx >= 0 && parts[idx + 1]) {
    return parts[idx + 1];
  }
  return "";
}

export function getRouteSegment(
  req: ApiRequest,
  paramName: string,
  fallbackIndexFromEnd = 0
): string {
  const reqAny = req as unknown as {
    params?: Record<string, string>;
    originalUrl?: string;
  };
  if (reqAny.params?.[paramName]) return reqAny.params[paramName];
  if (req.query && typeof req.query[paramName] === "string" && req.query[paramName]) {
    return String(req.query[paramName]);
  }
  const urlPath = (reqAny.originalUrl || req.url || "").split("?")[0];
  const parts = urlPath.split("/").filter(Boolean);
  return parts[parts.length - 1 - fallbackIndexFromEnd] || "";
}
