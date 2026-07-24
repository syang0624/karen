import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertNoPrivateLeakage,
  hashActionPayload,
  makeIdempotencyKey,
  sanitizeResearchContext,
  verifyComposioWebhook,
} from "@/server/security";

describe("public research sanitization", () => {
  it("builds a public, allowlisted query", () => {
    const result = sanitizeResearchContext({
      airlineKey: "ASIANA",
      issueType: "damaged_checked_baggage",
      arrivalCountry: "us",
      journeyType: "international",
    });

    expect(result).toEqual({
      airline: "Asiana Airlines",
      domains: ["flyasiana.com", "transportation.gov"],
      query:
        "Asiana Airlines official damaged checked baggage claim policy deadline required documents claim form support escalation US international",
    });
  });

  it("rejects private fields and private markers rather than incorporating them", () => {
    expect(() =>
      sanitizeResearchContext({
        airlineKey: "asiana",
        issueType: "damaged_checked_baggage",
        arrivalCountry: "US",
        journeyType: "international",
        bookingReference: "XKRF2M",
      })
    ).toThrow(/Private or unsupported/);

    for (const privateValue of [
      "traveler@example.com",
      "+1 (415) 555-0199",
      "booking XKRF2M",
      "baggage tag 0988-7234",
      "email body: private text",
    ]) {
      expect(() => assertNoPrivateLeakage(privateValue)).toThrow(/rejected/);
    }
  });

  it("rejects unsupported airlines and malformed public descriptors", () => {
    expect(() =>
      sanitizeResearchContext({
        airlineKey: "unknown",
        issueType: "damaged_checked_baggage",
        arrivalCountry: "US",
        journeyType: "international",
      })
    ).toThrow(/allowlist/);
    expect(() =>
      sanitizeResearchContext({
        airlineKey: "asiana",
        issueType: "damaged_checked_baggage",
        arrivalCountry: "United States",
        journeyType: "international",
      })
    ).toThrow(/two-letter/);
  });
});

describe("approval and webhook integrity helpers", () => {
  it("hashes semantically equivalent object payloads identically, but preserves array order", () => {
    const first = hashActionPayload("email_send", {
      payload: { subject: "Claim", to: ["claims@example.invalid"] },
      schemaVersion: "1.0",
    });
    const reorderedObject = hashActionPayload("email_send", {
      schemaVersion: "1.0",
      payload: { to: ["claims@example.invalid"], subject: "Claim" },
    });
    const reorderedArray = hashActionPayload("email_send", {
      schemaVersion: "1.0",
      payload: { to: ["other@example.invalid", "claims@example.invalid"], subject: "Claim" },
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(reorderedObject).toBe(first);
    expect(reorderedArray).not.toBe(first);
    expect(makeIdempotencyKey("case", "proposal", first)).toBe(
      makeIdempotencyKey("case", "proposal", first)
    );
  });

  it("accepts only a current, correctly signed webhook", () => {
    const body = '{"event":"connected"}';
    const webhookId = "wh_123";
    const timestamp = "1700000000";
    const secret = "test-secret";
    const signature = createHmac("sha256", secret)
      .update(`${webhookId}.${timestamp}.${body}`)
      .digest("base64");
    const params = { body, webhookId, timestamp, secret, now: 1_700_000_100_000 };

    expect(verifyComposioWebhook({ ...params, signature: `v1,${signature}` })).toBe(true);
    expect(verifyComposioWebhook({ ...params, signature: "v1,not-the-signature" })).toBe(false);
    expect(verifyComposioWebhook({ ...params, signature, now: 1_700_000_301_000 })).toBe(false);
    expect(verifyComposioWebhook({ ...params, signature, timestamp: "not-a-date" })).toBe(false);
  });
});
