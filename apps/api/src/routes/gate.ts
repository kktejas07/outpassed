import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { gateEventInputSchema, gateScanSchema, type GateVerdict } from "@outpassed/shared";
import { env } from "../env";
import { checkOutpassAtGate, checkVisitAtGate, FlowError } from "../domain/outpassFlow";
import { verifyQrToken } from "../domain/qrToken";
import { VISIT_QR_TTL_SECONDS } from "./visit";
import { prisma } from "../lib/prisma";
import { outpassInclude, toGateEventDto, type OutpassWithRelations } from "../lib/dto";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";

const TOKEN_MESSAGES: Record<string, string> = {
  MALFORMED: "This is not an Arvio pass",
  BAD_SIGNATURE: "This pass could not be verified",
  STALE: "This code has expired. Ask them to refresh the pass on their phone",
  FROM_FUTURE: "This code has an invalid time. Check the device clock",
};

function denied(code: string, message: string): GateVerdict {
  return { allowed: false, code, message, direction: null, kind: null, subjectId: null, person: null };
}

function outpassVerdict(row: OutpassWithRelations, now: Date): GateVerdict {
  const check = checkOutpassAtGate({
    status: row.status,
    leaveAt: row.leaveAt,
    returnBy: row.returnBy,
    now,
  });
  const profile = row.student.student;
  const detail = [profile?.hostel, profile?.room ? `Room ${profile.room}` : null, profile?.rollNo]
    .filter(Boolean)
    .join(" · ");
  const person = { name: row.student.name, detail: detail || "Student" };
  if (!check.ok) {
    return { allowed: false, code: check.code, message: check.message, direction: null, kind: "OUTPASS", subjectId: row.id, person };
  }
  const late = check.direction === "ENTRY" && now > row.returnBy;
  return {
    allowed: true,
    code: late ? "LATE_RETURN" : "VALID",
    message:
      check.direction === "EXIT"
        ? `Allow exit · ${row.destination}`
        : late
          ? "Allow entry · returning late"
          : "Allow entry · returning on time",
    direction: check.direction,
    kind: "OUTPASS",
    subjectId: row.id,
    person,
  };
}

