import type { Prisma, StudentProfile, User, UserPhoto } from "@prisma/client";
import type {
  ApprovalDto,
  GateEventDto,
  OutpassDto,
  UserDto,
  VisitDto,
} from "@outpassed/shared";
import { isOverdue } from "../domain/outpassFlow";
import { photoUrl } from "./photo";
import { passUrl } from "./visitCode";

/**
 * Prisma rows -> API DTOs. Dates are serialised to ISO strings so responses
 * match the shared zod schemas exactly.
 */

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function toUserDto(user: User & { student?: StudentProfile | null; photo?: Pick<UserPhoto, "updatedAt"> | null }): UserDto {
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
  };
}

/** The include every outpass query uses, so the DTO always has what it needs. */
export const outpassInclude = {
  student: { include: { student: true, photo: { select: { updatedAt: true } } } },
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
    },
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
    visitorType: row.visitorType,
    purpose: row.purpose,
    status: row.status,
    walkIn: row.walkIn,
    validFrom: row.validFrom.toISOString(),
    validTo: row.validTo.toISOString(),
    host: { id: row.host.id, name: row.host.name },
    checkedInAt: iso(row.checkedInAt),
    checkedOutAt: iso(row.checkedOutAt),
    code: row.code,
    passUrl: passUrl(row.passToken),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toGateEventDto(row: Prisma.GateEventGetPayload<object>): GateEventDto {
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
    createdAt: row.createdAt.toISOString(),
  };
}
