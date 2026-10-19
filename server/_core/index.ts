import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { createCorsMiddleware } from "./cors";
import { clearLegacySessionCookie } from "./cookies";
import { sdk } from "./sdk";
import { storagePut } from "../storage";
import { createAttachment, processScheduledReminders } from "../db";

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(createCorsMiddleware());
  app.use(clearLegacySessionCookie());

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.post("/api/uploads", async (req, res) => {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (user.isCron) return res.status(403).json({ error: "Scheduled identity cannot upload" });
    try {
      const { filename, contentType, data, kind } = req.body as { filename?: string; contentType?: string; data?: string; kind?: string };
      if (!filename || !data) return res.status(400).json({ error: "filename and data are required" });
      if (kind !== "photo" && kind !== "audio" && kind !== "document") return res.status(400).json({ error: "kind must be photo, audio or document" });
      const encoded = data.replace(/^data:[^;]+;base64,/, "");
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.byteLength > 15 * 1024 * 1024) return res.status(413).json({ error: "El archivo supera 15 MB" });
      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
      const mimeType = contentType || "application/octet-stream";
      const stored = await storagePut(`uniflow/${user.id}/${Date.now()}-${safeName}`, bytes, mimeType);
      const attachment = await createAttachment(user.id, { kind, storageKey: stored.key, url: stored.url, filename: safeName, mimeType, sizeBytes: bytes.byteLength });
      return res.json({ key: stored.key, url: stored.url, attachmentId: attachment.id });
    } catch (error) {
      console.error("[Uploads] Upload failed", error instanceof Error ? error.message : "unknown");
      return res.status(500).json({ error: "Upload failed" });
    }
  });

  // Endpoint para la tarea programada en la nube (p. ej. cada 15 minutos):
  // entrega avisos que llegaron a su hora y marca como vencido lo que pasó sin confirmación.
  app.post("/api/scheduled/reminders", async (req, res) => {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      return res.status(401).json({ error: "Scheduled authentication failed" });
    }
    if (!user.isCron) return res.status(403).json({ error: "Cron identity required" });
    try {
      const result = await processScheduledReminders();
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error("[Scheduled] Reminder processing failed", error instanceof Error ? error.message : "unknown");
      return res.status(500).json({ error: "Reminder processing failed" });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const port = parseInt(process.env.PORT || "3000");
  server.listen(port, () => {
    console.log("[api] server listening");
  });
}

startServer().catch(() => {
  console.error("[api] server failed to start");
});
