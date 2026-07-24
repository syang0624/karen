# karen

**Evidence-backed customer-service resolution, from first complaint to final follow-up.**

karen turns a stressful customer-service problem into a sourced, reviewable case and a set of safe next actions. Describe what happened in plain language and karen gathers the relevant private evidence, researches the current official rules, identifies missing information, calculates deadlines, and prepares the communication needed to resolve the issue.

Every material fact remains connected to its source. Every external action remains under the user's control.

## What karen does

karen currently supports airline damaged-baggage claims. For example:

> Asiana broke my suitcase on my recent flight.

From that request, karen:

1. Connects to the user's email account through Composio.
2. Finds the relevant itinerary, booking reference, baggage information, attachments, and prior correspondence.
3. Uses Octen to retrieve the airline's current official claim policy, deadlines, required documents, forms, support contacts, and escalation path.
4. Assembles a versioned case file with source links, confidence levels, conflicts, and missing items.
5. Calculates the claim deadline from the sourced policy and the user's sourced travel dates.
6. Prepares a claim draft, attachment bundle, reminder, follow-up, or call plan.
7. Shows the exact action, destination, account, content, and files for review.
8. Executes only the specific action the user approves.
9. Monitors relevant replies and updates the case without sending an automatic response.

## Product principles

### Evidence before conclusions

User statements, private account data, public policy sources, and derived calculations are clearly distinguished. Conflicting or low-confidence facts are surfaced for review instead of being silently resolved.

### Private data stays private

Composio retrieves case-relevant private account data. Octen receives only sanitized public descriptors such as the airline, issue type, jurisdiction, and domestic or international classification. Names, email addresses, booking references, baggage tags, message bodies, and attachment contents are never included in public research queries.

### The user approves every external action

Sending an email, uploading a file, submitting a form, creating a reminder, or starting a call requires explicit approval. Approval is:

- bound to one immutable action payload;
- time-limited;
- invalidated by any change to the recipient, content, files, destination, or action type;
- recorded with the resulting provider response in the audit log.

Approving one action never approves a later follow-up.

## How it works

```text
Next.js web application
  ├─ case intake
  ├─ evidence and source review
  ├─ deadlines and missing-item checklist
  ├─ action previews and approvals
  └─ live progress over server-sent events
          │
Application API and orchestration
  ├─ deterministic case state machine
  ├─ Composio adapter
  │    ├─ connected accounts
  │    ├─ evidence retrieval
  │    ├─ reply monitoring
  │    └─ approved actions
  ├─ Octen adapter
  │    ├─ sanitized public research
  │    └─ source extraction
  ├─ schema-validated LLM adapter
  ├─ approval policy and idempotent executor
  └─ relational persistence and object storage
```

The application owns the workflow:

```text
intake
  → retrieving_evidence
  → researching
  → assembling
  → needs_input
  → awaiting_approval
  → executing
  → monitoring
  → resolved
```

Failures and retries are explicit states. Language models produce versioned, schema-validated data; they do not authorize side effects or call connected services directly.

## The case file

The canonical output is a versioned `CaseFile` containing:

- the issue, company, status, timestamps, summary, and user-stated facts;
- normalized private evidence with exact source locators and Composio provider references;
- public policy findings with official source URLs, excerpts, retrieval times, and applicability;
- case fields with provenance, confidence, and conflict state;
- derived deadlines with both sourced inputs and the calculation rule;
- a missing-document checklist;
- immutable action proposals and their payload hashes;
- approvals, executions, provider result IDs, and audit events.

Raw inbox and attachment content is processed transiently where possible. karen persists only the normalized facts, provider references, provenance excerpts, and user-selected files needed to handle the case.

## Connected services

### Composio

Composio provides per-user authenticated access to connected services. karen uses it to search narrowly scoped email data, retrieve relevant threads and attachments, create private drafts, execute approved actions, and detect replies or account events.

Provider credentials are not stored by the web application. Each connection is isolated by the application's stable user ID, and expired connections require reauthorization.

### Octen

Octen retrieves current public rules and escalation paths from official airline, airport, regulator, treaty, and government sources. Each finding includes the source URL, publisher, retrieval time, supporting passage, and source type.

A fail-closed sanitizer and allowlist run before every Octen request. Private case data is joined with public research only after the research response returns inside karen's application boundary.

## API

