import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
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

const request = (overrides: Record<string, unknown> = {}) => ({
  type: "HOME",
  destination: "Vijayawada",
  reason: "Weekend at home",
  leaveAt: hours(0),
  returnBy: hours(48),
  ...overrides,
});

describe("outpass approval chain", () => {
  it("student → parent → warden → approved, with a QR code", async () => {
    const student = await makeUser(app, "STUDENT", { rollNo: `R${Date.now()}` });
    const parent = await makeUser(app, "PARENT");
    const warden = await makeUser(app, "WARDEN");
    await linkGuardian(student.id, parent.id);

    const created = await app.inject({ method: "POST", url: "/outpasses", headers: auth(student.token), payload: request() });
    expect(created.statusCode).toBe(201);
    const pass = created.json();
    expect(pass.status).toBe("PENDING_PARENT");

    const qrTooEarly = await app.inject({ method: "GET", url: `/outpasses/${pass.id}/qr`, headers: auth(student.token) });
    expect(qrTooEarly.statusCode).toBe(409);

    const parentQueue = await app.inject({ method: "GET", url: "/outpasses?scope=actionable", headers: auth(parent.token) });
    expect(parentQueue.json().outpasses.map((o: { id: string }) => o.id)).toContain(pass.id);

    const byParent = await app.inject({
      method: "POST",
      url: `/outpasses/${pass.id}/decision`,
      headers: auth(parent.token),
      payload: { decision: "APPROVE" },
    });
    expect(byParent.json().status).toBe("PENDING_WARDEN");

    const byWarden = await app.inject({
      method: "POST",
      url: `/outpasses/${pass.id}/decision`,
      headers: auth(warden.token),
      payload: { decision: "APPROVE" },
    });
    expect(byWarden.statusCode).toBe(200);
    expect(byWarden.json().status).toBe("APPROVED");
    expect(byWarden.json().approvals).toHaveLength(2);

    const qr = await app.inject({ method: "GET", url: `/outpasses/${pass.id}/qr`, headers: auth(student.token) });
    expect(qr.statusCode).toBe(200);
    expect(qr.json().token).toMatch(/^v2\./);
  });

  it("allows only one active outpass", async () => {
    const student = await makeUser(app, "STUDENT");
    await app.inject({ method: "POST", url: "/outpasses", headers: auth(student.token), payload: request() });
    const second = await app.inject({ method: "POST", url: "/outpasses", headers: auth(student.token), payload: request() });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("ACTIVE_OUTPASS");
  });

  it("goes straight to the warden when no guardian is linked", async () => {
    const student = await makeUser(app, "STUDENT");
    const res = await app.inject({ method: "POST", url: "/outpasses", headers: auth(student.token), payload: request() });
    expect(res.json().status).toBe("PENDING_WARDEN");
  });

  it("requires a reason for a warden override", async () => {
    const student = await makeUser(app, "STUDENT");
    const parent = await makeUser(app, "PARENT");
    const warden = await makeUser(app, "WARDEN");
    await linkGuardian(student.id, parent.id);
    const pass = (await app.inject({ method: "POST", url: "/outpasses", headers: auth(student.token), payload: request() })).json();

    const noReason = await app.inject({
      method: "POST",
      url: `/outpasses/${pass.id}/decision`,
      headers: auth(warden.token),
      payload: { decision: "APPROVE" },
    });
    expect(noReason.statusCode).toBe(400);
    expect(noReason.json().error.code).toBe("REASON_REQUIRED");

    const withReason = await app.inject({
      method: "POST",
      url: `/outpasses/${pass.id}/decision`,
      headers: auth(warden.token),
      payload: { decision: "APPROVE", reason: "Parent unreachable, medical visit" },
    });
    expect(withReason.json().status).toBe("APPROVED");
    expect(withReason.json().approvals[0].override).toBe(true);
  });

  it("hides other students' passes and blocks unlinked parents", async () => {
    const student = await makeUser(app, "STUDENT");
    const other = await makeUser(app, "STUDENT");
    const stranger = await makeUser(app, "PARENT");
    const pass = (await app.inject({ method: "POST", url: "/outpasses", headers: auth(student.token), payload: request() })).json();

    const peek = await app.inject({ method: "GET", url: `/outpasses/${pass.id}`, headers: auth(other.token) });
    expect(peek.statusCode).toBe(404);
    const decide = await app.inject({
      method: "POST",
      url: `/outpasses/${pass.id}/decision`,
      headers: auth(stranger.token),
      payload: { decision: "APPROVE" },
    });
    expect(decide.statusCode).toBe(404);
  });

  it("lets the student cancel before leaving", async () => {
    const student = await makeUser(app, "STUDENT");
    const pass = (await app.inject({ method: "POST", url: "/outpasses", headers: auth(student.token), payload: request() })).json();
    const res = await app.inject({ method: "POST", url: `/outpasses/${pass.id}/cancel`, headers: auth(student.token) });
    expect(res.json().status).toBe("CANCELLED");
  });

  it("rejects returnBy before leaveAt", async () => {
    const student = await makeUser(app, "STUDENT");
    const res = await app.inject({
      method: "POST",
      url: "/outpasses",
      headers: auth(student.token),
      payload: request({ leaveAt: hours(5), returnBy: hours(1) }),
    });
    expect(res.statusCode).toBe(400);
  });
});
