import "dotenv/config";
import express from "express";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import type { ApiRequest, ApiResponse } from "./api/_lib/http.js";
import botCampaignHandler from "./api/bot/campaign.js";
import botQuotasHandler from "./api/bot/quotas.js";
import botOrdersHandler from "./api/bot/orders.js";
import botOrderCancelHandler from "./api/bot/orders/[id]/cancel.js";
import botReceiptsHandler from "./api/bot/receipts.js";
import botPixHandler from "./api/bot/pix.js";
import botAdminHandler from "./api/bot/admin.js";
import botSummaryDailyHandler from "./api/bot/summary/daily.js";
import cronExpireHandler from "./api/cron/expire.js";
import authHandler from "./api/auth/[action].js";
import adminHandler from "./api/admin/[resource].js";

const PORT =
  process.env.NODE_ENV === "production"
    ? Number(process.env.PORT || 3000)
    : 3000;

function wrapHandler(
  fn: (req: ApiRequest, res: ApiResponse) => Promise<void> | void
) {
  return async (req: express.Request, res: express.Response) => {
    try {
      await fn(req as unknown as ApiRequest, res as unknown as ApiResponse);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal Server Error";
      if (!res.headersSent) {
        res.status(500).json({ error: "internal_error", message: msg });
      }
    }
  };
}

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "15mb" }));

  app.use(["/api/bot", "/api/admin"], (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // Bot & Cron Routes (Bearer BOT_API_TOKEN)
  app.all("/api/bot/campaign", wrapHandler(botCampaignHandler));
  app.all("/api/bot/quotas", wrapHandler(botQuotasHandler));
  app.all("/api/bot/orders", wrapHandler(botOrdersHandler));
  app.all("/api/bot/orders/:id/cancel", wrapHandler(botOrderCancelHandler));
  app.all("/api/bot/receipts", wrapHandler(botReceiptsHandler));
  app.all("/api/bot/pix", wrapHandler(botPixHandler));
  app.all("/api/bot/admin/pending", wrapHandler(botAdminHandler));
  app.all("/api/bot/admin/:resource/:ref/:action", wrapHandler(botAdminHandler));
  app.all("/api/bot/summary/daily", wrapHandler(botSummaryDailyHandler));
  app.all("/api/cron/expire", wrapHandler(cronExpireHandler));

  // Admin Auth & Panel Routes (Supabase Auth session)
  app.all("/api/auth/:action", wrapHandler(authHandler));
  app.all("/api/admin/:resource", wrapHandler(adminHandler));

  // Fallback for unknown API routes
  app.all("/api/*", (_req, res) => {
    res.status(404).json({ error: "api_route_not_found" });
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
    console.log(`Hold Prêmios Rifas server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
