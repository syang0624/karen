import { resolveUser } from "@/server/auth";
import { assertSameOrigin, errorResponse, json } from "@/server/http";
import { orchestrateCase } from "@/server/orchestrator";
import { getCaseForOwner, mutateCase } from "@/server/store";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const identity = resolveUser(request);
    const existing = getCaseForOwner(id, identity.userId);
    if (!existing) return json({ error: "Case not found" }, { status: 404 });
    if (
      !["needs_connection", "failed", "needs_input"].includes(existing.status)
    ) {
      return json(
        { error: `Case cannot be retried from ${existing.status}` },
        { status: 409 }
      );
    }
    const next = mutateCase(id, identity.userId, (caseFile) => {
      caseFile.status = "intake";
      caseFile.error = null;
    });
    queueMicrotask(() => {
      void orchestrateCase(id, identity.userId);
    });
    return json({ case: next });
  } catch (error) {
    return errorResponse(error);
  }
}
