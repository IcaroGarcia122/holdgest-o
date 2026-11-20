import { useState, useEffect, useCallback, useMemo } from "react";
import { INITIAL_SEED_STATE, DEFAULT_TEN_PRIZES } from "../data/seedData";
import {
  BotActivityLog,
  BotSettings,
  DeliveryStatus,
  DrawMethod,
  PaymentMethod,
  PrizeCategory,
  PrizeStockItem,
  PrizeStockStatus,
  QuotaRowInfo,
  RaffleCampaign,
  RaffleOrder,
  RafflePrize,
  ReceiptAttachment,
  StoreState,
  WinnerRecord,
} from "../types/raffle";
import {
  buildWhatsAppCompletionAlertText,
  generateAuditHash,
} from "../utils/formatters";

const STORAGE_KEY = "hold_premios_rifas_state_v1";
const LEGACY_STORAGE_KEY = "hold_bar_rifas_state_v3";

function loadInitialState(): StoreState {
  if (typeof window === "undefined") return INITIAL_SEED_STATE;
  try {
    let raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        raw = legacyRaw
          .replace(/HOLD BAR SPORTS & MUSIC/g, "HOLD PRÊMIOS")
          .replace(/Hold Bar Sports & Music/g, "Hold Prêmios")
          .replace(/HOLD BAR/g, "HOLD PRÊMIOS")
          .replace(/Hold Bar/gi, "Hold Prêmios");
      }
    }
    if (!raw) return INITIAL_SEED_STATE;
    const parsed = JSON.parse(raw) as StoreState;
    if (
      !parsed ||
      !Array.isArray(parsed.campaigns) ||
      !Array.isArray(parsed.orders) ||
      !Array.isArray(parsed.winners)
    ) {
      return INITIAL_SEED_STATE;
    }
    return {
      campaigns: parsed.campaigns,
      orders: parsed.orders,
      winners: parsed.winners,
      prizeStock: Array.isArray(parsed.prizeStock)
        ? parsed.prizeStock
        : INITIAL_SEED_STATE.prizeStock,
      botLogs: Array.isArray(parsed.botLogs)
        ? parsed.botLogs
        : INITIAL_SEED_STATE.botLogs,
      botSettings: parsed.botSettings ?? INITIAL_SEED_STATE.botSettings,
    };
  } catch {
    return INITIAL_SEED_STATE;
  }
}

