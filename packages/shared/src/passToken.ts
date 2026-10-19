import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

/**
 * Gate pass tokens, version 2: `v2.<base64url(JSON payload)>.<base64url(Ed25519 signature)>`.
 *
 * The server signs with a private key; anyone with the public key can verify.
 * That lets a guard's phone check a pass with no internet: the payload carries
 * the person's name, the pass window and its status at the time it was issued.
 * The server still re-checks the live status whenever it's reachable.
 */

ed.hashes.sha512 = sha512;

export type PassKind = "OUTPASS" | "VISIT";

/** Weekdays (0 = Sunday) and a daily window, in campus time, for a regular visitor pass. */
export type RepeatRule = { days: number[]; from: string; to: string; /** campus UTC offset in minutes */ tzo: number };

export type PassPayload = {
  v: 2;
  /** Outpass or visit id. */
  sub: string;
  kind: PassKind;
  /** Issued at / expires at, epoch seconds. */
  iat: number;
  exp: number;
  /** Name and a detail line (hostel · room · roll no., or who they're visiting). */
  n: string;
  d: string;
  /** The pass window, epoch seconds: leave–return for outpasses, valid from–to for visits. */
  from: number;
  to: number;
  /** Status when issued: APPROVED or OUT for outpasses; APPROVED or CHECKED_IN for visits. */
  st: string;
  /** Long-lived copy the app keeps for when the student's phone is offline. */
  off?: 1;
  rep?: RepeatRule;
};

export const PASS_TOKEN_PREFIX = "v2";
/** Allowed clock drift between devices. */
export const PASS_CLOCK_SKEW_SECONDS = 60;
/** Students may scan out up to this long before their leave time. */
export const EARLY_GRACE_SECONDS = 15 * 60;

// --- base64url + UTF-8 without Buffer (works in React Native) ---

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function base64urlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += ALPHABET[n & 63]!;
  }
  return out;
}

export function base64urlDecode(s: string): Uint8Array | null {
  const clean = s.replace(/=+$/, "");
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const c of clean) {
    const v = LOOKUP.get(c);
    if (v === undefined) return null;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 255);
    }
  }
  return Uint8Array.from(out);
}

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    let c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return Uint8Array.from(out);
}

export function utf8Decode(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; ) {
    const x = b[i]!;
    let c: number;
    if (x < 0x80) (c = x), (i += 1);
    else if (x < 0xe0) (c = ((x & 31) << 6) | (b[i + 1]! & 63)), (i += 2);
    else if (x < 0xf0) (c = ((x & 15) << 12) | ((b[i + 1]! & 63) << 6) | (b[i + 2]! & 63)), (i += 3);
    else (c = ((x & 7) << 18) | ((b[i + 1]! & 63) << 12) | ((b[i + 2]! & 63) << 6) | (b[i + 3]! & 63)), (i += 4);
    s += String.fromCodePoint(c);
  }
  return s;
}

// --- tokens ---

export function encodePassPayload(p: PassPayload): string {
  return `${PASS_TOKEN_PREFIX}.${base64urlEncode(utf8Encode(JSON.stringify(p)))}`;
}

/** The bytes that are signed: the ASCII text before the last dot. */
export const signedPart = (body: string) => utf8Encode(body);

export type PassDecode =
  | { ok: true; payload: PassPayload; body: string; signature: Uint8Array }
  | { ok: false; code: "MALFORMED" };

export function decodePassToken(token: string): PassDecode {
  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts[0] !== PASS_TOKEN_PREFIX) return { ok: false, code: "MALFORMED" };
  const json = base64urlDecode(parts[1]!);
  const signature = base64urlDecode(parts[2]!);
  if (!json || !signature) return { ok: false, code: "MALFORMED" };
  try {
    const payload = JSON.parse(utf8Decode(json)) as PassPayload;
    if (
      payload.v !== 2 ||
      typeof payload.sub !== "string" ||
      (payload.kind !== "OUTPASS" && payload.kind !== "VISIT") ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return { ok: false, code: "MALFORMED" };
    }
    return { ok: true, payload, body: `${parts[0]}.${parts[1]}`, signature };
  } catch {
    return { ok: false, code: "MALFORMED" };
  }
}

export type PassVerify =
  | { ok: true; payload: PassPayload }
  | { ok: false; code: "MALFORMED" | "BAD_SIGNATURE" | "STALE" | "FROM_FUTURE" };

