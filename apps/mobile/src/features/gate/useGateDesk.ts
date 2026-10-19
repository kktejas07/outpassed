import type { GateVerdict } from "@outpassed/shared";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, campus, errorMessage } from "../../api/client";
import { useSession } from "../../auth/session";
import { addPendingPhoto, pendingPhotos, removePendingPhoto } from "./photoQueue";
import { useRibbon } from "../../ui/Ribbon";
import { offlineVerdict } from "@outpassed/shared/passToken";
import { enqueue, flush, loadQueue, subscribe, type QueuedEvent } from "./offlineQueue";
import { gateKey, lastLocalMove, recordLocalMove, refreshGateKey } from "./offlineCheck";

export type DeskState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "verdict"; verdict: GateVerdict }
  | { phase: "saving"; verdict: GateVerdict }
  | { phase: "done"; verdict: GateVerdict; accepted: boolean; queued: boolean }
  | { phase: "error"; message: string };

const GATE_NAME = "Main Gate";

/** Uploads gate photos saved on the phone; they survive the app being closed. */
async function uploadPhotos(token: string) {
  for (const p of await pendingPhotos()) {
    try {
      await campus.gatePhoto(token, p.eventId, p.image);
      removePendingPhoto(p.eventId);
    } catch (err) {
      // Offline (0) or the movement itself hasn't synced yet (404): try again next round.
      if (!(err instanceof ApiError) || (err.status !== 0 && err.status !== 404)) removePendingPhoto(p.eventId);
    }
  }
}

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

  // Keep the pass-checking key on the phone for when the network drops.
  useEffect(() => {
    if (token) void refreshGateKey(token).catch(() => undefined);
  }, [token]);

  // Retry queued movements (then their photos) every 15 s, and once on opening
  // the desk so photos left from before the app was closed go up straight away.
  useEffect(() => {
    if (!token) return;
    void uploadPhotos(token);
    const t = setInterval(() => {
      if (pending.length) void flush(token).then(() => uploadPhotos(token));
      else void uploadPhotos(token);
    }, 15000);
    return () => clearInterval(t);
  }, [token, pending.length]);

  // Whether the college asks for a photo at every exit and entry.
  const [photoRequired, setPhotoRequired] = useState(true);
  useEffect(() => {
    if (token) void campus.settings(token).then((s) => setPhotoRequired(s.requireGatePhoto)).catch(() => undefined);
  }, [token]);

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
        const offline = err instanceof ApiError && err.status === 0;
        if (offline && "qr" in input) {
          // No network: check the pass's signature on this phone.
          const k = await gateKey();
          if (!k) return setState({ phase: "error", message: "No internet, and this phone hasn't downloaded the pass key yet. Connect once, then offline checks work." });
          const local = offlineVerdict(input.qr, k.publicKey, Date.now());
          const moved = local.subjectId ? await lastLocalMove(local.subjectId) : undefined;
          const verdict = moved ? offlineVerdict(input.qr, k.publicKey, Date.now(), moved) : local;
          return setState({ phase: "verdict", verdict: verdict as GateVerdict });
        }
        setState({
          phase: "error",
          message: offline ? "No internet. Codes and roll numbers need the network — ask them to show their QR, which works offline." : errorMessage(err),
        });
      }
    },
    [token],
  );

  const confirm = useCallback(
    async (photoMatched: boolean, method: "QR" | "MANUAL" = "QR", photo: string | null = null) => {
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
        ...(photoMatched ? (photo ? {} : { note: "No photo taken at the gate" }) : { note: "Photo did not match — turned back" }),
      };
      if (photo) await addPendingPhoto({ eventId: input.eventId, image: photo });
      setState({ phase: "saving", verdict });
      if (photoMatched) void recordLocalMove(verdict.subjectId, direction);
      try {
        await api.recordEvent(token, input);
        void uploadPhotos(token);
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
    photoRequired,
    reset: () => setState({ phase: "idle" }),
    pending,
    syncNow: () => (token ? flush(token) : Promise.resolve({ sent: 0, dropped: 0 })),
  };
}
