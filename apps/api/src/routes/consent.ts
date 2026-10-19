import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../lib/audit";
import { CONSENT_VERSION, consentState, deleteStudentPhotos } from "../lib/consent";
import { notifyLater } from "../lib/notify";
import { prisma } from "../lib/prisma";
import { campusSettings } from "../lib/settings";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";

const studentParam = z.object({ studentId: z.uuid() });

/**
 * Photo consent for students under 18 (and everyone on a school campus).
 * Any linked guardian can agree or withdraw; withdrawing deletes the photos.
 */
export async function consentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /** Parents: one row per child. Students: their own. */
  app.get("/consent", async (request) => {
    requireRole(request, "PARENT", "STUDENT");
    const { schoolMode, photoRetentionDays } = await campusSettings();
    const ids =
      request.user.role === "STUDENT"
        ? [request.user.sub]
        : (await prisma.guardianship.findMany({ where: { parentId: request.user.sub }, select: { studentId: true }, orderBy: { priority: "asc" } })).map((g) => g.studentId);
    const students = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, student: { select: { dateOfBirth: true } }, photoConsent: { include: { guardian: { select: { name: true } } } } },
    });
    return {
      version: CONSENT_VERSION,
      retentionDays: photoRetentionDays,
      children: students.map((s) => ({
        student: { id: s.id, name: s.name },
        state: consentState(s.student?.dateOfBirth, !!s.photoConsent, schoolMode),
        givenAt: s.photoConsent?.givenAt.toISOString() ?? null,
        givenBy: s.photoConsent?.guardian.name ?? null,
      })),
    };
  });

  async function guardianOf(parentId: string, studentId: string) {
    const link = await prisma.guardianship.findUnique({ where: { studentId_parentId: { studentId, parentId } }, include: { student: { select: { name: true } } } });
    if (!link) throw new HttpError(404, "NOT_FOUND", "Not your child");
    return link;
  }

  app.post("/consent/:studentId", async (request) => {
    requireRole(request, "PARENT");
    const { studentId } = studentParam.parse(request.params);
    z.object({ agree: z.literal(true) }).parse(request.body);
    const link = await guardianOf(request.user.sub, studentId);
    await prisma.photoConsent.upsert({
      where: { studentId },
      create: { studentId, guardianId: request.user.sub, version: CONSENT_VERSION },
      update: { guardianId: request.user.sub, version: CONSENT_VERSION, givenAt: new Date() },
    });
    await audit(request, "CONSENT_GIVEN", `Agreed to photos of ${link.student.name} (${CONSENT_VERSION})`, { type: "user", id: studentId });
    notifyLater([studentId], { kind: "CONSENT_CHANGED", title: "You can add your photo now", body: "Your parent agreed. Add a clear photo on the Me tab so the guard can check it at the gate.", data: {} });
    return { ok: true, state: "GIVEN" as const };
  });

  /** Withdrawing stops new photos and deletes the ones already kept. */
  app.delete("/consent/:studentId", async (request) => {
    requireRole(request, "PARENT");
    const { studentId } = studentParam.parse(request.params);
    const link = await guardianOf(request.user.sub, studentId);
    const profile = await prisma.studentProfile.findUnique({ where: { userId: studentId }, select: { dateOfBirth: true } });
    if (consentState(profile?.dateOfBirth, true, (await campusSettings()).schoolMode) === "NOT_NEEDED") {
      throw new HttpError(409, "ADULT", `${link.student.name} is 18 or over and manages their own photos`);
    }
    await prisma.photoConsent.deleteMany({ where: { studentId } });
    const removed = await deleteStudentPhotos(studentId);
    await audit(request, "CONSENT_WITHDRAWN", `Withdrew photo consent for ${link.student.name}; deleted ${removed.profile + removed.gate} photos`, { type: "user", id: studentId });
    return { ok: true, state: "NEEDED" as const, removed };
  });
}
