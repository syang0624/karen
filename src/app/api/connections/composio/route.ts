import { resolveUser } from "@/server/auth";
import { createEmailConnectLink } from "@/server/adapters/composio";
import { assertSameOrigin, errorResponse, json } from "@/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = resolveUser(request);
    const body = (await request.json()) as { caseId?: unknown };
    if (typeof body.caseId !== "string") throw new Error("caseId is required");
    const callback = new URL(`/case/${body.caseId}?connected=1`, request.url);
    const link = await createEmailConnectLink(identity.userId, callback.toString());
    return json(link, { setCookie: identity.setCookie });
  } catch (error) {
    return errorResponse(error);
  }
}
