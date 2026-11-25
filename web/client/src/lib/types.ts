/** Mirrors the server's JSON responses (BUILD-PLAN §3.4, §3.5). Dates arrive as ISO strings. */

export type PolicyDecision = "ALLOW" | "DENY" | "REQUIRE_HUMAN";
export type TicketStatus = "OPEN" | "AUTO_RESOLVED" | "AWAITING_APPROVAL" | "ESCALATED" | "CLOSED";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type Role = "CUSTOMER" | "AGENT" | "SYSTEM";

export interface AgentActionSummary {
  tool: string;
  args: Record<string, unknown>;
  policyDecision: PolicyDecision;
  denyReason?: string;
  executed: boolean;
  approvalId?: string;
  result?: unknown;
}

export interface VoiceTurnResponse {
  ticketId: string;
  transcript: string;
  detectedLang: string;
  replyText: string;
  replyAudioB64: string;
  action: AgentActionSummary | null;
  ticketStatus: TicketStatus;
  latencyMs: { stt: number; llm: number; tts: number; total: number };
}

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  preferredLang: string;
}

export interface Tenant {
  slug: string;
  name: string;
}

export interface Ticket {
  id: string;
  tenantId: string;
  customerId: string;
  orderId: string | null;
  channel: "VOICE" | "CHAT";
  language: string;
  status: TicketStatus;
  resolutionType: string | null;
  issueCluster: string | null;
  promptVariant: string | null;
  openedAt: string;
  resolvedAt: string | null;
  customer?: Customer;
  actions?: AgentAction[];
  messages?: Message[];
}

export interface Message {
  id: string;
  ticketId: string;
  role: Role;
  text: string;
  lang: string | null;
  latencyMs: number | null;
  createdAt: string;
}

export interface AgentAction {
  id: string;
  ticketId: string;
  tool: string;
  args: Record<string, unknown>;
  policyDecision: PolicyDecision;
  denyReason: string | null;
  flagSnapshot: Record<string, unknown>;
  executed: boolean;
  result: unknown;
  createdAt: string;
}

export interface Approval {
  id: string;
  ticketId: string;
  agentActionId: string;
  status: ApprovalStatus;
  approver: string | null;
  workflowRunId: string | null;
  createdAt: string;
  decidedAt: string | null;
  agentAction?: AgentAction;
  ticket?: Ticket;
}

export interface ResolvedFlags {
  ai_agent_enabled: boolean;
  auto_refund_limit_inr: number;
  human_approval_above_inr: number;
  festive_surge_mode: boolean;
  enabled_languages: string;
  agent_prompt_variant: string;
}

/** A transcript line as rendered live on /demo — not persisted, mirrors Message once saved. */
export interface DisplayMessage {
  id: string;
  role: Role;
  text: string;
  lang: string | null;
  latencyMs: number | null;
  audioB64?: string;
}

export interface Metrics {
  ticketsToday: number;
  autoResolvedPct: number;
  awaitingApproval: number;
  avgHandleTimeSeconds: number;
}
