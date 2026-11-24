import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  BotSettings,
  ConfirmationMode,
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
  ReceiptRecord,
  StoreState,
} from "../types/raffle";

const LEGACY_STORAGE_KEYS = [
  "hold_premios_rifas_state_v1",
  "hold_bar_rifas_state_v3",
];

export type AuthStatus =
  | "loading"
  | "unconfigured"
  | "unauthenticated"
  | "authenticated";

const EMPTY_STATE: StoreState = {
  campaigns: [],
  orders: [],
  receipts: [],
  winners: [],
  prizeStock: [],
  botLogs: [],
  botSettings: {
    groupName: "Hold Prêmios — Grupo VIP Oficial",
    groupJid: "",
    outboundWebhookUrl: "",
    adminPhones: [],
    autoConfirmWithAi: false,
  },
};

function readLegacyLocalBackup(): StoreState | null {
  if (typeof window === "undefined") return null;
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const sanitized =
        key === "hold_bar_rifas_state_v3"
          ? raw
              .replace(/HOLD BAR SPORTS & MUSIC/g, "HOLD PRÊMIOS")
              .replace(/Hold Bar Sports & Music/g, "Hold Prêmios")
              .replace(/HOLD BAR/g, "HOLD PRÊMIOS")
              .replace(/Hold Bar/gi, "Hold Prêmios")
          : raw;
      const parsed = JSON.parse(sanitized) as StoreState;
      if (
        parsed &&
        Array.isArray(parsed.campaigns) &&
        (parsed.campaigns.length > 0 ||
          (Array.isArray(parsed.prizeStock) && parsed.prizeStock.length > 0))
      ) {
        return parsed;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function useRaffleStore() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  // Keep accessToken strictly in memory (HttpOnly cookie is also set by server)
  const accessTokenRef = useRef<string | null>(null);

  const [state, setState] = useState<StoreState>(EMPTY_STATE);
  const [isLoadingState, setIsLoadingState] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [completionAlertCampaign, setCompletionAlertCampaign] =
    useState<RaffleCampaign | null>(null);
  const [hasLocalBackup, setHasLocalBackup] = useState<boolean>(() =>
    Boolean(readLegacyLocalBackup())
  );

  const buildHeaders = useCallback((extra?: Record<string, string>) => {
    const headers: Record<string, string> = {
      ...(extra ?? {}),
    };
    if (accessTokenRef.current) {
      headers.Authorization = `Bearer ${accessTokenRef.current}`;
    }
    return headers;
  }, []);

  const refreshState = useCallback(async () => {
    try {
      setIsLoadingState(true);
      const res = await fetch("/api/admin/state", {
        method: "GET",
        credentials: "include",
        headers: buildHeaders(),
      });
      if (res.status === 401) {
        accessTokenRef.current = null;
        setUserEmail(null);
        setAuthStatus("unauthenticated");
        return;
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setApiError(errData.message || "Falha ao carregar dados do servidor.");
        return;
      }
      const data = (await res.json()) as StoreState;
      setApiError(null);
      setState({
        campaigns: Array.isArray(data.campaigns) ? data.campaigns : [],
        orders: Array.isArray(data.orders) ? data.orders : [],
        receipts: Array.isArray(data.receipts) ? data.receipts : [],
        winners: Array.isArray(data.winners) ? data.winners : [],
        prizeStock: Array.isArray(data.prizeStock) ? data.prizeStock : [],
        botLogs: Array.isArray(data.botLogs) ? data.botLogs : [],
        botSettings: data.botSettings ?? EMPTY_STATE.botSettings,
      });
    } catch {
      setApiError("Não foi possível conectar ao servidor.");
    } finally {
      setIsLoadingState(false);
    }
  }, [buildHeaders]);

  // Initial session check
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { credentials: "include" });
        const data = await res.json();
        if (cancelled) return;
        if (!data.configured) {
          setAuthStatus("unconfigured");
          return;
        }
        if (data.authenticated && data.user) {
          setUserEmail(data.user.email || "admin");
          setAuthStatus("authenticated");
        } else {
          setAuthStatus("unauthenticated");
        }
      } catch {
        if (!cancelled) setAuthStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load initial state and poll every 5s when authenticated
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    void refreshState();
    const timer = window.setInterval(() => {
      void refreshState();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [authStatus, refreshState]);

  const login = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          return {
            ok: false,
            error: data.message || "Falha na autenticação.",
          };
        }
        accessTokenRef.current = data.accessToken || null;
        setUserEmail(data.user?.email || email);
        setAuthStatus("authenticated");
        return { ok: true };
      } catch {
        return { ok: false, error: "Erro de rede ao tentar autenticar." };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    }
    accessTokenRef.current = null;
    setUserEmail(null);
    setState(EMPTY_STATE);
    setCompletionAlertCampaign(null);
    setAuthStatus("unauthenticated");
  }, []);

  const postAdmin = useCallback(
    async (
      resource:
        | "campaigns"
        | "orders"
        | "receipts"
        | "inventory"
        | "settings"
        | "import",
      payload: Record<string, unknown>
    ): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> => {
      try {
        const res = await fetch(`/api/admin/${resource}`, {
          method: "POST",
          credentials: "include",
          headers: buildHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        });
        if (res.status === 401) {
          accessTokenRef.current = null;
          setAuthStatus("unauthenticated");
          return { ok: false, error: "Sessão expirada. Faça login novamente." };
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            ok: false,
            data,
            error:
              data.message || data.error || "Não foi possível concluir a ação.",
          };
        }
        await refreshState();
        return { ok: true, data };
      } catch {
        return { ok: false, error: "Falha de comunicação com o servidor." };
      }
    },
    [buildHeaders, refreshState]
  );

  const activeWeeklyCampaign = useMemo(
    () => state.campaigns.find((c) => c.status === "ativa") ?? null,
    [state.campaigns]
  );

  const getList100 = useCallback(
    (campaignId: string): QuotaRowInfo[] => {
      const rows: QuotaRowInfo[] = [];
      const orderByNumber = new Map<number, RaffleOrder>();

      const activeOrders = state.orders.filter(
        (o) =>
          o.campaignId === campaignId &&
          o.status !== "cancelado" &&
          o.status !== "expirado"
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
        (o) =>
          o.campaignId === campaignId &&
          o.status !== "cancelado" &&
          o.status !== "expirado"
      );

      for (const order of campaignOrders) {
        if (order.status === "pago") {
          paidCount += order.quotas.length;
          confirmedRevenue += order.totalAmount;
        } else if (order.status === "pendente" || order.status === "em_analise") {
          reservedCount += order.quotas.length;
          pendingRevenue += Math.max(
            0,
            order.totalAmount - (order.paidAmount || 0)
          );
          if (order.paidAmount && order.paidAmount > 0) {
            confirmedRevenue += order.paidAmount;
          }
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

  const receipts = useMemo<ReceiptRecord[]>(
    () => state.receipts ?? [],
    [state.receipts]
  );

  const pendingReceiptsCount = useMemo(
    () =>
      receipts.filter((r) =>
        ["em_analise", "revisao", "orfao", "reenvio"].includes(r.status)
      ).length,
    [receipts]
  );

  const needsAdminOrdersCount = useMemo(
    () => state.orders.filter((o) => o.needsAdmin).length,
    [state.orders]
  );

  // Trigger visual/browser banner when server reports 100/100 completed
  const prevCompleteRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeWeeklyCampaign || activeWeeklyCampaign.status !== "ativa") return;
    const stats = getCampaignStats(activeWeeklyCampaign.id);
    if (
      stats.paidCount >= 100 &&
      prevCompleteRef.current !== activeWeeklyCampaign.id
    ) {
      prevCompleteRef.current = activeWeeklyCampaign.id;
      setCompletionAlertCampaign(activeWeeklyCampaign);
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification("Rifa Completa (100/100) — HOLD PRÊMIOS", {
          body: `A rifa "${activeWeeklyCampaign.title}" atingiu 100 números confirmados!`,
          icon: "/assets/images/logo_hold_ouro.webp",
        });
      }
    }
  }, [activeWeeklyCampaign, getCampaignStats]);

  const createCampaign = useCallback(
    async (input: {
      title: string;
      weekLabel: string;
      whatsappGroupName: string;
      image: string;
      prizes: RafflePrize[];
      ticketPrice: number;
      drawMethod: DrawMethod;
      scheduledDrawDate: string;
      pixKey?: string;
      pixBeneficiary?: string;
      reservationMinutes?: number;
      confirmationMode?: ConfirmationMode;
    }): Promise<RaffleCampaign | null> => {
      const res = await postAdmin("campaigns", {
        action: "create",
        ...input,
      });
      setCompletionAlertCampaign(null);
      return (res.data?.campaign as RaffleCampaign) ?? null;
    },
    [postAdmin]
  );

  const updateCampaign = useCallback(
    async (id: string, patch: Partial<RaffleCampaign>) => {
      await postAdmin("campaigns", { action: "update", id, ...patch });
    },
    [postAdmin]
  );

  const closeCampaign = useCallback(
    async (id: string) => {
      await postAdmin("campaigns", { action: "close", id });
      setCompletionAlertCampaign((prev) => (prev?.id === id ? null : prev));
    },
    [postAdmin]
  );

  const reactivateCampaign = useCallback(
    async (id: string) => {
      await postAdmin("campaigns", { action: "reactivate", id });
      setCompletionAlertCampaign(null);
    },
    [postAdmin]
  );

  const createOrder = useCallback(
    async (input: {
      campaignId: string;
      buyerName: string;
      buyerPhone: string;
      buyerNotes?: string;
      quotas: number[];
      paymentMethod: PaymentMethod;
      markAsPaid: boolean;
      receipt?: ReceiptAttachment;
    }): Promise<{ ok: boolean; order?: RaffleOrder; error?: string }> => {
      const res = await postAdmin("orders", {
        action: "create",
        campaignId: input.campaignId,
        buyerName: input.buyerName,
        buyerPhone: input.buyerPhone,
        quotas: input.quotas,
        paymentMethod: input.paymentMethod,
        markAsPaid: input.markAsPaid,
        receiptBase64: input.receipt?.imageUrl,
        receiptFileName: input.receipt?.fileName,
      });
      if (!res.ok) {
        return { ok: false, error: res.error };
      }
      return { ok: true, order: res.data?.order as RaffleOrder | undefined };
    },
    [postAdmin]
  );

  const confirmOrderPayment = useCallback(
    async (orderId: string, receipt?: ReceiptAttachment) => {
      if (receipt?.imageUrl) {
        await postAdmin("orders", {
          action: "attach_receipt",
          orderId,
          receiptBase64: receipt.imageUrl,
          fileName: receipt.fileName,
          markAsPaid: true,
        });
      } else {
        await postAdmin("orders", {
          action: "confirm_manual",
          orderId,
        });
      }
    },
    [postAdmin]
  );

  const revertOrderPayment = useCallback(
    async (orderId: string) => {
      await postAdmin("orders", { action: "revert", orderId });
    },
    [postAdmin]
  );

  const attachReceiptToOrder = useCallback(
    async (orderId: string, receipt: ReceiptAttachment, markAsPaid = true) => {
      if (!receipt.imageUrl) return;
      await postAdmin("orders", {
        action: "attach_receipt",
        orderId,
        receiptBase64: receipt.imageUrl,
        fileName: receipt.fileName,
        markAsPaid,
      });
    },
    [postAdmin]
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      await postAdmin("orders", { action: "cancel", orderId });
    },
    [postAdmin]
  );

  const approveReceipt = useCallback(
    async (receiptId: string, amount?: number) => {
      return await postAdmin("receipts", {
        action: "approve",
        receiptId,
        amount,
      });
    },
    [postAdmin]
  );

  const rejectReceipt = useCallback(
    async (receiptId: string, reason?: string) => {
      return await postAdmin("receipts", {
        action: "reject",
        receiptId,
        reason,
      });
    },
    [postAdmin]
  );

  const linkReceiptToOrder = useCallback(
    async (receiptId: string, orderId: string) => {
      return await postAdmin("receipts", {
        action: "link",
        receiptId,
        orderId,
      });
    },
    [postAdmin]
  );

  const addPrizeStockItem = useCallback(
    async (input: {
      name: string;
      category: PrizeCategory;
      image: string;
      investedValue: number;
      quantity: number;
      status: PrizeStockStatus;
      supplier?: string;
      notes?: string;
    }) => {
      await postAdmin("inventory", { action: "add", ...input });
    },
    [postAdmin]
  );

  const updatePrizeStockItem = useCallback(
    async (id: string, patch: Partial<PrizeStockItem>) => {
      await postAdmin("inventory", { action: "update", id, ...patch });
    },
    [postAdmin]
  );

  const deletePrizeStockItem = useCallback(
    async (id: string) => {
      await postAdmin("inventory", { action: "delete", id });
    },
    [postAdmin]
  );

  const updateBotSettings = useCallback(
    async (
      patch: Partial<BotSettings> & {
        activeCampaignId?: string;
        pixKey?: string;
        pixBeneficiary?: string;
        reservationMinutes?: number;
        confirmationMode?: ConfirmationMode;
      }
    ) => {
      return await postAdmin("settings", patch);
    },
    [postAdmin]
  );

  const importLocalData = useCallback(async () => {
    const backup = readLegacyLocalBackup();
    if (!backup) {
      return { ok: false, error: "Nenhum dado antigo encontrado no navegador." };
    }
    const res = await postAdmin("import", { state: backup });
    if (res.ok) {
      try {
        for (const k of LEGACY_STORAGE_KEYS) {
          window.localStorage.removeItem(k);
        }
      } catch {
        // ignore
      }
      setHasLocalBackup(false);
    }
    return res;
  }, [postAdmin]);

  const dismissCompletionAlert = useCallback(() => {
    setCompletionAlertCampaign(null);
  }, []);

  return {
    authStatus,
    userEmail,
    login,
    logout,
    isLoadingState,
    apiError,
    refreshState,
    campaigns: state.campaigns,
    activeWeeklyCampaign,
    orders: state.orders,
    receipts,
    pendingReceiptsCount,
    needsAdminOrdersCount,
    winners: state.winners,
    prizeStock: state.prizeStock,
    stockSummary,
    botLogs: state.botLogs,
    botSettings: state.botSettings,
    completionAlertCampaign,
    dismissCompletionAlert,
    hasLocalBackup,
    importLocalData,
    getList100,
    getCampaignStats,
    createCampaign,
    updateCampaign,
    closeCampaign,
    reactivateCampaign,
    createOrder,
    confirmOrderPayment,
    revertOrderPayment,
    attachReceiptToOrder,
    cancelOrder,
    approveReceipt,
    rejectReceipt,
    linkReceiptToOrder,
    addPrizeStockItem,
    updatePrizeStockItem,
    deletePrizeStockItem,
    updateBotSettings,
  };
}
