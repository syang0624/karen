"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCase } from "@/hooks/useCase";
import type {
  ActionProposal,
  CaseDeadline,
  CaseFile,
  CaseStatus,
  Confidence,
} from "@/types";

const STATUS_LABELS: Record<CaseStatus, string> = {
  intake: "Intake",
  needs_connection: "Connection needed",
  retrieving_evidence: "Retrieving evidence",
  researching: "Researching policy",
  assembling: "Assembling case",
  needs_input: "Needs your input",
  awaiting_approval: "Ready for review",
  executing: "Executing approved action",
  monitoring: "Monitoring",
  resolved: "Resolved",
  failed: "Needs attention",
};

const PROGRESS: CaseStatus[] = [
  "intake",
  "retrieving_evidence",
  "researching",
  "assembling",
  "awaiting_approval",
  "monitoring",
];

export default function CaseWorkspace({ caseId }: { caseId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectionHandled = useRef(false);
  const {
    caseFile,
    loading,
    connected,
    error,
    actionPending,
    decide,
    retry,
    upload,
    connectEmail,
    startIvrDemo,
  } = useCase(caseId);

  useEffect(() => {
    if (
      searchParams.get("connected") === "1" &&
      caseFile?.status === "needs_connection" &&
      !connectionHandled.current
    ) {
      connectionHandled.current = true;
      void retry();
      router.replace(`/case/${caseId}`);
    }
  }, [caseFile?.status, caseId, retry, router, searchParams]);

  if (loading) return <LoadingCase />;
  if (!caseFile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f2ed] px-5">
        <div className="max-w-md rounded-2xl border border-[#d5dbd5] bg-white p-8 text-center">
          <p className="text-lg font-semibold">This case is unavailable.</p>
          <p className="mt-2 text-sm text-[#657168]">
            It may have been deleted, or it belongs to another browser user.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-xl bg-[#1f4f3a] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Start a new case
          </Link>
        </div>
      </main>
    );
  }

  const handleDelete = async () => {
    if (!window.confirm("Delete this case and its retained evidence metadata?")) return;
    const response = await fetch(`/api/cases/${caseId}`, { method: "DELETE" });
    if (response.ok) router.push("/");
  };

  return (
    <main className="min-h-screen bg-[#f4f2ed] text-[#1b2921]">
      <header className="sticky top-0 z-30 border-b border-[#d7ddd7] bg-[#f4f2ed]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/"
              className="brand-mark shrink-0 text-xl font-semibold tracking-[-0.04em]"
            >
              karen<span className="text-[#e75b37]">.</span>
            </Link>
            <span className="h-5 w-px bg-[#cbd2cc]" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{caseFile.company}</p>
              <p className="truncate font-mono text-[10px] text-[#7b857e]">
                CASE {caseFile.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {caseFile.mode === "offline_demo" && (
              <span className="rounded-full bg-[#fff0dc] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#985616]">
                Sample data
              </span>
            )}
            <span
              className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs sm:flex ${
                connected
                  ? "border-[#c7d7cb] bg-[#edf5ef] text-[#2f684c]"
                  : "border-[#ded6c7] bg-[#f8f1e4] text-[#82652e]"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connected ? "bg-[#2f8a5d]" : "bg-[#be8a2f]"
                }`}
              />
              {connected ? "Live updates" : "Reconnecting"}
            </span>
            <button
              onClick={() => void handleDelete()}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#78827b] hover:bg-red-50 hover:text-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6">
        <CaseProgress caseFile={caseFile} />

        {(error || caseFile.error) && (
          <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span>{error ?? caseFile.error}</span>
            {["failed", "needs_input"].includes(caseFile.status) && (
              <button
                onClick={() => void retry()}
                disabled={actionPending === "retry"}
                className="shrink-0 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {caseFile.status === "needs_connection" && (
          <ConnectionBanner
            caseFile={caseFile}
            pending={actionPending === "connect"}
            onConnect={() => void connectEmail()}
          />
        )}

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(260px,0.75fr)_minmax(460px,1.35fr)_minmax(320px,0.9fr)]">
          <div className="space-y-4">
            <CaseBrief caseFile={caseFile} />
            <EvidencePanel
              caseFile={caseFile}
              pending={actionPending === "upload"}
              onUpload={(file) => void upload(file)}
            />
          </div>

          <div className="space-y-4">
            <DeadlineCard deadline={caseFile.deadline} caseFile={caseFile} />
            <PolicyPanel caseFile={caseFile} />
            <PlanPanel caseFile={caseFile} />
          </div>

          <div className="space-y-4">
            <Checklist caseFile={caseFile} />
            <ApprovalPanel
              caseFile={caseFile}
              pending={actionPending}
              onDecision={(proposal, decision) =>
                void decide(proposal.id, proposal.payloadHash, decision)
              }
            />
            {caseFile.ivrDemo.available && (
              <IvrDemo
                started={caseFile.ivrDemo.started}
                pending={actionPending === "ivr"}
                onStart={startIvrDemo}
              />
            )}
          </div>
        </div>

        <div className="mt-4">
          <ActivityLog caseFile={caseFile} />
        </div>
      </div>
    </main>
  );
}

function LoadingCase() {
  return (
    <main className="min-h-screen bg-[#f4f2ed] px-5 py-6">
      <div className="mx-auto max-w-[1600px] animate-pulse">
        <div className="h-10 w-48 rounded-xl bg-[#dfe3de]" />
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-80 rounded-2xl bg-white" />
          ))}
        </div>
      </div>
    </main>
  );
}

function Panel({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-[#d7ddd7] bg-white shadow-[0_8px_30px_rgba(38,53,45,0.04)] ${className}`}
    >
      <div className="border-b border-[#e5e8e4] px-4 py-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7b857e]">
          {label}
        </p>
      </div>
      {children}
    </section>
  );
}

