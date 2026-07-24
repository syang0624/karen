import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { researchPublicPolicy } from "@/server/adapters/octen";

describe("Octen adapter contract", () => {
  beforeEach(() => {
    process.env.OCTEN_API_KEY = "octen-test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OCTEN_API_KEY;
  });

  it("sends only the constructed public query and normalizes source records", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        query: string;
        include_domains: string[];
      };
      expect(request.query).toBe(
        "Asiana Airlines official damaged checked baggage claim policy deadline required documents claim form support escalation US international"
      );
      expect(request.query).not.toMatch(/@|XKRF2M|0988-7234/);
      expect(request.include_domains).toEqual([
        "flyasiana.com",
        "transportation.gov",
      ]);
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            results: [
              {
                title: "Baggage inquiries",
                url: "https://flyasiana.com/C/US/EN/contents/baggage-contact",
                highlight: "Report damaged baggage within 7 days.",
                time_last_crawled: "2026-07-23T00:00:00Z",
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const sources = await researchPublicPolicy({
      airlineKey: "asiana",
      issueType: "damaged_checked_baggage",
      arrivalCountry: "US",
      journeyType: "international",
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      publisher: "flyasiana.com",
      sourceType: "airline",
      excerpt: "Report damaged baggage within 7 days.",
    });
  });
});
