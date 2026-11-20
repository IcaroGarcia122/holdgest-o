import React, { useState, useMemo, useRef } from "react";
import {
  Search,
  Download,
  CheckCircle2,
  Clock,
  XCircle,
  Bot,
  FileCheck2,
  Paperclip,
  Trash2,
} from "lucide-react";
import {
  OrderStatus,
  RaffleCampaign,
  RaffleOrder,
  ReceiptAttachment,
} from "../types/raffle";
import {
  exportOrdersToCSV,
  formatCurrency,
  formatDateTime,
  formatQuotaNumber,
} from "../utils/formatters";
import { ReceiptModal } from "./ReceiptModal";

interface OrdersViewProps {
  campaigns: RaffleCampaign[];
  orders: RaffleOrder[];
  onConfirmPayment: (orderId: string) => void;
  onAttachReceipt: (
    orderId: string,
    receipt: ReceiptAttachment,
    markAsPaid?: boolean
  ) => void;
  onCancelOrder: (orderId: string) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  campaigns,
  orders,
  onConfirmPayment,
  onAttachReceipt,
  onCancelOrder,
}) => {
  const [statusFilter, setStatusFilter] = useState<"todos" | OrderStatus>(
    "todos"
  );
  const [campaignFilter, setCampaignFilter] = useState<string>("todas");
  const [search, setSearch] = useState("");
  const [viewingReceiptOrder, setViewingReceiptOrder] =
    useState<RaffleOrder | null>(null);
  const [attachingOrderId, setAttachingOrderId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const campaignMap = useMemo(
    () => new Map(campaigns.map((c) => [c.id, c])),
    [campaigns]
  );

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...orders]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .filter((o) => {
        if (statusFilter !== "todos" && o.status !== statusFilter) return false;
        if (campaignFilter !== "todas" && o.campaignId !== campaignFilter)
          return false;
        if (!q) return true;
        const camp = campaignMap.get(o.campaignId);
        return (
          o.buyerName.toLowerCase().includes(q) ||
          o.buyerPhone.toLowerCase().includes(q) ||
          (camp?.title.toLowerCase().includes(q) ?? false)
        );
      });
  }, [orders, statusFilter, campaignFilter, search, campaignMap]);

  const handleTriggerAttach = (orderId: string) => {
    setAttachingOrderId(orderId);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
            summary: "Comprovante anexado em Pedidos & Pix.",
            uploadedAt: new Date().toISOString(),
          },
          true
        );
      }
      setAttachingOrderId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-white">
            Pedidos & Pix
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Reservas, comprovantes anexados e confirmações por rifa.
          </p>
        </div>

        <button
          type="button"
          onClick={() => exportOrdersToCSV(filteredOrders, campaigns)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-[#FF7900] text-black text-xs font-semibold transition-colors self-start sm:self-auto whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Exportar CSV</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[#121216] border border-[#1E1E26] self-start">
          {(
            [
              { id: "todos", label: "Todos" },
              { id: "pago", label: "Confirmados" },
              { id: "pendente", label: "Aguardando Pix" },
              { id: "cancelado", label: "Cancelados" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === tab.id
                  ? "bg-white text-black font-semibold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="px-4 py-2 rounded-full bg-[#121216] border border-[#1E1E26] text-xs text-white focus:outline-none focus:border-[#FF7900]"
          >
            <option value="todas">Todas as rifas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome ou rifa..."
              className="w-full pl-10 pr-3 py-2 rounded-full bg-[#121216] border border-[#1E1E26] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF7900]"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-[22px] bg-[#121216] border border-[#1E1E26] overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-sm text-zinc-400">
            Nenhum pedido encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E1E26] bg-[#0D0D11] text-[11px] font-medium text-zinc-400">
                  <th className="py-3 px-4">Participante & Comprovante</th>
                  <th className="py-3 px-4">Rifa</th>
                  <th className="py-3 px-4">Números (1–100)</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4">Situação</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A22] text-sm">
                {filteredOrders.map((order) => {
                  const camp = campaignMap.get(order.campaignId);
                  const numsLabel = order.quotas
                    .map((q) => formatQuotaNumber(q))
                    .join(", ");

                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-[#16161C] transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-white text-[13px]">
                            {order.buyerName}
                          </span>

                          {order.receipt ? (
                            <button
                              type="button"
                              onClick={() => setViewingReceiptOrder(order)}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#1A1A22] hover:bg-[#23232D] border border-[#2C2C38] hover:border-[#FFB000] text-[11px] text-zinc-200 transition-colors"
                            >
                              {order.receipt.verifiedBy === "ai_bot" ? (
                                <Bot className="w-3 h-3 text-[#FF7900]" />
                              ) : (
                                <FileCheck2 className="w-3 h-3 text-emerald-400" />
                              )}
                              <span>Comprovante</span>
                            </button>
                          ) : (
                            order.status !== "cancelado" && (
                              <button
                                type="button"
                                onClick={() => handleTriggerAttach(order.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#17171D] hover:bg-[#202028] border border-dashed border-[#2F2F3B] text-[11px] text-zinc-400 hover:text-white transition-colors"
                              >
                                <Paperclip className="w-3 h-3" />
                                <span>Anexar</span>
                              </button>
                            )
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono-tabular mt-0.5">
                          {order.buyerPhone} · {formatDateTime(order.createdAt)}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-zinc-200 font-medium max-w-[250px] truncate text-[13px]">
                        {camp?.title ?? "Rifa removida"}
                      </td>

                      <td className="py-3 px-4 max-w-[190px]">
                        <div className="text-xs font-mono-tabular text-zinc-300 truncate">
                          {numsLabel}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono-tabular">
                          {order.quotas.length}{" "}
                          {order.quotas.length === 1 ? "número" : "números"}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-white whitespace-nowrap text-[13px]">
                        {formatCurrency(order.totalAmount)}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {order.status === "pago" ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Confirmado</span>
                          </span>
                        ) : order.status === "pendente" ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Aguardando Pix</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Cancelado</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {order.status === "pendente" && (
                            <button
                              type="button"
                              onClick={() => onConfirmPayment(order.id)}
                              className="px-3 py-1 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-xs font-medium text-emerald-400"
                            >
                              Confirmar Pix
                            </button>
                          )}
                          {order.status !== "cancelado" && (
                            <button
                              type="button"
                              onClick={() => onCancelOrder(order.id)}
                              title="Cancelar e liberar números"
                              className="p-1.5 rounded-full text-zinc-500 hover:text-red-400 hover:bg-[#1B1B22]"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReceiptModal
        order={viewingReceiptOrder}
        campaignTitle={
          viewingReceiptOrder
            ? campaignMap.get(viewingReceiptOrder.campaignId)?.title ?? "Rifa"
            : ""
        }
        onClose={() => setViewingReceiptOrder(null)}
      />
    </div>
  );
};
