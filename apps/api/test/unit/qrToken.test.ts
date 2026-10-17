import { describe, expect, it } from "vitest";
import { issueQrToken, verifyQrToken } from "../../src/domain/qrToken";

const secret = "test-secret-at-least-16-chars";
const t0 = new Date("2026-10-18T10:00:00Z");
const later = (s: number) => new Date(t0.getTime() + s * 1000);

describe("qr tokens", () => {
  it("round-trips a fresh token", () => {
    const token = issueQrToken("abc", "OUTPASS", secret, t0);
    expect(verifyQrToken(token, secret, 45, later(10))).toEqual({
      ok: true,
      payload: { sub: "abc", kind: "OUTPASS", iat: Math.floor(t0.getTime() / 1000) },
    });
  });
  it("expires after ttl plus clock skew", () => {
    const token = issueQrToken("abc", "OUTPASS", secret, t0);
    expect(verifyQrToken(token, secret, 45, later(75)).ok).toBe(true);
    expect(verifyQrToken(token, secret, 45, later(76))).toEqual({ ok: false, code: "STALE" });
  });
  it("uses a per-kind ttl", () => {
    const ttl = { OUTPASS: 45, VISIT: 86_400 };
    expect(verifyQrToken(issueQrToken("v", "VISIT", secret, t0), secret, ttl, later(3600)).ok).toBe(true);
    expect(verifyQrToken(issueQrToken("o", "OUTPASS", secret, t0), secret, ttl, later(3600)).ok).toBe(false);
  });
  it("rejects tokens from the future", () => {
    const token = issueQrToken("abc", "OUTPASS", secret, later(120));
    expect(verifyQrToken(token, secret, 45, t0)).toEqual({ ok: false, code: "FROM_FUTURE" });
  });
  it("rejects a wrong secret or a tampered payload", () => {
    const token = issueQrToken("abc", "OUTPASS", secret, t0);
    expect(verifyQrToken(token, "another-secret-of-16+", 45, t0)).toEqual({ ok: false, code: "BAD_SIGNATURE" });
    const [v, , sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "xyz", kind: "OUTPASS", iat: Math.floor(t0.getTime() / 1000) })).toString("base64url");
    expect(verifyQrToken(`${v}.${forged}.${sig}`, secret, 45, t0)).toEqual({ ok: false, code: "BAD_SIGNATURE" });
  });
  it("rejects garbage", () => {
    expect(verifyQrToken("hello", secret, 45, t0)).toEqual({ ok: false, code: "MALFORMED" });
    expect(verifyQrToken("v2.a.b", secret, 45, t0)).toEqual({ ok: false, code: "MALFORMED" });
  });
});
