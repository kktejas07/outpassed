import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createStaffSchema, importSchema, linkGuardianSchema, roleSchema, type GuardianshipDto } from "@outpassed/shared";
import { importStudents } from "../lib/importStudents";
import { phoneFields } from "../lib/phone";
import { prisma } from "../lib/prisma";
import { toUserDto } from "../lib/dto";
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
      },
      include: { student: true },
    });
    return reply.status(201).send({ user: toUserDto(user) });
  });

  app.get("/admin/users", async (request) => {
    const { role } = z.object({ role: roleSchema.optional() }).parse(request.query);
    const users = await prisma.user.findMany({
      where: role ? { role } : {},
      include: { student: true, photo: { select: { updatedAt: true } } },
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
  app.post("/admin/import/students", { bodyLimit: 3 * 1024 * 1024 }, async (request) => {
    const body = importSchema.parse(request.body);
    try {
      return await importStudents(body.csv, { dryRun: body.dryRun, sendWelcome: body.sendWelcome });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "MISSING_COLUMNS" || code === "TOO_MANY_ROWS") throw new HttpError(400, code, (err as Error).message);
      throw err;
    }
  });
}
