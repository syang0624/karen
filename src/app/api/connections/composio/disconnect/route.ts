import { resolveUser } from "@/server/auth";
import { disconnectEmail } from "@/server/adapters/composio";
import { assertSameOrigin, errorResponse, json } from "@/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = resolveUser(request);
    const body = (await request.json()) as { connectedAccountId?: unknown };
    if (typeof body.connectedAccountId !== "string") {
      throw new Error("connectedAccountId is required");
    }
    await disconnectEmail(identity.userId, body.connectedAccountId);
    return json({ disconnected: true });
  } catch (error) {
    return errorResponse(error);
  }
}
