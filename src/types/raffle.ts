export type CampaignStatus = "ativa" | "encerrada";

export type DrawMethod = "sorteio_ao_vivo" | "loteria_federal";

export type QuotaStatus = "disponivel" | "reservada" | "paga";

export type OrderStatus =
  | "pago"
  | "pendente"
  | "em_analise"
  | "cancelado"
  | "expirado";

export type PaymentMethod = "pix" | "dinheiro" | "cartao";

export type DeliveryStatus = "aguardando" | "retirado_bar" | "enviado";

export type ConfirmationMode = "banco" | "manual";

export type ReceiptStatus =
  | "orfao"
  | "em_analise"
  | "revisao"
  | "confirmado"
  | "rejeitado"
  | "reenvio";

export type ActiveView =
  | "overview"
  | "list100"
  | "orders"
  | "receipts"
  | "inventory"
  | "campaigns"
  | "settings";

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
  id?: string;
  imageUrl?: string;
  imagePath?: string;
  fileName?: string;
  txId?: string;
  e2e?: string;
  amount?: number;
  payerName?: string;
  recipientName?: string;
  status?: ReceiptStatus;
  reasons?: string[];
  confidence?: number;
  verifiedBy: "ai_bot" | "manual";
  summary?: string;
  uploadedAt: string;
}

export interface ReceiptRecord {
  id: string;
  orderId?: string | null;
  campaignId?: string | null;
  buyerPhone: string;
  sourceMessageId?: string | null;
  e2e?: string | null;
  imageHash?: string | null;
  amount?: number | null;
  payerName?: string | null;
  recipientName?: string | null;
  paidAt?: string | null;
  status: ReceiptStatus;
  reasons: string[];
  confidence?: number | null;
  imagePath?: string | null;
  signedUrl?: string | null;
  fileName?: string | null;
  verifiedBy: "ai_bot" | "manual";
  summary?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  orderCode?: string;
  orderBuyerName?: string;
  orderQuotas?: number[];
  orderTotalAmount?: number;
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
  pixKey?: string;
  pixBeneficiary?: string;
  reservationMinutes?: number;
  confirmationMode?: ConfirmationMode;
  createdAt: string;
  completedNotifiedAt?: string;
}

export interface RaffleOrder {
  id: string;
  code?: string;
  campaignId: string;
  buyerName: string;
  holderName?: string;
  buyerPhone: string;
  buyerNotes?: string;
  quotas: number[];
  unitPrice: number;
  totalAmount: number;
  paidAmount?: number;
  surplusAmount?: number;
  needsAdmin?: boolean;
  conflictReason?: string;
  expiresAt?: string;
  sourceMessageId?: string;
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
  groupJid?: string;
  outboundWebhookUrl: string;
  adminPhones?: string[];
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
  receipts?: ReceiptRecord[];
  winners: WinnerRecord[];
  prizeStock: PrizeStockItem[];
  botLogs: BotActivityLog[];
  botSettings: BotSettings;
}
