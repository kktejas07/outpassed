import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { offlineVerdict, repeatWindowOpen, verifyPassToken } from "@outpassed/shared/passToken";
import { buildApp } from "../src/app";
import { drainNotifications } from "../src/lib/notify";
import { prisma } from "../src/lib/prisma";
import { auth, hours, linkGuardian, makeUser } from "./helpers/setup";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const tag = () => `${Date.now()}${Math.floor(Math.random() * 1e5)}`;

async function approvedPass(extra: Record<string, unknown> = {}) {
  const student = await makeUser(app, "STUDENT", { rollNo: `O${tag()}`, ...extra });
  const warden = await makeUser(app, "WARDEN");
  const guard = await makeUser(app, "GUARD");
  const pass = (
    await app.inject({ method: "POST", url: "/outpasses", headers: auth(student.token), payload: { type: "LOCAL", destination: "Mall", reason: "Shopping", leaveAt: hours(0), returnBy: hours(3) } })
  ).json();
  await app.inject({ method: "POST", url: `/outpasses/${pass.id}/decision`, headers: auth(warden.token), payload: { decision: "APPROVE" } });
  return { student, warden, guard, pass };
}

describe("gate checks without internet", () => {
  it("lets a guard's phone verify a pass with only the public key", async () => {
    const { student, guard, pass } = await approvedPass();
    const key = (await app.inject({ method: "GET", url: "/gate/key", headers: auth(guard.token) })).json();
    expect(key.alg).toBe("Ed25519");

    const qr = (await app.inject({ method: "GET", url: `/outpasses/${pass.id}/qr`, headers: auth(student.token) })).json();
    expect(qr.token).toMatch(/^v2\./);
    expect(qr.offlineToken).toMatch(/^v2\./);
    expect(new Date(qr.offlineExpiresAt).getTime()).toBeGreaterThan(Date.now() + 3 * 3600_000);

    const now = Date.now();
    const out = offlineVerdict(qr.offlineToken, key.publicKey, now);
    expect(out).toMatchObject({ allowed: true, direction: "EXIT", subjectId: pass.id, offline: true, person: { name: "Test STUDENT" } });
    // Once this phone has let them out, the same pass lets them back in.
    expect(offlineVerdict(qr.offlineToken, key.publicKey, now + 3600_000, "EXIT")).toMatchObject({ allowed: true, direction: "ENTRY", code: "VALID" });
    expect(offlineVerdict(qr.offlineToken, key.publicKey, now + 4 * 3600_000, "EXIT")).toMatchObject({ allowed: true, code: "LATE_RETURN" });

    // The short code expires quickly; tampering is caught.
    expect(verifyPassToken(qr.token, key.publicKey, now + 10 * 60_000)).toMatchObject({ ok: false, code: "STALE" });
    const [v, body, sig] = qr.offlineToken.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), to: Math.floor(now / 1000) + 99 * 86400 })).toString("base64url");
    expect(offlineVerdict(`${v}.${forgedBody}.${sig}`, key.publicKey, now)).toMatchObject({ allowed: false, code: "BAD_SIGNATURE" });

    // The server accepts the offline copy too, and still checks the live status.
    const scan = await app.inject({ method: "POST", url: "/gate/scan", headers: auth(guard.token), payload: { token: qr.offlineToken } });
    expect(scan.json()).toMatchObject({ allowed: true, direction: "EXIT", subjectId: pass.id });
    await app.inject({ method: "POST", url: `/outpasses/${pass.id}/cancel`, headers: auth(student.token) });
    const afterCancel = await app.inject({ method: "POST", url: "/gate/scan", headers: auth(guard.token), payload: { token: qr.offlineToken } });
    expect(afterCancel.json().allowed).toBe(false);
  });

  it("queued offline movements sync once the network is back", async () => {
    const { student, guard, pass } = await approvedPass();
    const qr = (await app.inject({ method: "GET", url: `/outpasses/${pass.id}/qr`, headers: auth(student.token) })).json();
    const key = (await app.inject({ method: "GET", url: "/gate/key", headers: auth(guard.token) })).json();
    const verdict = offlineVerdict(qr.offlineToken, key.publicKey, Date.now());
    const eventId = randomUUID();
    const sync = await app.inject({
      method: "POST",
      url: "/gate/events",
      headers: auth(guard.token),
      payload: { eventId, outpassId: verdict.subjectId, direction: verdict.direction, photoMatched: true, method: "QR", deviceTime: new Date().toISOString(), note: "Checked offline" },
    });
    expect(sync.statusCode).toBe(201);
    expect((await prisma.outpass.findUnique({ where: { id: pass.id } }))?.status).toBe("OUT");
  });
});

