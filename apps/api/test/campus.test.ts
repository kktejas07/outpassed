import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { env } from "../src/env";
import { normalizePhone } from "../src/lib/phone";
import { parseCsv } from "../src/lib/csv";
import { prisma } from "../src/lib/prisma";
import { buildWhatsAppRequest, testWhatsAppOutbox as testSmsOutbox } from "../src/lib/whatsapp";
import { drainNotifications } from "../src/lib/notify";
import { auth, hours, linkGuardian, makeUser, uniqueEmail } from "./helpers/setup";

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
/** A random Indian mobile number that no other test uses. */
const mobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
const fakeJpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]).toString("base64");

describe("phone and csv helpers", () => {
  it("normalises Indian numbers", () => {
    expect(normalizePhone("98480 12345")).toBe("+919848012345");
    expect(normalizePhone("+91 98480-12345")).toBe("+919848012345");
    expect(normalizePhone("098480 12345")).toBe("+919848012345");
    expect(normalizePhone("12345")).toBeNull();
  });

  it("parses quoted CSV fields", () => {
    expect(parseCsv('﻿name,note\r\n"Rao, Asha","said ""hi"""\r\n')).toEqual([["name", "note"], ["Rao, Asha", 'said "hi"']]);
  });
});

describe("sessions", () => {
  it("rotates refresh tokens and ends the family when an old one is reused", async () => {
    const email = uniqueEmail("sess");
    const reg = await app.inject({ method: "POST", url: "/auth/register", payload: { email, password: "password123", name: "S", role: "STUDENT" } });
    const first = reg.json().refreshToken as string;
    expect(first).toBeTruthy();

    const r1 = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: first } });
    expect(r1.statusCode).toBe(200);
    const second = r1.json().refreshToken as string;
    expect(second).not.toBe(first);
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: auth(r1.json().accessToken) })).statusCode).toBe(200);

    // Reusing the first token looks like theft: both stop working.
    expect((await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: first } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: second } })).statusCode).toBe(401);
  });

  it("logout revokes the refresh token", async () => {
    const reg = await app.inject({ method: "POST", url: "/auth/register", payload: { email: uniqueEmail("out"), password: "password123", name: "S", role: "PARENT" } });
    const token = reg.json().refreshToken;
    expect((await app.inject({ method: "POST", url: "/auth/logout", payload: { refreshToken: token } })).statusCode).toBe(204);
    expect((await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: token } })).json().error.code).toBe("SESSION_EXPIRED");
  });
});

