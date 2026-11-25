import { Router, type Request, type Response } from "express";
import express from "express";
import type OpenAI from "openai";
import { prismaUnscoped } from "../db/prisma";
import { adapterFor } from "../adapters";
import { getFlagsForTenant } from "../flags/client";
import { runAgentTurn, type ToolExecutionContext } from "../agent/orchestrator";
import {
  buildCallSystemPrompt,
  buildContextBlock,
  buildKnowledgeBlock,
  buildOpeningLine,
} from "../agent/prompts";
import { retrieve } from "../knowledge/retrieve";
import { transcribeAudio } from "../sarvam/stt";
import { synthesizeSpeech } from "../sarvam/tts";
import { classifyOutcome } from "../outcome/classifier";
import { getSarvamLLM, SARVAM_LLM_MODEL } from "../sarvam/llm";
import { getAudio, storeAudio } from "../call/audio-store";
import { publicUrlIfConfigured } from "../call/guards";
import { validateTwilioWebhook } from "../call/twilio";
import { fetchTwilioRecording } from "../call/recording";
import { closeCallResponse, hangupResponse, holdingResponse, playAndHangup, playAndRecord } from "../call/twiml";
import { triggerHumanReviewWorkflow } from "../nudgebee/trigger";
import { raceDeadline } from "../call/deadline";
import { isSarvamCreditsError } from "../call/errors";

export const twilioRouter = Router();
twilioRouter.use(express.urlencoded({ extended: false, limit: "32kb" }));

const INTERNAL_TURN_BUDGET_MS = 10_000;

type SessionWithContext = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

async function loadSession(sessionId: string) {
  return prismaUnscoped.callSession.findUnique({
    where: { id: sessionId },
    include: {
      tenant: true,
      query: { include: { customer: true } },
      ticket: true,
    },
  });
}

function sendTwiml(res: Response, xml: string): void {
  res.status(200).type("text/xml").send(xml);
}

function requireTwilioSignature(req: Request, res: Response): boolean {
  if (validateTwilioWebhook(req)) return true;
  res.status(403).send("Invalid Twilio signature");
  return false;
}

function isMachineAnswered(answeredBy: unknown): boolean {
  return typeof answeredBy === "string" && answeredBy.toLowerCase().startsWith("machine");
}

async function markHumanReview(session: SessionWithContext, rationale: string): Promise<void> {
  const now = new Date();
  await prismaUnscoped.$transaction(async (tx) => {
    const existing = await tx.callOutcome.findUnique({ where: { callSessionId: session.id } });
    if (!existing) {
      await tx.callOutcome.create({
        data: {
          tenantId: session.tenantId,
          callSessionId: session.id,
          value: "HUMAN_REVIEW",
          confidence: "LOW",
          evidence: "",
          rationale,
        },
      });
    }
    await tx.callSession.update({
      where: { id: session.id },
      data: { state: "ENDED", endedAt: now, turnLeaseUntil: null },
    });
    await tx.query.update({ where: { id: session.queryId }, data: { status: "HUMAN_REVIEW" } });
    await tx.ticket.update({ where: { id: session.ticketId }, data: { status: "ESCALATED", resolvedAt: now } });
  });
  void triggerHumanReviewWorkflow({
    event: "HUMAN_REVIEW",
    callSessionId: session.id,
    queryId: session.queryId,
    tenantSlug: session.tenant.slug,
    orderId: session.query.orderId,
    customerName: session.query.customer.name,
    evidence: "",
    rationale,
    transcriptUrl: publicUrlIfConfigured(`/api/calls/${session.id}`),
  });
}

async function fetchRecording(recordingUrl: string): Promise<Buffer> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error("Twilio recording credentials are not configured");
  return fetchTwilioRecording(recordingUrl, { accountSid, authToken });
}

function isWave(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE";
}

async function synthesizeAudioKey(text: string, language: string, deadlineAt?: number): Promise<string | null> {
  const speechPromise = synthesizeSpeech(text, language);
  let speech: Awaited<ReturnType<typeof synthesizeSpeech>>;
  if (deadlineAt !== undefined) {
    const result = await raceDeadline(speechPromise, deadlineAt);
    if (result.timedOut) throw new Error("TTS deadline exceeded");
    speech = result.value;
  } else {
    speech = await speechPromise;
  }
  const buffer = Buffer.from(speech.audioBase64, "base64");
  if (!isWave(buffer)) return null;
  return storeAudio(buffer);
}