describe("regular visitor pass", () => {
  it("works on its days and hours, and again after each visit", async () => {
    const host = await makeUser(app, "STUDENT");
    const guard = await makeUser(app, "GUARD");
    const allDay = { days: [0, 1, 2, 3, 4, 5, 6], from: "00:00", to: "23:59" };
    const res = await app.inject({
      method: "POST",
      url: "/visits",
      headers: auth(host.token),
      payload: { visitorName: "Lakshmi Rao", visitorPhone: "9800012345", visitorType: "PARENT", purpose: "Weekly visit", validFrom: hours(-1), validTo: hours(24 * 90), repeat: allDay },
    });
    expect(res.statusCode).toBe(201);
    const visit = res.json();
    expect(visit.repeat).toEqual(allDay);

    for (const direction of ["ENTRY", "EXIT", "ENTRY"] as const) {
      const look = await app.inject({ method: "GET", url: `/gate/lookup?code=${visit.code}`, headers: auth(guard.token) });
      expect(look.json()).toMatchObject({ allowed: true, direction });
      const ev = await app.inject({ method: "POST", url: "/gate/events", headers: auth(guard.token), payload: { eventId: randomUUID(), visitId: visit.id, direction, photoMatched: true, method: "MANUAL" } });
      expect(ev.statusCode).toBe(201);
    }

    // A pass for another weekday only is refused today.
    const tomorrow = (new Date(Date.now() + 5.5 * 3600_000).getUTCDay() + 1) % 7;
    const other = (
      await app.inject({
        method: "POST",
        url: "/visits",
        headers: auth(host.token),
        payload: { visitorName: "Ravi Rao", visitorPhone: "9800012346", purpose: "Weekly visit", validFrom: hours(-1), validTo: hours(24 * 30), repeat: { days: [tomorrow], from: "10:00", to: "18:00" } },
      })
    ).json();
    const refused = await app.inject({ method: "GET", url: `/gate/lookup?code=${other.code}`, headers: auth(guard.token) });
    expect(refused.json()).toMatchObject({ allowed: false, code: "OUTSIDE_HOURS" });
  });

  it("limits one-off visits to 14 days", async () => {
    const host = await makeUser(app, "STUDENT");
    const res = await app.inject({ method: "POST", url: "/visits", headers: auth(host.token), payload: { visitorName: "X", visitorPhone: "9800012347", purpose: "Stay", validFrom: hours(1), validTo: hours(24 * 30) } });
    expect(res.statusCode).toBe(400);
  });

  it("checks weekday and hours in campus time", () => {
    // Sunday 2026-10-18 10:30 IST = 05:00 UTC
    const sundayMorning = Date.UTC(2026, 9, 18, 5, 0);
    const rule = { days: [0], from: "10:00", to: "18:00", tzo: 330 };
    expect(repeatWindowOpen(rule, sundayMorning)).toBe(true);
    expect(repeatWindowOpen(rule, sundayMorning - 3600_000)).toBe(false); // 09:30
    expect(repeatWindowOpen(rule, sundayMorning + 86_400_000)).toBe(false); // Monday
  });
});

