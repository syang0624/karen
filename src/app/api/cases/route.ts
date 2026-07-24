import { resolveUser } from "@/server/auth";
import { assertSameOrigin, errorResponse, json } from "@/server/http";
import { makeBaseCase, orchestrateCase } from "@/server/orchestrator";
import { createCaseInputSchema } from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = createCaseInputSchema.parse(await request.json());
    if (
      input.mode === "offline_demo" &&
      process.env.NODE_ENV === "production" &&
      process.env.KAREN_ENABLE_OFFLINE_DEMO !== "true"
    ) {
      return json({ error: "Sample mode is disabled" }, { status: 403 });
    }
    const identity = resolveUser(request);
    const caseFile = makeBaseCase({
      ownerId: identity.userId,
      description: input.description,
      mode: input.mode,
    });
    queueMicrotask(() => {
      void orchestrateCase(caseFile.id, identity.userId);
    });
    return json(
      { case: caseFile },
      { status: 201, setCookie: identity.setCookie }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