export function useRaffleStore() {
  const [state, setState] = useState<StoreState>(loadInitialState);
  const [completionAlertCampaign, setCompletionAlertCampaign] =
    useState<RaffleCampaign | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [state]);

  const activeWeeklyCampaign = useMemo(
    () => state.campaigns.find((c) => c.status === "ativa") ?? null,
    [state.campaigns]
  );

  const getList100 = useCallback(
    (campaignId: string): QuotaRowInfo[] => {
      const rows: QuotaRowInfo[] = [];
      const orderByNumber = new Map<number, RaffleOrder>();

      const activeOrders = state.orders.filter(
        (o) => o.campaignId === campaignId && o.status !== "cancelado"
      );

      for (const order of activeOrders) {
        for (const num of order.quotas) {
          if (num >= 1 && num <= 100) {
            orderByNumber.set(num, order);
          }
        }
      }

      for (let num = 1; num <= 100; num++) {
        const order = orderByNumber.get(num);
        if (!order) {
          rows.push({ number: num, status: "disponivel" });
        } else {
          rows.push({
            number: num,
            status: order.status === "pago" ? "paga" : "reservada",
            order,
          });
        }
      }

      return rows;
    },
    [state.orders]
  );

  const getCampaignStats = useCallback(
    (campaignId: string) => {
      const campaign = state.campaigns.find((c) => c.id === campaignId);
      let paidCount = 0;
      let reservedCount = 0;
      let confirmedRevenue = 0;
      let pendingRevenue = 0;

      const campaignOrders = state.orders.filter(
        (o) => o.campaignId === campaignId && o.status !== "cancelado"
      );

      for (const order of campaignOrders) {
        if (order.status === "pago") {
          paidCount += order.quotas.length;
          confirmedRevenue += order.totalAmount;
        } else if (order.status === "pendente") {
          reservedCount += order.quotas.length;
          pendingRevenue += order.totalAmount;
        }
      }

      const availableCount = Math.max(0, 100 - paidCount - reservedCount);
      const progressPercent = Math.min(100, paidCount);
      const investedPrizesValue = campaign
        ? campaign.prizes.reduce((sum, p) => sum + (Number(p.investedValue) || 0), 0)
        : 0;
      const potentialRevenue = campaign ? campaign.ticketPrice * 100 : 0;
      const currentNetResult = confirmedRevenue - investedPrizesValue;

      return {
        totalQuotas: 100,
        paidCount,
        reservedCount,
        availableCount,
        confirmedRevenue,
        pendingRevenue,
        potentialRevenue,
        investedPrizesValue,
        currentNetResult,
        progressPercent,
        isComplete: paidCount >= 100,
      };
    },
    [state.campaigns, state.orders]
  );

  const stockSummary = useMemo(() => {
    let totalInvested = 0;
    let totalUnits = 0;
    let availableUnits = 0;
    for (const item of state.prizeStock) {
      totalInvested += item.investedValue * item.quantity;
      totalUnits += item.quantity;
      if (item.status === "disponivel") {
        availableUnits += item.quantity;
      }
    }
    return {
      totalItems: state.prizeStock.length,
      totalUnits,
      availableUnits,
      totalInvested,
    };
  }, [state.prizeStock]);

  const triggerCompletionNotification = useCallback(
    (campaign: RaffleCampaign, outboundWebhookUrl: string) => {
      setCompletionAlertCampaign(campaign);

      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification("Rifa Completa (100/100) — HOLD PRÊMIOS", {
            body: `A rifa "${campaign.title}" atingiu 100 números confirmados e está pronta para o sorteio dos 10 prêmios!`,
            icon: "/assets/images/logo_hold_ouro.webp",
          });
        }
      }

      fetch("/api/bot/notify-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: outboundWebhookUrl,
          campaignTitle: campaign.title,
          weekLabel: campaign.weekLabel,
          groupName: campaign.whatsappGroupName,
          message: buildWhatsAppCompletionAlertText(campaign),
        }),
      }).catch(() => {
        // Silent fallback
      });
    },
    []
  );

  useEffect(() => {
    if (!activeWeeklyCampaign || activeWeeklyCampaign.status !== "ativa") return;
    const stats = getCampaignStats(activeWeeklyCampaign.id);
    if (stats.paidCount >= 100 && !activeWeeklyCampaign.completedNotifiedAt) {
      const nowIso = new Date().toISOString();
      const updatedCampaign: RaffleCampaign = {
        ...activeWeeklyCampaign,
        completedNotifiedAt: nowIso,
      };
      setState((prev) => ({
        ...prev,
        campaigns: prev.campaigns.map((c) =>
          c.id === activeWeeklyCampaign.id
            ? { ...c, completedNotifiedAt: nowIso }
            : c
        ),
      }));
      triggerCompletionNotification(
        updatedCampaign,
        state.botSettings.outboundWebhookUrl
      );
    }
  }, [
    activeWeeklyCampaign,
    getCampaignStats,
    state.botSettings.outboundWebhookUrl,
    triggerCompletionNotification,
  ]);

  const createCampaign = useCallback(
    (input: {
      title: string;
      weekLabel: string;
      whatsappGroupName: string;
      image: string;
      prizes: RafflePrize[];
      ticketPrice: number;
      drawMethod: DrawMethod;
      scheduledDrawDate: string;
    }): RaffleCampaign => {
      const nextNum = state.campaigns.length + 45;
      const newCampaign: RaffleCampaign = {
        id: `camp-sem-${Date.now().toString().slice(-5)}`,
        code: `SEM-${nextNum}`,
        title: input.title.trim(),
        weekLabel: input.weekLabel.trim(),
        whatsappGroupName:
          input.whatsappGroupName.trim() || state.botSettings.groupName,
        image: input.image,
        prizes:
          input.prizes.length === 10 ? input.prizes : DEFAULT_TEN_PRIZES,
        ticketPrice: input.ticketPrice,
        totalQuotas: 100,
        drawMethod: input.drawMethod,
        scheduledDrawDate: input.scheduledDrawDate,
        status: "ativa",
        createdAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        campaigns: [
          newCampaign,
          ...prev.campaigns.map((c) =>
            c.status === "ativa" ? { ...c, status: "encerrada" as const } : c
          ),
        ],
      }));
      setCompletionAlertCampaign(null);
      return newCampaign;
    },
    [state.campaigns.length, state.botSettings.groupName]
  );

  const updateCampaign = useCallback(
    (id: string, patch: Partial<RaffleCampaign>) => {
      setState((prev) => ({
        ...prev,
        campaigns: prev.campaigns.map((c) =>
          c.id === id ? { ...c, ...patch } : c
        ),
      }));
    },
    []
  );

  const closeCampaign = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      campaigns: prev.campaigns.map((c) =>
        c.id === id ? { ...c, status: "encerrada" } : c
      ),
    }));
    setCompletionAlertCampaign((prev) => (prev?.id === id ? null : prev));
  }, []);

  const reactivateCampaign = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      campaigns: prev.campaigns.map((c) =>
        c.id === id
          ? { ...c, status: "ativa" }
          : c.status === "ativa"
          ? { ...c, status: "encerrada" }
          : c
      ),
    }));
    setCompletionAlertCampaign(null);
  }, []);

  const createOrder = useCallback(
    (input: {
      campaignId: string;
      buyerName: string;
      buyerPhone: string;
      buyerNotes?: string;
      quotas: number[];
      paymentMethod: PaymentMethod;
      markAsPaid: boolean;
      receipt?: ReceiptAttachment;
    }): { ok: boolean; order?: RaffleOrder; error?: string } => {
      const campaign = state.campaigns.find((c) => c.id === input.campaignId);
      if (!campaign) {
        return { ok: false, error: "Rifa não encontrada." };
      }
      if (campaign.status !== "ativa") {
        return {
          ok: false,
          error: "Esta rifa semanal já foi encerrada.",
        };
      }

      const uniqueQuotas = Array.from(
        new Set(
          input.quotas.filter(
            (q) => Number.isInteger(q) && q >= 1 && q <= 100
          )
        )
      ).sort((a, b) => a - b);

      if (uniqueQuotas.length === 0) {
        return {
          ok: false,
          error: "Selecione ao menos um número de 1 a 100.",
        };
      }

      const takenNumbers = new Set<number>();
      for (const order of state.orders) {
        if (order.campaignId === campaign.id && order.status !== "cancelado") {
          for (const q of order.quotas) takenNumbers.add(q);
        }
      }

      const conflicts = uniqueQuotas.filter((q) => takenNumbers.has(q));
      if (conflicts.length > 0) {
        return {
          ok: false,
          error: `Número(s) já ocupado(s) na lista: ${conflicts
            .map((n) => String(n).padStart(2, "0"))
            .join(", ")}.`,
        };
      }

      const totalAmount = Number(
        (uniqueQuotas.length * campaign.ticketPrice).toFixed(2)
      );
      const nowIso = new Date().toISOString();

      const newOrder: RaffleOrder = {
        id: `ord-${Date.now().toString().slice(-6)}`,
        campaignId: campaign.id,
        buyerName: input.buyerName.trim(),
        buyerPhone: input.buyerPhone.trim() || "(11) 90000-0000",
        buyerNotes: input.buyerNotes?.trim() || undefined,
        quotas: uniqueQuotas,
        unitPrice: campaign.ticketPrice,
        totalAmount,
        paymentMethod: input.paymentMethod,
        status: input.markAsPaid ? "pago" : "pendente",
        receipt: input.receipt,
        createdAt: nowIso,
        paidAt: input.markAsPaid ? nowIso : undefined,
      };

      setState((prev) => ({
        ...prev,
        orders: [newOrder, ...prev.orders],
      }));

      return { ok: true, order: newOrder };
    },
    [state.campaigns, state.orders]
  );

  const confirmOrderPayment = useCallback(
    (orderId: string, receipt?: ReceiptAttachment) => {
      const nowIso = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: "pago",
                paidAt: o.paidAt ?? nowIso,
                receipt: receipt ?? o.receipt,
              }
            : o
        ),
      }));
    },
    []
  );

  const attachReceiptToOrder = useCallback(
    (orderId: string, receipt: ReceiptAttachment, markAsPaid = true) => {
      const nowIso = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                receipt,
                status: markAsPaid ? "pago" : o.status,
                paidAt: markAsPaid ? o.paidAt ?? nowIso : o.paidAt,
              }
            : o
        ),
      }));
    },
    []
  );

  const cancelOrder = useCallback((orderId: string) => {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId ? { ...o, status: "cancelado" } : o
      ),
    }));
  }, []);

  // Prize Stock CRUD
  const addPrizeStockItem = useCallback(
    (input: {
      name: string;
      category: PrizeCategory;
      image: string;
      investedValue: number;
      quantity: number;
      status: PrizeStockStatus;
      supplier?: string;
      notes?: string;
    }) => {
      const item: PrizeStockItem = {
        id: `stk-${Date.now().toString().slice(-6)}`,
        name: input.name.trim(),
        category: input.category,
        image: input.image,
        investedValue: input.investedValue,
        quantity: Math.max(0, input.quantity),
        status: input.quantity <= 0 ? "esgotado" : input.status,
        supplier: input.supplier?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        prizeStock: [item, ...prev.prizeStock],
      }));
      return item;
    },
    []
  );

  const updatePrizeStockItem = useCallback(
    (id: string, patch: Partial<PrizeStockItem>) => {
      setState((prev) => {
        const nextStock = prev.prizeStock.map((item) => {
          if (item.id !== id) return item;
          const nextQty =
            patch.quantity !== undefined ? Math.max(0, patch.quantity) : item.quantity;
          const nextStatus =
            nextQty === 0
              ? "esgotado"
              : patch.status ?? (item.status === "esgotado" ? "disponivel" : item.status);
          return { ...item, ...patch, quantity: nextQty, status: nextStatus };
        });

        const updatedItem = nextStock.find((item) => item.id === id);
        const nextCampaigns =
          updatedItem &&
          (patch.name !== undefined || patch.investedValue !== undefined)
            ? prev.campaigns.map((camp) =>
                camp.status !== "ativa"
                  ? camp
                  : {
                      ...camp,
                      prizes: camp.prizes.map((p) =>
                        p.stockItemId === id
                          ? {
                              ...p,
                              title:
                                patch.name !== undefined
                                  ? updatedItem.name
                                  : p.title,
                              investedValue:
                                patch.investedValue !== undefined
                                  ? updatedItem.investedValue
                                  : p.investedValue,
                            }
                          : p
                      ),
                    }
              )
            : prev.campaigns;

        return {
          ...prev,
          prizeStock: nextStock,
          campaigns: nextCampaigns,
        };
      });
    },
    []
  );

  const deletePrizeStockItem = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      prizeStock: prev.prizeStock.filter((item) => item.id !== id),
      campaigns: prev.campaigns.map((camp) =>
        camp.status !== "ativa"
          ? camp
          : {
              ...camp,
              prizes: camp.prizes.map((p) =>
                p.stockItemId === id
                  ? { ...p, stockItemId: undefined, investedValue: 0 }
                  : p
              ),
            }
      ),
    }));
  }, []);

  const executeDraw = useCallback(
    (input: {
      campaignId: string;
      quotaNumber: number;
      prizePosition: number;
      drawMethod: DrawMethod;
      federalNumber?: string;
    }): { ok: boolean; winner?: WinnerRecord; error?: string } => {
      const campaign = state.campaigns.find((c) => c.id === input.campaignId);
      if (!campaign) {
        return { ok: false, error: "Rifa não encontrada." };
      }

      const winningOrder = state.orders.find(
        (o) =>
          o.campaignId === campaign.id &&
          o.status === "pago" &&
          o.quotas.includes(input.quotaNumber)
      );

      if (!winningOrder) {
        return {
          ok: false,
          error: "O número sorteado não possui pagamento confirmado.",
        };
      }

      const prize =
        campaign.prizes.find((p) => p.position === input.prizePosition) ?? {
          position: input.prizePosition,
          title: `${input.prizePosition}º Prêmio`,
        };

      const nowIso = new Date().toISOString();
      const newWinner: WinnerRecord = {
        id: `win-${Date.now().toString().slice(-6)}`,
        campaignId: campaign.id,
        campaignCode: campaign.code,
        campaignTitle: campaign.title,
        prizePosition: prize.position,
        prizeTitle: prize.title,
        prizeImage: campaign.image,
        quotaNumber: input.quotaNumber,
        buyerName: winningOrder.buyerName,
        buyerPhone: winningOrder.buyerPhone,
        drawMethod: input.drawMethod,
        federalNumber: input.federalNumber,
        auditHash: generateAuditHash(campaign.id, input.quotaNumber, nowIso),
        drawnAt: nowIso,
        deliveryStatus: "aguardando",
      };

      setState((prev) => ({
        ...prev,
        winners: [newWinner, ...prev.winners],
      }));

      return { ok: true, winner: newWinner };
    },
    [state.campaigns, state.orders]
  );

  const updateWinnerDelivery = useCallback(
    (winnerId: string, deliveryStatus: DeliveryStatus) => {
      setState((prev) => ({
        ...prev,
        winners: prev.winners.map((w) =>
          w.id === winnerId ? { ...w, deliveryStatus } : w
        ),
      }));
    },
    []
  );

  const addBotLog = useCallback((log: Omit<BotActivityLog, "id" | "timestamp">) => {
    const newLog: BotActivityLog = {
      ...log,
      id: `log-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      botLogs: [newLog, ...prev.botLogs].slice(0, 50),
    }));
  }, []);

  const updateBotSettings = useCallback((patch: Partial<BotSettings>) => {
    setState((prev) => ({
      ...prev,
      botSettings: { ...prev.botSettings, ...patch },
    }));
  }, []);

  const dismissCompletionAlert = useCallback(() => {
    setCompletionAlertCampaign(null);
  }, []);

  const resetDemoData = useCallback(() => {
    setState(INITIAL_SEED_STATE);
    setCompletionAlertCampaign(null);
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(INITIAL_SEED_STATE)
      );
    } catch {
      // ignore
    }
  }, []);

  return {
    campaigns: state.campaigns,
    activeWeeklyCampaign,
    orders: state.orders,
    winners: state.winners,
    prizeStock: state.prizeStock,
    stockSummary,
    botLogs: state.botLogs,
    botSettings: state.botSettings,
    completionAlertCampaign,
    dismissCompletionAlert,
    getList100,
    getCampaignStats,
    createCampaign,
    updateCampaign,
    closeCampaign,
    reactivateCampaign,
    createOrder,
    confirmOrderPayment,
    attachReceiptToOrder,
    cancelOrder,
    addPrizeStockItem,
    updatePrizeStockItem,
    deletePrizeStockItem,
    executeDraw,
    updateWinnerDelivery,
    addBotLog,
    updateBotSettings,
    resetDemoData,
  };
}
