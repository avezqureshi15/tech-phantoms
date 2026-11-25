import { Router } from "express";
import { reseedDemoData } from "../db/reseed";
import { recordAudit } from "../auth/audit";

export const demoRouter = Router();

/**
 * Global destructive reset. Mounted behind requireAuth + requirePlatform and
 * disabled in production. It truncates every tenant, so tenant-admin scope
 * would still be wrong.
 */
demoRouter.post("/reset", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "demo reset is disabled in production" });
    return;
  }
  try {
    const summary = await reseedDemoData();
    await recordAudit({
      actorUserId: req.auth!.user.id,
      action: "demo.reset",
      metadata: summary,
      ip: req.ip,
    });
    res.json({ ok: true, ...summary });
  } catch (err) {
    console.error("Demo reset failed:", err);
    res.status(500).json({ ok: false, error: "reset failed" });
  }
});
