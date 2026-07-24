"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CaseFile } from "@/types";

const EXAMPLE = "Asiana broke my suitcase on my recent flight.";

export default function Home() {
  const router = useRouter();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState<"production" | "offline_demo" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const createCase = async (mode: "production" | "offline_demo") => {
    if (description.trim().length < 10 || pending) return;
    setPending(mode);
    setError(null);
    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: description.trim(), mode }),
      });
      const body = (await response.json()) as {
        case?: CaseFile;
        error?: string;
      };
      if (!response.ok || !body.case) {
        throw new Error(body.error ?? "Unable to create the case");
      }
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        await fetch(`/api/cases/${body.case.id}/evidence`, {
          method: "POST",
          body: form,
        });
      }
      router.push(
        mode === "offline_demo"
          ? `/session/${body.case.id}?demo=1`
          : `/case/${body.case.id}`
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create the case");
      setPending(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f2ed] text-[#18221d]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
        <Link href="/" className="brand-mark text-2xl font-semibold tracking-[-0.04em]">
          karen<span className="text-[#e75b37]">.</span>
        </Link>
        <div className="flex items-center gap-2 text-xs font-medium text-[#526158]">
          <span className="h-2 w-2 rounded-full bg-[#2e7d59]" />
          Evidence first. You approve every action.
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-16 pt-12 md:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:pt-20">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#cad4cb] bg-white/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#476253]">
            Customer service, with receipts
          </div>
          <h1 className="max-w-xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl xl:text-7xl">
            Turn a messy complaint into a case you can prove.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[#5c685f]">
            karen finds the relevant account evidence, checks current official
            policy, tracks the deadline, and prepares the next move. Nothing
            leaves your account until you approve that exact action.
          </p>

          <div className="mt-9 grid max-w-xl grid-cols-3 gap-3">
            {[
              ["01", "Private evidence"],
              ["02", "Official sources"],
              ["03", "Bounded approval"],
            ].map(([number, label]) => (
              <div
                key={number}
                className="border-l border-[#bec9c0] pl-3 text-sm text-[#526158]"
              >
                <span className="mb-1 block font-mono text-[10px] text-[#e75b37]">
                  {number}
                </span>
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="case-intake-card rounded-[28px] border border-[#cdd5ce] bg-white p-5 shadow-[0_28px_80px_rgba(30,50,40,0.12)] sm:p-7">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#768078]">
                New case
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em]">
                What happened?
              </h2>
            </div>
            <div className="rounded-full bg-[#edf4ef] px-3 py-1.5 text-xs font-medium text-[#2e694e]">
              Private by default
            </div>
          </div>

          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe the problem in your own words…"
            rows={6}
            className="w-full resize-none rounded-2xl border border-[#d6ddd7] bg-[#fafaf8] px-4 py-4 text-base leading-7 outline-none transition focus:border-[#3b7258] focus:ring-4 focus:ring-[#3b7258]/10"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDescription(EXAMPLE)}
              className="rounded-full bg-[#f3eee7] px-3 py-2 text-xs font-medium text-[#66584c] transition hover:bg-[#ece4da]"
            >
              Use Asiana example
            </button>
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              className="rounded-full border border-[#d4dbd5] px-3 py-2 text-xs font-medium text-[#526158] transition hover:bg-[#f5f7f4]"
            >
              + Add photos or documents
            </button>
            <input
              ref={uploadRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              onChange={(event) =>
                setFiles(Array.from(event.target.files ?? []).slice(0, 6))
              }
            />
          </div>

          {files.length > 0 && (
            <div className="mt-3 rounded-xl bg-[#f5f7f4] px-3 py-2 text-xs text-[#526158]">
              {files.map((file) => file.name).join(" · ")}
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
            <button
              type="button"
              disabled={description.trim().length < 10 || pending !== null}
              onClick={() => void createCase("production")}
              className="rounded-xl bg-[#1f4f3a] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#173d2d] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending === "production" ? "Creating case…" : "Start with my connected email"}
            </button>
            <button
              type="button"
              disabled={description.trim().length < 10 || pending !== null}
              onClick={() => void createCase("offline_demo")}
              className="rounded-xl border border-[#cbd4cc] px-4 py-3.5 text-sm font-semibold text-[#405247] transition hover:bg-[#f5f7f4] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending === "offline_demo" ? "Loading…" : "Try karen"}
            </button>
          </div>

          <p className="mt-4 text-xs leading-5 text-[#7b847d]">
            Try karen with sanitized sample data—nothing connects, sends,
            uploads, or calls. Starting with your email asks you to connect one
            account through Composio.
          </p>
        </div>
      </section>

      <section className="border-t border-[#d8ddd8] bg-[#eceae4]">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 text-sm text-[#59665e] md:grid-cols-3 md:px-8">
          <p>
            <span className="font-semibold text-[#26352d]">Private lane:</span>{" "}
            account facts remain inside the case boundary.
          </p>
          <p>
            <span className="font-semibold text-[#26352d]">Public lane:</span>{" "}
            Octen receives only allowlisted, non-identifying descriptors.
          </p>
          <p>
            <span className="font-semibold text-[#26352d]">Action lane:</span>{" "}
            changed or expired previews require fresh approval.
          </p>
        </div>
      </section>

    </main>
  );
}
