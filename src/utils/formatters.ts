import { QuotaRowInfo, RaffleCampaign, RaffleOrder } from "../types/raffle";

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatQuotaNumber(num: number): string {
  return String(num).padStart(2, "0");
}

export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const datePart = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} · ${timePart}`;
}

export function formatShortDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function maskPhoneForStream(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return phone;
  const ddd = digits.slice(0, 2);
  const last4 = digits.slice(-4);
  return `(${ddd}) *****-${last4}`;
}

export function cleanPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

export function buildWhatsAppListText(
  campaign: RaffleCampaign,
  rows: QuotaRowInfo[]
): string {
  const header = [
    `*HOLD PRÊMIOS — ${campaign.title.toUpperCase()}*`,
    `📅 ${campaign.weekLabel} | 💰 ${formatCurrency(campaign.ticketPrice)} por número`,
    `🏆 *10 Prêmios na mesma rifa!*`,
    ``,
  ];

  const lines = rows.map((row) => {
    const numLabel = formatQuotaNumber(row.number);
    if (row.status === "paga" && row.order) {
      return `${numLabel} - ${row.order.buyerName} ✅`;
    }
    if (row.status === "reservada" && row.order) {
      return `${numLabel} - ${row.order.buyerName} ⏳`;
    }
    return `${numLabel} -`;
  });

  const confirmed = rows.filter((r) => r.status === "paga").length;
  const footer = [
    ``,
    `📊 Confirmados: *${confirmed}/100*`,
    `Envie seu número + comprovante Pix aqui no grupo para o bot confirmar na hora!`,
  ];

  return [...header, ...lines, ...footer].join("\n");
}

export function buildWhatsAppCompletionAlertText(campaign: RaffleCampaign): string {
  return [
    `🎉 *RIFA COMPLETA — 100/100 CONFIRMADOS!*`,
    `A rifa *${campaign.title}* (${campaign.weekLabel}) acabou de atingir todos os 100 números!`,
    ``,
    `🏆 *10 Prêmios em jogo:*`,
    ...campaign.prizes.map((p) => `${p.position}º Prêmio: ${p.title}`),
    ``,
    `Fiquem ligados aqui no Grupo VIP para o horário oficial do sorteio!`,
  ].join("\n");
}

export function buildWhatsAppReceiptText(
  order: RaffleOrder,
  campaign: RaffleCampaign
): string {
  const formattedNums = [...order.quotas]
    .sort((a, b) => a - b)
    .map((q) => formatQuotaNumber(q))
    .join(", ");

  const statusLine =
    order.status === "pago"
      ? "✅ Confirmado na lista"
      : "⏳ Reservado (aguardando comprovante Pix)";

  return [
    `*HOLD PRÊMIOS — Confirmação na Rifa*`,
    `Rifa: *${campaign.title}*`,
    `Nome: ${order.buyerName}`,
    `Números: *${formattedNums}*`,
    `Total: *${formatCurrency(order.totalAmount)}*`,
    `Status: ${statusLine}`,
  ].join("\n");
}

export function buildWhatsAppWinnerText(
  buyerName: string,
  campaignTitle: string,
  prizePosition: number,
  prizeTitle: string,
  quotaLabel: string
): string {
  return [
    `🏆 *PARABÉNS, ${buyerName.toUpperCase()}!*`,
    `Você ganhou o *${prizePosition}º Prêmio (${prizeTitle})* na rifa *${campaignTitle}* da HOLD PRÊMIOS com o número *${quotaLabel}*!`,
    ``,
    `Responda esta mensagem para combinarmos a retirada na Hold Prêmios ou envio.`,
  ].join("\n");
}

export function generateAuditHash(
  campaignId: string,
  quota: number,
  timestampIso: string
): string {
  const input = `${campaignId}:${quota}:${timestampIso}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const hex1 = (h1 >>> 0).toString(16).toUpperCase().padStart(8, "0");
  const hex2 = (h2 >>> 0).toString(16).toUpperCase().padStart(4, "0").slice(0, 4);
  return `HLD-${hex1.slice(0, 4)}-${hex2}`;
}

export function exportOrdersToCSV(
  orders: RaffleOrder[],
  campaigns: RaffleCampaign[]
): void {
  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));
  const headers = [
    "Pedido",
    "Rifa",
    "Participante",
    "WhatsApp",
    "Numeros",
    "Qtd",
    "Total (BRL)",
    "Pagamento",
    "Status",
    "Comprovante",
    "Data",
  ];

  const rows = orders.map((o) => {
    const camp = campaignMap.get(o.campaignId);
    const numsStr = o.quotas.map((q) => formatQuotaNumber(q)).join(" | ");
    return [
      o.id,
      camp?.title ?? "Rifa removida",
      o.buyerName,
      o.buyerPhone,
      numsStr,
      String(o.quotas.length),
      o.totalAmount.toFixed(2).replace(".", ","),
      o.paymentMethod.toUpperCase(),
      o.status.toUpperCase(),
      o.receipt ? (o.receipt.txId || "Anexado") : "Sem anexo",
      new Date(o.createdAt).toLocaleString("pt-BR"),
    ];
  });

  const csvContent =
    "\uFEFF" +
    [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")
      )
      .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hold-premios-rifa-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
