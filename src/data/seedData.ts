import { PrizeStockItem, RafflePrize, StoreState } from "../types/raffle";

export interface PrizePreset {
  id: string;
  label: string;
  image: string;
}

export const PRIZE_GALLERY: PrizePreset[] = [
  {
    id: "ps5",
    label: "PlayStation 5",
    image: "/assets/images/prize_ps5.webp",
  },
  {
    id: "luxor",
    label: "Cervejeira LUXOR",
    image: "/assets/images/prize_luxor.webp",
  },
  {
    id: "iphone",
    label: "iPhone + Umidificador",
    image: "/assets/images/prize_iphone.webp",
  },
  {
    id: "smarttv",
    label: "Smart TV 65''",
    image: "/assets/images/prize_smarttv.webp",
  },
  {
    id: "boombox4",
    label: "JBL Boombox 4",
    image: "/assets/images/prize_boombox4.webp",
  },
  {
    id: "scooter",
    label: "Moto Elétrica",
    image: "/assets/images/prize_scooter.webp",
  },
  {
    id: "geladeira",
    label: "Geladeira Duplex",
    image: "/assets/images/prize_geladeira.webp",
  },
  {
    id: "ar_condicionado",
    label: "Kit Ar-Condicionado",
    image: "/assets/images/prize_ar_condicionado.webp",
  },
];

export const INITIAL_PRIZE_STOCK: PrizeStockItem[] = [
  {
    id: "stk-01",
    name: "PlayStation 5 Slim 1TB + 2 Controles",
    category: "Eletrônicos",
    image: "/assets/images/prize_ps5.webp",
    investedValue: 3450,
    quantity: 2,
    status: "reservado_rifa",
    supplier: "Distribuidora Tech Sul",
    notes: "Lacrado com NF · Depósito Hold Prêmios",
    createdAt: "2026-11-01T10:00:00",
  },
  {
    id: "stk-02",
    name: "Cervejeira LUXOR Porta de Vidro",
    category: "Bebidas & Bar",
    image: "/assets/images/prize_luxor.webp",
    investedValue: 2600,
    quantity: 1,
    status: "reservado_rifa",
    supplier: "Luxor Refrigeração",
    notes: "220V · Estoque salão principal",
    createdAt: "2026-11-02T14:20:00",
  },
  {
    id: "stk-03",
    name: "Smart TV 65'' 4K QLED",
    category: "Eletrônicos",
    image: "/assets/images/prize_smarttv.webp",
    investedValue: 3100,
    quantity: 1,
    status: "disponivel",
    supplier: "Mega Eletro Atacado",
    notes: "Pronta para próxima semana",
    createdAt: "2026-11-03T09:15:00",
  },
  {
    id: "stk-04",
    name: "Caixa de Som JBL Boombox 4",
    category: "Eletrônicos",
    image: "/assets/images/prize_boombox4.webp",
    investedValue: 2150,
    quantity: 2,
    status: "disponivel",
    supplier: "AudioPro Brasil",
    notes: "Cor preta · Garantia 12 meses",
    createdAt: "2026-11-04T16:40:00",
  },
  {
    id: "stk-05",
    name: "iPhone 16 Pro 256GB + Umidificador",
    category: "Eletrônicos",
    image: "/assets/images/prize_iphone.webp",
    investedValue: 6400,
    quantity: 1,
    status: "disponivel",
    supplier: "Apple Import Direta",
    notes: "Titânio natural · Lacrado",
    createdAt: "2026-11-05T11:10:00",
  },
  {
    id: "stk-06",
    name: "Moto Elétrica Scooter 2000W",
    category: "Veículos",
    image: "/assets/images/prize_scooter.webp",
    investedValue: 5900,
    quantity: 1,
    status: "disponivel",
    supplier: "EcoRide Mobilidade",
    notes: "Bateria lítio removível · Show-room",
    createdAt: "2026-11-06T13:00:00",
  },
  {
    id: "stk-07",
    name: "Kit Ar-Condicionado Split Inverter 12k",
    category: "Eletrodomésticos",
    image: "/assets/images/prize_ar_condicionado.webp",
    investedValue: 1850,
    quantity: 2,
    status: "disponivel",
    supplier: "ClimaFrio Distribuidora",
    notes: "Sem instalação inclusa",
    createdAt: "2026-11-07T15:30:00",
  },
  {
    id: "stk-08",
    name: "Geladeira Frost Free Inox 460L",
    category: "Eletrodomésticos",
    image: "/assets/images/prize_geladeira.webp",
    investedValue: 3200,
    quantity: 1,
    status: "disponivel",
    supplier: "Mega Eletro Atacado",
    notes: "110V · Caixa fechada",
    createdAt: "2026-11-08T10:45:00",
  },
];

