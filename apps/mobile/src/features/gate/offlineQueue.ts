import type { GateEventInput } from "@outpassed/shared";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { api, ApiError } from "../../api/client";

/**
 * Gate movements that couldn't reach the server (gate Wi-Fi drops are
 * normal). Each carries its own eventId, so replaying is idempotent on the
 * server. Persisted best-effort so a restart doesn't lose them.
 */
export type QueuedEvent = GateEventInput & { personName: string; queuedAt: string };

const KEY = "arvio.gateQueue";
let queue: QueuedEvent[] = [];
let loaded = false;
const listeners = new Set<(q: QueuedEvent[]) => void>();

async function read(): Promise<string | null> {
  try {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

async function write(value: string) {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, value);
    else await SecureStore.setItemAsync(KEY, value);
  } catch {
    // Storage is best-effort; the in-memory queue still retries.
  }
}

function emit() {
  void write(JSON.stringify(queue));
  for (const l of listeners) l(queue);
}

export async function loadQueue() {
  if (loaded) return queue;
  loaded = true;
  const raw = await read();
  if (raw) {
    try {
      queue = JSON.parse(raw) as QueuedEvent[];
    } catch {
      queue = [];
    }
  }
  emit();
  return queue;
}

export function enqueue(e: QueuedEvent) {
  queue = [...queue, e];
  emit();
}

export function subscribe(fn: (q: QueuedEvent[]) => void) {
  listeners.add(fn);
  fn(queue);
  return () => {
    listeners.delete(fn);
  };
}

/** Sends queued events in order. Drops ones the server rejects outright. */
export async function flush(token: string): Promise<{ sent: number; dropped: number }> {
  let sent = 0;
  let dropped = 0;
  for (const item of [...queue]) {
    const { personName: _p, queuedAt: _q, ...input } = item;
    try {
      await api.recordEvent(token, input);
      sent++;
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) break; // still offline
      dropped++; // e.g. pass expired meanwhile: keep the queue moving
    }
    queue = queue.filter((q) => q.eventId !== item.eventId);
    emit();
  }
  return { sent, dropped };
}
