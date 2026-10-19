import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { setBlobStore, type BlobStore } from "../src/lib/blobStore";
import { drainNotifications } from "../src/lib/notify";
import { setPaymentGateway } from "../src/lib/payments";
import { prisma } from "../src/lib/prisma";
import { auth, hours, linkGuardian, makeUser } from "./helpers/setup";

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  setBlobStore(null);
  setPaymentGateway(null);
  await app.close();
  await prisma.$disconnect();
});

const img = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 5)]).toString("base64");
const roll = () => `P${Date.now()}${Math.floor(Math.random() * 1e4)}`;
const kinds = async (userId: string) => {
  await drainNotifications();
  return (await prisma.notification.findMany({ where: { userId }, select: { kind: true } })).map((n) => n.kind);
};
const get = (url: string) => app.inject({ method: "GET", url });

describe("fees in parts, with receipts", () => {
  it("a fee that allows parts is paid in two goes; each payment gets a numbered PDF receipt", async () => {
    const admin = await makeUser(app, "ADMIN");
    const student = await makeUser(app, "STUDENT", { rollNo: roll() });
    const parent = await makeUser(app, "PARENT");
    await linkGuardian(student.id, parent.id);
    const due = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await app.inject({ method: "POST", url: "/admin/fees", headers: auth(admin.token), payload: { category: "HOSTEL", title: "Hostel fee in parts", amountPaise: 4_500_000, dueDate: due, allowParts: true, target: { studentIds: [student.id] } } });
    await app.inject({ method: "POST", url: "/admin/fees", headers: auth(admin.token), payload: { category: "BUS", title: "Bus fee whole", amountPaise: 180_000, dueDate: due, target: { studentIds: [student.id] } } });
    const list = (await app.inject({ method: "GET", url: "/fees", headers: auth(student.token) })).json();
    const hostel = list.fees.find((f: { title: string }) => f.title === "Hostel fee in parts");
    const bus = list.fees.find((f: { title: string }) => f.title === "Bus fee whole");
    expect(hostel).toMatchObject({ allowParts: true, paidPaise: 0, remainingPaise: 4_500_000 });

    // Part-payments only where the office allows them, and within limits.
    expect((await app.inject({ method: "POST", url: `/fees/${bus.id}/proof`, headers: auth(student.token), payload: { image: img(), reference: "UTR123456", amountPaise: 50_000 } })).json().error.code).toBe("NO_PART_PAYMENTS");
    expect((await app.inject({ method: "POST", url: `/fees/${hostel.id}/proof`, headers: auth(student.token), payload: { image: img(), reference: "UTR123456", amountPaise: 5_000_000 } })).json().error.code).toBe("BAD_AMOUNT");

    // First part by screenshot: ₹20,000.
    const sent = await app.inject({ method: "POST", url: `/fees/${hostel.id}/proof`, headers: auth(student.token), payload: { image: img(), reference: "UTR100200", amountPaise: 2_000_000 } });
    expect(sent.statusCode).toBe(201);
    const proofId = sent.json().payments[0].id;
    const reviewed = (await app.inject({ method: "POST", url: `/admin/fee-payments/${proofId}/review`, headers: auth(admin.token), payload: { decision: "APPROVE" } })).json();
    expect(reviewed).toMatchObject({ status: "DUE", paidPaise: 2_000_000, remainingPaise: 2_500_000 });
    const first = reviewed.payments.find((p: { id: string }) => p.id === proofId);
    expect(first.receiptNo).toBeGreaterThan(1000);
    expect(await kinds(parent.id)).toContain("FEE_PAID");

    // The receipt opens as a PDF from its signed link.
    const pdf = await get(first.receiptUrl);
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await get(first.receiptUrl.replace(/sig=[^&]+/, "sig=forgedsignature123"))).statusCode).toBe(403);

    // The rest online through a (fake) gateway: the link is for what's left.
    let asked = 0;
    setPaymentGateway({ createLink: async (l) => ((asked = l.amountPaise), { id: `plink_${randomUUID()}`, url: "https://rzp.io/i/t" }), linkStatus: async () => ({ status: "paid", paymentId: "pay_rest" }) });
    await app.inject({ method: "POST", url: `/fees/${hostel.id}/pay`, headers: auth(parent.token), payload: {} });
    expect(asked).toBe(2_500_000);
    const done = (await app.inject({ method: "POST", url: `/fees/${hostel.id}/check`, headers: auth(parent.token) })).json();
    expect(done).toMatchObject({ status: "PAID", paidPaise: 4_500_000, remainingPaise: 0 });
    const receipts = done.payments.filter((p: { receiptNo: number | null }) => p.receiptNo).map((p: { receiptNo: number }) => p.receiptNo);
    expect(new Set(receipts).size).toBe(2);
    setPaymentGateway(null);

    // Totals count only what's still owed.
    const after = (await app.inject({ method: "GET", url: "/fees", headers: auth(student.token) })).json();
    expect(after.totals.duePaise).toBe(180_000);

    // The office can take part of any fee at the counter.
    const counter = (await app.inject({ method: "POST", url: `/admin/fees/${bus.id}/mark-paid`, headers: auth(admin.token), payload: { amountPaise: 80_000, reference: "Cash" } })).json();
    expect(counter).toMatchObject({ status: "DUE", remainingPaise: 100_000 });
  });
});