export const DEFAULT_TEN_PRIZES: RafflePrize[] = [
  { position: 1, title: "PlayStation 5 Slim + 2 Controles", investedValue: 3450, stockItemId: "stk-01" },
  { position: 2, title: "Cervejeira LUXOR Porta de Vidro", investedValue: 2600, stockItemId: "stk-02" },
  { position: 3, title: "Smart TV 65'' 4K QLED", investedValue: 3100, stockItemId: "stk-03" },
  { position: 4, title: "Caixa de Som JBL Boombox 4", investedValue: 2150, stockItemId: "stk-04" },
  { position: 5, title: "Kit Ar-Condicionado Split Inverter", investedValue: 1850, stockItemId: "stk-07" },
  { position: 6, title: "Combo Black Label + Energéticos Hold Prêmios", investedValue: 450 },
  { position: 7, title: "Voucher R$ 500 em Prêmios Hold Prêmios", investedValue: 500 },
  { position: 8, title: "Kit Churrasco + Chopeira Portátil Hold", investedValue: 380 },
  { position: 9, title: "Voucher R$ 300 no Bar", investedValue: 300 },
  { position: 10, title: "R$ 300 no Pix na Hora", investedValue: 300 },
];

export function buildSampleReceiptSvg(
  payerName: string,
  amount: string,
  txId: string,
  dateStr: string
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="520" viewBox="0 0 420 520">
    <rect width="420" height="520" rx="20" fill="#121212" stroke="#2a2a2a" stroke-width="2"/>
    <rect x="24" y="24" width="372" height="72" rx="12" fill="#1a1206" stroke="#FF7900" stroke-opacity="0.4"/>
    <text x="44" y="54" fill="#FFB000" font-family="monospace" font-size="14" font-weight="bold">COMPROVANTE PIX · RECEBIDO</text>
    <text x="44" y="78" fill="#a3a3a3" font-family="sans-serif" font-size="12">Hold Prêmios · Grupo VIP Oficial</text>
    <text x="24" y="136" fill="#737373" font-family="sans-serif" font-size="11">VALOR TRANSFERIDO</text>
    <text x="24" y="168" fill="#4ade80" font-family="monospace" font-size="28" font-weight="bold">${amount}</text>
    <line x1="24" y1="192" x2="396" y2="192" stroke="#262626"/>
    <text x="24" y="224" fill="#737373" font-family="sans-serif" font-size="11">PAGADOR</text>
    <text x="24" y="246" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="bold">${payerName}</text>
    <text x="24" y="286" fill="#737373" font-family="sans-serif" font-size="11">DESTINATÁRIO</text>
    <text x="24" y="308" fill="#e5e5e5" font-family="sans-serif" font-size="14">HOLD PRÊMIOS LTDA</text>
    <text x="24" y="348" fill="#737373" font-family="sans-serif" font-size="11">DATA E HORA</text>
    <text x="24" y="370" fill="#e5e5e5" font-family="monospace" font-size="13">${dateStr}</text>
    <text x="24" y="410" fill="#737373" font-family="sans-serif" font-size="11">ID DA TRANSAÇÃO (E2E)</text>
    <text x="24" y="432" fill="#FFB000" font-family="monospace" font-size="12">${txId}</text>
    <rect x="24" y="458" width="372" height="36" rx="8" fill="#064e3b" fill-opacity="0.35" stroke="#10b981" stroke-opacity="0.4"/>
    <text x="210" y="481" text-anchor="middle" fill="#34d399" font-family="sans-serif" font-size="12" font-weight="bold">CONFERIDO PELO AGENTE DE IA</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const INITIAL_SEED_STATE: StoreState = {
  campaigns: [
    {
      id: "camp-sem-46",
      code: "SEM-46",
      title: "Mega Rifa Hold Prêmios #46 (10 Prêmios)",
      weekLabel: "Semana 46 · 11 a 17 Nov",
      whatsappGroupName: "Hold Prêmios — Grupo VIP Oficial",
      image: "/assets/images/prize_ps5.webp",
      prizes: [
        { position: 1, title: "PlayStation 5 Slim + 2 Controles", investedValue: 3450, stockItemId: "stk-01" },
        { position: 2, title: "Cervejeira LUXOR Porta de Vidro", investedValue: 2600, stockItemId: "stk-02" },
        { position: 3, title: "Combo Black Label + Energéticos", investedValue: 450 },
        { position: 4, title: "Voucher R$ 500 Hold Prêmios", investedValue: 500 },
        { position: 5, title: "Kit Churrasco + Chopeira Portátil", investedValue: 380 },
        { position: 6, title: "Caixa Térmica Personalizada Hold", investedValue: 290 },
        { position: 7, title: "Voucher R$ 300 Hold Prêmios", investedValue: 300 },
        { position: 8, title: "Kit Gin Tanqueray + Taças", investedValue: 240 },
        { position: 9, title: "Fone Bluetooth Esportivo", investedValue: 190 },
        { position: 10, title: "R$ 300 no Pix na Hora", investedValue: 300 },
      ],
      ticketPrice: 120,
      totalQuotas: 100,
      drawMethod: "sorteio_ao_vivo",
      scheduledDrawDate: "2026-11-17T21:00:00",
      status: "ativa",
      createdAt: "2026-11-11T09:00:00",
    },
    {
      id: "camp-sem-45",
      code: "SEM-45",
      title: "Rifa Especial Hold Prêmios #45 (10 Prêmios)",
      weekLabel: "Semana 45 · 04 a 10 Nov",
      whatsappGroupName: "Hold Prêmios — Grupo VIP Oficial",
      image: "/assets/images/prize_scooter.webp",
      prizes: [
        { position: 1, title: "Moto Elétrica Scooter 2000W", investedValue: 5900 },
        { position: 2, title: "Smart TV 65'' 4K QLED", investedValue: 3100 },
        { position: 3, title: "Combo Whisky + Red Bull", investedValue: 450 },
        { position: 4, title: "Voucher R$ 400 Consumação", investedValue: 400 },
        { position: 5, title: "R$ 250 no Pix", investedValue: 250 },
        { position: 6, title: "R$ 200 no Pix", investedValue: 200 },
        { position: 7, title: "R$ 150 no Pix", investedValue: 150 },
        { position: 8, title: "Balde Heineken Personalizado", investedValue: 120 },
        { position: 9, title: "Boné Oficial Hold Prêmios", investedValue: 80 },
        { position: 10, title: "R$ 100 no Pix", investedValue: 100 },
      ],
      ticketPrice: 150,
      totalQuotas: 100,
      drawMethod: "loteria_federal",
      scheduledDrawDate: "2026-11-10T19:00:00",
      status: "encerrada",
      createdAt: "2026-11-04T09:00:00",
      completedNotifiedAt: "2026-11-09T18:40:00",
    },
  ],
  orders: [
    {
      id: "ord-601",
      campaignId: "camp-sem-46",
      buyerName: "Rafael Mendonça",
      buyerPhone: "(11) 98432-1190",
      quotas: [1, 7, 14, 22, 45],
      unitPrice: 120,
      totalAmount: 600,
      paymentMethod: "pix",
      status: "pago",
      receipt: {
        imageUrl: buildSampleReceiptSvg(
          "Rafael Mendonça",
          "R$ 600,00",
          "E18236120202611111822A91",
          "11/11/2026 18:22"
        ),
        fileName: "comprovante-rafael-pix.png",
        txId: "E18236120202611111822A91",
        verifiedBy: "ai_bot",
        summary: "Comprovante Pix conferido automaticamente pelo Agente de IA no grupo.",
        uploadedAt: "2026-11-11T18:23:00",
      },
      createdAt: "2026-11-11T18:22:00",
      paidAt: "2026-11-11T18:23:00",
    },
    {
      id: "ord-602",
      campaignId: "camp-sem-46",
      buyerName: "Camila Ferreira",
      buyerPhone: "(11) 97214-8832",
      quotas: [3, 10, 19, 31, 64],
      unitPrice: 120,
      totalAmount: 600,
      paymentMethod: "pix",
      status: "pago",
      receipt: {
        imageUrl: buildSampleReceiptSvg(
          "Camila Ferreira",
          "R$ 600,00",
          "E60701190202611112010B42",
          "11/11/2026 20:10"
        ),
        fileName: "pix-camila-hold.jpg",
        txId: "E60701190202611112010B42",
        verifiedBy: "ai_bot",
        summary: "Comprovante Pix validado pelo Agente de IA.",
        uploadedAt: "2026-11-11T20:11:00",
      },
      createdAt: "2026-11-11T20:10:00",
      paidAt: "2026-11-11T20:11:00",
    },
    {
      id: "ord-603",
      campaignId: "camp-sem-46",
      buyerName: "Lucas Andrade",
      buyerPhone: "(11) 99105-4421",
      quotas: [2, 8, 25, 50, 77, 88, 99, 100],
      unitPrice: 120,
      totalAmount: 960,
      paymentMethod: "pix",
      status: "pago",
      receipt: {
        imageUrl: buildSampleReceiptSvg(
          "Lucas Andrade",
          "R$ 960,00",
          "E00000000202611120915C08",
          "12/11/2026 09:15"
        ),
        fileName: "comprovante-lucas.png",
        txId: "E00000000202611120915C08",
        verifiedBy: "ai_bot",
        summary: "8 números confirmados via comprovante enviado no Grupo VIP.",
        uploadedAt: "2026-11-12T09:16:00",
      },
      createdAt: "2026-11-12T09:15:00",
      paidAt: "2026-11-12T09:16:00",
    },
    {
      id: "ord-604",
      campaignId: "camp-sem-46",
      buyerName: "Thiago Oliveira",
      buyerPhone: "(11) 96340-7715",
      quotas: [5, 12, 28, 33, 41, 56, 72, 91],
      unitPrice: 120,
      totalAmount: 960,
      paymentMethod: "pix",
      status: "pago",
      receipt: {
        imageUrl: buildSampleReceiptSvg(
          "Thiago Oliveira",
          "R$ 960,00",
          "E30306294202611121004D17",
          "12/11/2026 10:04"
        ),
        fileName: "pix-thiago-960.png",
        txId: "E30306294202611121004D17",
        verifiedBy: "ai_bot",
        summary: "Pix confirmado pelo Agente de IA.",
        uploadedAt: "2026-11-12T10:05:00",
      },
      createdAt: "2026-11-12T10:04:00",
      paidAt: "2026-11-12T10:05:00",
    },
    {
      id: "ord-605",
      campaignId: "camp-sem-46",
      buyerName: "Mariana Costa",
      buyerPhone: "(11) 98871-3094",
      quotas: [15, 29, 48, 60],
      unitPrice: 120,
      totalAmount: 480,
      paymentMethod: "pix",
      status: "pendente",
      createdAt: "2026-11-12T11:20:00",
    },
    {
      id: "ord-606",
      campaignId: "camp-sem-46",
      buyerName: "Fernanda Rocha",
      buyerPhone: "(11) 98190-2311",
      quotas: [9, 18, 27, 46, 55, 74, 81, 90, 96, 98],
      unitPrice: 120,
      totalAmount: 1200,
      paymentMethod: "pix",
      status: "pago",
      receipt: {
        imageUrl: buildSampleReceiptSvg(
          "Fernanda Rocha",
          "R$ 1.200,00",
          "E90400888202611121150F99",
          "12/11/2026 11:50"
        ),
        fileName: "pix-fernanda-1200.png",
        txId: "E90400888202611121150F99",
        verifiedBy: "manual",
        summary: "Comprovante anexado pelo administrador.",
        uploadedAt: "2026-11-12T11:52:00",
      },
      createdAt: "2026-11-12T11:50:00",
      paidAt: "2026-11-12T11:52:00",
    },
    {
      id: "ord-607",
      campaignId: "camp-sem-46",
      buyerName: "Bruno Almeida",
      buyerPhone: "(11) 99562-1408",
      quotas: [6, 17, 36, 44, 53, 69, 82, 95],
      unitPrice: 120,
      totalAmount: 960,
      paymentMethod: "pix",
      status: "pago",
      receipt: {
        imageUrl: buildSampleReceiptSvg(
          "Bruno Almeida",
          "R$ 960,00",
          "E44129901202611121210H31",
          "12/11/2026 12:10"
        ),
        fileName: "pix-bruno.png",
        txId: "E44129901202611121210H31",
        verifiedBy: "ai_bot",
        summary: "Pix validado pelo Agente de IA.",
        uploadedAt: "2026-11-12T12:11:00",
      },
      createdAt: "2026-11-12T12:10:00",
      paidAt: "2026-11-12T12:11:00",
    },
    {
      id: "ord-608",
      campaignId: "camp-sem-46",
      buyerName: "Diego Barbosa",
      buyerPhone: "(11) 96901-8840",
      quotas: [4, 13, 21, 35, 42, 58, 66, 79, 85, 93],
      unitPrice: 120,
      totalAmount: 1200,
      paymentMethod: "pix",
      status: "pago",
      receipt: {
        imageUrl: buildSampleReceiptSvg(
          "Diego Barbosa",
          "R$ 1.200,00",
          "E77220014202611121225K02",
          "12/11/2026 12:25"
        ),
        fileName: "pix-diego.png",
        txId: "E77220014202611121225K02",
        verifiedBy: "ai_bot",
        summary: "10 números confirmados pelo Agente de IA.",
        uploadedAt: "2026-11-12T12:26:00",
      },
      createdAt: "2026-11-12T12:25:00",
      paidAt: "2026-11-12T12:26:00",
    },
  ],
  winners: [
    {
      id: "win-45-1",
      campaignId: "camp-sem-45",
      campaignCode: "SEM-45",
      campaignTitle: "Rifa Especial Hold Prêmios #45 (10 Prêmios)",
      prizePosition: 1,
      prizeTitle: "Moto Elétrica Scooter 2000W",
      prizeImage: "/assets/images/prize_scooter.webp",
      quotaNumber: 42,
      buyerName: "Eduardo Nascimento",
      buyerPhone: "(11) 99812-3304",
      drawMethod: "loteria_federal",
      federalNumber: "51842",
      auditHash: "HLD-8F3A-91C2",
      drawnAt: "2026-11-10T19:15:00",
      deliveryStatus: "retirado_bar",
    },
  ],
  prizeStock: INITIAL_PRIZE_STOCK,
  botLogs: [
    {
      id: "log-101",
      timestamp: "2026-11-12T12:26:00",
      source: "ai_agent",
      senderName: "Diego Barbosa",
      senderPhone: "(11) 96901-8840",
      rawMessage:
        "Fala pessoal! Pix feito dos números 04, 13, 21, 35, 42, 58, 66, 79, 85 e 93.",
      extractedName: "Diego Barbosa",
      extractedNumbers: [4, 13, 21, 35, 42, 58, 66, 79, 85, 93],
      detectedAmount: 1200,
      txId: "E77220014202611121225K02",
      status: "confirmado",
      summary:
        "Comprovante Pix de R$ 1.200,00 validado. 10 números confirmados na Lista 1–100.",
    },
    {
      id: "log-102",
      timestamp: "2026-11-12T10:05:00",
      source: "ai_agent",
      senderName: "Thiago Oliveira",
      senderPhone: "(11) 96340-7715",
      rawMessage:
        "Bom dia galera! Segue o pix dos meus números 05, 12, 28, 33, 41, 56, 72 e 91. Thiago Oliveira.",
      extractedName: "Thiago Oliveira",
      extractedNumbers: [5, 12, 28, 33, 41, 56, 72, 91],
      detectedAmount: 960,
      txId: "E30306294202611121004D17",
      status: "confirmado",
      summary:
        "Comprovante Pix de R$ 960,00 validado. 8 números confirmados na Lista 1–100.",
    },
  ],
  botSettings: {
    groupName: "Hold Prêmios — Grupo VIP Oficial",
    outboundWebhookUrl: "",
    aiMinConfidence: 0.9,
    aiMaxAmount: 100,
    aiMaxPerPhoneDay: 5,
  },
};
