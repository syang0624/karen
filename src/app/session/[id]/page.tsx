"use client";

import {
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PhoneUI from "@/components/PhoneUI";
import GraphView from "@/components/GraphView";
import BriefingCard from "@/components/BriefingCard";
import ReasoningLog from "@/components/ReasoningLog";
import type {
  BriefingCard as BriefingCardType,
  GraphData,
  IvrDecision,
  ReasoningEntry,
  SessionStatus,
} from "@/types";

const NODES: GraphData["nodes"] = [
  { id: "p1", label: "Sample Traveler", type: "Person" },
  { id: "b1", label: "XKRF2M", type: "Booking" },
  { id: "f1", label: "OZ212 ICN→SFO", type: "Flight" },
  { id: "a1", label: "Asiana Airlines", type: "Airline" },
  { id: "l1", label: "Asiana Club #920384712", type: "LoyaltyAccount" },
  { id: "pm1", label: "Payment on file", type: "PaymentMethod" },
  { id: "ap1", label: "ICN", type: "Airport" },
  { id: "ap2", label: "SFO", type: "Airport" },
  { id: "att1", label: "Baggage Tag #0988-7234", type: "Attachment" },
];

const EDGES: GraphData["edges"] = [
  { id: "e1", source: "p1", target: "b1", type: "SUPPORTED_BY" },
  { id: "e2", source: "b1", target: "f1", type: "DOCUMENTS" },
  { id: "e3", source: "f1", target: "a1", type: "OPERATED_BY" },
  { id: "e4", source: "p1", target: "l1", type: "ACCOUNT_REF" },
  { id: "e5", source: "b1", target: "pm1", type: "PAYMENT_REF" },
  { id: "e6", source: "f1", target: "ap1", type: "DEPARTS" },
  { id: "e7", source: "f1", target: "ap2", type: "ARRIVES" },
  { id: "e8", source: "b1", target: "att1", type: "ATTACHMENT" },
];

const BRIEFING: BriefingCardType = {
  company: "Asiana Airlines",
  user_intent: "File a damaged-baggage claim",
  identity: {
    name: "Sample Traveler",
    loyalty_program: "Asiana Club",
    loyalty_number: "920384712",
  },
  booking: {
    pnr: "XKRF2M",
    flight_number: "OZ212",
    route: "ICN → SFO",
    date: "2026-07-20",
    status: "completed",
  },
  payment: {
    brand: "Payment method",
    last4: "sample",
  },
  context: {
    user_location: "San Francisco",
    urgency: "Written damage report due within 7 days of receiving the bag",
  },
  suggested_opening:
    "Hi, I flew on Asiana flight OZ212 from Seoul Incheon to San Francisco on July 20. My checked suitcase was damaged in transit. I have the baggage tag and photos ready, and I need to open a written damage claim.",
};

const IVR_STEPS: Array<IvrDecision & { at: number }> = [
  {
    at: 8,
    id: "ivr1",
    prompt_text: "For assistance in English, please press number 2.",
    decision: "Press 2",
    reasoning: "English-language sample path",
    timestamp: "",
  },
  {
    at: 24,
    id: "ivr2",
    prompt_text:
      "For arrival and departure information press 1; to speak to an agent press 5.",
    decision: "Press 5",
    reasoning: "Damaged baggage requires a representative",
    timestamp: "",
  },
  {
    at: 44,
    id: "ivr3",
    prompt_text: "For all other inquiries, press 6.",
    decision: "Press 6",
    reasoning: "The phone menu has no dedicated damage-claim option",
    timestamp: "",
  },
  {
    at: 64,
    id: "ivr4",
    prompt_text: "Enter the Asiana Club membership number followed by star.",
    decision: "Enter sample membership reference",
    reasoning: "Uses the sanitized offline fixture",
    timestamp: "",
  },
  {
    at: 95,
    id: "ivr5",
    prompt_text: "The estimated wait time is more than five minutes.",
    decision: "Hold",
    reasoning: "The walkthrough reached the agent queue",
    timestamp: "",
  },
];

function entry(
  id: string,
  message: string,
  type: ReasoningEntry["type"] = "info"
): ReasoningEntry {
  return {
    id,
    message,
    type,
    timestamp: new Date().toISOString(),
  };
}

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isExplicitDemo = searchParams.get("demo") === "1";
  const audioRef = useRef<HTMLAudioElement>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const [status, setStatus] = useState<SessionStatus>("extracting");
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [briefing, setBriefing] = useState<BriefingCardType | null>(null);
  const [ivrLog, setIvrLog] = useState<IvrDecision[]>([]);
  const [activities, setActivities] = useState<ReasoningEntry[]>([
    entry(
      "demo-notice",
      "Sample-data session started. All account facts are sanitized; no mailbox was accessed."
    ),
  ]);
  const [showDemoEndPopup, setShowDemoEndPopup] = useState(false);
  const [userInput, setUserInput] = useState(
    "Asiana broke my suitcase on my recent flight."
  );

  const startDemo = useCallback(async () => {
    if (!audioRef.current) return;
    setStatus("dialing");
    setActivities((previous) => [
      ...previous,
      entry(
        "audio-started",
        "Starting the Asiana IVR walkthrough. No external call was placed."
      ),
    ]);
    try {
      await audioRef.current.play();
    } catch {
      setStatus("idle");
    }
  }, []);

  useEffect(() => {
    if (!isExplicitDemo) {
      router.replace(`/case/${id}`);
      return;
    }
    void fetch(`/api/cases/${id}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { case?: { userStatement?: string } }) => {
        if (body.case?.userStatement) setUserInput(body.case.userStatement);
      })
      .catch(() => {
        // The legacy demo can still run from its local sanitized fixture.
      });

    NODES.forEach((node, index) => {
      const timer = setTimeout(() => {
        setGraph((previous) => {
          const nodes = [...previous.nodes, node];
          const ids = new Set(nodes.map((item) => item.id));
          return {
            nodes,
            edges: EDGES.filter(
              (edge) => ids.has(edge.source) && ids.has(edge.target)
            ),
          };
        });
        setActivities((previous) => [
          ...previous,
          entry(
            `evidence-${node.id}`,
            `Evidence ready: ${node.label} (${node.type}).`,
            "extraction"
          ),
        ]);
        if (index === NODES.length - 1) {
          setBriefing(BRIEFING);
          setStatus("idle");
          setActivities((previous) => [
            ...previous,
            entry(
              "briefing-ready",
              "Briefing assembled from the sanitized evidence fixture."
            ),
          ]);
          void startDemo();
        }
      }, 250 + index * 220);
      timersRef.current.push(timer);
    });

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [id, isExplicitDemo, router, startDemo]);

  const handleTimeUpdate = useCallback(() => {
    const currentTime = audioRef.current?.currentTime ?? 0;
    if (currentTime >= 4 && currentTime < 95) setStatus("navigating");
    if (currentTime >= 95) setStatus("on_hold");
    for (const step of IVR_STEPS) {
      if (currentTime < step.at) continue;
      setIvrLog((previous) => {
        if (previous.some((item) => item.id === step.id)) return previous;
        const next = { ...step, timestamp: new Date().toISOString() };
        setActivities((current) => [
          ...current,
          entry(
            `activity-${step.id}`,
            `IVR: ${step.decision}. ${step.reasoning}`,
            "decision"
          ),
        ]);
        return [...previous, next];
      });
    }
  }, []);

  const handleHangUp = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    router.push("/");
  }, [router]);

  if (!isExplicitDemo) return null;

  return (
    <div className="flex h-screen flex-col bg-black">
      <audio
        ref={audioRef}
        src="/asiana_phone_call.m4a"
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => {
          setStatus("handoff");
          setActivities((previous) => [
            ...previous,
            entry(
              "handoff",
              "IVR walkthrough complete. The briefing is ready for the user."
            ),
          ]);
          setShowDemoEndPopup(true);
        }}
      />

      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="shrink-0 text-lg font-bold text-zinc-100">
            karen<span className="text-emerald-400">.</span>
          </Link>
          <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
            Sample Mode
          </span>
          <span className="text-zinc-700">|</span>
          <span className="max-w-md truncate text-sm text-zinc-400">
            {userInput}
          </span>
        </div>
        <span className="text-xs text-zinc-500">
          Sample data · no external call
        </span>
      </div>

      <div
        className="flex-1 gap-2 overflow-hidden p-2"
        style={{
          display: "grid",
          gridTemplateColumns: "20% 1fr 25%",
          gridTemplateRows: "1fr 100px",
        }}
      >
        <div className="overflow-y-auto">
          <PhoneUI
            status={status}
            company="Asiana Airlines"
            ivrLog={ivrLog}
            onHangUp={handleHangUp}
          />
        </div>
        <div className="overflow-hidden">
          <GraphView data={graph} />
        </div>
        <div className="overflow-y-auto">
          <BriefingCard
            briefing={briefing}
            status={status}
            onHangUp={handleHangUp}
          />
        </div>
        <div className="col-span-3">
          <ReasoningLog entries={activities} />
        </div>
      </div>

      {showDemoEndPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-2xl text-emerald-400">
              ✓
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">
              IVR walkthrough complete
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              No call was placed. In a real case, every call or send would require
              a separate, unchanged action preview and explicit approval.
            </p>
            <button
              onClick={handleHangUp}
              className="mt-6 w-full rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Back to karen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
