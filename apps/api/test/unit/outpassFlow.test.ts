import { describe, expect, it } from "vitest";
import {
  ageOn,
  applyDecision,
  canCancel,
  checkOutpassAtGate,
  checkVisitAtGate,
  EARLY_EXIT_GRACE_MS,
  FlowError,
  initialStatus,
  isOverdue,
} from "../../src/domain/outpassFlow";

const now = new Date("2026-10-18T10:00:00Z");
const h = (n: number) => new Date(now.getTime() + n * 3_600_000);

describe("ageOn", () => {
  it("counts whole years and respects the birthday", () => {
    expect(ageOn(new Date("2008-10-18"), now)).toBe(18);
    expect(ageOn(new Date("2008-10-19"), now)).toBe(17);
  });
});

describe("initialStatus", () => {
  const minor = new Date("2010-01-01");
  const adult = new Date("2000-01-01");
  it("asks the parent when a guardian is linked", () => {
    expect(initialStatus({ dateOfBirth: minor, hasGuardian: true, adultParentMode: "notify_only", now })).toBe("PENDING_PARENT");
    expect(initialStatus({ dateOfBirth: adult, hasGuardian: true, adultParentMode: "approve", now })).toBe("PENDING_PARENT");
  });
  it("skips the parent for adults in notify-only mode", () => {
    expect(initialStatus({ dateOfBirth: adult, hasGuardian: true, adultParentMode: "notify_only", now })).toBe("PENDING_WARDEN");
  });
  it("treats an unknown birth date as a minor", () => {
    expect(initialStatus({ dateOfBirth: null, hasGuardian: true, adultParentMode: "notify_only", now })).toBe("PENDING_PARENT");
  });
  it("goes straight to the warden without a guardian", () => {
    expect(initialStatus({ dateOfBirth: minor, hasGuardian: false, adultParentMode: "approve", now })).toBe("PENDING_WARDEN");
  });
});

describe("applyDecision", () => {
  it("parent approval moves to the warden", () => {
    expect(applyDecision({ status: "PENDING_PARENT", actorRole: "PARENT", isGuardian: true, decision: "APPROVE" }))
      .toEqual({ step: "PARENT", nextStatus: "PENDING_WARDEN", override: false });
  });
  it("parent rejection ends the request", () => {
    expect(applyDecision({ status: "PENDING_PARENT", actorRole: "PARENT", isGuardian: true, decision: "REJECT" }).nextStatus).toBe("REJECTED");
  });
  it("an unlinked parent cannot decide", () => {
    expect(() => applyDecision({ status: "PENDING_PARENT", actorRole: "PARENT", isGuardian: false, decision: "APPROVE" })).toThrow(FlowError);
  });
  it("warden override needs a reason and approves fully", () => {
    expect(() => applyDecision({ status: "PENDING_PARENT", actorRole: "WARDEN", isGuardian: false, decision: "APPROVE" })).toThrow(/reason/i);
    expect(applyDecision({ status: "PENDING_PARENT", actorRole: "WARDEN", isGuardian: false, decision: "APPROVE", reason: "Parent unreachable, medical" }))
      .toEqual({ step: "PARENT", nextStatus: "APPROVED", override: true });
  });
  it("warden approves after the parent", () => {
    expect(applyDecision({ status: "PENDING_WARDEN", actorRole: "WARDEN", isGuardian: false, decision: "APPROVE" }))
      .toEqual({ step: "WARDEN", nextStatus: "APPROVED", override: false });
  });
  it("guards and students cannot decide", () => {
    for (const actorRole of ["GUARD", "STUDENT"] as const) {
      expect(() => applyDecision({ status: "PENDING_WARDEN", actorRole, isGuardian: false, decision: "APPROVE" })).toThrow(FlowError);
    }
  });
  it("a decided request cannot be decided again", () => {
    try {
      applyDecision({ status: "APPROVED", actorRole: "WARDEN", isGuardian: false, decision: "REJECT" });
      expect.unreachable();
    } catch (e) {
      expect((e as FlowError).code).toBe("NOT_PENDING");
    }
  });
});

describe("canCancel / isOverdue", () => {
  it("allows cancel only before leaving", () => {
    expect(canCancel("APPROVED")).toBe(true);
    expect(canCancel("OUT")).toBe(false);
    expect(canCancel("RETURNED")).toBe(false);
  });
  it("is overdue only when out past returnBy", () => {
    expect(isOverdue("OUT", h(-1), now)).toBe(true);
    expect(isOverdue("OUT", h(1), now)).toBe(false);
    expect(isOverdue("RETURNED", h(-1), now)).toBe(false);
  });
});

describe("checkOutpassAtGate", () => {
  it("allows exit inside the window, including the early grace", () => {
    expect(checkOutpassAtGate({ status: "APPROVED", leaveAt: h(0), returnBy: h(4), now })).toEqual({ ok: true, direction: "EXIT" });
    const early = new Date(now.getTime() + EARLY_EXIT_GRACE_MS - 1000);
    expect(checkOutpassAtGate({ status: "APPROVED", leaveAt: early, returnBy: h(4), now }).ok).toBe(true);
  });
  it("rejects exit too early or after expiry", () => {
    expect(checkOutpassAtGate({ status: "APPROVED", leaveAt: h(2), returnBy: h(4), now })).toMatchObject({ ok: false, code: "NOT_YET_VALID" });
    expect(checkOutpassAtGate({ status: "APPROVED", leaveAt: h(-5), returnBy: h(-1), now })).toMatchObject({ ok: false, code: "EXPIRED" });
  });
  it("always lets a student back in", () => {
    expect(checkOutpassAtGate({ status: "OUT", leaveAt: h(-5), returnBy: h(-1), now })).toEqual({ ok: true, direction: "ENTRY" });
  });
  it("blocks used, pending and rejected passes", () => {
    expect(checkOutpassAtGate({ status: "RETURNED", leaveAt: h(-5), returnBy: h(-1), now })).toMatchObject({ code: "ALREADY_USED" });
    expect(checkOutpassAtGate({ status: "PENDING_WARDEN", leaveAt: h(0), returnBy: h(4), now })).toMatchObject({ code: "NOT_APPROVED" });
    expect(checkOutpassAtGate({ status: "REJECTED", leaveAt: h(0), returnBy: h(4), now })).toMatchObject({ code: "INVALID_PASS" });
  });
});

describe("checkVisitAtGate", () => {
  it("checks a visitor in, then out", () => {
    expect(checkVisitAtGate({ status: "APPROVED", validFrom: h(0), validTo: h(2), now })).toEqual({ ok: true, direction: "ENTRY" });
    expect(checkVisitAtGate({ status: "CHECKED_IN", validFrom: h(-1), validTo: h(-0.5), now })).toEqual({ ok: true, direction: "EXIT" });
  });
  it("blocks pending, expired and finished visits", () => {
    expect(checkVisitAtGate({ status: "PENDING_HOST", validFrom: h(0), validTo: h(2), now })).toMatchObject({ code: "NOT_APPROVED" });
    expect(checkVisitAtGate({ status: "APPROVED", validFrom: h(-3), validTo: h(-1), now })).toMatchObject({ code: "EXPIRED" });
    expect(checkVisitAtGate({ status: "CHECKED_OUT", validFrom: h(-3), validTo: h(-1), now })).toMatchObject({ code: "ALREADY_USED" });
  });
});