function spokenMessages(
  session: SessionWithContext,
  customerText: string,
  order: Awaited<ReturnType<typeof prismaUnscoped.order.findFirst>>,
  flags: Awaited<ReturnType<typeof getFlagsForTenant>>,
  articles: ReturnType<typeof retrieve>,
  priorTurns: { role: string; text: string }[],
  finalTurn: boolean,
): OpenAI.ChatCompletionMessageParam[] {
  const orders = order ? [order] : [];
  const context = buildContextBlock(
    { name: session.query.customer.name },
    { contextOrders: orders, needsDisambiguation: false },
    flags,
  );
  const history: OpenAI.ChatCompletionMessageParam[] = priorTurns.slice(-8).map((turn) => ({
    role: turn.role === "CUSTOMER" ? "user" : "assistant",
    content: turn.text,
  }));
  if (history.at(-1)?.role !== "user" || history.at(-1)?.content !== customerText) {
    history.push({ role: "user", content: customerText });
  }
  return [
    { role: "system", content: buildCallSystemPrompt(session.tenant) },
    { role: "system", content: context },
    { role: "system", content: buildKnowledgeBlock(articles) },
    ...(finalTurn ? [{ role: "system" as const, content: "This is the last allowed conversation turn. Give a concise, polite closing and call end_call. Do not introduce a new action that cannot be completed now." }] : []),
    ...history,
  ];
}

interface TurnResponse {
  text: string;
  audioKey: string | null;
  shouldEndCall: boolean;
  terminal?: boolean;
}

async function recoverTurnFailure(session: SessionWithContext, recordingSid: string, error: unknown): Promise<TurnResponse> {
  console.error("Twilio turn processing failed", {
    callSessionId: session.id,
    recordingSid,
    error: error instanceof Error ? error.message : "unknown error",
  });
  const customerTurn = await prismaUnscoped.callTurn.findFirst({
    where: { callSessionId: session.id, recordingSid, role: "CUSTOMER" },
  }).catch(() => null);

  const isCreditsError = isSarvamCreditsError(error);
  const text = isCreditsError
    ? "Maaf kijiye, hamari awaaz seva mein abhi dikkat aa rahi hai. Hamari team aapse dobara sampark karegi."
    : "Maaf kijiye, abhi mujhe thodi dikkat aa rahi hai. Hamari team aapse dobara sampark karegi.";
  if (customerTurn) {
    await prismaUnscoped.callTurn.create({
      data: {
        tenantId: session.tenantId,
        callSessionId: session.id,
        idx: customerTurn.idx + 1,
        role: "AGENT",
        text,
        lang: session.query.customer.preferredLang,
        citedArticleIds: [],
        endCall: true,
      },
    }).catch(() => undefined);
    await prismaUnscoped.message.create({
      data: { tenantId: session.tenantId, ticketId: session.ticketId, role: "AGENT", text, lang: session.query.customer.preferredLang },
    }).catch(() => undefined);
  }
  await prismaUnscoped.callSession.update({
    where: { id: session.id },
    data: {
      turnLeaseUntil: null,
      errorCode: isCreditsError ? "SARVAM_402" : "CALL_TURN_FAILED",
      errorMessage: isCreditsError ? "Sarvam credits are exhausted" : "Call processing failed; human follow-up is required",
    },
  }).catch(() => undefined);
  const rationale = isCreditsError
    ? "Sarvam credits are exhausted; the call stopped for human follow-up."
    : "The call turn could not be completed safely; human follow-up is required.";
  await markHumanReview(session, rationale).catch(() => undefined);
  return { text, audioKey: null, shouldEndCall: true, terminal: true };
}

