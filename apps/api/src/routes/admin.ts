import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createStaffSchema, idParamSchema, importSchema, linkGuardianSchema, roleSchema, type GuardianshipDto } from "@outpassed/shared";
import { importStudents } from "../lib/importStudents";
import { phoneFields } from "../lib/phone";
import { audit } from "../lib/audit";
import { prisma } from "../lib/prisma";
import { toUserDto, userInclude } from "../lib/dto";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);
  app.addHook("preHandler", async (request) => requireRole(request, "ADMIN"));

  /** Staff accounts (warden, guard, admin) are created by an admin, never self-registered. */
  app.post("/admin/users", async (request, reply) => {
    const body = createStaffSchema.parse(request.body);
    const email = body.email.toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new HttpError(409, "EMAIL_TAKEN", "Email is already registered");
    }
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await argon2.hash(body.password, { type: argon2.argon2id }),
        name: body.name,
        ...phoneFields(body.phone),
        role: body.role,
        departmentId: body.role === "FACULTY" ? body.departmentId ?? null : null,
      },
      include: { student: true },
    });
    await audit(request, "STAFF_CREATED", `Created ${body.role.toLowerCase()} account for ${user.name}`, { type: "user", id: user.id });
    return reply.status(201).send({ user: toUserDto(user) });
  });

  app.get("/admin/users", async (request) => {
    const { role } = z.object({ role: roleSchema.optional() }).parse(request.query);
    const users = await prisma.user.findMany({
      where: role ? { role } : {},
      include: userInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { users: users.map(toUserDto) };
  });

  /** Links a parent account to a student so the parent can approve their outpasses. */
  app.post("/admin/guardianships", async (request, reply) => {
    const body = linkGuardianSchema.parse(request.body);
    const [student, parent] = await Promise.all([
      prisma.user.findUnique({ where: { id: body.studentId } }),
      prisma.user.findUnique({ where: { email: body.parentEmail.toLowerCase() } }),
    ]);
    if (!student || student.role !== "STUDENT") {
      throw new HttpError(404, "STUDENT_NOT_FOUND", "Student not found");
    }
    if (!parent || parent.role !== "PARENT") {
      throw new HttpError(404, "PARENT_NOT_FOUND", "No parent account with this email");
    }
    const row = await prisma.guardianship.upsert({
      where: { studentId_parentId: { studentId: student.id, parentId: parent.id } },
      create: { studentId: student.id, parentId: parent.id, relation: body.relation, priority: body.priority },
      update: { relation: body.relation, priority: body.priority },
    });
    await audit(request, "GUARDIAN_LINKED", `Linked ${parent.name} (${body.relation}) to ${student.name}`, { type: "user", id: student.id });
    const dto: GuardianshipDto = {
      id: row.id,
      studentId: row.studentId,
      parentId: row.parentId,
      relation: row.relation,
      priority: row.priority,
    };
    return reply.status(201).send(dto);
  });

  /** Bulk-adds students and parents from a CSV. Preview with dryRun first. */
  /** Hosteller or day scholar. Making someone a day scholar clears their hostel and room. */
  app.put("/admin/users/:id/residence", async (request) => {
    requireRole(request, "ADMIN");
    const { id } = idParamSchema.parse(request.params);
    const body = z.object({ residence: z.enum(["HOSTELLER", "DAY_SCHOLAR"]), hostelId: z.uuid().optional(), room: z.string().trim().max(20).optional() }).parse(request.body);
    const profile = await prisma.studentProfile.findUnique({ where: { userId: id }, include: { user: { select: { name: true } } } });
    if (!profile) throw new HttpError(404, "NOT_FOUND", "Student not found");
    const hostel = body.hostelId ? await prisma.hostel.findUnique({ where: { id: body.hostelId } }) : null;
    if (body.hostelId && !hostel) throw new HttpError(404, "HOSTEL_NOT_FOUND", "Hostel not found");
    await prisma.studentProfile.update({
      where: { userId: id },
      data:
        body.residence === "DAY_SCHOLAR"
          ? { residence: "DAY_SCHOLAR", hostel: null, hostelId: null, room: null }
          : { residence: "HOSTELLER", ...(hostel ? { hostel: hostel.name, hostelId: hostel.id } : {}), ...(body.room ? { room: body.room } : {}) },
    });
    await audit(request, "RESIDENCE_CHANGED", `${profile.user.name} is now a ${body.residence === "DAY_SCHOLAR" ? "day scholar" : `hosteller${hostel ? ` in ${hostel.name}` : ""}`}`, { type: "user", id });
    const user = await prisma.user.findUniqueOrThrow({ where: { id }, include: userInclude });
    return toUserDto(user);
  });

  app.post("/admin/import/students", { bodyLimit: 3 * 1024 * 1024 }, async (request) => {
    const body = importSchema.parse(request.body);
    try {
      const result = await importStudents(body.csv, { dryRun: body.dryRun, sendWelcome: body.sendWelcome });
      if (!body.dryRun) {
        const s = result.summary;
        await audit(request, "STUDENTS_IMPORTED", `Imported students: ${s.created} added, ${s.updated} updated, ${s.parentsCreated} parents added, ${s.errors} rows skipped`, undefined, s);
      }
      return result;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "MISSING_COLUMNS" || code === "TOO_MANY_ROWS") throw new HttpError(400, code, (err as Error).message);
      throw err;
    }
  });

  /** Who did what, newest first. */
  app.get("/admin/audit", async (request) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        before: z.iso.datetime().optional(),
        targetType: z.string().max(40).optional(),
        targetId: z.string().max(80).optional(),
      })
      .parse(request.query);
    const rows = await prisma.auditLog.findMany({
      where: {
        ...(q.before ? { createdAt: { lt: new Date(q.before) } } : {}),
        ...(q.targetType ? { targetType: q.targetType } : {}),
        ...(q.targetId ? { targetId: q.targetId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: q.limit,
    });
    return {
      entries: rows.map((r) => ({
        id: r.id,
        actorName: r.actorName,
        actorRole: r.actorRole,
        action: r.action,
        summary: r.summary,
        targetType: r.targetType,
        targetId: r.targetId,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });
}
