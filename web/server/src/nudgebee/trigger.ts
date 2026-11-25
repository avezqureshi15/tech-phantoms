/**
 * Fires the NudgeBee workflow on REQUIRE_HUMAN (BUILD-PLAN §7.1). The exact
 * workflow shape is configured in NudgeBee's own Workflow Builder — this is
 * just the HTTP trigger call into it, carrying everything the Discord
 * notification and Approval task need, plus where to call back
 * (POST /api/approvals/callback, verified by APPROVAL_CALLBACK_SECRET).
 */
export interface ApprovalWorkflowPayload {
  approvalId: string;
  ticketId: string;
  tenantSlug: string;
  orderId: string;
  amountInr: number;
  customerName: string;
  reason: string;
  callbackUrl: string;
  callbackSecret: string;
}

export async function triggerApprovalWorkflow(payload: ApprovalWorkflowPayload): Promise<void> {
  const webhookUrl = process.env.NUDGEBEE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("NUDGEBEE_WEBHOOK_URL is not set — skipping workflow trigger for", payload.approvalId);
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`NudgeBee trigger failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
  } catch (err) {
    console.error("NudgeBee trigger failed:", err);
  }
}

export interface HumanReviewWorkflowPayload {
  event: "HUMAN_REVIEW";
  callSessionId: string;
  queryId: string;
  tenantSlug: string;
  orderId: string | null;
  customerName: string;
  evidence: string;
  rationale: string;
  transcriptUrl?: string;
}

export async function triggerHumanReviewWorkflow(payload: HumanReviewWorkflowPayload): Promise<void> {
  const webhookUrl = process.env.NUDGEBEE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("NUDGEBEE_WEBHOOK_URL is not set — skipping call review workflow for", payload.callSessionId);
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) console.error(`NudgeBee call-review trigger failed: ${response.status}`);
  } catch (error) {
    console.error("NudgeBee call-review trigger failed:", error instanceof Error ? error.message : "unknown error");
  }
}