describe("phone sign-in", () => {
  it("texts a code and signs in with it", async () => {
    const phone = mobile();
    await makeUser(app, "STUDENT", { phone: `+91 ${phone}` });
    const before = testSmsOutbox.length;
    const req = await app.inject({ method: "POST", url: "/auth/otp/request", payload: { phone } });
    expect(req.statusCode).toBe(200);
    const sms = testSmsOutbox.slice(before).find((m) => m.to === `+91${phone}`);
    expect(sms?.code).toMatch(/^\d{6}$/);

    const wrong = await app.inject({ method: "POST", url: "/auth/otp/verify", payload: { phone, code: sms!.code === "000000" ? "111111" : "000000" } });
    expect(wrong.statusCode).toBe(400);
    const ok = await app.inject({ method: "POST", url: "/auth/otp/verify", payload: { phone: `0${phone}`, code: sms!.code } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.role).toBe("STUDENT");
    // Codes work once.
    expect((await app.inject({ method: "POST", url: "/auth/otp/verify", payload: { phone, code: sms!.code } })).statusCode).toBe(400);
  });

  it("answers the same for unknown numbers and sends nothing", async () => {
    const before = testSmsOutbox.length;
    const res = await app.inject({ method: "POST", url: "/auth/otp/request", payload: { phone: mobile() } });
    expect(res.statusCode).toBe(200);
    expect(testSmsOutbox.length).toBe(before);
  });

  it("asks for email when two accounts share a number", async () => {
    const phone = mobile();
    await makeUser(app, "STUDENT", { phone });
    await makeUser(app, "PARENT", { phone });
    const before = testSmsOutbox.length;
    await app.inject({ method: "POST", url: "/auth/otp/request", payload: { phone } });
    const code = testSmsOutbox.slice(before)[0]!.code;
    const res = await app.inject({ method: "POST", url: "/auth/otp/verify", payload: { phone, code } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("MULTIPLE_ACCOUNTS");
  });
});

describe("photos", () => {
  it("uploads a photo, serves it by signed link and shows it at the gate", async () => {
    const rollNo = `P${tag()}`;
    const student = await makeUser(app, "STUDENT", { rollNo, hostel: "Block C" });
    const up = await app.inject({ method: "PUT", url: "/me/photo", headers: auth(student.token), payload: { image: fakeJpeg() } });
    expect(up.statusCode).toBe(200);
    const url = up.json().photoUrl as string;
    expect(url).toMatch(/^\/photos\//);

    const img = await app.inject({ method: "GET", url });
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toBe("image/jpeg");
    expect((await app.inject({ method: "GET", url: url.replace(/sig=[^&]+/, "sig=forgedforgedforged") })).statusCode).toBe(403);

    const me = await app.inject({ method: "GET", url: "/auth/me", headers: auth(student.token) });
    expect(me.json().user.photoUrl).toMatch(/^\/photos\//);

    const parent = await makeUser(app, "PARENT");
    const warden = await makeUser(app, "WARDEN");
    const guard = await makeUser(app, "GUARD");
    await linkGuardian(student.id, parent.id);
    const pass = (await app.inject({ method: "POST", url: "/outpasses", headers: auth(student.token), payload: { type: "LOCAL", destination: "Mall", reason: "Shopping", leaveAt: hours(0), returnBy: hours(2) } })).json();
    await app.inject({ method: "POST", url: `/outpasses/${pass.id}/decision`, headers: auth(parent.token), payload: { decision: "APPROVE" } });
    await app.inject({ method: "POST", url: `/outpasses/${pass.id}/decision`, headers: auth(warden.token), payload: { decision: "APPROVE" } });
    const verdict = await app.inject({ method: "GET", url: `/gate/lookup?rollNo=${rollNo}`, headers: auth(guard.token) });
    expect(verdict.json().allowed).toBe(true);
    expect(verdict.json().person.photoUrl).toMatch(/^\/photos\//);
  });

  it("rejects files that aren't images", async () => {
    const student = await makeUser(app, "STUDENT");
    const res = await app.inject({ method: "PUT", url: "/me/photo", headers: auth(student.token), payload: { image: Buffer.alloc(300, 65).toString("base64") } });
    expect(res.statusCode).toBe(400);
  });
});

describe("hostels and warden scope", () => {
  it("shows a warden only their hostel's students and alerts only them", async () => {
    const admin = await makeUser(app, "ADMIN");
    const nameA = `Hostel A ${tag()}`;
    const nameB = `Hostel B ${tag()}`;
    const a = (await app.inject({ method: "POST", url: "/admin/hostels", headers: auth(admin.token), payload: { name: nameA } })).json();
    const b = (await app.inject({ method: "POST", url: "/admin/hostels", headers: auth(admin.token), payload: { name: nameB } })).json();
    expect(a.id).toBeTruthy();
    expect((await app.inject({ method: "POST", url: "/admin/hostels", headers: auth(admin.token), payload: { name: nameA.toLowerCase() } })).statusCode).toBe(409);

    const wardenA = await makeUser(app, "WARDEN");
    const wardenB = await makeUser(app, "WARDEN");
    await app.inject({ method: "POST", url: `/admin/hostels/${a.id}/wardens`, headers: auth(admin.token), payload: { userId: wardenA.id } });
    const assigned = await app.inject({ method: "POST", url: `/admin/hostels/${b.id}/wardens`, headers: auth(admin.token), payload: { userId: wardenB.id } });
    expect(assigned.json().wardens.map((w: { id: string }) => w.id)).toContain(wardenB.id);

    const inA = await makeUser(app, "STUDENT", { hostelId: a.id });
    const inB = await makeUser(app, "STUDENT", { hostel: nameB.toUpperCase() }); // typed name matches the hostel
    const profileB = await prisma.studentProfile.findUnique({ where: { userId: inB.id } });
    expect(profileB?.hostelId).toBe(b.id);

    const mk = async (token: string) =>
      (await app.inject({ method: "POST", url: "/outpasses", headers: auth(token), payload: { type: "LOCAL", destination: "Mall", reason: "Shopping", leaveAt: hours(1), returnBy: hours(3) } })).json();
    const passA = await mk(inA.token); // no parent linked, so it goes straight to the warden
    const passB = await mk(inB.token);

    const listA = (await app.inject({ method: "GET", url: "/outpasses?scope=actionable", headers: auth(wardenA.token) })).json().outpasses.map((o: { id: string }) => o.id);
    expect(listA).toContain(passA.id);
    expect(listA).not.toContain(passB.id);
    expect((await app.inject({ method: "GET", url: `/outpasses/${passB.id}`, headers: auth(wardenA.token) })).statusCode).toBe(404);

    await new Promise((r) => setTimeout(r, 50));
    const alerts = await prisma.notification.findMany({ where: { userId: { in: [wardenA.id, wardenB.id] }, kind: "OUTPASS_NEEDS_WARDEN" } });
    expect(alerts.filter((n) => n.userId === wardenA.id)).toHaveLength(1);
    expect(alerts.filter((n) => n.userId === wardenB.id)).toHaveLength(1);

    // Renaming updates the name on students' profiles.
    await app.inject({ method: "PATCH", url: `/admin/hostels/${a.id}`, headers: auth(admin.token), payload: { name: `${nameA} New` } });
    expect((await prisma.studentProfile.findUnique({ where: { userId: inA.id } }))?.hostel).toBe(`${nameA} New`);

    // A scoped warden's notice goes to their hostel only.
    const notice = await app.inject({ method: "POST", url: "/notices", headers: auth(wardenA.token), payload: { title: "Water off tonight", body: "From 10 PM to 6 AM." } });
    expect(notice.statusCode).toBe(201);
    const seenByA = (await app.inject({ method: "GET", url: "/notices", headers: auth(inA.token) })).json().notices.map((n: { id: string }) => n.id);
    const seenByB = (await app.inject({ method: "GET", url: "/notices", headers: auth(inB.token) })).json().notices.map((n: { id: string }) => n.id);
    expect(seenByA).toContain(notice.json().id);
    expect(seenByB).not.toContain(notice.json().id);
    const forbidden = await app.inject({ method: "POST", url: "/notices", headers: auth(wardenA.token), payload: { title: "Not mine", body: "x", hostelId: b.id } });
    expect(forbidden.statusCode).toBe(403);

    const hostels = (await app.inject({ method: "GET", url: "/hostels" })).json().hostels.map((h: { id: string }) => h.id);
    expect(hostels).toEqual(expect.arrayContaining([a.id, b.id]));
  });
});

describe("bulk import", () => {
  it("previews, then creates students and parents, and updates on re-import", async () => {
    const admin = await makeUser(app, "ADMIN");
    const t = tag();
    const parentEmail = `parent-${t}@example.com`;
    const phone = mobile();
    const csv = [
      "Name,Roll No,Email,Phone,Hostel,Room,DOB,Parent Name,Parent Email,Parent Phone,Relation",
      `Ravi Kumar,IMP${t}A,ravi-${t}@example.com,,Import Block ${t},101,21/08/2005,Sita Kumar,${parentEmail},,Mother`,
      `"Das, Neha",IMP${t}B,,${phone},Import Block ${t},102,2006-01-02,Sita Kumar,${parentEmail},,Mother`,
      `No Contact,IMP${t}C,,,,,,,,,`,
      `Bad Date,IMP${t}D,bad-${t}@example.com,,,,31/02/2005,,,,`,
      `Dup,IMP${t}A,dup-${t}@example.com,,,,,,,,`,
    ].join("\n");

    const preview = await app.inject({ method: "POST", url: "/admin/import/students", headers: auth(admin.token), payload: { csv, dryRun: true } });
    expect(preview.statusCode).toBe(200);
    const p = preview.json();
    expect(p.summary).toMatchObject({ created: 2, errors: 3, parentsCreated: 1, parentsLinked: 2, hostelsCreated: 1 });
    expect(await prisma.studentProfile.count({ where: { rollNo: { startsWith: `IMP${t}` } } })).toBe(0);

    const run = await app.inject({ method: "POST", url: "/admin/import/students", headers: auth(admin.token), payload: { csv, dryRun: false } });
    expect(run.json().summary).toMatchObject({ created: 2, errors: 3 });
    const neha = await prisma.studentProfile.findUnique({ where: { rollNo: `IMP${t}B` }, include: { user: true } });
    expect(neha?.user.email).toBe(`p91${phone}@phone.outpass.local`);
    expect(neha?.user.phoneNormalized).toBe(`+91${phone}`);
    expect(neha?.hostel).toBe(`Import Block ${t}`);
    const parent = await prisma.user.findUnique({ where: { email: parentEmail }, include: { wards: true } });
    expect(parent?.wards).toHaveLength(2);

    // Students made without a password can sign in by phone.
    const before = testSmsOutbox.length;
    await app.inject({ method: "POST", url: "/auth/otp/request", payload: { phone } });
    expect(testSmsOutbox.length).toBe(before + 1);

    const again = await app.inject({ method: "POST", url: "/admin/import/students", headers: auth(admin.token), payload: { csv: `name,rollno,email,room\nRavi K,IMP${t}A,,909`, dryRun: false } });
    expect(again.json().summary).toMatchObject({ updated: 1, created: 0 });
    expect((await prisma.studentProfile.findUnique({ where: { rollNo: `IMP${t}A` } }))?.room).toBe("909");
  });

  it("explains missing columns", async () => {
    const admin = await makeUser(app, "ADMIN");
    const res = await app.inject({ method: "POST", url: "/admin/import/students", headers: auth(admin.token), payload: { csv: "name,email\nA,a@b.co" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/rollNo/);
  });
});

describe("setup", () => {
  it("reports status and refuses once an admin exists", async () => {
    await makeUser(app, "ADMIN");
    env.DEMO_ACCOUNTS = false; // a local .env may turn it on
    const status = (await app.inject({ method: "GET", url: "/setup" })).json();
    expect(status.needsSetup).toBe(false);
    expect(status.demo).toBeNull(); // never shown unless the server opts in
    env.DEMO_ACCOUNTS = true;
    try {
      const demo = (await app.inject({ method: "GET", url: "/setup" })).json().demo;
      expect(demo.password).toBe(env.DEMO_PASSWORD);
      expect(Array.isArray(demo.accounts)).toBe(true);
    } finally {
      env.DEMO_ACCOUNTS = false;
    }
    const res = await app.inject({
      method: "POST",
      url: "/setup",
      payload: { institutionName: "Test College", adminName: "A", adminEmail: uniqueEmail("setup"), password: "password123" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ALREADY_SET_UP");
  });
});

describe("security", () => {
  it("sends security headers", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeTruthy();
  });

  it("limits sign-in attempts per address", async () => {
    const limited = await buildApp({ rateLimit: true });
    await limited.ready();
    try {
      const codes: number[] = [];
      for (let i = 0; i < 12; i++) {
        const r = await limited.inject({ method: "POST", url: "/auth/login", payload: { email: "nobody@example.com", password: "password123" }, remoteAddress: `10.9.${randomUUID().length}.1` });
        codes.push(r.statusCode);
      }
      expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
      expect(codes.slice(10)).toEqual([429, 429]);
    } finally {
      await limited.close();
    }
  });
});

describe("cors", () => {
  it("allows the methods the web app uses", async () => {
    const res = await app.inject({ method: "OPTIONS", url: "/me/photo", headers: { origin: "http://localhost:8082", "access-control-request-method": "PUT" } });
    expect(res.headers["access-control-allow-methods"]).toMatch(/PUT/);
    expect(res.headers["access-control-allow-methods"]).toMatch(/DELETE/);
  });
});

describe("whatsapp", () => {
  const cfg = { WHATSAPP_URL: "https://wa.example.org/", WHATSAPP_TOKEN: "secret", WHATSAPP_INSTANCE: "outpass", WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_OTP_TEMPLATE: "outpass_otp", WHATSAPP_ALERT_TEMPLATE: "outpass_alert", WHATSAPP_TEMPLATE_LANG: "en" };
  const msg = { to: "+919848012345", text: "Hello", kind: "STUDENT_LEFT", title: "Asha left campus", body: "Went out at 5 PM" };

  it("builds requests for each kind of server", () => {
    const hook = buildWhatsAppRequest("webhook", { ...msg, code: "123456", kind: "OTP" }, cfg);
    expect(hook.url).toBe("https://wa.example.org/");
    expect(hook.headers.authorization).toBe("Bearer secret");
    expect(hook.body).toMatchObject({ to: "+919848012345", phone: "919848012345", kind: "OTP", code: "123456" });

    const evo = buildWhatsAppRequest("evolution", msg, cfg);
    expect(evo.url).toBe("https://wa.example.org/message/sendText/outpass");
    expect(evo.headers.apikey).toBe("secret");
    expect(evo.body).toEqual({ number: "919848012345", text: "Hello" });

    const waha = buildWhatsAppRequest("waha", msg, cfg);
    expect(waha.url).toBe("https://wa.example.org/api/sendText");
    expect(waha.body).toEqual({ session: "outpass", chatId: "919848012345@c.us", text: "Hello" });

    const otp = buildWhatsAppRequest("cloud", { ...msg, code: "123456" }, cfg).body as { template: { name: string; components: { parameters: { text: string }[] }[] } };
    expect(otp.template.name).toBe("outpass_otp");
    expect(otp.template.components[0]!.parameters[0]!.text).toBe("123456");
    const alert = buildWhatsAppRequest("cloud", msg, cfg).body as { template: { name: string; components: { parameters: { text: string }[] }[] } };
    expect(alert.template.name).toBe("outpass_alert");
    expect(alert.template.components[0]!.parameters.map((p) => p.text)).toEqual(["Asha left campus", "Went out at 5 PM"]);
  });

  it("tells a parent on WhatsApp when their child asks to go out", async () => {
    const parentPhone = mobile();
    const student = await makeUser(app, "STUDENT", { rollNo: `W${tag()}` });
    const parent = await makeUser(app, "PARENT", { phone: parentPhone });
    await linkGuardian(student.id, parent.id);
    const before = testSmsOutbox.length;
    const pass = (await app.inject({ method: "POST", url: "/outpasses", headers: auth(student.token), payload: { type: "HOME", destination: "Vijayawada", reason: "Festival", leaveAt: hours(1), returnBy: hours(30) } })).json();
    await drainNotifications();
    const sent = testSmsOutbox.slice(before).find((m) => m.to === `+91${parentPhone}`);
    expect(sent?.kind).toBe("OUTPASS_NEEDS_PARENT");
    expect(sent?.text).toContain("Vijayawada");
    expect(sent?.text).toContain(`/app/outpass/${pass.id}`);
  });

  it("sends the visitor their pass link", async () => {
    const host = await makeUser(app, "STUDENT");
    const visitorPhone = mobile();
    const before = testSmsOutbox.length;
    const res = await app.inject({
      method: "POST",
      url: "/visits",
      headers: auth(host.token),
      payload: { visitorName: "Ravi Kumar", visitorPhone, purpose: "Weekend visit", validFrom: hours(1), validTo: hours(4) },
    });
    expect(res.statusCode).toBe(201);
    await drainNotifications();
    const sent = testSmsOutbox.slice(before).find((m) => m.to === `+91${visitorPhone}`);
    expect(sent?.kind).toBe("VISITOR_PASS");
    expect(sent?.text).toContain(res.json().code);
    expect(sent?.text).toContain("/app/pass/");
  });
});
