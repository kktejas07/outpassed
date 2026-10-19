import type { Department, Prisma, StudentProfile, User, UserPhoto } from "@prisma/client";
import type {
  ApprovalDto,
  GateEventDto,
  OutpassDto,
  UserDto,
  VisitDto,
} from "@outpassed/shared";
import { isOverdue } from "../domain/outpassFlow";
import { gatePhotoUrl, photoUrl, visitorPhotoUrl } from "./photo";
import { cachedSettings } from "./settings";
import { ADULT_AGE, ageOn } from "../domain/outpassFlow";
import { passUrl } from "./visitCode";

/**
 * Prisma rows -> API DTOs. Dates are serialised to ISO strings so responses
 * match the shared zod schemas exactly.
 */

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Everything toUserDto can show; pass it to findUnique/findMany for a full DTO. */
export const userInclude = {
  student: { include: { department: true } },
  photo: { select: { updatedAt: true } },
  department: true,
  headOf: { select: { id: true } },
} satisfies Prisma.UserInclude;

type UserRow = User & {
  student?: (StudentProfile & { department?: Department | null }) | null;
  photo?: Pick<UserPhoto, "updatedAt"> | null;
  department?: Department | null;
  headOf?: { id: string }[];
};

/**
 * Sponsored offers go to adult students only, and never on school campuses.
 * Students with no date of birth on file are treated as possibly under 18.
 */
function showsOffers(user: UserRow): boolean {
  const s = cachedSettings();
  if (user.role !== "STUDENT" || !s.offersEnabled || s.schoolMode) return false;
  const dob = user.student?.dateOfBirth;
  return !!dob && ageOn(dob, new Date()) >= ADULT_AGE;
}

export function toUserDto(user: UserRow): UserDto {
  const dept = user.department ?? user.student?.department ?? null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    student: user.student
      ? {
          rollNo: user.student.rollNo,
          hostel: user.student.hostel,
          hostelId: user.student.hostelId,
          room: user.student.room,
          dateOfBirth: user.student.dateOfBirth
            ? user.student.dateOfBirth.toISOString().slice(0, 10)
            : null,
        }
      : null,
    photoUrl: photoUrl(user.id, user.photo?.updatedAt),
    department: dept ? { id: dept.id, name: dept.name, isHod: !!user.headOf?.some((d) => d.id === dept.id) } : null,
    showOffers: showsOffers(user),
  };
}

/** The include every outpass query uses, so the DTO always has what it needs. */
export const outpassInclude = {
  student: { include: { student: { include: { department: true } }, photo: { select: { updatedAt: true } } } },
  faculty: { select: { id: true, name: true } },
  approvals: { include: { approver: true }, orderBy: { createdAt: "asc" } },
  extensions: { include: { decidedBy: true }, orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.OutpassInclude;

export type OutpassWithRelations = Prisma.OutpassGetPayload<{ include: typeof outpassInclude }>;

export function toOutpassDto(row: OutpassWithRelations, now: Date = new Date()): OutpassDto {
  return {
    id: row.id,
    type: row.type,
    destination: row.destination,
    reason: row.reason,
    leaveAt: row.leaveAt.toISOString(),
    returnBy: row.returnBy.toISOString(),
    status: row.status,
    overdue: isOverdue(row.status, row.returnBy, now),
    exitedAt: iso(row.exitedAt),
    returnedAt: iso(row.returnedAt),
    createdAt: row.createdAt.toISOString(),
    student: {
      id: row.student.id,
      name: row.student.name,
      rollNo: row.student.student?.rollNo ?? null,
      hostel: row.student.student?.hostel ?? null,
      room: row.student.student?.room ?? null,
      photoUrl: photoUrl(row.student.id, row.student.photo?.updatedAt),
      department: row.student.student?.department?.name ?? null,
    },
    faculty: row.faculty,
    approvals: row.approvals.map(
      (a): ApprovalDto => ({
        id: a.id,
        step: a.step,
        decision: a.decision,
        approverId: a.approverId,
        approverName: a.approver.name,
        override: a.override,
        reason: a.reason,
        createdAt: a.createdAt.toISOString(),
      }),
    ),
    extension: row.extensions[0]
      ? {
          id: row.extensions[0].id,
          previousReturnBy: row.extensions[0].previousReturnBy.toISOString(),
          requestedReturnBy: row.extensions[0].requestedReturnBy.toISOString(),
          reason: row.extensions[0].reason,
          status: row.extensions[0].status,
          decidedByName: row.extensions[0].decidedBy?.name ?? null,
          createdAt: row.extensions[0].createdAt.toISOString(),
        }
      : null,
  };
}

export const visitInclude = { host: true } satisfies Prisma.VisitInclude;
export type VisitWithHost = Prisma.VisitGetPayload<{ include: typeof visitInclude }>;

export function toVisitDto(row: VisitWithHost): VisitDto {
  return {
    id: row.id,
    visitorName: row.visitorName,
    visitorPhone: row.visitorPhone,
    visitorIdNumber: row.visitorIdNumber,
    visitorPhotoUrl: visitorPhotoUrl(row.id, !!row.visitorPhotoMime),
    visitorType: row.visitorType,
    purpose: row.purpose,
    status: row.status,
    walkIn: row.walkIn,
    validFrom: row.validFrom.toISOString(),
    validTo: row.validTo.toISOString(),
    host: { id: row.host.id, name: row.host.name, role: row.host.role },
    checkedInAt: iso(row.checkedInAt),
    checkedOutAt: iso(row.checkedOutAt),
    code: row.code,
    passUrl: passUrl(row.passToken),
    repeat: row.repeatDays.length && row.dailyFrom && row.dailyTo ? { days: row.repeatDays, from: row.dailyFrom, to: row.dailyTo } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toGateEventDto(row: Prisma.GateEventGetPayload<object> & { photo?: { mime: string } | null; hasPhoto?: boolean }): GateEventDto {
  return {
    id: row.id,
    direction: row.direction,
    gate: row.gate,
    method: row.method,
    accepted: row.accepted,
    personName: row.personName,
    outpassId: row.outpassId,
    visitId: row.visitId,
    guardId: row.guardId,
    note: row.note,
    photoUrl: gatePhotoUrl(row.id, row.hasPhoto ?? !!row.photo),
    createdAt: row.createdAt.toISOString(),
  };
}
