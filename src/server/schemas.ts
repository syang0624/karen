import { z } from "zod";

export const createCaseInputSchema = z
  .object({
    description: z.string().trim().min(10).max(2_000),
    mode: z.enum(["production", "offline_demo"]).default("production"),
  })
  .strict();

export const approvalInputSchema = z
  .object({
    proposalId: z.string().uuid(),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    decision: z.enum(["approved", "rejected"]),
  })
  .strict();

export const actionPayloadSchema = z
  .object({
    accountId: z.string().min(1).max(256),
    to: z.array(z.string().email()).max(10).optional(),
    subject: z.string().max(998).optional(),
    body: z.string().max(100_000).optional(),
    attachments: z.array(z.string().max(512)).max(20).optional(),
    destination: z.string().min(1).max(2_000),
    scheduledFor: z.string().datetime().optional(),
  })
  .strict();

export const actionProposalDraftSchema = z
  .object({
    type: z.enum([
      "email_send",
      "draft_save",
      "reminder_create",
      "file_upload",
      "call_start",
    ]),
    payload: actionPayloadSchema,
    rationale: z.string().min(1).max(2_000),
    risks: z.array(z.string().max(500)).max(10),
  })
  .strict()
  .superRefine((proposal, ctx) => {
    if (
      (proposal.type === "email_send" || proposal.type === "draft_save") &&
      (!proposal.payload.to?.length ||
        !proposal.payload.subject ||
        !proposal.payload.body)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Email proposals require recipient, subject, and body",
        path: ["payload"],
      });
    }
  });

export const webhookEnvelopeSchema = z
  .object({
    type: z.string().optional(),
    id: z.string().optional(),
    metadata: z
      .object({
        trigger_slug: z.string().optional(),
        connected_account_id: z.string().optional(),
        user_id: z.string().optional(),
      })
      .passthrough()
      .optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const llmAssemblySchema = z
  .object({
    summary: z.string().min(1).max(2_000),
    fields: z.array(
      z
        .object({
          key: z.string().regex(/^[a-z0-9_]+$/),
          label: z.string().min(1).max(100),
          value: z.string().max(1_000).nullable(),
          provenanceIds: z.array(z.string()).max(20),
          confidence: z.enum(["low", "medium", "high"]),
          conflict: z.enum(["none", "possible", "confirmed"]),
        })
        .strict()
    ),
    policyFindings: z.array(
      z
        .object({
          kind: z.enum([
            "deadline",
            "required_document",
            "form",
            "contact",
            "escalation",
          ]),
          statement: z.string().min(1).max(2_000),
          applicability: z.string().min(1).max(500),
          confidence: z.enum(["low", "medium", "high"]),
          sourceIds: z.array(z.string()).min(1).max(10),
        })
        .strict()
    ),
    checklist: z.array(
      z
        .object({
          label: z.string().min(1).max(200),
          reason: z.string().min(1).max(500),
          status: z.enum(["missing", "provided", "not_applicable"]),
          guidance: z.string().min(1).max(500),
        })
        .strict()
    ),
    deadlineDays: z.number().int().positive().max(365).nullable(),
    deadlineRule: z.string().min(1).max(1_000),
    eventDateFieldKey: z.string().regex(/^[a-z0-9_]+$/).nullable(),
    plan: z.array(z.string().min(1).max(500)).min(1).max(12),
    proposal: actionProposalDraftSchema.nullable(),
  })
  .strict();