describe("hostel helpdesk", () => {
  it("student raises, warden of that hostel works it, student confirms or reopens", async () => {
    const hostelA = await prisma.hostel.create({ data: { name: `Helpdesk A ${randomUUID().slice(0, 6)}` } });
    const hostelB = await prisma.hostel.create({ data: { name: `Helpdesk B ${randomUUID().slice(0, 6)}` } });
    const student = await makeUser(app, "STUDENT", { rollNo: roll() });
    await prisma.studentProfile.update({ where: { userId: student.id }, data: { hostelId: hostelA.id, hostel: hostelA.name, room: "214" } });
    const wardenA = await makeUser(app, "WARDEN");
    const wardenB = await makeUser(app, "WARDEN");
    await prisma.wardenHostel.create({ data: { userId: wardenA.id, hostelId: hostelA.id } });
    await prisma.wardenHostel.create({ data: { userId: wardenB.id, hostelId: hostelB.id } });
    const other = await makeUser(app, "STUDENT", { rollNo: roll() });

    const created = await app.inject({ method: "POST", url: "/tickets", headers: auth(student.token), payload: { category: "Water", title: "No water on 2nd floor", details: "Taps dry since morning", photo: img() } });
    expect(created.statusCode).toBe(201);
    const t = created.json();
    expect(t).toMatchObject({ status: "OPEN", location: "Room 214", hostel: { id: hostelA.id } });
    expect(t.number).toBeGreaterThan(0);
    expect(await kinds(wardenA.id)).toContain("TICKET_NEW");
    expect(await kinds(wardenB.id)).not.toContain("TICKET_NEW");
    expect((await get(t.photoUrl)).statusCode).toBe(200);

    // Only the right people can see it.
    expect((await app.inject({ method: "GET", url: `/tickets/${t.id}`, headers: auth(other.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/tickets/${t.id}`, headers: auth(wardenB.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/tickets", headers: auth(wardenA.token) })).json().tickets.map((x: { id: string }) => x.id)).toContain(t.id);

    // Students can't mark their own request fixed.
    expect((await app.inject({ method: "POST", url: `/tickets/${t.id}/updates`, headers: auth(student.token), payload: { status: "RESOLVED", body: "done" } })).statusCode).toBe(403);
    // Warden picks it up (and owns it), then fixes it with a note.
    expect((await app.inject({ method: "POST", url: `/tickets/${t.id}/updates`, headers: auth(wardenA.token), payload: { status: "IN_PROGRESS", body: "Plumber called" } })).json()).toMatchObject({ status: "IN_PROGRESS", assignedTo: { id: wardenA.id } });
    expect((await app.inject({ method: "POST", url: `/tickets/${t.id}/updates`, headers: auth(wardenA.token), payload: { status: "RESOLVED" } })).json().error.code).toBe("NOTE_REQUIRED");
    await app.inject({ method: "POST", url: `/tickets/${t.id}/updates`, headers: auth(wardenA.token), payload: { status: "RESOLVED", body: "Pump fixed" } });
    expect(await kinds(student.id)).toContain("TICKET_UPDATE");

    // Student reopens it, the warden fixes it again, the student confirms.
    const detail = (await app.inject({ method: "GET", url: `/tickets/${t.id}`, headers: auth(student.token) })).json();
    expect(detail.canReopen).toBe(true);
    expect(detail.history.map((h: { status: string | null }) => h.status)).toEqual(["IN_PROGRESS", "RESOLVED"]);
    expect((await app.inject({ method: "POST", url: `/tickets/${t.id}/updates`, headers: auth(student.token), payload: { status: "OPEN", body: "Still dry in the evening" } })).json().status).toBe("OPEN");
    await app.inject({ method: "POST", url: `/tickets/${t.id}/updates`, headers: auth(wardenA.token), payload: { status: "RESOLVED", body: "Valve replaced" } });
    expect((await app.inject({ method: "POST", url: `/tickets/${t.id}/updates`, headers: auth(student.token), payload: { status: "CLOSED" } })).json().status).toBe("CLOSED");
    expect((await app.inject({ method: "GET", url: "/tickets?status=CLOSED", headers: auth(student.token) })).json().counts.CLOSED).toBe(1);
  });
});

describe("sponsor report", () => {
  it("counts taps per offer per day, totals only", async () => {
    const admin = await makeUser(app, "ADMIN");
    await app.inject({ method: "PATCH", url: "/admin/settings", headers: auth(admin.token), payload: { offersEnabled: true, schoolMode: false } });
    const offer = (await app.inject({ method: "POST", url: "/admin/offers", headers: auth(admin.token), payload: { category: "Coupons", partnerName: `Shop ${randomUUID().slice(0, 4)}`, title: "10% off", body: "At the counter" } })).json();
    const adult = await makeUser(app, "STUDENT", { dateOfBirth: "2003-01-01" });
    for (let i = 0; i < 3; i++) await app.inject({ method: "POST", url: `/offers/${offer.id}/open`, headers: auth(adult.token) });
    const report = (await app.inject({ method: "GET", url: "/admin/offers/report", headers: auth(admin.token) })).json();
    const row = report.offers.find((o: { id: string }) => o.id === offer.id);
    expect(row.taps).toBe(3);
    expect(Object.values(row.days)).toEqual([3]);
    expect(report.daysInMonth).toBeGreaterThanOrEqual(28);
    expect((await app.inject({ method: "GET", url: "/admin/offers/report?month=2026-13", headers: auth(admin.token) })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/admin/offers/report", headers: auth(adult.token) })).statusCode).toBe(403);
  });
});

describe("photo bucket", () => {
  it("with a bucket, photos go there (not the database), read back the same, and are deleted with consent withdrawal", async () => {
    const mem = new Map<string, Uint8Array>();
    const bucket: BlobStore = { put: async (k, d) => void mem.set(k, d), get: async (k) => mem.get(k) ?? null, delete: async (k) => void mem.delete(k) };
    setBlobStore(bucket);
    try {
      const student = await makeUser(app, "STUDENT", { rollNo: roll(), dateOfBirth: new Date(Date.now() - 16 * 365 * 86_400_000).toISOString().slice(0, 10) });
      const parent = await makeUser(app, "PARENT");
      await linkGuardian(student.id, parent.id);
      await app.inject({ method: "POST", url: `/consent/${student.id}`, headers: auth(parent.token), payload: { agree: true } });
      const up = (await app.inject({ method: "PUT", url: "/me/photo", headers: auth(student.token), payload: { image: img() } })).json();
      const row = await prisma.userPhoto.findUniqueOrThrow({ where: { userId: student.id } });
      expect(row.data).toBeNull();
      expect(row.storageKey).toMatch(/^profile\//);
      const served = await get(up.photoUrl);
      expect(served.statusCode).toBe(200);
      expect(served.rawPayload.equals(Buffer.from(img(), "base64"))).toBe(true);

      // A gate photo also lands in the bucket.
      const warden = await makeUser(app, "WARDEN");
      const pass = await prisma.outpass.create({ data: { studentId: student.id, type: "LOCAL", destination: "Market", reason: "x", leaveAt: new Date(hours(-0.5)), returnBy: new Date(hours(2)), status: "APPROVED", approvals: { create: { step: "WARDEN", decision: "APPROVE", approverId: warden.id } } } });
      const guard = await makeUser(app, "GUARD");
      const eventId = randomUUID();
      await app.inject({ method: "POST", url: "/gate/events", headers: auth(guard.token), payload: { eventId, outpassId: pass.id, direction: "EXIT", gate: "Main Gate", method: "MANUAL" } });
      await app.inject({ method: "PUT", url: `/gate/events/${eventId}/photo`, headers: auth(guard.token), payload: { image: img() } });
      expect((await prisma.gatePhoto.findUniqueOrThrow({ where: { gateEventId: eventId } })).storageKey).toMatch(/^gate\//);
      expect(mem.size).toBe(2);

      // Withdrawing consent deletes the bucket copies too.
      await app.inject({ method: "DELETE", url: `/consent/${student.id}`, headers: auth(parent.token) });
      expect(mem.size).toBe(0);
    } finally {
      setBlobStore(null);
    }
  });
});
