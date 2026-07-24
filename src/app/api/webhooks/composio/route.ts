import { randomUUID } from "node:crypto";
import { errorResponse, json } from "@/server/http";
import { verifyComposioWebhook } from "@/server/security";
import { webhookEnvelopeSchema } from "@/server/schemas";
import {
  emitCaseEvent,
  findCasesByConnection,
  mutateCase,
  rememberWebhook,
} from "@/server/store";

export const runtime = "nodejs";

function stringField(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const webhookId = request.headers.get("webhook-id");
    const secret = process.env.COMPOSIO_WEBHOOK_SECRET ?? "";
    const valid = verifyComposioWebhook({
      body,
      webhookId,
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
      secret,
    });
    if (!valid) return json({ error: "Invalid webhook signature" }, { status: 401 });
    if (!webhookId || !rememberWebhook(webhookId)) {
      return json({ received: true, duplicate: true });
    }

    const envelope = webhookEnvelopeSchema.parse(JSON.parse(body));
    const data = envelope.data ?? {};
    const connectedAccountId =
      envelope.metadata?.connected_account_id ??
      stringField(data, "connected_account_id", "connectedAccountId");
    if (!connectedAccountId) return json({ received: true, matched: 0 });
    const providerEventId =
      envelope.id ?? stringField(data, "id", "message_id", "messageId") ?? webhookId;
    const threadId = stringField(data, "thread_id", "threadId");
    let matched = 0;

    for (const { ownerId, caseFile } of findCasesByConnection(connectedAccountId)) {
      if (caseFile.replies.some((reply) => reply.providerEventId === providerEventId)) {
        continue;
      }
      const expectedThreadIds = new Set(
        caseFile.evidence
          .map((item) => item.providerRefs?.threadId)
          .filter((value): value is string => Boolean(value))
      );
      if (threadId && expectedThreadIds.size && !expectedThreadIds.has(threadId)) {
        continue;
      }
      const reply = {
        id: randomUUID(),
        providerEventId,
        receivedAt: new Date().toISOString(),
        sender: (stringField(data, "from", "sender") ?? "Connected email sender").slice(
          0,
          200
        ),
        subject: (stringField(data, "subject") ?? "Relevant reply").slice(0, 300),
        summary: (
          stringField(data, "snippet", "preview", "summary") ??
          "A reply arrived in the connected case thread."
        ).slice(0, 320),
      };
      mutateCase(caseFile.id, ownerId, (target) => {
        target.replies.push(reply);
        target.status = "monitoring";
        target.activities.push({
          id: randomUUID(),
          type: "reply",
          title: "Relevant reply detected",
          detail:
            "The reply was attached to this case. karen did not send an automatic response.",
          timestamp: reply.receivedAt,
        });
      });
      emitCaseEvent(caseFile.id, "reply", reply);
      matched += 1;
    }
    return json({ received: true, matched });
  } catch (error) {
    return errorResponse(error, 401);
  }
}
