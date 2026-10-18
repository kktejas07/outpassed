import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { api } from "../api/client";
import { useSession } from "../auth/session";
import { useRibbon, type RibbonTone } from "../ui/Ribbon";
import { onForegroundPush, openFromData } from "./push";

const CELEBRATE = new Set(["OUTPASS_APPROVED", "EXTENSION_APPROVED", "PARCEL_AT_GATE", "STUDENT_RETURNED", "VISITOR_ARRIVED"]);
const DANGER = new Set(["SOS_RAISED", "STUDENT_OVERDUE", "OUTPASS_REJECTED", "EXTENSION_REJECTED"]);
const WARNING = new Set(["OUTPASS_NEEDS_PARENT", "OUTPASS_NEEDS_WARDEN", "EXTENSION_REQUESTED", "VISITOR_AT_GATE"]);
const SUCCESS = new Set(["OUTPASS_PARENT_APPROVED", "PARCEL_COLLECTED", "SOS_ACKNOWLEDGED", "SOS_RESOLVED", "VISIT_DECIDED", "STUDENT_LEFT"]);

function toneFor(kind: string): RibbonTone {
  if (DANGER.has(kind)) return "danger";
  if (WARNING.has(kind)) return "warning";
  if (SUCCESS.has(kind) || CELEBRATE.has(kind)) return "success";
  return "info";
}

/**
 * Shows a ribbon when a new alert arrives while the app is open: from a phone
 * push on iOS/Android, or by checking the inbox every 20 s (also covers web).
 */
export function AlertWatcher() {
  const { token, status } = useSession();
  const { show } = useRibbon();
  const seen = useRef<{ since: string | null; recent: Map<string, number> }>({ since: null, recent: new Map() });

  useEffect(() => {
    if (status !== "authenticated" || !token) return;
    seen.current = { since: null, recent: new Map() };

    const present = (kind: string, title: string, body: string, data: Record<string, unknown> | null) => {
      const key = `${title}|${body}`;
      const now = Date.now();
      // A push and the inbox check can both report the same alert; show it once.
      if ((seen.current.recent.get(key) ?? 0) > now - 120_000) return;
      seen.current.recent.set(key, now);
      show({
        tone: toneFor(kind),
        title,
        body,
        celebrate: CELEBRATE.has(kind),
        duration: DANGER.has(kind) ? 7000 : undefined,
        onPress: () => openFromData(data ?? undefined),
      });
    };

    const check = async () => {
      try {
        const { notifications } = await api.notifications(token);
        const newest = notifications[0]?.createdAt ?? null;
        if (seen.current.since === null) {
          // First check after sign-in only sets the baseline.
          seen.current.since = newest ?? new Date().toISOString();
          return;
        }
        const fresh = notifications.filter((n) => n.createdAt > seen.current.since! && !n.readAt).reverse();
        if (newest && newest > seen.current.since) seen.current.since = newest;
        fresh.slice(-3).forEach((n) => present(n.kind, n.title, n.body, n.data));
      } catch {
        // Offline: try again on the next tick.
      }
    };

    void check();
    const timer = setInterval(() => void check(), 20_000);
    const appState = AppState.addEventListener("change", (s) => s === "active" && void check());
    const offPush = onForegroundPush((n) => present(String(n.data.kind ?? ""), n.title, n.body, n.data));
    return () => {
      clearInterval(timer);
      appState.remove();
      offPush();
    };
  }, [status, token, show]);

  return null;
}
