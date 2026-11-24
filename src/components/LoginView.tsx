import React, { useState } from "react";
import { Lock, Mail, ArrowRight, AlertTriangle } from "lucide-react";
import { AuthStatus } from "../store/useRaffleStore";

interface LoginViewProps {
  authStatus: AuthStatus;
  onLogin: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
}

export const LoginView: React.FC<LoginViewProps> = ({ authStatus, onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Informe e-mail e senha de administrador.");
      return;
    }
    setSubmitting(true);
    const res = await onLogin(email.trim(), password);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error || "Não foi possível entrar.");
    }
  };

  if (authStatus === "loading") {
    return (
      <div className="min-h-screen bg-[#070709] text-zinc-100 flex items-center justify-center p-6">
        <div className="rounded-[22px] bg-[#121216] border border-[#1E1E26] px-8 py-6 text-center space-y-2">
          <img
            src="/assets/images/logo_hold_ouro.webp"
            alt="Hold Prêmios"
            className="w-10 h-10 object-contain mx-auto"
          />
          <p className="text-xs text-zinc-400">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[22px] bg-[#121216] border border-[#1E1E26] p-7 space-y-6">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#18181F] border border-[#262630] flex items-center justify-center shrink-0">
            <img
              src="/assets/images/logo_hold_ouro.webp"
              alt="Hold Prêmios"
              className="w-8 h-8 object-contain"
            />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              HOLD PRÊMIOS
            </h1>
            <p className="text-xs text-zinc-400">
              Painel Administrativo · Gestão de Rifas & Bot
            </p>
          </div>
        </div>

        {authStatus === "unconfigured" ? (
          <div className="rounded-2xl bg-[#181206] border border-[#FFB000]/45 p-4 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-semibold text-[#FFB000]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Banco Supabase não configurado</span>
            </div>
            <p className="text-zinc-300 leading-relaxed">
              Configure as variáveis{" "}
              <code className="text-white font-mono-tabular">SUPABASE_URL</code> e{" "}
              <code className="text-white font-mono-tabular">
                SUPABASE_SECRET_KEY
              </code>{" "}
              no servidor (ou na Vercel) e crie um usuário administrador em{" "}
              <strong>Authentication → Users</strong> no Supabase.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                E-mail do Administrador
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@holdpremios.com"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF7900]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#18181F] border border-[#262630] text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF7900]"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3.5 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-full bg-[#FF7900] hover:bg-[#FFB000] text-black text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <span>{submitting ? "Entrando..." : "Entrar no Painel"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