describe("night roll call", () => {
  it("marks students, fills in those on a pass, and tells parents of anyone missing", async () => {
    const admin = await makeUser(app, "ADMIN");
    const hostel = (await app.inject({ method: "POST", url: "/admin/hostels", headers: auth(admin.token), payload: { name: `Night Block ${tag()}` } })).json();
    const warden = await makeUser(app, "WARDEN");
    await app.inject({ method: "POST", url: `/admin/hostels/${hostel.id}/wardens`, headers: auth(admin.token), payload: { userId: warden.id } });

    const here = await makeUser(app, "STUDENT", { hostelId: hostel.id, room: "101" });
    const missing = await makeUser(app, "STUDENT", { hostelId: hostel.id, room: "102" });
    const out = await makeUser(app, "STUDENT", { hostelId: hostel.id, room: "103" });
    const parent = await makeUser(app, "PARENT");
    await linkGuardian(missing.id, parent.id);
    // `out` leaves campus on an approved pass.
    const guard = await makeUser(app, "GUARD");
    const pass = (await app.inject({ method: "POST", url: "/outpasses", headers: auth(out.token), payload: { type: "LOCAL", destination: "Home", reason: "Dinner", leaveAt: hours(0), returnBy: hours(4) } })).json();
    await app.inject({ method: "POST", url: `/outpasses/${pass.id}/decision`, headers: auth(warden.token), payload: { decision: "APPROVE" } });
    await app.inject({ method: "POST", url: "/gate/events", headers: auth(guard.token), payload: { eventId: randomUUID(), outpassId: pass.id, direction: "EXIT", photoMatched: true } });

    const sheet = (await app.inject({ method: "GET", url: `/rollcall?hostelId=${hostel.id}`, headers: auth(warden.token) })).json();
    expect(sheet.counts).toMatchObject({ total: 3, onPass: 1, unmarked: 2 });
    expect(sheet.students.find((s: { id: string }) => s.id === out.id).status).toBe("ON_PASS");

    const marked = (await app.inject({ method: "POST", url: "/rollcall/mark", headers: auth(warden.token), payload: { hostelId: hostel.id, studentId: here.id, status: "PRESENT" } })).json();
    expect(marked.counts).toMatchObject({ present: 1, unmarked: 1 });

    const closed = await app.inject({ method: "POST", url: "/rollcall/close", headers: auth(warden.token), payload: { hostelId: hostel.id } });
    expect(closed.statusCode).toBe(200);
    expect(closed.json().counts).toMatchObject({ present: 1, absent: 1, onPass: 1, unmarked: 0 });
    expect((await app.inject({ method: "POST", url: "/rollcall/close", headers: auth(warden.token), payload: { hostelId: hostel.id } })).statusCode).toBe(409);

    await drainNotifications();
    const alerts = await prisma.notification.findMany({ where: { userId: { in: [parent.id, missing.id, here.id] }, kind: "ROLLCALL_ABSENT" } });
    expect(alerts.map((a) => a.userId).sort()).toEqual([missing.id, parent.id].sort());

    // A warden of another hostel can't touch this one.
    const stranger = await makeUser(app, "WARDEN");
    const other = (await app.inject({ method: "POST", url: "/admin/hostels", headers: auth(admin.token), payload: { name: `Other Block ${tag()}` } })).json();
    await app.inject({ method: "POST", url: `/admin/hostels/${other.id}/wardens`, headers: auth(admin.token), payload: { userId: stranger.id } });
    expect((await app.inject({ method: "GET", url: `/rollcall?hostelId=${hostel.id}`, headers: auth(stranger.token) })).statusCode).toBe(403);

    // The audit log has the roll call and the approval.
    const log = (await app.inject({ method: "GET", url: "/admin/audit?limit=200", headers: auth(admin.token) })).json().entries as { action: string; targetId: string }[];
    expect(log.some((e) => e.action === "ROLLCALL_CLOSED")).toBe(true);
    expect(log.some((e) => e.action === "OUTPASS_APPROVED" && e.targetId === pass.id)).toBe(true);

    // Reports: the absence shows up, and the CSV downloads through a signed link.
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() + 5.5 * 3600_000 - 86_400_000).toISOString().slice(0, 10);
    const sum = (await app.inject({ method: "GET", url: `/reports/summary?from=${yesterday}&to=${today}&hostelId=${hostel.id}`, headers: auth(warden.token) })).json();
    expect(sum).toMatchObject({ rollCallAbsences: 1, movements: { exits: 1 } });
    const link = (await app.inject({ method: "POST", url: "/reports/link", headers: auth(warden.token), payload: { type: "absences", from: yesterday, to: today, hostelId: hostel.id } })).json();
    const file = await app.inject({ method: "GET", url: link.url });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toMatch(/text\/csv/);
    expect(file.body).toContain("Test STUDENT");
    expect(file.body).toContain("102");
    const movements = await app.inject({ method: "GET", url: (await app.inject({ method: "POST", url: "/reports/link", headers: auth(warden.token), payload: { type: "movements", from: yesterday, to: today, hostelId: hostel.id } })).json().url });
    expect(movements.body.split("\r\n")[1]).toContain("Out");
    expect((await app.inject({ method: "GET", url: link.url.replace("type=absences", "type=movements") })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/reports/link", headers: auth(stranger.token), payload: { type: "late", from: yesterday, to: today, hostelId: hostel.id } })).statusCode).toBe(403);
  });
});
