import { randomUUID } from "node:crypto";
import { resolveUser } from "@/server/auth";
import { assertSameOrigin, errorResponse, json } from "@/server/http";
import { emitCaseEvent, getCaseForOwner, mutateCase } from "@/server/store";

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
    if (existing.mode !== "offline_demo" || !existing.ivrDemo.available) {
      return json(
        { error: "The IVR walkthrough is available only in sample mode" },
        { status: 409 }
      );
    }
    const step = {
      id: randomUUID(),
      prompt: "Asiana IVR walkthrough",
      action: "Local audio playback started by the user; no call was placed.",
      timestamp: new Date().toISOString(),
    };
    const next = mutateCase(id, identity.userId, (caseFile) => {
      caseFile.ivrDemo.started = true;
      caseFile.ivrDemo.steps.push(step);
      caseFile.activities.push({
        id: randomUUID(),
        type: "decision",
        title: "IVR walkthrough started",
        detail: step.action,
        timestamp: step.timestamp,
      });
    });
    emitCaseEvent(id, "ivr_demo", next.ivrDemo);
    return json({ case: next });
  } catch (error) {
    return errorResponse(error);
  }
}
