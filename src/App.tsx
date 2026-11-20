/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from "react";
import { BellRing, Check, Copy, ListOrdered, X } from "lucide-react";
import { ActiveView, RaffleCampaign } from "./types/raffle";
import { useRaffleStore } from "./store/useRaffleStore";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { OverviewView } from "./components/OverviewView";
import { RaffleList100View } from "./components/RaffleList100View";
import { OrdersView } from "./components/OrdersView";
import { PrizeInventoryView } from "./components/PrizeInventoryView";
import { CampaignsView } from "./components/CampaignsView";
import { CampaignModal } from "./components/CampaignModal";
import { buildWhatsAppCompletionAlertText } from "./utils/formatters";

export default function App() {
  const {
    campaigns,
    activeWeeklyCampaign,
    orders,
    prizeStock,
    stockSummary,
    botSettings,
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
    addBotLog,
    resetDemoData,
  } = useRaffleStore();

  const [activeView, setActiveView] = useState<ActiveView>("overview");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(
    () => activeWeeklyCampaign?.id ?? ""
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<RaffleCampaign | null>(
    null
  );
  const [copiedCompleteAlert, setCopiedCompleteAlert] = useState(false);

  useEffect(() => {
    setSelectedCampaignId((prev) => {
      if (activeWeeklyCampaign) {
        const current = campaigns.find((c) => c.id === prev);
        if (!current) return activeWeeklyCampaign.id;
        return prev;
      }
      return prev;
    });
  }, [activeWeeklyCampaign, campaigns]);

  useEffect(() => {
    let cancelled = false;
    const pollWebhookEvents = async () => {
      if (!activeWeeklyCampaign || activeWeeklyCampaign.status !== "ativa") {
        return;
      }
      try {
        const res = await fetch("/api/bot/events");
        if (!res.ok) return;
        const data = await res.json();
        if (!data.ok || !Array.isArray(data.events) || cancelled) return;

        for (const ev of data.events) {
          if (
            ev.aiResult &&
            Array.isArray(ev.aiResult.numeros) &&
            ev.aiResult.numeros.length > 0
          ) {
            const orderRes = createOrder({
              campaignId: activeWeeklyCampaign.id,
              buyerName: ev.aiResult.nomeParticipante || ev.senderName,
              buyerPhone: ev.senderPhone || "(11) 90000-0000",
              quotas: ev.aiResult.numeros,
              paymentMethod: "pix",
              markAsPaid:
                Boolean(ev.aiResult.pagamentoValido) ||
                botSettings.autoConfirmWithAi,
              receipt: ev.receiptBase64
                ? {
                    imageUrl: ev.receiptBase64,
                    fileName: ev.receiptFileName || "comprovante-whatsapp.png",
                    txId: ev.aiResult.txId,
                    verifiedBy: "ai_bot",
                    summary: ev.aiResult.resumo,
                    uploadedAt: ev.receivedAt,
                  }
                : undefined,
            });

            addBotLog({
              source: "whatsapp_webhook",
              senderName: ev.senderName,
              senderPhone: ev.senderPhone,
              rawMessage: ev.messageText,
              extractedName: ev.aiResult.nomeParticipante,
              extractedNumbers: ev.aiResult.numeros,
              detectedAmount: ev.aiResult.valorPago,
              txId: ev.aiResult.txId,
              status: orderRes.ok ? "confirmado" : "conflito",
              summary: orderRes.ok
                ? ev.aiResult.resumo
                : orderRes.error || "Conflito na Lista 1–100",
            });
          }

          await fetch(`/api/bot/events/${ev.id}/ack`, { method: "POST" });
        }
      } catch {
        // Ignore transient poll errors
      }
    };

    const timer = window.setInterval(pollWebhookEvents, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    activeWeeklyCampaign,
    botSettings.autoConfirmWithAi,
    createOrder,
    addBotLog,
  ]);

  const pendingOrdersCount = useMemo(
    () =>
      activeWeeklyCampaign
        ? orders.filter(
            (o) =>
              o.campaignId === activeWeeklyCampaign.id &&
              o.status === "pendente"
          ).length
        : 0,
    [orders, activeWeeklyCampaign]
  );

  const activeStats = useMemo(
    () =>
      activeWeeklyCampaign
        ? getCampaignStats(activeWeeklyCampaign.id)
        : { paidCount: 0, isComplete: false },
    [activeWeeklyCampaign, getCampaignStats]
  );

  const listCampaign = useMemo(
    () =>
      campaigns.find((c) => c.id === selectedCampaignId) ??
      activeWeeklyCampaign ??
      null,
    [campaigns, selectedCampaignId, activeWeeklyCampaign]
  );

  const handleOpenNewCampaign = () => {
    setEditingCampaign(null);
    setIsCampaignModalOpen(true);
  };

  const handleEditCampaign = (campaign: RaffleCampaign) => {
    setEditingCampaign(campaign);
    setIsCampaignModalOpen(true);
  };

  const handleSaveCampaign = (data: Parameters<typeof createCampaign>[0]) => {
    if (editingCampaign) {
      updateCampaign(editingCampaign.id, data);
    } else {
      const created = createCampaign(data);
      setSelectedCampaignId(created.id);
      setActiveView("list100");
    }
  };

  const handleCopyCompletionAlert = async () => {
    const target = completionAlertCampaign || activeWeeklyCampaign;
    if (!target) return;
    try {
      await navigator.clipboard.writeText(
        buildWhatsAppCompletionAlertText(target)
      );
      setCopiedCompleteAlert(true);
      setTimeout(() => setCopiedCompleteAlert(false), 2200);
    } catch {
      // ignore
    }
  };

  const showCompleteBanner =
    Boolean(completionAlertCampaign) ||
    (Boolean(activeWeeklyCampaign) && activeStats.isComplete);

  const completeBannerCampaign =
    completionAlertCampaign || activeWeeklyCampaign;

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex selection:bg-[#FF7900] selection:text-black">
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        pendingOrdersCount={pendingOrdersCount}
        activeConfirmedCount={activeStats.paidCount}
        onResetDemo={resetDemoData}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeCampaign={activeWeeklyCampaign}
          orders={orders}
          prizeStock={prizeStock}
          onNavigate={setActiveView}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenNewCampaign={handleOpenNewCampaign}
        />

        <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6 space-y-5">
          {/* 100/100 Completion Alert Banner */}
          {showCompleteBanner && completeBannerCampaign && (
            <div className="rounded-[20px] bg-[#181206] border border-[#FFB000]/60 px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#FFB000] text-black flex items-center justify-center shrink-0">
                  <BellRing className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#FFB000]">
                    Rifa Completa · 100/100 Confirmados
                  </div>
                  <p className="text-xs text-zinc-300 mt-0.5">
                    Todos os 100 números de{" "}
                    <strong className="text-white">
                      {completeBannerCampaign.title}
                    </strong>{" "}
                    foram preenchidos e confirmados.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyCompletionAlert}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#121216] border border-[#2A2A32] text-xs font-medium text-white hover:border-[#FFB000] transition-colors whitespace-nowrap"
                >
                  {copiedCompleteAlert ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Aviso Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#FFB000]" />
                      <span>Copiar Aviso p/ Grupo</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedCampaignId(completeBannerCampaign.id);
                    setActiveView("list100");
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#FFB000] text-black text-xs font-semibold hover:bg-[#FF7900] transition-colors whitespace-nowrap"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                  <span>Ver Lista 1–100</span>
                </button>

                {completionAlertCampaign && (
                  <button
                    type="button"
                    onClick={dismissCompletionAlert}
                    aria-label="Dispensar alerta"
                    className="p-1.5 rounded-full text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {activeView === "overview" && (
            <OverviewView
              activeCampaign={activeWeeklyCampaign}
              campaigns={campaigns}
              orders={orders}
              prizeStock={prizeStock}
              stockSummary={stockSummary}
              getList100={getList100}
              getCampaignStats={getCampaignStats}
              onNavigate={setActiveView}
              onSelectCampaign={(id) => setSelectedCampaignId(id)}
              onCreateNewRaffle={handleOpenNewCampaign}
            />
          )}

          {activeView === "list100" && (
            <RaffleList100View
              campaign={listCampaign}
              campaigns={campaigns}
              onSelectCampaign={setSelectedCampaignId}
              getList100={getList100}
              getCampaignStats={getCampaignStats}
              onCreateOrder={createOrder}
              onConfirmPayment={confirmOrderPayment}
              onAttachReceipt={attachReceiptToOrder}
              onCancelOrder={cancelOrder}
            />
          )}

          {activeView === "orders" && (
            <OrdersView
              campaigns={campaigns}
              orders={orders}
              onConfirmPayment={confirmOrderPayment}
              onAttachReceipt={attachReceiptToOrder}
              onCancelOrder={cancelOrder}
            />
          )}

          {activeView === "inventory" && (
            <PrizeInventoryView
              prizeStock={prizeStock}
              stockSummary={stockSummary}
              onAddPrize={addPrizeStockItem}
              onUpdatePrize={updatePrizeStockItem}
              onDeletePrize={deletePrizeStockItem}
            />
          )}

          {activeView === "campaigns" && (
            <CampaignsView
              campaigns={campaigns}
              getCampaignStats={getCampaignStats}
              onNewCampaign={handleOpenNewCampaign}
              onEditCampaign={handleEditCampaign}
              onCloseCampaign={(id) => {
                closeCampaign(id);
                setSelectedCampaignId((prev) => (prev === id ? "" : prev));
              }}
              onReactivateCampaign={(id) => {
                reactivateCampaign(id);
                setSelectedCampaignId(id);
              }}
              onOpenList100={(id) => {
                setSelectedCampaignId(id);
                setActiveView("list100");
              }}
            />
          )}
        </main>
      </div>

      <CampaignModal
        isOpen={isCampaignModalOpen}
        hasActiveWeeklyRaffle={Boolean(activeWeeklyCampaign?.status === "ativa")}
        defaultGroupName={botSettings.groupName}
        prizeStock={prizeStock}
        editingCampaign={editingCampaign}
        onClose={() => setIsCampaignModalOpen(false)}
        onSave={handleSaveCampaign}
      />
    </div>
  );
}
