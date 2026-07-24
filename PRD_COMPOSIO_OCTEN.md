# PRD: karen

_An evidence-backed assistant for resolving customer-service problems_

## Current repository baseline

The repository currently contains a Next.js 16 / React 19 frontend, with no checked-in backend and no README. The home page creates a client-side session ID; `useSessionMock` drives a timed Asiana damaged-baggage demo from hard-coded inbox facts, a simulated entity graph, structured reasoning entries, and `public/asiana_phone_call.m4a`. A second hook expects a future REST API plus an SSE stream at `/sessions/:id/stream`. The live screen already has useful phone, graph, briefing-card, and activity-log components.

The existing `PRD.md`, `NORI.md`, and `STEVEN.md` propose Butterbase and Neo4j, while the installed dependencies contain neither integration. No RocketRide implementation or dependency is present in the checked-in source. This PRD supersedes those proposed architecture choices without overwriting the original documents.

## 1. Product overview

**karen** helps a user turn a stressful customer-service problem into a sourced, reviewable case and a set of safe next actions.

The user explains what happened in plain language. karen retrieves relevant private account data through Composio, researches current public rules and escalation paths through Octen, and combines both through application-owned orchestration and schema-validated LLM outputs. It then shows:

- what happened and which facts support it;
- applicable policy, deadlines, forms, required documents, support contacts, and escalation paths;
- missing evidence or unanswered questions;
- recommended next steps;
- drafts and action proposals that the user can review.

The primary example is an airline damaged-baggage claim. A traveler says, “Asiana broke my suitcase on my recent flight.” karen finds the relevant itinerary and baggage documents in the user's connected email, researches the airline's current official claim process, builds a deadline-aware claim packet, and drafts the next communication. It does not send, upload, or call until the user explicitly approves that specific action.

The product is broader than phone calls: it prepares and follows through across email, attachments, reminders, reply monitoring, forms, and—where practical—the existing IVR demo.

## 2. Main user flow

1. **Describe the problem.** The user enters a natural-language account of the damaged bag and may add photos or notes.
2. **Connect an account if needed.** karen opens a Composio connection flow for the user's email or other required service. The app stores only its own user ID and Composio connection reference, not provider credentials.
3. **Retrieve private evidence.** Through Composio, karen searches the user's mailbox using a narrow, case-relevant query and retrieves relevant messages and attachments, such as the itinerary, flight number, booking reference, baggage tag, arrival date, and prior airline correspondence.
4. **Research public requirements.** karen sends Octen a sanitized query such as “Asiana Airlines official damaged checked baggage claim policy, deadlines, required documents, form, US support and escalation.” It never includes the user's name, email, booking reference, baggage tag, message text, attachment content, or other private facts.
5. **Assemble the case.** Schema-validated LLM extraction normalizes private facts and public research into a case summary, evidence list, policy findings, deadline, missing-document checklist, and recommended plan. Every material statement links to its source.
6. **Review gaps.** The user confirms uncertain facts and supplies missing items, such as damage photos, repair estimates, or an airport report.
7. **Review proposed actions.** karen may prepare an email draft, attachment bundle, reminder, form checklist, follow-up schedule, or call plan. The UI displays recipients, content, files, destination, and expected effect before any external action.
8. **Approve and execute.** The user explicitly approves one bounded action. karen executes it through Composio or another approved action adapter, records the outcome, and never treats approval of one action as approval of later actions.
9. **Monitor and follow up.** Composio monitors relevant replies or account events. karen updates the case, alerts the user, and can prepare a follow-up or escalation draft, again requiring approval before external action.

## 3. Composio responsibilities

Composio is the authenticated integration and action layer for user-connected services.

- Create and manage per-user connected accounts using a stable application user ID.
- Retrieve real emails instead of the current seeded or hard-coded inbox data.
- Search narrowly for case-relevant messages and fetch message bodies, thread context, metadata, and attachments.
- Retrieve attachment bytes or secure references only when needed for the case.
- Create provider-side drafts where supported.
- Create reminders or calendar/task items where supported.
- Register triggers or polling workflows to detect replies and relevant status changes.
- Execute user-approved actions such as sending an email, uploading a file, creating a reminder, or invoking another connected-service action.
- Return provider IDs, timestamps, and execution results for the audit log.
- Surface expired or missing connections so karen can request reauthorization.

Composio is not the policy research system, the case-reasoning engine, or the approval authority. Read access may occur after account consent as part of the user-requested case flow; externally visible writes require a separate in-product approval.

