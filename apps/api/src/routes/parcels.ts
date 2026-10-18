import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { collectParcelSchema, idParamSchema, logParcelSchema, type ParcelDto } from "@outpassed/shared";
import { FlowError } from "../domain/outpassFlow";
import { notifyLater } from "../lib/notify";
import { prisma } from "../lib/prisma";
import { clock } from "../lib/time";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";

const parcelInclude = { student: { include: { student: true } }, loggedBy: true } satisfies Prisma.ParcelInclude;
type ParcelRow = Prisma.ParcelGetPayload<{ include: typeof parcelInclude }>;

function toParcelDto(row: ParcelRow, showCode: boolean): ParcelDto {
  return {
    id: row.id,
    carrier: row.carrier,
    note: row.note,
    status: row.status,
    code: showCode ? row.code : null,
    student: {
      id: row.student.id,
      name: row.student.name,
      rollNo: row.student.student?.rollNo ?? null,
      hostel: row.student.student?.hostel ?? null,
      room: row.student.student?.room ?? null,
    },
    loggedByName: row.loggedBy.name,
    collectedAt: row.collectedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Deliveries left at the gate. The guard logs a parcel against the
 * student's roll number; the student is alerted with a 4-digit code and
 * shows it to collect.
 */
export async function parcelRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.post("/parcels", async (request, reply) => {
    requireRole(request, "GUARD", "ADMIN");
    const body = logParcelSchema.parse(request.body);
    const profile = await prisma.studentProfile.findUnique({ where: { rollNo: body.rollNo } });
    if (!profile) throw new HttpError(404, "STUDENT_NOT_FOUND", "No student with this roll number");
    const row = await prisma.parcel.create({
      data: {
        studentId: profile.userId,
        carrier: body.carrier,
        note: body.note ?? null,
        code: String(randomInt(0, 10_000)).padStart(4, "0"),
        loggedById: request.user.sub,
      },
      include: parcelInclude,
    });
    notifyLater([row.studentId], {
      kind: "PARCEL_AT_GATE",
      title: `Parcel from ${row.carrier} at the gate`,
      body: `Arrived at ${clock(row.createdAt)}. Collect it with code ${row.code}.`,
      data: { parcelId: row.id },
    });
    return reply.status(201).send(toParcelDto(row, false));
  });

  app.get("/parcels", async (request) => {
    const { scope } = z.object({ scope: z.enum(["waiting", "recent"]).default("waiting") }).parse(request.query);
    const isStudent = request.user.role === "STUDENT";
    if (!isStudent) requireRole(request, "GUARD", "WARDEN", "ADMIN");
    const where: Prisma.ParcelWhereInput = isStudent ? { studentId: request.user.sub } : {};
    if (scope === "waiting") where.status = "AT_GATE";
    const rows = await prisma.parcel.findMany({ where, include: parcelInclude, orderBy: { createdAt: "desc" }, take: 100 });
    return { parcels: rows.map((r) => toParcelDto(r, isStudent)) };
  });

  /** Hand over at the gate; the student's code must match. */
  app.post("/parcels/:id/collect", async (request) => {
    requireRole(request, "GUARD", "ADMIN");
    const { id } = idParamSchema.parse(request.params);
    const { code } = collectParcelSchema.parse(request.body);
    const row = await prisma.parcel.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "NOT_FOUND", "Parcel not found");
    if (row.status !== "AT_GATE") throw new FlowError("ALREADY_COLLECTED", "This parcel has already been handed over");
    if (row.code !== code) throw new HttpError(400, "WRONG_CODE", "That code doesn't match. Ask the student to check the code in their app.");
    const changed = await prisma.parcel.updateMany({
      where: { id, status: "AT_GATE" },
      data: { status: "COLLECTED", collectedAt: new Date(), handedById: request.user.sub },
    });
    if (changed.count === 0) throw new FlowError("CONFLICT", "This parcel was just handed over");
    const updated = await prisma.parcel.findUniqueOrThrow({ where: { id }, include: parcelInclude });
    notifyLater([updated.studentId], {
      kind: "PARCEL_COLLECTED",
      title: "Parcel collected",
      body: `Your ${updated.carrier} parcel was handed over at ${clock(updated.collectedAt!)}.`,
      data: { parcelId: id },
    });
    return toParcelDto(updated, false);
  });
}
