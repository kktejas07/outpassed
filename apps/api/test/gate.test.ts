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

async function approvedPass(returnInHours = 6) {
  const rollNo = `R${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const student = await makeUser(app, "STUDENT", { rollNo, hostel: "Block C", room: "214" });
  const warden = await makeUser(app, "WARDEN");
  const pass = (
    await app.inject({
      method: "POST",
      url: "/outpasses",
      headers: auth(student.token),
      payload: { type: "LOCAL", destination: "City market", reason: "Groceries", leaveAt: hours(0), returnBy: hours(returnInHours) },
    })
  ).json();
  await app.inject({
    method: "POST",
    url: `/outpasses/${pass.id}/decision`,
    headers: auth(warden.token),
    payload: { decision: "APPROVE" },
  });
  const { token } = (await app.inject({ method: "GET", url: `/outpasses/${pass.id}/qr`, headers: auth(student.token) })).json();
  return { student, pass, token, rollNo };
}

describe("gate", () => {
  it("scans out and back in, idempotently", async () => {
    const guard = await makeUser(app, "GUARD");
    const { pass, token } = await approvedPass();

    const scan = await app.inject({ method: "POST", url: "/gate/scan", headers: auth(guard.token), payload: { token } });
    expect(scan.json()).toMatchObject({ allowed: true, direction: "EXIT", kind: "OUTPASS", subjectId: pass.id });
    expect(scan.json().person.detail).toContain("Block C");

    const eventId = randomUUID();
    const exit = { eventId, outpassId: pass.id, direction: "EXIT", gate: "Main gate", method: "QR", photoMatched: true };
    const first = await app.inject({ method: "POST", url: "/gate/events", headers: auth(guard.token), payload: exit });
    expect(first.statusCode).toBe(201);
    const retry = await app.inject({ method: "POST", url: "/gate/events", headers: auth(guard.token), payload: exit });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(eventId);

    const row = await prisma.outpass.findUniqueOrThrow({ where: { id: pass.id } });
    expect(row.status).toBe("OUT");

    const wrongWay = await app.inject({
      method: "POST",
      url: "/gate/events",
      headers: auth(guard.token),
      payload: { ...exit, eventId: randomUUID() },
    });
    expect(wrongWay.json().error.code).toBe("WRONG_DIRECTION");

    const back = await app.inject({
      method: "POST",
      url: "/gate/events",
      headers: auth(guard.token),
      payload: { ...exit, eventId: randomUUID(), direction: "ENTRY" },
    });
    expect(back.statusCode).toBe(201);
    expect((await prisma.outpass.findUniqueOrThrow({ where: { id: pass.id } })).status).toBe("RETURNED");

    const reuse = await app.inject({ method: "POST", url: "/gate/scan", headers: auth(guard.token), payload: { token } });
    expect(reuse.json()).toMatchObject({ allowed: false, code: "ALREADY_USED" });
  });

  it("records a photo mismatch without moving the pass", async () => {
    const guard = await makeUser(app, "GUARD");
    const { pass } = await approvedPass();
    const res = await app.inject({
      method: "POST",
      url: "/gate/events",
      headers: auth(guard.token),
      payload: { eventId: randomUUID(), outpassId: pass.id, direction: "EXIT", gate: "Main gate", method: "QR", photoMatched: false },
    });
    expect(res.json().accepted).toBe(false);
    expect((await prisma.outpass.findUniqueOrThrow({ where: { id: pass.id } })).status).toBe("APPROVED");
  });

  it("rejects forged codes and non-guards", async () => {
    const guard = await makeUser(app, "GUARD");
    const { student, token } = await approvedPass();
    const forged = await app.inject({ method: "POST", url: "/gate/scan", headers: auth(guard.token), payload: { token: `${token}x` } });
    expect(forged.json()).toMatchObject({ allowed: false, code: "BAD_SIGNATURE" });
    const asStudent = await app.inject({ method: "POST", url: "/gate/scan", headers: auth(student.token), payload: { token } });
    expect(asStudent.statusCode).toBe(403);
  });

  it("looks up a pass by roll number", async () => {
    const guard = await makeUser(app, "GUARD");
    const { pass, rollNo } = await approvedPass();
    const res = await app.inject({ method: "GET", url: `/gate/lookup?rollNo=${rollNo}`, headers: auth(guard.token) });
    expect(res.json()).toMatchObject({ allowed: true, subjectId: pass.id });
  });

  it("counts overdue students on the dashboard", async () => {
    const guard = await makeUser(app, "GUARD");
    const warden = await makeUser(app, "WARDEN");
    const { pass } = await approvedPass();
    await app.inject({
      method: "POST",
      url: "/gate/events",
      headers: auth(guard.token),
      payload: { eventId: randomUUID(), outpassId: pass.id, direction: "EXIT", gate: "Main gate", method: "QR", photoMatched: true },
    });
    await prisma.outpass.update({ where: { id: pass.id }, data: { returnBy: new Date(Date.now() - 60_000) } });

    const summary = (await app.inject({ method: "GET", url: "/dashboard/summary", headers: auth(warden.token) })).json();
    expect(summary.overdue).toBeGreaterThanOrEqual(1);
    expect(summary.overdueList.map((o: { id: string }) => o.id)).toContain(pass.id);
    expect(summary.overdueList.find((o: { id: string }) => o.id === pass.id).overdue).toBe(true);
  });
});