async function processCustomerTurn(
  session: SessionWithContext,
  recordingSid: string,
  recordingUrl: string,
  deadlineAt: number,
): Promise<TurnResponse> {
  const audio = await fetchRecording(recordingUrl);
  if (Date.now() >= deadlineAt) throw new Error("call turn deadline exceeded before transcription");

  const transcriptionResult = await raceDeadline(transcribeAudio(audio, { mimeType: "audio/wav" }), deadlineAt);
  if (transcriptionResult.timedOut) throw new Error("call turn deadline exceeded during transcription");
  const transcription = transcriptionResult.value;
  const customerText = transcription.transcript.trim();
  if (!customerText) throw new Error("recording contained no speech");

  const customerIdx = session.turnCount * 2 + 1;
  const customerTurn = await prismaUnscoped.callTurn.create({
    data: {
      tenantId: session.tenantId,
      callSessionId: session.id,
      idx: customerIdx,
      recordingSid,
      role: "CUSTOMER",
      text: customerText,
      lang: transcription.languageCode ?? session.query.customer.preferredLang,
      recordingUrl,
      latencyMs: null,
      citedArticleIds: [],
    },
  });
  await prismaUnscoped.message.create({
    data: {
      tenantId: session.tenantId,
      ticketId: session.ticketId,
      role: "CUSTOMER",
      text: customerText,
      lang: customerTurn.lang,
      latencyMs: null,
    },
  });
  if (Date.now() >= deadlineAt) throw new Error("call turn deadline exceeded after transcription");

  const contextResult = await raceDeadline(Promise.all([
    getFlagsForTenant(session.tenant.slug),
    session.query.orderId
      ? prismaUnscoped.order.findFirst({ where: { id: session.query.orderId, tenantId: session.tenantId, customerId: session.query.customerId } })
      : Promise.resolve(null),
    prismaUnscoped.knowledgeArticle.findMany({ where: { tenantId: session.tenantId } }),
    prismaUnscoped.callTurn.findMany({ where: { callSessionId: session.id, idx: { lt: customerIdx } }, orderBy: { idx: "asc" } }),
  ]), deadlineAt);
  if (contextResult.timedOut) throw new Error("call turn deadline exceeded while loading context");
  const [flags, order, dbArticles, priorTurns] = contextResult.value;
  const articles = retrieve(dbArticles, session.tenantId, session.query.category, customerText);
  const configuredTurnLimit = Number(process.env.MAX_TURNS_PER_CALL ?? 8);
  const turnLimit = Number.isFinite(configuredTurnLimit) ? Math.max(1, Math.min(20, Math.floor(configuredTurnLimit))) : 8;
  const finalTurn = session.turnCount + 1 >= turnLimit;
  const messages = spokenMessages(session, customerText, order, flags, articles, priorTurns, finalTurn);
  const ctx: ToolExecutionContext = {
    tenantId: session.tenantId,
    tenantSlug: session.tenant.slug,
    ticketId: session.ticketId,
    callSessionId: session.id,
    customerName: session.query.customer.name,
    contextOrderIds: order ? [order.id] : [],
    flags,
    adapter: adapterFor(session.tenant),
    knowledgeArticles: articles,
    deadlineAt,
  };
  const turn = await runAgentTurn(messages, ctx);
  if (Date.now() >= deadlineAt) throw new Error("call turn deadline exceeded after agent response");

  const audioKey = await synthesizeAudioKey(turn.replyText, transcription.languageCode ?? session.query.customer.preferredLang, deadlineAt);
  const agentIdx = customerIdx + 1;
  await prismaUnscoped.$transaction([
    prismaUnscoped.callTurn.create({
      data: {
        tenantId: session.tenantId,
        callSessionId: session.id,
        idx: agentIdx,
        role: "AGENT",
        text: turn.replyText,
        lang: transcription.languageCode ?? session.query.customer.preferredLang,
        latencyMs: Date.now() - customerTurn.createdAt.getTime(),
        citedArticleIds: turn.citedArticleIds,
        audioKey: audioKey ?? undefined,
        endCall: turn.shouldEndCall || finalTurn,
      },
    }),
    prismaUnscoped.message.create({
      data: {
        tenantId: session.tenantId,
        ticketId: session.ticketId,
        role: "AGENT",
        text: turn.replyText,
        lang: transcription.languageCode ?? session.query.customer.preferredLang,
        latencyMs: Date.now() - customerTurn.createdAt.getTime(),
      },
    }),
    prismaUnscoped.callSession.update({
      where: { id: session.id },
      data: {
        turnCount: { increment: 1 },
        turnLeaseUntil: null,
        state: "CONNECTED",
      },
    }),
    ...turn.citedArticleIds.map((id) => prismaUnscoped.knowledgeArticle.updateMany({
      where: { id, tenantId: session.tenantId },
      data: { citedCount: { increment: 1 } },
    })),
  ]);
  return { text: turn.replyText, audioKey, shouldEndCall: turn.shouldEndCall || finalTurn };
}