## 4. Octen responsibilities

Octen is the live public-web research and source-extraction layer.

- Search for current official airline policies, jurisdiction-specific deadlines, required documents, forms, support contacts, and escalation or complaint paths.
- Prefer official airline, airport, regulator, treaty, and government sources; use secondary sources only to discover or clarify official sources.
- Extract clean page content and the specific passages that support each finding.
- Return source URL, title, publisher/domain, retrieval time, relevant excerpt, and source type.
- Refresh time-sensitive research when a case is reopened or before a deadline-sensitive action.
- Report conflicts, missing official guidance, stale pages, or inaccessible forms instead of silently guessing.

Octen queries must contain only public problem descriptors and coarse non-identifying context needed to find the correct policy, such as airline, issue type, arrival country, and domestic/international classification. Private Composio data stays inside karen's application boundary and is joined with Octen results only after research returns.

## 5. Simplified architecture

```text
Next.js UI
  ├─ case intake, evidence/provenance view, plan, approvals, IVR demo
  └─ SSE client for live progress
        │
Application API and orchestration
  ├─ deterministic case state machine
  ├─ Composio adapter: connected accounts, reads, triggers, approved actions
  ├─ Octen adapter: sanitized public research and source extraction
  ├─ LLM adapter: schema-validated extraction, synthesis, and drafting
  ├─ approval policy and action executor
  └─ optional relational DB + object storage
```

The application owns orchestration. A conventional state machine coordinates `intake → retrieving_evidence → researching → assembling → needs_input → awaiting_approval → executing → monitoring → resolved`, with explicit failure and retry states. LLMs return versioned structured objects validated against application schemas; they do not choose whether an external side effect is authorized.

If persistence is needed, use a standard relational database such as Postgres for users, cases, evidence metadata, research sources, proposals, approvals, executions, and event logs. Use ordinary object storage for user-supplied files or attachment copies only when necessary. Do not use RocketRide, Neo4j, Butterbase, a graph database, or a proprietary agent runtime.

Preserve the existing REST/SSE shape where practical:

- `POST /cases` creates a case.
- `GET /cases/:id` returns the current assembled case.
- `GET /cases/:id/stream` emits typed SSE events for status, evidence, research, plan, approval, execution, reply, IVR-demo, and error updates.
- `POST /cases/:id/approvals` approves or rejects one immutable action proposal.
- Composio webhooks enter through a signature-verified server endpoint and are deduplicated before changing case state.

The current graph visualization may remain as a provenance visualization, but its nodes and edges are derived on demand from relational/JSON evidence records. It is not a Neo4j client or persistence model.

## 6. Data and evidence model

The canonical output is a versioned `CaseFile`, not an inferred entity graph:

- **Case:** ID, owner, issue type, company, summary, status, timestamps, and user-stated facts.
- **Private evidence item:** normalized fact or file reference; source kind (`email`, `attachment`, `user_upload`, `user_statement`); Composio account/message/thread/attachment IDs; captured time; sensitivity; extraction confidence; and an exact source locator.
- **Public research source:** URL, title, publisher, retrieval time, source type, extracted passage, and which policy findings it supports.
- **Policy finding:** rule, deadline, required documents, form/contact/escalation path, jurisdiction or applicability, confidence, and source IDs.
- **Case field:** normalized value, provenance IDs, confidence, and conflict status. Examples include flight number, travel date, arrival airport, baggage tag, date damage was discovered, and claim deadline.
- **Missing-item checklist:** required item, reason, status, and how the user can provide it.
- **Action proposal:** type, exact payload preview, destination, attachment list, rationale, risks, creation time, and immutable payload hash.
- **Approval:** proposal ID and hash, approver user ID, approved or rejected status, timestamp, and expiry.
- **Execution:** provider action ID, result, timestamps, retry/idempotency key, error details, and audit events.

For the damaged-baggage example, a policy deadline must cite an Octen-derived official source, while the user's arrival date must cite the relevant Composio-retrieved itinerary. The calculated due date must retain both inputs and the calculation rule. Conflicting dates or weak evidence are shown to the user and are never silently resolved.

Raw email and attachment content should be processed transiently where possible. Persist only the minimum normalized facts, provider references, excerpts needed for provenance, and files the user deliberately adds to the case. Do not extract or retain full payment card numbers, passwords, authentication codes, or unrelated inbox content.

## 7. Approval and security requirements

