export type CampaignStatus = "ativa" | "encerrada";

export type DrawMethod = "sorteio_ao_vivo" | "loteria_federal";

export type QuotaStatus = "disponivel" | "reservada" | "paga";

export type OrderStatus = "pago" | "pendente" | "cancelado";

export type PaymentMethod = "pix" | "dinheiro" | "cartao";

export type DeliveryStatus = "aguardando" | "retirado_bar" | "enviado";

export type ActiveView =
  | "overview"
  | "list100"
  | "orders"
  | "inventory"
  | "campaigns";

export type PrizeCategory =
  | "Eletrônicos"
  | "Eletrodomésticos"
  | "Bebidas & Bar"
  | "Veículos"
  | "Pix / Vouchers"
  | "Outros";

export type PrizeStockStatus = "disponivel" | "reservado_rifa" | "esgotado";

export interface PrizeStockItem {
  id: string;
  name: string;
  category: PrizeCategory;
  image: string;
  investedValue: number;
  quantity: number;
  status: PrizeStockStatus;
  supplier?: string;
  notes?: string;
  createdAt: string;
}

export interface RafflePrize {
  position: number;
  title: string;
  investedValue?: number;
  stockItemId?: string;
}

export interface ReceiptAttachment {
  imageUrl?: string;
  fileName?: string;
  txId?: string;
  verifiedBy: "ai_bot" | "manual";
  summary?: string;
  uploadedAt: string;
}

export interface RaffleCampaign {
  id: string;
  code: string;
  title: string;
  weekLabel: string;
  whatsappGroupName: string;
  image: string;
  prizes: RafflePrize[];
  ticketPrice: number;
  totalQuotas: 100;
  drawMethod: DrawMethod;
  scheduledDrawDate: string;
  status: CampaignStatus;
  createdAt: string;
  completedNotifiedAt?: string;
}

export interface RaffleOrder {
  id: string;
  campaignId: string;
  buyerName: string;
  buyerPhone: string;
  buyerNotes?: string;
  quotas: number[];
  unitPrice: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  receipt?: ReceiptAttachment;
  createdAt: string;
  paidAt?: string;
}

export interface WinnerRecord {
  id: string;
  campaignId: string;
  campaignCode: string;
  campaignTitle: string;
  prizePosition: number;
  prizeTitle: string;
  prizeImage: string;
  quotaNumber: number;
  buyerName: string;
  buyerPhone: string;
  drawMethod: DrawMethod;
  federalNumber?: string;
  auditHash: string;
  drawnAt: string;
  deliveryStatus: DeliveryStatus;
}

export interface BotActivityLog {
  id: string;
  timestamp: string;
  source: "whatsapp_webhook" | "ai_agent";
  senderName: string;
  senderPhone: string;
  rawMessage: string;
  extractedName?: string;
  extractedNumbers: number[];
  detectedAmount?: number;
  txId?: string;
  status: "confirmado" | "rejeitado" | "conflito";
  summary: string;
}

export interface BotSettings {
  groupName: string;
  outboundWebhookUrl: string;
  autoConfirmWithAi: boolean;
}

export interface QuotaRowInfo {
  number: number;
  status: QuotaStatus;
  order?: RaffleOrder;
}

export interface StoreState {
  campaigns: RaffleCampaign[];
  orders: RaffleOrder[];
  winners: WinnerRecord[];
  prizeStock: PrizeStockItem[];
  botLogs: BotActivityLog[];
  botSettings: BotSettings;
}
