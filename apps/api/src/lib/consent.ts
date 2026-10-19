import { ADULT_AGE, ageOn } from "../domain/outpassFlow";
import { deleteImages } from "./blobStore";
import { prisma } from "./prisma";
import { cachedSettings, campusSettings } from "./settings";

/** Bump when the consent wording changes; parents then agree to the new one. */
export const CONSENT_VERSION = "2026-10-photos-v1";

export type ConsentState = "NOT_NEEDED" | "GIVEN" | "NEEDED";

/**
 * Photos of a student need a guardian's agreement when the student is under 18
 * or the campus is a school. A college student with no date of birth on file
 * is treated as an adult here (the college holds that record).
 */
export function needsConsent(dateOfBirth: Date | null | undefined, schoolMode = cachedSettings().schoolMode, now = new Date()): boolean {
  if (schoolMode) return true;
  return !!dateOfBirth && ageOn(dateOfBirth, now) < ADULT_AGE;
}

export function consentState(dateOfBirth: Date | null | undefined, given: boolean, schoolMode?: boolean): ConsentState {
  if (!needsConsent(dateOfBirth, schoolMode)) return "NOT_NEEDED";
  return given ? "GIVEN" : "NEEDED";
}

/** May we store photos of this user? Always yes for anyone who isn't a student. */
export async function photosAllowed(userId: string): Promise<boolean> {
  const [user, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true, student: { select: { dateOfBirth: true } }, photoConsent: { select: { studentId: true } } } }),
    campusSettings(),
  ]);
  if (!user || user.role !== "STUDENT") return true;
  return consentState(user.student?.dateOfBirth, !!user.photoConsent, settings.schoolMode) !== "NEEDED";
}

/** Deletes every stored photo of a student: profile photo and gate photos. */
export async function deleteStudentPhotos(studentId: string) {
  const keys = [
    ...(await prisma.userPhoto.findMany({ where: { userId: studentId, storageKey: { not: null } }, select: { storageKey: true } })),
    ...(await prisma.gatePhoto.findMany({ where: { gateEvent: { outpass: { studentId } }, storageKey: { not: null } }, select: { storageKey: true } })),
  ].map((r) => r.storageKey);
  const [profile, gate] = await Promise.all([
    prisma.userPhoto.deleteMany({ where: { userId: studentId } }),
    prisma.gatePhoto.deleteMany({ where: { gateEvent: { outpass: { studentId } } } }),
  ]);
  await deleteImages(keys);
  return { profile: profile.count, gate: gate.count };
}
