/**
 * Deterministic in-memory transactional engine mirroring the PostgreSQL RPCs
 * in `supabase/schema.sql` (`create_order`, `register_receipt`, `register_pix`,
 * `credit_order`, `expire_orders`) for automated unit verification.
 */

export type ConfirmationMode = "banco" | "manual";

export interface EngineCampaign {
  id: string;
  ticketPrice: number;
  reservationMinutes: number;
  confirmationMode: ConfirmationMode;
  status: "ativa" | "encerrada";
}

export interface EngineQuota {
  campaignId: string;
  number: number;
  status: "disponivel" | "reservada" | "paga";
  orderId: string | null;
}

export interface EngineOrder {
  id: string;
  code: string;
  campaignId: string;
  buyerName: string;
  buyerPhone: string;
  quotas: number[];
  totalAmount: number;
  paidAmount: number;
  surplusAmount: number;
  needsAdmin: boolean;
  conflictReason: string | null;
  status: "pendente" | "em_analise" | "pago" | "cancelado" | "expirado";
  expiresAt: number;
  expiryWarned: boolean;
  sourceMessageId?: string | null;
  createdAt: number;
}

export interface EngineReceipt {
  id: string;
  orderId: string | null;
  buyerPhone: string;
  e2e: string | null;
  imageHash: string | null;
  amount: number | null;
  status:
    | "orfao"
    | "em_analise"
    | "revisao"
    | "confirmado"
    | "rejeitado"
    | "reenvio";
  createdAt: number;
}

export interface EnginePix {
  e2e: string;
  amount: number;
  usedOrderId: string | null;
  paidAt: number;
}

export class RaffleEngine {
  campaigns = new Map<string, EngineCampaign>();
  quotas = new Map<string, EngineQuota[]>();
  orders = new Map<string, EngineOrder>();
  receipts = new Map<string, EngineReceipt>();
  pixReceived = new Map<string, EnginePix>();
  messagesLog = new Map<string, unknown>();
  private seq = 0;

  private normPhone(raw: string): string {
    return raw.replace(/\D/g, "");
  }

  seedCampaign(camp: EngineCampaign): void {
    this.campaigns.set(camp.id, { ...camp });
    const rows: EngineQuota[] = [];
    for (let n = 1; n <= 100; n++) {
      rows.push({
        campaignId: camp.id,
        number: n,
        status: "disponivel",
        orderId: null,
      });
    }
    this.quotas.set(camp.id, rows);
  }

