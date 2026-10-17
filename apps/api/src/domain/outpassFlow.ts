/**
 * Outpass approval state machine. Pure functions only (no I/O) so the rules can
 * be unit-tested and reused by the gate logic.
 *
 *   PENDING_PARENT --parent/guardian approves--> PENDING_WARDEN
 *   PENDING_WARDEN --warden approves----------> APPROVED
 *   APPROVED       --exit scan----------------> OUT
 *   OUT            --entry scan---------------> RETURNED
 *
 * Any reject moves to REJECTED. A student may cancel before leaving.
 * A warden may decide a PENDING_PARENT pass (parent unreachable); that is an
 * override and must carry a reason.
 */

export type OutpassStatus =
  | "PENDING_PARENT"
  | "PENDING_WARDEN"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "OUT"
  | "RETURNED";

export type ActorRole = "STUDENT" | "PARENT" | "WARDEN" | "GUARD" | "ADMIN";
export type Decision = "APPROVE" | "REJECT";
export type ApprovalStep = "PARENT" | "WARDEN";

export type AdultParentMode = "approve" | "notify_only";

export class FlowError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 409,
  ) {
    super(message);
    this.name = "FlowError";
  }
}

export const ADULT_AGE = 18;

/** Whole years between dateOfBirth and `at`. */
export function ageOn(dateOfBirth: Date, at: Date): number {
  let age = at.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    at.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (at.getUTCMonth() === dateOfBirth.getUTCMonth() &&
      at.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * The first status of a new request. Parent approval is skipped only when the
 * student is an adult AND the institution runs in notify-only mode, or when the
 * student has no linked guardian (the warden then decides alone).
 */
export function initialStatus(opts: {
  dateOfBirth: Date | null;
  hasGuardian: boolean;
  adultParentMode: AdultParentMode;
  now: Date;
}): OutpassStatus {
  if (!opts.hasGuardian) return "PENDING_WARDEN";
  const isAdult =
    opts.dateOfBirth !== null && ageOn(opts.dateOfBirth, opts.now) >= ADULT_AGE;
  if (isAdult && opts.adultParentMode === "notify_only") return "PENDING_WARDEN";
  return "PENDING_PARENT";
}

export type DecisionResult = {
  step: ApprovalStep;
  nextStatus: OutpassStatus;
  override: boolean;
};

/**
 * Validates a decision and returns the resulting status. `isGuardian` must be
 * true when a PARENT acts, meaning they are linked to this student.
 */
export function applyDecision(opts: {
  status: OutpassStatus;
  actorRole: ActorRole;
  isGuardian: boolean;
  decision: Decision;
  reason?: string | null;
}): DecisionResult {
  const { status, actorRole, decision } = opts;
  const rejected = decision === "REJECT";

  if (status === "PENDING_PARENT") {
    if (actorRole === "PARENT") {
      if (!opts.isGuardian) {
        throw new FlowError("FORBIDDEN", "Only a linked guardian can decide this request", 403);
      }
      return {
        step: "PARENT",
        nextStatus: rejected ? "REJECTED" : "PENDING_WARDEN",
        override: false,
      };
    }
    if (actorRole === "WARDEN" || actorRole === "ADMIN") {
      if (!opts.reason || opts.reason.trim().length < 3) {
        throw new FlowError(
          "REASON_REQUIRED",
          "A reason is required to decide before the parent has responded",
          400,
        );
      }
      // Override: the warden's approval covers both steps.
      return {
        step: "PARENT",
        nextStatus: rejected ? "REJECTED" : "APPROVED",
        override: true,
      };
    }
    throw new FlowError("FORBIDDEN", "You cannot decide this request", 403);
  }

  if (status === "PENDING_WARDEN") {
    if (actorRole === "WARDEN" || actorRole === "ADMIN") {
      return {
        step: "WARDEN",
        nextStatus: rejected ? "REJECTED" : "APPROVED",
        override: false,
      };
    }
    if (actorRole === "PARENT") {
      throw new FlowError("ALREADY_DECIDED", "You have already responded to this request");
    }
    throw new FlowError("FORBIDDEN", "You cannot decide this request", 403);
  }

  throw new FlowError("NOT_PENDING", `This request is ${status.toLowerCase()} and can no longer be decided`);
}

/** A student may cancel while the pass has not been used to leave. */
export function canCancel(status: OutpassStatus): boolean {
  return status === "PENDING_PARENT" || status === "PENDING_WARDEN" || status === "APPROVED";
}

/** Out past the return time and not yet back. */
export function isOverdue(status: OutpassStatus, returnBy: Date, now: Date): boolean {
  return status === "OUT" && now.getTime() > returnBy.getTime();
}

/** Grace before leaveAt during which an exit scan is still accepted. */
export const EARLY_EXIT_GRACE_MS = 15 * 60 * 1000;

export type GateCheck =
  | { ok: true; direction: "EXIT" | "ENTRY" }
  | { ok: false; code: string; message: string };

/** Decides which direction a scan means and whether it is allowed right now. */
export function checkOutpassAtGate(opts: {
  status: OutpassStatus;
  leaveAt: Date;
  returnBy: Date;
  now: Date;
}): GateCheck {
  const { status, leaveAt, returnBy, now } = opts;
  if (status === "APPROVED") {
    if (now.getTime() < leaveAt.getTime() - EARLY_EXIT_GRACE_MS) {
      return { ok: false, code: "NOT_YET_VALID", message: "This pass is not valid yet" };
    }
    if (now.getTime() > returnBy.getTime()) {
      return { ok: false, code: "EXPIRED", message: "This pass has expired" };
    }
    return { ok: true, direction: "EXIT" };
  }
  if (status === "OUT") {
    // Late returns are always let back in; they are flagged as overdue.
    return { ok: true, direction: "ENTRY" };
  }
  if (status === "RETURNED") {
    return { ok: false, code: "ALREADY_USED", message: "This pass has already been used" };
  }
  if (status === "PENDING_PARENT" || status === "PENDING_WARDEN") {
    return { ok: false, code: "NOT_APPROVED", message: "This pass is still waiting for approval" };
  }
  return { ok: false, code: "INVALID_PASS", message: `This pass was ${status.toLowerCase()}` };
}

export type VisitStatus = "PENDING_HOST" | "APPROVED" | "REJECTED" | "CHECKED_IN" | "CHECKED_OUT";

export function checkVisitAtGate(opts: {
  status: VisitStatus;
  validFrom: Date;
  validTo: Date;
  now: Date;
}): GateCheck {
  const { status, validFrom, validTo, now } = opts;
  if (status === "APPROVED") {
    if (now.getTime() < validFrom.getTime() - EARLY_EXIT_GRACE_MS) {
      return { ok: false, code: "NOT_YET_VALID", message: "This visit is not valid yet" };
    }
    if (now.getTime() > validTo.getTime()) {
      return { ok: false, code: "EXPIRED", message: "This visit has expired" };
    }
    return { ok: true, direction: "ENTRY" };
  }
  if (status === "CHECKED_IN") return { ok: true, direction: "EXIT" };
  if (status === "PENDING_HOST") {
    return { ok: false, code: "NOT_APPROVED", message: "The host has not approved this visit" };
  }
  if (status === "CHECKED_OUT") {
    return { ok: false, code: "ALREADY_USED", message: "This visitor has already left" };
  }
  return { ok: false, code: "INVALID_PASS", message: "This visit was rejected" };
}
