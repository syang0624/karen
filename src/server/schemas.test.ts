import { describe, expect, it } from "vitest";
import {
  actionProposalDraftSchema,
  approvalInputSchema,
  createCaseInputSchema,
  llmAssemblySchema,
} from "@/server/schemas";

describe("request schemas", () => {
  it("defaults a valid case to production and rejects unknown fields", () => {
    expect(createCaseInputSchema.parse({ description: "My checked suitcase arrived with a broken wheel." }).mode).toBe("production");
    expect(() => createCaseInputSchema.parse({ description: "My checked suitcase arrived with a broken wheel.", extra: true })).toThrow();
  });

  it("requires a UUID proposal and a lowercase SHA-256 hash for approvals", () => {
    expect(
      approvalInputSchema.safeParse({
        proposalId: "550e8400-e29b-41d4-a716-446655440000",
        payloadHash: "a".repeat(64),
        decision: "approved",
      }).success
    ).toBe(true);
    expect(
      approvalInputSchema.safeParse({ proposalId: "proposal", payloadHash: "A".repeat(64), decision: "approved" }).success
    ).toBe(false);
  });

  it("requires complete email details for email and draft proposals", () => {
    const base = {
      type: "email_send" as const,
      payload: { accountId: "acct", destination: "demo outbox" },
      rationale: "A bounded action preview.",
      risks: [],
    };
    expect(actionProposalDraftSchema.safeParse(base).success).toBe(false);
    expect(
      actionProposalDraftSchema.safeParse({
        ...base,
        payload: { ...base.payload, to: ["claim@example.invalid"], subject: "Claim", body: "Hello" },
      }).success
    ).toBe(true);
  });

  it("keeps LLM assembly output constrained and requires cited policy findings", () => {
    const base = {
      summary: "A sourced baggage case.", fields: [], policyFindings: [], checklist: [], deadlineDays: null,
      deadlineRule: "No verified deadline.", eventDateFieldKey: null, plan: ["Review evidence"], proposal: null,
    };
    expect(llmAssemblySchema.safeParse(base).success).toBe(true);
    expect(llmAssemblySchema.safeParse({ ...base, unexpected: true }).success).toBe(false);
    expect(
      llmAssemblySchema.safeParse({
        ...base,
        policyFindings: [{ kind: "deadline", statement: "Seven days", applicability: "This case", confidence: "high", sourceIds: [] }],
      }).success
    ).toBe(false);
  });
});
