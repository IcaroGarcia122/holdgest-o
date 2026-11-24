import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Eye,
  FileCheck2,
  Link2,
  Search,
  ShieldAlert,
  X,
  XCircle,
} from "lucide-react";
import {
  RaffleOrder,
  ReceiptRecord,
  ReceiptStatus,
} from "../types/raffle";
import {
  formatCurrency,
  formatDateTime,
  formatQuotaNumber,
  maskPhoneLGPD,
} from "../utils/formatters";

interface ReceiptsViewProps {
  receipts: ReceiptRecord[];
  orders: RaffleOrder[];
  onApproveReceipt: (
    receiptId: string,
    amount?: number
  ) => Promise<{ ok: boolean; error?: string }>;
  onRejectReceipt: (
    receiptId: string,
    reason?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onLinkReceiptToOrder: (
    receiptId: string,
    orderId: string
  ) => Promise<{ ok: boolean; error?: string }>;
}

const STATUS_BADGE: Record<
  ReceiptStatus,
  { label: string; cls: string }
> = {
  em_analise: {
    label: "Em Análise",
    cls: "bg-amber-500/15 text-amber-400 border-amber-500/35",
  },
  revisao: {
    label: "Revisão",
    cls: "bg-[#FF7900]/15 text-[#FFB000] border-[#FF7900]/40",
  },
  orfao: {
    label: "Órfão",
    cls: "bg-blue-500/15 text-blue-400 border-blue-500/35",
  },
  reenvio: {
    label: "Reenvio",
    cls: "bg-purple-500/15 text-purple-300 border-purple-500/35",
  },
  confirmado: {
    label: "Confirmado",
    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/35",
  },
  rejeitado: {
    label: "Rejeitado",
    cls: "bg-red-500/15 text-red-400 border-red-500/35",
  },
};

export const ReceiptsView: React.FC<ReceiptsViewProps> = ({
  receipts,
  orders,
  onApproveReceipt,
  onRejectReceipt,
  onLinkReceiptToOrder,
}) => {
  const [filter, setFilter] = useState<
    "pendentes" | "orfao" | "confirmado" | "ia_auto" | "rejeitado" | "todos"
  >("pendentes");
  const [search, setSearch] = useState("");
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptRecord | null>(
    null
  );
  const [linkingReceipt, setLinkingReceipt] = useState<ReceiptRecord | null>(
    null
  );
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const linkableOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.status !== "cancelado" && o.status !== "pago"
      ),
    [orders]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter((r) => {
      if (filter === "pendentes") {
        if (
          !["em_analise", "revisao", "orfao", "reenvio"].includes(r.status)
        ) {
          return false;
        }
      } else if (filter === "ia_auto") {
        if (!r.autoConfirmed) {
          return false;
        }
      } else if (filter !== "todos" && r.status !== filter) {
        return false;
      }

      if (!q) return true;
      return (
        (r.code || "").toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.payerName || "").toLowerCase().includes(q) ||
        (r.e2e || "").toLowerCase().includes(q) ||
        r.buyerPhone.toLowerCase().includes(q) ||
        (r.orderCode || "").toLowerCase().includes(q) ||
        (r.orderBuyerName || "").toLowerCase().includes(q)
      );
    });
  }, [receipts, filter, search]);

  const handleApprove = async (rcp: ReceiptRecord) => {
    setFeedback(null);
    setActionBusyId(rcp.id);
    const res = await onApproveReceipt(rcp.id);
    setActionBusyId(null);
    if (!res.ok) {
      setFeedback({
        type: "err",
        text: res.error || "Não foi possível aprovar este comprovante.",
      });
    } else {
      setFeedback({
        type: "ok",
        text: "Comprovante aprovado e pedido atualizado.",
      });
    }
  };

  const handleReject = async (rcp: ReceiptRecord) => {
    setFeedback(null);
    setActionBusyId(rcp.id);
    const res = await onRejectReceipt(rcp.id, "Rejeitado pelo administrador.");
    setActionBusyId(null);
    if (!res.ok) {
      setFeedback({
        type: "err",
        text: res.error || "Erro ao rejeitar comprovante.",
      });
    } else {
      setFeedback({ type: "ok", text: "Comprovante marcado como rejeitado." });
    }
  };

  const handleConfirmLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkingReceipt || !selectedOrderId) return;
    setActionBusyId(linkingReceipt.id);
    const res = await onLinkReceiptToOrder(linkingReceipt.id, selectedOrderId);
    setActionBusyId(null);
    if (!res.ok) {
      setFeedback({
        type: "err",
        text: res.error || "Não foi possível vincular comprovante.",
      });
    } else {
      setFeedback({
        type: "ok",
        text: "Comprovante vinculado ao pedido com sucesso.",
      });
      setLinkingReceipt(null);
      setSelectedOrderId("");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-white">
            Comprovantes
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Fila de auditoria de comprovantes Pix (imagem, E2E, órfãos e
            revisão manual).
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-xs font-medium border flex items-center justify-between ${
            feedback.type === "ok"
              ? "bg-emerald-500/10 border-emerald-500/35 text-emerald-300"
              : "bg-red-500/10 border-red-500/35 text-red-300"
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-full bg-[#121216] border border-[#1E1E26] self-start">
          {(
            [
              { id: "pendentes", label: "Pendentes / Revisão" },
              { id: "orfao", label: "Órfãos" },
              { id: "confirmado", label: "Confirmados" },
              { id: "ia_auto", label: "Confirmado pela IA" },
              { id: "rejeitado", label: "Rejeitados" },
              { id: "todos", label: "Todos" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                filter === tab.id
                  ? "bg-white text-black font-semibold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código, E2E, pagador, pedido..."
            className="w-full pl-10 pr-3 py-2 rounded-full bg-[#121216] border border-[#1E1E26] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF7900]"
          />
        </div>
      </div>

      {/* Receipts Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-[22px] bg-[#121216] border border-[#1E1E26] p-12 text-center text-sm text-zinc-400">
          Nenhum comprovante encontrado nesta fila.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((rcp) => {
            const badge = STATUS_BADGE[rcp.status] || STATUS_BADGE.em_analise;
            const isPending = [
              "em_analise",
              "revisao",
              "orfao",
              "reenvio",
            ].includes(rcp.status);
            const busy = actionBusyId === rcp.id;

            return (
              <article
                key={rcp.id}
                className="rounded-[22px] bg-[#121216] border border-[#1E1E26] p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {rcp.code && (
                        <span className="font-mono-tabular text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#18181F] border border-[#262630] text-zinc-200">
                          #{rcp.code}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                      {rcp.autoConfirmed && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-purple-500/15 text-purple-300 border-purple-500/40">
                          <Bot className="w-3 h-3" />
                          <span>Confirmado pela IA</span>
                        </span>
                      )}
                      {rcp.confidence !== null &&
                        rcp.confidence !== undefined && (
                          <span className="font-mono-tabular text-[11px] text-zinc-400">
                            Confiança: {Math.round(rcp.confidence * 100)}%
                          </span>
                        )}
                      <span className="font-mono-tabular text-[11px] text-zinc-500">
                        {formatDateTime(rcp.createdAt)}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-white truncate pt-0.5">
                      {rcp.payerName || rcp.orderBuyerName || "Pagador não informado"}
                    </h3>
                    <div className="text-xs text-zinc-400 font-mono-tabular">
                      WhatsApp: {maskPhoneLGPD(rcp.buyerPhone)}
                      {rcp.orderCode ? ` · Pedido #${rcp.orderCode}` : " · Sem pedido vinculado"}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono-tabular text-base font-bold text-[#FFB000]">
                      {rcp.amount !== null && rcp.amount !== undefined
                        ? formatCurrency(rcp.amount)
                        : "Valor —"}
                    </div>
                    {rcp.orderTotalAmount !== undefined && (
                      <div className="text-[11px] font-mono-tabular text-zinc-500">
                        Pedido: {formatCurrency(rcp.orderTotalAmount)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Metadata + Suspect Reasons */}
                <div className="rounded-2xl bg-[#0D0D11] border border-[#1E1E26] p-3.5 text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-400">E2E Pix</span>
                    <span className="font-mono-tabular text-zinc-200 truncate">
                      {rcp.e2e || "Não identificado"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-400">Recebedor</span>
                    <span className="text-zinc-200 truncate">
                      {rcp.recipientName || "—"}
                    </span>
                  </div>
                  {rcp.orderQuotas && rcp.orderQuotas.length > 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-zinc-400">Números</span>
                      <span className="font-mono-tabular text-[#FFB000] truncate">
                        {rcp.orderQuotas.map(formatQuotaNumber).join(", ")}
                      </span>
                    </div>
                  )}
                  {rcp.reasons && rcp.reasons.length > 0 && (
                    <div className="pt-1.5 border-t border-[#1E1E26] flex items-start gap-2 text-amber-300">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{rcp.reasons.join(" · ")}</span>
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {rcp.signedUrl ? (
                      <button
                        type="button"
                        onClick={() => setPreviewReceipt(rcp)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181F] hover:bg-[#22222B] border border-[#262630] text-xs font-medium text-white transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#FF7900]" />
                        <span>Ver Imagem</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-zinc-500">
                        Sem imagem anexada
                      </span>
                    )}

                    {isPending && (
                      <button
                        type="button"
                        onClick={() => {
                          setLinkingReceipt(rcp);
                          setSelectedOrderId(rcp.orderId || "");
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181F] hover:bg-[#22222B] border border-[#262630] text-xs font-medium text-zinc-200 transition-colors"
                      >
                        <Link2 className="w-3.5 h-3.5 text-blue-400" />
                        <span>Vincular Pedido</span>
                      </button>
                    )}
                  </div>

                  {isPending && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleReject(rcp)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/35 text-xs font-medium text-red-400 disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Rejeitar</span>
                      </button>

                      <button
                        type="button"
                        disabled={busy || !rcp.orderId}
                        title={
                          !rcp.orderId
                            ? "Vincule a um pedido antes de aprovar"
                            : "Aprovar comprovante e creditar pedido"
                        }
                        onClick={() => handleApprove(rcp)}
                        className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold disabled:opacity-40"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Aprovar</span>
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Signed Image Preview Modal */}
      {previewReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
          onClick={() => setPreviewReceipt(null)}
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
                  Imagem do Comprovante
                </h3>
                <p className="text-xs text-zinc-400">
                  {previewReceipt.code ? `#${previewReceipt.code} · ` : ""}
                  {previewReceipt.payerName || "Participante"} ·{" "}
                  {previewReceipt.e2e || "Sem E2E"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="w-9 h-9 rounded-full bg-[#18181F] text-zinc-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-2xl bg-[#0B0B0E] border border-[#1E1E26] p-3 flex items-center justify-center max-h-[380px] overflow-hidden">
                {previewReceipt.signedUrl ? (
                  <img
                    src={previewReceipt.signedUrl}
                    alt="Comprovante Pix"
                    className="max-h-[350px] w-auto object-contain rounded-xl"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <FileCheck2 className="w-8 h-8 text-zinc-500" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link Orphan Receipt Modal */}
      {linkingReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
          onClick={() => setLinkingReceipt(null)}
        >
          <form
            onSubmit={handleConfirmLink}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-[22px] bg-[#121216] border border-[#262630] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                Vincular Comprovante a Pedido
              </h3>
              <button
                type="button"
                onClick={() => setLinkingReceipt(null)}
                className="p-1.5 rounded-full text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-[#0D0D11] border border-[#1E1E26] p-3 text-xs text-zinc-300 space-y-1">
              {linkingReceipt.code && (
                <div>
                  Comprovante:{" "}
                  <strong className="font-mono-tabular text-white">
                    #{linkingReceipt.code}
                  </strong>
                </div>
              )}
              <div>
                Pagador: <strong className="text-white">{linkingReceipt.payerName || "—"}</strong>
              </div>
              <div>
                Valor:{" "}
                <strong className="text-[#FFB000]">
                  {linkingReceipt.amount !== null && linkingReceipt.amount !== undefined
                    ? formatCurrency(linkingReceipt.amount)
                    : "—"}
                </strong>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Selecione o Pedido
              </label>
              <select
                value={selectedOrderId}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-xs text-white focus:outline-none focus:border-[#FF7900]"
              >
                <option value="">Escolha um pedido...</option>
                {linkableOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    #{o.code || o.id.slice(-4)} · {o.buyerName} ·{" "}
                    {formatCurrency(o.totalAmount)} ({o.status})
                  </option>
                ))}
              </select>
            </div>

            {linkableOrders.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Nenhum pedido em aberto encontrado.</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLinkingReceipt(null)}
                className="px-4 py-2 rounded-full text-xs text-zinc-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!selectedOrderId || actionBusyId === linkingReceipt.id}
                className="px-5 py-2 rounded-full bg-[#FF7900] hover:bg-[#FFB000] text-black text-xs font-semibold disabled:opacity-40"
              >
                Vincular
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
