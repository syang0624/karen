import { resolveUser } from "@/server/auth";
import { assertSameOrigin, errorResponse, json } from "@/server/http";
import {
  deleteStoredCase,
  getCaseForOwner,
} from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const identity = resolveUser(request);
  const caseFile = getCaseForOwner(id, identity.userId);
  if (!caseFile) return json({ error: "Case not found" }, { status: 404 });
  return json({ case: caseFile });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const identity = resolveUser(request);
    if (!deleteStoredCase(id, identity.userId)) {
      return json({ error: "Case not found" }, { status: 404 });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
