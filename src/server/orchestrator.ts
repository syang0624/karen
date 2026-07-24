import "server-only";

import { randomUUID } from "node:crypto";
import type {
  ActionProposal,
  ActivityEntry,
  CaseFile,
  CaseStatus,
  EvidenceItem,
} from "@/types";
import {
  createStoredCase,
  emitCaseEvent,
  getCaseForOwner,
  mutateCase,
} from "@/server/store";
import {
  getConnectedEmail,
  retrieveCaseEvidence,
} from "@/server/adapters/composio";
import { researchPublicPolicy } from "@/server/adapters/octen";
import { assembleCase, type AssemblyResult } from "@/server/adapters/llm";
import { demoEvidence, demoResearch } from "@/server/demo";
import { actionProposalDraftSchema } from "@/server/schemas";
import { hashActionPayload } from "@/server/security";

function activity(
  type: ActivityEntry["type"],
  title: string,
  detail: string,
  sourceIds?: string[]
): ActivityEntry {
  return {
    id: randomUUID(),
    type,
    title,
    detail,
    timestamp: new Date().toISOString(),
    sourceIds,
  };
}

export function makeBaseCase(params: {
  ownerId: string;
  description: string;
  mode: "production" | "offline_demo";
}): CaseFile {
  const now = new Date().toISOString();
  const caseFile: CaseFile = {
    schemaVersion: "1.0",
    id: randomUUID(),
    issueType: "airline_damaged_baggage",
    company: "Asiana Airlines",
    summary: "Preparing a sourced damaged-baggage case.",
    userStatement: params.description,
    status: "intake",
    mode: params.mode,
    createdAt: now,
    updatedAt: now,
    connection:
      params.mode === "offline_demo"
        ? {
            provider: "gmail",
            status: "connected",
            connectedAccountId: "demo_gmail",
            label: "Sample inbox data",
          }
        : { provider: "gmail", status: "not_connected" },
    evidence: [],
    researchSources: [],
    policyFindings: [],
    fields: [],
    deadline: null,
    checklist: [],
    plan: [],
    proposals: [],
    approvals: [],
    executions: [],
    activities: [
      activity(
        "status",
        params.mode === "offline_demo" ? "Sample-data case created" : "Case created",
        params.mode === "offline_demo"
          ? "This scenario uses sanitized fixtures and cannot contact an external service."
          : "karen will use only the connected account scoped to this browser user."
      ),
    ],
    replies: [],
    ivrDemo: {
      available: params.mode === "offline_demo",
      started: false,
      steps: [],
    },
    error: null,
  };
  return createStoredCase(params.ownerId, caseFile);
}

function setStatus(
  caseId: string,
  ownerId: string,
  status: CaseStatus,
  title: string,
  detail: string
) {
  const next = mutateCase(caseId, ownerId, (caseFile) => {
    caseFile.status = status;
    caseFile.error = status === "failed" ? detail : null;
    caseFile.activities.push(
      activity(status === "failed" ? "error" : "status", title, detail)
    );
  });
  emitCaseEvent(caseId, status === "failed" ? "error" : "status", {
    status,
    title,
    detail,
  });
  return next;
}

function calculateDeadline(
  assembly: AssemblyResult,
  evidence: EvidenceItem[],
  sources: CaseFile["researchSources"]
): CaseFile["deadline"] {
  const eventField = assembly.fields.find(
    (field) => field.key === assembly.eventDateFieldKey
  );
  if (!assembly.deadlineDays || !eventField?.value) {
    return {
      dueAt: null,
      status: "unknown",
      rule: assembly.deadlineRule,
      eventDate: eventField?.value ?? null,
      policySourceIds: assembly.policyFindings
        .filter((finding) => finding.kind === "deadline")
        .flatMap((finding) => finding.sourceIds),
      eventEvidenceIds: eventField?.provenanceIds ?? [],
    };
  }
  const eventDate = new Date(`${eventField.value}T12:00:00Z`);
  if (Number.isNaN(eventDate.valueOf())) {
    return {
      dueAt: null,
      status: "unknown",
      rule: assembly.deadlineRule,
      eventDate: eventField.value,
      policySourceIds: [],
      eventEvidenceIds: eventField.provenanceIds,
    };
  }
  const due = new Date(eventDate);
  due.setUTCDate(due.getUTCDate() + assembly.deadlineDays);
  const remaining = due.valueOf() - Date.now();
  const status =
    remaining < 0 ? "past_due" : remaining < 72 * 60 * 60 * 1000 ? "due_soon" : "open";
  const sourceIds = new Set(sources.map((source) => source.id));
  const evidenceIds = new Set(evidence.map((item) => item.id));
  return {
    dueAt: due.toISOString(),
    status,
    rule: assembly.deadlineRule,
    eventDate: eventField.value,
    policySourceIds: assembly.policyFindings
      .filter((finding) => finding.kind === "deadline")
      .flatMap((finding) => finding.sourceIds)
      .filter((id) => sourceIds.has(id)),
    eventEvidenceIds: eventField.provenanceIds.filter((id) => evidenceIds.has(id)),
  };
}

