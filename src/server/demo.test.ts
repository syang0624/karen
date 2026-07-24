import { describe, expect, it } from "vitest";
import { demoEvidence, demoResearch } from "@/server/demo";
import type { CaseFile } from "@/types";

function offlineCase(): CaseFile {
  return {
    schemaVersion: "1.0", id: "case", issueType: "airline_damaged_baggage", company: "Asiana Airlines",
    summary: "", userStatement: "My suitcase arrived damaged after the flight.", status: "intake", mode: "offline_demo",
    createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z",
    connection: { provider: "gmail", status: "connected", connectedAccountId: "demo_gmail" }, evidence: [], researchSources: [],
    policyFindings: [], fields: [], deadline: null, checklist: [], plan: [], proposals: [], approvals: [], executions: [],
    activities: [], replies: [], ivrDemo: { available: true, started: false, steps: [] }, error: null,
  };
}

describe("offline demo fixtures", () => {
  it("uses sanitized local fixture records with no live provider targets", () => {
    const evidence = demoEvidence(offlineCase());
    const sources = demoResearch();

    expect(evidence).toHaveLength(3);
    expect(evidence.every((item) => item.providerRefs?.connectedAccountId === "demo_gmail" || !item.providerRefs)).toBe(true);
    expect(evidence.map((item) => item.locator).join(" ")).toContain("no mailbox was accessed");
    expect(evidence.map((item) => item.locator).join(" ")).toContain("no attachment bytes were accessed");
    expect(sources).toHaveLength(2);
    expect(sources.every((source) => new URL(source.url).protocol === "https:")).toBe(true);
    expect(sources.map((source) => source.excerpt).join(" ")).toContain("Offline research fixture");
  });
});
