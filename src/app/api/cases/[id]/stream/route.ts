import { resolveUser } from "@/server/auth";
import { eventsAfter, getCaseForOwner } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function serialize(event: {
  id: number;
  type: string;
  caseId: string;
  timestamp: string;
  data: unknown;
}) {
  return encoder.encode(
    `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const identity = resolveUser(request);
  if (!getCaseForOwner(id, identity.userId)) {
    return new Response("Case not found", { status: 404 });
  }
  const lastHeader = request.headers.get("last-event-id");
  let cursor = lastHeader && /^\d+$/.test(lastHeader) ? Number(lastHeader) : 0;
  let interval: ReturnType<typeof setInterval> | undefined;
  let heartbeatAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const flush = () => {
        const events = eventsAfter(id, identity.userId, cursor);
        if (!events) {
          controller.close();
          if (interval) clearInterval(interval);
          return;
        }
        for (const event of events) {
          controller.enqueue(serialize(event));
          cursor = event.id;
        }
        if (Date.now() - heartbeatAt > 15_000) {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          heartbeatAt = Date.now();
        }
      };
      flush();
      interval = setInterval(flush, 750);
      request.signal.addEventListener(
        "abort",
        () => {
          if (interval) clearInterval(interval);
          try {
            controller.close();
          } catch {
            // Stream may already be closed by the runtime.
          }
        },
        { once: true }
      );
    },
    cancel() {
      if (interval) clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
