import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { auth, hours, makeUser } from "./helpers/setup";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("visits", () => {
  it("pre-registered visitor checks in and out", async () => {
    const host = await makeUser(app, "WARDEN");
    const guard = await makeUser(app, "GUARD");
    const visit = (
      await app.inject({
        method: "POST",
        url: "/visits",
        headers: auth(host.token),
        payload: {
          visitorName: "Ravi Kumar",
          visitorPhone: "+919800000000",
          visitorType: "GUEST",
          purpose: "Meeting",
          validFrom: hours(0),
          validTo: hours(3),
        },
      })
    ).json();
    expect(visit.status).toBe("APPROVED");

    const { token } = (await app.inject({ method: "GET", url: `/visits/${visit.id}/qr`, headers: auth(host.token) })).json();
    const scan = (await app.inject({ method: "POST", url: "/gate/scan", headers: auth(guard.token), payload: { token } })).json();
    expect(scan).toMatchObject({ allowed: true, kind: "VISIT", direction: "ENTRY" });

    const base = { visitId: visit.id, gate: "Main gate", method: "QR", photoMatched: true };
    await app.inject({ method: "POST", url: "/gate/events", headers: auth(guard.token), payload: { ...base, eventId: randomUUID(), direction: "ENTRY" } });
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).status).toBe("CHECKED_IN");
    await app.inject({ method: "POST", url: "/gate/events", headers: auth(guard.token), payload: { ...base, eventId: randomUUID(), direction: "EXIT" } });
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).status).toBe("CHECKED_OUT");
  });

  it("walk-in waits for the host", async () => {
    const host = await makeUser(app, "WARDEN");
    const guard = await makeUser(app, "GUARD");
    const other = await makeUser(app, "WARDEN");
    const walkIn = (
      await app.inject({
        method: "POST",
        url: "/visits/walk-in",
        headers: auth(guard.token),
        payload: { visitorName: "Courier", visitorPhone: "+919811111111", visitorType: "DELIVERY", purpose: "Parcel", hostId: host.id, durationMinutes: 30 },
      })
    ).json();
    expect(walkIn.status).toBe("PENDING_HOST");

    const notHost = await app.inject({
      method: "POST",
      url: `/visits/${walkIn.id}/decision`,
      headers: auth(other.token),
      payload: { decision: "APPROVE" },
    });
    expect(notHost.statusCode).toBe(404);

    const pending = (await app.inject({ method: "GET", url: "/visits?scope=pending", headers: auth(host.token) })).json();
    expect(pending.visits.map((v: { id: string }) => v.id)).toContain(walkIn.id);

    const approved = await app.inject({
      method: "POST",
      url: `/visits/${walkIn.id}/decision`,
      headers: auth(host.token),
      payload: { decision: "APPROVE" },
    });
    expect(approved.json().status).toBe("APPROVED");
  });

  it("only staff can create walk-ins and staff accounts", async () => {
    const student = await makeUser(app, "STUDENT");
    const res = await app.inject({
      method: "POST",
      url: "/visits/walk-in",
      headers: auth(student.token),
      payload: { visitorName: "X", visitorPhone: "+919822222222", visitorType: "GUEST", purpose: "Y", hostId: student.id, durationMinutes: 30 },
    });
    expect(res.statusCode).toBe(403);
    const staff = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: auth(student.token),
      payload: { email: "g@example.com", password: "password123", name: "G", role: "GUARD" },
    });
    expect(staff.statusCode).toBe(403);
  });

  it("admin links a guardian", async () => {
    const admin = await makeUser(app, "ADMIN");
    const student = await makeUser(app, "STUDENT");
    const parent = await makeUser(app, "PARENT");
    const res = await app.inject({
      method: "POST",
      url: "/admin/guardianships",
      headers: auth(admin.token),
      payload: { studentId: student.id, parentEmail: parent.email, relation: "Mother" },
    });
    expect(res.statusCode).toBe(201);
    const pass = (
      await app.inject({
        method: "POST",
        url: "/outpasses",
        headers: auth(student.token),
        payload: { type: "LOCAL", destination: "Town", reason: "Shopping", leaveAt: hours(0), returnBy: hours(3) },
      })
    ).json();
    expect(pass.status).toBe("PENDING_PARENT");
  });
});
