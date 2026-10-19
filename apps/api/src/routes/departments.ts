import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idParamSchema } from "@outpassed/shared";
import { audit } from "../lib/audit";
import { prisma } from "../lib/prisma";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";

const deptBody = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().max(12).optional(),
});

/** Departments, their HODs and faculty. Students pick who gave them permission from here. */
export async function departmentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.get("/departments", async () => {
    const rows = await prisma.department.findMany({
      orderBy: { name: "asc" },
      include: { hod: { select: { id: true, name: true } }, _count: { select: { faculty: true, students: true } } },
    });
    return {
      departments: rows.map((d) => ({ id: d.id, name: d.name, code: d.code, hod: d.hod, faculty: d._count.faculty, students: d._count.students })),
    };
  });

  /** Faculty and HODs a student can name as having given permission. Their own department first. */
  app.get("/faculty", async (request) => {
    const { q } = z.object({ q: z.string().trim().max(80).optional() }).parse(request.query);
    const me = await prisma.studentProfile.findUnique({ where: { userId: request.user.sub }, select: { departmentId: true } });
    const rows = await prisma.user.findMany({
      where: { role: "FACULTY", ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) },
      include: { department: true, headOf: { select: { id: true } } },
      orderBy: { name: "asc" },
      take: 200,
    });
    const faculty = rows
      .map((f) => ({
        id: f.id,
        name: f.name,
        department: f.department?.name ?? null,
        isHod: f.headOf.length > 0,
        mine: !!me?.departmentId && f.departmentId === me.departmentId,
      }))
      .sort((a, b) => Number(b.mine) - Number(a.mine) || Number(b.isHod) - Number(a.isHod) || a.name.localeCompare(b.name));
    return { faculty };
  });

  app.post("/admin/departments", async (request, reply) => {
    requireRole(request, "ADMIN");
    const body = deptBody.parse(request.body);
    if (await prisma.department.findFirst({ where: { name: { equals: body.name, mode: "insensitive" } } })) {
      throw new HttpError(409, "DEPARTMENT_EXISTS", "A department with this name already exists");
    }
    const row = await prisma.department.create({ data: { name: body.name, code: body.code ?? null } });
    await audit(request, "DEPARTMENT_CREATED", `Added department ${row.name}`, { type: "department", id: row.id });
    return reply.status(201).send(row);
  });

  /** Rename, or set the HOD (who must be faculty; they're moved into the department). */
  app.patch("/admin/departments/:id", async (request) => {
    requireRole(request, "ADMIN");
    const { id } = idParamSchema.parse(request.params);
    const body = deptBody.partial().extend({ hodId: z.uuid().nullable().optional() }).parse(request.body);
    const dept = await prisma.department.findUnique({ where: { id } });
    if (!dept) throw new HttpError(404, "NOT_FOUND", "Department not found");
    if (body.hodId) {
      const hod = await prisma.user.findUnique({ where: { id: body.hodId } });
      if (!hod || hod.role !== "FACULTY") throw new HttpError(400, "NOT_FACULTY", "The HOD must have a faculty account");
      await prisma.user.update({ where: { id: hod.id }, data: { departmentId: id } });
    }
    const row = await prisma.department.update({
      where: { id },
      data: { ...(body.name ? { name: body.name } : {}), ...(body.code !== undefined ? { code: body.code } : {}), ...(body.hodId !== undefined ? { hodId: body.hodId } : {}) },
      include: { hod: { select: { id: true, name: true } } },
    });
    await audit(request, "DEPARTMENT_UPDATED", body.hodId ? `Made ${row.hod?.name} HOD of ${row.name}` : `Updated department ${row.name}`, { type: "department", id });
    return row;
  });

  /** Put a faculty member or student in a department. */
  app.put("/admin/users/:id/department", async (request) => {
    requireRole(request, "ADMIN");
    const { id } = idParamSchema.parse(request.params);
    const { departmentId } = z.object({ departmentId: z.uuid().nullable() }).parse(request.body);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");
    if (user.role === "STUDENT") await prisma.studentProfile.update({ where: { userId: id }, data: { departmentId } });
    else if (user.role === "FACULTY") await prisma.user.update({ where: { id }, data: { departmentId } });
    else throw new HttpError(400, "NOT_APPLICABLE", "Only faculty and students belong to a department");
    return { ok: true };
  });
}
