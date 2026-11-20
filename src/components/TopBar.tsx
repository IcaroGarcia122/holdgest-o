import React, { useMemo, useState } from "react";
import { ListOrdered, Menu, Package, Plus, Search, X } from "lucide-react";
import {
  ActiveView,
  PrizeStockItem,
  RaffleCampaign,
  RaffleOrder,
} from "../types/raffle";
import { formatCurrency, formatQuotaNumber } from "../utils/formatters";

interface TopBarProps {
  activeCampaign: RaffleCampaign | null;
  orders: RaffleOrder[];
  prizeStock: PrizeStockItem[];
  onNavigate: (view: ActiveView) => void;
  onOpenMobileMenu: () => void;
  onOpenNewCampaign: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeCampaign,
  orders,
  prizeStock,
  onNavigate,
  onOpenMobileMenu,
  onOpenNewCampaign,
}) => {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const formattedToday = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
      }).format(new Date());
    } catch {
      return "Hoje";
    }
  }, []);

  const quickResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const matches: {
      id: string;
      label: string;
      sub: string;
      view: ActiveView;
    }[] = [];

    for (const o of orders) {
      if (o.status === "cancelado") continue;
      if (
        o.buyerName.toLowerCase().includes(q) ||
        o.quotas.some((n) => formatQuotaNumber(n).includes(q))
      ) {
        matches.push({
          id: `o-${o.id}`,
          label: o.buyerName,
          sub: `Lista 1–100 · Nº ${o.quotas
            .slice(0, 4)
            .map(formatQuotaNumber)
            .join(", ")}${o.quotas.length > 4 ? "..." : ""}`,
          view: "list100",
        });
      }
      if (matches.length >= 4) break;
    }

    for (const item of prizeStock) {
      if (item.name.toLowerCase().includes(q)) {
        matches.push({
          id: `s-${item.id}`,
          label: item.name,
          sub: `Estoque · ${item.quantity} un. · ${formatCurrency(item.investedValue)}`,
          view: "inventory",
        });
      }
      if (matches.length >= 6) break;
    }

    return matches;
  }, [query, orders, prizeStock]);

  return (
    <header className="sticky top-0 z-30 px-4 sm:px-6 lg:px-8 pt-4 pb-2 bg-[#070709]">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Mobile Toggle + Rounded Search Bar + Date */}
        <div className="flex items-center gap-3 sm:gap-5 flex-1 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Abrir menu"
            className="lg:hidden w-10 h-10 rounded-full bg-[#121216] border border-[#22222B] text-zinc-300 hover:text-white flex items-center justify-center shrink-0"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div className="relative w-full max-w-[300px]">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 180)}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar nome, número ou prêmio..."
              className="w-full pl-10 pr-8 py-2 rounded-full bg-[#121216] border border-[#202028] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF7900] transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpar busca"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {focused && query.trim() && (
              <div className="absolute left-0 right-0 mt-2 rounded-2xl bg-[#121216] border border-[#262630] p-1.5 z-50">
                {quickResults.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-zinc-500 text-center">
                    Nenhum resultado encontrado
                  </div>
                ) : (
                  quickResults.map((res) => (
                    <button
                      key={res.id}
                      type="button"
                      onMouseDown={() => {
                        onNavigate(res.view);
                        setQuery("");
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#1A1A21] transition-colors"
                    >
                      <div className="text-xs font-medium text-white truncate">
                        {res.label}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate">
                        {res.sub}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <span className="hidden md:inline text-xs font-medium text-zinc-400 whitespace-nowrap capitalize">
            {formattedToday}
            {activeCampaign ? ` · ${activeCampaign.weekLabel}` : ""}
          </span>
        </div>

        {/* Right: Circular Utility Buttons + Primary Create CTA */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate("list100")}
            title="Abrir Lista 1–100"
            aria-label="Abrir Lista 1–100"
            className="hidden sm:flex w-10 h-10 rounded-full bg-[#121216] border border-[#202028] hover:border-[#FF7900] text-zinc-300 hover:text-white items-center justify-center transition-colors"
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate("inventory")}
            title="Abrir Estoque de Prêmios"
            aria-label="Abrir Estoque de Prêmios"
            className="hidden sm:flex w-10 h-10 rounded-full bg-[#121216] border border-[#202028] hover:border-[#FF7900] text-zinc-300 hover:text-white items-center justify-center transition-colors"
          >
            <Package className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenNewCampaign}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FF7900] hover:bg-[#FFB000] text-black text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Nova Rifa</span>
          </button>
        </div>
      </div>
    </header>
  );
};
