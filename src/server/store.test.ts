import { describe, expect, it } from "vitest";
import { rememberWebhook } from "@/server/store";

describe("webhook deduplication", () => {
  it("accepts an event once and rejects its duplicate", () => {
    const id = `test-webhook-${crypto.randomUUID()}`;
    expect(rememberWebhook(id)).toBe(true);
    expect(rememberWebhook(id)).toBe(false);
    expect(rememberWebhook(`${id}-other`)).toBe(true);
  });
});
