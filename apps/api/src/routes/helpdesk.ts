import type { Prisma, TicketStatus } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { idParamSchema } from "@outpassed/shared";
import { audit } from "../lib/audit";
import { storeImage } from "../lib/blobStore";
import { wardenScope, wardensFor } from "../lib/hostels";
import { idsOfRoles, notifyLater } from "../lib/notify";
import { mediaUrl } from "../lib/photo";
import { prisma } from "../lib/prisma";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";
import { decodePhoto } from "./photos";

export const TICKET_CATEGORIES = ["Water", "Electricity", "Wi-Fi", "Room repair", "Cleaning", "Mess", "Furniture", "Other"] as const;
/** A student can reopen a resolved request for this long. */
const REOPEN_DAYS = 7;

const ticketInclude = {
  student: { select: { id: true, name: true, student: { select: { rollNo: true, room: true } } } },
  hostel: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  _count: { select: { updates: true } },
} satisfies Prisma.TicketInclude;
type TicketRow = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

function toTicketDto(t: TicketRow) {
  return {
    id: t.id,
    number: t.number,
    category: t.category,
    title: t.title,
    details: t.details,
    location: t.location,
    status: t.status,
    photoUrl: t.photoMime ? mediaUrl("ticket", t.id) : null,
    student: { id: t.student.id, name: t.student.name, rollNo: t.student.student?.rollNo ?? null, room: t.student.student?.room ?? null },
    hostel: t.hostel,
    assignedTo: t.assignedTo,
    updates: t._count.updates,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
  };
}

const isStaff = (r: FastifyRequest) => r.user.role === "WARDEN" || r.user.role === "ADMIN";

/** Who may see a request: the student who raised it, wardens of that hostel, admins. */
async function visible(request: FastifyRequest, t: { studentId: string; hostelId: string | null }) {
  if (request.user.role === "ADMIN") return true;
  if (request.user.role === "STUDENT") return t.studentId === request.user.sub;
  if (request.user.role === "WARDEN") {
    const scope = await wardenScope(request.user.sub, "WARDEN");
    return !scope || (!!t.hostelId && scope.includes(t.hostelId));
  }
  return false;
}

const STATUS_WORD: Record<TicketStatus, string> = { OPEN: "reopened", IN_PROGRESS: "being worked on", RESOLVED: "marked fixed", CLOSED: "closed" };

/**
 * Hostel helpdesk: students report a problem (no water, Wi-Fi down, broken
 * fan); the warden picks it up, updates it and marks it fixed; the student
 * confirms or reopens it.
 */