function configuredProposal(params: {
  caseFile: CaseFile;
  ownerId: string;
}): ActionProposal | null {
  const caseFile = params.caseFile;
  const recipient =
    caseFile.mode === "offline_demo"
      ? "baggage-claims@sample.invalid"
      : process.env.KAREN_CLAIMS_EMAIL;
  if (!recipient) return null;
  if (
    caseFile.mode === "production" &&
    !/@(?:[a-z0-9-]+\.)*flyasiana\.com$/i.test(recipient)
  ) {
    throw new Error("KAREN_CLAIMS_EMAIL must use an allowlisted airline domain");
  }
  const accountId = caseFile.connection.connectedAccountId;
  if (!accountId) return null;

  const fields = new Map(caseFile.fields.map((field) => [field.key, field.value]));
  const draft = actionProposalDraftSchema.parse({
    type: caseFile.mode === "offline_demo" ? "email_send" : "draft_save",
    payload: {
      accountId,
      to: [recipient],
      subject: `Damaged baggage claim${fields.get("flight_number") ? ` — ${fields.get("flight_number")}` : ""}`,
      body: [
        "Hello Asiana Baggage Support,",
        "",
        "I am reporting damage to my checked suitcase and would like to open a claim.",
        fields.get("flight_number") ? `Flight: ${fields.get("flight_number")}` : null,
        fields.get("booking_reference")
          ? `Booking reference: ${fields.get("booking_reference")}`
          : null,
        fields.get("baggage_tag") ? `Baggage tag: ${fields.get("baggage_tag")}` : null,
        fields.get("arrival_date")
          ? `Bag received: ${fields.get("arrival_date")}`
          : null,
        "",
        "Please confirm the next steps and any additional documents required.",
      ]
        .filter((line) => line !== null)
        .join("\n"),
      attachments: [],
      destination:
        caseFile.mode === "offline_demo"
          ? "Sample outbox (simulated; nothing will be sent)"
          : "Private Gmail draft",
    },
    rationale:
      caseFile.mode === "offline_demo"
        ? "Shows the approval boundary without contacting an external service."
        : "Saving a private provider draft lets you review it again before any send proposal.",
    risks:
      caseFile.mode === "offline_demo"
        ? ["This is simulated and cannot reach the airline."]
        : ["This changes your connected Gmail account by creating a private draft."],
  });

  const id = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.valueOf() + 15 * 60 * 1000).toISOString();
  const payloadHash = hashActionPayload(draft.type, {
    schemaVersion: caseFile.schemaVersion,
    ownerId: params.ownerId,
    caseId: caseFile.id,
    proposalId: id,
    expiresAt,
    payload: draft.payload,
  });
  return {
    id,
    ...draft,
    createdAt: createdAt.toISOString(),
    expiresAt,
    payloadHash,
    status: "pending",
  };
}

async function applyAssembly(params: {
  caseId: string;
  ownerId: string;
  assembly: AssemblyResult;
}) {
  const current = getCaseForOwner(params.caseId, params.ownerId);
  if (!current) throw new Error("Case not found");
  const deadline = calculateDeadline(
    params.assembly,
    current.evidence,
    current.researchSources
  );
  const next = mutateCase(params.caseId, params.ownerId, (caseFile) => {
    caseFile.summary = params.assembly.summary;
    caseFile.fields = params.assembly.fields;
    caseFile.policyFindings = params.assembly.policyFindings.map((finding) => ({
      ...finding,
      id: randomUUID(),
    }));
    caseFile.checklist = params.assembly.checklist.map((item) => ({
      ...item,
      id: randomUUID(),
    }));
    caseFile.deadline = deadline;
    caseFile.plan = params.assembly.plan;
    const proposal = configuredProposal({ caseFile, ownerId: params.ownerId });
    if (proposal) caseFile.proposals.push(proposal);
    const hasMissing = caseFile.checklist.some((item) => item.status === "missing");
    caseFile.status = proposal
      ? "awaiting_approval"
      : hasMissing
        ? "needs_input"
        : "monitoring";
    caseFile.activities.push(
      activity(
        "decision",
        "Case assembled",
        proposal
          ? "The sourced case and one bounded action preview are ready."
          : "The sourced case is ready. Resolve missing items before an action is proposed.",
        [
          ...caseFile.evidence.map((item) => item.id),
          ...caseFile.researchSources.map((source) => source.id),
        ]
      )
    );
  });
  emitCaseEvent(params.caseId, "plan", next);
}

