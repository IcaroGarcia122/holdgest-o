import React, { useState, useMemo } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Check,
  Package,
  Minus,
} from "lucide-react";
import { PRIZE_GALLERY } from "../data/seedData";
import {
  PrizeCategory,
  PrizeStockItem,
  PrizeStockStatus,
} from "../types/raffle";
import { formatCurrency } from "../utils/formatters";
import { PrizeImage } from "./PrizeImage";

interface PrizeInventoryViewProps {
  prizeStock: PrizeStockItem[];
  stockSummary: {
    totalItems: number;
    totalUnits: number;
    availableUnits: number;
    totalInvested: number;
  };
  onAddPrize: (input: {
    name: string;
    category: PrizeCategory;
    image: string;
    investedValue: number;
    quantity: number;
    status: PrizeStockStatus;
    supplier?: string;
    notes?: string;
  }) => void;
  onUpdatePrize: (id: string, patch: Partial<PrizeStockItem>) => void;
  onDeletePrize: (id: string) => void;
}

const CATEGORIES: PrizeCategory[] = [
  "Eletrônicos",
  "Eletrodomésticos",
  "Bebidas & Bar",
  "Veículos",
  "Pix / Vouchers",
  "Outros",
];

export const PrizeInventoryView: React.FC<PrizeInventoryViewProps> = ({
  prizeStock,
  stockSummary,
  onAddPrize,
  onUpdatePrize,
  onDeletePrize,
}) => {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("todas");
  const [statusFilter, setStatusFilter] = useState<"todos" | PrizeStockStatus>(
    "todos"
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PrizeStockItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<PrizeCategory>("Eletrônicos");
  const [image, setImage] = useState(PRIZE_GALLERY[0].image);
  const [investedValue, setInvestedValue] = useState("1000");
  const [quantity, setQuantity] = useState("1");
  const [status, setStatus] = useState<PrizeStockStatus>("disponivel");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  const filteredStock = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prizeStock.filter((item) => {
      if (categoryFilter !== "todas" && item.category !== categoryFilter)
        return false;
      if (statusFilter !== "todos" && item.status !== statusFilter)
        return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.supplier?.toLowerCase().includes(q) ?? false) ||
        (item.notes?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [prizeStock, search, categoryFilter, statusFilter]);

  const openNewModal = () => {
    setEditingItem(null);
    setName("");
    setCategory("Eletrônicos");
    setImage(PRIZE_GALLERY[0].image);
    setInvestedValue("1500");
    setQuantity("1");
    setStatus("disponivel");
    setSupplier("");
    setNotes("");
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (item: PrizeStockItem) => {
    setEditingItem(item);
    setName(item.name);
    setCategory(item.category);
    setImage(item.image);
    setInvestedValue(String(item.investedValue));
    setQuantity(String(item.quantity));
    setStatus(item.status);
    setSupplier(item.supplier ?? "");
    setNotes(item.notes ?? "");
    setFormError("");
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(investedValue.replace(",", "."));
    const qty = parseInt(quantity, 10);
    if (!name.trim()) {
      setFormError("Informe o nome do prêmio.");
      return;
    }
    if (!Number.isFinite(val) || val < 0) {
      setFormError("Informe um valor investido válido.");
      return;
    }
    if (!Number.isFinite(qty) || qty < 0) {
      setFormError("Informe uma quantidade válida.");
      return;
    }

    if (editingItem) {
      onUpdatePrize(editingItem.id, {
        name: name.trim(),
        category,
        image,
        investedValue: val,
        quantity: qty,
        status,
        supplier: supplier.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    } else {
      onAddPrize({
        name: name.trim(),
        category,
        image,
        investedValue: val,
        quantity: qty,
        status,
        supplier: supplier.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-white">
            Estoque de Prêmios
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Controle de prêmios adquiridos, valor unitário e capital investido.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-[#FF7900] text-black text-xs font-semibold transition-colors self-start sm:self-auto whitespace-nowrap"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Registrar Prêmio</span>
        </button>
      </div>

      {/* Bento 3-Card Metric Strip (White Featured + 2 Dark Cards) */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-[22px] bg-white text-zinc-950 p-5 flex flex-col justify-between">
          <div className="text-xs font-medium text-zinc-500">
            Capital Investido em Estoque
          </div>
          <div className="my-2 font-mono-tabular font-bold text-2xl sm:text-[28px] text-zinc-950">
            {formatCurrency(stockSummary.totalInvested)}
          </div>
          <div className="text-xs text-zinc-500">
            Soma de todas as unidades cadastradas
          </div>
        </div>

        <div className="rounded-[22px] bg-[#121216] border border-[#1E1E26] p-5 flex flex-col justify-between">
          <div className="text-xs font-medium text-zinc-400">
            Itens Cadastrados
          </div>
          <div className="my-2 font-mono-tabular font-bold text-2xl sm:text-[28px] text-white">
            {stockSummary.totalItems}
          </div>
          <div className="text-xs text-zinc-500">
            Modelos distintos no catálogo
          </div>
        </div>

        <div className="rounded-[22px] bg-[#121216] border border-[#1E1E26] p-5 flex flex-col justify-between">
          <div className="text-xs font-medium text-zinc-400">
            Unidades em Estoque
          </div>
          <div className="my-2 font-mono-tabular font-bold text-2xl sm:text-[28px] text-white">
            {stockSummary.totalUnits}
          </div>
          <div className="text-xs text-emerald-400 font-mono-tabular">
            {stockSummary.availableUnits} prontas para próximas rifas
          </div>
        </div>
      </section>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[#121216] border border-[#1E1E26] self-start">
          {(
            [
              { id: "todos", label: "Todos" },
              { id: "disponivel", label: "Disponíveis" },
              { id: "reservado_rifa", label: "Em Rifa" },
              { id: "esgotado", label: "Esgotados" },
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
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 rounded-full bg-[#121216] border border-[#1E1E26] text-xs text-white focus:outline-none focus:border-[#FF7900]"
          >
            <option value="todas">Todas as categorias</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar prêmio ou fornecedor..."
              className="w-full pl-10 pr-3 py-2 rounded-full bg-[#121216] border border-[#1E1E26] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF7900]"
            />
          </div>
        </div>
      </div>

      {/* Stock Table */}
      <div className="rounded-[22px] bg-[#121216] border border-[#1E1E26] overflow-hidden">
        {filteredStock.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-white">
              Nenhum prêmio encontrado no estoque
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Cadastre um novo prêmio para controlar seu investimento.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E1E26] bg-[#0D0D11] text-[11px] font-medium text-zinc-400">
                  <th className="py-3 px-4">Prêmio</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4">Fornecedor / Local</th>
                  <th className="py-3 px-4 text-right">Valor Unitário</th>
                  <th className="py-3 px-4 text-center">Estoque</th>
                  <th className="py-3 px-4 text-right">Total Investido</th>
                  <th className="py-3 px-4">Situação</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A22] text-sm">
                {filteredStock.map((item) => {
                  const totalItemVal = item.investedValue * item.quantity;
                  const isDeleting = confirmDeleteId === item.id;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-[#16161C] transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <PrizeImage
                            src={item.image}
                            alt={item.name}
                            className="w-10 h-10 rounded-xl shrink-0 border border-[#272730]"
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-white text-[13px]">
                              {item.name}
                            </div>
                            {item.notes && (
                              <div className="text-xs text-zinc-500 truncate max-w-[260px]">
                                {item.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-xs text-zinc-300 whitespace-nowrap">
                        {item.category}
                      </td>

                      <td className="py-3 px-4 text-xs text-zinc-400">
                        {item.supplier || "—"}
                      </td>

                      <td className="py-3 px-4 text-right font-mono-tabular text-[13px] text-zinc-200 whitespace-nowrap">
                        {formatCurrency(item.investedValue)}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdatePrize(item.id, {
                                quantity: Math.max(0, item.quantity - 1),
                              })
                            }
                            aria-label="Diminuir quantidade"
                            className="w-6 h-6 rounded-full bg-[#18181F] border border-[#272730] hover:border-[#FF7900] flex items-center justify-center text-zinc-300"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-8 text-center font-mono-tabular font-semibold text-white text-[13px]">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdatePrize(item.id, {
                                quantity: item.quantity + 1,
                              })
                            }
                            aria-label="Aumentar quantidade"
                            className="w-6 h-6 rounded-full bg-[#18181F] border border-[#272730] hover:border-[#FF7900] flex items-center justify-center text-zinc-300"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-[#FFB000] whitespace-nowrap text-[13px]">
                        {formatCurrency(totalItemVal)}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <select
                          value={item.status}
                          onChange={(e) =>
                            onUpdatePrize(item.id, {
                              status: e.target.value as PrizeStockStatus,
                            })
                          }
                          className={`px-3 py-1 rounded-full border text-xs font-medium bg-[#18181F] focus:outline-none ${
                            item.status === "disponivel"
                              ? "border-emerald-500/35 text-emerald-400"
                              : item.status === "reservado_rifa"
                              ? "border-amber-500/40 text-amber-300"
                              : "border-red-500/35 text-red-400"
                          }`}
                        >
                          <option value="disponivel">Disponível</option>
                          <option value="reservado_rifa">Em Rifa</option>
                          <option value="esgotado">Esgotado</option>
                        </select>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            title="Editar prêmio"
                            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-[#1B1B22]"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {isDeleting ? (
                            <button
                              type="button"
                              onClick={() => {
                                onDeletePrize(item.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2.5 py-1 rounded-full bg-red-500 text-black text-xs font-semibold"
                            >
                              Excluir
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(item.id)}
                              title="Remover do estoque"
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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-[22px] bg-[#121216] border border-[#272730] p-6"
          >
            <div className="flex items-center justify-between pb-4 border-b border-[#1E1E26]">
              <h2 className="text-lg font-semibold text-white">
                {editingItem
                  ? "Editar Prêmio no Estoque"
                  : "Registrar Prêmio em Estoque"}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-[#18181D]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-2">
                  Imagem do Prêmio
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {PRIZE_GALLERY.map((preset) => {
                    const selected = image === preset.image;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setImage(preset.image)}
                        className={`relative rounded-xl overflow-hidden border aspect-square ${
                          selected
                            ? "border-[#FF7900] ring-2 ring-[#FF7900]"
                            : "border-[#272730] opacity-75 hover:opacity-100"
                        }`}
                      >
                        <PrizeImage
                          src={preset.image}
                          alt={preset.label}
                          className="w-full h-full"
                        />
                        {selected && (
                          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#FF7900] text-black flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Nome do Prêmio
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: PlayStation 5 Slim 1TB"
                    className="w-full px-3.5 py-2 rounded-xl bg-[#18181F] border border-[#272730] text-sm text-white focus:outline-none focus:border-[#FF7900]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Categoria
                  </label>
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as PrizeCategory)
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-[#18181F] border border-[#272730] text-sm text-white focus:outline-none focus:border-[#FF7900]"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Situação
                  </label>
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as PrizeStockStatus)
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-[#18181F] border border-[#272730] text-sm text-white focus:outline-none focus:border-[#FF7900]"
                  >
                    <option value="disponivel">Disponível</option>
                    <option value="reservado_rifa">Em Rifa Atual</option>
                    <option value="esgotado">Esgotado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Valor Investido / Pago (R$)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={investedValue}
                    onChange={(e) => setInvestedValue(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#18181F] border border-[#272730] text-sm font-mono-tabular text-white focus:outline-none focus:border-[#FF7900]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Quantidade em Estoque
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#18181F] border border-[#272730] text-sm font-mono-tabular text-white focus:outline-none focus:border-[#FF7900]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Fornecedor (opcional)
                  </label>
                  <input
                    type="text"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder="Ex: Distribuidora Tech Sul"
                    className="w-full px-3.5 py-2 rounded-xl bg-[#18181F] border border-[#272730] text-sm text-white focus:outline-none focus:border-[#FF7900]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Observações / Localização
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="NF, voltagem, onde está guardado..."
                    className="w-full px-3.5 py-2 rounded-xl bg-[#18181F] border border-[#272730] text-sm text-white focus:outline-none focus:border-[#FF7900]"
                  />
                </div>
              </div>

              {formError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1E1E26]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-full text-xs font-medium text-zinc-300 hover:text-white hover:bg-[#18181D]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-[#FF7900] hover:bg-[#FFB000] text-black text-xs font-semibold"
                >
                  {editingItem ? "Salvar Alterações" : "Salvar no Estoque"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
