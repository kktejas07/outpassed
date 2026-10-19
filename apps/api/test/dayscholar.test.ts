import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
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
const kinds = async (userId: string) => {
  await drainNotifications();
  return (await prisma.notification.findMany({ where: { userId }, select: { kind: true } })).map((n) => n.kind);
};
const pass = (o: Record<string, unknown> = {}) => ({ type: "LOCAL", destination: "Dentist, MG Road", reason: "Appointment", leaveAt: hours(0), returnBy: hours(3), ...o });

async function staff(role: "FACULTY" | "ADMIN", departmentId?: string) {
  const u = await makeUser(app, "WARDEN");
  await prisma.user.update({ where: { id: u.id }, data: { role, departmentId: departmentId ?? null } });
  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: u.email, password: "password123" } });
  return { ...u, token: login.json().accessToken as string };
}

async function department() {
  const admin = await staff("ADMIN");
  const dept = (await app.inject({ method: "POST", url: "/admin/departments", headers: auth(admin.token), payload: { name: `Day ${tag()}`, code: "DS" } })).json();
  const hod = await staff("FACULTY", dept.id);
  await app.inject({ method: "PATCH", url: `/admin/departments/${dept.id}`, headers: auth(admin.token), payload: { hodId: hod.id } });
  return { admin, dept, hod };
}

describe("day scholars", () => {
  it("register without a hostel and show as day scholars", async () => {
    const s = await makeUser(app, "STUDENT", { rollNo: `D${tag()}`, residence: "DAY_SCHOLAR", room: "12" });
    const me = (await app.inject({ method: "GET", url: "/auth/me", headers: auth(s.token) })).json();
    expect(me.user.student).toMatchObject({ residence: "DAY_SCHOLAR", room: null, hostelId: null });
  });

  it("go to their HOD when no faculty is picked; HOD approval is final and the parent is told", async () => {
    const { dept, hod } = await department();
    const s = await makeUser(app, "STUDENT", { rollNo: `D${tag()}`, residence: "DAY_SCHOLAR", departmentId: dept.id });
    const parent = await makeUser(app, "PARENT");
    await linkGuardian(s.id, parent.id);

    const created = (await app.inject({ method: "POST", url: "/outpasses", headers: auth(s.token), payload: pass() })).json();
    expect(created.status).toBe("PENDING_FACULTY");
    expect(created.student.residence).toBe("DAY_SCHOLAR");
    expect(await kinds(hod.id)).toContain("OUTPASS_NEEDS_FACULTY");
    expect(await kinds(parent.id)).toContain("OUTPASS_FOR_PARENT_INFO");

    const decided = await app.inject({ method: "POST", url: `/outpasses/${created.id}/decision`, headers: auth(hod.token), payload: { decision: "APPROVE" } });
    expect(decided.json().status).toBe("APPROVED");
    // The parent was told, not asked.
    const queue = (await app.inject({ method: "GET", url: "/outpasses?scope=actionable", headers: auth(parent.token) })).json();
    expect(queue.outpasses.map((o: { id: string }) => o.id)).not.toContain(created.id);
  });

  it("go to admins when the department has no HOD", async () => {
    const s = await makeUser(app, "STUDENT", { rollNo: `D${tag()}`, residence: "DAY_SCHOLAR" });
    const created = (await app.inject({ method: "POST", url: "/outpasses", headers: auth(s.token), payload: pass() })).json();
    expect(created.status).toBe("PENDING_WARDEN");
  });

  it("can't use the hostel helpdesk", async () => {
    const s = await makeUser(app, "STUDENT", { rollNo: `D${tag()}`, residence: "DAY_SCHOLAR" });
    const res = await app.inject({ method: "POST", url: "/tickets", headers: auth(s.token), payload: { category: "Water", title: "No water", details: "Tap is dry" } });
    expect(res.statusCode).toBe(403);
  });

  it("admins can switch residence, and fees can target all day scholars", async () => {
    const admin = await staff("ADMIN");
    const hostel = (await app.inject({ method: "POST", url: "/admin/hostels", headers: auth(admin.token), payload: { name: `Res Block ${tag()}` } })).json();
    const s = await makeUser(app, "STUDENT", { rollNo: `D${tag()}`, hostelId: hostel.id, room: "101" });
    const switched = await app.inject({ method: "PUT", url: `/admin/users/${s.id}/residence`, headers: auth(admin.token), payload: { residence: "DAY_SCHOLAR" } });
    expect(switched.statusCode).toBe(200);
    expect(switched.json().student).toMatchObject({ residence: "DAY_SCHOLAR", hostelId: null, room: null });

    const res = await app.inject({ method: "POST", url: "/admin/fees", headers: auth(admin.token), payload: { category: "BUS", title: `Bus ${tag()}`, amountPaise: 180000, dueDate: hours(72).slice(0, 10), target: { residence: "DAY_SCHOLAR" } } });
    expect(res.statusCode).toBe(201);
    const mine = (await app.inject({ method: "GET", url: "/fees", headers: auth(s.token) })).json();
    expect(mine.fees.some((f: { category: string }) => f.category === "BUS")).toBe(true);
  });

  it("CSV import reads a Residence column and treats rows with no hostel as day scholars", async () => {
    const admin = await staff("ADMIN");
    const t = tag();
    const csv = ["Name,Roll No,Email,Hostel,Room,Residence", `Hostel Kid,IMR${t}A,a-${t}@example.com,Imp ${t},5,`, `Home Kid,IMR${t}B,b-${t}@example.com,,,`, `Bus Kid,IMR${t}C,c-${t}@example.com,Imp ${t},6,Day scholar`].join("\n");
    const run = await app.inject({ method: "POST", url: "/admin/import/students", headers: auth(admin.token), payload: { csv, dryRun: false } });
    expect(run.json().summary).toMatchObject({ created: 3, errors: 0 });
    const rows = await prisma.studentProfile.findMany({ where: { rollNo: { startsWith: `IMR${t}` } }, orderBy: { rollNo: "asc" } });
    expect(rows.map((r) => [r.residence, r.hostelId ? "hostel" : null])).toEqual([["HOSTELLER", "hostel"], ["DAY_SCHOLAR", null], ["DAY_SCHOLAR", null]]);
  });
});
