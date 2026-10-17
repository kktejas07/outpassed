import type { FastifyInstance } from "fastify";
import { prisma } from "../../src/lib/prisma";

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

type Role = "STUDENT" | "PARENT" | "WARDEN" | "GUARD" | "ADMIN";

/** Creates a user of any role and returns a token. Staff are inserted directly, then logged in. */
export async function makeUser(
  app: FastifyInstance,
  role: Role,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; token: string; email: string }> {
  const email = uniqueEmail(role.toLowerCase());
  const password = "password123";
  if (role === "STUDENT" || role === "PARENT") {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password, name: `Test ${role}`, role, ...extra },
    });
    if (res.statusCode !== 201) throw new Error(res.body);
    const body = res.json();
    return { id: body.user.id, token: body.accessToken, email };
  }
  const argon2 = (await import("argon2")).default;
  const user = await prisma.user.create({
    data: { email, name: `Test ${role}`, role, passwordHash: await argon2.hash(password) },
  });
  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
  return { id: user.id, token: login.json().accessToken, email };
}

export async function linkGuardian(studentId: string, parentId: string): Promise<void> {
  await prisma.guardianship.create({ data: { studentId, parentId, relation: "Parent" } });
}

export const hours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();
