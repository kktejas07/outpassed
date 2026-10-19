import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../env";
import { audit } from "../lib/audit";
import { studentInHostels, wardenScope } from "../lib/hostels";
import { prisma } from "../lib/prisma";
import { stamp } from "../lib/time";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";

const reportTypes = ["movements", "late", "visitors", "absences"] as const;
type ReportType = (typeof reportTypes)[number];

const rangeSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    hostelId: z.uuid().optional(),
  })
  .refine((r) => r.from <= r.to, { message: "Start date must be before end date", path: ["to"] })
  .refine((r) => (new Date(r.to).getTime() - new Date(r.from).getTime()) / 86_400_000 <= 366, { message: "Pick at most a year", path: ["to"] });

/** Campus-day boundaries for a YYYY-MM-DD range (IST is fixed at +05:30, other zones use the offset at that date). */
function bounds(from: string, to: string) {
  const offset = (d: string) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: env.CAMPUS_TZ, timeZoneName: "longOffset" }).formatToParts(new Date(`${d}T12:00:00Z`));
    const m = (parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT").match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
  };
  const start = new Date(new Date(`${from}T00:00:00Z`).getTime() - offset(from) * 60_000);
  const end = new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000 - offset(to) * 60_000);
  return { start, end };
}

/** Hostel filter: the requested hostel (if allowed), else a warden's hostels, else everything. */
async function hostelFilter(request: FastifyRequest, hostelId?: string): Promise<string[] | null> {
  const scope = await wardenScope(request.user.sub, request.user.role);
  if (hostelId) {
    if (scope && !scope.includes(hostelId)) throw new HttpError(403, "FORBIDDEN", "That hostel isn't one of yours");
    return [hostelId];
  }
  return scope;
}

async function summary(start: Date, end: Date, hostels: string[] | null) {
  const student = studentInHostels(hostels);
  const outpassIn: Prisma.OutpassWhereInput = hostels ? { student } : {};
  const [requested, approved, rejected, exits, returns, lateRows, overdueNow, visitorsIn, parcels, sos, absences] = await Promise.all([
    prisma.outpass.count({ where: { ...outpassIn, createdAt: { gte: start, lt: end } } }),
    prisma.outpass.count({ where: { ...outpassIn, createdAt: { gte: start, lt: end }, status: { in: ["APPROVED", "OUT", "RETURNED"] } } }),
    prisma.outpass.count({ where: { ...outpassIn, createdAt: { gte: start, lt: end }, status: "REJECTED" } }),
    prisma.outpass.count({ where: { ...outpassIn, exitedAt: { gte: start, lt: end } } }),
    prisma.outpass.count({ where: { ...outpassIn, returnedAt: { gte: start, lt: end } } }),
    lateReturns(start, end, hostels),
    prisma.outpass.count({ where: { ...outpassIn, status: "OUT", returnBy: { lt: new Date() } } }),
    prisma.visit.count({ where: { ...visitsIn(hostels), checkedInAt: { gte: start, lt: end } } }),
    prisma.parcel.count({ where: { ...(hostels ? { student } : {}), createdAt: { gte: start, lt: end } } }),
    prisma.sosAlert.count({ where: { ...(hostels ? { raisedBy: student } : {}), createdAt: { gte: start, lt: end } } }),
    absenceRows(start, end, hostels),
  ]);
  // Students who were late most often in the range.
  const byStudent = new Map<string, { name: string; rollNo: string | null; count: number }>();
  for (const r of lateRows) {
    const cur = byStudent.get(r.studentId) ?? { name: r.student.name, rollNo: r.student.student?.rollNo ?? null, count: 0 };
    cur.count++;
    byStudent.set(r.studentId, cur);
  }
  const repeatLate = [...byStudent.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .filter((v) => v.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  return {
    outpasses: { requested, approved, rejected },
    movements: { exits, returns },
    lateReturns: lateRows.length,
    overdueNow,
    visitors: visitorsIn,
    parcels,
    sos,
    rollCallAbsences: absences.length,
    repeatLate,
  };
}

function visitsIn(hostels: string[] | null): Prisma.VisitWhereInput {
  // A hostel's visitors: those visiting its students or its wardens.
  return hostels ? { host: { OR: [{ student: { hostelId: { in: hostels } } }, { wardenHostels: { some: { hostelId: { in: hostels } } } }] } } : {};
}

async function lateReturns(start: Date, end: Date, hostels: string[] | null) {
  const rows = await prisma.outpass.findMany({
    where: {
      ...(hostels ? { student: studentInHostels(hostels) } : {}),
      returnBy: { gte: start, lt: end },
      OR: [{ status: "RETURNED" }, { status: "OUT", returnBy: { lt: new Date() } }],
    },
    include: { student: { include: { student: true } } },
    orderBy: { returnBy: "asc" },
    take: 5000,
  });
  return rows.filter((r) => (r.returnedAt ? r.returnedAt > r.returnBy : true));
}

async function absenceRows(start: Date, end: Date, hostels: string[] | null) {
  return prisma.rollCallEntry.findMany({
    where: {
      status: "ABSENT",
      rollCall: { closedAt: { gte: start, lt: end }, ...(hostels ? { hostelId: { in: hostels } } : {}) },
    },
    include: { rollCall: { include: { hostel: true, takenBy: true } }, student: { include: { student: true } } },
    orderBy: { markedAt: "asc" },
    take: 5000,
  });
}

// --- CSV ---

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote when needed; prefix formulas so spreadsheets don't execute them.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const csv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

async function buildCsv(type: ReportType, start: Date, end: Date, hostels: string[] | null): Promise<string> {
  if (type === "movements") {
    const events = await prisma.gateEvent.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        ...(hostels ? { OR: [{ outpass: { student: studentInHostels(hostels) } }, { visit: visitsIn(hostels) }] } : {}),
      },
      include: { guard: true, outpass: { include: { student: { include: { student: true } } } }, visit: { include: { host: true } } },
      orderBy: { createdAt: "asc" },
      take: 50_000,
    });
    return csv(
      ["Time", "Direction", "Person", "Type", "Roll no.", "Hostel", "Room", "Destination / host", "Gate", "Method", "Guard", "Allowed", "Note"],
      events.map((e) => {
        const p = e.outpass?.student.student;
        return [
          stamp(e.createdAt),
          e.direction === "EXIT" ? "Out" : "In",
          e.personName,
          e.outpassId ? "Student" : "Visitor",
          p?.rollNo,
          p?.hostel,
          p?.room,
          e.outpass ? e.outpass.destination : e.visit ? `Visiting ${e.visit.host.name}` : "",
          e.gate,
          e.method,
          e.guard.name,
          e.accepted ? "Yes" : "No",
          e.note,
        ];
      }),
    );
  }
  if (type === "late") {
    const rows = await lateReturns(start, end, hostels);
    return csv(
      ["Student", "Roll no.", "Hostel", "Room", "Destination", "Due back", "Returned", "Minutes late"],
      rows.map((r) => [
        r.student.name,
        r.student.student?.rollNo,
        r.student.student?.hostel,
        r.student.student?.room,
        r.destination,
        stamp(r.returnBy),
        r.returnedAt ? stamp(r.returnedAt) : "Not back yet",
        Math.round(((r.returnedAt ?? new Date()).getTime() - r.returnBy.getTime()) / 60_000),
      ]),
    );
  }
  if (type === "visitors") {
    const visits = await prisma.visit.findMany({
      where: { ...visitsIn(hostels), OR: [{ checkedInAt: { gte: start, lt: end } }, { validFrom: { gte: start, lt: end } }] },
      include: { host: true },
      orderBy: { validFrom: "asc" },
      take: 50_000,
    });
    return csv(
      ["Visitor", "Phone", "Type", "Visiting", "Purpose", "From", "Until", "Arrived", "Left", "Walk-in", "Regular pass", "Status"],
      visits.map((v) => [
        v.visitorName,
        v.visitorPhone,
        v.visitorType,
        v.host.name,
        v.purpose,
        stamp(v.validFrom),
        stamp(v.validTo),
        stamp(v.checkedInAt),
        stamp(v.checkedOutAt),
        v.walkIn ? "Yes" : "No",
        v.repeatDays.length ? "Yes" : "No",
        v.status,
      ]),
    );
  }
  const rows = await absenceRows(start, end, hostels);
  return csv(
    ["Night", "Hostel", "Student", "Roll no.", "Room", "Roll call finished", "Taken by"],
    rows.map((r) => [r.rollCall.date, r.rollCall.hostel.name, r.student.name, r.student.student?.rollNo, r.student.student?.room, stamp(r.rollCall.closedAt), r.rollCall.takenBy.name]),
  );
}

