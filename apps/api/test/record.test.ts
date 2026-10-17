import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

let app: FastifyInstance;

async function createUser(): Promise<{ token: string; id: string }> {
  const email = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "password123" },
  });
  const body = res.json();
  return { token: body.accessToken, id: body.user.id };
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("records CRUD", () => {
  it("creates, lists, reads, updates, and deletes a record as its owner", async () => {
    const { token } = await createUser();
    const auth = { authorization: `Bearer ${token}` };

    const created = await app.inject({
      method: "POST",
      url: "/records",
      headers: auth,
      payload: { title: "First record", description: "hello" },
    });
    expect(created.statusCode).toBe(201);
    const record = created.json();
    expect(record).toMatchObject({
      title: "First record",
      description: "hello",
      status: "active",
    });

    const list = await app.inject({ method: "GET", url: "/records", headers: auth });
    expect(list.statusCode).toBe(200);
    expect(list.json().records.map((r: { id: string }) => r.id)).toContain(record.id);

    const read = await app.inject({
      method: "GET",
      url: `/records/${record.id}`,
      headers: auth,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().id).toBe(record.id);

    const updated = await app.inject({
      method: "PATCH",
      url: `/records/${record.id}`,
      headers: auth,
      payload: { title: "Updated", status: "archived" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ title: "Updated", status: "archived" });

    const deleted = await app.inject({
      method: "DELETE",
      url: `/records/${record.id}`,
      headers: auth,
    });
    expect(deleted.statusCode).toBe(204);

    const afterDelete = await app.inject({
      method: "GET",
      url: `/records/${record.id}`,
      headers: auth,
    });
    expect(afterDelete.statusCode).toBe(404);
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/records" });
    expect(res.statusCode).toBe(401);
  });

  it("does not let a user read, update, or delete another user's record", async () => {
    const owner = await createUser();
    const intruder = await createUser();

    const created = await app.inject({
      method: "POST",
      url: "/records",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { title: "Private" },
    });
    const id = created.json().id;
    const intruderAuth = { authorization: `Bearer ${intruder.token}` };

    const read = await app.inject({
      method: "GET",
      url: `/records/${id}`,
      headers: intruderAuth,
    });
    expect(read.statusCode).toBe(404);

    const update = await app.inject({
      method: "PATCH",
      url: `/records/${id}`,
      headers: intruderAuth,
      payload: { title: "Hacked" },
    });
    expect(update.statusCode).toBe(404);

    const remove = await app.inject({
      method: "DELETE",
      url: `/records/${id}`,
      headers: intruderAuth,
    });
    expect(remove.statusCode).toBe(404);

    const list = await app.inject({
      method: "GET",
      url: "/records",
      headers: intruderAuth,
    });
    expect(list.json().records).toHaveLength(0);
  });

  it("rejects an invalid record id", async () => {
    const { token } = await createUser();
    const res = await app.inject({
      method: "GET",
      url: "/records/not-a-uuid",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
