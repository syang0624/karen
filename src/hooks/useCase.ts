"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CaseFile, CaseSseEvent } from "@/types";

interface CaseState {
  caseFile: CaseFile | null;
  loading: boolean;
  connected: boolean;
  error: string | null;
  actionPending: string | null;
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `Request failed with status ${response.status}`);
  }
  return body;
}

export function useCase(caseId: string) {
  const [state, setState] = useState<CaseState>({
    caseFile: null,
    loading: true,
    connected: false,
    error: null,
    actionPending: null,
  });
  const lastEventId = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/cases/${caseId}`, { cache: "no-store" });
      const body = await responseJson<{ case: CaseFile }>(response);
      setState((previous) => ({
        ...previous,
        caseFile: body.case,
        loading: false,
        error: null,
      }));
      return body.case;
    } catch (error) {
      setState((previous) => ({
        ...previous,
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load case",
      }));
      return null;
    }
  }, [caseId]);

  useEffect(() => {
    void refresh();
    const events = new EventSource(`/api/cases/${caseId}/stream`);
    events.onopen = () => {
      setState((previous) => ({ ...previous, connected: true }));
    };
    const onEvent = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as CaseSseEvent;
        if (event.id <= lastEventId.current) return;
        lastEventId.current = event.id;
        if (event.type === "case" && event.data) {
          setState((previous) => ({
            ...previous,
            caseFile: event.data as CaseFile,
            loading: false,
          }));
        } else {
          void refresh();
        }
      } catch {
        setState((previous) => ({
          ...previous,
          error: "A live update could not be read. The case snapshot is still available.",
        }));
      }
    };
    const eventTypes = [
      "case",
      "status",
      "connection",
      "evidence",
      "research",
      "plan",
      "approval",
      "execution",
      "reply",
      "ivr_demo",
      "error",
    ];
    eventTypes.forEach((type) => events.addEventListener(type, onEvent));
    events.onerror = () => {
      setState((previous) => ({ ...previous, connected: false }));
    };
    return () => {
      eventTypes.forEach((type) => events.removeEventListener(type, onEvent));
      events.close();
    };
  }, [caseId, refresh]);

  const runAction = useCallback(
    async <T,>(
      key: string,
      operation: () => Promise<T>,
      updateFrom?: (value: T) => CaseFile | undefined
    ) => {
      setState((previous) => ({
        ...previous,
        actionPending: key,
        error: null,
      }));
      try {
        const result = await operation();
        const next = updateFrom?.(result);
        setState((previous) => ({
          ...previous,
          caseFile: next ?? previous.caseFile,
          actionPending: null,
        }));
        return result;
      } catch (error) {
        setState((previous) => ({
          ...previous,
          actionPending: null,
          error: error instanceof Error ? error.message : "Action failed",
        }));
        return null;
      }
    },
    []
  );

  const decide = useCallback(
    (proposalId: string, payloadHash: string, decision: "approved" | "rejected") =>
      runAction(
        `proposal:${proposalId}`,
        async () =>
          responseJson<{ case: CaseFile }>(
            await fetch(`/api/cases/${caseId}/approvals`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ proposalId, payloadHash, decision }),
            })
          ),
        (value) => value.case
      ),
    [caseId, runAction]
  );

  const retry = useCallback(
    () =>
      runAction(
        "retry",
        async () =>
          responseJson<{ case: CaseFile }>(
            await fetch(`/api/cases/${caseId}/retry`, { method: "POST" })
          ),
        (value) => value.case
      ),
    [caseId, runAction]
  );

  const upload = useCallback(
    (file: File) =>
      runAction(
        "upload",
        async () => {
          const form = new FormData();
          form.append("file", file);
          return responseJson<{ case: CaseFile }>(
            await fetch(`/api/cases/${caseId}/evidence`, {
              method: "POST",
              body: form,
            })
          );
        },
        (value) => value.case
      ),
    [caseId, runAction]
  );

  const connectEmail = useCallback(
    () =>
      runAction("connect", async () => {
        const value = await responseJson<{ redirectUrl: string }>(
          await fetch("/api/connections/composio", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ caseId }),
          })
        );
        window.location.assign(value.redirectUrl);
        return value;
      }),
    [caseId, runAction]
  );

  const startIvrDemo = useCallback(
    () =>
      runAction(
        "ivr",
        async () =>
          responseJson<{ case: CaseFile }>(
            await fetch(`/api/cases/${caseId}/ivr-demo`, { method: "POST" })
          ),
        (value) => value.case
      ),
    [caseId, runAction]
  );

  return {
    ...state,
    refresh,
    decide,
    retry,
    upload,
    connectEmail,
    startIvrDemo,
  };
}
