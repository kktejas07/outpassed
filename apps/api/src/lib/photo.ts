import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/**
 * Photos are served from /photos/:userId with a signed, expiring query string,
 * so <Image> tags work on every platform without sending the sign-in token.
 */
const TTL_SECONDS = 6 * 3600;

function sig(userId: string, exp: number, v: number) {
  return createHmac("sha256", `${env.JWT_SECRET}:photos`).update(`${userId}.${exp}.${v}`).digest("base64url");
}

/** Relative URL; the app prefixes its API address. */
export function photoUrl(userId: string, updatedAt: Date | null | undefined, now = Date.now()): string | null {
  if (!updatedAt) return null;
  // Round expiry to the hour so the URL (and the image cache) stays stable for a while.
  const exp = Math.ceil((now / 1000 + TTL_SECONDS) / 3600) * 3600;
  const v = Math.floor(updatedAt.getTime() / 1000);
  return `/photos/${userId}?v=${v}&exp=${exp}&sig=${sig(userId, exp, v)}`;
}

/** Signed link to a gate photo (same scheme, a different key prefix). */
export function gatePhotoUrl(eventId: string, hasPhoto: boolean, now = Date.now()): string | null {
  if (!hasPhoto) return null;
  const exp = Math.ceil((now / 1000 + TTL_SECONDS) / 3600) * 3600;
  return `/gate-photos/${eventId}?exp=${exp}&sig=${sig(`gate:${eventId}`, exp, 0)}`;
}

export function visitorPhotoUrl(visitId: string, hasPhoto: boolean, now = Date.now()): string | null {
  if (!hasPhoto) return null;
  const exp = Math.ceil((now / 1000 + TTL_SECONDS) / 3600) * 3600;
  return `/visitor-photos/${visitId}?exp=${exp}&sig=${sig(`visit:${visitId}`, exp, 0)}`;
}

export function verifyVisitorPhotoSig(visitId: string, exp: number, given: string, now = Date.now()): boolean {
  return verifyPhotoSig(`visit:${visitId}`, exp, 0, given, now);
}

export function verifyGatePhotoSig(eventId: string, exp: number, given: string, now = Date.now()): boolean {
  return verifyPhotoSig(`gate:${eventId}`, exp, 0, given, now);
}

export function verifyPhotoSig(userId: string, exp: number, v: number, given: string, now = Date.now()): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const a = Buffer.from(sig(userId, exp, v));
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Signed link for other stored images (fee proofs, marketplace photos). */
export function mediaUrl(kind: "fee-proof" | "market" | "receipt" | "ticket", id: string, version = 0, now = Date.now()): string {
  const exp = Math.ceil((now / 1000 + TTL_SECONDS) / 3600) * 3600;
  return `/media/${kind}/${id}?v=${version}&exp=${exp}&sig=${sig(`${kind}:${id}`, exp, version)}`;
}

export function verifyMedia(kind: string, id: string, exp: number, version: number, given: string, now = Date.now()): boolean {
  return verifyPhotoSig(`${kind}:${id}`, exp, version, given, now);
}
