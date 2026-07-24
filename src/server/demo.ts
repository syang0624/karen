import type { CaseFile, EvidenceItem, ResearchSource } from "@/types";

export function demoEvidence(caseFile: CaseFile): EvidenceItem[] {
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      label: "Traveler statement",
      value: caseFile.userStatement,
      sourceKind: "user_statement",
      capturedAt: caseFile.createdAt,
      sensitivity: "private",
      confidence: 0.7,
      locator: "Case intake statement",
    },
    {
      id: crypto.randomUUID(),
      label: "Asiana itinerary — sample data",
      value:
        "Flight OZ212, booking XKRF2M, arrived at SFO on 2026-07-20 after travel from ICN.",
      sourceKind: "email",
      capturedAt: now,
      sensitivity: "private",
      confidence: 0.95,
      locator: "Sanitized offline fixture; no mailbox was accessed",
      providerRefs: {
        connectedAccountId: "demo_gmail",
        messageId: "demo_itinerary",
        threadId: "demo_thread",
      },
    },
    {
      id: crypto.randomUUID(),
      label: "Baggage receipt.pdf — sample data",
      value: "application/pdf · baggage tag 0988-7234",
      sourceKind: "attachment",
      capturedAt: now,
      sensitivity: "restricted",
      confidence: 0.95,
      locator: "Sanitized offline fixture; no attachment bytes were accessed",
      providerRefs: {
        connectedAccountId: "demo_gmail",
        messageId: "demo_itinerary",
        threadId: "demo_thread",
        attachmentId: "demo_baggage_receipt",
      },
    },
  ];
}

export function demoResearch(): ResearchSource[] {
  const retrievedAt = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      url: "https://flyasiana.com/C/US/EN/contents/baggage-contact",
      title: "Baggage inquiries — Asiana Airlines",
      publisher: "flyasiana.com",
      retrievedAt,
      sourceType: "airline",
      excerpt:
        "Offline research fixture: damaged or partially missing baggage must be reported within 7 days of receipt. Include passenger name, flight number, date, baggage tag, detailed photos and damage description, brand, and purchase price.",
    },
    {
      id: crypto.randomUUID(),
      url: "https://www.transportation.gov/lost-delayed-or-damaged-baggage",
      title: "Lost, Delayed, or Damaged Baggage",
      publisher: "U.S. Department of Transportation",
      retrievedAt,
      sourceType: "government",
      excerpt:
        "Offline research fixture: airlines are responsible for repairing or reimbursing damaged baggage when damage occurs while the bag is under airline control, subject to applicable liability limits.",
    },
  ];
}
