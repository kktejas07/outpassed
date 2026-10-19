import type { Prisma } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { prisma } from "./prisma";

export type AuditTarget = { type: string; id: string };

/**
 * Records who did what. Awaited so the entry exists when the request
 * finishes, but a failure to write it never fails the action itself.
 */
export async function audit(
  request: FastifyRequest,
  action: string,
  summary: string,
  target?: AuditTarget,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    const actor = await prisma.user.findUnique({ where: { id: request.user.sub }, select: { name: true } });
    await prisma.auditLog.create({
      data: {
        actorId: request.user.sub,
        actorName: actor?.name ?? request.user.email,
        actorRole: request.user.role,
        action,
        summary,
        targetType: target?.type ?? null,
        targetId: target?.id ?? null,
        meta: meta as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.warn("audit write failed", err);
  }
}