function CaseProgress({ caseFile }: { caseFile: CaseFile }) {
  const normalizedStatus =
    caseFile.status === "needs_connection"
      ? "intake"
      : caseFile.status === "needs_input"
        ? "assembling"
        : caseFile.status === "executing"
          ? "awaiting_approval"
          : caseFile.status === "resolved"
            ? "monitoring"
            : caseFile.status;
  const activeIndex = Math.max(PROGRESS.indexOf(normalizedStatus), 0);
  return (
    <div className="rounded-2xl border border-[#d7ddd7] bg-white px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">{STATUS_LABELS[caseFile.status]}</p>
          <p className="mt-0.5 text-xs text-[#758078]">
            {caseFile.mode === "offline_demo"
              ? "Sanitized fixture workflow"
              : "Authenticated production workflow"}
          </p>
        </div>
        <p className="hidden max-w-lg truncate text-right text-xs text-[#758078] sm:block">
          {caseFile.userStatement}
        </p>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {PROGRESS.map((status, index) => (
          <div key={status}>
            <div
              className={`h-1.5 rounded-full ${
                index <= activeIndex ? "bg-[#2c7251]" : "bg-[#e2e6e2]"
              }`}
            />
            <p
              className={`mt-1.5 hidden text-[9px] font-medium uppercase tracking-wide md:block ${
                index === activeIndex ? "text-[#275f46]" : "text-[#9ba29d]"
              }`}
            >
              {STATUS_LABELS[status]}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectionBanner({
  caseFile,
  pending,
  onConnect,
}: {
  caseFile: CaseFile;
  pending: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col justify-between gap-4 rounded-2xl border border-[#c8d7cc] bg-[#edf5ef] px-5 py-4 sm:flex-row sm:items-center">
      <div>
        <p className="font-semibold text-[#214d38]">
          Connect one Gmail account to retrieve the evidence.
        </p>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[#52705f]">
          Composio handles authorization and keeps provider credentials outside
          karen. The connection is scoped to this stable app user, and the mailbox
          search is narrow and case-specific.
        </p>
      </div>
      <button
        onClick={onConnect}
        disabled={pending || caseFile.connection.status === "connecting"}
        className="shrink-0 rounded-xl bg-[#1f513b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Opening connection…" : "Connect Gmail"}
      </button>
    </div>
  );
}

function CaseBrief({ caseFile }: { caseFile: CaseFile }) {
  return (
    <Panel label="Case briefing">
      <div className="p-4">
        <h1 className="text-xl font-semibold tracking-[-0.025em]">
          {caseFile.company} damaged baggage
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#5f6c63]">{caseFile.summary}</p>
        <div className="mt-4 space-y-2.5">
          {caseFile.fields.map((field) => (
            <div
              key={field.key}
              className="flex items-start justify-between gap-4 border-t border-[#edf0ed] pt-2.5"
            >
              <span className="text-xs text-[#778179]">{field.label}</span>
              <div className="text-right">
                <p className="text-sm font-medium">{field.value ?? "Not confirmed"}</p>
                <div className="mt-1 flex items-center justify-end gap-1.5">
                  <ConfidencePill confidence={field.confidence} />
                  {field.conflict !== "none" && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-semibold uppercase text-red-700">
                      {field.conflict} conflict
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function ConfidencePill({ confidence }: { confidence: Confidence }) {
  const styles = {
    high: "bg-[#eaf4ed] text-[#2f6b4d]",
    medium: "bg-[#fff3dd] text-[#876321]",
    low: "bg-[#f1f1ef] text-[#747a75]",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${styles[confidence]}`}
    >
      {confidence}
    </span>
  );
}

function EvidencePanel({
  caseFile,
  pending,
  onUpload,
}: {
  caseFile: CaseFile;
  pending: boolean;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Panel label={`Evidence · ${caseFile.evidence.length}`}>
      <div className="max-h-[480px] overflow-y-auto p-4">
        {caseFile.evidence.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#879088]">
            Evidence will appear after connection and retrieval.
          </p>
        ) : (
          <div className="relative space-y-4 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-[#d9dfda]">
            {caseFile.evidence.map((item) => (
              <div key={item.id} className="relative pl-6">
                <span
                  className={`absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-4 border-white ${
                    item.sourceKind === "user_statement"
                      ? "bg-[#d07845]"
                      : item.sourceKind === "user_upload"
                        ? "bg-[#6b6fa6]"
                        : "bg-[#397358]"
                  }`}
                />
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-5">{item.label}</p>
                  <span className="shrink-0 font-mono text-[9px] uppercase text-[#8a938c]">
                    {item.sourceKind.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#67736b]">{item.value}</p>
                <p className="mt-1 text-[10px] leading-4 text-[#939b95]">
                  {item.locator}
                </p>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="mt-4 w-full rounded-xl border border-dashed border-[#bdc9c0] px-3 py-2.5 text-xs font-semibold text-[#476050] hover:bg-[#f5f8f5] disabled:opacity-50"
        >
          {pending ? "Adding document…" : "+ Add evidence"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
            event.target.value = "";
          }}
        />
      </div>
    </Panel>
  );
}

function DeadlineCard({
  deadline,
  caseFile,
}: {
  deadline: CaseDeadline | null;
  caseFile: CaseFile;
}) {
  const due = deadline?.dueAt ? new Date(deadline.dueAt) : null;
  const tone =
    deadline?.status === "past_due"
      ? "border-red-200 bg-red-50"
      : deadline?.status === "due_soon"
        ? "border-[#efd5a6] bg-[#fff6e5]"
        : "border-[#bfd5c5] bg-[#eef6f0]";
  return (
    <section className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6e7a72]">
            Claim deadline
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
            {due
              ? due.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                })
              : "Not confirmed"}
          </p>
        </div>
        <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase text-[#526158]">
          {deadline?.status.replace("_", " ") ?? "pending"}
        </span>
      </div>
      {deadline && (
        <div className="mt-3 border-t border-black/5 pt-3 text-xs leading-5 text-[#5a685f]">
          <p>{deadline.rule}</p>
          <p className="mt-1">
            Inputs: bag received {deadline.eventDate ?? "unknown"} ·{" "}
            {deadline.policySourceIds.length} policy source
            {deadline.policySourceIds.length === 1 ? "" : "s"} ·{" "}
            {deadline.eventEvidenceIds.length} private evidence item
          </p>
        </div>
      )}
      {caseFile.mode === "offline_demo" && (
        <p className="mt-2 text-[10px] text-[#7b857e]">
          Sample-data estimate; verify live policy before acting.
        </p>
      )}
    </section>
  );
}

function PolicyPanel({ caseFile }: { caseFile: CaseFile }) {
  return (
    <Panel label={`Policy & sources · ${caseFile.researchSources.length}`}>
      <div className="p-4">
        {caseFile.policyFindings.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#879088]">
            Current policy findings will appear here.
          </p>
        ) : (
          <div className="space-y-3">
            {caseFile.policyFindings.map((finding) => (
              <div
                key={finding.id}
                className="rounded-xl border border-[#e1e6e2] bg-[#fafbf9] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[#5b7464]">
                    {finding.kind.replace("_", " ")}
                  </span>
                  <ConfidencePill confidence={finding.confidence} />
                </div>
                <p className="mt-2 text-sm leading-6">{finding.statement}</p>
                <p className="mt-1 text-xs text-[#7b857e]">
                  Applies to: {finding.applicability}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {finding.sourceIds.map((sourceId) => {
                    const source = caseFile.researchSources.find(
                      (item) => item.id === sourceId
                    );
                    return source ? (
                      <a
                        key={sourceId}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        title={source.excerpt}
                        className="rounded-full border border-[#ccd8cf] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#37634a] hover:border-[#6f9980]"
                      >
                        ↗ {source.publisher}
                      </a>
                    ) : null;
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {caseFile.researchSources.length > 0 && (
          <details className="mt-3 rounded-xl border border-[#e1e6e2]">
            <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-[#536158]">
              Inspect source excerpts
            </summary>
            <div className="space-y-3 border-t border-[#e1e6e2] p-3">
              {caseFile.researchSources.map((source) => (
                <div key={source.id}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-[#2f674a] underline decoration-[#a6bbaa] underline-offset-2"
                  >
                    {source.title}
                  </a>
                  <p className="mt-1 text-xs leading-5 text-[#68756c]">
                    {source.excerpt}
                  </p>
                  <p className="mt-1 font-mono text-[9px] text-[#989f9a]">
                    Retrieved {new Date(source.retrievedAt).toLocaleString("en-US")}
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </Panel>
  );
}

function PlanPanel({ caseFile }: { caseFile: CaseFile }) {
  return (
    <Panel label="Recommended plan">
      <ol className="space-y-3 p-4">
        {caseFile.plan.length === 0 ? (
          <li className="py-3 text-center text-sm text-[#879088]">
            The plan is being assembled.
          </li>
        ) : (
          caseFile.plan.map((step, index) => (
            <li key={step} className="flex gap-3 text-sm leading-6">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#edf3ee] font-mono text-[10px] font-semibold text-[#386149]">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))
        )}
      </ol>
    </Panel>
  );
}

function Checklist({ caseFile }: { caseFile: CaseFile }) {
  const complete = caseFile.checklist.filter(
    (item) => item.status !== "missing"
  ).length;
  return (
    <Panel label={`Claim packet · ${complete}/${caseFile.checklist.length}`}>
      <div className="divide-y divide-[#e9ece9] px-4">
        {caseFile.checklist.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#879088]">
            Requirements are being checked.
          </p>
        ) : (
          caseFile.checklist.map((item) => (
            <div key={item.id} className="flex gap-3 py-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  item.status === "provided"
                    ? "bg-[#2e7954] text-white"
                    : "border border-[#d2a65f] bg-[#fff5df] text-[#9a6818]"
                }`}
              >
                {item.status === "provided" ? "✓" : "!"}
              </span>
              <div>
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-[#707b73]">
                  {item.status === "missing" ? item.guidance : item.reason}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function ApprovalPanel({
  caseFile,
  pending,
  onDecision,
}: {
  caseFile: CaseFile;
  pending: string | null;
  onDecision: (proposal: ActionProposal, decision: "approved" | "rejected") => void;
}) {
  const proposal = [...caseFile.proposals].reverse().find((item) =>
    ["pending", "approved", "executed", "failed"].includes(item.status)
  );
  if (!proposal) {
    return (
      <Panel label="Action approval">
        <div className="p-5 text-center">
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-[#f0f2ef] text-[#6d786f]">
            ⏳
          </div>
          <p className="mt-3 text-sm font-semibold">No action proposed yet</p>
          <p className="mt-1 text-xs leading-5 text-[#7b857e]">
            karen will show the exact account, destination, content, and files
            before asking.
          </p>
        </div>
      </Panel>
    );
  }
  const execution = caseFile.executions.find(
    (item) => item.proposalId === proposal.id
  );
  const busy = pending === `proposal:${proposal.id}`;
  const simulated = caseFile.mode === "offline_demo";
  return (
    <Panel label="Action approval" className="overflow-hidden">
      <div className="bg-[#233f32] px-4 py-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              {proposal.type === "draft_save"
                ? "Save private Gmail draft"
                : simulated
                  ? "Simulate claim email"
                  : "Send claim email"}
            </p>
            <p className="mt-1 text-xs leading-5 text-white/65">
              {proposal.rationale}
            </p>
          </div>
          <span className="rounded-full bg-white/10 px-2 py-1 font-mono text-[9px] uppercase">
            {proposal.status}
          </span>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <PreviewRow
          label="Through"
          value={caseFile.connection.label ?? proposal.payload.accountId}
        />
        <PreviewRow label="Destination" value={proposal.payload.destination} />
        <PreviewRow label="To" value={proposal.payload.to?.join(", ") ?? "—"} />
        <PreviewRow label="Subject" value={proposal.payload.subject ?? "—"} />
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#8b948d]">
            Exact content
          </p>
          <pre className="mt-1 max-h-44 whitespace-pre-wrap overflow-y-auto rounded-xl bg-[#f4f5f2] p-3 font-sans text-xs leading-5 text-[#3e4b43]">
            {proposal.payload.body}
          </pre>
        </div>
        <PreviewRow
          label="Files leaving karen"
          value={
            proposal.payload.attachments?.length
              ? proposal.payload.attachments.join(", ")
              : "None"
          }
        />
        <p className="rounded-lg bg-[#fff5e5] px-3 py-2 text-[11px] leading-5 text-[#765722]">
          {proposal.risks.join(" ")}
        </p>
        <p className="font-mono text-[9px] text-[#949b96]">
          Preview hash {proposal.payloadHash.slice(0, 16)}… · expires{" "}
          {new Date(proposal.expiresAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>

        {proposal.status === "pending" && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onDecision(proposal, "rejected")}
              disabled={busy}
              className="rounded-xl border border-[#ccd3cd] px-3 py-2.5 text-xs font-semibold text-[#58655d] hover:bg-[#f5f6f4] disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={() => onDecision(proposal, "approved")}
              disabled={busy}
              className="rounded-xl bg-[#1f513b] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#183f2f] disabled:opacity-50"
            >
              {busy
                ? "Processing…"
                : simulated
                  ? "Approve simulation"
                  : proposal.type === "draft_save"
                    ? "Approve saving draft"
                    : "Approve send"}
            </button>
          </div>
        )}
        {execution && (
          <div
            className={`rounded-xl px-3 py-2.5 text-xs leading-5 ${
              execution.status === "succeeded"
                ? "bg-[#eaf4ed] text-[#2f664a]"
                : "bg-red-50 text-red-700"
            }`}
          >
            {execution.demo ? "Simulated result" : "Provider result"}:{" "}
            {execution.providerActionId ?? execution.status}
            {execution.error ? ` · ${execution.error}` : ""}
          </div>
        )}
      </div>
    </Panel>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-[#8b948d]">
        {label}
      </span>
      <span className="text-right text-xs font-medium leading-5 text-[#425047]">
        {value}
      </span>
    </div>
  );
}

function IvrDemo({
  started,
  pending,
  onStart,
}: {
  started: boolean;
  pending: boolean;
  onStart: () => Promise<unknown>;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const handleStart = async () => {
    await onStart();
    await audioRef.current?.play();
    setPlaying(true);
  };
  return (
    <Panel label="IVR walkthrough">
      <div className="p-4">
        <div className="rounded-xl bg-[#f4f0eb] p-3">
          <p className="text-sm font-semibold">Asiana phone-tree walkthrough</p>
          <p className="mt-1 text-xs leading-5 text-[#766b61]">
            Explore the Asiana phone tree without dialing, transferring,
            recording, or contacting the airline.
          </p>
        </div>
        <audio
          ref={audioRef}
          src="/asiana_phone_call.m4a"
          preload="metadata"
          onEnded={() => setPlaying(false)}
          className="mt-3 w-full"
          controls={started}
        />
        {!started && (
          <button
            onClick={() => void handleStart()}
            disabled={pending}
            className="mt-3 w-full rounded-xl border border-[#d3c8bc] px-3 py-2.5 text-xs font-semibold text-[#68594b] hover:bg-[#f8f4ef] disabled:opacity-50"
          >
            {pending ? "Starting…" : "Start IVR walkthrough"}
          </button>
        )}
        {playing && (
          <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.12em] text-[#8d6b47]">
            Local audio playing
          </p>
        )}
      </div>
    </Panel>
  );
}

function ActivityLog({ caseFile }: { caseFile: CaseFile }) {
  const activities = useMemo(
    () =>
      [...caseFile.activities].sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp)
      ),
    [caseFile.activities]
  );
  return (
    <Panel label="Activity & evidence log">
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2 p-3">
          {activities.map((entry) => (
            <div
              key={entry.id}
              className="w-64 rounded-xl border border-[#e1e5e1] bg-[#fafbf9] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] font-semibold uppercase text-[#52705f]">
                  {entry.type}
                </span>
                <span className="font-mono text-[9px] text-[#979e99]">
                  {new Date(entry.timestamp).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold">{entry.title}</p>
              <p className="mt-1 text-[11px] leading-5 text-[#707b73]">
                {entry.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