  createOrder(input: {
    campaignId: string;
    phone: string;
    buyerName: string;
    quotas?: number[];
    quantity?: number;
    sourceMessageId?: string;
    now?: number;
  }): {
    ok: boolean;
    status: number;
    error?: string;
    taken?: number[];
    suggestions?: number[];
    order?: EngineOrder;
  } {
    if (input.sourceMessageId && this.messagesLog.has(input.sourceMessageId)) {
      return this.messagesLog.get(input.sourceMessageId) as ReturnType<
        RaffleEngine["createOrder"]
      >;
    }

    const now = input.now ?? Date.now();
    const camp = this.campaigns.get(input.campaignId);
    if (!camp || camp.status !== "ativa") {
      return { ok: false, status: 404, error: "campaign_not_found" };
    }

    const phone = this.normPhone(input.phone);
    if (phone.length < 8) {
      return { ok: false, status: 422, error: "invalid_phone" };
    }

    const pendingCount = Array.from(this.orders.values()).filter(
      (o) =>
        o.campaignId === camp.id &&
        this.normPhone(o.buyerPhone) === phone &&
        (o.status === "pendente" || o.status === "em_analise")
    ).length;

    if (pendingCount >= 3) {
      return { ok: false, status: 429, error: "too_many_pending_orders" };
    }

    const campQuotas = this.quotas.get(camp.id) ?? [];
    let chosen: number[] = [];

    if (input.quotas && input.quotas.length > 0) {
      chosen = Array.from(new Set(input.quotas)).sort((a, b) => a - b);
      if (chosen.length > 20) {
        return { ok: false, status: 422, error: "max_quotas_exceeded" };
      }
      if (chosen.some((n) => !Number.isInteger(n) || n < 1 || n > 100)) {
        return { ok: false, status: 422, error: "invalid_quota_number" };
      }

      const taken: number[] = [];
      for (const n of chosen) {
        const row = campQuotas[n - 1];
        if (!row || row.status !== "disponivel") {
          taken.push(n);
        }
      }

      if (taken.length > 0) {
        const suggestions = campQuotas
          .filter((r) => r.status === "disponivel")
          .slice(0, 5)
          .map((r) => r.number);

        const conflictRes = {
          ok: false,
          status: 409,
          error: "quotas_taken",
          taken,
          suggestions,
        };
        if (input.sourceMessageId) {
          this.messagesLog.set(input.sourceMessageId, conflictRes);
        }
        return conflictRes;
      }
    } else if (input.quantity && input.quantity >= 1 && input.quantity <= 20) {
      const free = campQuotas.filter((r) => r.status === "disponivel");
      if (free.length < input.quantity) {
        return { ok: false, status: 409, error: "insufficient_quotas" };
      }
      chosen = free.slice(0, input.quantity).map((r) => r.number);
    } else {
      return { ok: false, status: 422, error: "invalid_quantity" };
    }

    this.seq += 1;
    const orderId = `ord-${this.seq}`;
    const order: EngineOrder = {
      id: orderId,
      code: `R${String(this.seq).padStart(4, "0")}`,
      campaignId: camp.id,
      buyerName: input.buyerName,
      buyerPhone: input.phone,
      quotas: chosen,
      totalAmount: Number((chosen.length * camp.ticketPrice).toFixed(2)),
      paidAmount: 0,
      surplusAmount: 0,
      needsAdmin: false,
      conflictReason: null,
      status: "pendente",
      expiresAt: now + camp.reservationMinutes * 60_000,
      expiryWarned: false,
      sourceMessageId: input.sourceMessageId ?? null,
      createdAt: now,
    };

    for (const n of chosen) {
      campQuotas[n - 1].status = "reservada";
      campQuotas[n - 1].orderId = orderId;
    }
    this.orders.set(orderId, order);

    // Link recent orphan receipts from the same phone
    for (const rcp of this.receipts.values()) {
      if (
        rcp.status === "orfao" &&
        this.normPhone(rcp.buyerPhone) === phone &&
        now - rcp.createdAt <= 24 * 3600_000
      ) {
        rcp.orderId = orderId;
        rcp.status = "em_analise";
        order.status = "em_analise";
        order.needsAdmin = true;
      }
    }

    const res = { ok: true, status: 201, order };
    if (input.sourceMessageId) {
      this.messagesLog.set(input.sourceMessageId, res);
    }
    return res;
  }

  creditOrder(
    orderId: string,
    amount: number,
    now = Date.now()
  ): {
    ok: boolean;
    result: string;
    shortfall?: number;
    surplus?: number;
    taken?: number[];
  } {
    const order = this.orders.get(orderId);
    if (!order) return { ok: false, result: "nao_encontrado" };
    if (order.status === "cancelado") return { ok: false, result: "cancelado" };

    const campQuotas = this.quotas.get(order.campaignId) ?? [];

    if (order.status === "expirado") {
      const taken = order.quotas.filter(
        (n) => campQuotas[n - 1]?.status !== "disponivel"
      );
      if (taken.length > 0) {
        order.needsAdmin = true;
        order.conflictReason = "conflito_reembolso";
        order.paidAmount = Number((order.paidAmount + amount).toFixed(2));
        return { ok: false, result: "conflito", taken };
      }
      for (const n of order.quotas) {
        campQuotas[n - 1].status = "reservada";
        campQuotas[n - 1].orderId = order.id;
      }
    }

    const newPaid = Number((order.paidAmount + amount).toFixed(2));
    if (newPaid >= order.totalAmount) {
      const surplus = Number(Math.max(0, newPaid - order.totalAmount).toFixed(2));
      order.paidAmount = newPaid;
      order.surplusAmount = surplus;
      order.status = "pago";
      order.needsAdmin = surplus > 0;
      order.conflictReason = surplus > 0 ? "excedente" : null;
      for (const n of order.quotas) {
        campQuotas[n - 1].status = "paga";
        campQuotas[n - 1].orderId = order.id;
      }
      return { ok: true, result: "confirmado", surplus };
    } else {
      const shortfall = Number((order.totalAmount - newPaid).toFixed(2));
      order.paidAmount = newPaid;
      order.status = "pendente";
      order.expiresAt = Math.max(order.expiresAt, now) + 30 * 60_000;
      return { ok: true, result: "parcial", shortfall };
    }
  }

