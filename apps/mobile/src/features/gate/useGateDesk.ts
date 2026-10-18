import type { GateVerdict } from "@outpassed/shared";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, errorMessage } from "../../api/client";
import { useSession } from "../../auth/session";
import { useRibbon } from "../../ui/Ribbon";
import { enqueue, flush, loadQueue, subscribe, type QueuedEvent } from "./offlineQueue";

export type DeskState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "verdict"; verdict: GateVerdict }
  | { phase: "saving"; verdict: GateVerdict }
  | { phase: "done"; verdict: GateVerdict; accepted: boolean; queued: boolean }
  | { phase: "error"; message: string };

const GATE_NAME = "Main Gate";

/**
 * Guard flow: scan → verdict (read-only) → guard checks the face and confirms
 * → movement recorded. If the network is down the movement is queued.
 */
export function useGateDesk() {
  const { token } = useSession();
  const ribbon = useRibbon();
  const [state, setState] = useState<DeskState>({ phase: "idle" });
  const [pending, setPending] = useState<QueuedEvent[]>([]);

  useEffect(() => {
    void loadQueue();
    return subscribe(setPending);
  }, []);

  // Retry queued movements every 15 s.
  useEffect(() => {
    if (!token || pending.length === 0) return;
    const t = setInterval(() => void flush(token), 15000);
    return () => clearInterval(t);
  }, [token, pending.length]);

  const check = useCallback(
    async (input: { qr: string } | { rollNo: string } | { visitCode: string }) => {
      if (!token) return;
      setState({ phase: "checking" });
      try {
        const verdict =
          "qr" in input
            ? await api.scan(token, input.qr)
            : "visitCode" in input
              ? await api.lookupVisitCode(token, input.visitCode)
              : await api.lookupRoll(token, input.rollNo.trim());
        setState({ phase: "verdict", verdict });
      } catch (err) {
        setState({ phase: "error", message: errorMessage(err) });
      }
    },
    [token],
  );

  const confirm = useCallback(
    async (photoMatched: boolean, method: "QR" | "MANUAL" = "QR") => {
      if (!token || state.phase !== "verdict") return;
      const { verdict } = state;
      if (!verdict.subjectId || !verdict.kind) return;
      const direction = verdict.direction ?? "EXIT";
      const input = {
        eventId: randomUUID(),
        ...(verdict.kind === "OUTPASS" ? { outpassId: verdict.subjectId } : { visitId: verdict.subjectId }),
        direction,
        gate: GATE_NAME,
        method,
        photoMatched,
        deviceTime: new Date().toISOString(),
        ...(photoMatched ? {} : { note: "Photo did not match — turned back" }),
      };
      setState({ phase: "saving", verdict });
      try {
        await api.recordEvent(token, input);
        setState({ phase: "done", verdict, accepted: photoMatched, queued: false });
        const who = verdict.person?.name ?? "Visitor";
        if (photoMatched) {
          ribbon.show({ tone: "success", title: direction === "ENTRY" ? `${who} is in` : `${who} is out`, body: direction === "ENTRY" ? "Entry recorded." : "Exit recorded. Parents have been told.", celebrate: true });
        } else {
          ribbon.show({ tone: "danger", title: `${who} turned back`, body: "Logged as a photo mismatch." });
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) {
          enqueue({ ...input, personName: verdict.person?.name ?? "Unknown", queuedAt: new Date().toISOString() });
          setState({ phase: "done", verdict, accepted: photoMatched, queued: true });
          ribbon.show({ tone: "warning", title: "Saved on this phone", body: "No network. It will sync automatically." });
        } else {
          setState({ phase: "error", message: errorMessage(err) });
        }
      }
    },
    [token, state, ribbon],
  );

  return {
    state,
    check,
    confirm,
    reset: () => setState({ phase: "idle" }),
    pending,
    syncNow: () => (token ? flush(token) : Promise.resolve({ sent: 0, dropped: 0 })),
  };
}
