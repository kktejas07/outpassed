import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { sendFeeReminders } from "../src/lib/feeReminders";
import { drainNotifications } from "../src/lib/notify";
import { setPaymentGateway } from "../src/lib/payments";
import { prisma } from "../src/lib/prisma";
import { forgetSettings } from "../src/lib/settings";
import { auth, hours, linkGuardian, makeUser } from "./helpers/setup";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  setPaymentGateway(null);
  await app.close();
  await prisma.$disconnect();
});

const tag = () => `${Date.now()}${Math.floor(Math.random() * 1e5)}`;
const img = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 9)]).toString("base64");
const kinds = async (userId: string) => {
  await drainNotifications();
  return (await prisma.notification.findMany({ where: { userId }, select: { kind: true } })).map((n) => n.kind);
};

async function faculty(departmentId?: string) {
  const f = await makeUser(app, "WARDEN"); // staff are inserted directly; switch the role
  await prisma.user.update({ where: { id: f.id }, data: { role: "FACULTY", departmentId: departmentId ?? null } });
  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: f.email, password: "password123" } });
  return { ...f, token: login.json().accessToken as string };
}

describe("faculty permission and HOD", () => {
  it("faculty approves first, then parent and warden; HOD and faculty hear about the exit", async () => {
    const admin = await makeUser(app, "ADMIN");
    const dept = (await app.inject({ method: "POST", url: "/admin/departments", headers: auth(admin.token), payload: { name: `CSE ${tag()}`, code: "CSE" } })).json();
    const hod = await faculty(dept.id);
    await app.inject({ method: "PATCH", url: `/admin/departments/${dept.id}`, headers: auth(admin.token), payload: { hodId: hod.id } });
    const prof = await faculty(dept.id);
    const otherProf = await faculty();

    const student = await makeUser(app, "STUDENT", { rollNo: `F${tag()}`, departmentId: dept.id });
    const parent = await makeUser(app, "PARENT");
    await linkGuardian(student.id, parent.id);
    const warden = await makeUser(app, "WARDEN");

    const list = (await app.inject({ method: "GET", url: "/faculty", headers: auth(student.token) })).json().faculty;
    expect(list[0]).toMatchObject({ mine: true }); // own department first
    expect(list.find((f: { id: string }) => f.id === hod.id).isHod).toBe(true);

    const pass = (
      await app.inject({ method: "POST", url: "/outpasses", headers: auth(student.token), payload: { type: "MEDICAL", destination: "Apollo Clinic", reason: "Fever since morning", leaveAt: hours(0), returnBy: hours(4), facultyId: prof.id } })
    ).json();
    expect(pass.status).toBe("PENDING_FACULTY");
    expect(pass.faculty).toMatchObject({ id: prof.id });
    expect(await kinds(prof.id)).toContain("OUTPASS_NEEDS_FACULTY");
    expect(await kinds(hod.id)).toContain("OUTPASS_FOR_HOD");
    expect(await kinds(parent.id)).not.toContain("OUTPASS_NEEDS_PARENT");

    const actionable = (await app.inject({ method: "GET", url: "/outpasses?scope=actionable", headers: auth(prof.token) })).json().outpasses;
    expect(actionable.map((o: { id: string }) => o.id)).toContain(pass.id);
    expect((await app.inject({ method: "POST", url: `/outpasses/${pass.id}/decision`, headers: auth(otherProf.token), payload: { decision: "APPROVE" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/outpasses/${pass.id}/decision`, headers: auth(parent.token), payload: { decision: "APPROVE" } })).statusCode).toBe(409);

    const byProf = (await app.inject({ method: "POST", url: `/outpasses/${pass.id}/decision`, headers: auth(prof.token), payload: { decision: "APPROVE" } })).json();
    expect(byProf.status).toBe("PENDING_PARENT");
    expect(byProf.approvals[0]).toMatchObject({ step: "FACULTY", approverId: prof.id });
    expect(await kinds(parent.id)).toContain("OUTPASS_NEEDS_PARENT");
    await app.inject({ method: "POST", url: `/outpasses/${pass.id}/decision`, headers: auth(parent.token), payload: { decision: "APPROVE" } });
    const done = (await app.inject({ method: "POST", url: `/outpasses/${pass.id}/decision`, headers: auth(warden.token), payload: { decision: "APPROVE" } })).json();
    expect(done.status).toBe("APPROVED");

    // The HOD can see the pass; the student leaves; faculty and HOD are told.
    expect((await app.inject({ method: "GET", url: `/outpasses/${pass.id}`, headers: auth(hod.token) })).statusCode).toBe(200);
    const guard = await makeUser(app, "GUARD");
    await app.inject({ method: "POST", url: "/gate/events", headers: auth(guard.token), payload: { eventId: randomUUID(), outpassId: pass.id, direction: "EXIT", photoMatched: true } });
    expect(await kinds(prof.id)).toContain("STUDENT_LEFT");
    expect(await kinds(hod.id)).toContain("STUDENT_LEFT");
  });

  it("emergency exits go straight to the warden and tell everyone", async () => {
    const prof = await faculty();
    const student = await makeUser(app, "STUDENT", { rollNo: `E${tag()}` });
    const parent = await makeUser(app, "PARENT");
    await linkGuardian(student.id, parent.id);
    const pass = (
      await app.inject({ method: "POST", url: "/outpasses", headers: auth(student.token), payload: { type: "EMERGENCY", destination: "Home", reason: "Grandfather in hospital", leaveAt: hours(0), returnBy: hours(48), facultyId: prof.id } })
    ).json();
    expect(pass.status).toBe("PENDING_WARDEN");
    expect(await kinds(parent.id)).toContain("OUTPASS_EMERGENCY");
    expect(await kinds(prof.id)).toContain("OUTPASS_EMERGENCY");
  });
});

describe("visitors and gate photos", () => {
  it("a walk-in for a faculty member, with ID number and photo, reaches that faculty member", async () => {
    const prof = await faculty();
    const profName = `Dr Host ${tag()}`;
    await prisma.user.update({ where: { id: prof.id }, data: { name: profName } });
    const guard = await makeUser(app, "GUARD");
    const hosts = (await app.inject({ method: "GET", url: `/visits/hosts?q=${encodeURIComponent(profName)}`, headers: auth(guard.token) })).json().hosts;
    expect(hosts.find((h: { id: string }) => h.id === prof.id)).toMatchObject({ role: "FACULTY" });

    const walk = await app.inject({
      method: "POST",
      url: "/visits/walk-in",
      headers: auth(guard.token),
      payload: { visitorName: "Ramesh Gupta", visitorPhone: "9800055555", purpose: "Project review", hostId: prof.id, visitorIdNumber: "21BQ1A0501", photo: img() },
    });
    expect(walk.statusCode).toBe(201);
    const v = walk.json();
    expect(v.visitorIdNumber).toBe("21BQ1A0501");
    expect(v.visitorPhotoUrl).toMatch(/^\/visitor-photos\//);
    expect((await app.inject({ method: "GET", url: v.visitorPhotoUrl })).statusCode).toBe(200);
    expect(await kinds(prof.id)).toContain("VISITOR_AT_GATE");

    await app.inject({ method: "POST", url: `/visits/${v.id}/decision`, headers: auth(prof.token), payload: { decision: "APPROVE" } });
    const look = (await app.inject({ method: "GET", url: `/gate/lookup?code=${v.code}`, headers: auth(guard.token) })).json();
    expect(look.person.photoUrl).toMatch(/^\/visitor-photos\//);

    const eventId = randomUUID();
    await app.inject({ method: "POST", url: "/gate/events", headers: auth(guard.token), payload: { eventId, visitId: v.id, direction: "ENTRY", photoMatched: true, method: "MANUAL" } });
    const up = await app.inject({ method: "PUT", url: `/gate/events/${eventId}/photo`, headers: auth(guard.token), payload: { image: img() } });
    expect(up.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: up.json().photoUrl })).headers["content-type"]).toBe("image/jpeg");
    const log = (await app.inject({ method: "GET", url: "/gate/events?limit=50", headers: auth(guard.token) })).json().events;
    expect(log.find((e: { id: string }) => e.id === eventId).photoUrl).toMatch(/^\/gate-photos\//);
  });
});

describe("fees", () => {
  it("assigns, accepts proof, takes online payment and reminds", async () => {
    const admin = await makeUser(app, "ADMIN");
    const hostel = (await app.inject({ method: "POST", url: "/admin/hostels", headers: auth(admin.token), payload: { name: `Fee Block ${tag()}` } })).json();
    const student = await makeUser(app, "STUDENT", { hostelId: hostel.id });
    const parent = await makeUser(app, "PARENT");
    await linkGuardian(student.id, parent.id);
    const dueIn2 = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const res = await app.inject({ method: "POST", url: "/admin/fees", headers: auth(admin.token), payload: { category: "HOSTEL", title: "Hostel fee · Sem 2", amountPaise: 4500000, dueDate: dueIn2, target: { hostelId: hostel.id } } });
    expect(res.json().created).toBe(1);

    const mine = (await app.inject({ method: "GET", url: "/fees", headers: auth(student.token) })).json();
    expect(mine.totals).toMatchObject({ duePaise: 4500000, open: 1 });
    const fee = mine.fees[0];
    expect((await app.inject({ method: "GET", url: "/fees", headers: auth(parent.token) })).json().fees[0].id).toBe(fee.id);

    // Proof rejected, then accepted.
    await app.inject({ method: "POST", url: `/fees/${fee.id}/proof`, headers: auth(student.token), payload: { image: img(), reference: "UPI 4021 7788" } });
    const queue = (await app.inject({ method: "GET", url: "/admin/fees?status=SUBMITTED", headers: auth(admin.token) })).json();
    const pay = queue.fees.find((f: { id: string }) => f.id === fee.id).payments[0];
    expect(pay.proofUrl).toMatch(/^\/media\/fee-proof\//);
    expect((await app.inject({ method: "GET", url: pay.proofUrl })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/admin/fee-payments/${pay.id}/review`, headers: auth(admin.token), payload: { decision: "REJECT" } })).statusCode).toBe(400);
    const rejected = (await app.inject({ method: "POST", url: `/admin/fee-payments/${pay.id}/review`, headers: auth(admin.token), payload: { decision: "REJECT", note: "Amount doesn't match" } })).json();
    expect(rejected.status).toBe("DUE");
    expect(await kinds(student.id)).toContain("FEE_PROOF_REJECTED");

    // Reminder 3 days out, then overdue reaches the parent.
    expect(await sendFeeReminders()).toBeGreaterThanOrEqual(1);
    expect(await kinds(student.id)).toContain("FEE_DUE");
    expect(await sendFeeReminders(new Date(Date.now() + 5 * 86_400_000))).toBeGreaterThanOrEqual(1);
    expect(await kinds(parent.id)).toContain("FEE_DUE");

    // Online payment through a fake gateway and a signed webhook.
    expect((await app.inject({ method: "POST", url: `/fees/${fee.id}/pay`, headers: auth(student.token) })).statusCode).toBe(400);
    let linkId = "";
    setPaymentGateway({
      createLink: async () => ({ id: (linkId = `plink_${tag()}`), url: "https://rzp.io/i/test" }),
      linkStatus: async () => ({ status: "created", paymentId: null }),
    });
    const link = (await app.inject({ method: "POST", url: `/fees/${fee.id}/pay`, headers: auth(student.token) })).json();
    expect(link.url).toBe("https://rzp.io/i/test");
    process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_123";
    const { env } = await import("../src/env");
    (env as { RAZORPAY_WEBHOOK_SECRET?: string }).RAZORPAY_WEBHOOK_SECRET = "whsec_test_123";
    const body = JSON.stringify({ event: "payment_link.paid", payload: { payment_link: { entity: { id: linkId } }, payment: { entity: { id: "pay_123" } } } });
    const forged = await app.inject({ method: "POST", url: "/payments/razorpay/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": "bad" }, payload: body });
    expect(forged.statusCode).toBe(401);
    const hook = await app.inject({ method: "POST", url: "/payments/razorpay/webhook", headers: { "content-type": "application/json", "x-razorpay-signature": createHmac("sha256", "whsec_test_123").update(body).digest("hex") }, payload: body });
    expect(hook.statusCode).toBe(200);
    const paid = (await app.inject({ method: "GET", url: "/fees", headers: auth(student.token) })).json();
    expect(paid.fees[0].status).toBe("PAID");
    expect(paid.totals.duePaise).toBe(0);
    expect(await kinds(parent.id)).toContain("FEE_PAID");
    setPaymentGateway(null);
  });
});

