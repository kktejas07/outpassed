import type { Prisma } from "@prisma/client";
import { env } from "../env";
import { prisma } from "./prisma";

/**
 * Notifications: every event is saved to the recipient's in-app inbox and,
 * when they have the app installed with notifications allowed, sent as a
 * phone push through Expo's push service.
 */

export type NotificationKind =
  | "OUTPASS_NEEDS_PARENT"
  | "OUTPASS_NEEDS_WARDEN"
  | "OUTPASS_PARENT_APPROVED"
  | "OUTPASS_APPROVED"
  | "OUTPASS_REJECTED"
  | "OUTPASS_CANCELLED"
  | "STUDENT_LEFT"
  | "STUDENT_RETURNED"
  | "STUDENT_OVERDUE"
  | "VISITOR_AT_GATE"
  | "VISITOR_ARRIVED"
  | "VISIT_DECIDED";

export type NotificationInput = {
  kind: NotificationKind;
  title: string;
  body: string;
  /** Deep-link hints for the app, e.g. { outpassId } or { visitId }. */
  data?: Record<string, string>;
};

export type PushMessage = { to: string; title: string; body: string; data?: Record<string, string>; sound: "default" };
export type PushSender = (messages: PushMessage[]) => Promise<{ invalidTokens: string[] }>;

/** Sends through https://exp.host. Tokens Expo reports as unregistered are returned so they can be removed. */
const expoSender: PushSender = async (messages) => {
  const invalidTokens: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(batch),
    });
    const json = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
    json?.data?.forEach((ticket, j) => {
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        invalidTokens.push(batch[j]!.to);
      }
    });
  }
  return { invalidTokens };
};

let sender: PushSender = expoSender;

/** Tests replace the sender to capture pushes instead of calling Expo. */
export function setPushSender(next: PushSender | null) {
  sender = next ?? expoSender;
}

export async function notify(userIds: string[], n: NotificationInput): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;
  await prisma.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      kind: n.kind,
      title: n.title,
      body: n.body,
      data: (n.data ?? undefined) as Prisma.InputJsonValue | undefined,
    })),
  });
  if (!env.PUSH_ENABLED) return;
  const tokens = await prisma.pushToken.findMany({ where: { userId: { in: unique } }, select: { token: true } });
  if (tokens.length === 0) return;
  try {
    const { invalidTokens } = await sender(
      tokens.map((t) => ({ to: t.token, title: n.title, body: n.body, data: { kind: n.kind, ...n.data }, sound: "default" })),
    );
    if (invalidTokens.length) await prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
  } catch (err) {
    // Push is best-effort; the inbox entry is already saved.
    console.warn("push send failed", err);
  }
}

const pending = new Set<Promise<void>>();

/** Runs a notification without delaying or failing the request that caused it. */
export function notifyLater(userIds: string[], n: NotificationInput) {
  const p = notify(userIds, n)
    .catch((err) => console.warn("notify failed", err))
    .finally(() => pending.delete(p));
  pending.add(p);
}

/** Waits for background notifications; called when the server shuts down. */
export async function drainNotifications(): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending]);
}

export async function guardianIds(studentId: string): Promise<string[]> {
  const rows = await prisma.guardianship.findMany({ where: { studentId }, select: { parentId: true } });
  return rows.map((r) => r.parentId);
}

export async function wardenIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({ where: { role: "WARDEN" }, select: { id: true } });
  return rows.map((r) => r.id);
}
