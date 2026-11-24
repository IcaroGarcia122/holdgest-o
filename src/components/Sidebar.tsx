import React from "react";
import {
  LayoutGrid,
  ListOrdered,
  ReceiptText,
  FileCheck2,
  Package,
  Trophy,
  Settings,
  LogOut,
  X,
} from "lucide-react";
import { ActiveView } from "../types/raffle";

interface SidebarProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  pendingOrdersCount: number;
  pendingReceiptsCount: number;
  activeConfirmedCount: number;
  userEmail: string | null;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  pendingOrdersCount,
  pendingReceiptsCount,
  activeConfirmedCount,
  userEmail,
  onLogout,
  mobileOpen,
  onCloseMobile,
}) => {
  const navItems: {
    id: ActiveView;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }[] = [
    {
      id: "overview",
      label: "Visão Geral",
      icon: <LayoutGrid className="w-[18px] h-[18px]" />,
    },
    {
      id: "list100",
      label: "Lista 1–100",
      icon: <ListOrdered className="w-[18px] h-[18px]" />,
      badge: `${activeConfirmedCount}`,
    },
    {
      id: "orders",
      label: "Pedidos & Pix",
      icon: <ReceiptText className="w-[18px] h-[18px]" />,
      badge: pendingOrdersCount > 0 ? String(pendingOrdersCount) : undefined,
    },
    {
      id: "receipts",
      label: "Comprovantes",
      icon: <FileCheck2 className="w-[18px] h-[18px]" />,
      badge:
        pendingReceiptsCount > 0 ? String(pendingReceiptsCount) : undefined,
    },
    {
      id: "inventory",
      label: "Estoque de Prêmios",
      icon: <Package className="w-[18px] h-[18px]" />,
    },
    {
      id: "campaigns",
      label: "Rifas & Histórico",
      icon: <Trophy className="w-[18px] h-[18px]" />,
    },
    {
      id: "settings",
      label: "Configurações do Bot",
      icon: <Settings className="w-[18px] h-[18px]" />,
    },
  ];

  const handleNav = (id: ActiveView) => {
    onSelectView(id);
    onCloseMobile();
  };

  return (
    <>
      {/* Desktop Slim Icon Rail (72px) */}
      <aside className="hidden lg:flex flex-col items-center justify-between w-[72px] shrink-0 h-screen sticky top-0 py-5 bg-[#0C0C0F] border-r border-[#1B1B22] select-none">
        {/* Top Hold Emblem */}
        <button
          type="button"
          onClick={() => handleNav("overview")}
          title="HOLD PRÊMIOS — Visão Geral"
          className="w-11 h-11 rounded-2xl bg-[#141419] border border-[#24242E] flex items-center justify-center hover:border-[#FF7900] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7900]"
        >
          <img
            src="/assets/images/logo_hold_ouro.webp"
            alt="Hold Prêmios"
            className="w-7 h-7 object-contain"
            referrerPolicy="no-referrer"
          />
        </button>

        {/* Center Navigation Icons */}
        <nav aria-label="Menu principal" className="flex flex-col items-center gap-2.5">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                title={item.label}
                aria-label={item.label}
                className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7900] ${
                  isActive
                    ? "bg-white text-black"
                    : "text-zinc-400 hover:text-white hover:bg-[#16161C]"
                }`}
              >
                {item.icon}
                {item.badge && !isActive && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF7900] text-black font-mono-tabular text-[10px] font-bold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Logout Utility */}
        <button
          type="button"
          onClick={onLogout}
          title={userEmail ? `Sair (${userEmail})` : "Sair do painel"}
          aria-label="Sair do painel"
          className="w-10 h-10 rounded-xl bg-[#141419] border border-[#22222B] text-zinc-400 hover:text-red-400 hover:border-red-500/40 flex items-center justify-center transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/80" onClick={onCloseMobile} />
          <div className="relative z-10 w-[260px] max-w-[82vw] h-full bg-[#0C0C0F] border-r border-[#1B1B22] flex flex-col p-4">
            <div className="flex items-center justify-between pb-4 border-b border-[#1B1B22]">
              <div className="flex items-center gap-2.5">
                <img
                  src="/assets/images/logo_hold_ouro.webp"
                  alt="Hold Prêmios"
                  className="w-8 h-8 object-contain"
                  referrerPolicy="no-referrer"
                />
                <span className="font-condensed font-black text-lg uppercase text-white">
                  HOLD <span className="text-[#FF7900]">PRÊMIOS</span>
                </span>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Fechar menu"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#16161C]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 py-4 space-y-1.5 overflow-y-auto">
              {navItems.map((item) => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNav(item.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-white text-black font-semibold"
                        : "text-zinc-400 hover:text-white hover:bg-[#16161C]"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {item.icon}
                      <span>{item.label}</span>
                    </span>
                    {item.badge && (
                      <span
                        className={`font-mono-tabular text-xs font-bold ${
                          isActive ? "text-black" : "text-[#FFB000]"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="space-y-2 pt-3 border-t border-[#1B1B22]">
              {userEmail && (
                <div className="px-2 text-[11px] text-zinc-500 truncate">
                  {userEmail}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  onCloseMobile();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#141419] border border-[#22222B] text-xs font-medium text-zinc-300 hover:text-red-400"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair do Painel</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
