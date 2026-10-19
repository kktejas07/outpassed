import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { drainNotifications } from "../src/lib/notify";
import { sweepOverdue } from "../src/lib/overdue";
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

const inbox = async (token: string) =>
  (await app.inject({ method: "GET", url: "/notifications", headers: auth(token) })).json().notifications as { kind: string; body: string }[];

async function studentOut() {
  const rollNo = `R${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const student = await makeUser(app, "STUDENT", { rollNo, hostel: "Block C", room: "214" });
  const parent = await makeUser(app, "PARENT");
  const warden = await makeUser(app, "WARDEN");
  const guard = await makeUser(app, "GUARD");
  await linkGuardian(student.id, parent.id);
  const pass = (
    await app.inject({ method: "POST", url: "/outpasses", headers: auth(student.token), payload: { type: "LOCAL", destination: "Mall", reason: "Shopping", leaveAt: hours(0), returnBy: hours(2) } })
  ).json();
  await app.inject({ method: "POST", url: `/outpasses/${pass.id}/decision`, headers: auth(parent.token), payload: { decision: "APPROVE" } });
  await app.inject({ method: "POST", url: `/outpasses/${pass.id}/decision`, headers: auth(warden.token), payload: { decision: "APPROVE" } });
  await app.inject({ method: "POST", url: "/gate/events", headers: auth(guard.token), payload: { eventId: randomUUID(), outpassId: pass.id, direction: "EXIT", photoMatched: true } });
  return { student, parent, warden, guard, pass, rollNo };
}

describe("late return requests", () => {
  it("student asks for more time, warden approves, the deadline moves", async () => {
    const { student, parent, warden, pass } = await studentOut();
    const later = hours(4);
    const req = await app.inject({ method: "POST", url: `/outpasses/${pass.id}/extend`, headers: auth(student.token), payload: { requestedReturnBy: later, reason: "Bus is running late" } });
    expect(req.statusCode).toBe(200);
    expect(req.json().extension).toMatchObject({ status: "PENDING", reason: "Bus is running late" });

    const again = await app.inject({ method: "POST", url: `/outpasses/${pass.id}/extend`, headers: auth(student.token), payload: { requestedReturnBy: hours(5), reason: "Still late" } });
    expect(again.json().error.code).toBe("EXTENSION_PENDING");

    const queue = (await app.inject({ method: "GET", url: "/outpasses?scope=actionable", headers: auth(warden.token) })).json();
    expect(queue.outpasses.map((o: { id: string }) => o.id)).toContain(pass.id);

    await drainNotifications();
    expect((await inbox(warden.token)).some((n) => n.kind === "EXTENSION_REQUESTED")).toBe(true);

    const ok = await app.inject({ method: "POST", url: `/outpasses/${pass.id}/extend/decision`, headers: auth(warden.token), payload: { decision: "APPROVE" } });
    expect(ok.json().returnBy).toBe(later);
    expect(ok.json().extension).toMatchObject({ status: "APPROVED", decidedByName: "Test WARDEN" });
    await drainNotifications();
    expect((await inbox(student.token))[0].kind).toBe("EXTENSION_APPROVED");
    expect((await inbox(parent.token))[0].kind).toBe("EXTENSION_APPROVED");
  });

  it("rejects earlier times and a decision with nothing pending; a new deadline gets a fresh overdue alert", async () => {
    const { student, warden, pass } = await studentOut();
    const earlier = await app.inject({ method: "POST", url: `/outpasses/${pass.id}/extend`, headers: auth(student.token), payload: { requestedReturnBy: hours(1), reason: "Earlier?" } });
    expect(earlier.json().error.code).toBe("INVALID_TIME");
    const none = await app.inject({ method: "POST", url: `/outpasses/${pass.id}/extend/decision`, headers: auth(warden.token), payload: { decision: "APPROVE" } });
    expect(none.json().error.code).toBe("NOT_PENDING");

    await prisma.outpass.update({ where: { id: pass.id }, data: { returnBy: new Date(Date.now() - 60_000) } });
    await sweepOverdue();
    expect((await prisma.outpass.findUniqueOrThrow({ where: { id: pass.id } })).overdueAlertedAt).not.toBeNull();
    await app.inject({ method: "POST", url: `/outpasses/${pass.id}/extend`, headers: auth(student.token), payload: { requestedReturnBy: hours(1), reason: "Missed the bus" } });
    await app.inject({ method: "POST", url: `/outpasses/${pass.id}/extend/decision`, headers: auth(warden.token), payload: { decision: "APPROVE" } });
    expect((await prisma.outpass.findUniqueOrThrow({ where: { id: pass.id } })).overdueAlertedAt).toBeNull();
  });
});

describe("parcels", () => {
  it("guard logs, student gets a code, guard hands over only with the right code", async () => {
    const rollNo = `P${Date.now()}`;
    const student = await makeUser(app, "STUDENT", { rollNo });
    const guard = await makeUser(app, "GUARD");
    const logged = await app.inject({ method: "POST", url: "/parcels", headers: auth(guard.token), payload: { rollNo, carrier: "Amazon", note: "Small box" } });
    expect(logged.statusCode).toBe(201);
    expect(logged.json().code).toBeNull();

    const mine = (await app.inject({ method: "GET", url: "/parcels", headers: auth(student.token) })).json().parcels;
    expect(mine[0]).toMatchObject({ carrier: "Amazon", status: "AT_GATE", code: expect.stringMatching(/^\d{4}$/) });
    await drainNotifications();
    expect((await inbox(student.token))[0].body).toContain(mine[0].code);

    const gate = (await app.inject({ method: "GET", url: "/parcels", headers: auth(guard.token) })).json().parcels;
    expect(gate.find((p: { id: string }) => p.id === mine[0].id).code).toBeNull();

    const wrong = await app.inject({ method: "POST", url: `/parcels/${mine[0].id}/collect`, headers: auth(guard.token), payload: { code: mine[0].code === "0000" ? "1111" : "0000" } });
    expect(wrong.json().error.code).toBe("WRONG_CODE");
    const ok = await app.inject({ method: "POST", url: `/parcels/${mine[0].id}/collect`, headers: auth(guard.token), payload: { code: mine[0].code } });
    expect(ok.json().status).toBe("COLLECTED");
    const twice = await app.inject({ method: "POST", url: `/parcels/${mine[0].id}/collect`, headers: auth(guard.token), payload: { code: mine[0].code } });
    expect(twice.json().error.code).toBe("ALREADY_COLLECTED");
    expect((await app.inject({ method: "POST", url: "/parcels", headers: auth(student.token), payload: { rollNo, carrier: "X" } })).statusCode).toBe(403);
  });
});

describe("SOS", () => {
  it("alerts staff, is acknowledged and resolved, and doesn't duplicate", async () => {
    const student = await makeUser(app, "STUDENT", { rollNo: `S${Date.now()}`, hostel: "Block A", room: "101" });
    const guard = await makeUser(app, "GUARD");
    const warden = await makeUser(app, "WARDEN");
    const raised = await app.inject({ method: "POST", url: "/sos", headers: auth(student.token), payload: { kind: "MEDICAL", note: "Fever and dizzy" } });
    expect(raised.statusCode).toBe(201);
    const again = await app.inject({ method: "POST", url: "/sos", headers: auth(student.token), payload: { kind: "MEDICAL" } });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(raised.json().id);

    await drainNotifications();
    const g = await inbox(guard.token);
    expect(g.find((n) => n.kind === "SOS_RAISED")?.body).toContain("Block A");

    const ack = await app.inject({ method: "POST", url: `/sos/${raised.json().id}/acknowledge`, headers: auth(guard.token) });
    expect(ack.json()).toMatchObject({ status: "ACKNOWLEDGED", acknowledgedByName: "Test GUARD" });
    await drainNotifications();
    expect((await inbox(student.token))[0].kind).toBe("SOS_ACKNOWLEDGED");

    const open = (await app.inject({ method: "GET", url: "/sos", headers: auth(warden.token) })).json().alerts;
    expect(open.some((a: { id: string }) => a.id === raised.json().id)).toBe(true);

    const done = await app.inject({ method: "POST", url: `/sos/${raised.json().id}/resolve`, headers: auth(warden.token), payload: { resolution: "Taken to the campus clinic" } });
    expect(done.json()).toMatchObject({ status: "RESOLVED", resolution: "Taken to the campus clinic" });
    const other = await makeUser(app, "STUDENT");
    expect((await app.inject({ method: "POST", url: `/sos/${raised.json().id}/resolve`, headers: auth(other.token), payload: {} })).statusCode).toBe(403);
  });
});

describe("notice board", () => {
  it("posts to the right audience and tracks reads", async () => {
    const warden = await makeUser(app, "WARDEN");
    const student = await makeUser(app, "STUDENT");
    const parent = await makeUser(app, "PARENT");
    const posted = await app.inject({ method: "POST", url: "/notices", headers: auth(warden.token), payload: { title: "Mess timings change", body: "Dinner moves to 7:30 PM from Monday.", audience: "STUDENTS", pinned: true } });
    expect(posted.statusCode).toBe(201);
    const id = posted.json().id;

    const s = (await app.inject({ method: "GET", url: "/notices", headers: auth(student.token) })).json();
    expect(s.notices.find((n: { id: string }) => n.id === id)).toMatchObject({ read: false, pinned: true, receipts: null });
    expect(s.unread).toBeGreaterThanOrEqual(1);
    const p = (await app.inject({ method: "GET", url: "/notices", headers: auth(parent.token) })).json();
    expect(p.notices.some((n: { id: string }) => n.id === id)).toBe(false);

    await app.inject({ method: "POST", url: `/notices/${id}/read`, headers: auth(student.token) });
    const after = (await app.inject({ method: "GET", url: "/notices", headers: auth(student.token) })).json();
    expect(after.notices.find((n: { id: string }) => n.id === id).read).toBe(true);

    const w = (await app.inject({ method: "GET", url: "/notices", headers: auth(warden.token) })).json();
    expect(w.notices.find((n: { id: string }) => n.id === id).receipts.read).toBe(1);
    await drainNotifications();
    expect((await inbox(student.token)).some((n) => n.kind === "NOTICE_POSTED")).toBe(true);
    expect((await app.inject({ method: "POST", url: "/notices", headers: auth(student.token), payload: { title: "Hi all", body: "x" } })).statusCode).toBe(403);
  });
});