export async function gateRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /** Verifies a scanned code. Read-only: the guard confirms with POST /gate/events. */
  app.post("/gate/scan", async (request) => {
    requireRole(request, "GUARD", "ADMIN");
    const { token } = gateScanSchema.parse(request.body);
    const now = new Date();

    const verified = verifyQrToken(token, env.QR_SECRET, { OUTPASS: env.QR_TTL_SECONDS, VISIT: VISIT_QR_TTL_SECONDS }, now);
    if (!verified.ok) {
      return denied(verified.code, TOKEN_MESSAGES[verified.code] ?? "Invalid pass");
    }

    const { sub, kind } = verified.payload;
    if (kind === "OUTPASS") {
      const row = await prisma.outpass.findUnique({ where: { id: sub }, include: outpassInclude });
      if (!row) return denied("NOT_FOUND", "This pass does not exist");
      return outpassVerdict(row, now);
    }

    const visit = await prisma.visit.findUnique({ where: { id: sub }, include: { host: true } });
    if (!visit) return denied("NOT_FOUND", "This visit does not exist");
    const check = checkVisitAtGate({
      status: visit.status,
      validFrom: visit.validFrom,
      validTo: visit.validTo,
      now,
    });
    const person = { name: visit.visitorName, detail: `Visiting ${visit.host.name} · ${visit.purpose}` };
    if (!check.ok) {
      return { allowed: false, code: check.code, message: check.message, direction: null, kind: "VISIT", subjectId: visit.id, person } satisfies GateVerdict;
    }
    return {
      allowed: true,
      code: "VALID",
      message: check.direction === "ENTRY" ? "Allow entry · visitor" : "Visitor leaving",
      direction: check.direction,
      kind: "VISIT",
      subjectId: visit.id,
      person,
    } satisfies GateVerdict;
  });

  /** For a student without their phone: look up their active pass by roll number. */
  app.get("/gate/lookup", async (request) => {
    requireRole(request, "GUARD", "ADMIN");
    const { rollNo } = z.object({ rollNo: z.string().trim().min(1).max(40) }).parse(request.query);
    const profile = await prisma.studentProfile.findUnique({ where: { rollNo } });
    if (!profile) return denied("NOT_FOUND", "No student with this roll number");
    const row = await prisma.outpass.findFirst({
      where: { studentId: profile.userId, status: { in: ["APPROVED", "OUT"] } },
      include: outpassInclude,
      orderBy: { createdAt: "desc" },
    });
    if (!row) return denied("NO_ACTIVE_PASS", "This student has no approved outpass");
    return outpassVerdict(row, new Date());
  });

  /** Records a movement. Idempotent on eventId so the offline queue can retry. */
  app.post("/gate/events", async (request, reply) => {
    requireRole(request, "GUARD", "ADMIN");
    const body = gateEventInputSchema.parse(request.body);
    const guardId = request.user.sub;

    const existing = await prisma.gateEvent.findUnique({ where: { id: body.eventId } });
    if (existing) return reply.status(200).send(toGateEventDto(existing));

    const now = new Date();
    const base = {
      id: body.eventId,
      direction: body.direction,
      gate: body.gate,
      method: body.method,
      guardId,
      note: body.note ?? null,
      deviceTime: body.deviceTime ? new Date(body.deviceTime) : null,
    };

    if (body.outpassId) {
      const row = await prisma.outpass.findUnique({
        where: { id: body.outpassId },
        include: outpassInclude,
      });
      if (!row) throw new HttpError(404, "NOT_FOUND", "Outpass not found");

      if (!body.photoMatched) {
        const event = await prisma.gateEvent.create({
          data: { ...base, accepted: false, personName: row.student.name, outpassId: row.id, note: body.note ?? "Photo did not match" },
        });
        return reply.status(201).send(toGateEventDto(event));
      }

      const check = checkOutpassAtGate({ status: row.status, leaveAt: row.leaveAt, returnBy: row.returnBy, now });
      if (!check.ok) throw new FlowError(check.code, check.message);
      if (check.direction !== body.direction) {
        throw new FlowError("WRONG_DIRECTION", `This pass expects an ${check.direction.toLowerCase()} scan`);
      }

      const event = await prisma.$transaction(async (tx) => {
        const changed = await tx.outpass.updateMany({
          where: { id: row.id, status: row.status },
          data:
            check.direction === "EXIT"
              ? { status: "OUT", exitedAt: now }
              : { status: "RETURNED", returnedAt: now },
        });
        if (changed.count === 0) throw new FlowError("CONFLICT", "This pass was just scanned");
        return tx.gateEvent.create({
          data: { ...base, accepted: true, personName: row.student.name, outpassId: row.id },
        });
      });
      return reply.status(201).send(toGateEventDto(event));
    }

    const visit = await prisma.visit.findUnique({ where: { id: body.visitId! } });
    if (!visit) throw new HttpError(404, "NOT_FOUND", "Visit not found");

    if (!body.photoMatched) {
      const event = await prisma.gateEvent.create({
        data: { ...base, accepted: false, personName: visit.visitorName, visitId: visit.id, note: body.note ?? "Photo did not match" },
      });
      return reply.status(201).send(toGateEventDto(event));
    }

    const check = checkVisitAtGate({ status: visit.status, validFrom: visit.validFrom, validTo: visit.validTo, now });
    if (!check.ok) throw new FlowError(check.code, check.message);
    if (check.direction !== body.direction) {
      throw new FlowError("WRONG_DIRECTION", `This visit expects an ${check.direction.toLowerCase()} scan`);
    }

    const event = await prisma.$transaction(async (tx) => {
      const changed = await tx.visit.updateMany({
        where: { id: visit.id, status: visit.status },
        data:
          check.direction === "ENTRY"
            ? { status: "CHECKED_IN", checkedInAt: now }
            : { status: "CHECKED_OUT", checkedOutAt: now },
      });
      if (changed.count === 0) throw new FlowError("CONFLICT", "This visit was just scanned");
      return tx.gateEvent.create({
        data: { ...base, accepted: true, personName: visit.visitorName, visitId: visit.id },
      });
    });
    return reply.status(201).send(toGateEventDto(event));
  });

  app.get("/gate/events", async (request) => {
    requireRole(request, "GUARD", "WARDEN", "ADMIN");
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(200).default(30) })
      .parse(request.query);
    const events = await prisma.gateEvent.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    return { events: events.map(toGateEventDto) };
  });
}
