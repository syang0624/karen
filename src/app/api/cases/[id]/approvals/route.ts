import { resolveUser } from "@/server/auth";
import { decideProposal } from "@/server/approvals";
import { assertSameOrigin, errorResponse, json } from "@/server/http";
import { approvalInputSchema } from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const identity = resolveUser(request);
    const input = approvalInputSchema.parse(await request.json());
    const caseFile = await decideProposal({
      caseId: id,
      ownerId: identity.userId,
      ...input,
    });
    return json({ case: caseFile });
  } catch (error) {
    return errorResponse(error);
  }
}
