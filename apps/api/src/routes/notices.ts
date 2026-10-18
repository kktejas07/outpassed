import type { NoticeAudience, Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createNoticeSchema, idParamSchema, type NoticeDto } from "@outpassed/shared";
import { idsOfRoles, notifyLater } from "../lib/notify";
import { prisma } from "../lib/prisma";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";

const STAFF = new Set(["WARDEN", "ADMIN", "GUARD"]);

function audiencesFor(role: string): NoticeAudience[] | null {
  if (role === "STUDENT") return ["STUDENTS", "EVERYONE"];
  if (role === "PARENT") return ["PARENTS", "EVERYONE"];
  return null; // staff see every notice
}

function rolesFor(audience: NoticeAudience): ("STUDENT" | "PARENT")[] {
  return audience === "STUDENTS" ? ["STUDENT"] : audience === "PARENTS" ? ["PARENT"] : ["STUDENT", "PARENT"];
}

function visible(request: FastifyRequest): Prisma.NoticeWhereInput {
  const a = audiencesFor(request.user.role);
  return a ? { audience: { in: a } } : {};
}

/** Hostel notice board. Wardens post; students and parents get an alert and the warden sees who's read it. */
export async function noticeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.get("/notices", async (request) => {
    const userId = request.user.sub;
    const staff = STAFF.has(request.user.role);
    const rows = await prisma.notice.findMany({
      where: visible(request),
      include: { author: true, reads: { where: { userId }, select: { userId: true } }, _count: { select: { reads: true } } },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 50,
    });
    const totals = staff
      ? {
          STUDENTS: await prisma.user.count({ where: { role: "STUDENT" } }),
          PARENTS: await prisma.user.count({ where: { role: "PARENT" } }),
        }
      : null;
    const notices: NoticeDto[] = rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      audience: n.audience,
      pinned: n.pinned,
      authorName: n.author.name,
      read: n.reads.length > 0,
      receipts: totals
        ? { read: n._count.reads, total: n.audience === "EVERYONE" ? totals.STUDENTS + totals.PARENTS : totals[n.audience] }
        : null,
      createdAt: n.createdAt.toISOString(),
    }));
    return { notices, unread: staff ? 0 : notices.filter((n) => !n.read).length };
  });

  app.post("/notices", async (request, reply) => {
    requireRole(request, "WARDEN", "ADMIN");
    const body = createNoticeSchema.parse(request.body);
    const row = await prisma.notice.create({ data: { ...body, authorId: request.user.sub } });
    notifyLater(await idsOfRoles(rolesFor(row.audience)), {
      kind: "NOTICE_POSTED",
      title: `Notice: ${row.title}`,
      body: row.body.length > 140 ? `${row.body.slice(0, 137)}…` : row.body,
      data: { noticeId: row.id },
    });
    return reply.status(201).send({ id: row.id });
  });

  app.post("/notices/:id/read", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const notice = await prisma.notice.findFirst({ where: { ...visible(request), id } });
    if (!notice) throw new HttpError(404, "NOT_FOUND", "Notice not found");
    if (!STAFF.has(request.user.role)) {
      await prisma.noticeRead.upsert({
        where: { noticeId_userId: { noticeId: id, userId: request.user.sub } },
        create: { noticeId: id, userId: request.user.sub },
        update: {},
      });
    }
    return reply.status(204).send();
  });

  app.delete("/notices/:id", async (request, reply) => {
    requireRole(request, "WARDEN", "ADMIN");
    const { id } = idParamSchema.parse(request.params);
    const row = await prisma.notice.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "NOT_FOUND", "Notice not found");
    if (row.authorId !== request.user.sub && request.user.role !== "ADMIN") {
      throw new HttpError(403, "FORBIDDEN", "Only the author or an admin can remove this notice");
    }
    await prisma.notice.delete({ where: { id } });
    return reply.status(204).send();
  });
}