async function runDemo(caseId: string, ownerId: string) {
  setStatus(
    caseId,
    ownerId,
    "retrieving_evidence",
    "Loading sanitized evidence",
    "Sample data is isolated from production adapters."
  );
  const current = getCaseForOwner(caseId, ownerId);
  if (!current) return;
  const evidence = demoEvidence(current);
  mutateCase(caseId, ownerId, (caseFile) => {
    caseFile.evidence = evidence;
    caseFile.activities.push(
      activity(
        "evidence",
        "Sample evidence loaded",
        "Loaded a sanitized itinerary and baggage-receipt fixture.",
        evidence.map((item) => item.id)
      )
    );
  });
  emitCaseEvent(caseId, "evidence", evidence);

  setStatus(
    caseId,
    ownerId,
    "researching",
    "Loading public-policy fixture",
    "Sample mode uses source-shaped records with official destination URLs."
  );
  const sources = demoResearch();
  mutateCase(caseId, ownerId, (caseFile) => {
    caseFile.researchSources = sources;
    caseFile.activities.push(
      activity(
        "research",
        "Sample policy sources loaded",
        "Loaded Asiana and U.S. DOT source fixtures.",
        sources.map((source) => source.id)
      )
    );
  });
  emitCaseEvent(caseId, "research", sources);

  setStatus(
    caseId,
    ownerId,
    "assembling",
    "Assembling case",
    "Normalizing facts, policy findings, missing items, and the deadline."
  );
  const assembly = await assembleCase({
    company: current.company,
    evidence,
    sources,
  });
  await applyAssembly({ caseId, ownerId, assembly });
}

async function runProduction(caseId: string, ownerId: string) {
  const connection = await getConnectedEmail(ownerId);
  if (!connection || connection.status === "expired") {
    const next = mutateCase(caseId, ownerId, (caseFile) => {
      caseFile.status = "needs_connection";
      caseFile.connection = {
        provider: "gmail",
        status: connection?.status === "expired" ? "expired" : "not_connected",
        connectedAccountId: connection?.id,
        label: connection?.label,
      };
      caseFile.activities.push(
        activity(
          "status",
          connection?.status === "expired"
            ? "Email connection expired"
            : "Email connection needed",
          "Connect one Gmail account before karen retrieves case-relevant messages."
        )
      );
    });
    emitCaseEvent(caseId, "connection", next.connection);
    return;
  }

  mutateCase(caseId, ownerId, (caseFile) => {
    caseFile.connection = {
      provider: "gmail",
      status: "connected",
      connectedAccountId: connection.id,
      label: connection.label,
    };
  });
  emitCaseEvent(caseId, "connection", { status: "connected" });

  setStatus(
    caseId,
    ownerId,
    "retrieving_evidence",
    "Searching connected email",
    "Searching a narrow one-year window for itinerary and baggage records."
  );
  const evidence = await retrieveCaseEvidence({
    userId: ownerId,
    connectedAccountId: connection.id,
    company: "Asiana Airlines",
  });
  mutateCase(caseId, ownerId, (caseFile) => {
    caseFile.evidence = [
      {
        id: randomUUID(),
        label: "Traveler statement",
        value: caseFile.userStatement,
        sourceKind: "user_statement",
        capturedAt: caseFile.createdAt,
        sensitivity: "private",
        confidence: 0.7,
        locator: "Case intake statement",
      },
      ...evidence,
    ];
    caseFile.activities.push(
      activity(
        "evidence",
        "Relevant records retrieved",
        `${evidence.length} normalized email or attachment record${evidence.length === 1 ? "" : "s"} retained; unrelated mailbox content was not stored.`,
        evidence.map((item) => item.id)
      )
    );
  });
  emitCaseEvent(caseId, "evidence", { count: evidence.length });

  setStatus(
    caseId,
    ownerId,
    "researching",
    "Researching current policy",
    "Octen receives only allowlisted public descriptors, never mailbox content."
  );
  const sources = await researchPublicPolicy({
    airlineKey: "asiana",
    issueType: "damaged_checked_baggage",
    arrivalCountry: "US",
    journeyType: "international",
  });
  mutateCase(caseId, ownerId, (caseFile) => {
    caseFile.researchSources = sources;
    caseFile.activities.push(
      activity(
        "research",
        "Official sources retrieved",
        `${sources.length} public source${sources.length === 1 ? "" : "s"} retained with excerpts and retrieval times.`,
        sources.map((source) => source.id)
      )
    );
  });
  emitCaseEvent(caseId, "research", { count: sources.length });

  setStatus(
    caseId,
    ownerId,
    "assembling",
    "Assembling sourced case",
    "Validating structured output and calculating the deadline deterministically."
  );
  const assembledCase = getCaseForOwner(caseId, ownerId);
  if (!assembledCase) throw new Error("Case not found");
  const assembly = await assembleCase({
    company: assembledCase.company,
    evidence: assembledCase.evidence,
    sources,
  });
  await applyAssembly({ caseId, ownerId, assembly });
}

export async function orchestrateCase(caseId: string, ownerId: string) {
  try {
    const caseFile = getCaseForOwner(caseId, ownerId);
    if (!caseFile) return;
    if (caseFile.mode === "offline_demo") await runDemo(caseId, ownerId);
    else await runProduction(caseId, ownerId);
  } catch (error) {
    setStatus(
      caseId,
      ownerId,
      "failed",
      "Case processing stopped",
      error instanceof Error ? error.message : "Unknown processing error"
    );
  }
}
