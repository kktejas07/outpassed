import type { Visit } from "@prisma/client";
import type { PassPayload, RepeatRule } from "@outpassed/shared/passToken";
import { env } from "../env";
import type { OutpassWithRelations } from "./dto";
import { campusOffsetMinutes, signPass } from "./passKeys";

const sec = (d: Date) => Math.floor(d.getTime() / 1000);

/** "Block C · Room 214 · 21CS104" */
export function studentDetail(profile: { hostel: string | null; room: string | null; rollNo: string | null } | null | undefined): string {
  return [profile?.hostel, profile?.room ? `Room ${profile.room}` : null, profile?.rollNo].filter(Boolean).join(" · ") || "Student";
}

/** Longest an offline copy of a pass lasts. */
const OFFLINE_MAX_SECONDS = 24 * 3600;
/** Leeway past the return time, so a late student's offline copy still works. */
const OFFLINE_GRACE_SECONDS = 6 * 3600;

/**
 * A student's gate pass. The short version (`offline: false`) refreshes every
 * QR_TTL_SECONDS; the offline copy lasts until the pass window closes.
 */
export function outpassToken(row: OutpassWithRelations, opts: { offline: boolean }, now = new Date()): { token: string; exp: number } {
  const iat = sec(now);
  const exp = opts.offline ? Math.min(iat + OFFLINE_MAX_SECONDS, sec(row.returnBy) + OFFLINE_GRACE_SECONDS) : iat + env.QR_TTL_SECONDS;
  const payload: PassPayload = {
    v: 2,
    sub: row.id,
    kind: "OUTPASS",
    iat,
    exp,
    n: row.student.name,
    d: studentDetail(row.student.student),
    from: sec(row.leaveAt),
    to: sec(row.returnBy),
    st: row.status,
    ...(opts.offline ? { off: 1 as const } : {}),
  };
  return { token: signPass(payload), exp };
}

export function repeatOf(v: Pick<Visit, "repeatDays" | "dailyFrom" | "dailyTo">): Omit<RepeatRule, "tzo"> | null {
  return v.repeatDays.length && v.dailyFrom && v.dailyTo ? { days: v.repeatDays, from: v.dailyFrom, to: v.dailyTo } : null;
}

/** A visitor's pass. Shared ahead of time, so it lasts until the visit ends. */
export function visitToken(v: Visit & { host: { name: string } }, ttlSeconds: number, now = new Date()): string {
  const iat = sec(now);
  const rep = repeatOf(v);
  return signPass({
    v: 2,
    sub: v.id,
    kind: "VISIT",
    iat,
    exp: Math.min(iat + ttlSeconds, sec(v.validTo) + 3600),
    n: v.visitorName,
    d: `Visiting ${v.host.name} · ${v.purpose}`,
    from: sec(v.validFrom),
    to: sec(v.validTo),
    st: v.status,
    ...(rep ? { rep: { ...rep, tzo: campusOffsetMinutes(now) } } : {}),
  });
}