  registerReceipt(input: {
    phone: string;
    sourceMessageId: string;
    e2e?: string | null;
    imageHash?: string | null;
    amount?: number | null;
    preStatus?: "ok" | "revisar" | "rejeitar" | "reenvio";
    now?: number;
  }): {
    result: string;
    reason?: string;
    order?: EngineOrder;
    shortfall?: number;
    surplus?: number;
  } {
    if (this.messagesLog.has(input.sourceMessageId)) {
      return this.messagesLog.get(input.sourceMessageId) as ReturnType<
        RaffleEngine["registerReceipt"]
      >;
    }
    const now = input.now ?? Date.now();
    const phone = this.normPhone(input.phone);

    // Duplicate check on E2E and imageHash
    for (const r of this.receipts.values()) {
      if (!["orfao", "em_analise", "revisao", "confirmado"].includes(r.status)) {
        continue;
      }
      if (input.e2e && r.e2e === input.e2e) {
        return { result: "duplicado", reason: "e2e_duplicado" };
      }
      if (input.imageHash && r.imageHash === input.imageHash) {
        return { result: "duplicado", reason: "image_hash_duplicado" };
      }
    }

    const openOrders = Array.from(this.orders.values()).filter(
      (o) =>
        this.normPhone(o.buyerPhone) === phone &&
        (o.status === "pendente" || o.status === "em_analise")
    );

    let targetOrder: EngineOrder | undefined;
    if (openOrders.length === 1) {
      targetOrder = openOrders[0];
    } else if (openOrders.length > 1 && input.amount != null) {
      const matches = openOrders.filter(
        (o) => Math.abs(o.totalAmount - o.paidAmount - input.amount!) <= 0.05
      );
      if (matches.length === 1) {
        targetOrder = matches[0];
      } else {
        this.seq += 1;
        this.receipts.set(`rcp-${this.seq}`, {
          id: `rcp-${this.seq}`,
          orderId: null,
          buyerPhone: input.phone,
          e2e: input.e2e ?? null,
          imageHash: input.imageHash ?? null,
          amount: input.amount ?? null,
          status: "revisao",
          createdAt: now,
        });
        return { result: "ambiguo" };
      }
    } else if (openOrders.length > 1) {
      return { result: "ambiguo" };
    } else {
      const lateExpired = Array.from(this.orders.values())
        .filter(
          (o) =>
            this.normPhone(o.buyerPhone) === phone &&
            o.status === "expirado" &&
            now - o.expiresAt <= 24 * 3600_000
        )
        .sort((a, b) => b.expiresAt - a.expiresAt)[0];

      if (lateExpired) {
        targetOrder = lateExpired;
      }
    }

    this.seq += 1;
    const rcpId = `rcp-${this.seq}`;

    if (!targetOrder) {
      this.receipts.set(rcpId, {
        id: rcpId,
        orderId: null,
        buyerPhone: input.phone,
        e2e: input.e2e ?? null,
        imageHash: input.imageHash ?? null,
        amount: input.amount ?? null,
        status: "orfao",
        createdAt: now,
      });
      return { result: "orfao" };
    }

    const camp = this.campaigns.get(targetOrder.campaignId);
    const pix = input.e2e ? this.pixReceived.get(input.e2e) : undefined;
    const preStatus = input.preStatus ?? "ok";

    if (preStatus === "rejeitar") {
      this.receipts.set(rcpId, {
        id: rcpId,
        orderId: targetOrder.id,
        buyerPhone: input.phone,
        e2e: input.e2e ?? null,
        imageHash: input.imageHash ?? null,
        amount: input.amount ?? null,
        status: "rejeitado",
        createdAt: now,
      });
      return { result: "rejeitado", order: targetOrder };
    }

    // Golden rule: image alone NEVER confirms payment
    if (
      camp?.confirmationMode === "banco" &&
      pix &&
      !pix.usedOrderId &&
      preStatus === "ok"
    ) {
      const credit = this.creditOrder(targetOrder.id, pix.amount, now);
      if (credit.result === "conflito") {
        this.receipts.set(rcpId, {
          id: rcpId,
          orderId: targetOrder.id,
          buyerPhone: input.phone,
          e2e: input.e2e ?? null,
          imageHash: input.imageHash ?? null,
          amount: pix.amount,
          status: "revisao",
          createdAt: now,
        });
        return { result: "conflito", order: targetOrder };
      }

      pix.usedOrderId = targetOrder.id;
      this.receipts.set(rcpId, {
        id: rcpId,
        orderId: targetOrder.id,
        buyerPhone: input.phone,
        e2e: input.e2e ?? null,
        imageHash: input.imageHash ?? null,
        amount: pix.amount,
        status: "confirmado",
        createdAt: now,
      });
      return {
        result: credit.result,
        order: targetOrder,
        shortfall: credit.shortfall,
        surplus: credit.surplus,
      };
    }

    // Otherwise leave in analysis for admin
    this.receipts.set(rcpId, {
      id: rcpId,
      orderId: targetOrder.id,
      buyerPhone: input.phone,
      e2e: input.e2e ?? null,
      imageHash: input.imageHash ?? null,
      amount: input.amount ?? null,
      status: preStatus === "revisar" ? "revisao" : "em_analise",
      createdAt: now,
    });
    if (targetOrder.status === "pendente") {
      targetOrder.status = "em_analise";
      targetOrder.needsAdmin = true;
    }
    return { result: "em_analise", order: targetOrder };
  }