The web application communicates with the karen API over REST and server-sent events:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/cases` | Create a production or explicitly offline case |
| `GET` | `/api/cases/:id` | Retrieve the assembled case |
| `GET` | `/api/cases/:id/stream` | Stream replayable typed case events |
| `POST` | `/api/cases/:id/approvals` | Approve or reject one immutable action proposal |
| `POST` | `/api/cases/:id/evidence` | Fingerprint a bounded user-selected upload |
| `DELETE` | `/api/cases/:id` | Delete a case owned by the current app user |
| `POST` | `/api/connections/composio` | Create a scoped Gmail Connect Link |
| `POST` | `/api/webhooks/composio` | Verify and ingest deduplicated Composio events |

Composio events enter through a signature-verified webhook endpoint. Events are deduplicated before they can change case state.

## Local setup

### Requirements

- Node.js 20 or later
- npm
- Composio and Octen credentials for production mode
- No provider credentials for the sanitized offline demo

### Install and run

Install the dependencies, create `.env.local` as described below, and start the app:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

Copy `.env.example` to `.env.local`. The UI and API are same-origin, so no
browser-visible provider configuration is needed. Composio, Octen, LLM, and
webhook credentials are server-only and must never use the `NEXT_PUBLIC_`
prefix.

The API runtime is configured with:

```bash
COMPOSIO_API_KEY=
COMPOSIO_GMAIL_AUTH_CONFIG_ID=
COMPOSIO_WEBHOOK_SECRET=
OCTEN_API_KEY=
LLM_API_URL=
LLM_API_KEY=
LLM_MODEL=
KAREN_SESSION_SECRET=
KAREN_ENABLE_OFFLINE_DEMO=false
KAREN_CLAIMS_EMAIL=
```

Use the environment-specific secret manager for deployed instances. Do not commit populated environment files.

## Commands

```bash
npm run dev      # Start the development server
npm run build    # Create a production build
npm run start    # Run the production build
npm run lint     # Run ESLint
npm test         # Run security and contract tests
npm run build:next # Optional native Next.js compatibility build
```

## Demo and production behavior

The **offline demo** is selected explicitly. It uses sanitized evidence and
research fixtures, can play the existing prerecorded Asiana IVR asset, labels
every execution as simulated, and never calls Composio, Octen, an LLM, Gmail,
or a phone provider.

The **production path** never falls back to fixtures. It creates a per-user
Composio Connect Link, retrieves a narrow Gmail result set, sends only
constructively allowlisted public descriptors to Octen, and stops with a visible
error when required credentials or provider results are unavailable.

The checked-in store is process-local so the project runs without infrastructure.
Before a multi-instance production deployment, replace it with Postgres
transactions and durable event/job tables, and configure S3-compatible object
storage plus malware scanning for retained upload bytes. Until then, uploads
retain a metadata fingerprint only and cannot be attached to provider actions.

## Security model

- Connected accounts use least-privilege scopes and per-user isolation.
- Provider and model credentials remain server-side.
- Octen requests pass through a private-data sanitizer and public-field allowlist.
- Email, attachments, and web pages are treated as untrusted input.
- Prompt-injection content cannot change recipients, destinations, approval policy, or tool permissions.
- Structured model outputs are validated against versioned schemas and business rules.
- The action executor accepts only typed proposals with a valid approval for the unchanged payload hash.
- Executions are idempotent and retain provider result IDs, timestamps, and errors.
- Webhooks are signature-verified and deduplicated.
- Data is encrypted in transit and at rest, with case deletion, account disconnection, and retention controls.
- Full payment card numbers, passwords, authentication codes, and unrelated inbox content are neither extracted nor retained.
- Call recording is disabled by default.

## Supported workflow

karen handles English-language airline damaged-baggage claims, including:

- one connected email account per user;
- relevant thread and attachment retrieval;
- official policy, deadline, document, form, contact, and escalation research;
- a sourced case file with confidence and conflict states;
- damage-photo and document uploads;
- claim drafts, reminders, attachment bundles, and approved sends or uploads;
- reply monitoring and approval-gated follow-up;
- live REST and SSE progress updates;
- evidence, briefing, activity, and approval views.

karen does not autonomously send messages, upload files, submit forms, start calls, make purchases, provide legal conclusions, or guarantee claim outcomes.

## Technology

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Composio
- Octen
- A schema-validated LLM provider
- Relational persistence and standard object storage

karen does not rely on RocketRide, Neo4j, Butterbase, a graph database, or a proprietary agent runtime. Provenance relationships shown in the interface are derived from the case's relational and JSON evidence records.
