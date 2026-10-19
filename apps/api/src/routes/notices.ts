import type { NoticeAudience, Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createNoticeSchema, idParamSchema, type NoticeDto } from "@outpassed/shared";
import { notifyLater } from "../lib/notify";
import { hostelsOfViewer, wardenScope } from "../lib/hostels";
import { prisma } from "../lib/prisma";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";

const STAFF = new Set(["WARDEN", "ADMIN", "GUARD"]);

function audiencesFor(role: string): NoticeAudience[] | null {
  if (role === "STUDENT") return ["STUDENTS", "EVERYONE"];
  if (role === "PARENT") return ["PARENTS", "EVERYONE"];
  return null; // staff see every notice
}

/** Students and/or parents who should get a notice, limited to one hostel when set. */
function recipientsWhere(audience: NoticeAudience, hostelId: string | null): Prisma.UserWhereInput {
  const students: Prisma.UserWhereInput = { role: "STUDENT", ...(hostelId ? { student: { hostelId } } : {}) };
  const parents: Prisma.UserWhereInput = {
    role: "PARENT",
    ...(hostelId ? { wards: { some: { student: { student: { hostelId } } } } } : {}),
  };
  if (audience === "STUDENTS") return students;
  if (audience === "PARENTS") return parents;
  return { OR: [students, parents] };
}

async function visible(request: FastifyRequest): Promise<Prisma.NoticeWhereInput> {
  const { role, sub } = request.user;
  const a = audiencesFor(role);
  if (a) {
    const hostels = await hostelsOfViewer(sub, role);
    return { audience: { in: a }, OR: [{ hostelId: null }, { hostelId: { in: hostels } }] };
  }
  const scope = await wardenScope(sub, role);
  return scope ? { OR: [{ hostelId: null }, { hostelId: { in: scope } }] } : {};
}

/** Hostel notice board. Wardens post; students and parents get an alert and the warden sees who's read it. */
export async function noticeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.get("/notices", async (request) => {
    const userId = request.user.sub;
    const staff = STAFF.has(request.user.role);
    const rows = await prisma.notice.findMany({
      where: await visible(request),
      include: { author: true, hostel: true, reads: { where: { userId }, select: { userId: true } }, _count: { select: { reads: true } } },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 50,
    });
    // How many people each notice reached, counted once per audience and hostel.
    const totals = new Map<string, number>();
    if (staff) {
      for (const n of rows) {
        const key = `${n.audience}:${n.hostelId ?? ""}`;
        if (!totals.has(key)) totals.set(key, await prisma.user.count({ where: recipientsWhere(n.audience, n.hostelId) }));
      }
    }
    const notices: NoticeDto[] = rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      audience: n.audience,
      pinned: n.pinned,
      hostelName: n.hostel?.name ?? null,
      authorName: n.author.name,
      read: n.reads.length > 0,
      receipts: staff ? { read: n._count.reads, total: totals.get(`${n.audience}:${n.hostelId ?? ""}`) ?? 0 } : null,
      createdAt: n.createdAt.toISOString(),
    }));
    return { notices, unread: staff ? 0 : notices.filter((n) => !n.read).length };
  });

  app.post("/notices", async (request, reply) => {
    requireRole(request, "WARDEN", "ADMIN");
    const body = createNoticeSchema.parse(request.body);
    const scope = await wardenScope(request.user.sub, request.user.role);
    let hostelId = body.hostelId ?? null;
    if (hostelId && !(await prisma.hostel.findUnique({ where: { id: hostelId } }))) {
      throw new HttpError(404, "HOSTEL_NOT_FOUND", "Hostel not found");
    }
    if (scope) {
      if (hostelId && !scope.includes(hostelId)) throw new HttpError(403, "FORBIDDEN", "You can only post to your own hostels");
      if (!hostelId) {
        if (scope.length > 1) throw new HttpError(400, "PICK_HOSTEL", "Pick which hostel this notice is for");
        hostelId = scope[0]!;
      }
    }
    const row = await prisma.notice.create({ data: { ...body, hostelId, authorId: request.user.sub } });
    const recipients = await prisma.user.findMany({ where: recipientsWhere(row.audience, row.hostelId), select: { id: true } });
    notifyLater(recipients.map((r) => r.id), {
      kind: "NOTICE_POSTED",
      title: `Notice: ${row.title}`,
      body: row.body.length > 140 ? `${row.body.slice(0, 137)}…` : row.body,
      data: { noticeId: row.id },
    });
    return reply.status(201).send({ id: row.id });
  });

  app.post("/notices/:id/read", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const notice = await prisma.notice.findFirst({ where: { ...(await visible(request)), id } });
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
