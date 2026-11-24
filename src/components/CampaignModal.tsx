import React, { useState, useEffect } from "react";
import { X, Check, AlertCircle } from "lucide-react";
import { DEFAULT_TEN_PRIZES, PRIZE_GALLERY } from "../data/seedData";
import {
  ConfirmationMode,
  DrawMethod,
  PrizeStockItem,
  RaffleCampaign,
  RafflePrize,
} from "../types/raffle";
import { formatCurrency } from "../utils/formatters";
import { PrizeImage } from "./PrizeImage";

interface CampaignModalProps {
  isOpen: boolean;
  hasActiveWeeklyRaffle: boolean;
  defaultGroupName: string;
  prizeStock: PrizeStockItem[];
  editingCampaign?: RaffleCampaign | null;
  onClose: () => void;
  onSave: (data: {
    title: string;
    weekLabel: string;
    whatsappGroupName: string;
    image: string;
    prizes: RafflePrize[];
    ticketPrice: number;
    drawMethod: DrawMethod;
    scheduledDrawDate: string;
    pixKey: string;
    pixBeneficiary: string;
    reservationMinutes: number;
    confirmationMode: ConfirmationMode;
  }) => Promise<void> | void;
}

export const CampaignModal: React.FC<CampaignModalProps> = ({
  isOpen,
  hasActiveWeeklyRaffle,
  defaultGroupName,
  prizeStock,
  editingCampaign,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState("");
  const [weekLabel, setWeekLabel] = useState("");
  const [whatsappGroupName, setWhatsappGroupName] = useState(defaultGroupName);
  const [image, setImage] = useState(PRIZE_GALLERY[0].image);
  const [ticketPrice, setTicketPrice] = useState("120");
  const [drawMethod, setDrawMethod] = useState<DrawMethod>("sorteio_ao_vivo");
  const [scheduledDrawDate, setScheduledDrawDate] = useState("2026-11-24T21:00");
  const [pixKey, setPixKey] = useState("");
  const [pixBeneficiary, setPixBeneficiary] = useState("");
  const [reservationMinutes, setReservationMinutes] = useState("30");
  const [confirmationMode, setConfirmationMode] =
    useState<ConfirmationMode>("manual");
  const [prizes, setPrizes] = useState<RafflePrize[]>(DEFAULT_TEN_PRIZES);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    if (editingCampaign) {
      setTitle(editingCampaign.title);
      setWeekLabel(editingCampaign.weekLabel);
      setWhatsappGroupName(editingCampaign.whatsappGroupName);
      setImage(editingCampaign.image);
      setTicketPrice(String(editingCampaign.ticketPrice));
      setDrawMethod(editingCampaign.drawMethod);
      setScheduledDrawDate(editingCampaign.scheduledDrawDate.slice(0, 16));
      setPixKey(editingCampaign.pixKey || "");
      setPixBeneficiary(editingCampaign.pixBeneficiary || "");
      setReservationMinutes(String(editingCampaign.reservationMinutes || 30));
      setConfirmationMode(editingCampaign.confirmationMode || "manual");
      setPrizes(
        editingCampaign.prizes.length === 10
          ? editingCampaign.prizes
          : DEFAULT_TEN_PRIZES
      );
    } else {
      setTitle("Mega Rifa Hold Prêmios #47 (10 Prêmios)");
      setWeekLabel("Semana 47 · 18 a 24 Nov");
      setWhatsappGroupName(defaultGroupName);
      setImage(PRIZE_GALLERY[0].image);
      setTicketPrice("120");
      setDrawMethod("sorteio_ao_vivo");
      setScheduledDrawDate("2026-11-24T21:00");
      setPixKey("");
      setPixBeneficiary("HOLD PREMIOS");
      setReservationMinutes("30");
      setConfirmationMode("manual");
      setPrizes(DEFAULT_TEN_PRIZES);
    }
    setError("");
  }, [isOpen, editingCampaign, defaultGroupName]);

  if (!isOpen) return null;

  const parsedPrice = Number(ticketPrice.replace(",", "."));
  const potentialTotal = Number.isFinite(parsedPrice) ? parsedPrice * 100 : 0;
  const totalInvested = prizes.reduce(
    (acc, p) => acc + (Number(p.investedValue) || 0),
    0
  );

  const handlePrizeTitleChange = (position: number, value: string) => {
    setPrizes((prev) =>
      prev.map((p) => (p.position === position ? { ...p, title: value } : p))
    );
  };

  const handlePrizeValueChange = (position: number, value: string) => {
    const num = Number(value.replace(",", "."));
    setPrizes((prev) =>
      prev.map((p) =>
        p.position === position
          ? { ...p, investedValue: Number.isFinite(num) ? num : 0 }
          : p
      )
    );
  };

  const handleAssignFromStock = (position: number, stockId: string) => {
    if (!stockId) return;
    const item = prizeStock.find((s) => s.id === stockId);
    if (!item) return;
    setPrizes((prev) =>
      prev.map((p) =>
        p.position === position
          ? {
              ...p,
              title: item.name,
              investedValue: item.investedValue,
              stockItemId: item.id,
            }
          : p
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Informe o nome da rifa.");
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError("Informe um valor válido por número.");
      return;
    }

    const sanitizedPrizes = prizes.map((p, idx) => ({
      position: idx + 1,
      title: p.title.trim() || `${idx + 1}º Prêmio Hold Prêmios`,
      investedValue: Number(p.investedValue) || 0,
      stockItemId: p.stockItemId,
    }));

    await onSave({
      title: title.trim(),
      weekLabel: weekLabel.trim() || "Rifa da Semana",
      whatsappGroupName: whatsappGroupName.trim() || defaultGroupName,
      image,
      prizes: sanitizedPrizes,
      ticketPrice: parsedPrice,
      drawMethod,
      scheduledDrawDate,
      pixKey: pixKey.trim(),
      pixBeneficiary: pixBeneficiary.trim(),
      reservationMinutes: Math.max(5, Number(reservationMinutes) || 30),
      confirmationMode,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[22px] bg-[#121216] border border-[#262630] p-6"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#1E1E26]">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {editingCampaign ? "Editar Rifa" : "Criar Rifa Semanal (1–100)"}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Rifa semanal com 100 números (1–100), regras de Pix e 10 prêmios
              vinculados ao estoque.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="w-9 h-9 rounded-full bg-[#18181F] text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {!editingCampaign && hasActiveWeeklyRaffle && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#181206] border border-[#FFB000]/45 text-xs text-[#FFB000]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Rola apenas 1 rifa por semana. Ao criar esta nova rifa, a rifa
                ativa da semana anterior será encerrada automaticamente no
                histórico.
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-2">
              Capa da Rifa (Catálogo Hold Prêmios)
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {PRIZE_GALLERY.map((preset) => {
                const selected = image === preset.image;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setImage(preset.image)}
                    title={preset.label}
                    className={`relative rounded-lg overflow-hidden border aspect-square ${
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
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Nome da Rifa
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm text-white focus:outline-none focus:border-[#FF7900]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Semana / Período
              </label>
              <input
                type="text"
                value={weekLabel}
                onChange={(e) => setWeekLabel(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm text-white focus:outline-none focus:border-[#FF7900]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Grupo do WhatsApp
              </label>
              <input
                type="text"
                value={whatsappGroupName}
                onChange={(e) => setWhatsappGroupName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm text-white focus:outline-none focus:border-[#FF7900]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Valor por Número (R$) · Lista fixa 1–100
              </label>
              <input
                type="number"
                min="1"
                step="0.5"
                value={ticketPrice}
                onChange={(e) => setTicketPrice(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm font-mono-tabular text-white focus:outline-none focus:border-[#FF7900]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Previsão da Semana
              </label>
              <input
                type="datetime-local"
                value={scheduledDrawDate}
                onChange={(e) => setScheduledDrawDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm font-mono-tabular text-white focus:outline-none focus:border-[#FF7900]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Chave Pix
              </label>
              <input
                type="text"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                placeholder="CPF, CNPJ, telefone ou aleatória"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm font-mono-tabular text-white focus:outline-none focus:border-[#FF7900]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Favorecido Pix
              </label>
              <input
                type="text"
                value={pixBeneficiary}
                onChange={(e) => setPixBeneficiary(e.target.value)}
                placeholder="Nome exibido no comprovante"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm text-white focus:outline-none focus:border-[#FF7900]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Tempo de Reserva (minutos)
              </label>
              <input
                type="number"
                min="5"
                max="1440"
                value={reservationMinutes}
                onChange={(e) => setReservationMinutes(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm font-mono-tabular text-white focus:outline-none focus:border-[#FF7900]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Modo de Confirmação
              </label>
              <select
                value={confirmationMode}
                onChange={(e) =>
                  setConfirmationMode(e.target.value as ConfirmationMode)
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm text-white focus:outline-none focus:border-[#FF7900]"
              >
                <option value="banco">Banco (Pix recebido)</option>
                <option value="manual">Manual (admin confere)</option>
                <option value="ia">IA (regras rígidas)</option>
              </select>
            </div>
          </div>

          {confirmationMode === "ia" && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/45 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>
                A IA pode ser enganada por comprovante falso bem feito. Confira
                o resumo diário com o extrato do banco.
              </span>
            </div>
          )}

          <div className="rounded-2xl bg-[#0D0D11] border border-[#1E1E26] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#1E1E26]">
              <span className="text-xs font-semibold text-white">
                Os 10 Prêmios desta Rifa & Custo Investido
              </span>
              <span className="font-mono-tabular text-xs font-semibold text-[#FFB000]">
                Total Investido: {formatCurrency(totalInvested)}
              </span>
            </div>

            <div className="space-y-2">
              {prizes.map((p) => (
                <div
                  key={p.position}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                >
                  <div className="sm:col-span-1 text-xs font-mono-tabular font-semibold text-[#FFB000]">
                    {String(p.position).padStart(2, "0")}º
                  </div>
                  <div className="sm:col-span-4">
                    <select
                      value={p.stockItemId || ""}
                      onChange={(e) =>
                        handleAssignFromStock(p.position, e.target.value)
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#18181F] border border-[#262630] text-xs text-zinc-300 focus:outline-none focus:border-[#FF7900]"
                    >
                      <option value="">Puxar do estoque...</option>
                      {prizeStock.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({formatCurrency(s.investedValue)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-5">
                    <input
                      type="text"
                      value={p.title}
                      onChange={(e) =>
                        handlePrizeTitleChange(p.position, e.target.value)
                      }
                      className="w-full px-3 py-1.5 rounded-lg bg-[#18181F] border border-[#262630] text-xs text-white focus:outline-none focus:border-[#FF7900]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={p.investedValue ?? 0}
                      onChange={(e) =>
                        handlePrizeValueChange(p.position, e.target.value)
                      }
                      title="Valor investido (R$)"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#18181F] border border-[#262630] text-xs font-mono-tabular text-[#FFB000] text-right focus:outline-none focus:border-[#FF7900]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-[#0D0D11] border border-[#1E1E26] grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#1E1E26] text-xs">
            <div className="px-4 py-3">
              <div className="text-zinc-400">Prêmios Investidos</div>
              <div className="font-mono-tabular font-semibold text-sm text-[#FFB000] mt-0.5">
                {formatCurrency(totalInvested)}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-zinc-400">Arrecadação Bruta (100/100)</div>
              <div className="font-mono-tabular font-semibold text-sm text-white mt-0.5">
                {formatCurrency(potentialTotal)}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-zinc-400">Lucro Projetado (100/100)</div>
              <div className="font-mono-tabular font-semibold text-sm text-emerald-400 mt-0.5">
                {formatCurrency(potentialTotal - totalInvested)}
              </div>
            </div>
          </div>

          {error && (
            <p className="text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3.5 py-2.5">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1E1E26]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-medium text-zinc-300 hover:text-white hover:bg-[#18181F] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-full bg-white hover:bg-[#FF7900] text-zinc-950 text-xs font-semibold transition-colors"
            >
              {editingCampaign ? "Salvar Alterações" : "Criar Rifa da Semana"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