/** Checks the signature and expiry. `publicKey` is the 32-byte key, base64url (from GET /gate/key). */
export function verifyPassToken(token: string, publicKey: string, nowMs = Date.now()): PassVerify {
  const d = decodePassToken(token);
  if (!d.ok) return d;
  const key = base64urlDecode(publicKey);
  if (!key || key.length !== 32 || d.signature.length !== 64) return { ok: false, code: "BAD_SIGNATURE" };
  let valid = false;
  try {
    valid = ed.verify(d.signature, signedPart(d.body), key);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, code: "BAD_SIGNATURE" };
  const now = Math.floor(nowMs / 1000);
  if (d.payload.iat > now + PASS_CLOCK_SKEW_SECONDS) return { ok: false, code: "FROM_FUTURE" };
  if (now > d.payload.exp + PASS_CLOCK_SKEW_SECONDS) return { ok: false, code: "STALE" };
  return { ok: true, payload: d.payload };
}

// --- regular visitor windows ---

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Whether a regular pass is open right now (today is one of its days and inside its hours). */
export function repeatWindowOpen(rule: Pick<RepeatRule, "days" | "from" | "to" | "tzo">, nowMs: number): boolean {
  const local = new Date(nowMs + rule.tzo * 60_000);
  const day = local.getUTCDay();
  const mins = local.getUTCHours() * 60 + local.getUTCMinutes();
  return rule.days.includes(day) && mins >= minutes(rule.from) && mins <= minutes(rule.to);
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Sun, Sat · 10:00–18:00" */
export function describeRepeat(rule: Pick<RepeatRule, "days" | "from" | "to">): string {
  const days = [...rule.days].sort((a, b) => a - b);
  const label = days.length === 7 ? "Every day" : days.length === 5 && !days.includes(0) && !days.includes(6) ? "Weekdays" : days.map((d) => DAY_NAMES[d]).join(", ");
  return `${label} · ${rule.from}–${rule.to}`;
}

// --- offline verdict for the guard's phone ---

export type OfflineVerdict = {
  allowed: boolean;
  code: string;
  message: string;
  direction: "EXIT" | "ENTRY" | null;
  kind: PassKind | null;
  subjectId: string | null;
  person: { name: string; detail: string; photoUrl: null } | null;
  offline: true;
};

const TOKEN_MESSAGES: Record<string, string> = {
  MALFORMED: "This is not an Outpass pass",
  BAD_SIGNATURE: "This pass could not be verified",
  STALE: "This code has expired. Ask them to refresh the pass on their phone",
  FROM_FUTURE: "This code has an invalid time. Check the device clock",
};

/**
 * What the guard's phone decides when the server can't be reached.
 * `movedLocally` is the last direction this phone recorded (and queued) for
 * the same pass, so a student who went out offline is let back in.
 */
export function offlineVerdict(token: string, publicKey: string, nowMs: number, movedLocally?: "EXIT" | "ENTRY"): OfflineVerdict {
  const v = verifyPassToken(token, publicKey, nowMs);
  const base = { offline: true as const, photoUrl: null };
  if (!v.ok) return { allowed: false, code: v.code, message: TOKEN_MESSAGES[v.code]!, direction: null, kind: null, subjectId: null, person: null, offline: true };
  const p = v.payload;
  const person = { name: p.n, detail: p.d, photoUrl: base.photoUrl };
  const deny = (code: string, message: string): OfflineVerdict => ({ allowed: false, code, message, direction: null, kind: p.kind, subjectId: p.sub, person, offline: true });
  const allow = (direction: "EXIT" | "ENTRY", code: string, message: string): OfflineVerdict => ({ allowed: true, code, message, direction, kind: p.kind, subjectId: p.sub, person, offline: true });
  const now = Math.floor(nowMs / 1000);

  if (p.kind === "OUTPASS") {
    const out = movedLocally ? movedLocally === "EXIT" : p.st === "OUT";
    if (out) {
      return now > p.to ? allow("ENTRY", "LATE_RETURN", "Allow entry · returning late") : allow("ENTRY", "VALID", "Allow entry · returning on time");
    }
    if (p.st !== "APPROVED") return deny("INVALID_PASS", "This pass can't be used at the gate");
    if (now < p.from - EARLY_GRACE_SECONDS) return deny("NOT_YET_VALID", "This pass is not valid yet");
    if (now > p.to) return deny("EXPIRED", "This pass has expired");
    return allow("EXIT", "VALID", "Allow exit");
  }

  const inside = movedLocally ? movedLocally === "ENTRY" : p.st === "CHECKED_IN";
  if (inside) return allow("EXIT", "VALID", "Visitor leaving");
  if (p.st !== "APPROVED") return deny("INVALID_PASS", "This visit can't be used at the gate");
  if (now < p.from - EARLY_GRACE_SECONDS) return deny("NOT_YET_VALID", "This visit is not valid yet");
  if (now > p.to) return deny("EXPIRED", "This visit has expired");
  if (p.rep && !repeatWindowOpen(p.rep, nowMs)) return deny("OUTSIDE_HOURS", `Regular pass is for ${describeRepeat(p.rep)}`);
  return allow("ENTRY", "VALID", "Allow entry · visitor");
}