async function finalizeCall(sessionId: string, providerStatus: string, body: Record<string, unknown>): Promise<void> {
  const session = await loadSession(sessionId);
  if (!session) return;
  const existingOutcome = await prismaUnscoped.callOutcome.findUnique({ where: { callSessionId: session.id } });
  if (existingOutcome) return;

  const turns = await prismaUnscoped.callTurn.findMany({ where: { callSessionId: session.id }, orderBy: { idx: "asc" } });
  const transcript = turns.map((turn) => `${turn.role === "CUSTOMER" ? "CUSTOMER" : "AGENT"}: ${turn.text}`).join("\n");
  const hasCustomerSpeech = turns.some((turn) => turn.role === "CUSTOMER" && turn.text.trim().length > 0);
  const noAnswer = ["busy", "no-answer", "failed", "canceled"].includes(providerStatus) || !hasCustomerSpeech;
  const classification = noAnswer
    ? {
        outcome: "HUMAN_REVIEW" as const,
        confidence: "LOW" as const,
        evidence: "",
        rationale: "No customer transcript is available to verify resolution; human follow-up is required.",
      }
    : await classifyOutcome(transcript, async (prompt, options) => {
        const response = await getSarvamLLM().chat.completions.create({
          model: SARVAM_LLM_MODEL,
          messages: [{ role: "user", content: prompt }],
          temperature: options.temperature,
          response_format: { type: "json_object" },
        }, { signal: AbortSignal.timeout(8_000) });
        return response.choices[0]?.message?.content ?? "";
      }, { customerTurns: turns.filter((turn) => turn.role === "CUSTOMER").map((turn) => turn.text) });

  const mapped = classification.outcome === "RESOLVED"
    ? { query: "RESOLVED" as const, ticket: "AUTO_RESOLVED" as const, resolved: true }
    : classification.outcome === "ONGOING"
      ? { query: "ONGOING" as const, ticket: "OPEN" as const, resolved: false }
      : { query: "HUMAN_REVIEW" as const, ticket: "ESCALATED" as const, resolved: true };
  const statusCode = typeof body.ErrorCode === "string" ? body.ErrorCode : undefined;
  const duration = typeof body.CallDuration === "string" ? Number(body.CallDuration) : NaN;

  await prismaUnscoped.$transaction(async (tx) => {
    const currentOutcome = await tx.callOutcome.findUnique({ where: { callSessionId: session.id } });
    if (currentOutcome) return;
    await tx.callOutcome.create({
      data: {
        tenantId: session.tenantId,
        callSessionId: session.id,
        value: classification.outcome,
        confidence: classification.confidence,
        evidence: classification.evidence,
        rationale: classification.rationale,
      },
    });
    await tx.callSession.update({
      where: { id: session.id },
      data: {
        state: providerStatus === "completed" ? "ENDED" : "FAILED",
        endedAt: new Date(),
        durationSec: Number.isFinite(duration) ? duration : undefined,
        answeredBy: typeof body.AnsweredBy === "string" ? body.AnsweredBy : undefined,
        errorCode: statusCode,
        turnLeaseUntil: null,
      },
    });
    await tx.query.update({ where: { id: session.queryId }, data: { status: mapped.query } });
    await tx.ticket.update({
      where: { id: session.ticketId },
      data: { status: mapped.ticket, resolvedAt: mapped.resolved ? new Date() : null },
    });
  });

  if (classification.outcome === "HUMAN_REVIEW") {
    void triggerHumanReviewWorkflow({
      event: "HUMAN_REVIEW",
      callSessionId: session.id,
      queryId: session.queryId,
      tenantSlug: session.tenant.slug,
      orderId: session.query.orderId,
      customerName: session.query.customer.name,
      evidence: classification.evidence,
      rationale: classification.rationale,
      transcriptUrl: publicUrlIfConfigured(`/api/calls/${session.id}`),
    });
  }
}