export async function helpdeskRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.get("/tickets", async (request) => {
    requireRole(request, "STUDENT", "WARDEN", "ADMIN");
    const q = z.object({ status: z.enum(["ACTIVE", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "ALL"]).default("ACTIVE") }).parse(request.query);
    const scope = await wardenScope(request.user.sub, request.user.role);
    const base: Prisma.TicketWhereInput =
      request.user.role === "STUDENT" ? { studentId: request.user.sub } : scope ? { hostelId: { in: scope } } : {};
    const statusWhere: Prisma.TicketWhereInput =
      q.status === "ALL" ? {} : q.status === "ACTIVE" ? { status: { in: ["OPEN", "IN_PROGRESS", "RESOLVED"] } } : { status: q.status };
    const [rows, grouped] = await Promise.all([
      prisma.ticket.findMany({ where: { ...base, ...statusWhere }, include: ticketInclude, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 }),
      prisma.ticket.groupBy({ by: ["status"], where: base, _count: true }),
    ]);
    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count])) as Partial<Record<TicketStatus, number>>;
    return { tickets: rows.map(toTicketDto), counts: { OPEN: counts.OPEN ?? 0, IN_PROGRESS: counts.IN_PROGRESS ?? 0, RESOLVED: counts.RESOLVED ?? 0, CLOSED: counts.CLOSED ?? 0 }, categories: TICKET_CATEGORIES };
  });

  app.post("/tickets", { bodyLimit: 1024 * 1024 }, async (request, reply) => {
    requireRole(request, "STUDENT");
    const body = z
      .object({
        category: z.enum(TICKET_CATEGORIES),
        title: z.string().trim().min(3).max(100),
        details: z.string().trim().min(3).max(1500),
        location: z.string().trim().max(80).optional(),
        photo: z.string().min(100).max(700_000).optional(),
      })
      .parse(request.body);
    const profile = await prisma.studentProfile.findUnique({ where: { userId: request.user.sub } });
    if (profile?.residence === "DAY_SCHOLAR") throw new HttpError(403, "HOSTELLERS_ONLY", "The helpdesk is for hostel problems. Day scholars can raise campus issues with the office.");
    const photo = body.photo ? decodePhoto(body.photo) : null;
    const stored = photo ? await storeImage("ticket", photo) : null;
    const t = await prisma.ticket.create({
      data: {
        studentId: request.user.sub,
        hostelId: profile?.hostelId ?? null,
        category: body.category,
        title: body.title,
        details: body.details,
        location: body.location || (profile?.room ? `Room ${profile.room}` : null),
        ...(stored ? { photo: stored.data, photoKey: stored.key, photoMime: photo!.mime } : {}),
      },
      include: ticketInclude,
    });
    const staff = await wardensFor(request.user.sub);
    notifyLater(staff.length ? staff : await idsOfRoles(["ADMIN"]), {
      kind: "TICKET_NEW",
      title: `${t.category}: ${t.title}`,
      body: `#${t.number} from ${t.student.name}${t.location ? ` · ${t.location}` : ""}${t.hostel ? ` · ${t.hostel.name}` : ""}`,
      data: { ticketId: t.id },
    });
    return reply.status(201).send(toTicketDto(t));
  });

  app.get("/tickets/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const t = await prisma.ticket.findUnique({ where: { id }, include: { ...ticketInclude, updates: { include: { author: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: "asc" } } } });
    if (!t || !(await visible(request, t))) throw new HttpError(404, "NOT_FOUND", "Request not found");
    const reopenUntil = t.status === "RESOLVED" && t.resolvedAt ? new Date(t.resolvedAt.getTime() + REOPEN_DAYS * 86_400_000) : null;
    return {
      ...toTicketDto(t),
      canReopen: request.user.role === "STUDENT" && !!reopenUntil && reopenUntil > new Date(),
      history: t.updates.map((u) => ({ id: u.id, body: u.body, status: u.status, at: u.createdAt.toISOString(), author: u.author })),
    };
  });

  /**
   * Add a note, and optionally move the request on. Staff: IN_PROGRESS,
   * RESOLVED, CLOSED. The student: CLOSED (it's fixed) or OPEN (reopen a
   * resolved request within a week).
   */
  app.post("/tickets/:id/updates", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = z.object({ body: z.string().trim().max(1000).default(""), status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional() }).parse(request.body);
    const t = await prisma.ticket.findUnique({ where: { id }, include: ticketInclude });
    if (!t || !(await visible(request, t))) throw new HttpError(404, "NOT_FOUND", "Request not found");
    if (!body.body && !body.status) throw new HttpError(400, "EMPTY", "Write a note or change the status");
    if (t.status === "CLOSED" && body.status !== "OPEN") throw new HttpError(409, "CLOSED", "This request is closed");

    const staff = isStaff(request);
    if (body.status) {
      const allowed = staff
        ? ["IN_PROGRESS", "RESOLVED", "CLOSED"].includes(body.status)
        : (body.status === "CLOSED" && t.status === "RESOLVED") ||
          (body.status === "OPEN" && t.status === "RESOLVED" && !!t.resolvedAt && Date.now() - t.resolvedAt.getTime() < REOPEN_DAYS * 86_400_000);
      if (!allowed) throw new HttpError(403, "FORBIDDEN", staff ? "Staff can move a request to in progress, fixed or closed" : "You can confirm a fix or reopen it within a week");
      if (body.status === "RESOLVED" && !body.body) throw new HttpError(400, "NOTE_REQUIRED", "Say what was done, so the student knows");
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.ticketUpdate.create({ data: { ticketId: id, authorId: request.user.sub, body: body.body || `Request ${STATUS_WORD[body.status!]}`, status: body.status ?? null } }),
      prisma.ticket.update({
        where: { id },
        data: {
          ...(body.status ? { status: body.status } : {}),
          ...(body.status === "RESOLVED" ? { resolvedAt: now } : body.status === "OPEN" ? { resolvedAt: null } : {}),
          // Whoever on the staff picks it up first owns it.
          ...(staff && !t.assignedToId && (body.status === "IN_PROGRESS" || body.status === "RESOLVED") ? { assignedToId: request.user.sub } : {}),
          updatedAt: now,
        },
      }),
    ]);

    const to = staff ? [t.studentId] : t.assignedToId ? [t.assignedToId] : await wardensFor(t.studentId);
    notifyLater(to, {
      kind: "TICKET_UPDATE",
      title: body.status ? `#${t.number} ${STATUS_WORD[body.status]}: ${t.title}` : `New note on #${t.number}: ${t.title}`,
      body: body.body || (staff ? "Open Outpass to see the update." : `${t.student.name} replied.`),
      data: { ticketId: id },
    });
    if (staff && body.status) await audit(request, "TICKET_STATUS", `#${t.number} ${STATUS_WORD[body.status]}`, { type: "ticket", id });
    const updated = await prisma.ticket.findUniqueOrThrow({ where: { id }, include: ticketInclude });
    return reply.status(201).send(toTicketDto(updated));
  });
}
