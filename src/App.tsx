/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from "react";
import {
  AlertTriangle,
  BellRing,
  Check,
  Copy,
  DatabaseBackup,
  ListOrdered,
  X,
} from "lucide-react";
import { ActiveView, RaffleCampaign } from "./types/raffle";
import { useRaffleStore } from "./store/useRaffleStore";
import { LoginView } from "./components/LoginView";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { OverviewView } from "./components/OverviewView";
import { RaffleList100View } from "./components/RaffleList100View";
import { OrdersView } from "./components/OrdersView";
import { ReceiptsView } from "./components/ReceiptsView";
import { PrizeInventoryView } from "./components/PrizeInventoryView";
import { CampaignsView } from "./components/CampaignsView";
import { BotSettingsView } from "./components/BotSettingsView";
import { CampaignModal } from "./components/CampaignModal";
import { buildWhatsAppCompletionAlertText } from "./utils/formatters";

export default function App() {
  const {
    authStatus,
    userEmail,
    login,
    logout,
    apiError,
    campaigns,
    activeWeeklyCampaign,
    orders,
    receipts,
    pendingReceiptsCount,
    needsAdminOrdersCount,
    prizeStock,
    stockSummary,
    botSettings,
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
  const [importingBackup, setImportingBackup] = useState(false);

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

  const pendingOrdersCount = useMemo(
    () =>
      activeWeeklyCampaign
        ? orders.filter(
            (o) =>
              o.campaignId === activeWeeklyCampaign.id &&
              (o.status === "pendente" || o.status === "em_analise")
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

  if (authStatus !== "authenticated") {
    return <LoginView authStatus={authStatus} onLogin={login} />;
  }

  const handleOpenNewCampaign = () => {
    setEditingCampaign(null);
    setIsCampaignModalOpen(true);
  };

  const handleEditCampaign = (campaign: RaffleCampaign) => {
    setEditingCampaign(campaign);
    setIsCampaignModalOpen(true);
  };

  const handleSaveCampaign = async (
    data: Parameters<typeof createCampaign>[0]
  ) => {
    if (editingCampaign) {
      await updateCampaign(editingCampaign.id, data);
    } else {
      const created = await createCampaign(data);
      if (created) {
        setSelectedCampaignId(created.id);
        setActiveView("list100");
      }
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

  const handleQuickImportLocal = async () => {
    setImportingBackup(true);
    await importLocalData();
    setImportingBackup(false);
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
        pendingReceiptsCount={pendingReceiptsCount}
        activeConfirmedCount={activeStats.paidCount}
        userEmail={userEmail}
        onLogout={logout}
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
          {apiError && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/35 px-4 py-3 text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{apiError}</span>
            </div>
          )}

          {hasLocalBackup && campaigns.length === 0 && (
            <div className="rounded-[20px] bg-[#181206] border border-[#FFB000]/50 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-zinc-200">
                <strong className="text-[#FFB000]">
                  Dados locais detectados neste navegador.
                </strong>{" "}
                Deseja importar suas rifas, pedidos e estoque salvos
                anteriormente para o Supabase?
              </div>
              <button
                type="button"
                disabled={importingBackup}
                onClick={handleQuickImportLocal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FFB000] hover:bg-[#FF7900] text-black text-xs font-semibold shrink-0 disabled:opacity-50"
              >
                <DatabaseBackup className="w-3.5 h-3.5" />
                <span>
                  {importingBackup
                    ? "Importando..."
                    : "Importar dados do navegador"}
                </span>
              </button>
            </div>
          )}

          {needsAdminOrdersCount > 0 && activeView !== "receipts" && (
            <div className="rounded-[20px] bg-[#121216] border border-[#FF7900]/45 px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-zinc-300">
                Existem{" "}
                <strong className="text-[#FFB000]">
                  {needsAdminOrdersCount} pedido(s)
                </strong>{" "}
                sinalizados para revisão (comprovante em análise, pagamento
                tardio ou excedente).
              </div>
              <button
                type="button"
                onClick={() => setActiveView("receipts")}
                className="px-4 py-1.5 rounded-full bg-[#18181F] hover:bg-[#FF7900] text-white hover:text-black border border-[#2A2A34] text-xs font-semibold transition-colors self-start sm:self-auto"
              >
                Abrir Comprovantes
              </button>
            </div>
          )}

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
              onRevertPayment={revertOrderPayment}
              onAttachReceipt={attachReceiptToOrder}
              onCancelOrder={cancelOrder}
            />
          )}

          {activeView === "orders" && (
            <OrdersView
              campaigns={campaigns}
              orders={orders}
              onConfirmPayment={confirmOrderPayment}
              onRevertPayment={revertOrderPayment}
              onAttachReceipt={attachReceiptToOrder}
              onCancelOrder={cancelOrder}
            />
          )}

          {activeView === "receipts" && (
            <ReceiptsView
              receipts={receipts}
              orders={orders}
              onApproveReceipt={approveReceipt}
              onRejectReceipt={rejectReceipt}
              onLinkReceiptToOrder={linkReceiptToOrder}
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
                void closeCampaign(id);
                setSelectedCampaignId((prev) => (prev === id ? "" : prev));
              }}
              onReactivateCampaign={(id) => {
                void reactivateCampaign(id);
                setSelectedCampaignId(id);
              }}
              onOpenList100={(id) => {
                setSelectedCampaignId(id);
                setActiveView("list100");
              }}
            />
          )}

          {activeView === "settings" && (
            <BotSettingsView
              activeCampaign={activeWeeklyCampaign}
              botSettings={botSettings}
              hasLocalBackup={hasLocalBackup}
              onSaveSettings={updateBotSettings}
              onImportLocalData={importLocalData}
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
