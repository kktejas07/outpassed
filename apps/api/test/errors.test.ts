import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { auth, makeUser } from "./helpers/setup";

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("app crash reports", () => {
  it("accepts reports signed in or not, and rejects junk", async () => {
    const anon = await app.inject({ method: "POST", url: "/client-errors", payload: { message: "Cannot read properties of undefined", platform: "web", screen: "/login" } });
    expect(anon.statusCode).toBe(202);
    const student = await makeUser(app, "STUDENT");
    const signedIn = await app.inject({ method: "POST", url: "/client-errors", headers: auth(student.token), payload: { message: "Boom", stack: "at x", platform: "android", fatal: true, appVersion: "0.1.0" } });
    expect(signedIn.statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: "/client-errors", payload: { message: "", platform: "web" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/client-errors", payload: { message: "x", platform: "windows" } })).statusCode).toBe(400);
  });
});
