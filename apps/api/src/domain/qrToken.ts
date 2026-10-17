import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived, signed QR tokens.
 *
 * Format: `v1.<base64url(payload)>.<base64url(hmac-sha256)>`
 *
 * The student app fetches a fresh token every ~30 s, so a screenshot forwarded
 * to a friend stops working within the TTL. The gate verifies the signature and
 * the issue time, then checks the pass itself in the database.
 */

export type QrKind = "OUTPASS" | "VISIT";

export type QrPayload = {
  /** Subject id: the outpass or visit id. */
  sub: string;
  kind: QrKind;
  /** Issued at, epoch seconds. */
  iat: number;
};

export type QrVerifyResult =
  | { ok: true; payload: QrPayload }
  | { ok: false; code: "MALFORMED" | "BAD_SIGNATURE" | "STALE" | "FROM_FUTURE" };

const PREFIX = "v1";
/** Allowed clock drift between server and the device that rendered the code. */
const CLOCK_SKEW_SECONDS = 30;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function issueQrToken(
  sub: string,
  kind: QrKind,
  secret: string,
  now: Date = new Date(),
): string {
  const payload: QrPayload = { sub, kind, iat: Math.floor(now.getTime() / 1000) };
  const body = `${PREFIX}.${b64url(JSON.stringify(payload))}`;
  return `${body}.${sign(body, secret)}`;
}

/** Seconds a code stays valid, per kind. Visit codes are shared ahead of time. */
export type QrTtl = number | Record<QrKind, number>;

export function verifyQrToken(
  token: string,
  secret: string,
  ttl: QrTtl,
  now: Date = new Date(),
): QrVerifyResult {
  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, code: "MALFORMED" };

  const body = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(parts[2] ?? "");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, code: "BAD_SIGNATURE" };
  }

  let payload: QrPayload;
  try {
    payload = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8")) as QrPayload;
  } catch {
    return { ok: false, code: "MALFORMED" };
  }
  if (
    typeof payload.sub !== "string" ||
    (payload.kind !== "OUTPASS" && payload.kind !== "VISIT") ||
    typeof payload.iat !== "number"
  ) {
    return { ok: false, code: "MALFORMED" };
  }

  const ttlSeconds = typeof ttl === "number" ? ttl : ttl[payload.kind];
  const nowSec = Math.floor(now.getTime() / 1000);
  if (payload.iat > nowSec + CLOCK_SKEW_SECONDS) return { ok: false, code: "FROM_FUTURE" };
  if (nowSec - payload.iat > ttlSeconds + CLOCK_SKEW_SECONDS) return { ok: false, code: "STALE" };

  return { ok: true, payload };
}