twilioRouter.post("/voice/:sessionId", async (req, res) => {
  if (!requireTwilioSignature(req, res)) return;
  const session = await loadSession(req.params.sessionId);
  if (!session) {
    res.status(404).send("Call session not found");
    return;
  }

  const answeredBy = req.body?.AnsweredBy;
  if (isMachineAnswered(answeredBy)) {
    await prismaUnscoped.callSession.update({ where: { id: session.id }, data: { answeredBy: String(answeredBy) } });
    await markHumanReview(session, "The call was answered by voicemail; human follow-up is required.");
    sendTwiml(res, hangupResponse());
    return;
  }

  await prismaUnscoped.callSession.update({
    where: { id: session.id },
    data: { state: "CONNECTED", answeredAt: new Date(), answeredBy: typeof answeredBy === "string" ? answeredBy : undefined },
  });
  const priorOpening = await prismaUnscoped.callTurn.findFirst({ where: { callSessionId: session.id, idx: 0, role: "AGENT" } });
  const openingLine = priorOpening?.text ?? buildOpeningLine({
    tenantName: session.tenant.name,
    customerName: session.query.customer.name,
    orderId: session.query.orderId ?? "your order",
    issueSummary: session.query.issueSummary,
  });
  let audioKey = priorOpening?.audioKey ?? null;
  if (!audioKey || !getAudio(audioKey)) {
    try {
      audioKey = await synthesizeAudioKey(openingLine, session.query.customer.preferredLang, Date.now() + 10_000);
    } catch (error) {
      if (isSarvamCreditsError(error)) {
        await prismaUnscoped.callSession.update({ where: { id: session.id }, data: { errorCode: "SARVAM_402", errorMessage: "Sarvam credits are exhausted" } });
        await markHumanReview(session, "Sarvam credits are exhausted before the conversation began.");
        sendTwiml(res, closeCallResponse("Maaf kijiye, hamari awaaz seva mein abhi dikkat aa rahi hai. Hamari team aapse dobara sampark karegi."));
        return;
      }
      audioKey = null;
    }
  }
  if (!priorOpening) {
    await prismaUnscoped.callTurn.create({
      data: {
        tenantId: session.tenantId,
        callSessionId: session.id,
        idx: 0,
        role: "AGENT",
        text: openingLine,
        lang: session.query.customer.preferredLang,
        citedArticleIds: [],
        audioKey: audioKey ?? undefined,
      },
    });
    await prismaUnscoped.message.create({
      data: { tenantId: session.tenantId, ticketId: session.ticketId, role: "AGENT", text: openingLine, lang: session.query.customer.preferredLang },
    });
  } else if (audioKey !== priorOpening.audioKey) {
    await prismaUnscoped.callTurn.update({ where: { id: priorOpening.id }, data: { audioKey: audioKey ?? undefined } });
  }
  sendTwiml(res, playAndRecord(session.id, audioKey, openingLine));
});

twilioRouter.post("/turn/:sessionId", async (req, res) => {
  if (!requireTwilioSignature(req, res)) return;
  const session = await loadSession(req.params.sessionId);
  if (!session) {
    res.status(404).send("Call session not found");
    return;
  }

  const recordingSid = typeof req.body?.RecordingSid === "string" ? req.body.RecordingSid : "";
  const recordingUrl = typeof req.body?.RecordingUrl === "string" ? req.body.RecordingUrl : "";
  if (!recordingSid || !recordingUrl) {
    sendTwiml(res, closeCallResponse("Maaf kijiye, recording nahi mil saki. Hamari team aapse sampark karegi."));
    await markHumanReview(session, "Twilio did not provide a recording for the customer turn.");
    return;
  }

  const existingCustomerTurn = await prismaUnscoped.callTurn.findFirst({
    where: { callSessionId: session.id, recordingSid, role: "CUSTOMER" },
  });
  if (existingCustomerTurn) {
    const existingAgentTurn = await prismaUnscoped.callTurn.findFirst({
      where: { callSessionId: session.id, idx: existingCustomerTurn.idx + 1, role: "AGENT" },
    });
    if (existingAgentTurn) {
      sendTwiml(res, existingAgentTurn.endCall
        ? playAndHangup(getAudio(existingAgentTurn.audioKey ?? "") ? existingAgentTurn.audioKey : null, existingAgentTurn.text)
        : playAndRecord(session.id, getAudio(existingAgentTurn.audioKey ?? "") ? existingAgentTurn.audioKey : null, existingAgentTurn.text));
    } else {
      sendTwiml(res, holdingResponse(session.id));
    }
    return;
  }

  const now = new Date();
  const claimed = await prismaUnscoped.callSession.updateMany({
    where: {
      id: session.id,
      state: "CONNECTED",
      OR: [{ turnLeaseUntil: null }, { turnLeaseUntil: { lt: now } }],
    },
    data: { turnLeaseUntil: new Date(now.getTime() + 25_000) },
  });
  if (claimed.count !== 1) {
    sendTwiml(res, holdingResponse(session.id));
    return;
  }

  const startedAt = Date.now();
  const deadlineAt = startedAt + INTERNAL_TURN_BUDGET_MS;
  const work = processCustomerTurn(session, recordingSid, recordingUrl, deadlineAt)
    .catch((error) => recoverTurnFailure(session, recordingSid, error));
  const response = await raceDeadline(work, deadlineAt);
  if (response.timedOut) {
    sendTwiml(res, holdingResponse(session.id));
    return;
  }
  if (response.value.terminal) {
    sendTwiml(res, closeCallResponse(response.value.text));
  } else if (response.value.shouldEndCall) {
    sendTwiml(res, playAndHangup(response.value.audioKey, response.value.text));
  } else {
    sendTwiml(res, playAndRecord(session.id, response.value.audioKey, response.value.text));
  }
});

