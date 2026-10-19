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

export function verifyPhotoSig(userId: string, exp: number, v: number, given: string, now = Date.now()): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const a = Buffer.from(sig(userId, exp, v));
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
