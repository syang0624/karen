import { createHash, randomUUID } from "node:crypto";
import { resolveUser } from "@/server/auth";
import { assertSameOrigin, errorResponse, json } from "@/server/http";
import {
  emitCaseEvent,
  getCaseForOwner,
  mutateCase,
  registerUpload,
} from "@/server/store";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const identity = resolveUser(request);
    if (!getCaseForOwner(id, identity.userId)) {
      return json({ error: "Case not found" }, { status: 404 });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("A file is required");
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new Error("Only JPEG, PNG, WebP, and PDF files are accepted");
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      throw new Error("File must be between 1 byte and 10 MB");
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    const safeName = file.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 180);
    registerUpload(digest, {
      name: safeName,
      type: file.type,
      size: file.size,
    });
    const evidence = {
      id: randomUUID(),
      label: safeName,
      value: `${file.type} · ${file.size} bytes · SHA-256 ${digest.slice(0, 12)}…`,
      sourceKind: "user_upload" as const,
      capturedAt: new Date().toISOString(),
      sensitivity: "restricted" as const,
      confidence: 1,
      locator:
        "User-selected upload fingerprint. Bytes were processed transiently and require configured object storage for later sending.",
    };
    const next = mutateCase(id, identity.userId, (caseFile) => {
      caseFile.evidence.push(evidence);
      const photoItem = caseFile.checklist.find((item) =>
        /photo/i.test(item.label)
      );
      if (photoItem && file.type.startsWith("image/")) photoItem.status = "provided";
      caseFile.activities.push({
        id: randomUUID(),
        type: "evidence",
        title: "Document added",
        detail: `${safeName} was fingerprinted and added to the evidence list.`,
        timestamp: evidence.capturedAt,
        sourceIds: [evidence.id],
      });
    });
    emitCaseEvent(id, "evidence", evidence);
    return json({ case: next, evidence }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
