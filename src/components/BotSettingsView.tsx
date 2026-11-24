import React, { useEffect, useState } from "react";
import { Check, DatabaseBackup, KeyRound, Save, ShieldCheck, Webhook } from "lucide-react";
import {
  BotSettings,
  ConfirmationMode,
  RaffleCampaign,
} from "../types/raffle";

interface BotSettingsViewProps {
  activeCampaign: RaffleCampaign | null;
  botSettings: BotSettings;
  hasLocalBackup: boolean;
  onSaveSettings: (
    patch: Partial<BotSettings> & {
      activeCampaignId?: string;
      pixKey?: string;
      pixBeneficiary?: string;
      reservationMinutes?: number;
      confirmationMode?: ConfirmationMode;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  onImportLocalData: () => Promise<{ ok: boolean; error?: string }>;
}

export const BotSettingsView: React.FC<BotSettingsViewProps> = ({
  activeCampaign,
  botSettings,
  hasLocalBackup,
  onSaveSettings,
  onImportLocalData,
}) => {
  const [groupName, setGroupName] = useState(botSettings.groupName);
  const [groupJid, setGroupJid] = useState(botSettings.groupJid || "");
  const [outboundWebhookUrl, setOutboundWebhookUrl] = useState(
    botSettings.outboundWebhookUrl || ""
  );
  const [adminPhonesText, setAdminPhonesText] = useState(
    (botSettings.adminPhones || []).join(", ")
  );
  const [autoConfirmWithAi, setAutoConfirmWithAi] = useState(
    botSettings.autoConfirmWithAi
  );

  const [pixKey, setPixKey] = useState(activeCampaign?.pixKey || "");
  const [pixBeneficiary, setPixBeneficiary] = useState(
    activeCampaign?.pixBeneficiary || ""
  );
  const [reservationMinutes, setReservationMinutes] = useState(
    String(activeCampaign?.reservationMinutes || 30)
  );
  const [confirmationMode, setConfirmationMode] = useState<ConfirmationMode>(
    activeCampaign?.confirmationMode || "manual"
  );

  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  useEffect(() => {
    setGroupName(botSettings.groupName);
    setGroupJid(botSettings.groupJid || "");
    setOutboundWebhookUrl(botSettings.outboundWebhookUrl || "");
    setAdminPhonesText((botSettings.adminPhones || []).join(", "));
    setAutoConfirmWithAi(botSettings.autoConfirmWithAi);
  }, [botSettings]);

  useEffect(() => {
    setPixKey(activeCampaign?.pixKey || "");
    setPixBeneficiary(activeCampaign?.pixBeneficiary || "");
    setReservationMinutes(String(activeCampaign?.reservationMinutes || 30));
    setConfirmationMode(activeCampaign?.confirmationMode || "manual");
  }, [activeCampaign]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setSaving(true);
    const adminPhones = adminPhonesText
      .split(/[,\n]/)
      .map((p) => p.trim())
      .filter(Boolean);

    const res = await onSaveSettings({
      groupName: groupName.trim(),
      groupJid: groupJid.trim(),
      outboundWebhookUrl: outboundWebhookUrl.trim(),
      adminPhones,
      autoConfirmWithAi,
      ...(activeCampaign
        ? {
            activeCampaignId: activeCampaign.id,
            pixKey: pixKey.trim(),
            pixBeneficiary: pixBeneficiary.trim(),
            reservationMinutes: Math.max(5, Number(reservationMinutes) || 30),
            confirmationMode,
          }
        : {}),
    });
    setSaving(false);

    if (!res.ok) {
      setStatusMsg({
        type: "err",
        text: res.error || "Não foi possível salvar configurações.",
      });
    } else {
      setStatusMsg({
        type: "ok",
        text: "Configurações salvas no Supabase com sucesso.",
      });
    }
  };

  const handleImport = async () => {
    setStatusMsg(null);
    setImporting(true);
    const res = await onImportLocalData();
    setImporting(false);
    if (!res.ok) {
      setStatusMsg({
        type: "err",
        text: res.error || "Falha ao importar dados do navegador.",
      });
    } else {
      setStatusMsg({
        type: "ok",
        text: "Dados antigos do navegador migrados para o Supabase.",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-white">
            Configurações do Bot & Pix
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Chave Pix da rifa ativa, modo de confirmação (Banco vs. Manual),
            grupo WhatsApp e webhook de saída para o n8n.
          </p>
        </div>

        {hasLocalBackup && (
          <button
            type="button"
            disabled={importing}
            onClick={handleImport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#181206] border border-[#FFB000]/50 text-xs font-semibold text-[#FFB000] hover:bg-[#FFB000] hover:text-black transition-colors self-start sm:self-auto"
          >
            <DatabaseBackup className="w-4 h-4" />
            <span>
              {importing ? "Importando..." : "Importar dados do navegador"}
            </span>
          </button>
        )}
      </div>

      {statusMsg && (
        <div
          className={`rounded-xl px-4 py-3 text-xs font-medium border flex items-center gap-2 ${
            statusMsg.type === "ok"
              ? "bg-emerald-500/10 border-emerald-500/35 text-emerald-300"
              : "bg-red-500/10 border-red-500/35 text-red-300"
          }`}
        >
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusMsg.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Pix & Active Raffle Confirmation Rules */}
        <section className="lg:col-span-6 rounded-[22px] bg-[#121216] border border-[#1E1E26] p-6 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#1E1E26]">
            <KeyRound className="w-4 h-4 text-[#FF7900]" />
            <h2 className="text-base font-semibold text-white">
              Regras Pix da Rifa Ativa
            </h2>
          </div>

          {!activeCampaign ? (
            <p className="text-xs text-zinc-400">
              Nenhuma rifa ativa no momento. Crie ou reative uma rifa para
              configurar chave Pix, prazo de reserva e modo de confirmação.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#0D0D11] border border-[#1E1E26] px-3.5 py-2.5 text-xs text-zinc-300">
                Rifa ativa:{" "}
                <strong className="text-white">{activeCampaign.title}</strong>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Chave Pix Oficial
                </label>
                <input
                  type="text"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="CNPJ, telefone, e-mail ou chave aleatória"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm font-mono-tabular text-white focus:outline-none focus:border-[#FF7900]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Nome do Favorecido / Recebedor
                </label>
                <input
                  type="text"
                  value={pixBeneficiary}
                  onChange={(e) => setPixBeneficiary(e.target.value)}
                  placeholder="Ex: HOLD PREMIOS LTDA"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm text-white focus:outline-none focus:border-[#FF7900]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Expiração da Reserva (min)
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
                    <option value="manual">Manual (aprovação no painel)</option>
                    <option value="banco">Banco (E2E + webhook Pix)</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl bg-[#0D0D11] border border-[#1E1E26] p-3 text-[11px] text-zinc-400 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Regra de ouro: uma imagem de comprovante sozinha nunca confirma
                  o número. Em modo <strong>Banco</strong>, o E2E precisa bater
                  com o webhook do PSP; em <strong>Manual</strong>, fica em
                  análise até sua aprovação.
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Bot WhatsApp & Outbound Webhook */}
        <section className="lg:col-span-6 rounded-[22px] bg-[#121216] border border-[#1E1E26] p-6 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#1E1E26]">
            <Webhook className="w-4 h-4 text-[#FFB000]" />
            <h2 className="text-base font-semibold text-white">
              Grupo WhatsApp & Webhook n8n
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Nome do Grupo Oficial
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm text-white focus:outline-none focus:border-[#FF7900]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                JID do Grupo WhatsApp (opcional)
              </label>
              <input
                type="text"
                value={groupJid}
                onChange={(e) => setGroupJid(e.target.value)}
                placeholder="120363000000000000@g.us"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm font-mono-tabular text-white focus:outline-none focus:border-[#FF7900]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Telefones Administradores (separados por vírgula)
              </label>
              <input
                type="text"
                value={adminPhonesText}
                onChange={(e) => setAdminPhonesText(e.target.value)}
                placeholder="5511999999999, 5511988888888"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm font-mono-tabular text-white focus:outline-none focus:border-[#FF7900]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                URL do Webhook de Saída (n8n)
              </label>
              <input
                type="url"
                value={outboundWebhookUrl}
                onChange={(e) => setOutboundWebhookUrl(e.target.value)}
                placeholder="https://seu-n8n.com/webhook/hold-premios"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm font-mono-tabular text-white focus:outline-none focus:border-[#FF7900]"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Recebe eventos{" "}
                <code className="text-zinc-300">ORDER_CREATED</code>,{" "}
                <code className="text-zinc-300">ORDER_PAID</code>,{" "}
                <code className="text-zinc-300">ORDER_CANCELLED</code> e{" "}
                <code className="text-zinc-300">RIFA_COMPLETA</code> com
                header Bearer.
              </p>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF7900] hover:bg-[#FFB000] text-black text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "Salvando..." : "Salvar Configurações"}</span>
            </button>
          </div>
        </section>
      </form>
    </div>
  );
};
