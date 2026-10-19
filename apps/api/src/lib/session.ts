import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { StudentProfile, User, UserPhoto } from "@prisma/client";
import type { AuthResponse } from "@outpassed/shared";
import { env } from "../env";
import { HttpError } from "../plugins/errorHandler";
import { toUserDto, userInclude } from "./dto";
import { prisma } from "./prisma";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

type FullUser = Parameters<typeof toUserDto>[0];

async function newRefresh(userId: string, familyId: string) {
  const token = randomBytes(32).toString("base64url");
  await prisma.refreshToken.create({
    data: { userId, familyId, tokenHash: hash(token), expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000) },
  });
  return token;
}

/** A short access token plus a refresh token that renews it. */
export async function issueSession(app: FastifyInstance, user: FullUser): Promise<AuthResponse> {
  return {
    accessToken: app.jwt.sign({ sub: user.id, email: user.email, role: user.role }),
    refreshToken: await newRefresh(user.id, randomUUID()),
    user: toUserDto(user),
  };
}

/**
 * Swaps a refresh token for a new pair. Each refresh token works once; if an
 * old one is presented again (a stolen copy), every session in its family ends.
 */
export async function rotateSession(app: FastifyInstance, token: string): Promise<AuthResponse> {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hash(token) } });
  const expired = new HttpError(401, "SESSION_EXPIRED", "Please sign in again");
  if (!row) throw expired;
  if (row.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw expired;
  }
  if (row.expiresAt < new Date()) throw expired;
  const used = await prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (used.count === 0) throw expired;
  const user = await prisma.user.findUnique({ where: { id: row.userId }, include: userInclude });
  if (!user) throw expired;
  return {
    accessToken: app.jwt.sign({ sub: user.id, email: user.email, role: user.role }),
    refreshToken: await newRefresh(user.id, row.familyId),
    user: toUserDto(user),
  };
}

export async function endSession(token: string): Promise<void> {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hash(token) } });
  if (row) await prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}
