import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { audit } from "../lib/audit";
import { wardenScope } from "../lib/hostels";
import { guardianIds, notifyLater } from "../lib/notify";
import { photoUrl } from "../lib/photo";
import { prisma } from "../lib/prisma";
import { clock, rollCallDate, when } from "../lib/time";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";

type Mark = "PRESENT" | "ABSENT" | "ON_PASS";

/** Hostels this warden or admin can take roll call for. */
async function hostelsFor(request: FastifyRequest) {
  const scope = await wardenScope(request.user.sub, request.user.role);
  // Busiest hostel first: that's the one a warden most likely means.
  const rows = await prisma.hostel.findMany({
    where: scope ? { id: { in: scope } } : {},
    orderBy: [{ students: { _count: "desc" } }, { name: "asc" }],
    select: { id: true, name: true },
  });
  return rows;
}

async function pickHostel(request: FastifyRequest, hostelId?: string) {
  const hostels = await hostelsFor(request);
  if (hostels.length === 0) throw new HttpError(404, "NO_HOSTELS", "Add a hostel first (People → Hostels)");
  const hostel = hostelId ? hostels.find((h) => h.id === hostelId) : hostels[0];
  if (!hostel) throw new HttpError(403, "FORBIDDEN", "That hostel isn't one of yours");
  return { hostel, hostels };
}

/** Tonight's sheet: every student in the hostel with their mark, or "on a pass" if they're out. */
async function sheet(hostelId: string, date: string) {
  const [students, rollCall] = await Promise.all([
    prisma.user.findMany({
      where: { role: "STUDENT", student: { hostelId } },
      include: {
        student: true,
        photo: { select: { updatedAt: true } },
        outpasses: { where: { status: "OUT" }, select: { id: true, destination: true, returnBy: true }, take: 1 },
      },
      orderBy: [{ student: { room: "asc" } }, { name: "asc" }],
    }),
    prisma.rollCall.findUnique({ where: { hostelId_date: { hostelId, date } }, include: { entries: true, takenBy: { select: { name: true } } } }),
  ]);
  const marks = new Map(rollCall?.entries.map((e) => [e.studentId, e.status]) ?? []);
  const rows = students.map((s) => {
    const pass = s.outpasses[0] ?? null;
    // Out on an approved pass beats any mark: they're accounted for.
    const status: Mark | null = pass ? "ON_PASS" : (marks.get(s.id) as Mark | undefined) ?? null;
    return {
      id: s.id,
      name: s.name,
      rollNo: s.student?.rollNo ?? null,
      room: s.student?.room ?? null,
      photoUrl: photoUrl(s.id, s.photo?.updatedAt),
      status,
      pass: pass ? { outpassId: pass.id, destination: pass.destination, returnBy: pass.returnBy.toISOString(), overdue: pass.returnBy < new Date() } : null,
    };
  });
  const count = (st: Mark) => rows.filter((r) => r.status === st).length;
  return {
    date,
    rollCall: rollCall
      ? { id: rollCall.id, startedAt: rollCall.startedAt.toISOString(), closedAt: rollCall.closedAt?.toISOString() ?? null, takenByName: rollCall.takenBy.name }
      : null,
    students: rows,
    counts: { total: rows.length, present: count("PRESENT"), absent: count("ABSENT"), onPass: count("ON_PASS"), unmarked: rows.filter((r) => r.status === null).length },
  };
}

async function ensureRollCall(hostelId: string, date: string, takenById: string) {
  return prisma.rollCall.upsert({ where: { hostelId_date: { hostelId, date } }, create: { hostelId, date, takenById }, update: {} });
}

/**
 * Night roll call. The warden marks each student present or absent; students
 * out on a pass are filled in automatically. Finishing it tells the parents
 * of anyone missing, on WhatsApp and in the app.
 */
