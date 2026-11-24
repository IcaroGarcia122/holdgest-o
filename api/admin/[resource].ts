import crypto from "node:crypto";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { getRouteSegment, readJsonBody, sendJson } from "../_lib/http.js";
import {
  cleanString,
  enforceRateLimit,
  isSafeWebhookUrl,
  normalizePhone,
  validateQuotasInput,
  verifyAdminSession,
} from "../_lib/security.js";
import {
  getSignedReceiptUrl,
  getSupabaseAdmin,
  uploadReceiptImageToStorage,
} from "../_lib/supabase.js";
import {
  checkAndNotifyRaffleComplete,
  dispatchOutboundEvent,
} from "../_lib/webhook.js";
import {
  approveReceiptAction,
  cancelOrderAction,
  linkReceiptAction,
  parseAiSettingsInput,
  parseConfirmationMode,
  payOrderManualAction,
  rejectReceiptAction,
  revertOrderAction,
} from "../_lib/raffleEngine.js";

function mapCampaignRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    code: String(row.code),
    title: String(row.title),
    weekLabel: String(row.week_label),
    whatsappGroupName: String(row.whatsapp_group_name),
    image: String(row.image),
    prizes: Array.isArray(row.prizes) ? row.prizes : [],
    ticketPrice: Number(row.ticket_price),
    totalQuotas: 100 as const,
    drawMethod: String(row.draw_method || "sorteio_ao_vivo"),
    scheduledDrawDate: String(row.scheduled_draw_date),
    status: String(row.status),
    pixKey: String(row.pix_key || ""),
    pixBeneficiary: String(row.pix_beneficiary || ""),
    reservationMinutes: Number(row.reservation_minutes || 30),
    confirmationMode: String(row.confirmation_mode || "manual"),
    createdAt: String(row.created_at),
    completedNotifiedAt: row.completed_notified_at
      ? String(row.completed_notified_at)
      : undefined,
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const admin = await verifyAdminSession(req, res);
  if (!admin) return;
  if (!enforceRateLimit(req, res, "admin_api", undefined, 180, 180)) return;

  const resource = getRouteSegment(req, "resource");
  const supabase = getSupabaseAdmin();

  // --------------------------------------------------------------------------
  // GET /api/admin/state
  // --------------------------------------------------------------------------
  if (resource === "state" && req.method === "GET") {
    const [
      { data: campaigns, error: cErr },
      { data: orders, error: oErr },
      { data: receipts, error: rErr },
      { data: stock, error: sErr },
      { data: winners, error: wErr },
      { data: botLogs, error: lErr },
      { data: botSettings, error: bsErr },
    ] = await Promise.all([
      supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("receipts").select("*").order("created_at", { ascending: false }).limit(250),
      supabase.from("prize_stock").select("*").order("created_at", { ascending: false }),
      supabase.from("winners").select("*").order("drawn_at", { ascending: false }),
      supabase.from("bot_logs").select("*").order("timestamp", { ascending: false }).limit(50),
      supabase.from("bot_settings").select("*").eq("id", 1).maybeSingle(),
    ]);

    const firstErr = cErr || oErr || rErr || sErr || wErr || lErr || bsErr;
    if (firstErr) {
      return sendJson(res, 500, { error: "db_error", message: firstErr.message });
    }

    const orderMap = new Map(
      (orders ?? []).map((o) => [String(o.id), o])
    );

    // Sign private Storage URLs once per unique image_path
    const uniquePaths = Array.from(
      new Set((receipts ?? []).map((r) => r.image_path).filter(Boolean))
    ) as string[];
    const signedUrlMap = new Map<string, string | null>();
    await Promise.all(
      uniquePaths.map(async (p) => {
        signedUrlMap.set(p, await getSignedReceiptUrl(p));
      })
    );

    const mappedReceipts = (receipts ?? []).map((r) => {
      const ord = r.order_id ? orderMap.get(String(r.order_id)) : undefined;
      const signedUrl = r.image_path ? signedUrlMap.get(String(r.image_path)) ?? null : null;
      return {
        id: String(r.id),
        code: r.code ? String(r.code) : undefined,
        orderId: r.order_id ? String(r.order_id) : null,
        campaignId: r.campaign_id ? String(r.campaign_id) : null,
        buyerPhone: String(r.buyer_phone),
        sourceMessageId: r.source_message_id ? String(r.source_message_id) : null,
        e2e: r.e2e ? String(r.e2e) : null,
        imageHash: r.image_hash ? String(r.image_hash) : null,
        amount: r.amount !== null && r.amount !== undefined ? Number(r.amount) : null,
        payerName: r.payer_name ? String(r.payer_name) : null,
        recipientName: r.recipient_name ? String(r.recipient_name) : null,
        paidAt: r.paid_at ? String(r.paid_at) : null,
        status: String(r.status),
        reasons: Array.isArray(r.reasons) ? r.reasons : [],
        confidence: r.confidence !== null && r.confidence !== undefined ? Number(r.confidence) : null,
        imagePath: r.image_path ? String(r.image_path) : null,
        signedUrl,
        fileName: r.file_name ? String(r.file_name) : null,
        verifiedBy: String(r.verified_by || "ai_bot"),
        autoConfirmed: Boolean(r.auto_confirmed),
        summarySentAt: r.summary_sent_at ? String(r.summary_sent_at) : null,
        summary: r.summary ? String(r.summary) : null,
        decidedBy: r.decided_by ? String(r.decided_by) : null,
        decidedAt: r.decided_at ? String(r.decided_at) : null,
        createdAt: String(r.created_at),
        orderCode: ord ? String(ord.code) : undefined,
        orderBuyerName: ord ? String(ord.buyer_name) : undefined,
        orderQuotas: ord && Array.isArray(ord.quotas) ? ord.quotas : undefined,
        orderTotalAmount: ord ? Number(ord.total_amount) : undefined,
      };
    });

    const receiptByOrderId = new Map<string, (typeof mappedReceipts)[number]>();
    for (const r of mappedReceipts) {
      if (r.orderId && r.status !== "rejeitado" && !receiptByOrderId.has(r.orderId)) {
        receiptByOrderId.set(r.orderId, r);
      }
    }

    const mappedOrders = (orders ?? []).map((o) => {
      const r = receiptByOrderId.get(String(o.id));
      return {
        id: String(o.id),
        code: String(o.code),
        campaignId: String(o.campaign_id),
        buyerName: String(o.buyer_name),
        holderName: o.holder_name ? String(o.holder_name) : undefined,
        buyerPhone: String(o.buyer_phone),
        buyerNotes: o.buyer_notes ? String(o.buyer_notes) : undefined,
        quotas: Array.isArray(o.quotas) ? o.quotas.map(Number) : [],
        unitPrice: Number(o.unit_price),
        totalAmount: Number(o.total_amount),
        paidAmount: Number(o.paid_amount || 0),
        surplusAmount: Number(o.surplus_amount || 0),
        needsAdmin: Boolean(o.needs_admin),
        conflictReason: o.conflict_reason ? String(o.conflict_reason) : undefined,
        expiresAt: o.expires_at ? String(o.expires_at) : undefined,
        sourceMessageId: o.source_message_id ? String(o.source_message_id) : undefined,
        paymentMethod: String(o.payment_method || "pix"),
        status: String(o.status),
        receipt: r
          ? {
              id: r.id,
              code: r.code,
              imageUrl: r.signedUrl || undefined,
              imagePath: r.imagePath || undefined,
              fileName: r.fileName || undefined,
              txId: r.e2e || undefined,
              e2e: r.e2e || undefined,
              amount: r.amount ?? undefined,
              payerName: r.payerName ?? undefined,
              recipientName: r.recipientName ?? undefined,
              status: r.status,
              reasons: r.reasons,
              confidence: r.confidence ?? undefined,
              verifiedBy: r.verifiedBy as "ai_bot" | "manual",
              autoConfirmed: r.autoConfirmed,
              summary: r.summary || undefined,
              uploadedAt: r.createdAt,
            }
          : undefined,
        createdAt: String(o.created_at),
        paidAt: o.paid_at ? String(o.paid_at) : undefined,
      };
    });

    return sendJson(res, 200, {
      campaigns: (campaigns ?? []).map(mapCampaignRow),
      orders: mappedOrders,
      receipts: mappedReceipts,
      prizeStock: (stock ?? []).map((item) => ({
        id: String(item.id),
        name: String(item.name),
        category: String(item.category),
        image: String(item.image),
        investedValue: Number(item.invested_value),
        quantity: Number(item.quantity),
        status: String(item.status),
        supplier: item.supplier ? String(item.supplier) : undefined,
        notes: item.notes ? String(item.notes) : undefined,
        createdAt: String(item.created_at),
      })),
      winners: (winners ?? []).map((w) => ({
        id: String(w.id),
        campaignId: String(w.campaign_id),
        campaignCode: String(w.campaign_code),
        campaignTitle: String(w.campaign_title),
        prizePosition: Number(w.prize_position),
        prizeTitle: String(w.prize_title),
        prizeImage: String(w.prize_image),
        quotaNumber: Number(w.quota_number),
        buyerName: String(w.buyer_name),
        buyerPhone: String(w.buyer_phone),
        drawMethod: String(w.draw_method),
        federalNumber: w.federal_number ? String(w.federal_number) : undefined,
        auditHash: String(w.audit_hash),
        drawnAt: String(w.drawn_at),
        deliveryStatus: String(w.delivery_status),
      })),
      botLogs: (botLogs ?? []).map((l) => ({
        id: String(l.id),
        timestamp: String(l.timestamp),
        source: String(l.source),
        senderName: String(l.sender_name),
        senderPhone: String(l.sender_phone),
        rawMessage: String(l.raw_message),
        extractedName: l.extracted_name ? String(l.extracted_name) : undefined,
        extractedNumbers: Array.isArray(l.extracted_numbers) ? l.extracted_numbers : [],
        detectedAmount:
          l.detected_amount !== null && l.detected_amount !== undefined
            ? Number(l.detected_amount)
            : undefined,
        txId: l.tx_id ? String(l.tx_id) : undefined,
        status: String(l.status),
        summary: String(l.summary),
      })),
      botSettings: {
        groupName: String(botSettings?.group_name || "Hold Prêmios — Grupo VIP Oficial"),
        groupJid: String(botSettings?.group_jid || ""),
        outboundWebhookUrl: String(botSettings?.outbound_webhook_url || ""),
        adminPhones: Array.isArray(botSettings?.admin_phones)
          ? botSettings.admin_phones
          : [],
        aiMinConfidence: Number(botSettings?.ai_min_confidence ?? 0.9),
        aiMaxAmount: Number(botSettings?.ai_max_amount ?? 100),
        aiMaxPerPhoneDay: Number(botSettings?.ai_max_per_phone_day ?? 5),
      },
    });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "invalid_json" });
  }

  const action = cleanString(body.action, 40);

  // --------------------------------------------------------------------------
  // POST /api/admin/campaigns
  // --------------------------------------------------------------------------
  if (resource === "campaigns") {
    if (action === "create") {
      const title = cleanString(body.title, 160);
      const ticketPrice = Number(body.ticketPrice);
      if (!title || !Number.isFinite(ticketPrice) || ticketPrice <= 0) {
        return sendJson(res, 422, { error: "invalid_campaign_payload" });
      }

      const confirmationMode =
        body.confirmationMode === undefined || body.confirmationMode === ""
          ? "manual"
          : parseConfirmationMode(body.confirmationMode);
      if (!confirmationMode) {
        return sendJson(res, 422, {
          error: "invalid_confirmation_mode",
          message: "Modo de confirmação inválido. Use 'banco', 'manual' ou 'ia'.",
        });
      }

      const { count } = await supabase
        .from("campaigns")
        .select("*", { count: "exact", head: true });

      const id = `camp-sem-${Date.now().toString().slice(-6)}`;
      const code = `SEM-${(count ?? 0) + 45}`;

      // Enforce 1 active raffle per week
      await supabase
        .from("campaigns")
        .update({ status: "encerrada" })
        .eq("status", "ativa");

      const { data: created, error } = await supabase
        .from("campaigns")
        .insert({
          id,
          code,
          title,
          week_label: cleanString(body.weekLabel, 100) || "Rifa da Semana",
          whatsapp_group_name:
            cleanString(body.whatsappGroupName, 140) || "Hold Prêmios — Grupo VIP",
          image: cleanString(body.image, 300) || "/assets/images/prize_ps5.webp",
          prizes: Array.isArray(body.prizes) ? body.prizes : [],
          ticket_price: ticketPrice,
          total_quotas: 100,
          draw_method: body.drawMethod === "loteria_federal" ? "loteria_federal" : "sorteio_ao_vivo",
          scheduled_draw_date: cleanString(body.scheduledDrawDate, 60) || new Date().toISOString(),
          status: "ativa",
          pix_key: cleanString(body.pixKey, 160),
          pix_beneficiary: cleanString(body.pixBeneficiary, 160),
          reservation_minutes: Math.max(5, Number(body.reservationMinutes) || 30),
          confirmation_mode: confirmationMode,
        })
        .select("*")
        .single();

      if (error || !created) {
        return sendJson(res, 500, { error: "db_error", message: error?.message });
      }

      await supabase.from("audit_log").insert({
        actor: `admin:${admin.email}`,
        action: "CAMPAIGN_CREATED",
        details: { campaignId: id, title },
      });

      return sendJson(res, 201, { ok: true, campaign: mapCampaignRow(created) });
    }

    if (action === "update") {
      const id = cleanString(body.id, 80);
      if (!id) return sendJson(res, 422, { error: "missing_id" });
      const patch: Record<string, unknown> = {};
      if (body.title !== undefined) patch.title = cleanString(body.title, 160);
      if (body.weekLabel !== undefined) patch.week_label = cleanString(body.weekLabel, 100);
      if (body.whatsappGroupName !== undefined)
        patch.whatsapp_group_name = cleanString(body.whatsappGroupName, 140);
      if (body.image !== undefined) patch.image = cleanString(body.image, 300);
      if (body.prizes !== undefined) patch.prizes = body.prizes;
      if (body.ticketPrice !== undefined && Number(body.ticketPrice) > 0)
        patch.ticket_price = Number(body.ticketPrice);
      if (body.scheduledDrawDate !== undefined)
        patch.scheduled_draw_date = cleanString(body.scheduledDrawDate, 60);
      if (body.pixKey !== undefined) patch.pix_key = cleanString(body.pixKey, 160);
      if (body.pixBeneficiary !== undefined)
        patch.pix_beneficiary = cleanString(body.pixBeneficiary, 160);
      if (body.reservationMinutes !== undefined)
        patch.reservation_minutes = Math.max(5, Number(body.reservationMinutes) || 30);
      if (body.confirmationMode !== undefined) {
        const parsedMode = parseConfirmationMode(body.confirmationMode);
        if (!parsedMode) {
          return sendJson(res, 422, {
            error: "invalid_confirmation_mode",
            message: "Modo de confirmação inválido. Use 'banco', 'manual' ou 'ia'.",
          });
        }
        patch.confirmation_mode = parsedMode;
      }

      const { error } = await supabase.from("campaigns").update(patch).eq("id", id);
      if (error) return sendJson(res, 500, { error: "db_error", message: error.message });
      return sendJson(res, 200, { ok: true });
    }

    if (action === "close") {
      const id = cleanString(body.id, 80);
      if (!id) return sendJson(res, 422, { error: "missing_id" });
      await supabase.from("campaigns").update({ status: "encerrada" }).eq("id", id);
      await supabase.from("audit_log").insert({
        actor: `admin:${admin.email}`,
        action: "CAMPAIGN_CLOSED",
        details: { campaignId: id },
      });
      return sendJson(res, 200, { ok: true });
    }

    if (action === "reactivate") {
      const id = cleanString(body.id, 80);
      if (!id) return sendJson(res, 422, { error: "missing_id" });
      await supabase.from("campaigns").update({ status: "encerrada" }).eq("status", "ativa");
      await supabase.from("campaigns").update({ status: "ativa" }).eq("id", id);
      await supabase.from("audit_log").insert({
        actor: `admin:${admin.email}`,
        action: "CAMPAIGN_REACTIVATED",
        details: { campaignId: id },
      });
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 400, { error: "unknown_campaign_action" });
  }

  // --------------------------------------------------------------------------
  // POST /api/admin/orders
  // --------------------------------------------------------------------------
  if (resource === "orders") {
    if (action === "create") {
      const campaignId = cleanString(body.campaignId, 80);
      const buyerName = cleanString(body.buyerName, 120);
      const buyerPhone = cleanString(body.buyerPhone, 30) || "11900000000";
      const quotas = validateQuotasInput(body.quotas);
      const markAsPaid = Boolean(body.markAsPaid);
      const paymentMethod =
        body.paymentMethod === "dinheiro" || body.paymentMethod === "cartao"
          ? body.paymentMethod
          : "pix";

      if (!campaignId || !buyerName || !quotas) {
        return sendJson(res, 422, {
          error: "invalid_order_payload",
          message: "Informe campanha, nome e ao menos 1 número entre 1 e 100.",
        });
      }

      const { data: rpcRes, error } = await supabase.rpc("create_order", {
        p_campaign_id: campaignId,
        p_phone: buyerPhone,
        p_buyer_name: buyerName,
        p_holder_name: null,
        p_quotas: quotas,
        p_quantity: null,
        p_source_message_id: null,
      });

      if (error) {
        return sendJson(res, 500, { error: "rpc_error", message: error.message });
      }

      const payload = rpcRes as Record<string, unknown>;
      if (!payload.ok || !payload.order) {
        return sendJson(res, Number(payload.status) || 409, payload);
      }

      const orderObj = payload.order as Record<string, unknown>;
      const orderId = String(orderObj.id);
      const totalAmount = Number(orderObj.totalAmount);

      if (paymentMethod !== "pix") {
        await supabase
          .from("orders")
          .update({ payment_method: paymentMethod })
          .eq("id", orderId);
      }

      // Optional manual receipt image upload to Storage
      if (
        body.receiptBase64 &&
        typeof body.receiptBase64 === "string" &&
        body.receiptBase64.trim()
      ) {
        try {
          const uploaded = await uploadReceiptImageToStorage(
            body.receiptBase64,
            normalizePhone(buyerPhone)
          );
          await supabase.from("receipts").insert({
            id: `rcp-${crypto.randomUUID().replace(/-/g, "")}`,
            order_id: orderId,
            campaign_id: campaignId,
            buyer_phone: buyerPhone,
            image_hash: uploaded.imageHash,
            amount: markAsPaid ? totalAmount : null,
            payer_name: buyerName,
            status: markAsPaid ? "confirmado" : "em_analise",
            image_path: uploaded.path,
            file_name: cleanString(body.receiptFileName, 120) || uploaded.fileName,
            verified_by: "manual",
            summary: "Comprovante anexado pelo administrador no painel.",
            decided_by: markAsPaid ? admin.email : null,
            decided_at: markAsPaid ? new Date().toISOString() : null,
          });
        } catch (err) {
          return sendJson(res, 422, {
            error: "invalid_receipt_image",
            message: err instanceof Error ? err.message : "Erro ao salvar imagem.",
          });
        }
      }

      await dispatchOutboundEvent("ORDER_CREATED", {
        orderId,
        orderCode: orderObj.code,
        campaignId,
        buyerName,
        quotas,
        totalAmount,
      });

      if (markAsPaid) {
        await supabase.rpc("credit_order", {
          p_order_id: orderId,
          p_amount: totalAmount,
          p_origin: `admin:${admin.email}`,
        });
        await dispatchOutboundEvent("ORDER_PAID", {
          orderId,
          orderCode: orderObj.code,
          campaignId,
          buyerName,
          quotas,
          totalAmount,
        });
        await checkAndNotifyRaffleComplete(campaignId);
      }

      return sendJson(res, 201, { ok: true, order: orderObj });
    }

    if (action === "confirm_manual") {
      const orderId = cleanString(body.orderId, 80);
      if (!orderId) return sendJson(res, 422, { error: "missing_order_id" });
      const resAction = await payOrderManualAction(supabase, {
        ref: orderId,
        actor: `admin:${admin.email}`,
        decidedBy: admin.email,
        amount: body.amount,
      });
      if (!resAction.ok) {
        return sendJson(res, resAction.status, {
          error: resAction.error,
          message: resAction.message,
        });
      }
      return sendJson(res, 200, {
        ok: true,
        result: resAction.result,
        order: resAction.order,
        creditResult: resAction.creditResult,
      });
    }

    if (action === "revert") {
      const orderId = cleanString(body.orderId, 80);
      if (!orderId) return sendJson(res, 422, { error: "missing_order_id" });
      const resAction = await revertOrderAction(supabase, {
        ref: orderId,
        actor: `admin:${admin.email}`,
      });
      if (!resAction.ok) {
        return sendJson(res, resAction.status, {
          error: resAction.error,
          message: resAction.message,
        });
      }
      return sendJson(res, 200, {
        ok: true,
        result: resAction.result,
        order: resAction.order,
      });
    }

    if (action === "cancel") {
      const orderId = cleanString(body.orderId, 80);
      if (!orderId) return sendJson(res, 422, { error: "missing_order_id" });
      const resAction = await cancelOrderAction(supabase, {
        ref: orderId,
        actor: `admin:${admin.email}`,
        decidedBy: admin.email,
      });
      if (!resAction.ok) {
        return sendJson(res, resAction.status, {
          error: resAction.error,
          message: resAction.message,
        });
      }
      return sendJson(res, 200, {
        ok: true,
        result: resAction.result,
        order: resAction.order,
        refundAmount: resAction.refundAmount,
      });
    }

    if (action === "attach_receipt") {
      const orderId = cleanString(body.orderId, 80);
      const markAsPaid = Boolean(body.markAsPaid);
      const rawBase64 = String(body.receiptBase64 ?? "");
      if (!orderId || !rawBase64) {
        return sendJson(res, 422, { error: "missing_receipt_data" });
      }

      const { data: ord } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      if (!ord) return sendJson(res, 404, { error: "order_not_found" });

      const uploaded = await uploadReceiptImageToStorage(
        rawBase64,
        normalizePhone(ord.buyer_phone)
      );

      await supabase.from("receipts").insert({
        id: `rcp-${crypto.randomUUID().replace(/-/g, "")}`,
        order_id: orderId,
        campaign_id: ord.campaign_id,
        buyer_phone: ord.buyer_phone,
        image_hash: uploaded.imageHash,
        amount: markAsPaid ? Number(ord.total_amount) : null,
        payer_name: ord.buyer_name,
        status: markAsPaid ? "confirmado" : "em_analise",
        image_path: uploaded.path,
        file_name: cleanString(body.fileName, 120) || uploaded.fileName,
        verified_by: "manual",
        summary: "Comprovante anexado manualmente no painel.",
        decided_by: markAsPaid ? admin.email : null,
        decided_at: markAsPaid ? new Date().toISOString() : null,
      });

      if (markAsPaid) {
        const remaining = Math.max(
          0.01,
          Number(ord.total_amount) - Number(ord.paid_amount || 0)
        );
        await supabase.rpc("credit_order", {
          p_order_id: orderId,
          p_amount: remaining,
          p_origin: `admin:${admin.email}`,
        });
        await dispatchOutboundEvent("ORDER_PAID", {
          orderId,
          orderCode: ord.code,
          campaignId: ord.campaign_id,
          buyerName: ord.buyer_name,
          quotas: ord.quotas,
          totalAmount: Number(ord.total_amount),
        });
        await checkAndNotifyRaffleComplete(ord.campaign_id);
      }

      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 400, { error: "unknown_order_action" });
  }

  // --------------------------------------------------------------------------
  // POST /api/admin/receipts
  // --------------------------------------------------------------------------
  if (resource === "receipts") {
    const receiptId = cleanString(body.receiptId, 80);
    if (!receiptId) return sendJson(res, 422, { error: "missing_receipt_id" });

    if (action === "approve") {
      const resAction = await approveReceiptAction(supabase, {
        ref: receiptId,
        actor: `admin:${admin.email}`,
        decidedBy: admin.email,
        amount: body.amount,
      });
      if (!resAction.ok) {
        return sendJson(res, resAction.status, {
          error: resAction.error,
          message: resAction.message,
        });
      }
      return sendJson(res, 200, {
        ok: true,
        result: resAction.result,
        receipt: resAction.receipt,
        order: resAction.order,
        creditResult: resAction.creditResult,
      });
    }

    if (action === "reject") {
      const resAction = await rejectReceiptAction(supabase, {
        ref: receiptId,
        actor: `admin:${admin.email}`,
        decidedBy: admin.email,
        reason: body.reason,
      });
      if (!resAction.ok) {
        return sendJson(res, resAction.status, {
          error: resAction.error,
          message: resAction.message,
        });
      }
      return sendJson(res, 200, {
        ok: true,
        result: resAction.result,
        orderStatus: resAction.nextOrderStatus,
      });
    }

    if (action === "link") {
      const orderRef =
        cleanString(body.orderId, 80) || cleanString(body.orderCode, 80);
      if (!orderRef) return sendJson(res, 422, { error: "missing_order_id" });
      const resAction = await linkReceiptAction(supabase, {
        receiptRef: receiptId,
        orderRef,
        actor: `admin:${admin.email}`,
      });
      if (!resAction.ok) {
        return sendJson(res, resAction.status, {
          error: resAction.error,
          message: resAction.message,
        });
      }
      return sendJson(res, 200, {
        ok: true,
        result: resAction.result,
        receipt: resAction.receipt,
        order: resAction.order,
      });
    }

    return sendJson(res, 400, { error: "unknown_receipt_action" });
  }

  // --------------------------------------------------------------------------
  // POST /api/admin/inventory
  // --------------------------------------------------------------------------
  if (resource === "inventory") {
    if (action === "add") {
      const id = `stk-${Date.now().toString().slice(-6)}`;
      const quantity = Math.max(0, Number(body.quantity) || 0);
      const status =
        quantity <= 0
          ? "esgotado"
          : body.status === "reservado_rifa" || body.status === "esgotado"
          ? body.status
          : "disponivel";

      const { data, error } = await supabase
        .from("prize_stock")
        .insert({
          id,
          name: cleanString(body.name, 140),
          category: cleanString(body.category, 60) || "Outros",
          image: cleanString(body.image, 300) || "/assets/images/prize_ps5.webp",
          invested_value: Math.max(0, Number(body.investedValue) || 0),
          quantity,
          status,
          supplier: cleanString(body.supplier, 120) || null,
          notes: cleanString(body.notes, 240) || null,
        })
        .select("*")
        .single();

      if (error) return sendJson(res, 500, { error: "db_error", message: error.message });
      return sendJson(res, 201, { ok: true, item: data });
    }

    if (action === "update") {
      const id = cleanString(body.id, 80);
      if (!id) return sendJson(res, 422, { error: "missing_id" });
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) patch.name = cleanString(body.name, 140);
      if (body.category !== undefined) patch.category = cleanString(body.category, 60);
      if (body.image !== undefined) patch.image = cleanString(body.image, 300);
      if (body.investedValue !== undefined)
        patch.invested_value = Math.max(0, Number(body.investedValue) || 0);
      if (body.quantity !== undefined) {
        const q = Math.max(0, Number(body.quantity) || 0);
        patch.quantity = q;
        if (q === 0) patch.status = "esgotado";
      }
      if (body.status !== undefined && patch.status === undefined) {
        patch.status = cleanString(body.status, 30);
      }
      if (body.supplier !== undefined) patch.supplier = cleanString(body.supplier, 120) || null;
      if (body.notes !== undefined) patch.notes = cleanString(body.notes, 240) || null;

      await supabase.from("prize_stock").update(patch).eq("id", id);

      if (patch.name !== undefined || patch.invested_value !== undefined) {
        const { data: activeCamps } = await supabase
          .from("campaigns")
          .select("id, prizes")
          .eq("status", "ativa");

        for (const c of activeCamps ?? []) {
          const prizes = Array.isArray(c.prizes) ? c.prizes : [];
          let changed = false;
          const nextPrizes = prizes.map((p: Record<string, unknown>) => {
            if (p.stockItemId !== id) return p;
            changed = true;
            return {
              ...p,
              ...(patch.name !== undefined ? { title: patch.name } : {}),
              ...(patch.invested_value !== undefined
                ? { investedValue: patch.invested_value }
                : {}),
            };
          });
          if (changed) {
            await supabase
              .from("campaigns")
              .update({ prizes: nextPrizes })
              .eq("id", c.id);
          }
        }
      }

      return sendJson(res, 200, { ok: true });
    }

    if (action === "delete") {
      const id = cleanString(body.id, 80);
      if (!id) return sendJson(res, 422, { error: "missing_id" });
      await supabase.from("prize_stock").delete().eq("id", id);

      const { data: activeCamps } = await supabase
        .from("campaigns")
        .select("id, prizes")
        .eq("status", "ativa");

      for (const c of activeCamps ?? []) {
        const prizes = Array.isArray(c.prizes) ? c.prizes : [];
        let changed = false;
        const nextPrizes = prizes.map((p: Record<string, unknown>) => {
          if (p.stockItemId !== id) return p;
          changed = true;
          return { ...p, stockItemId: undefined, investedValue: 0 };
        });
        if (changed) {
          await supabase
            .from("campaigns")
            .update({ prizes: nextPrizes })
            .eq("id", c.id);
        }
      }

      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 400, { error: "unknown_inventory_action" });
  }

  // --------------------------------------------------------------------------
  // POST /api/admin/settings
  // --------------------------------------------------------------------------
  if (resource === "settings") {
    const webhookUrl = cleanString(body.outboundWebhookUrl, 300);
    if (webhookUrl && !isSafeWebhookUrl(webhookUrl)) {
      return sendJson(res, 422, {
        error: "unsafe_webhook_url",
        message: "URL de webhook inválida ou endereço privado bloqueado.",
      });
    }

    const parsedAi = parseAiSettingsInput(body);
    if (!parsedAi.ok) {
      return sendJson(res, 422, {
        error: parsedAi.error,
        message: parsedAi.message,
      });
    }

    let nextConfirmationMode: string | undefined;
    if (body.activeCampaignId && body.confirmationMode !== undefined) {
      const parsedMode = parseConfirmationMode(body.confirmationMode);
      if (!parsedMode) {
        return sendJson(res, 422, {
          error: "invalid_confirmation_mode",
          message: "Modo de confirmação inválido. Use 'banco', 'manual' ou 'ia'.",
        });
      }
      nextConfirmationMode = parsedMode;
    }

    const adminPhones = Array.isArray(body.adminPhones)
      ? body.adminPhones.map((p) => cleanString(p, 30)).filter(Boolean)
      : typeof body.adminPhones === "string"
      ? body.adminPhones
          .split(/[,\n]/)
          .map((p) => p.trim())
          .filter(Boolean)
      : [];

    const { error: settingsErr } = await supabase
      .from("bot_settings")
      .upsert({
        id: 1,
        group_name: cleanString(body.groupName, 140) || "Hold Prêmios — Grupo VIP Oficial",
        group_jid: cleanString(body.groupJid, 140),
        outbound_webhook_url: webhookUrl,
        admin_phones: adminPhones,
        ai_min_confidence: parsedAi.value.aiMinConfidence,
        ai_max_amount: parsedAi.value.aiMaxAmount,
        ai_max_per_phone_day: parsedAi.value.aiMaxPerPhoneDay,
        updated_at: new Date().toISOString(),
      });

    if (settingsErr) {
      return sendJson(res, 500, { error: "db_error", message: settingsErr.message });
    }

    if (body.activeCampaignId) {
      const campPatch: Record<string, unknown> = {};
      if (body.pixKey !== undefined) campPatch.pix_key = cleanString(body.pixKey, 160);
      if (body.pixBeneficiary !== undefined)
        campPatch.pix_beneficiary = cleanString(body.pixBeneficiary, 160);
      if (body.reservationMinutes !== undefined)
        campPatch.reservation_minutes = Math.max(5, Number(body.reservationMinutes) || 30);
      if (nextConfirmationMode !== undefined)
        campPatch.confirmation_mode = nextConfirmationMode;

      if (Object.keys(campPatch).length > 0) {
        const { error: campErr } = await supabase
          .from("campaigns")
          .update(campPatch)
          .eq("id", cleanString(body.activeCampaignId, 80));
        if (campErr) {
          return sendJson(res, 500, { error: "db_error", message: campErr.message });
        }
      }
    }

    await supabase.from("audit_log").insert({
      actor: `admin:${admin.email}`,
      action: "SETTINGS_UPDATED",
      details: { groupJid: cleanString(body.groupJid, 140), confirmationMode: body.confirmationMode },
    });

    return sendJson(res, 200, { ok: true });
  }

  // --------------------------------------------------------------------------
  // POST /api/admin/import (optional migration from browser localStorage)
  // --------------------------------------------------------------------------
  if (resource === "import") {
    const state = (body.state ?? {}) as Record<string, unknown>;
    const campaigns = Array.isArray(state.campaigns) ? state.campaigns : [];
    const orders = Array.isArray(state.orders) ? state.orders : [];
    const stock = Array.isArray(state.prizeStock) ? state.prizeStock : [];
    const winners = Array.isArray(state.winners) ? state.winners : [];

    for (const s of stock as Array<Record<string, unknown>>) {
      await supabase.from("prize_stock").upsert({
        id: cleanString(s.id, 80),
        name: cleanString(s.name, 140),
        category: cleanString(s.category, 60) || "Outros",
        image: cleanString(s.image, 300) || "/assets/images/prize_ps5.webp",
        invested_value: Number(s.investedValue) || 0,
        quantity: Math.max(0, Number(s.quantity) || 0),
        status: cleanString(s.status, 30) || "disponivel",
        supplier: s.supplier ? cleanString(s.supplier, 120) : null,
        notes: s.notes ? cleanString(s.notes, 240) : null,
        created_at: s.createdAt ? String(s.createdAt) : new Date().toISOString(),
      });
    }

    for (const c of campaigns as Array<Record<string, unknown>>) {
      await supabase.from("campaigns").upsert({
        id: cleanString(c.id, 80),
        code: cleanString(c.code, 40),
        title: cleanString(c.title, 160),
        week_label: cleanString(c.weekLabel, 100),
        whatsapp_group_name: cleanString(c.whatsappGroupName, 140),
        image: cleanString(c.image, 300),
        prizes: Array.isArray(c.prizes) ? c.prizes : [],
        ticket_price: Math.max(1, Number(c.ticketPrice) || 100),
        total_quotas: 100,
        draw_method: c.drawMethod === "loteria_federal" ? "loteria_federal" : "sorteio_ao_vivo",
        scheduled_draw_date: String(c.scheduledDrawDate || new Date().toISOString()),
        status: c.status === "encerrada" ? "encerrada" : "ativa",
        pix_key: cleanString(c.pixKey, 160),
        pix_beneficiary: cleanString(c.pixBeneficiary, 160),
        reservation_minutes: Number(c.reservationMinutes) || 30,
        confirmation_mode: parseConfirmationMode(c.confirmationMode) ?? "manual",
        created_at: String(c.createdAt || new Date().toISOString()),
        completed_notified_at: c.completedNotifiedAt ? String(c.completedNotifiedAt) : null,
      });
    }

    for (const o of orders as Array<Record<string, unknown>>) {
      const oid = cleanString(o.id, 80);
      const cid = cleanString(o.campaignId, 80);
      const qArr = Array.isArray(o.quotas)
        ? o.quotas.map(Number).filter((n) => n >= 1 && n <= 100)
        : [];
      const oStatus = cleanString(o.status, 30) || "pendente";
      await supabase.from("orders").upsert({
        id: oid,
        code: cleanString(o.code, 20) || `R${oid.slice(-4).toUpperCase()}`,
        campaign_id: cid,
        buyer_name: cleanString(o.buyerName, 120),
        buyer_phone: cleanString(o.buyerPhone, 30) || "(11) 90000-0000",
        quotas: qArr,
        unit_price: Number(o.unitPrice) || 100,
        total_amount: Number(o.totalAmount) || 0,
        paid_amount: oStatus === "pago" ? Number(o.totalAmount) || 0 : 0,
        payment_method: cleanString(o.paymentMethod, 20) || "pix",
        status: oStatus,
        created_at: String(o.createdAt || new Date().toISOString()),
        paid_at: o.paidAt ? String(o.paidAt) : null,
      });

      if (oStatus === "pago" || oStatus === "pendente" || oStatus === "em_analise") {
        await supabase
          .from("quotas")
          .update({
            status: oStatus === "pago" ? "paga" : "reservada",
            order_id: oid,
          })
          .eq("campaign_id", cid)
          .in("number", qArr);
      }
    }

    for (const w of winners as Array<Record<string, unknown>>) {
      await supabase.from("winners").upsert({
        id: cleanString(w.id, 80),
        campaign_id: cleanString(w.campaignId, 80),
        campaign_code: cleanString(w.campaignCode, 40),
        campaign_title: cleanString(w.campaignTitle, 160),
        prize_position: Number(w.prizePosition) || 1,
        prize_title: cleanString(w.prizeTitle, 160),
        prize_image: cleanString(w.prizeImage, 300),
        quota_number: Number(w.quotaNumber) || 1,
        buyer_name: cleanString(w.buyerName, 120),
        buyer_phone: cleanString(w.buyerPhone, 30),
        draw_method: String(w.drawMethod || "sorteio_ao_vivo"),
        federal_number: w.federalNumber ? cleanString(w.federalNumber, 40) : null,
        audit_hash: cleanString(w.auditHash, 40),
        drawn_at: String(w.drawnAt || new Date().toISOString()),
        delivery_status: String(w.deliveryStatus || "aguardando"),
      });
    }

    await supabase.from("audit_log").insert({
      actor: `admin:${admin.email}`,
      action: "LOCALSTORAGE_IMPORTED",
      details: { campaigns: campaigns.length, orders: orders.length, stock: stock.length },
    });

    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: "unknown_admin_resource" });
}
