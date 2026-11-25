import "./load-env";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { voiceRouter } from "./routes/voice";
import { consoleRouter } from "./routes/console";
import { approvalsRouter } from "./routes/approvals";
import { demoRouter } from "./routes/demo";
import { callsRouter } from "./routes/calls";
import { twilioRouter, audioRouter } from "./routes/twilio";
import { queriesRouter } from "./routes/queries";
import { knowledgeRouter } from "./routes/knowledge";
import { authRouter } from "./routes/auth";
import { platformRouter } from "./routes/platform";
import { tenantAdminRouter } from "./routes/tenant-admin";
import {
  rejectViewAsMutation,
  requireAuth,
  requirePlatform,
  requireRole,
  requireTenant,
} from "./auth/middleware";

export function createApp() {
  const app = express();

  const configuredOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5174,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(cors({ origin: configuredOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  /** CSRF defence-in-depth alongside SameSite=Lax. */
  function requireTrustedOrigin(req: Request, res: Response, next: NextFunction): void {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }
    const origin = req.get("origin") ?? req.get("referer");
    if (!origin) {
      if (process.env.NODE_ENV === "production") {
        res.status(403).json({ error: "Origin header required" });
        return;
      }
      next();
      return;
    }
    try {
      const originRoot = new URL(origin).origin;
      if (!configuredOrigins.includes(originRoot)) {
        res.status(403).json({ error: "Origin not allowed" });
        return;
      }
    } catch {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    next();
  }

  app.use("/api/auth", requireTrustedOrigin, authRouter);
  app.use("/api/platform", requireTrustedOrigin, requireAuth, requirePlatform, platformRouter);
  app.use("/api/tenant", requireTrustedOrigin, requireAuth, requireTenant, requireRole("TENANT_ADMIN"), tenantAdminRouter);
  app.use("/api/queries", requireTrustedOrigin, requireAuth, requireTenant, rejectViewAsMutation, queriesRouter);
  app.use("/api/calls", requireTrustedOrigin, requireAuth, requireTenant, rejectViewAsMutation, callsRouter);
  app.use("/api/knowledge", requireTrustedOrigin, requireAuth, requireTenant, rejectViewAsMutation, knowledgeRouter);
  app.use("/api/console", requireTrustedOrigin, requireAuth, requireTenant, consoleRouter);
  app.use("/api/voice", requireTrustedOrigin, requireAuth, requireTenant, rejectViewAsMutation, voiceRouter);
  app.use("/api/demo", requireTrustedOrigin, requireAuth, requirePlatform, demoRouter);

  // Machine callers keep their existing verification.
  app.use("/api/twilio", twilioRouter);
  app.use("/api/approvals", approvalsRouter);
  app.use("/api/audio", audioRouter);

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    void next;
    console.error("Unhandled request error:", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
