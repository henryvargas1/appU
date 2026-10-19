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
import { storageGetSignedUrl, storagePut } from "../storage";
import { extractAssetText, transcribeAudio } from "../ai";
import { markDueRemindersExpired } from "../db";

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
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.isCron) return res.status(403).json({ error: "Scheduled identity cannot upload" });
      const { filename, contentType, data } = req.body as { filename?: string; contentType?: string; data?: string };
      if (!filename || !data) return res.status(400).json({ error: "filename and data are required" });
      const encoded = data.replace(/^data:[^;]+;base64,/, "");
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.byteLength > 15 * 1024 * 1024) return res.status(413).json({ error: "File is larger than 15 MB" });
      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const result = await storagePut(`uniflow/${user.id}/${Date.now()}-${safeName}`, bytes, contentType || "application/octet-stream");
      return res.json(result);
    } catch (error) {
      console.error("[Uploads] Upload failed", error instanceof Error ? error.message : "unknown");
      return res.status(401).json({ error: "Upload failed" });
    }
  });

  app.post("/api/process-asset", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.isCron) return res.status(403).json({ error: "Scheduled identity cannot process assets" });
      const { key, kind, mimeType } = req.body as { key?: string; kind?: "photo" | "document"; mimeType?: string };
      if (!key || (kind !== "photo" && kind !== "document")) return res.status(400).json({ error: "key and kind are required" });
      const url = await storageGetSignedUrl(key);
      const text = await extractAssetText({ url, kind, mimeType: mimeType || "application/octet-stream" });
      return res.json({ text });
    } catch (error) {
      console.error("[Assets] Processing failed", error instanceof Error ? error.message : "unknown");
      return res.status(400).json({ error: "Asset processing failed" });
    }
  });

  app.post("/api/transcribe", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.isCron) return res.status(403).json({ error: "Scheduled identity cannot transcribe assets" });
      const { key, filename, mimeType } = req.body as { key?: string; filename?: string; mimeType?: string };
      if (!key) return res.status(400).json({ error: "key is required" });
      const signedUrl = await storageGetSignedUrl(key);
      const response = await fetch(signedUrl);
      if (!response.ok) return res.status(400).json({ error: "Could not read uploaded audio" });
      const text = await transcribeAudio({ bytes: await response.arrayBuffer(), filename: filename || "class-audio.m4a", mimeType: mimeType || "audio/mp4" });
      return res.json({ text });
    } catch (error) {
      console.error("[Speech] Transcription failed", error instanceof Error ? error.message : "unknown");
      return res.status(400).json({ error: "Transcription failed" });
    }
  });

  app.post("/api/scheduled/reminders", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) return res.status(403).json({ error: "Cron identity required" });
      const expired = await markDueRemindersExpired();
      return res.json({ ok: true, expired });
    } catch (error) {
      console.error("[Scheduled] Reminder cleanup failed", error instanceof Error ? error.message : "unknown");
      return res.status(401).json({ error: "Scheduled authentication failed" });
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
