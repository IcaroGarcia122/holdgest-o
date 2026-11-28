import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { getQueryParam, readJsonBody, sendJson } from "../_lib/http.js";
import {
  cleanString,
  enforceRateLimit,
  normalizePhone,
  verifyBotToken,
} from "../_lib/security.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "../_lib/supabase.js";
import {
  approveReceiptAction,
  cancelOrderAction,
  linkReceiptAction,
  listPendingAdminItems,
  listUnpaidAdminOrders,
  payOrderManualAction,
  rejectReceiptAction,
  revertOrderAction,
  verifyBotAdminActor,
  type AdminActionResult,
} from "../_lib/raffleEngine.js";

function extractAdminRoute(req: ApiRequest): {
  resource: string;
  ref: string;
  action: string;
} {
  const reqAny = req as unknown as {
    params?: Record<string, string>;
    originalUrl?: string;
  };

  let resource =
    reqAny.params?.resource ||
    (req.query && typeof req.query.resource === "string" ? req.query.resource : "");
  let ref =
    reqAny.params?.ref ||
    (req.query && typeof req.query.ref === "string" ? req.query.ref : "");
  let action =
    reqAny.params?.action ||
    (req.query && typeof req.query.action === "string" ? req.query.action : "");

  const rawPath = (reqAny.originalUrl || req.url || "").split("?")[0];
  const marker = "/api/bot/admin/";
  const idx = rawPath.indexOf(marker);
  if (idx >= 0) {
    const tail = rawPath
      .slice(idx + marker.length)
      .split("/")
      .filter(Boolean);
    if (tail[0] === "pending") {
      resource = "pending";
    } else if (tail[0] === "unpaid") {
      resource = "unpaid";
    } else if (tail.length >= 3) {
      resource = resource || tail[0];
      ref = ref || decodeURIComponent(tail[1]);
      action = action || tail[2];
    }
  }

  return {
    resource: cleanString(resource, 40).toLowerCase(),
    ref: cleanString(ref, 80),
    action: cleanString(action, 40).toLowerCase(),
  };
}

function sendActionResult(res: ApiResponse, result: AdminActionResult): void {
  if (!result.ok) {
    return sendJson(res, result.status, {
      error: result.error,
      message: result.message,
    });
  }
  return sendJson(res, 200, {
    result: result.result,
    receipt: result.receipt,
    order: result.order,
    shortfall: result.shortfall,
    surplus: result.surplus,
    refundAmount: result.refundAmount,
  });
}

export async function handleBotAdmin(
  req: ApiRequest,
  res: ApiResponse,
  supabaseOverride?: SupabaseClient
) {
  if (!verifyBotToken(req, res)) return;
  if (!supabaseOverride && !isSupabaseConfigured()) {
    return sendJson(res, 503, { error: "supabase_unconfigured" });
  }

  const route = extractAdminRoute(req);

  const isPendingRoute = route.resource === "pending";
  const isUnpaidRoute = route.resource === "unpaid";
  const isGetAdminRoute = isPendingRoute || isUnpaidRoute;
  const isReceiptActionRoute =
    route.resource === "receipts" &&
    Boolean(route.ref) &&
    ["approve", "reject", "link"].includes(route.action);
  const isOrderActionRoute =
    route.resource === "orders" &&
    Boolean(route.ref) &&
    ["pay", "cancel", "revert"].includes(route.action);

  if (!isGetAdminRoute && !isReceiptActionRoute && !isOrderActionRoute) {
    return sendJson(res, 404, {
      error: "not_found",
      message: "Rota administrativa do bot não encontrada.",
    });
  }

  if (isGetAdminRoute && req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  if (!isGetAdminRoute && req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  let body: Record<string, unknown> = {};
  let rawActor: unknown;

  if (isGetAdminRoute) {
    rawActor = getQueryParam(req, "actor");
  } else {
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 422, {
        error: "invalid_payload",
        message: "Corpo JSON inválido.",
      });
    }
    rawActor = body.actor;
  }

  const actorPhone = normalizePhone(rawActor);
  if (!enforceRateLimit(req, res, "bot_admin", actorPhone, 90, 45)) {
    return;
  }

  const supabase = supabaseOverride ?? getSupabaseAdmin();
  const auth = await verifyBotAdminActor(supabase, rawActor);
  if (!auth.ok) {
    return sendJson(res, auth.status, {
      error: auth.error,
      message: auth.message,
    });
  }

  if (isPendingRoute) {
    const pendingRes = await listPendingAdminItems(supabase);
    if (!pendingRes.ok) {
      return sendJson(res, pendingRes.status, {
        error: pendingRes.error,
        message: pendingRes.message,
      });
    }
    return sendJson(res, 200, {
      items: pendingRes.items,
      count: pendingRes.items.length,
    });
  }

  if (isUnpaidRoute) {
    const unpaidRes = await listUnpaidAdminOrders(supabase);
    if (!unpaidRes.ok) {
      return sendJson(res, unpaidRes.status, {
        error: unpaidRes.error,
        message: unpaidRes.message,
      });
    }
    return sendJson(res, 200, {
      count: unpaidRes.items.length,
      items: unpaidRes.items,
    });
  }

  if (isReceiptActionRoute) {
    if (route.action === "approve") {
      const result = await approveReceiptAction(supabase, {
        ref: route.ref,
        actor: auth.actorLabel,
        decidedBy: auth.actorLabel,
        amount: body.amount,
      });
      return sendActionResult(res, result);
    }

    if (route.action === "reject") {
      const result = await rejectReceiptAction(supabase, {
        ref: route.ref,
        actor: auth.actorLabel,
        decidedBy: auth.actorLabel,
        reason: body.reason,
      });
      return sendActionResult(res, result);
    }

    if (route.action === "link") {
      const orderRef = cleanString(body.orderCode ?? body.orderId, 80);
      const result = await linkReceiptAction(supabase, {
        receiptRef: route.ref,
        orderRef,
        actor: auth.actorLabel,
      });
      return sendActionResult(res, result);
    }
  }

  if (isOrderActionRoute) {
    if (route.action === "pay") {
      const result = await payOrderManualAction(supabase, {
        ref: route.ref,
        actor: auth.actorLabel,
        decidedBy: auth.actorLabel,
        amount: body.amount,
      });
      return sendActionResult(res, result);
    }

    if (route.action === "cancel") {
      const result = await cancelOrderAction(supabase, {
        ref: route.ref,
        actor: auth.actorLabel,
        decidedBy: auth.actorLabel,
      });
      return sendActionResult(res, result);
    }

    if (route.action === "revert") {
      const result = await revertOrderAction(supabase, {
        ref: route.ref,
        actor: auth.actorLabel,
      });
      return sendActionResult(res, result);
    }
  }

  return sendJson(res, 404, { error: "not_found" });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return handleBotAdmin(req, res);
}