- Explicit user approval is required before sending an email, uploading a file, submitting a form, starting or transferring a call, creating a provider-visible post/message, making a purchase, or performing any other external side effect.
- Draft creation may occur without send approval only when it remains a private draft. The UI must make “save draft” and “send” distinct.
- Approval is action-specific, time-bounded, and bound to an immutable preview hash. Any change to recipients, content, form fields, files, destination, or action type invalidates it.
- No bundled or standing approval for a sequence of future actions in the MVP. Monitoring may continue, but each follow-up send, upload, or call needs a new approval.
- Show the user exactly what will happen, through which connected account, and which data/files will leave the system.
- Enforce least-privilege Composio scopes, per-user account isolation, server-side secret storage, webhook signature verification, encryption in transit and at rest, audit logs, and revocation/deletion controls.
- Never put private user data into Octen queries, URLs, logs, or extracted-source requests. A sanitizer and allowlist must run before every Octen call; rejected fields should fail closed and be observable in internal security logs without copying the sensitive value.
- Treat email, attachments, and web pages as untrusted content. Prompt-injection text cannot alter approval policy, tool permissions, system instructions, recipients, or destinations.
- Validate all structured LLM outputs against schemas and business rules. The action executor accepts only approved, typed proposals—not arbitrary model-generated tool calls.
- Do not expose hidden chain-of-thought. Replace the current “Agent Reasoning” display with a concise activity and evidence log containing user-safe facts, sources, decisions, and errors.
- Support case deletion, connected-account disconnection, and retention limits. Avoid call recording by default; obtain clear consent and apply jurisdictional rules if recording is ever added.

## 8. Required repository changes

This section defines future work only; no code is implemented by this PRD.

- Rename all user-facing BlackBox branding and metadata to **karen**, including `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/session/[id]/page.tsx`, and the Phone UI fallback label.
- Add a README describing karen, local setup, environment variables, security boundary, and demo/production behavior; none exists today.
- Replace keyword-based demo routing and `useSessionMock` hard-coded inbox facts with a real case API and Composio-backed retrieval. Keep fixtures only for automated tests or a clearly labeled offline demo.
- Evolve `src/types/index.ts` from `GraphData` and the flight-specific `BriefingCard` into versioned case, evidence, research-source, deadline, checklist, proposal, approval, execution, and SSE-event types.
- Replace the graph panel's Neo4j semantics with a source/evidence timeline, checklist, or relationally derived provenance view. The existing canvas component may be adapted if it still communicates provenance clearly.
- Keep and generalize the home intake, three-panel layout, briefing surface, phone status UI, SSE client pattern, connection/error states, and prerecorded Asiana IVR asset where useful.
- Replace “Agent Reasoning” with an activity/evidence log and add source links, confidence/conflict states, connection state, missing-document prompts, and approval/rejection controls.
- Implement the application API, state machine, Composio adapter/webhook handler, Octen adapter/sanitizer, structured-output schemas, approval gate, idempotent executor, and optional relational migrations.
- Add server-only configuration for Composio, Octen, the LLM provider, database, and object storage. Never expose provider API keys through `NEXT_PUBLIC_*`.
- Add contract tests for Composio and Octen adapters, schema validation tests, sanitizer leakage tests, webhook verification/deduplication tests, approval hash tests, and an end-to-end damaged-baggage flow.
- Remove RocketRide, Neo4j, and Butterbase code, configuration, environment variables, migrations, documentation, and dependencies if they exist on untracked branches or are later introduced. None is installed in the current `package.json`.

## 9. MVP scope

The MVP supports one primary workflow: an English-language airline damaged-baggage claim, demonstrated with Asiana and structured so another airline can be added by configuration and live research.

Included:

- One connected email account per user through Composio.
- Real retrieval of relevant email threads and attachments.
- Octen research of official policy, claim deadline, required documents, form, support contact, and first escalation path.
- Structured case file with provenance, confidence, conflicts, missing items, and calculated deadline.
- User-uploaded damage photos/documents.
- Claim email draft or provider draft, reminder proposal, and approval-gated send/upload when supported.
- Reply monitoring through Composio and an approval-gated follow-up draft.
- REST plus SSE progress updates.
- Adapted evidence, briefing, activity, and approval UI.
- Existing prerecorded IVR demo as an explicitly labeled demo path; starting any real call is outside the MVP unless a supported adapter and approval gate are present.

Excluded:

- Autonomous sending, uploads, form submission, or calls.
- Broad inbox ingestion or long-term storage of a mailbox.
- Production voice impersonation, unsupervised IVR navigation, or call recording.
- General support for every airline, jurisdiction, or customer-service category.
- Automatic legal conclusions, guaranteed claim outcomes, payments, or purchases.
- RocketRide, Neo4j, Butterbase, and graph-database infrastructure.

