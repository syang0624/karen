import "server-only";

import { Composio } from "@composio/core";
import { z } from "zod";
import type { ActionProposal, EvidenceItem } from "@/types";

const gmailMessageListSchema = z
  .object({
    messages: z
      .array(z.object({ id: z.string(), threadId: z.string().optional() }))
      .optional(),
  })
  .passthrough();

const gmailMessageSchema = z
  .object({
    id: z.string(),
    threadId: z.string().optional(),
    snippet: z.string().optional(),
    internalDate: z.string().optional(),
    payload: z
      .object({
        headers: z
          .array(z.object({ name: z.string(), value: z.string() }))
          .optional(),
        parts: z
          .array(
            z
              .object({
                filename: z.string().optional(),
                mimeType: z.string().optional(),
                body: z
                  .object({
                    attachmentId: z.string().optional(),
                    size: z.number().optional(),
                  })
                  .optional(),
              })
              .passthrough()
          )
          .optional(),
      })
      .optional(),
  })
  .passthrough();

function client() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is not configured");
  return new Composio({ apiKey });
}

function proxyData(response: unknown): unknown {
  if (!response || typeof response !== "object") return response;
  const record = response as Record<string, unknown>;
  return record.data ?? response;
}

export interface ConnectedEmail {
  id: string;
  status: "connected" | "expired";
  label: string;
}

export async function getConnectedEmail(userId: string): Promise<ConnectedEmail | null> {
  if (!process.env.COMPOSIO_API_KEY) return null;
  const response = await client().connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: ["gmail"],
    statuses: ["ACTIVE", "EXPIRED"],
    limit: 20,
  });
  const account = response.items.find((item) => item.status === "ACTIVE") ?? response.items[0];
  if (!account) return null;
  return {
    id: account.id,
    status: account.status === "ACTIVE" ? "connected" : "expired",
    label: "Connected Gmail account",
  };
}

export async function createEmailConnectLink(userId: string, callbackUrl: string) {
  const authConfigId = process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;
  if (!authConfigId) {
    throw new Error("COMPOSIO_GMAIL_AUTH_CONFIG_ID is not configured");
  }
  const request = await client().connectedAccounts.link(userId, authConfigId, {
    callbackUrl,
  });
  return { redirectUrl: request.redirectUrl, connectedAccountId: request.id };
}

export async function disconnectEmail(userId: string, connectedAccountId: string) {
  const account = await getConnectedEmail(userId);
  if (!account || account.id !== connectedAccountId) {
    throw new Error("Connected account does not belong to this user");
  }
  await client().connectedAccounts.delete(connectedAccountId);
}

function header(
  headers: Array<{ name: string; value: string }> | undefined,
  name: string
) {
  return headers?.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
    ?.value;
}

function scopedMailboxQuery(company: string) {
  const publicCompany = company.replace(/[^A-Za-z0-9 .&'-]/g, "").slice(0, 80);
  return `newer_than:1y (${publicCompany} OR itinerary OR flight) (baggage OR suitcase OR booking)`;
}

export async function retrieveCaseEvidence(params: {
  userId: string;
  connectedAccountId: string;
  company: string;
}): Promise<EvidenceItem[]> {
  const composio = client();
  const listResponse = await composio.tools.proxyExecute({
    endpoint: "https://gmail.googleapis.com/gmail/v1/users/me/messages",
    method: "GET",
    connectedAccountId: params.connectedAccountId,
    parameters: [
      { in: "query", name: "q", value: scopedMailboxQuery(params.company) },
      { in: "query", name: "maxResults", value: 10 },
    ],
  });
  const messageList = gmailMessageListSchema.parse(proxyData(listResponse));
  const evidence: EvidenceItem[] = [];

  for (const item of (messageList.messages ?? []).slice(0, 10)) {
    const messageResponse = await composio.tools.proxyExecute({
      endpoint: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
        item.id
      )}`,
      method: "GET",
      connectedAccountId: params.connectedAccountId,
      parameters: [{ in: "query", name: "format", value: "full" }],
    });
    const message = gmailMessageSchema.parse(proxyData(messageResponse));
    const subject = header(message.payload?.headers, "Subject") ?? "Relevant email";
    const capturedAt = message.internalDate
      ? new Date(Number(message.internalDate)).toISOString()
      : new Date().toISOString();

    evidence.push({
      id: crypto.randomUUID(),
      label: subject.slice(0, 160),
      value: (message.snippet ?? "Relevant message retrieved").slice(0, 320),
      sourceKind: "email",
      capturedAt,
      sensitivity: "private",
      confidence: 0.8,
      locator: `Gmail message ${message.id}, subject header and provider snippet`,
      providerRefs: {
        connectedAccountId: params.connectedAccountId,
        messageId: message.id,
        threadId: message.threadId,
      },
    });

    for (const part of message.payload?.parts ?? []) {
      if (!part.filename || !part.body?.attachmentId) continue;
      evidence.push({
        id: crypto.randomUUID(),
        label: part.filename.slice(0, 200),
        value: `${part.mimeType ?? "attachment"} · ${part.body.size ?? 0} bytes`,
        sourceKind: "attachment",
        capturedAt,
        sensitivity: "restricted",
        confidence: 1,
        locator: `Gmail message ${message.id}, attachment ${part.body.attachmentId}`,
        providerRefs: {
          connectedAccountId: params.connectedAccountId,
          messageId: message.id,
          threadId: message.threadId,
          attachmentId: part.body.attachmentId,
        },
      });
    }
  }
  return evidence;
}

function mimeMessage(proposal: ActionProposal) {
  const to = proposal.payload.to?.join(", ") ?? "";
  const lines = [
    `To: ${to}`,
    `Subject: ${proposal.payload.subject ?? ""}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    proposal.payload.body ?? "",
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export async function executeApprovedAction(proposal: ActionProposal): Promise<{
  providerActionId: string;
}> {
  if (proposal.payload.attachments?.length) {
    throw new Error("Attachment sending is disabled until object storage is configured");
  }
  if (proposal.type !== "email_send" && proposal.type !== "draft_save") {
    throw new Error(`Composio execution is not implemented for ${proposal.type}`);
  }

  const endpoint =
    proposal.type === "email_send"
      ? "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
      : "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
  const body =
    proposal.type === "email_send"
      ? { raw: mimeMessage(proposal) }
      : { message: { raw: mimeMessage(proposal) } };
  const response = await client().tools.proxyExecute({
    endpoint,
    method: "POST",
    connectedAccountId: proposal.payload.accountId,
    body,
  });
  const data = z
    .object({ id: z.string() })
    .passthrough()
    .parse(proxyData(response));
  return { providerActionId: data.id };
}
