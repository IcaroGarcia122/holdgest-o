import React, { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Calendar,
  Check,
  FileCheck2,
  ListOrdered,
  Trophy,
  Users,
} from "lucide-react";
import {
  ActiveView,
  PrizeStockItem,
  QuotaRowInfo,
  RaffleCampaign,
  RaffleOrder,
} from "../types/raffle";
import { formatCurrency, formatQuotaNumber } from "../utils/formatters";
import { ReceiptModal } from "./ReceiptModal";

interface OverviewViewProps {
  activeCampaign: RaffleCampaign | null;
  campaigns: RaffleCampaign[];
  orders: RaffleOrder[];
  prizeStock: PrizeStockItem[];
  stockSummary: {
    totalItems: number;
    totalUnits: number;
    availableUnits: number;
    totalInvested: number;
  };
  getList100: (campaignId: string) => QuotaRowInfo[];
  getCampaignStats: (campaignId: string) => {
    paidCount: number;
    reservedCount: number;
    availableCount: number;
    confirmedRevenue: number;
    pendingRevenue: number;
    potentialRevenue: number;
    investedPrizesValue: number;
    currentNetResult: number;
    progressPercent: number;
    isComplete: boolean;
  };
  onNavigate: (view: ActiveView) => void;
  onSelectCampaign: (id: string) => void;
  onCreateNewRaffle: () => void;
}

const DONUT_COLORS = ["#FF7900", "#FFB000", "#3B82F6", "#10B981", "#F43F5E"];

