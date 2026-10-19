import { timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { setupSchema, type SetupStatus } from "@outpassed/shared";
import { env } from "../env";
import { ensureHostel } from "../lib/hostels";
import { prisma } from "../lib/prisma";
import { issueSession } from "../lib/session";
import { HttpError } from "../plugins/errorHandler";

const tokenRequired = () => env.NODE_ENV === "production" || Boolean(env.SETUP_TOKEN);

function tokenOk(given: string | undefined): boolean {
  if (!env.SETUP_TOKEN) return env.NODE_ENV !== "production";
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(env.SETUP_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * First-time setup for a new college: its name, the first admin account and
 * its hostels. Works only until an admin exists.
 */
export async function setupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/setup", async () => {
    const [admins, institution] = await Promise.all([
      prisma.user.count({ where: { role: "ADMIN" } }),
      prisma.institution.findUnique({ where: { id: 1 } }),
    ]);
    const status: SetupStatus = {
      needsSetup: admins === 0,
      tokenRequired: tokenRequired(),
      institution: institution ? { name: institution.name, address: institution.address } : null,
    };
    return status;
  });

  app.post("/setup", async (request, reply) => {
    const body = setupSchema.parse(request.body);
    if (!tokenOk(body.setupToken)) {
      throw new HttpError(403, env.SETUP_TOKEN ? "BAD_SETUP_TOKEN" : "SETUP_TOKEN_MISSING", env.SETUP_TOKEN ? "That setup key is wrong" : "Set SETUP_TOKEN on the server to run setup");
    }
    const email = body.adminEmail.toLowerCase();
    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
    const user = await prisma.$transaction(async (tx) => {
      // Re-checked inside the transaction so two setups can't both win.
      if ((await tx.user.count({ where: { role: "ADMIN" } })) > 0) {
        throw new HttpError(409, "ALREADY_SET_UP", "This campus is already set up. Sign in instead.");
      }
      if (await tx.user.findUnique({ where: { email } })) {
        throw new HttpError(409, "EMAIL_TAKEN", "Email is already registered");
      }
      await tx.institution.upsert({
        where: { id: 1 },
        create: { id: 1, name: body.institutionName, address: body.address },
        update: { name: body.institutionName, address: body.address },
      });
      return tx.user.create({
        data: { email, passwordHash, name: body.adminName, role: "ADMIN" },
        include: { student: true },
      });
    });
    for (const name of body.hostels) await ensureHostel(name);
    return reply.status(201).send(await issueSession(app, user));
  });
}

/** Campus name and address for visitor passes: the setup record, else the env defaults. */
export async function campusInfo(): Promise<{ name: string; address: string }> {
  const row = await prisma.institution.findUnique({ where: { id: 1 } });
  return row ? { name: row.name, address: row.address } : { name: env.CAMPUS_NAME, address: env.CAMPUS_ADDRESS };
}
