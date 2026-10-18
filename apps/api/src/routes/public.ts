import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PublicVisitPass } from "@outpassed/shared";
import { env } from "../env";
import { issueQrToken } from "../domain/qrToken";
import { prisma } from "../lib/prisma";
import { HttpError } from "../plugins/errorHandler";

/**
 * Routes that need no sign-in. The visitor's pass link carries an
 * unguessable token; the page shows the QR and 6-digit code for the gate.
 */
export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/public/visit-pass/:token", async (request, reply) => {
    const { token } = z.object({ token: z.string().min(16).max(64) }).parse(request.params);
    const visit = await prisma.visit.findUnique({ where: { passToken: token }, include: { host: true } });
    if (!visit) throw new HttpError(404, "NOT_FOUND", "This pass link isn't valid");
    const usable = visit.status === "APPROVED" || visit.status === "CHECKED_IN";
    const pass: PublicVisitPass = {
      visitorName: visit.visitorName,
      hostName: visit.host.name,
      purpose: visit.purpose,
      status: visit.status,
      validFrom: visit.validFrom.toISOString(),
      validTo: visit.validTo.toISOString(),
      code: usable ? visit.code : "",
      qrToken: usable && visit.validTo > new Date() ? issueQrToken(visit.id, "VISIT", env.QR_SECRET) : null,
      campus: { name: env.CAMPUS_NAME, address: env.CAMPUS_ADDRESS },
    };
    reply.header("cache-control", "no-store");
    return pass;
  });
}
