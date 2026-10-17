import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

let app: FastifyInstance;

function uniqueEmail(): string {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("auth", () => {
  it("registers, logs in, and returns the current user", async () => {
    const email = uniqueEmail();

    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password: "password123" },
    });
    expect(register.statusCode).toBe(201);
    const registered = register.json();
    expect(registered.user.email).toBe(email);
    expect(registered.accessToken).toEqual(expect.any(String));

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "password123" },
    });
    expect(login.statusCode).toBe(200);
    const token = login.json().accessToken;

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.id).toBe(registered.user.id);
  });

  it("rejects a duplicate email", async () => {
    const email = uniqueEmail();
    const payload = { email, password: "password123" };

    const first = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects a wrong password", async () => {
    const email = uniqueEmail();
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password: "password123" },
    });

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "wrong-password" },
    });
    expect(login.statusCode).toBe(401);
    expect(login.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects malformed input", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "not-an-email", password: "short" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects protected routes without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
  });
});
