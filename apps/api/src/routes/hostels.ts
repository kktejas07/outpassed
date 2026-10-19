import type { FastifyInstance } from "fastify";
import { assignWardenSchema, hostelNameSchema, idParamSchema, type HostelDto } from "@outpassed/shared";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";
import { audit } from "../lib/audit";

const hostelInclude = {
  wardens: { include: { user: { select: { id: true, name: true } } } },
  _count: { select: { students: true } },
} as const;

async function hostelDto(id: string): Promise<HostelDto> {
  const h = await prisma.hostel.findUniqueOrThrow({ where: { id }, include: hostelInclude });
  return { id: h.id, name: h.name, students: h._count.students, wardens: h.wardens.map((w) => w.user) };
}

/** Hostels on campus, and which wardens look after each one. */
export async function hostelRoutes(app: FastifyInstance): Promise<void> {
  /** Public: the register screen lists hostels to pick from. */
  app.get("/hostels", async () => {
    const rows = await prisma.hostel.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
    return { hostels: rows };
  });

  app.get("/admin/hostels", { onRequest: [app.authenticate] }, async (request) => {
    requireRole(request, "ADMIN", "WARDEN");
    const rows = await prisma.hostel.findMany({ orderBy: { name: "asc" }, include: hostelInclude });
    const hostels: HostelDto[] = rows.map((h) => ({ id: h.id, name: h.name, students: h._count.students, wardens: h.wardens.map((w) => w.user) }));
    return { hostels };
  });

  app.post("/admin/hostels", { onRequest: [app.authenticate] }, async (request, reply) => {
    requireRole(request, "ADMIN");
    const { name } = hostelNameSchema.parse(request.body);
    const clash = await prisma.hostel.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (clash) throw new HttpError(409, "HOSTEL_EXISTS", "A hostel with this name already exists");
    const row = await prisma.hostel.create({ data: { name } });
    await audit(request, "HOSTEL_CREATED", `Added hostel ${name}`, { type: "hostel", id: row.id });
    return reply.status(201).send(await hostelDto(row.id));
  });

  /** Renames a hostel and the hostel name shown on its students' profiles. */
  app.patch("/admin/hostels/:id", { onRequest: [app.authenticate] }, async (request) => {
    requireRole(request, "ADMIN");
    const { id } = idParamSchema.parse(request.params);
    const { name } = hostelNameSchema.parse(request.body);
    const clash = await prisma.hostel.findFirst({ where: { name: { equals: name, mode: "insensitive" }, NOT: { id } } });
    if (clash) throw new HttpError(409, "HOSTEL_EXISTS", "A hostel with this name already exists");
    const found = await prisma.hostel.findUnique({ where: { id } });
    if (!found) throw new HttpError(404, "NOT_FOUND", "Hostel not found");
    await prisma.$transaction([
      prisma.hostel.update({ where: { id }, data: { name } }),
      prisma.studentProfile.updateMany({ where: { hostelId: id }, data: { hostel: name } }),
    ]);
    await audit(request, "HOSTEL_RENAMED", `Renamed hostel ${found.name} to ${name}`, { type: "hostel", id });
    return hostelDto(id);
  });

  app.post("/admin/hostels/:id/wardens", { onRequest: [app.authenticate] }, async (request) => {
    requireRole(request, "ADMIN");
    const { id } = idParamSchema.parse(request.params);
    const { userId } = assignWardenSchema.parse(request.body);
    const [hostel, warden] = await Promise.all([
      prisma.hostel.findUnique({ where: { id } }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);
    if (!hostel) throw new HttpError(404, "NOT_FOUND", "Hostel not found");
    if (!warden || warden.role !== "WARDEN") throw new HttpError(404, "WARDEN_NOT_FOUND", "Warden not found");
    await prisma.wardenHostel.upsert({ where: { userId_hostelId: { userId, hostelId: id } }, create: { userId, hostelId: id }, update: {} });
    await audit(request, "WARDEN_ASSIGNED", `Assigned ${warden.name} to ${hostel.name}`, { type: "hostel", id });
    return hostelDto(id);
  });

  app.delete("/admin/hostels/:id/wardens/:userId", { onRequest: [app.authenticate] }, async (request) => {
    requireRole(request, "ADMIN");
    const { id, userId } = z.object({ id: z.uuid(), userId: z.uuid() }).parse(request.params);
    const removed = await prisma.wardenHostel.deleteMany({ where: { hostelId: id, userId } });
    if (removed.count) await audit(request, "WARDEN_UNASSIGNED", `Removed a warden from a hostel`, { type: "hostel", id }, { userId });
    return hostelDto(id);
  });
}
