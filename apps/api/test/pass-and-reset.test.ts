import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { testOutbox } from "../src/lib/mailer";
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

describe("visitor pass link", () => {
  it("shares a public pass with QR and a code the guard can type", async () => {
    const host = await makeUser(app, "WARDEN");
    const guard = await makeUser(app, "GUARD");
    const visit = (
      await app.inject({
        method: "POST",
        url: "/visits",
        headers: auth(host.token),
        payload: { visitorName: "Meena", visitorPhone: "+919811111111", purpose: "Parent meeting", validFrom: hours(0), validTo: hours(3) },
      })
    ).json();
    expect(visit.code).toMatch(/^\d{6}$/);
    const token = visit.passUrl.split("/app/pass/")[1];
    expect(token.length).toBeGreaterThan(16);

    const pub = await app.inject({ method: "GET", url: `/public/visit-pass/${token}` });
    expect(pub.statusCode).toBe(200);
    expect(pub.json()).toMatchObject({ visitorName: "Meena", code: visit.code, qrToken: expect.stringMatching(/^v1\./) });
    expect(JSON.stringify(pub.json())).not.toContain("+919811111111");

    const byCode = await app.inject({ method: "GET", url: `/gate/lookup?code=${visit.code}`, headers: auth(guard.token) });
    expect(byCode.json()).toMatchObject({ allowed: true, kind: "VISIT", subjectId: visit.id, direction: "ENTRY" });

    const scan = await app.inject({ method: "POST", url: "/gate/scan", headers: auth(guard.token), payload: { token: pub.json().qrToken } });
    expect(scan.json()).toMatchObject({ allowed: true, subjectId: visit.id });

    await app.inject({ method: "POST", url: "/gate/events", headers: auth(guard.token), payload: { eventId: randomUUID(), visitId: visit.id, direction: "ENTRY", method: "MANUAL", photoMatched: true } });
    await new Promise((r) => setTimeout(r, 150));
    const hostInbox = (await app.inject({ method: "GET", url: "/notifications", headers: auth(host.token) })).json();
    expect(hostInbox.notifications[0].kind).toBe("VISITOR_ARRIVED");
  });

  it("returns 404 for an unknown link and hides the code on a declined walk-in", async () => {
    expect((await app.inject({ method: "GET", url: "/public/visit-pass/nope-nope-nope-nope" })).statusCode).toBe(404);
    const host = await makeUser(app, "WARDEN");
    const guard = await makeUser(app, "GUARD");
    const walk = (
      await app.inject({ method: "POST", url: "/visits/walk-in", headers: auth(guard.token), payload: { visitorName: "X", visitorPhone: "+919800000009", purpose: "Y", hostId: host.id, durationMinutes: 30 } })
    ).json();
    await app.inject({ method: "POST", url: `/visits/${walk.id}/decision`, headers: auth(host.token), payload: { decision: "REJECT" } });
    const pub = (await app.inject({ method: "GET", url: `/public/visit-pass/${walk.passUrl.split("/app/pass/")[1]}` })).json();
    expect(pub).toMatchObject({ status: "REJECTED", code: "", qrToken: null });
  });
});

describe("password reset", () => {
  it("emails a code that resets the password once", async () => {
    const user = await makeUser(app, "STUDENT");
    const forgot = await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: user.email } });
    expect(forgot.statusCode).toBe(200);
    const mail = testOutbox.findLast((m) => m.to === user.email)!;
    const code = mail.text.match(/\b(\d{6})\b/)![1];

    const wrong = await app.inject({ method: "POST", url: "/auth/reset", payload: { email: user.email, code: code === "000000" ? "111111" : "000000", password: "new-password-1" } });
    expect(wrong.json().error.code).toBe("INVALID_CODE");

    const ok = await app.inject({ method: "POST", url: "/auth/reset", payload: { email: user.email, code, password: "new-password-1" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().accessToken).toEqual(expect.any(String));

    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: user.email, password: "new-password-1" } });
    expect(login.statusCode).toBe(200);
    const reuse = await app.inject({ method: "POST", url: "/auth/reset", payload: { email: user.email, code, password: "another-pass-2" } });
    expect(reuse.statusCode).toBe(400);
  });

  it("answers the same for unknown emails and locks after 5 wrong tries", async () => {
    const unknown = await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: "nobody-here@example.com" } });
    expect(unknown.statusCode).toBe(200);
    const user = await makeUser(app, "PARENT");
    await app.inject({ method: "POST", url: "/auth/forgot", payload: { email: user.email } });
    const code = testOutbox.findLast((m) => m.to === user.email)!.text.match(/\b(\d{6})\b/)![1]!;
    const bad = code === "999999" ? "888888" : "999999";
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: "POST", url: "/auth/reset", payload: { email: user.email, code: bad, password: "whatever-123" } });
    }
    const right = await app.inject({ method: "POST", url: "/auth/reset", payload: { email: user.email, code, password: "whatever-123" } });
    expect(right.statusCode).toBe(400);
  });
});