// --- signed download links (so the phone's browser can download without the sign-in token) ---

const LINK_TTL_SECONDS = 10 * 60;
const linkSig = (q: string) => createHmac("sha256", `${env.JWT_SECRET}:reports`).update(q).digest("base64url");

function canonical(p: { type: string; from: string; to: string; hostels: string; exp: number; by: string }) {
  return `type=${p.type}&from=${p.from}&to=${p.to}&hostels=${p.hostels}&exp=${p.exp}&by=${p.by}`;
}

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get("/reports/summary", { onRequest: [app.authenticate] }, async (request) => {
    requireRole(request, "WARDEN", "ADMIN");
    const q = rangeSchema.parse(request.query);
    const hostels = await hostelFilter(request, q.hostelId);
    const { start, end } = bounds(q.from, q.to);
    return { from: q.from, to: q.to, ...(await summary(start, end, hostels)) };
  });

  /** A 10-minute link to download one report as CSV. */
  app.post("/reports/link", { onRequest: [app.authenticate] }, async (request) => {
    requireRole(request, "WARDEN", "ADMIN");
    const body = rangeSchema.and(z.object({ type: z.enum(reportTypes) })).parse(request.body);
    const hostels = await hostelFilter(request, body.hostelId);
    const p = { type: body.type, from: body.from, to: body.to, hostels: hostels?.join(".") ?? "all", exp: Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS, by: request.user.sub };
    const q = canonical(p);
    await audit(request, "REPORT_EXPORTED", `Downloaded the ${body.type} report for ${body.from} to ${body.to}`, undefined, { hostels: p.hostels });
    return { url: `/reports/export.csv?${q}&sig=${linkSig(q)}`, expiresIn: LINK_TTL_SECONDS };
  });

  app.get("/reports/export.csv", async (request, reply) => {
    const q = z
      .object({ type: z.enum(reportTypes), from: z.iso.date(), to: z.iso.date(), hostels: z.string().max(4000), exp: z.coerce.number().int(), by: z.uuid(), sig: z.string().max(100) })
      .parse(request.query);
    const expected = Buffer.from(linkSig(canonical(q)));
    const given = Buffer.from(q.sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given) || q.exp * 1000 < Date.now()) {
      throw new HttpError(403, "LINK_EXPIRED", "This download link has expired. Open Reports and download again.");
    }
    const { start, end } = bounds(q.from, q.to);
    const body = await buildCsv(q.type, start, end, q.hostels === "all" ? null : q.hostels.split("."));
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="outpass-${q.type}-${q.from}-to-${q.to}.csv"`);
    reply.header("cache-control", "no-store");
    // BOM so Excel opens UTF-8 names correctly.
    return reply.send(`﻿${body}`);
  });
}
