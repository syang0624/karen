import type { CaseFile, CaseSseEvent, CaseEventType } from "@/types";

interface StoredCase {
  ownerId: string;
  value: CaseFile;
  events: CaseSseEvent[];
  nextEventId: number;
}

interface KarenStore {
  cases: Map<string, StoredCase>;
  processedWebhookIds: Set<string>;
  uploadDigests: Map<string, { name: string; type: string; size: number }>;
}

declare global {
  var __karenStore: KarenStore | undefined;
}

const store: KarenStore =
  globalThis.__karenStore ??
  (globalThis.__karenStore = {
    cases: new Map(),
    processedWebhookIds: new Set(),
    uploadDigests: new Map(),
  });

function publicCase(stored: StoredCase): CaseFile {
  return structuredClone(stored.value);
}

export function createStoredCase(ownerId: string, value: CaseFile): CaseFile {
  const stored: StoredCase = {
    ownerId,
    value,
    events: [],
    nextEventId: 1,
  };
  store.cases.set(value.id, stored);
  emitCaseEvent(value.id, "case", publicCase(stored));
  return publicCase(stored);
}

export function getCaseForOwner(caseId: string, ownerId: string): CaseFile | null {
  const stored = store.cases.get(caseId);
  if (!stored || stored.ownerId !== ownerId) return null;
  return publicCase(stored);
}

export function getCaseOwner(caseId: string): string | null {
  return store.cases.get(caseId)?.ownerId ?? null;
}

export function findCasesByConnection(connectedAccountId: string): Array<{
  ownerId: string;
  caseFile: CaseFile;
}> {
  return Array.from(store.cases.values())
    .filter(
      (stored) =>
        stored.value.connection.connectedAccountId === connectedAccountId &&
        stored.value.mode === "production"
    )
    .map((stored) => ({
      ownerId: stored.ownerId,
      caseFile: publicCase(stored),
    }));
}

export function mutateCase(
  caseId: string,
  ownerId: string,
  mutation: (caseFile: CaseFile) => void
): CaseFile {
  const stored = store.cases.get(caseId);
  if (!stored || stored.ownerId !== ownerId) throw new Error("Case not found");
  mutation(stored.value);
  stored.value.updatedAt = new Date().toISOString();
  return publicCase(stored);
}

export function emitCaseEvent(
  caseId: string,
  type: CaseEventType,
  data: unknown
): CaseSseEvent {
  const stored = store.cases.get(caseId);
  if (!stored) throw new Error("Case not found");
  const event: CaseSseEvent = {
    id: stored.nextEventId++,
    type,
    caseId,
    timestamp: new Date().toISOString(),
    data: structuredClone(data),
  };
  stored.events.push(event);
  if (stored.events.length > 500) stored.events.splice(0, stored.events.length - 500);
  return event;
}

export function eventsAfter(
  caseId: string,
  ownerId: string,
  lastEventId: number
): CaseSseEvent[] | null {
  const stored = store.cases.get(caseId);
  if (!stored || stored.ownerId !== ownerId) return null;
  return structuredClone(stored.events.filter((event) => event.id > lastEventId));
}

export function deleteStoredCase(caseId: string, ownerId: string): boolean {
  const stored = store.cases.get(caseId);
  if (!stored || stored.ownerId !== ownerId) return false;
  return store.cases.delete(caseId);
}

export function rememberWebhook(webhookId: string): boolean {
  if (store.processedWebhookIds.has(webhookId)) return false;
  store.processedWebhookIds.add(webhookId);
  if (store.processedWebhookIds.size > 10_000) {
    const oldest = store.processedWebhookIds.values().next().value;
    if (oldest) store.processedWebhookIds.delete(oldest);
  }
  return true;
}

export function registerUpload(
  digest: string,
  metadata: { name: string; type: string; size: number }
) {
  store.uploadDigests.set(digest, metadata);
}
