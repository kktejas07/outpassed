import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { setPushSender, type PushMessage } from "../src/lib/notify";
import { sweepOverdue } from "../src/lib/overdue";
import { prisma } from "../src/lib/prisma";
import { auth, hours, linkGuardian, makeUser } from "./helpers/setup";

let app: FastifyInstance;
const pushes: PushMessage[] = [];

beforeAll(async () => {
  setPushSender(async (m) => {
    pushes.push(...m);
    return { invalidTokens: m.filter((x) => x.to.includes("dead")).map((x) => x.to) };
  });
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  setPushSender(null);
  await app.close();
  await prisma.$disconnect();
});

const settle = () => new Promise((r) => setTimeout(r, 150));

async function inbox(token: string) {
  return (await app.inject({ method: "GET", url: "/notifications", headers: auth(token) })).json();
}

describe("notifications", () => {
  it("walks the approval chain and tells each person", async () => {
    const student = await makeUser(app, "STUDENT");
    const parent = await makeUser(app, "PARENT");
    const warden = await makeUser(app, "WARDEN");
    const guard = await makeUser(app, "GUARD");
    await linkGuardian(student.id, parent.id);
    await app.inject({ method: "POST", url: "/devices", headers: auth(parent.token), payload: { token: `ExponentPushToken[${randomUUID()}]`, platform: "android" } });

    const pass = (
      await app.inject({
        method: "POST",
        url: "/outpasses",
        headers: auth(student.token),
        payload: { type: "LOCAL", destination: "Market", reason: "Groceries", leaveAt: hours(0), returnBy: hours(3) },
      })
    ).json();
    await settle();
    const p1 = await inbox(parent.token);
    expect(p1.unread).toBe(1);
    expect(p1.notifications[0]).toMatchObject({ kind: "OUTPASS_NEEDS_PARENT", data: { outpassId: pass.id } });
    expect(pushes.some((m) => m.title.includes("asking to go out"))).toBe(true);

    await app.inject({ method: "POST", url: `/outpasses/${pass.id}/decision`, headers: auth(parent.token), payload: { decision: "APPROVE" } });
    await settle();
    expect((await inbox(warden.token)).notifications.some((n: { kind: string }) => n.kind === "OUTPASS_NEEDS_WARDEN")).toBe(true);
    expect((await inbox(student.token)).notifications[0].kind).toBe("OUTPASS_PARENT_APPROVED");

    await app.inject({ method: "POST", url: `/outpasses/${pass.id}/decision`, headers: auth(warden.token), payload: { decision: "APPROVE" } });
    await settle();
    expect((await inbox(student.token)).notifications[0].kind).toBe("OUTPASS_APPROVED");

    await app.inject({
      method: "POST",
      url: "/gate/events",
      headers: auth(guard.token),
      payload: { eventId: randomUUID(), outpassId: pass.id, direction: "EXIT", photoMatched: true },
    });
    await settle();
    expect((await inbox(parent.token)).notifications[0]).toMatchObject({ kind: "STUDENT_LEFT" });

    const read = await app.inject({ method: "POST", url: "/notifications/read", headers: auth(parent.token), payload: {} });
    expect(read.json().updated).toBeGreaterThan(0);
    expect((await inbox(parent.token)).unread).toBe(0);
  });

  it("alerts once when a student is overdue", async () => {
    const student = await makeUser(app, "STUDENT");
    const parent = await makeUser(app, "PARENT");
    await linkGuardian(student.id, parent.id);
    const row = await prisma.outpass.create({
      data: { studentId: student.id, type: "LOCAL", destination: "Cinema", reason: "Movie", leaveAt: new Date(Date.now() - 5 * 3_600_000), returnBy: new Date(Date.now() - 60_000), status: "OUT", exitedAt: new Date() },
    });
    expect(await sweepOverdue()).toBeGreaterThanOrEqual(1);
    await sweepOverdue();
    const kinds = (await inbox(parent.token)).notifications.filter((n: { kind: string; data: { outpassId: string } }) => n.kind === "STUDENT_OVERDUE" && n.data.outpassId === row.id);
    expect(kinds).toHaveLength(1);
    expect((await inbox(student.token)).notifications[0].kind).toBe("STUDENT_OVERDUE");
  });

  it("drops push tokens Expo says are gone and moves tokens between accounts", async () => {
    const a = await makeUser(app, "PARENT");
    const b = await makeUser(app, "PARENT");
    const token = `ExponentPushToken[dead-${randomUUID()}]`;
    await app.inject({ method: "POST", url: "/devices", headers: auth(a.token), payload: { token, platform: "ios" } });
    await app.inject({ method: "POST", url: "/devices", headers: auth(b.token), payload: { token, platform: "ios" } });
    expect((await prisma.pushToken.findUniqueOrThrow({ where: { token } })).userId).toBe(b.id);
    const { notify } = await import("../src/lib/notify");
    await notify([b.id], { kind: "VISIT_DECIDED", title: "t", body: "b" });
    expect(await prisma.pushToken.count({ where: { token } })).toBe(0);
  });
});
