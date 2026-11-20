import React from "react";
import {
  Plus,
  ListOrdered,
  Pencil,
  Archive,
  CheckCircle2,
} from "lucide-react";
import { RaffleCampaign } from "../types/raffle";
import { formatCurrency, formatShortDate } from "../utils/formatters";
import { PrizeImage } from "./PrizeImage";

interface CampaignsViewProps {
  campaigns: RaffleCampaign[];
  getCampaignStats: (campaignId: string) => {
    paidCount: number;
    reservedCount: number;
    availableCount: number;
    confirmedRevenue: number;
    progressPercent: number;
    isComplete: boolean;
  };
  onNewCampaign: () => void;
  onEditCampaign: (campaign: RaffleCampaign) => void;
  onCloseCampaign: (campaignId: string) => void;
  onOpenList100: (campaignId: string) => void;
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({
  campaigns,
  getCampaignStats,
  onNewCampaign,
  onEditCampaign,
  onCloseCampaign,
  onOpenList100,
}) => {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-white">
            Rifas & Histórico Semanal
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Apenas{" "}
            <strong className="text-zinc-200">1 rifa ativa por semana</strong>{" "}
            com Lista 1–100 e 10 prêmios vinculados.
          </p>
        </div>

        <button
          type="button"
          onClick={onNewCampaign}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white hover:bg-[#FF7900] text-zinc-950 text-xs font-semibold self-start sm:self-auto whitespace-nowrap transition-colors"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Criar Nova Rifa</span>
        </button>
      </div>

      <div className="space-y-5">
        {campaigns.map((campaign) => {
          const stats = getCampaignStats(campaign.id);
          const isActive = campaign.status === "ativa";

          return (
            <article
              key={campaign.id}
              className={`rounded-[22px] bg-[#121216] border overflow-hidden ${
                isActive ? "border-[#FF7900]/60" : "border-[#1E1E26]"
              }`}
            >
              {/* Header */}
              <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <PrizeImage
                    src={campaign.image}
                    alt={campaign.title}
                    className="w-14 h-14 rounded-2xl shrink-0 border border-[#262630]"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular text-zinc-400">
                      <span className="text-[#FFB000] font-medium">
                        {campaign.weekLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatCurrency(campaign.ticketPrice)}/nº</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          isActive
                            ? "text-emerald-400 font-medium"
                            : "text-zinc-500"
                        }
                      >
                        {isActive ? "Ativa esta semana" : "Encerrada"}
                      </span>
                    </div>

                    <h3 className="text-lg font-semibold text-white mt-0.5 truncate">
                      {campaign.title}
                    </h3>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      {campaign.whatsappGroupName} · Previsão:{" "}
                      {formatShortDate(campaign.scheduledDrawDate)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenList100(campaign.id)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#18181F] hover:bg-[#22222B] border border-[#262630] text-xs font-medium text-white transition-colors"
                  >
                    <ListOrdered className="w-3.5 h-3.5 text-[#FF7900]" />
                    <span>Lista 1–100</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onEditCampaign(campaign)}
                    title="Editar rifa e os 10 prêmios"
                    className="w-9 h-9 rounded-full bg-[#18181F] hover:bg-[#22222B] border border-[#262630] text-zinc-300 hover:text-white flex items-center justify-center transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  {isActive && (
                    <button
                      type="button"
                      onClick={() => onCloseCampaign(campaign.id)}
                      title="Encerrar rifa desta semana"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#18181F] hover:bg-[#22222B] border border-[#262630] text-xs font-medium text-zinc-300 transition-colors"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>Encerrar</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Strip */}
              <div className="px-5 sm:px-6 py-4 border-t border-[#1E1E26] bg-[#0D0D11] space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono-tabular">
                  <span className="text-zinc-400">
                    {stats.paidCount} confirmados · {stats.reservedCount}{" "}
                    reservados · {stats.availableCount} livres
                  </span>
                  <span className="font-semibold text-emerald-400">
                    {formatCurrency(stats.confirmedRevenue)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#1B1B22] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#FF7900]"
                    style={{ width: `${stats.progressPercent}%` }}
                  />
                </div>
                {stats.isComplete && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 pt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Lista 1–100 completa</span>
                  </div>
                )}
              </div>

              {/* 10 Prizes Hairline Grid */}
              <div className="border-t border-[#1E1E26] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#1B1B22]">
                {campaign.prizes.map((p) => (
                  <div key={p.position} className="px-4 py-3 text-xs">
                    <span className="font-mono-tabular font-semibold text-[#FFB000]">
                      {String(p.position).padStart(2, "0")}º
                    </span>{" "}
                    <span className="text-zinc-200">{p.title}</span>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