export const OverviewView: React.FC<OverviewViewProps> = ({
  activeCampaign,
  campaigns,
  orders,
  prizeStock,
  stockSummary,
  getList100,
  getCampaignStats,
  onNavigate,
  onSelectCampaign,
  onCreateNewRaffle,
}) => {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(
    activeCampaign?.id ?? campaigns[0]?.id ?? ""
  );
  const [hoveredBarIdx, setHoveredBarIdx] = useState<number | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<RaffleOrder | null>(null);

  const displayedCampaign = useMemo(
    () =>
      campaigns.find((c) => c.id === selectedCampaignId) ??
      activeCampaign ??
      campaigns[0] ??
      null,
    [campaigns, selectedCampaignId, activeCampaign]
  );

  const stats = useMemo(
    () =>
      displayedCampaign
        ? getCampaignStats(displayedCampaign.id)
        : {
            paidCount: 0,
            reservedCount: 0,
            availableCount: 100,
            confirmedRevenue: 0,
            pendingRevenue: 0,
            potentialRevenue: 0,
            investedPrizesValue: 0,
            currentNetResult: 0,
            progressPercent: 0,
            isComplete: false,
          },
    [displayedCampaign, getCampaignStats]
  );

  const listRows = useMemo(
    () => (displayedCampaign ? getList100(displayedCampaign.id) : []),
    [displayedCampaign, getList100]
  );

  const campaignOrders = useMemo(
    () =>
      displayedCampaign
        ? orders.filter(
            (o) =>
              o.campaignId === displayedCampaign.id && o.status !== "cancelado"
          )
        : [],
    [displayedCampaign, orders]
  );

  const pendingOrdersCount = useMemo(
    () => campaignOrders.filter((o) => o.status === "pendente").length,
    [campaignOrders]
  );

  const uniqueBuyersCount = useMemo(
    () =>
      new Set(campaignOrders.map((o) => o.buyerName.trim().toLowerCase())).size,
    [campaignOrders]
  );

  const recentOrders = useMemo(
    () =>
      [...orders]
        .filter((o) => o.status !== "cancelado")
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 5),
    [orders]
  );

  const campaignLookup = useMemo(
    () => new Map(campaigns.map((c) => [c.id, c])),
    [campaigns]
  );

  const breakEvenNumbers = useMemo(() => {
    if (!displayedCampaign || displayedCampaign.ticketPrice <= 0) return 0;
    return Math.ceil(
      stats.investedPrizesValue / displayedCampaign.ticketPrice
    );
  }, [displayedCampaign, stats.investedPrizesValue]);

  // Daily revenue bars computed from orders of the displayed raffle (padded to 7 days for visual cadence)
  const revenueBars = useMemo(() => {
    const dayMap = new Map<string, number>();
    const sorted = [...campaignOrders].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    for (const o of sorted) {
      const d = new Date(o.createdAt);
      const label = `${String(d.getDate()).padStart(2, "0")}/${String(
        d.getMonth() + 1
      ).padStart(2, "0")}`;
      dayMap.set(label, (dayMap.get(label) ?? 0) + o.totalAmount);
    }

    // Also include individual order batches or pad up to 7 points for a balanced bar chart
    const entries = Array.from(dayMap.entries()).map(([label, value]) => ({
      label,
      value,
    }));

    if (entries.length < 7 && sorted.length > 0) {
      // Break down individual orders by time slot when orders fall on few calendar days
      return sorted.slice(0, 8).map((o) => {
        const d = new Date(o.createdAt);
        const hm = `${String(d.getHours()).padStart(2, "0")}:${String(
          d.getMinutes()
        ).padStart(2, "0")}`;
        return {
          label: `${o.buyerName.split(" ")[0]} (${hm})`,
          shortLabel: `${String(d.getDate()).padStart(2, "0")}/${String(
            d.getMonth() + 1
          ).padStart(2, "0")}`,
          value: o.totalAmount,
        };
      });
    }

    return entries.map((e) => ({
      label: e.label,
      shortLabel: e.label,
      value: e.value,
    }));
  }, [campaignOrders]);

  const maxBarVal = useMemo(() => {
    const rawMax = Math.max(1200, ...revenueBars.map((b) => b.value));
    return Math.ceil(rawMax / 500) * 500;
  }, [revenueBars]);

  const peakBarIdx = useMemo(() => {
    if (revenueBars.length === 0) return -1;
    let bestIdx = 0;
    revenueBars.forEach((b, i) => {
      if (b.value >= revenueBars[bestIdx].value) bestIdx = i;
    });
    return bestIdx;
  }, [revenueBars]);

  // Stock investment grouped by category for the Donut Chart
  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of prizeStock) {
      const val = item.investedValue * item.quantity;
      if (val > 0) {
        totals.set(item.category, (totals.get(item.category) ?? 0) + val);
      }
    }
    const list = Array.from(totals.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const sum = list.reduce((acc, c) => acc + c.value, 0) || 1;
    return list.map((c, idx) => ({
      ...c,
      percent: Math.round((c.value / sum) * 100),
      color: DONUT_COLORS[idx % DONUT_COLORS.length],
    }));
  }, [prizeStock]);

  const donutSegments = useMemo(() => {
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    let offsetAcc = 0;
    return categoryBreakdown.map((cat) => {
      const length = (cat.percent / 100) * circumference;
      const seg = {
        ...cat,
        dasharray: `${Math.max(0, length - 4)} ${circumference}`,
        dashoffset: -offsetAcc,
      };
      offsetAcc += length;
      return seg;
    });
  }, [categoryBreakdown]);

  return (
    <div className="space-y-5">
      {/* Greeting & Period Selector Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-white">
            Painel Hold Bar
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Resumo da rifa semanal, números comprados na Lista 1–100 e estoque
            de prêmios.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <select
            value={displayedCampaign?.id ?? ""}
            onChange={(e) => {
              setSelectedCampaignId(e.target.value);
              onSelectCampaign(e.target.value);
            }}
            className="px-4 py-2 rounded-full bg-[#121216] border border-[#22222B] text-xs font-medium text-white focus:outline-none focus:border-[#FF7900]"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.status === "ativa" ? "Rifa Atual" : "Encerrada"}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => onNavigate("campaigns")}
            title="Histórico semanal de rifas"
            aria-label="Histórico semanal de rifas"
            className="w-9 h-9 rounded-full bg-[#121216] border border-[#22222B] hover:border-[#FF7900] text-zinc-300 hover:text-white flex items-center justify-center transition-colors shrink-0"
          >
            <Calendar className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!displayedCampaign ? (
        <section className="rounded-[22px] bg-[#121216] border border-[#1E1E26] p-12 text-center">
          <Trophy className="w-8 h-8 text-[#FF7900] mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white">
            Nenhuma rifa semanal ativa
          </h2>
          <button
            type="button"
            onClick={onCreateNewRaffle}
            className="mt-4 px-5 py-2.5 rounded-full bg-[#FF7900] hover:bg-[#FFB000] text-black text-xs font-semibold transition-colors"
          >
            Criar Rifa da Semana
          </button>
        </section>
      ) : (
        <>
          {/* BENTO ROW 1: 2x2 KPI Cards (6 cols) + Revenue Bar Chart (6 cols) */}
          <section className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
            {/* Left 6 cols: 2x2 Cards */}
            <div className="xl:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Featured High-Contrast White Card */}
              <div className="rounded-[22px] bg-white text-zinc-950 p-5 flex flex-col justify-between min-h-[162px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-500">
                    Arrecadação Atual
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigate("orders")}
                    aria-label="Ver pedidos e Pix"
                    className="w-9 h-9 rounded-full bg-[#FF7900] hover:bg-[#FFB000] text-black flex items-center justify-center transition-colors shrink-0"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 my-2">
                  <span className="font-mono-tabular font-bold text-2xl sm:text-[26px] tracking-tight text-zinc-950">
                    {formatCurrency(stats.confirmedRevenue)}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 font-mono-tabular text-[11px] font-semibold">
                    {stats.progressPercent}%
                  </span>
                </div>

                <div className="text-xs text-zinc-500">
                  Meta 100/100:{" "}
                  <span className="font-mono-tabular font-semibold text-zinc-800">
                    {formatCurrency(stats.potentialRevenue)}
                  </span>
                </div>
              </div>

              {/* Card 2: Invested Prizes */}
              <div className="rounded-[22px] bg-[#121216] border border-[#1E1E26] p-5 flex flex-col justify-between min-h-[162px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-400">
                    Prêmios Investidos
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigate("inventory")}
                    aria-label="Gerenciar estoque de prêmios"
                    className="w-9 h-9 rounded-full bg-[#1C1C23] hover:bg-[#FF7900] text-zinc-300 hover:text-black flex items-center justify-center transition-colors shrink-0"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 my-2">
                  <span className="font-mono-tabular font-bold text-2xl sm:text-[26px] tracking-tight text-white">
                    {formatCurrency(stats.investedPrizesValue)}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[#FFB000]/15 text-[#FFB000] font-mono-tabular text-[11px] font-semibold">
                    10 prêmios
                  </span>
                </div>

                <div className="text-xs text-zinc-500">
                  Estoque total:{" "}
                  <span className="font-mono-tabular text-zinc-300">
                    {formatCurrency(stockSummary.totalInvested)}
                  </span>
                </div>
              </div>

              {/* Card 3: Numbers Purchased */}
              <div className="rounded-[22px] bg-[#121216] border border-[#1E1E26] p-5 flex flex-col justify-between min-h-[162px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-400">
                    Números Comprados
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigate("list100")}
                    aria-label="Abrir Lista 1–100"
                    className="w-9 h-9 rounded-full bg-[#1C1C23] hover:bg-[#FF7900] text-zinc-300 hover:text-black flex items-center justify-center transition-colors shrink-0"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 my-2">
                  <span className="font-mono-tabular font-bold text-2xl sm:text-[26px] tracking-tight text-white">
                    {stats.paidCount}
                    <span className="text-base text-zinc-500 font-medium">
                      /100
                    </span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono-tabular text-[11px] font-semibold">
                    {stats.availableCount} livres
                  </span>
                </div>

                <div className="text-xs text-zinc-500">
                  {stats.reservedCount} números reservados no Pix
                </div>
              </div>

              {/* Card 4: Net Balance */}
              <div className="rounded-[22px] bg-[#121216] border border-[#1E1E26] p-5 flex flex-col justify-between min-h-[162px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-400">
                    Saldo Líquido
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigate("campaigns")}
                    aria-label="Ver histórico de rifas"
                    className="w-9 h-9 rounded-full bg-[#1C1C23] hover:bg-[#FF7900] text-zinc-300 hover:text-black flex items-center justify-center transition-colors shrink-0"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 my-2">
                  <span className="font-mono-tabular font-bold text-2xl sm:text-[26px] tracking-tight text-white">
                    {formatCurrency(stats.currentNetResult)}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full font-mono-tabular text-[11px] font-semibold ${
                      stats.currentNetResult >= 0
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-[#FF7900]/15 text-[#FFB000]"
                    }`}
                  >
                    {breakEvenNumbers} nº eq.
                  </span>
                </div>

                <div className="text-xs text-zinc-500">
                  Lucro 100%:{" "}
                  <span className="font-mono-tabular text-emerald-400">
                    {formatCurrency(
                      stats.potentialRevenue - stats.investedPrizesValue
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Right 6 cols: Tall Bar Chart Card */}
            <div className="xl:col-span-6 rounded-[22px] bg-[#121216] border border-[#1E1E26] p-6 flex flex-col justify-between min-h-[340px]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Entradas da Rifa
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {displayedCampaign.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate("list100")}
                  aria-label="Abrir Lista 1–100"
                  className="w-10 h-10 rounded-full bg-white hover:bg-[#FF7900] text-black flex items-center justify-center transition-colors shrink-0"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>

              {/* Vertical Rounded-Top Bars */}
              <div className="mt-6 flex-1 flex items-end gap-4">
                {/* Y-axis scale */}
                <div className="hidden sm:flex flex-col justify-between h-[210px] pb-6 text-[10px] font-mono-tabular text-zinc-500 shrink-0 text-right w-14">
                  <span>{formatCurrency(maxBarVal)}</span>
                  <span>{formatCurrency(Math.round(maxBarVal * 0.66))}</span>
                  <span>{formatCurrency(Math.round(maxBarVal * 0.33))}</span>
                  <span>R$ 0</span>
                </div>

                {/* Plot */}
                <div className="flex-1 h-[210px] flex flex-col justify-end">
                  {revenueBars.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
                      Nenhuma entrada registrada nesta rifa ainda.
                    </div>
                  ) : (
                    <div className="relative flex-1 flex items-end justify-between gap-2 sm:gap-3 border-b border-[#1E1E26] pb-1">
                      {revenueBars.map((bar, idx) => {
                        const heightPct = Math.max(
                          14,
                          Math.round((bar.value / maxBarVal) * 100)
                        );
                        const isActive =
                          hoveredBarIdx === idx ||
                          (hoveredBarIdx === null && idx === peakBarIdx);

                        return (
                          <div
                            key={`${bar.label}-${idx}`}
                            onMouseEnter={() => setHoveredBarIdx(idx)}
                            onMouseLeave={() => setHoveredBarIdx(null)}
                            className="relative flex-1 h-full flex flex-col justify-end items-center group cursor-pointer"
                          >
                            {isActive && (
                              <div className="mb-1.5 px-2 py-0.5 rounded-md bg-[#070709] border border-[#2C2C36] text-[10px] font-mono-tabular font-semibold text-white whitespace-nowrap z-10">
                                {formatCurrency(bar.value)}
                              </div>
                            )}
                            <div
                              className={`w-full max-w-[44px] rounded-t-[10px] transition-colors ${
                                isActive ? "bg-[#FFB000]" : "bg-[#FF7900]"
                              }`}
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* X-axis Labels */}
                  {revenueBars.length > 0 && (
                    <div className="flex items-center justify-between gap-2 sm:gap-3 pt-2">
                      {revenueBars.map((bar, idx) => (
                        <div
                          key={`lbl-${idx}`}
                          className="flex-1 text-center text-[10px] font-mono-tabular text-zinc-500 truncate"
                        >
                          {bar.shortLabel}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* BENTO ROW 2: Split Status Card (6 cols) + Category Donut Card (6 cols) */}
          <section className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
            {/* Left 6 cols: Split Card with Center White Arrow Connector */}
            <div className="xl:col-span-6 rounded-[22px] bg-[#121216] border border-[#1E1E26] relative grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#1E1E26]">
              {/* Center Floating White Action Button */}
              <button
                type="button"
                onClick={() => onNavigate("orders")}
                title="Abrir Pedidos & Pix"
                aria-label="Abrir Pedidos & Pix"
                className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white hover:bg-[#FF7900] text-black items-center justify-center border-4 border-[#070709] transition-colors z-10"
              >
                <ArrowUpRight className="w-4 h-4" />
              </button>

              {/* Left Half */}
              <div className="p-6 flex flex-col justify-between min-h-[195px]">
                <div className="w-9 h-9 rounded-full bg-[#1A1A21] border border-[#262630] flex items-center justify-center text-zinc-200">
                  <Check className="w-4 h-4" />
                </div>

                <div className="my-3 flex items-baseline gap-2.5">
                  <span className="font-mono-tabular font-bold text-4xl text-white">
                    {stats.paidCount}
                  </span>
                  <span className="text-sm text-zinc-400">confirmados</span>
                </div>

                <p className="text-xs text-zinc-400">
                  <span className="text-[#FF7900] font-medium">
                    {pendingOrdersCount}{" "}
                    {pendingOrdersCount === 1
                      ? "pedido aguardando"
                      : "pedidos aguardando"}
                  </span>{" "}
                  confirmação Pix.
                </p>
              </div>

              {/* Right Half */}
              <div className="p-6 flex flex-col justify-between min-h-[195px]">
                <div className="w-9 h-9 rounded-full bg-[#1A1A21] border border-[#262630] flex items-center justify-center text-zinc-200">
                  <Users className="w-4 h-4" />
                </div>

                <div className="my-3 flex items-baseline gap-2.5">
                  <span className="font-mono-tabular font-bold text-4xl text-white">
                    {uniqueBuyersCount}
                  </span>
                  <span className="text-sm text-zinc-400">participantes</span>
                </div>

                <p className="text-xs text-zinc-400">
                  <span className="text-[#FFB000] font-medium">
                    {stats.availableCount} números livres
                  </span>{" "}
                  disponíveis na Lista 1–100.
                </p>
              </div>
            </div>

            {/* Right 6 cols: Stock by Category Donut Chart */}
            <div className="xl:col-span-6 rounded-[22px] bg-[#121216] border border-[#1E1E26] p-6 flex flex-col justify-between min-h-[195px]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Estoque por Categoria
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Distribuição do capital investido em prêmios
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate("inventory")}
                  aria-label="Gerenciar estoque"
                  className="w-10 h-10 rounded-full bg-white hover:bg-[#FF7900] text-black flex items-center justify-center transition-colors shrink-0"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 flex flex-col sm:flex-row items-center gap-6">
                {/* SVG Donut */}
                <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                  <svg
                    viewBox="0 0 132 132"
                    className="w-full h-full -rotate-90"
                  >
                    <circle
                      cx="66"
                      cy="66"
                      r="52"
                      fill="none"
                      stroke="#1C1C23"
                      strokeWidth="18"
                    />
                    {donutSegments.map((seg) => (
                      <circle
                        key={seg.name}
                        cx="66"
                        cy="66"
                        r="52"
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="18"
                        strokeDasharray={seg.dasharray}
                        strokeDashoffset={seg.dashoffset}
                        strokeLinecap="butt"
                      />
                    ))}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] text-zinc-400">Estoque</span>
                    <span className="font-mono-tabular text-xs font-bold text-white">
                      {stockSummary.totalUnits} un.
                    </span>
                  </div>
                </div>

                {/* Category Legend */}
                <div className="flex-1 w-full space-y-2">
                  {categoryBreakdown.map((cat) => (
                    <div
                      key={cat.name}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="text-zinc-300 truncate">
                          {cat.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 font-mono-tabular shrink-0">
                        <span className="text-zinc-500">{cat.percent}%</span>
                        <span className="text-white font-medium">
                          {formatCurrency(cat.value)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* BENTO ROW 3: Live 01-100 Map & 10 Prizes (7 cols) + Recent Receipts (5 cols) */}
          <section className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            <div className="xl:col-span-7 rounded-[22px] bg-[#121216] border border-[#1E1E26] p-6 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Mapa 01–100 & 10 Prêmios
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Clique em qualquer número para gerenciar na Lista 1–100
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate("list100")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1B1B22] hover:bg-[#FF7900] text-zinc-200 hover:text-black text-xs font-medium transition-colors whitespace-nowrap"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                  <span>Lista Completa</span>
                </button>
              </div>

              <div className="grid grid-cols-10 gap-1.5">
                {listRows.map((row) => (
                  <button
                    key={row.number}
                    type="button"
                    onClick={() => onNavigate("list100")}
                    title={
                      row.order
                        ? `${formatQuotaNumber(row.number)} - ${row.order.buyerName}`
                        : `${formatQuotaNumber(row.number)} - Livre`
                    }
                    className={`h-7 rounded-lg text-[11px] font-mono-tabular font-semibold border transition-colors ${
                      row.status === "paga"
                        ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25"
                        : row.status === "reservada"
                        ? "bg-amber-500/15 border-amber-500/35 text-amber-300 hover:bg-amber-500/25"
                        : "bg-[#17171D] border-[#23232C] text-zinc-500 hover:border-[#FF7900] hover:text-white"
                    }`}
                  >
                    {formatQuotaNumber(row.number)}
                  </button>
                ))}
              </div>

              <div className="pt-4 border-t border-[#1E1E26] grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                {displayedCampaign.prizes.map((p) => (
                  <div
                    key={p.position}
                    className="flex items-center justify-between gap-2 py-1"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono-tabular font-semibold text-[#FF7900]">
                        {String(p.position).padStart(2, "0")}º
                      </span>
                      <span className="text-zinc-300 truncate">{p.title}</span>
                    </div>
                    <span className="font-mono-tabular text-zinc-400 shrink-0">
                      {formatCurrency(p.investedValue ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right 5 cols: Recent Buyers & Attached Receipts */}
            <div className="xl:col-span-5 rounded-[22px] bg-[#121216] border border-[#1E1E26] p-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Últimos Comprovantes
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Anexados ao lado de cada participante
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate("orders")}
                  className="w-9 h-9 rounded-full bg-[#1C1C23] hover:bg-white text-zinc-300 hover:text-black flex items-center justify-center transition-colors shrink-0"
                  aria-label="Ver todos os pedidos"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>

              <div className="divide-y divide-[#1D1D25]">
                {recentOrders.map((order) => {
                  const camp = campaignLookup.get(order.campaignId);
                  return (
                    <div
                      key={order.id}
                      className="py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-medium text-white truncate">
                            {order.buyerName}
                          </span>
                          {order.receipt && (
                            <button
                              type="button"
                              onClick={() => setReceiptOrder(order)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#191920] border border-[#2A2A34] text-[10px] font-medium text-zinc-200 hover:border-[#FF7900] transition-colors"
                            >
                              <FileCheck2 className="w-3 h-3 text-emerald-400" />
                              <span>Comprovante</span>
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                          {camp?.title ?? "Rifa"}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono-tabular text-xs font-semibold text-white">
                          {formatCurrency(order.totalAmount)}
                        </div>
                        <div
                          className={`text-[11px] font-medium ${
                            order.status === "pago"
                              ? "text-emerald-400"
                              : "text-amber-400"
                          }`}
                        >
                          {order.quotas.length}x ·{" "}
                          {order.status === "pago" ? "Pago" : "Pendente"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      )}

      <ReceiptModal
        order={receiptOrder}
        campaignTitle={
          receiptOrder
            ? campaignLookup.get(receiptOrder.campaignId)?.title ?? "Rifa"
            : ""
        }
        onClose={() => setReceiptOrder(null)}
      />
    </div>
  );
};
