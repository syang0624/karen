import "server-only";

import { randomUUID } from "node:crypto";
import type { Approval, Execution } from "@/types";
import { executeApprovedAction } from "@/server/adapters/composio";
import { emitCaseEvent, getCaseForOwner, mutateCase } from "@/server/store";
import { hashActionPayload, makeIdempotencyKey } from "@/server/security";

function recomputeProposalHash(params: {
  ownerId: string;
  caseId: string;
  schemaVersion: string;
  proposal: NonNullable<ReturnType<typeof getCaseForOwner>>["proposals"][number];
}) {
  return hashActionPayload(params.proposal.type, {
    schemaVersion: params.schemaVersion,
    ownerId: params.ownerId,
    caseId: params.caseId,
    proposalId: params.proposal.id,
    expiresAt: params.proposal.expiresAt,
    payload: params.proposal.payload,
  });
}

export async function decideProposal(params: {
  caseId: string;
  ownerId: string;
  proposalId: string;
  payloadHash: string;
  decision: "approved" | "rejected";
}) {
  const current = getCaseForOwner(params.caseId, params.ownerId);
  if (!current) throw new Error("Case not found");
  const proposal = current.proposals.find((item) => item.id === params.proposalId);
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") {
    const existing = current.executions.find(
      (execution) => execution.proposalId === proposal.id
    );
    if (existing && params.decision === "approved") return getCaseForOwner(params.caseId, params.ownerId);
    throw new Error(`Proposal is already ${proposal.status}`);
  }
  if (new Date(proposal.expiresAt).valueOf() <= Date.now()) {
    mutateCase(params.caseId, params.ownerId, (caseFile) => {
      const target = caseFile.proposals.find((item) => item.id === proposal.id);
      if (target) target.status = "expired";
      caseFile.status = "needs_input";
    });
    throw new Error("Proposal expired; create a new preview");
  }

  const recomputed = recomputeProposalHash({
    ownerId: params.ownerId,
    caseId: params.caseId,
    schemaVersion: current.schemaVersion,
    proposal,
  });
  if (recomputed !== proposal.payloadHash || params.payloadHash !== proposal.payloadHash) {
    throw new Error("Proposal payload changed; approval is invalid");
  }

  const now = new Date();
  const approval: Approval = {
    id: randomUUID(),
    proposalId: proposal.id,
    proposalHash: proposal.payloadHash,
    approverUserId: params.ownerId,
    decision: params.decision,
    createdAt: now.toISOString(),
    expiresAt: proposal.expiresAt,
  };
  const decided = mutateCase(params.caseId, params.ownerId, (caseFile) => {
    const target = caseFile.proposals.find((item) => item.id === proposal.id);
    if (!target || target.status !== "pending") {
      throw new Error("Proposal changed while approval was being recorded");
    }
    target.status = params.decision === "approved" ? "approved" : "rejected";
    caseFile.approvals.push(approval);
    caseFile.status = params.decision === "approved" ? "executing" : "needs_input";
    caseFile.activities.push({
      id: randomUUID(),
      type: "approval",
      title: params.decision === "approved" ? "Action approved" : "Action rejected",
      detail:
        params.decision === "approved"
          ? "Approval is bound to the unchanged preview and expires with it."
          : "No external action was taken.",
      timestamp: now.toISOString(),
    });
  });
  emitCaseEvent(params.caseId, "approval", {
    approval,
    status: decided.status,
  });
  if (params.decision === "rejected") return decided;

  return executeProposal({
    caseId: params.caseId,
    ownerId: params.ownerId,
    proposalId: proposal.id,
  });
}

async function executeProposal(params: {
  caseId: string;
  ownerId: string;
  proposalId: string;
}) {
  const current = getCaseForOwner(params.caseId, params.ownerId);
  if (!current) throw new Error("Case not found");
  const proposal = current.proposals.find((item) => item.id === params.proposalId);
  const approval = current.approvals.find(
    (item) =>
      item.proposalId === params.proposalId &&
      item.decision === "approved" &&
      item.proposalHash === proposal?.payloadHash
  );
  if (!proposal || !approval) throw new Error("Valid approval not found");
  if (new Date(approval.expiresAt).valueOf() <= Date.now()) {
    throw new Error("Approval expired before execution");
  }
  const recomputed = recomputeProposalHash({
    ownerId: params.ownerId,
    caseId: params.caseId,
    schemaVersion: current.schemaVersion,
    proposal,
  });
  if (recomputed !== proposal.payloadHash) {
    throw new Error("Proposal payload changed after approval");
  }

  const idempotencyKey = makeIdempotencyKey(
    params.caseId,
    proposal.id,
    proposal.payloadHash
  );
  const existing = current.executions.find(
    (execution) => execution.idempotencyKey === idempotencyKey
  );
  if (existing) return current;

  const startedAt = new Date().toISOString();
  const execution: Execution = {
    id: randomUUID(),
    proposalId: proposal.id,
    idempotencyKey,
    providerActionId: null,
    status: "outcome_unknown",
    startedAt,
    completedAt: startedAt,
    demo: current.mode === "offline_demo",
  };
  mutateCase(params.caseId, params.ownerId, (caseFile) => {
    caseFile.executions.push(execution);
  });

  try {
    const result =
      current.mode === "offline_demo"
        ? { providerActionId: `sample_${randomUUID()}` }
        : await executeApprovedAction(proposal);
    const completed = mutateCase(params.caseId, params.ownerId, (caseFile) => {
      const targetExecution = caseFile.executions.find(
        (item) => item.idempotencyKey === idempotencyKey
      );
      const targetProposal = caseFile.proposals.find(
        (item) => item.id === proposal.id
      );
      if (!targetExecution || !targetProposal) throw new Error("Execution record missing");
      targetExecution.status = "succeeded";
      targetExecution.providerActionId = result.providerActionId;
      targetExecution.completedAt = new Date().toISOString();
      targetProposal.status = "executed";
      caseFile.status = "monitoring";
      caseFile.activities.push({
        id: randomUUID(),
        type: "execution",
        title:
          current.mode === "offline_demo"
            ? "Sample action simulated"
            : proposal.type === "draft_save"
              ? "Private draft saved"
              : "Approved action completed",
        detail:
          current.mode === "offline_demo"
            ? "No network call or provider-side change occurred."
            : `Provider result ${result.providerActionId} was recorded.`,
        timestamp: new Date().toISOString(),
      });
    });
    emitCaseEvent(params.caseId, "execution", completed.executions.at(-1));
    return completed;
  } catch (error) {
    const failed = mutateCase(params.caseId, params.ownerId, (caseFile) => {
      const targetExecution = caseFile.executions.find(
        (item) => item.idempotencyKey === idempotencyKey
      );
      const targetProposal = caseFile.proposals.find(
        (item) => item.id === proposal.id
      );
      if (targetExecution) {
        targetExecution.status = "outcome_unknown";
        targetExecution.error =
          error instanceof Error ? error.message : "Unknown provider error";
        targetExecution.completedAt = new Date().toISOString();
      }
      if (targetProposal) targetProposal.status = "failed";
      caseFile.status = "failed";
      caseFile.error =
        "The provider outcome could not be confirmed. karen will not retry automatically.";
      caseFile.activities.push({
        id: randomUUID(),
        type: "error",
        title: "Action outcome needs review",
        detail: caseFile.error,
        timestamp: new Date().toISOString(),
      });
    });
    emitCaseEvent(params.caseId, "error", {
      status: failed.status,
      error: failed.error,
    });
    return failed;
  }
}
