import "server-only";

import { z } from "zod";
import type { ResearchSource } from "@/types";
import { sanitizeResearchContext, type PublicResearchContext } from "@/server/security";

const octenResponseSchema = z
  .object({
    code: z.number().optional(),
    msg: z.string().optional(),
    data: z.object({
      results: z.array(
        z
          .object({
            title: z.string(),
            url: z.string().url(),
            highlight: z.string().optional(),
            full_content: z.string().optional(),
            time_last_crawled: z.string().optional(),
          })
          .passthrough()
      ),
    }),
  })
  .passthrough();

function sourceType(hostname: string): ResearchSource["sourceType"] {
  if (hostname.endsWith(".gov")) return "government";
  if (hostname.includes("airport")) return "airport";
  if (hostname.includes("iata") || hostname.includes("icao")) return "regulator";
  if (hostname.includes("asiana")) return "airline";
  return "other";
}

export async function researchPublicPolicy(
  context: PublicResearchContext
): Promise<ResearchSource[]> {
  const apiKey = process.env.OCTEN_API_KEY;
  if (!apiKey) throw new Error("OCTEN_API_KEY is not configured");
  const safe = sanitizeResearchContext(context);
  const response = await fetch("https://api.octen.ai/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query: safe.query,
      count: 10,
      include_domains: safe.domains,
      highlight: { enable: true, max_tokens: 350 },
      full_content: { enable: true, max_tokens: 1_200 },
    }),
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Octen research failed with status ${response.status}`);
  }
  const parsed = octenResponseSchema.parse(await response.json());
  return parsed.data.results.map((result) => {
    const url = new URL(result.url);
    return {
      id: crypto.randomUUID(),
      url: result.url,
      title: result.title.slice(0, 300),
      publisher: url.hostname.replace(/^www\./, ""),
      retrievedAt: new Date().toISOString(),
      sourceType: sourceType(url.hostname),
      excerpt: (result.highlight ?? result.full_content ?? "No excerpt returned")
        .replace(/\s+/g, " ")
        .slice(0, 1_500),
    };
  });
}
