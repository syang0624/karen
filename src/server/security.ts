import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const PRIVATE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "email address", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { label: "phone number", pattern: /(?:\+?\d[\s().-]*){8,}/ },
  { label: "booking reference", pattern: /\b(?=[A-Z0-9]{6}\b)(?=.*[A-Z])(?=.*\d)[A-Z0-9]+\b/ },
  { label: "baggage tag", pattern: /\b\d{3,4}[- ]?\d{4,6}\b/ },
  { label: "message content marker", pattern: /\b(?:message body|email body|attachment content)\b/i },
];

const DEFAULT_AIRLINES: Record<string, { name: string; domains: string[] }> = {
  asiana: { name: "Asiana Airlines", domains: ["flyasiana.com"] },
};

export interface PublicResearchContext {
  airlineKey: string;
  issueType: "damaged_checked_baggage";
  arrivalCountry: string;
  journeyType: "international" | "domestic";
}

function airlineDirectory() {
  const raw = process.env.KAREN_AIRLINE_DIRECTORY;
  if (!raw) return DEFAULT_AIRLINES;

  try {
    const parsed = JSON.parse(raw) as Record<string, { name: string; domains: string[] }>;
    return { ...DEFAULT_AIRLINES, ...parsed };
  } catch {
    throw new Error("KAREN_AIRLINE_DIRECTORY must be valid JSON");
  }
}

export function sanitizeResearchContext(input: unknown): {
  query: string;
  domains: string[];
  airline: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Research context must be a record");
  }

  const record = input as Record<string, unknown>;
  const allowedKeys = new Set([
    "airlineKey",
    "issueType",
    "arrivalCountry",
    "journeyType",
  ]);
  const rejectedKeys = Object.keys(record).filter((key) => !allowedKeys.has(key));
  if (rejectedKeys.length) {
    throw new Error(`Private or unsupported research fields rejected: ${rejectedKeys.join(", ")}`);
  }

  const directory = airlineDirectory();
  const airlineKey = String(record.airlineKey ?? "").toLowerCase();
  const airline = directory[airlineKey];
  if (!airline) throw new Error("Airline is not in the public research allowlist");
  if (record.issueType !== "damaged_checked_baggage") {
    throw new Error("Unsupported public issue type");
  }
  if (record.journeyType !== "international" && record.journeyType !== "domestic") {
    throw new Error("Unsupported journey type");
  }

  const arrivalCountry = String(record.arrivalCountry ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(arrivalCountry)) {
    throw new Error("Arrival country must be a two-letter public country code");
  }

  const query = [
    airline.name,
    "official damaged checked baggage claim policy",
    "deadline required documents claim form support escalation",
    arrivalCountry,
    record.journeyType,
  ].join(" ");
  assertNoPrivateLeakage(query);

  return {
    query,
    domains: [...airline.domains, "transportation.gov"],
    airline: airline.name,
  };
}

export function assertNoPrivateLeakage(value: string): void {
  if (value.length > 500) throw new Error("Research query exceeds 500 characters");
  for (const { label, pattern } of PRIVATE_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error(`Research query rejected due to possible ${label}`);
    }
  }
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(",")}}`;
}

export function hashActionPayload(type: string, payload: unknown): string {
  return createHash("sha256")
    .update(canonicalize({ type, payload }))
    .digest("hex");
}

export function makeIdempotencyKey(
  caseId: string,
  proposalId: string,
  payloadHash: string
): string {
  return createHash("sha256")
    .update(`${caseId}:${proposalId}:${payloadHash}`)
    .digest("hex");
}

export function verifyComposioWebhook(params: {
  body: string;
  webhookId: string | null;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  now?: number;
}): boolean {
  const { body, webhookId, timestamp, signature, secret } = params;
  if (!webhookId || !timestamp || !signature || !secret) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const nowSeconds = Math.floor((params.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > 300) return false;

  const received = signature.startsWith("v1,") ? signature.slice(3) : signature;
  const expected = createHmac("sha256", secret)
    .update(`${webhookId}.${timestamp}.${body}`)
    .digest("base64");
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}
