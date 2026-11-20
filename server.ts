import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const PORT =
  process.env.NODE_ENV === "production"
    ? Number(process.env.PORT || 3000)
    : 3000;
const DATA_DIR = path.resolve(process.cwd(), "data");
const QUEUE_FILE = path.join(DATA_DIR, "webhook-events.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

interface IncomingWebhookEvent {
  id: string;
  receivedAt: string;
  senderName: string;
  senderPhone: string;
  messageText: string;
  receiptBase64?: string;
  receiptMimeType?: string;
  receiptFileName?: string;
  aiResult?: {
    pagamentoValido: boolean;
    nomeParticipante: string;
    numeros: number[];
    valorPago: number;
    txId: string;
    resumo: string;
  };
  consumed: boolean;
}

function readWebhookEvents(): IncomingWebhookEvent[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(QUEUE_FILE)) return [];
    const raw = fs.readFileSync(QUEUE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWebhookEvents(events: IncomingWebhookEvent[]) {
  try {
    ensureDataDir();
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(events.slice(0, 50), null, 2));
  } catch {
    // ignore file write issues
  }
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function analyzeWithGemini(params: {
  messageText: string;
  senderName?: string;
  senderPhone?: string;
  receiptBase64?: string;
  receiptMimeType?: string;
  ticketPrice?: number;
}) {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error(
      "GEMINI_API_KEY não configurada no servidor para análise com IA."
    );
  }

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (params.receiptBase64) {
    const cleanBase64 = params.receiptBase64.includes(",")
      ? params.receiptBase64.split(",")[1]
      : params.receiptBase64;
    parts.push({
      inlineData: {
        mimeType: params.receiptMimeType || "image/png",
        data: cleanBase64,
      },
    });
  }

  const promptText = [
    `Você é o Agente de IA oficial do grupo de WhatsApp do HOLD BAR SPORTS & MUSIC.`,
    `Analise a mensagem enviada no grupo e o comprovante de pagamento anexo (se houver).`,
    `Regras da rifa:`,
    `- Os números válidos vão de 1 a 100.`,
    `- Valor unitário atual por número: R$ ${params.ticketPrice ?? 50}.`,
    `- Extraia o nome completo do participante (priorize o nome do pagador no comprovante ou o nome citado na mensagem; se não houver, use "${params.senderName || "Participante"}").`,
    `- Extraia todos os números de 1 a 100 mencionados na mensagem (ex: "05, 12, 28", "números 7 e 14", "1 ao 3" => [1,2,3]).`,
    `- Verifique se há comprovação real de pagamento Pix/transferência na imagem ou no texto.`,
    `- Extraia o valor pago em reais (número) e o código E2E / ID da transação (ou gere um identificador curto se visível).`,
    ``,
    `Remetente no grupo: ${params.senderName || "Não informado"} (${params.senderPhone || "sem telefone"})`,
    `Mensagem no grupo: "${params.messageText || "(sem texto)"}"`,
  ].join("\n");

  parts.push({ text: promptText });

  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          pagamentoValido: {
            type: Type.BOOLEAN,
            description:
              "true se o comprovante ou confirmação indica pagamento Pix/transferência legítimo e concluído.",
          },
          nomeParticipante: {
            type: Type.STRING,
            description: "Nome do participante para colocar na lista de 1 a 100.",
          },
          numeros: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description: "Lista de números inteiros entre 1 e 100 escolhidos.",
          },
          valorPago: {
            type: Type.NUMBER,
            description: "Valor total pago identificado no comprovante em reais.",
          },
          txId: {
            type: Type.STRING,
            description: "ID da transação Pix / código de autenticação se visível.",
          },
          resumo: {
            type: Type.STRING,
            description:
              "Resumo curto em português explicando o que foi conferido pela IA.",
          },
        },
        required: [
          "pagamentoValido",
          "nomeParticipante",
          "numeros",
          "valorPago",
          "txId",
          "resumo",
        ],
      },
    },
  });

  const text = (response.text ?? "{}").trim();
  const parsed = JSON.parse(text);
  const validNumbers = Array.isArray(parsed.numeros)
    ? Array.from(
        new Set(
          parsed.numeros
            .map((n: unknown) => Number(n))
            .filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 100)
        )
      ).sort((a, b) => Number(a) - Number(b))
    : [];

  return {
    pagamentoValido: Boolean(parsed.pagamentoValido),
    nomeParticipante: String(
      parsed.nomeParticipante || params.senderName || "Participante"
    ).trim(),
    numeros: validNumbers as number[],
    valorPago: Number(parsed.valorPago) || 0,
    txId: String(parsed.txId || "").trim(),
    resumo: String(parsed.resumo || "Conferência concluída.").trim(),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "15mb" }));

  // Health & Bot endpoint info
  app.get("/api/bot/status", (_req, res) => {
    res.json({
      online: true,
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
      webhookPath: "/api/bot/webhook",
      pendingEvents: readWebhookEvents().filter((e) => !e.consumed).length,
    });
  });

  // Analyze WhatsApp group message + Pix receipt using Gemini AI
  app.post("/api/bot/analyze-receipt", async (req, res) => {
    try {
      const {
        messageText,
        senderName,
        senderPhone,
        receiptBase64,
        receiptMimeType,
        ticketPrice,
      } = req.body ?? {};

      const result = await analyzeWithGemini({
        messageText: String(messageText || ""),
        senderName: senderName ? String(senderName) : undefined,
        senderPhone: senderPhone ? String(senderPhone) : undefined,
        receiptBase64: receiptBase64 ? String(receiptBase64) : undefined,
        receiptMimeType: receiptMimeType ? String(receiptMimeType) : undefined,
        ticketPrice: Number(ticketPrice) || 50,
      });

      res.json({ ok: true, result });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao analisar comprovante.";
      res.status(500).json({ ok: false, error: message });
    }
  });

  // External WhatsApp Bot Webhook (Evolution API / Z-API / Baileys / n8n)
  app.post("/api/bot/webhook", async (req, res) => {
    try {
      const body = req.body ?? {};
      const senderName = String(
        body.senderName || body.pushName || body.name || "Participante Grupo"
      );
      const senderPhone = String(
        body.senderPhone || body.phone || body.remoteJid || "(11) 90000-0000"
      );
      const messageText = String(body.messageText || body.text || body.caption || "");
      const receiptBase64 = body.receiptBase64 ? String(body.receiptBase64) : undefined;
      const receiptMimeType = body.receiptMimeType
        ? String(body.receiptMimeType)
        : "image/png";
      const receiptFileName = body.receiptFileName
        ? String(body.receiptFileName)
        : "comprovante-whatsapp.png";

      let aiResult;
      if (process.env.GEMINI_API_KEY) {
        try {
          aiResult = await analyzeWithGemini({
            messageText,
            senderName,
            senderPhone,
            receiptBase64,
            receiptMimeType,
            ticketPrice: Number(body.ticketPrice) || 50,
          });
        } catch {
          aiResult = undefined;
        }
      }

      const event: IncomingWebhookEvent = {
        id: `wh-${Date.now()}`,
        receivedAt: new Date().toISOString(),
        senderName,
        senderPhone,
        messageText,
        receiptBase64,
        receiptMimeType,
        receiptFileName,
        aiResult,
        consumed: false,
      };

      const existing = readWebhookEvents();
      writeWebhookEvents([event, ...existing]);

      res.status(201).json({
        ok: true,
        eventId: event.id,
        aiResult: aiResult ?? null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro no webhook do bot.";
      res.status(400).json({ ok: false, error: message });
    }
  });

  // Poll unconsumed webhook events from the frontend
  app.get("/api/bot/events", (_req, res) => {
    const events = readWebhookEvents();
    res.json({ ok: true, events: events.filter((e) => !e.consumed) });
  });

  app.post("/api/bot/events/:id/ack", (req, res) => {
    const events = readWebhookEvents();
    const updated = events.map((ev) =>
      ev.id === req.params.id ? { ...ev, consumed: true } : ev
    );
    writeWebhookEvents(updated);
    res.json({ ok: true });
  });

  // Outbound notification when 100/100 list is completed
  app.post("/api/bot/notify-complete", async (req, res) => {
    const { webhookUrl, campaignTitle, weekLabel, groupName, message } =
      req.body ?? {};

    if (!webhookUrl) {
      res.json({
        ok: true,
        dispatched: false,
        reason: "Sem webhook de saída configurado; notificação exibida no painel.",
      });
      return;
    }

    try {
      const response = await fetch(String(webhookUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "RIFA_COMPLETA",
          campaignTitle,
          weekLabel,
          groupName,
          totalConfirmed: 100,
          message,
          timestamp: new Date().toISOString(),
        }),
      });
      res.json({
        ok: response.ok,
        dispatched: true,
        status: response.status,
      });
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Falha ao enviar para webhook.";
      res.status(502).json({ ok: false, dispatched: false, error: errMsg });
    }
  });

  // Vite or static production middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Hold Bar Rifas server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
