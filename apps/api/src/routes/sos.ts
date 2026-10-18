import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { idParamSchema, raiseSosSchema, resolveSosSchema, type SosDto } from "@outpassed/shared";
import { FlowError } from "../domain/outpassFlow";
import { idsOfRoles, notifyLater } from "../lib/notify";
import { prisma } from "../lib/prisma";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";

const sosInclude = {
  raisedBy: { include: { student: true } },
  acknowledgedBy: true,
  resolvedBy: true,
} satisfies Prisma.SosAlertInclude;
type SosRow = Prisma.SosAlertGetPayload<{ include: typeof sosInclude }>;

const KIND_LABEL = { MEDICAL: "Medical", SAFETY: "Safety", OTHER: "Help needed" } as const;
const STAFF = ["WARDEN", "GUARD", "ADMIN"] as const;

function toSosDto(row: SosRow): SosDto {
  return {
    id: row.id,
    kind: row.kind,
    note: row.note,
    status: row.status,
    raisedBy: {
      id: row.raisedBy.id,
      name: row.raisedBy.name,
      phone: row.raisedBy.phone,
      rollNo: row.raisedBy.student?.rollNo ?? null,
      hostel: row.raisedBy.student?.hostel ?? null,
      room: row.raisedBy.student?.room ?? null,
    },
    acknowledgedByName: row.acknowledgedBy?.name ?? null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedByName: row.resolvedBy?.name ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolution: row.resolution,
    createdAt: row.createdAt.toISOString(),
  };
}

function where(row: SosRow) {
  const p = row.raisedBy.student;
  return [p?.hostel, p?.room ? `Room ${p.room}` : null].filter(Boolean).join(", ");
}

/** Emergencies: raised by anyone, alerting every warden, guard and admin at once. */
export async function sosRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.post("/sos", async (request, reply) => {
    const body = raiseSosSchema.parse(request.body);
    // One open alert per person: pressing again returns the same alert.
    const open = await prisma.sosAlert.findFirst({
      where: { raisedById: request.user.sub, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      include: sosInclude,
    });
    if (open) return reply.status(200).send(toSosDto(open));
    const row = await prisma.sosAlert.create({
      data: { raisedById: request.user.sub, kind: body.kind, note: body.note ?? null },
      include: sosInclude,
    });
    const place = where(row);
    notifyLater((await idsOfRoles([...STAFF])).filter((id) => id !== row.raisedById), {
      kind: "SOS_RAISED",
      title: `SOS · ${KIND_LABEL[row.kind]} · ${row.raisedBy.name}`,
      body: [place, row.note, row.raisedBy.phone ? `Call ${row.raisedBy.phone}` : null].filter(Boolean).join(" · ") || "Open Outpass to respond.",
      data: { sosId: row.id },
    });
    return reply.status(201).send(toSosDto(row));
  });

  app.get("/sos", async (request) => {
    const staff = (STAFF as readonly string[]).includes(request.user.role);
    const since = new Date(Date.now() - 24 * 3_600_000);
    const rows = await prisma.sosAlert.findMany({
      where: staff
        ? { OR: [{ status: { in: ["OPEN", "ACKNOWLEDGED"] } }, { createdAt: { gte: since } }] }
        : { raisedById: request.user.sub },
      include: sosInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { alerts: rows.map(toSosDto) };
  });

  app.post("/sos/:id/acknowledge", async (request) => {
    requireRole(request, ...STAFF);
    const { id } = idParamSchema.parse(request.params);
    const changed = await prisma.sosAlert.updateMany({
      where: { id, status: "OPEN" },
      data: { status: "ACKNOWLEDGED", acknowledgedById: request.user.sub, acknowledgedAt: new Date() },
    });
    const row = await prisma.sosAlert.findUnique({ where: { id }, include: sosInclude });
    if (!row) throw new HttpError(404, "NOT_FOUND", "Alert not found");
    if (changed.count === 0) return toSosDto(row); // someone else already responded
    notifyLater([row.raisedById], {
      kind: "SOS_ACKNOWLEDGED",
      title: "Help is on the way",
      body: `${row.acknowledgedBy?.name ?? "Staff"} has seen your alert and is responding.`,
      data: { sosId: id },
    });
    notifyLater((await idsOfRoles([...STAFF])).filter((u) => u !== request.user.sub), {
      kind: "SOS_ACKNOWLEDGED",
      title: `${row.acknowledgedBy?.name ?? "Staff"} is responding to ${row.raisedBy.name}`,
      body: `${KIND_LABEL[row.kind]} alert${where(row) ? ` · ${where(row)}` : ""}.`,
      data: { sosId: id },
    });
    return toSosDto(row);
  });

  /** Staff close an alert once handled; the person who raised it can cancel it. */
  app.post("/sos/:id/resolve", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { resolution } = resolveSosSchema.parse(request.body ?? {});
    const row = await prisma.sosAlert.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "NOT_FOUND", "Alert not found");
    const staff = (STAFF as readonly string[]).includes(request.user.role);
    if (!staff && row.raisedById !== request.user.sub) throw new HttpError(403, "FORBIDDEN", "You can't close this alert");
    const changed = await prisma.sosAlert.updateMany({
      where: { id, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      data: {
        status: "RESOLVED",
        resolvedById: request.user.sub,
        resolvedAt: new Date(),
        resolution: resolution ?? (staff ? null : "Cancelled by the person who raised it"),
      },
    });
    if (changed.count === 0) throw new FlowError("ALREADY_RESOLVED", "This alert is already closed");
    const updated = await prisma.sosAlert.findUniqueOrThrow({ where: { id }, include: sosInclude });
    const recipients = staff ? [updated.raisedById] : (await idsOfRoles([...STAFF]));
    notifyLater(recipients.filter((u) => u !== request.user.sub), {
      kind: "SOS_RESOLVED",
      title: staff ? "Your alert is closed" : `${updated.raisedBy.name} cancelled their alert`,
      body: updated.resolution ?? `${updated.resolvedBy?.name ?? "Staff"} marked it handled.`,
      data: { sosId: id },
    });
    return toSosDto(updated);
  });
}