## 10. Acceptance criteria

1. Given the damaged-baggage prompt and a connected email account, karen retrieves the relevant real thread and attachment metadata through Composio; production UI does not use seeded inbox facts.
2. Retrieval is scoped to the authenticated app user and does not expose another user's connected account or evidence.
3. Octen returns current public sources for the airline's official damaged-baggage policy, deadline, required documents, form/contact, and escalation path; each displayed finding links to supporting source evidence and retrieval time.
4. Automated tests demonstrate that names, email addresses, message bodies, booking references, baggage tags, attachment content, and other private identifiers are removed or rejected before Octen requests.
5. The assembled case distinguishes user statements, private account evidence, public policy evidence, derived calculations, and uncertain or conflicting fields.
6. The claim deadline is calculated from sourced policy and sourced travel/event dates, with inputs visible to the user.
7. karen identifies missing required documents and does not claim the packet is complete while required evidence is absent.
8. The user can preview a proposed email/upload/reminder/call action, including account, destination, content, and files, then approve or reject it.
9. No email is sent, file uploaded, form submitted, reminder created, or call started without a valid approval tied to the unchanged action payload. Modified or expired proposals require new approval.
10. Executed actions are idempotent and record provider result IDs and audit events; failures are visible and do not falsely appear successful.
11. A relevant reply is detected through Composio, deduplicated, attached to the correct case, and surfaced without automatically sending a response.
12. The REST/SSE experience reports meaningful typed progress and reconnects safely; no hidden chain-of-thought is shown.
13. The existing useful UI and Asiana IVR demo remain usable or have documented replacements, and all visible product branding says **karen**.
14. Runtime dependencies, configuration, and architecture contain no RocketRide, Neo4j, or Butterbase.

## 11. Migration plan for removing RocketRide, Neo4j, and Butterbase

1. **Inventory and freeze.** Search all branches, deployment configuration, secrets, hosted services, and CI—not just the current frontend—for RocketRide, Neo4j, and Butterbase usage. Freeze new work on those integrations and document any data that actually exists. In the current checkout, only proposed Butterbase/Neo4j documentation and graph-shaped UI types are present; RocketRide is not present.
2. **Define replacement contracts.** Finalize versioned schemas for `CaseFile`, evidence, research, proposals, approvals, executions, and SSE events. Add adapters so UI and orchestration depend on these contracts rather than vendor-specific objects.
3. **Stand up the simple path.** Add application-owned orchestration, Composio, Octen, the chosen LLM structured-output adapter, and—only if persistence is required—standard relational tables and object storage.
4. **Replace private-data ingestion.** Route email connection, search, retrieval, attachments, drafts, triggers, and approved actions through Composio. Delete production mock-inbox routing; retain sanitized fixtures only in tests/offline demo mode.
5. **Replace research/RAG.** Route current policy and contact research through sanitized Octen search/extraction. Store source records and short evidence excerpts in the case rather than a Butterbase RAG corpus.
6. **Replace graph persistence.** Map any existing graph entities into relational case fields and evidence rows. Generate optional provenance nodes/edges at read time for the current visualization; remove Cypher, Neo4j drivers, schemas, credentials, and hosted instances after verification.
7. **Replace runtime/storage.** Move session state, logs, briefings, and artifact references from Butterbase-specific interfaces to application services, Postgres, and standard object storage. Remove Butterbase SDKs, endpoints, buckets, secrets, and documentation after data export and retention checks.
8. **Remove RocketRide.** Replace any out-of-repository RocketRide orchestration with the same application state machine and typed adapters. Export needed audit/state data, then remove SDKs, webhooks, secrets, jobs, and service configuration.
9. **Cut over safely.** Run the damaged-baggage flow in shadow/test mode, compare evidence and action previews, then switch reads before writes. Keep external writes disabled until approval, idempotency, and audit tests pass.
10. **Decommission and verify.** Revoke credentials, stop billing resources, delete vendor data according to retention requirements, update architecture and onboarding docs, and run repository/CI/secret scans proving no runtime references remain. Preserve migration exports only for the required retention period.

## Product reference notes

- Composio connected accounts are per-user authenticated connections; its Connect Link flow keeps provider credentials out of the application, and its triggers can deliver incoming-email events to an application webhook.
- Octen provides live web search and URL extraction suitable for retrieving and citing current public policy sources.
