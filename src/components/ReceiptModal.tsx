import React from "react";
import { X, Bot, UserCheck, FileCheck2, ExternalLink } from "lucide-react";
import { RaffleOrder } from "../types/raffle";
import {
  formatCurrency,
  formatDateTime,
  formatQuotaNumber,
} from "../utils/formatters";

interface ReceiptModalProps {
  order: RaffleOrder | null;
  campaignTitle: string;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  order,
  campaignTitle,
  onClose,
}) => {
  if (!order || !order.receipt) return null;

  const { receipt } = order;
  const numsLabel = [...order.quotas]
    .sort((a, b) => a - b)
    .map((n) => formatQuotaNumber(n))
    .join(", ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-[22px] bg-[#121216] border border-[#262630] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E1E26]">
          <div>
            <h3 className="text-base font-semibold text-white">
              Comprovante Anexado
            </h3>
            <p className="text-xs text-zinc-400">
              {order.buyerName} · Números {numsLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar comprovante"
            className="w-9 h-9 rounded-full bg-[#18181F] text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-2xl bg-[#0B0B0E] border border-[#1E1E26] p-3 flex items-center justify-center max-h-[340px] overflow-hidden">
            {receipt.imageUrl ? (
              <img
                src={receipt.imageUrl}
                alt={`Comprovante de ${order.buyerName}`}
                className="max-h-[310px] w-auto object-contain rounded-xl"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="py-10 text-center text-xs text-zinc-400">
                <FileCheck2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                Comprovante registrado via webhook
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-[#0D0D11] border border-[#1E1E26] divide-y divide-[#1B1B22] text-xs">
            <div className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-zinc-400">Rifa</span>
              <span className="font-medium text-white">{campaignTitle}</span>
            </div>
            <div className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-zinc-400">Valor Confirmado</span>
              <span className="font-mono-tabular font-semibold text-emerald-400">
                {formatCurrency(order.totalAmount)}
              </span>
            </div>
            {receipt.txId && (
              <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                <span className="text-zinc-400 shrink-0">ID Transação</span>
                <span className="font-mono-tabular text-[#FFB000] truncate">
                  {receipt.txId}
                </span>
              </div>
            )}
            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <span className="text-zinc-400">Conferência</span>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {receipt.autoConfirmed && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/40 text-[10px] font-semibold text-purple-300">
                    <Bot className="w-3 h-3" />
                    <span>Confirmado pela IA</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 font-medium text-white">
                  {receipt.verifiedBy === "ai_bot" ? (
                    <>
                      <Bot className="w-3.5 h-3.5 text-[#FF7900]" />
                      <span>Agente de IA (Grupo WhatsApp)</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Anexado Manualmente</span>
                    </>
                  )}
                </span>
              </div>
            </div>
            <div className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-zinc-400">Anexado em</span>
              <span className="font-mono-tabular text-zinc-300">
                {formatDateTime(receipt.uploadedAt)}
              </span>
            </div>
            {receipt.summary && (
              <div className="px-4 py-2.5 text-zinc-300 leading-relaxed">
                {receipt.summary}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            {receipt.imageUrl ? (
              <a
                href={receipt.imageUrl}
                download={receipt.fileName || `comprovante-${order.id}.png`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#FFB000] hover:text-[#FF7900]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Baixar Comprovante</span>
              </a>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full bg-white hover:bg-[#FF7900] text-zinc-950 text-xs font-semibold transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