export async function rollCallRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);
  app.addHook("preHandler", async (request) => requireRole(request, "WARDEN", "ADMIN"));

  app.get("/rollcall", async (request) => {
    const q = z.object({ hostelId: z.uuid().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(request.query);
    const { hostel, hostels } = await pickHostel(request, q.hostelId);
    return { hostel, hostels, ...(await sheet(hostel.id, q.date ?? rollCallDate())) };
  });

  app.post("/rollcall/mark", async (request) => {
    const body = z.object({ hostelId: z.uuid(), studentId: z.uuid(), status: z.enum(["PRESENT", "ABSENT"]) }).parse(request.body);
    const { hostel } = await pickHostel(request, body.hostelId);
    const student = await prisma.studentProfile.findUnique({ where: { userId: body.studentId } });
    if (!student || student.hostelId !== hostel.id) throw new HttpError(404, "NOT_FOUND", "That student isn't in this hostel");
    const date = rollCallDate();
    const rc = await ensureRollCall(hostel.id, date, request.user.sub);
    await prisma.rollCallEntry.upsert({
      where: { rollCallId_studentId: { rollCallId: rc.id, studentId: body.studentId } },
      create: { rollCallId: rc.id, studentId: body.studentId, status: body.status },
      update: { status: body.status, markedAt: new Date() },
    });
    // A correction after the roll call closed is worth a record.
    if (rc.closedAt) await audit(request, "ROLLCALL_CORRECTED", `Changed a roll-call mark to ${body.status.toLowerCase()} after it closed`, { type: "rollcall", id: rc.id }, { studentId: body.studentId });
    return sheet(hostel.id, date);
  });

  /** "Everyone else is here": marks every unmarked student present. */
  app.post("/rollcall/mark-rest", async (request) => {
    const body = z.object({ hostelId: z.uuid() }).parse(request.body);
    const { hostel } = await pickHostel(request, body.hostelId);
    const date = rollCallDate();
    const rc = await ensureRollCall(hostel.id, date, request.user.sub);
    const current = await sheet(hostel.id, date);
    const rest = current.students.filter((s) => s.status === null);
    if (rest.length) {
      await prisma.rollCallEntry.createMany({ data: rest.map((s) => ({ rollCallId: rc.id, studentId: s.id, status: "PRESENT" as const })), skipDuplicates: true });
    }
    return sheet(hostel.id, date);
  });

  /** Finishes tonight's roll call: anyone still unmarked counts as absent, and their parents are told. */
  app.post("/rollcall/close", async (request) => {
    const body = z.object({ hostelId: z.uuid() }).parse(request.body);
    const { hostel } = await pickHostel(request, body.hostelId);
    const date = rollCallDate();
    const rc = await ensureRollCall(hostel.id, date, request.user.sub);
    if (rc.closedAt) throw new HttpError(409, "ALREADY_CLOSED", `Roll call for ${hostel.name} was already finished at ${clock(rc.closedAt)}`);
    const current = await sheet(hostel.id, date);
    const now = new Date();
    await prisma.$transaction([
      // Record who was out on a pass, and mark the unmarked absent.
      prisma.rollCallEntry.createMany({
        data: current.students
          .filter((s) => s.status === null || s.status === "ON_PASS")
          .map((s) => ({ rollCallId: rc.id, studentId: s.id, status: s.status === "ON_PASS" ? ("ON_PASS" as const) : ("ABSENT" as const) })),
        skipDuplicates: true,
      }),
      prisma.rollCall.update({ where: { id: rc.id }, data: { closedAt: now } }),
    ]);
    const final = await sheet(hostel.id, date);
    const absent = final.students.filter((s) => s.status === "ABSENT");
    for (const s of absent) {
      notifyLater(await guardianIds(s.id), {
        kind: "ROLLCALL_ABSENT",
        title: `${s.name} wasn't in the hostel at roll call`,
        body: `${hostel.name} roll call at ${clock(now)}${s.room ? ` · Room ${s.room}` : ""}. There's no outpass for tonight. The warden is following up; please call ${s.name.split(" ")[0]}.`,
      });
      notifyLater([s.id], {
        kind: "ROLLCALL_ABSENT",
        title: "You were marked absent at roll call",
        body: `${hostel.name}, ${when(now)}. Contact your warden right away.`,
      });
    }
    const overdue = final.students.filter((s) => s.pass?.overdue);
    const otherWardens = (await prisma.wardenHostel.findMany({ where: { hostelId: hostel.id }, select: { userId: true } })).map((w) => w.userId).filter((u) => u !== request.user.sub);
    notifyLater(otherWardens, {
      kind: "ROLLCALL_DONE",
      title: `${hostel.name} roll call: ${final.counts.present} present, ${final.counts.absent} absent`,
      body: `${final.counts.onPass} out on a pass${overdue.length ? ` (${overdue.length} overdue)` : ""}.${absent.length ? ` Absent: ${absent.map((s) => s.name).join(", ")}.` : ""}`,
    });
    await audit(request, "ROLLCALL_CLOSED", `Finished ${hostel.name} roll call: ${final.counts.present} present, ${final.counts.absent} absent, ${final.counts.onPass} on a pass`, { type: "rollcall", id: rc.id }, final.counts);
    return final;
  });
}
