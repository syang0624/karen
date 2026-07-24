export type CaseStatus =
  | "intake"
  | "needs_connection"
  | "retrieving_evidence"
  | "researching"
  | "assembling"
  | "needs_input"
  | "awaiting_approval"
  | "executing"
  | "monitoring"
  | "resolved"
  | "failed";

export type EvidenceSourceKind =
  | "email"
  | "attachment"
  | "user_upload"
  | "user_statement";

export type Confidence = "low" | "medium" | "high";
export type ConflictStatus = "none" | "possible" | "confirmed";

export interface CaseConnection {
  provider: "gmail";
  status: "not_connected" | "connecting" | "connected" | "expired" | "error";
  connectedAccountId?: string;
  label?: string;
}

export interface EvidenceItem {
  id: string;
  label: string;
  value: string;
  sourceKind: EvidenceSourceKind;
  capturedAt: string;
  sensitivity: "private" | "restricted";
  confidence: number;
  locator: string;
  providerRefs?: {
    connectedAccountId?: string;
    messageId?: string;
    threadId?: string;
    attachmentId?: string;
  };
}

export interface ResearchSource {
  id: string;
  url: string;
  title: string;
  publisher: string;
  retrievedAt: string;
  sourceType: "airline" | "government" | "regulator" | "airport" | "other";
  excerpt: string;
}

export interface PolicyFinding {
  id: string;
  kind: "deadline" | "required_document" | "form" | "contact" | "escalation";
  statement: string;
  applicability: string;
  confidence: Confidence;
  sourceIds: string[];
}

export interface CaseField {
  key: string;
  label: string;
  value: string | null;
  provenanceIds: string[];
  confidence: Confidence;
  conflict: ConflictStatus;
}

export interface CaseDeadline {
  dueAt: string | null;
  status: "unknown" | "open" | "due_soon" | "past_due";
  rule: string;
  eventDate: string | null;
  policySourceIds: string[];
  eventEvidenceIds: string[];
}

export interface ChecklistItem {
  id: string;
  label: string;
  reason: string;
  status: "missing" | "provided" | "not_applicable";
  guidance: string;
}

export type ActionType =
  | "email_send"
  | "draft_save"
  | "reminder_create"
  | "file_upload"
  | "call_start";

export interface ActionPayload {
  accountId: string;
  to?: string[];
  subject?: string;
  body?: string;
  attachments?: string[];
  destination: string;
  scheduledFor?: string;
}

export interface ActionProposal {
  id: string;
  type: ActionType;
  payload: ActionPayload;
  rationale: string;
  risks: string[];
  createdAt: string;
  expiresAt: string;
  payloadHash: string;
  status: "pending" | "approved" | "rejected" | "expired" | "executed" | "failed";
}

export interface Approval {
  id: string;
  proposalId: string;
  proposalHash: string;
  approverUserId: string;
  decision: "approved" | "rejected";
  createdAt: string;
  expiresAt: string;
}

export interface Execution {
  id: string;
  proposalId: string;
  idempotencyKey: string;
  providerActionId: string | null;
  status: "succeeded" | "failed" | "outcome_unknown";
  startedAt: string;
  completedAt: string;
  error?: string;
  demo: boolean;
}

export interface ActivityEntry {
  id: string;
  type:
    | "status"
    | "evidence"
    | "research"
    | "decision"
    | "approval"
    | "execution"
    | "reply"
    | "error";
  title: string;
  detail: string;
  timestamp: string;
  sourceIds?: string[];
}

export interface ReplyEvent {
  id: string;
  providerEventId: string;
  receivedAt: string;
  sender: string;
  subject: string;
  summary: string;
}

export interface IvrDemoStep {
  id: string;
  prompt: string;
  action: string;
  timestamp: string;
}

export interface CaseFile {
  schemaVersion: "1.0";
  id: string;
  issueType: "airline_damaged_baggage";
  company: string;
  summary: string;
  userStatement: string;
  status: CaseStatus;
  mode: "production" | "offline_demo";
  createdAt: string;
  updatedAt: string;
  connection: CaseConnection;
  evidence: EvidenceItem[];
  researchSources: ResearchSource[];
  policyFindings: PolicyFinding[];
  fields: CaseField[];
  deadline: CaseDeadline | null;
  checklist: ChecklistItem[];
  plan: string[];
  proposals: ActionProposal[];
  approvals: Approval[];
  executions: Execution[];
  activities: ActivityEntry[];
  replies: ReplyEvent[];
  ivrDemo: {
    available: boolean;
    started: boolean;
    steps: IvrDemoStep[];
  };
  error: string | null;
}

export type CaseEventType =
  | "case"
  | "status"
  | "connection"
  | "evidence"
  | "research"
  | "plan"
  | "approval"
  | "execution"
  | "reply"
  | "ivr_demo"
  | "error";

export interface CaseSseEvent {
  id: number;
  type: CaseEventType;
  caseId: string;
  timestamp: string;
  data: unknown;
}

// Explicitly offline, prerecorded demo compatibility types. These are kept
// separate from the canonical CaseFile contract and are never used by the
// production orchestration path.
export type SessionStatus =
  | "idle"
  | "extracting"
  | "dialing"
  | "navigating"
  | "on_hold"
  | "handoff"
  | "done";

export interface IvrDecision {
  id: string;
  prompt_text: string;
  decision: string;
  reasoning: string;
  timestamp: string;
}

export interface BriefingCard {
  company: string;
  user_intent: string;
  identity: {
    name: string;
    loyalty_program: string;
    loyalty_number: string;
  };
  booking: {
    pnr: string;
    flight_number: string;
    route: string;
    date: string;
    status: string;
  };
  payment: {
    brand: string;
    last4: string;
  };
  context: {
    user_location: string;
    urgency: string;
  };
  suggested_opening: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type:
    | "Person"
    | "Email"
    | "Booking"
    | "Flight"
    | "Airline"
    | "LoyaltyAccount"
    | "PaymentMethod"
    | "Airport"
    | "Attachment";
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ReasoningEntry {
  id: string;
  message: string;
  timestamp: string;
  type: "info" | "decision" | "extraction" | "error";
}
