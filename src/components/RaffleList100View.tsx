import React, { useState, useMemo, useRef } from "react";
import {
  Search,
  Copy,
  Check,
  Paperclip,
  CheckCircle2,
  Clock,
  Trash2,
  Upload,
  Bot,
  FileCheck2,
  Trophy,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import {
  PaymentMethod,
  QuotaRowInfo,
  QuotaStatus,
  RaffleCampaign,
  RaffleOrder,
  ReceiptAttachment,
} from "../types/raffle";
import {
  buildWhatsAppListText,
  formatCurrency,
  formatPhoneInput,
  formatQuotaNumber,
} from "../utils/formatters";
import { ReceiptModal } from "./ReceiptModal";
import { PrizeImage } from "./PrizeImage";

interface RaffleList100ViewProps {
  campaign: RaffleCampaign | null;
  campaigns: RaffleCampaign[];
  onSelectCampaign: (id: string) => void;
  getList100: (campaignId: string) => QuotaRowInfo[];
  getCampaignStats: (campaignId: string) => {
    paidCount: number;
    reservedCount: number;
    availableCount: number;
    confirmedRevenue: number;
    progressPercent: number;
    isComplete: boolean;
  };
  onCreateOrder: (input: {
    campaignId: string;
    buyerName: string;
    buyerPhone: string;
    quotas: number[];
    paymentMethod: PaymentMethod;
    markAsPaid: boolean;
    receipt?: ReceiptAttachment;
  }) => { ok: boolean; order?: RaffleOrder; error?: string };
  onConfirmPayment: (orderId: string, receipt?: ReceiptAttachment) => void;
  onAttachReceipt: (
    orderId: string,
    receipt: ReceiptAttachment,
    markAsPaid?: boolean
  ) => void;
  onCancelOrder: (orderId: string) => void;
}

export const RaffleList100View: React.FC<RaffleList100ViewProps> = ({
  campaign,
  campaigns,
  onSelectCampaign,
  getList100,
  getCampaignStats,
  onCreateOrder,
  onConfirmPayment,
  onAttachReceipt,
  onCancelOrder,
}) => {
  const [filter, setFilter] = useState<"todos" | QuotaStatus>("todos");
  const [search, setSearch] = useState("");
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [copiedList, setCopiedList] = useState(false);
  const [showPrizes, setShowPrizes] = useState(false);
  const [viewingReceiptOrder, setViewingReceiptOrder] =
    useState<RaffleOrder | null>(null);

  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [markAsPaid, setMarkAsPaid] = useState(true);
  const [receiptPreview, setReceiptPreview] = useState<string>("");
  const [receiptFileName, setReceiptFileName] = useState<string>("");
  const [formError, setFormError] = useState("");

  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const [attachingOrderId, setAttachingOrderId] = useState<string | null>(null);

  const rows = useMemo(
    () => (campaign ? getList100(campaign.id) : []),
    [campaign, getList100]
  );

  const stats = useMemo(
    () =>
      campaign
        ? getCampaignStats(campaign.id)
        : {
            paidCount: 0,
            reservedCount: 0,
            availableCount: 100,
            confirmedRevenue: 0,
            progressPercent: 0,
            isComplete: false,
          },
    [campaign, getCampaignStats]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== "todos" && row.status !== filter) return false;
      if (!q) return true;
      const numStr = formatQuotaNumber(row.number);
      const nameMatch = row.order?.buyerName.toLowerCase().includes(q) ?? false;
      return numStr.includes(q) || nameMatch;
    });
  }, [rows, filter, search]);

  if (!campaign) {
    return (
      <div className="rounded-[22px] bg-[#121216] border border-[#1E1E26] p-12 text-center">
        <p className="text-sm font-medium text-white">
          Nenhuma rifa semanal ativa no momento
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          Clique em Nova Rifa para iniciar a semana ou reative uma rifa em
          Rifas & Histórico.
        </p>
      </div>
    );
  }

  const toggleNumberSelection = (num: number) => {
    if (campaign.status !== "ativa") return;
    setFormError("");
    setSelectedNumbers((prev) =>
      prev.includes(num)
        ? prev.filter((n) => n !== num)
        : [...prev, num].sort((a, b) => a - b)
    );
  };

  const handleSelectAllAvailable = () => {
    if (campaign.status !== "ativa") return;
    const free = rows
      .filter((r) => r.status === "disponivel")
      .map((r) => r.number);
    setSelectedNumbers(free);
  };

  const handleCopyWhatsAppList = async () => {
    const text = buildWhatsAppListText(campaign, rows);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedList(true);
      setTimeout(() => setCopiedList(false), 2200);
    } catch {
      // ignore
    }
  };

  const handleFormReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setReceiptPreview(reader.result);
        setReceiptFileName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const triggerRowAttachReceipt = (orderId: string) => {
    setAttachingOrderId(orderId);
    attachInputRef.current?.click();
  };

  const handleRowReceiptFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !attachingOrderId) return;
    const targetId = attachingOrderId;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onAttachReceipt(
          targetId,
          {
            imageUrl: reader.result,
            fileName: file.name,
            verifiedBy: "manual",
            summary: "Comprovante anexado diretamente na Lista 1-100.",
            uploadedAt: new Date().toISOString(),
          },
          true
        );
      }
      setAttachingOrderId(null);
      if (attachInputRef.current) attachInputRef.current.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (selectedNumbers.length === 0) {
      setFormError("Marque pelo menos um número livre na Lista 1–100.");
      return;
    }
    if (!buyerName.trim()) {
      setFormError("Informe o nome do participante.");
      return;
    }

    const receipt: ReceiptAttachment | undefined = receiptPreview
      ? {
          imageUrl: receiptPreview,
          fileName: receiptFileName || "comprovante-pix.png",
          verifiedBy: "manual",
          summary: "Comprovante anexado no lançamento da lista.",
          uploadedAt: new Date().toISOString(),
        }
      : undefined;

    const res = onCreateOrder({
      campaignId: campaign.id,
      buyerName: buyerName.trim(),
      buyerPhone: buyerPhone.trim() || "(11) 90000-0000",
      quotas: selectedNumbers,
      paymentMethod: "pix",
      markAsPaid,
      receipt,
    });

    if (!res.ok) {
      setFormError(res.error ?? "Erro ao registrar na lista.");
      return;
    }

    setSelectedNumbers([]);
    setBuyerName("");
    setBuyerPhone("");
    setReceiptPreview("");
    setReceiptFileName("");
  };

  return (
    <div className="space-y-5">
      <input
        ref={attachInputRef}
        type="file"
        accept="image/*"
        onChange={handleRowReceiptFileChange}
        className="hidden"
      />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-white">
            Lista 1–100
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Participantes confirmados com comprovante anexado ao lado do nome.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowPrizes((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#121216] hover:bg-[#191920] border border-[#22222B] text-xs font-medium text-white transition-colors whitespace-nowrap"
          >
            <Trophy className="w-3.5 h-3.5 text-[#FFB000]" />
            <span>10 Prêmios</span>
            {showPrizes ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyWhatsAppList}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-[#FF7900] text-black text-xs font-semibold transition-colors whitespace-nowrap"
          >
            {copiedList ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Lista Copiada</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Lista WhatsApp</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Raffle Context Card */}
      <section className="rounded-[22px] bg-[#121216] border border-[#1E1E26] overflow-hidden">
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <PrizeImage
              src={campaign.image}
              alt={campaign.title}
              className="w-12 h-12 rounded-2xl shrink-0 border border-[#272730]"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span className="text-[#FFB000] font-medium">
                  {campaign.weekLabel}
                </span>
                <span aria-hidden="true">·</span>
                <span>{campaign.whatsappGroupName}</span>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    campaign.status === "ativa"
                      ? "text-emerald-400 font-medium"
                      : "text-zinc-500"
                  }
                >
                  {campaign.status === "ativa" ? "Ativa" : "Encerrada"}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <select
                  value={campaign.id}
                  onChange={(e) => onSelectCampaign(e.target.value)}
                  className="px-3.5 py-1.5 rounded-full bg-[#191920] border border-[#262630] text-xs font-medium text-white focus:outline-none focus:border-[#FF7900]"
                >
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.status === "ativa" ? "Ativa" : "Encerrada"})
                    </option>
                  ))}
                </select>
                <span className="font-mono-tabular text-xs font-medium text-zinc-300">
                  {formatCurrency(campaign.ticketPrice)} / número
                </span>
              </div>
            </div>
          </div>

          <div className="w-full md:w-72 space-y-1.5 shrink-0">
            <div className="flex items-center justify-between text-xs font-mono-tabular">
              <span className="text-zinc-400">
                {stats.paidCount} confirmados · {stats.reservedCount} res.
              </span>
              <span className="font-semibold text-white">
                {stats.paidCount}/100
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#1C1C23] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#FF7900]"
                style={{ width: `${stats.progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {showPrizes && (
          <div className="border-t border-[#1E1E26] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#1A1A22] bg-[#0D0D11]">
            {campaign.prizes.map((p) => (
              <div key={p.position} className="px-4 py-3 text-xs">
                <div className="font-mono-tabular font-semibold text-[#FFB000]">
                  {String(p.position).padStart(2, "0")}º Prêmio
                </div>
                <div className="text-zinc-200 font-medium truncate mt-0.5">
                  {p.title}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Main Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[#121216] border border-[#1E1E26] self-start">
              {(
                [
                  { id: "todos", label: "Todos (1–100)" },
                  { id: "paga", label: "Confirmados" },
                  { id: "reservada", label: "Reservados" },
                  { id: "disponivel", label: "Livres" },
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

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nº (01-100) ou nome..."
                className="w-full pl-10 pr-3 py-2 rounded-full bg-[#121216] border border-[#1E1E26] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF7900]"
              />
            </div>
          </div>

          <div className="rounded-[22px] bg-[#121216] border border-[#1E1E26] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1E1E26] bg-[#0D0D11] text-[11px] font-medium text-zinc-400">
                    <th className="py-3 px-4 w-16">Número</th>
                    <th className="py-3 px-4">Participante & Comprovante</th>
                    <th className="py-3 px-4">Situação</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A1A22] text-sm">
                  {filteredRows.map((row) => {
                    const numLabel = formatQuotaNumber(row.number);
                    const isSelected = selectedNumbers.includes(row.number);
                    const order = row.order;

                    return (
                      <tr
                        key={row.number}
                        className={`transition-colors ${
                          isSelected ? "bg-[#1D1308]" : "hover:bg-[#16161C]"
                        }`}
                      >
                        <td className="py-2.5 px-4">
                          <span
                            className={`inline-flex items-center justify-center w-9 h-7 rounded-lg font-mono-tabular text-xs font-semibold border ${
                              row.status === "paga"
                                ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300"
                                : row.status === "reservada"
                                ? "bg-amber-500/15 border-amber-500/35 text-amber-300"
                                : isSelected
                                ? "bg-[#FF7900] border-[#FFB000] text-black"
                                : "bg-[#18181F] border-[#262630] text-zinc-400"
                            }`}
                          >
                            {numLabel}
                          </span>
                        </td>

                        <td className="py-2.5 px-4">
                          {order ? (
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="font-medium text-white text-[13px]">
                                {order.buyerName}
                              </span>

                              {order.receipt ? (
                                <button
                                  type="button"
                                  onClick={() => setViewingReceiptOrder(order)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#1A1A22] hover:bg-[#23232D] border border-[#2C2C38] hover:border-[#FFB000] text-[11px] font-medium text-zinc-200 transition-colors"
                                >
                                  {order.receipt.verifiedBy === "ai_bot" ? (
                                    <Bot className="w-3 h-3 text-[#FF7900]" />
                                  ) : (
                                    <FileCheck2 className="w-3 h-3 text-emerald-400" />
                                  )}
                                  <span>Comprovante</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    triggerRowAttachReceipt(order.id)
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#17171D] hover:bg-[#202028] border border-dashed border-[#2F2F3B] text-[11px] text-zinc-400 hover:text-white transition-colors"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  <span>Anexar comprovante</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-500">
                              Disponível
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-4 whitespace-nowrap">
                          {row.status === "paga" ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Confirmado</span>
                            </span>
                          ) : row.status === "reservada" ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Reservado</span>
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-500">Livre</span>
                          )}
                        </td>

                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          {row.status === "disponivel" ? (
                            <button
                              type="button"
                              disabled={campaign.status !== "ativa"}
                              onClick={() => toggleNumberSelection(row.number)}
                              className={`px-3.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-40 ${
                                isSelected
                                  ? "bg-[#FF7900] text-black font-semibold"
                                  : "bg-[#1A1A22] hover:bg-white hover:text-black text-zinc-200"
                              }`}
                            >
                              {isSelected ? "Selecionado" : "Selecionar"}
                            </button>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              {order && row.status === "reservada" && (
                                <button
                                  type="button"
                                  onClick={() => onConfirmPayment(order.id)}
                                  className="px-3 py-1 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-xs font-medium text-emerald-400"
                                >
                                  Confirmar
                                </button>
                              )}
                              {order && (
                                <button
                                  type="button"
                                  onClick={() => onCancelOrder(order.id)}
                                  title="Liberar número(s) deste participante"
                                  className="p-1.5 rounded-full text-zinc-500 hover:text-red-400 hover:bg-[#1B1B22]"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sticky Entry Card */}
        <div className="lg:col-span-4 lg:sticky lg:top-20 rounded-[22px] bg-[#121216] border border-[#1E1E26] overflow-hidden">
          <div className="p-5 border-b border-[#1E1E26] flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-white">
                Registrar Participante
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Selecione números livres à esquerda.
              </p>
            </div>
            {stats.availableCount > 0 && campaign.status === "ativa" && (
              <button
                type="button"
                onClick={handleSelectAllAvailable}
                className="text-xs font-medium text-[#FFB000] hover:text-[#FF7900] whitespace-nowrap"
              >
                Todos livres
              </button>
            )}
          </div>

          <div className="p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-zinc-400">Números selecionados</span>
                <span className="font-mono-tabular font-semibold text-[#FFB000]">
                  {selectedNumbers.length}x
                </span>
              </div>
              {selectedNumbers.length === 0 ? (
                <div className="p-3 rounded-xl bg-[#0D0D11] border border-dashed border-[#272730] text-center text-xs text-zinc-500">
                  Clique em “Selecionar” em qualquer linha livre
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2.5 rounded-xl bg-[#0D0D11] border border-[#1E1E26]">
                  {selectedNumbers.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleNumberSelection(n)}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#211508] border border-[#FF7900]/45 text-xs font-mono-tabular font-semibold text-[#FFB000]"
                    >
                      <span>{formatQuotaNumber(n)}</span>
                      <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Nome do Participante
                </label>
                <input
                  type="text"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Nome para aparecer na lista"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#18181F] border border-[#272730] text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF7900]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  WhatsApp (opcional)
                </label>
                <input
                  type="tel"
                  value={buyerPhone}
                  onChange={(e) =>
                    setBuyerPhone(formatPhoneInput(e.target.value))
                  }
                  placeholder="(11) 99999-9999"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#18181F] border border-[#272730] text-sm font-mono-tabular text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF7900]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Comprovante Pix (ao lado do nome)
                </label>
                <label className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl bg-[#18181F] hover:bg-[#1E1E26] border border-dashed border-[#2F2F3A] text-xs text-zinc-300 cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5 text-[#FFB000]" />
                  <span className="truncate">
                    {receiptFileName || "Enviar print do comprovante"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFormReceiptUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={markAsPaid}
                  onChange={(e) => setMarkAsPaid(e.target.checked)}
                  className="w-4 h-4 accent-[#FF7900]"
                />
                <span>Colocar na lista como Confirmado (Pago)</span>
              </label>

              <div className="pt-3 border-t border-[#1E1E26] flex items-center justify-between text-sm font-semibold">
                <span className="text-zinc-400 font-normal text-xs">
                  Total ({selectedNumbers.length}x)
                </span>
                <span className="font-mono-tabular text-[#FFB000]">
                  {formatCurrency(selectedNumbers.length * campaign.ticketPrice)}
                </span>
              </div>

              {formError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={campaign.status !== "ativa"}
                className="w-full py-2.5 rounded-full bg-[#FF7900] hover:bg-[#FFB000] text-black text-xs font-semibold transition-colors disabled:opacity-40"
              >
                Adicionar na Lista 1–100
              </button>
            </form>
          </div>
        </div>
      </div>

      <ReceiptModal
        order={viewingReceiptOrder}
        campaignTitle={campaign.title}
        onClose={() => setViewingReceiptOrder(null)}
      />
    </div>
  );
};
