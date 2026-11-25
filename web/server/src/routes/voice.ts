import { Router } from "express";
import multer from "multer";
import type OpenAI from "openai";
import { scoped } from "../db/scoped";
import { prisma } from "../db/prisma";
import { adapterFor } from "../adapters";
import { getFlagsForTenant } from "../flags/client";
import { transcribeAudio } from "../sarvam/stt";
import { synthesizeSpeech } from "../sarvam/tts";
import { buildSystemPrompt, buildContextBlock, selectContextOrders } from "../agent/prompts";
import { runAgentTurn, type ToolExecutionContext, type AgentActionSummary } from "../agent/orchestrator";
import type { TicketStatus } from "../generated/prisma";

export const voiceRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

function deriveTicketStatus(action: AgentActionSummary | null): TicketStatus {
  if (!action) return "OPEN"; // info-only answer — ops closes it manually (§5.5)
  if (action.policyDecision === "REQUIRE_HUMAN") return "AWAITING_APPROVAL";
  if (action.tool === "escalate_to_human") return "ESCALATED";
  if (action.tool === "issue_refund" && action.executed) return "AUTO_RESOLVED";
  return "OPEN";
}

function deriveResolutionType(action: AgentActionSummary): string {
  if (action.tool === "issue_refund" && action.executed) return "REFUND";
  if (action.tool === "escalate_to_human") return "HUMAN";
  return "INFO";
}

/** The single round-trip endpoint (§3.4). multipart: audio blob + fields. */
voiceRouter.post("/turn", upload.single("audio"), async (req, res) => {
  const turnStart = Date.now();
  try {
    const { customerId } = req.body as { customerId?: string };
    let ticketId = (req.body as { ticketId?: string }).ticketId;

    if (!customerId) {
      res.status(400).json({ error: "customerId is required" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "an audio file is required" });
      return;
    }

    const tenantId = req.auth!.tenant!.id;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.status !== "ACTIVE") {
      res.status(404).json({ error: "unknown tenant" });
      return;
    }

    const db = scoped(tenant.id);
    const customer = await db.customer.findUnique(customerId);
    if (!customer) {
      res.status(404).json({ error: "unknown customer" });
      return;
    }

    const sttStart = Date.now();
    const transcription = await transcribeAudio(req.file.buffer, { mimeType: req.file.mimetype });
    const sttLatencyMs = Date.now() - sttStart;
    const detectedLang = transcription.languageCode ?? customer.preferredLang;

    let ticket = ticketId ? await db.ticket.findUnique(ticketId) : null;
    if (!ticket) {
      ticket = await db.ticket.create({
        customerId: customer.id,
        channel: "VOICE",
        language: detectedLang,
        status: "OPEN",
      });
    }
    ticketId = ticket.id;

    await db.message.create({
      ticketId: ticket.id,
      role: "CUSTOMER",
      text: transcription.transcript,
      lang: detectedLang,
      latencyMs: sttLatencyMs,
    });

    const [orders, flags, priorMessages] = await Promise.all([
      db.order.findMany({ where: { customerId: customer.id } }),
      getFlagsForTenant(tenant.slug),
      db.message.findMany(ticket.id),
    ]);

    const selection = selectContextOrders(orders);

    const history: OpenAI.ChatCompletionMessageParam[] = priorMessages.slice(-6).map((m) => ({
      role: m.role === "CUSTOMER" ? "user" : m.role === "AGENT" ? "assistant" : "system",
      content: m.text,
    }));

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: buildSystemPrompt(tenant) },
      { role: "system", content: buildContextBlock(customer, selection, flags) },
      ...history,
    ];

    const llmStart = Date.now();
    const ctx: ToolExecutionContext = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      ticketId: ticket.id,
      customerName: customer.name,
      contextOrderIds: selection.contextOrders.map((o) => o.id),
      flags,
      adapter: adapterFor(tenant),
    };
    const turn = await runAgentTurn(messages, ctx);
    const llmLatencyMs = Date.now() - llmStart;

    await db.message.create({
      ticketId: ticket.id,
      role: "AGENT",
      text: turn.replyText,
      lang: detectedLang,
      latencyMs: llmLatencyMs,
    });

    const ttsStart = Date.now();
    const speech = await synthesizeSpeech(turn.replyText, detectedLang);
    const ttsLatencyMs = Date.now() - ttsStart;

    const ticketStatus = deriveTicketStatus(turn.action);
    const isTerminal = ticketStatus === "AUTO_RESOLVED" || ticketStatus === "ESCALATED";

    // Prefer the order the agent actually acted on this turn over the first
    // disambiguation candidate — they're only the same order by coincidence.
    const actedOrderId =
      typeof turn.action?.args.orderId === "string" ? turn.action.args.orderId : undefined;

    await db.ticket.update(ticket.id, {
      orderId: actedOrderId ?? selection.contextOrders[0]?.id,
      status: ticketStatus,
      resolutionType: turn.action ? deriveResolutionType(turn.action) : undefined,
      resolvedAt: isTerminal ? new Date() : undefined,
    });

    res.json({
      ticketId: ticket.id,
      transcript: transcription.transcript,
      detectedLang,
      replyText: turn.replyText,
      replyAudioB64: speech.audioBase64,
      action: turn.action,
      ticketStatus,
      latencyMs: {
        stt: sttLatencyMs,
        llm: llmLatencyMs,
        tts: ttsLatencyMs,
        total: Date.now() - turnStart,
      },
    });
  } catch (err) {
    console.error("Voice turn failed:", err);
    res.status(500).json({ error: "voice turn failed" });
  }
});