twilioRouter.post("/pending/:sessionId", async (req, res) => {
  if (!requireTwilioSignature(req, res)) return;
  const session = await loadSession(req.params.sessionId);
  if (!session) {
    sendTwiml(res, hangupResponse());
    return;
  }
  const customerTurn = await prismaUnscoped.callTurn.findFirst({
    where: { callSessionId: session.id, role: "CUSTOMER" },
    orderBy: { idx: "desc" },
  });
  const agentTurn = customerTurn
    ? await prismaUnscoped.callTurn.findFirst({
        where: { callSessionId: session.id, role: "AGENT", idx: customerTurn.idx + 1 },
      })
    : null;
  if (["ENDED", "FAILED"].includes(session.state) && !agentTurn?.endCall) {
    sendTwiml(res, hangupResponse());
    return;
  }
  if (agentTurn) {
    const audioKey = agentTurn.audioKey && getAudio(agentTurn.audioKey) ? agentTurn.audioKey : null;
    sendTwiml(res, agentTurn.endCall
      ? playAndHangup(audioKey, agentTurn.text)
      : playAndRecord(session.id, audioKey, agentTurn.text));
    return;
  }

  if (session.turnLeaseUntil && session.turnLeaseUntil > new Date()) {
    sendTwiml(res, holdingResponse(session.id));
    return;
  }
  await markHumanReview(session, "The call turn exceeded its processing lease without a response.");
  sendTwiml(res, closeCallResponse("Maaf kijiye, abhi mujhe thodi dikkat aa rahi hai. Hamari team aapse dobara sampark karegi."));
});

twilioRouter.post("/status/:sessionId", async (req, res) => {
  if (!requireTwilioSignature(req, res)) return;
  const session = await prismaUnscoped.callSession.findUnique({ where: { id: req.params.sessionId } });
  if (!session) {
    res.status(404).send("Call session not found");
    return;
  }

  const status = typeof req.body?.CallStatus === "string" ? req.body.CallStatus : "";
  const answeredBy = req.body?.AnsweredBy;
  if (isMachineAnswered(answeredBy)) {
    await prismaUnscoped.callSession.update({ where: { id: session.id }, data: { answeredBy: String(answeredBy), state: "WRAPPING_UP" } });
    const fullSession = await loadSession(session.id);
    if (fullSession) await markHumanReview(fullSession, "The call was answered by voicemail; human follow-up is required.");
    res.sendStatus(200);
    return;
  }

  if (status === "ringing") {
    await prismaUnscoped.callSession.updateMany({ where: { id: session.id, state: "DIALING" }, data: { state: "RINGING" } });
  } else if (status === "in-progress") {
    await prismaUnscoped.callSession.updateMany({ where: { id: session.id, state: { in: ["DIALING", "RINGING"] } }, data: { state: "CONNECTED", answeredAt: new Date() } });
  } else if (["completed", "busy", "no-answer", "failed", "canceled"].includes(status)) {
    const claim = await prismaUnscoped.callSession.updateMany({
      where: { id: session.id, state: { notIn: ["ENDED", "FAILED", "WRAPPING_UP"] } },
      data: { state: "WRAPPING_UP" },
    });
    if (claim.count === 1) {
      const body = { ...req.body } as Record<string, unknown>;
      void finalizeCall(session.id, status, body).catch((error) => {
        console.error("Call finalization failed", { callSessionId: session.id, error: error instanceof Error ? error.message : "unknown error" });
      });
    }
  }
  res.sendStatus(200);
});

export const audioRouter = Router();
audioRouter.get("/:id.wav", (req, res) => {
  const audio = getAudio(req.params.id);
  if (!audio) {
    res.sendStatus(404);
    return;
  }
  res.set({ "Content-Type": "audio/wav", "Cache-Control": "no-store" }).send(audio);
});