describe("events, marketplace and offers", () => {
  it("student events need approval; admin events go live; seats run out", async () => {
    const admin = await makeUser(app, "ADMIN");
    const a = await makeUser(app, "STUDENT");
    const b = await makeUser(app, "STUDENT");
    const proposed = (
      await app.inject({ method: "POST", url: "/events", headers: auth(a.token), payload: { title: "Robotics demo", description: "Line followers and drones", venue: "Lab 3", category: "Tech", startsAt: hours(24), endsAt: hours(26), capacity: 1 } })
    ).json();
    expect(proposed.status).toBe("PENDING");
    expect((await app.inject({ method: "POST", url: `/events/${proposed.id}/register`, headers: auth(b.token) })).statusCode).toBe(404);
    await app.inject({ method: "POST", url: `/admin/events/${proposed.id}/decision`, headers: auth(admin.token), payload: { decision: "APPROVE" } });
    expect(await kinds(b.id)).toContain("EVENT_PUBLISHED");
    expect(await kinds(a.id)).toContain("EVENT_DECIDED");
    const reg = (await app.inject({ method: "POST", url: `/events/${proposed.id}/register`, headers: auth(b.token) })).json();
    expect(reg).toMatchObject({ registered: true, seatsLeft: 0 });
    const c = await makeUser(app, "STUDENT");
    expect((await app.inject({ method: "POST", url: `/events/${proposed.id}/register`, headers: auth(c.token) })).json().error.code).toBe("FULL");
    const regs = (await app.inject({ method: "GET", url: `/events/${proposed.id}/registrations`, headers: auth(a.token) })).json().registrations;
    expect(regs).toHaveLength(1);

    const fest = (await app.inject({ method: "POST", url: "/events", headers: auth(admin.token), payload: { title: "Annual fest", description: "Three days", venue: "Ground", startsAt: hours(48), endsAt: hours(96) } })).json();
    expect(fest.status).toBe("APPROVED");
  });

  it("buy & sell: approve, show interest, report", async () => {
    const admin = await makeUser(app, "ADMIN");
    const seller = await makeUser(app, "STUDENT", { phone: "9811122233" });
    const buyer = await makeUser(app, "STUDENT");
    const item = (
      await app.inject({ method: "POST", url: "/market", headers: auth(seller.token), payload: { title: "Engineering Maths book", description: "Kreyszig, 10th ed.", price: 350, category: "Books", condition: "Like new", photo: img() } })
    ).json();
    expect(item.status).toBe("PENDING");
    const browse = async () => (await app.inject({ method: "GET", url: "/market", headers: auth(buyer.token) })).json().items.map((i: { id: string }) => i.id);
    expect(await browse()).not.toContain(item.id);
    await app.inject({ method: "POST", url: `/admin/market/${item.id}/decision`, headers: auth(admin.token), payload: { decision: "APPROVE" } });
    expect(await browse()).toContain(item.id);

    const before = (await app.inject({ method: "GET", url: `/market/${item.id}`, headers: auth(buyer.token) })).json();
    expect(before.contactUrl).toBeNull();
    const after = (await app.inject({ method: "POST", url: `/market/${item.id}/interest`, headers: auth(buyer.token) })).json();
    expect(after.contactUrl).toMatch(/^https:\/\/wa\.me\/919811122233\?text=/);
    expect(await kinds(seller.id)).toContain("MARKET_INTEREST");
    expect((await app.inject({ method: "GET", url: after.photoUrl })).statusCode).toBe(200);

    for (let i = 0; i < 3; i++) {
      const r = await makeUser(app, "STUDENT");
      await app.inject({ method: "POST", url: `/market/${item.id}/report`, headers: auth(r.token), payload: { reason: "Looks fake" } });
    }
    expect(await browse()).not.toContain(item.id);
  });

  it("offers show to adult students only, and not when the college turns them off", async () => {
    const admin = await makeUser(app, "ADMIN");
    await app.inject({ method: "PATCH", url: "/admin/settings", headers: auth(admin.token), payload: { offersEnabled: true, schoolMode: false } });
    const offer = (
      await app.inject({ method: "POST", url: "/admin/offers", headers: auth(admin.token), payload: { category: "Coding & assessments", partnerName: "Code Lab", title: "Free mock coding test", body: "Practice for placements", url: "https://example.com/test", sortOrder: 5 } })
    ).json();
    const adult = await makeUser(app, "STUDENT", { dateOfBirth: "2004-01-15" });
    const minor = await makeUser(app, "STUDENT", { dateOfBirth: new Date(Date.now() - 16 * 365 * 86_400_000).toISOString().slice(0, 10) });
    const unknown = await makeUser(app, "STUDENT");
    const list = async (t: string) => (await app.inject({ method: "GET", url: "/offers", headers: auth(t) })).json().offers.map((o: { id: string }) => o.id);
    expect(await list(adult.token)).toContain(offer.id);
    expect(await list(minor.token)).toEqual([]);
    expect(await list(unknown.token)).toEqual([]);
    const me = (await app.inject({ method: "GET", url: "/auth/me", headers: auth(adult.token) })).json().user;
    expect(me.showOffers).toBe(true);

    expect((await app.inject({ method: "POST", url: `/offers/${offer.id}/open`, headers: auth(adult.token) })).json().url).toBe("https://example.com/test");
    expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.clicks).toBe(1);

    await app.inject({ method: "PATCH", url: "/admin/settings", headers: auth(admin.token), payload: { offersEnabled: false } });
    forgetSettings();
    expect(await list(adult.token)).toEqual([]);
    await app.inject({ method: "PATCH", url: "/admin/settings", headers: auth(admin.token), payload: { offersEnabled: true } });
  });

  it("occasions: banner for everyone who can see it, tagged offers and listings, minors see only the sale", async () => {
    const admin = await makeUser(app, "ADMIN");
    await app.inject({ method: "PATCH", url: "/admin/settings", headers: auth(admin.token), payload: { offersEnabled: true, schoolMode: false } });
    forgetSettings();
    const bad = await app.inject({ method: "POST", url: "/admin/occasions", headers: auth(admin.token), payload: { name: "Backwards", tagline: "Ends before it starts", startsAt: hours(5), endsAt: hours(1) } });
    expect(bad.statusCode).toBe(400);
    const occ = (
      await app.inject({ method: "POST", url: "/admin/occasions", headers: auth(admin.token), payload: { name: `Diwali ${tag()}`, tagline: "Lights and sweets", theme: "saffron", icon: "flame", startsAt: hours(-1), endsAt: hours(48) } })
    ).json();
    expect(occ.live).toBe(true);
    const later = (
      await app.inject({ method: "POST", url: "/admin/occasions", headers: auth(admin.token), payload: { name: `Exams ${tag()}`, tagline: "Books before finals", startsAt: hours(72), endsAt: hours(200) } })
    ).json();
    const offer = (
      await app.inject({ method: "POST", url: "/admin/offers", headers: auth(admin.token), payload: { category: "Coupons", partnerName: "Sweet shop", title: "15% off sweets", body: "Show the code", couponCode: "SWEET15", showAsBanner: true, occasionId: occ.id } })
    ).json();

    const adult = await makeUser(app, "STUDENT", { dateOfBirth: "2003-05-01" });
    const minor = await makeUser(app, "STUDENT", { dateOfBirth: new Date(Date.now() - 16 * 365 * 86_400_000).toISOString().slice(0, 10) });

    // Listing for a running sale works; for one that hasn't started, it doesn't.
    const sell = (occasionId: string) =>
      app.inject({ method: "POST", url: "/market", headers: auth(adult.token), payload: { title: "Clay diyas set", description: "Hand painted", price: 150, category: "Other", occasionId } });
    expect((await sell(later.id)).statusCode).toBe(400);
    const item = (await sell(occ.id)).json();
    expect(item.occasion).toMatchObject({ id: occ.id });
    await app.inject({ method: "POST", url: `/admin/market/${item.id}/decision`, headers: auth(admin.token), payload: { decision: "APPROVE" } });

    const banners = async (t: string) => (await app.inject({ method: "GET", url: "/banners", headers: auth(t) })).json().banners as { id: string; kind: string }[];
    const adultBanners = (await banners(adult.token)).map((b) => b.id);
    expect(adultBanners).toContain(`occasion:${occ.id}`);
    expect(adultBanners).toContain(`offer:${offer.id}`);
    expect(adultBanners).not.toContain(`occasion:${later.id}`);
    const minorBanners = (await banners(minor.token)).map((b) => b.id);
    expect(minorBanners).toContain(`occasion:${occ.id}`); // the student sale is fine
    expect(minorBanners).not.toContain(`offer:${offer.id}`); // sponsored offers are not

    const page = (await app.inject({ method: "GET", url: `/occasions/${occ.id}`, headers: auth(adult.token) })).json();
    expect(page.offers.map((o: { id: string }) => o.id)).toEqual([offer.id]);
    expect(page.items.map((i: { id: string }) => i.id)).toContain(item.id);
    expect((await app.inject({ method: "GET", url: `/occasions/${occ.id}`, headers: auth(minor.token) })).json().offers).toEqual([]);
    expect((await app.inject({ method: "GET", url: `/market?occasionId=${occ.id}`, headers: auth(minor.token) })).json().items).toHaveLength(1);

    // School mode with offers off: no banners at all.
    await app.inject({ method: "PATCH", url: "/admin/settings", headers: auth(admin.token), payload: { schoolMode: true, offersEnabled: false } });
    forgetSettings();
    expect(await banners(adult.token)).toEqual([]);
    await app.inject({ method: "PATCH", url: "/admin/settings", headers: auth(admin.token), payload: { schoolMode: false, offersEnabled: true } });
    forgetSettings();

    // Ending an occasion takes its banner down.
    await app.inject({ method: "PATCH", url: `/admin/occasions/${occ.id}`, headers: auth(admin.token), payload: { active: false } });
    expect((await banners(adult.token)).map((b) => b.id)).not.toContain(`occasion:${occ.id}`);
    expect((await app.inject({ method: "GET", url: "/admin/occasions", headers: auth(admin.token) })).json().occasions.find((o: { id: string }) => o.id === occ.id)).toMatchObject({ offers: 1, items: 1, active: false });
  });
});
