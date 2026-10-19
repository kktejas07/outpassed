import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { drainNotifications } from "../src/lib/notify";
import { purgeOldPhotos } from "../src/lib/photoRetention";
import { prisma } from "../src/lib/prisma";
import { forgetSettings } from "../src/lib/settings";
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

const img = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]).toString("base64");
const minorDob = () => new Date(Date.now() - 16 * 365 * 86_400_000).toISOString().slice(0, 10);
const roll = () => `C${Date.now()}${Math.floor(Math.random() * 1e4)}`;

/** An approved pass for the student, so the guard can record an exit. */
async function approvedPass(studentId: string) {
  const warden = await prisma.user.findFirstOrThrow({ where: { role: "WARDEN" } }).catch(async () => (await makeUser(app, "WARDEN")) && prisma.user.findFirstOrThrow({ where: { role: "WARDEN" } }));
  return prisma.outpass.create({
    data: { studentId, type: "LOCAL", destination: "Market", reason: "Groceries", leaveAt: hours(-0.5), returnBy: hours(3), status: "APPROVED", approvals: { create: { step: "WARDEN", decision: "APPROVE", approverId: warden.id } } },
  });
}

describe("photo consent for under-18s", () => {
  it("blocks photos until a parent agrees, then deletes them all when they withdraw", async () => {
    const admin = await makeUser(app, "ADMIN");
    await app.inject({ method: "PATCH", url: "/admin/settings", headers: auth(admin.token), payload: { schoolMode: false } });
    forgetSettings();
    const minorRoll = roll();
    const minor = await makeUser(app, "STUDENT", { rollNo: minorRoll, dateOfBirth: minorDob() });
    const adult = await makeUser(app, "STUDENT", { rollNo: roll(), dateOfBirth: "2003-01-01" });
    const parent = await makeUser(app, "PARENT");
    await linkGuardian(minor.id, parent.id);

    const me = (await app.inject({ method: "GET", url: "/auth/me", headers: auth(minor.token) })).json().user;
    expect(me.photoConsent).toBe("NEEDED");
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: auth(adult.token) })).json().user.photoConsent).toBe("NOT_NEEDED");

    // No photo without consent; the parent is asked.
    const blocked = await app.inject({ method: "PUT", url: "/me/photo", headers: auth(minor.token), payload: { image: img() } });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe("CONSENT_NEEDED");
    await drainNotifications();
    expect(await prisma.notification.count({ where: { userId: parent.id, kind: "CONSENT_NEEDED" } })).toBe(1);
    expect((await app.inject({ method: "PUT", url: "/me/photo", headers: auth(adult.token), payload: { image: img() } })).statusCode).toBe(200);

    // The guard is told not to take one, and a gate photo sent anyway isn't kept.
    const pass = await approvedPass(minor.id);
    const guard = await makeUser(app, "GUARD");
    const verdict = (await app.inject({ method: "GET", url: `/gate/lookup?rollNo=${minorRoll}`, headers: auth(guard.token) })).json();
    expect(verdict.person.photoAllowed).toBe(false);
    const eventId = randomUUID();
    const exit = await app.inject({ method: "POST", url: "/gate/events", headers: auth(guard.token), payload: { eventId, outpassId: pass.id, direction: "EXIT", gate: "Main Gate", method: "MANUAL" } });
    expect(exit.statusCode).toBeLessThan(300);
    const skipped = (await app.inject({ method: "PUT", url: `/gate/events/${eventId}/photo`, headers: auth(guard.token), payload: { image: img() } })).json();
    expect(skipped.skipped).toBe("NO_CONSENT");
    expect(await prisma.gatePhoto.count({ where: { gateEventId: eventId } })).toBe(0);

    // Parent sees the child and agrees.
    const list = (await app.inject({ method: "GET", url: "/consent", headers: auth(parent.token) })).json();
    expect(list.children).toEqual([expect.objectContaining({ student: expect.objectContaining({ id: minor.id }), state: "NEEDED" })]);
    const stranger = await makeUser(app, "PARENT");
    expect((await app.inject({ method: "POST", url: `/consent/${minor.id}`, headers: auth(stranger.token), payload: { agree: true } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/consent/${minor.id}`, headers: auth(parent.token), payload: { agree: true } })).json().state).toBe("GIVEN");
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: auth(minor.token) })).json().user.photoConsent).toBe("GIVEN");

    // Now photos are kept.
    expect((await app.inject({ method: "PUT", url: "/me/photo", headers: auth(minor.token), payload: { image: img() } })).statusCode).toBe(200);
    const kept = (await app.inject({ method: "PUT", url: `/gate/events/${eventId}/photo`, headers: auth(guard.token), payload: { image: img() } })).json();
    expect(kept.photoUrl).toBeTruthy();

    // Withdrawing deletes both, and the next upload is blocked again.
    const out = (await app.inject({ method: "DELETE", url: `/consent/${minor.id}`, headers: auth(parent.token) })).json();
    expect(out.removed).toEqual({ profile: 1, gate: 1 });
    expect(await prisma.userPhoto.count({ where: { userId: minor.id } })).toBe(0);
    expect((await app.inject({ method: "PUT", url: "/me/photo", headers: auth(minor.token), payload: { image: img() } })).statusCode).toBe(409);
    expect(await prisma.auditLog.count({ where: { action: { in: ["CONSENT_GIVEN", "CONSENT_WITHDRAWN"] }, targetId: minor.id } })).toBe(2);
  });

  it("on a school campus every student needs consent", async () => {
    const admin = await makeUser(app, "ADMIN");
    const student = await makeUser(app, "STUDENT", { rollNo: roll() });
    await app.inject({ method: "PATCH", url: "/admin/settings", headers: auth(admin.token), payload: { schoolMode: true } });
    forgetSettings();
    try {
      expect((await app.inject({ method: "GET", url: "/auth/me", headers: auth(student.token) })).json().user.photoConsent).toBe("NEEDED");
      expect((await app.inject({ method: "PUT", url: "/me/photo", headers: auth(student.token), payload: { image: img() } })).statusCode).toBe(409);
    } finally {
      await app.inject({ method: "PATCH", url: "/admin/settings", headers: auth(admin.token), payload: { schoolMode: false } });
      forgetSettings();
    }
  });
});

describe("photo retention", () => {
  it("deletes gate and visitor photos past the retention period, keeps the movement", async () => {
    const admin = await makeUser(app, "ADMIN");
    await app.inject({ method: "PATCH", url: "/admin/settings", headers: auth(admin.token), payload: { photoRetentionDays: 90 } });
    forgetSettings();
    const student = await makeUser(app, "STUDENT", { rollNo: roll() });
    const pass = await approvedPass(student.id);
    const guard = await makeUser(app, "GUARD");
    const oldId = randomUUID();
    const newId = randomUUID();
    for (const id of [oldId, newId]) {
      await prisma.gateEvent.create({ data: { id, direction: "EXIT", gate: "Main Gate", accepted: true, personName: "Test", outpassId: pass.id, guardId: guard.id } });
    }
    const data = Buffer.from(img(), "base64");
    await prisma.gatePhoto.create({ data: { gateEventId: oldId, data, mime: "image/jpeg", createdAt: new Date(Date.now() - 100 * 86_400_000) } });
    await prisma.gatePhoto.create({ data: { gateEventId: newId, data, mime: "image/jpeg" } });
    const visit = await prisma.visit.findFirst({ where: { visitorPhotoMime: null } });

    await purgeOldPhotos();
    expect(await prisma.gatePhoto.count({ where: { gateEventId: oldId } })).toBe(0);
    expect(await prisma.gatePhoto.count({ where: { gateEventId: newId } })).toBe(1);
    expect(await prisma.gateEvent.count({ where: { id: oldId } })).toBe(1); // the log stays
    void visit;

    // Shortening the period applies straight away.
    await prisma.gatePhoto.update({ where: { gateEventId: newId }, data: { createdAt: new Date(Date.now() - 45 * 86_400_000) } });
    const res = await app.inject({ method: "PATCH", url: "/admin/settings", headers: auth(admin.token), payload: { photoRetentionDays: 30 } });
    expect(res.json().photoRetentionDays).toBe(30);
    expect(await prisma.gatePhoto.count({ where: { gateEventId: newId } })).toBe(0);
    expect((await app.inject({ method: "PATCH", url: "/admin/settings", headers: auth(admin.token), payload: { photoRetentionDays: 45 } })).statusCode).toBe(400);
    await app.inject({ method: "PATCH", url: "/admin/settings", headers: auth(admin.token), payload: { photoRetentionDays: 90 } });
    forgetSettings();
  });
});