  registerPix(input: { e2e: string; amount: number; now?: number }) {
    if (this.pixReceived.has(input.e2e)) {
      return { result: "duplicado" };
    }
    const now = input.now ?? Date.now();
    const pix: EnginePix = {
      e2e: input.e2e,
      amount: input.amount,
      usedOrderId: null,
      paidAt: now,
    };
    this.pixReceived.set(input.e2e, pix);

    for (const rcp of this.receipts.values()) {
      if (
        rcp.e2e === input.e2e &&
        rcp.orderId &&
        (rcp.status === "em_analise" || rcp.status === "revisao")
      ) {
        const order = this.orders.get(rcp.orderId);
        const camp = order ? this.campaigns.get(order.campaignId) : undefined;
        if (camp?.confirmationMode === "banco" && order) {
          const credit = this.creditOrder(order.id, input.amount, now);
          if (credit.result !== "conflito") {
            pix.usedOrderId = order.id;
            rcp.status = "confirmado";
            return { result: credit.result, matchedReceipt: true };
          }
          return { result: "conflito", matchedReceipt: true };
        }
      }
    }

    return { result: "registrado", matchedReceipt: false };
  }

  rejectReceipt(receiptId: string, now = Date.now()): {
    ok: boolean;
    orderStatus?: EngineOrder["status"];
  } {
    const rcp = this.receipts.get(receiptId);
    if (!rcp) return { ok: false };

    rcp.status = "rejeitado";

    if (!rcp.orderId) {
      return { ok: true };
    }

    const order = this.orders.get(rcp.orderId);
    if (!order) return { ok: true };

    const hasOtherInAnalysis = Array.from(this.receipts.values()).some(
      (r) =>
        r.id !== receiptId &&
        r.orderId === rcp.orderId &&
        (r.status === "em_analise" ||
          r.status === "revisao" ||
          r.status === "reenvio")
    );

    if (!hasOtherInAnalysis) {
      const hasConflict =
        order.conflictReason === "conflito_reembolso" ||
        order.conflictReason === "excedente";

      if (order.status === "em_analise") {
        order.status = "pendente";
        order.needsAdmin = hasConflict;
        if (order.expiresAt <= now) {
          order.expiresAt = now + 15 * 60_000;
        }
      } else if (order.status === "pendente" && !hasConflict) {
        order.needsAdmin = false;
      }
    }

    return { ok: true, orderStatus: order.status };
  }

  expireOrders(now = Date.now()) {
    const expired: string[] = [];
    const warnings: string[] = [];
    const needsAdmin: string[] = [];

    for (const order of this.orders.values()) {
      if (order.needsAdmin) needsAdmin.push(order.id);
      if (order.status !== "pendente") continue;

      const hasReceiptInAnalysis = Array.from(this.receipts.values()).some(
        (r) =>
          r.orderId === order.id &&
          ["em_analise", "revisao", "reenvio"].includes(r.status)
      );

      if (
        order.expiresAt <= now &&
        order.paidAmount === 0 &&
        !hasReceiptInAnalysis
      ) {
        order.status = "expirado";
        const campQuotas = this.quotas.get(order.campaignId) ?? [];
        for (const n of order.quotas) {
          if (campQuotas[n - 1]?.orderId === order.id) {
            campQuotas[n - 1].status = "disponivel";
            campQuotas[n - 1].orderId = null;
          }
        }
        expired.push(order.id);
      } else if (
        order.expiresAt > now &&
        order.expiresAt <= now + 5 * 60_000 &&
        !order.expiryWarned &&
        order.paidAmount === 0
      ) {
        order.expiryWarned = true;
        warnings.push(order.id);
      }
    }

    return { expired, warnings, needsAdmin };
  }
}
