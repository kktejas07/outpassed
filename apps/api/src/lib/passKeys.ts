import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { base64urlEncode, encodePassPayload, type PassPayload } from "@outpassed/shared/passToken";
import { env } from "../env";

/**
 * The Ed25519 key pair that signs gate passes. Guards' phones download the
 * public half (GET /gate/key) and can then check passes with no internet.
 */
const seed = env.QR_SIGNING_KEY
  ? Buffer.from(env.QR_SIGNING_KEY, "base64")
  : createHash("sha256").update(`outpass-ed25519:${env.QR_SECRET}`).digest();
if (seed.length !== 32) throw new Error("QR_SIGNING_KEY must be 32 bytes, base64-encoded");

// PKCS#8 wrapper for a raw Ed25519 seed.
const privateKey = createPrivateKey({
  key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]),
  format: "der",
  type: "pkcs8",
});
const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
const rawPublic = new Uint8Array(spki.subarray(spki.length - 32));

export const passPublicKey = base64urlEncode(rawPublic);
/** Short id so phones notice when the key changes. */
export const passKeyId = createHash("sha256").update(rawPublic).digest("hex").slice(0, 12);

export function signPass(payload: PassPayload): string {
  const body = encodePassPayload(payload);
  const sig = sign(null, Buffer.from(body, "utf8"), privateKey);
  return `${body}.${base64urlEncode(new Uint8Array(sig))}`;
}

/** Campus UTC offset in minutes right now (e.g. 330 for India). */
export function campusOffsetMinutes(at = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: env.CAMPUS_TZ, timeZoneName: "longOffset" }).formatToParts(at);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}
