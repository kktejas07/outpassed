import { prisma } from "./prisma";

/** The student's HOD (if any). */
export async function hodOf(studentId: string): Promise<string | null> {
  const p = await prisma.studentProfile.findUnique({ where: { userId: studentId }, select: { department: { select: { hodId: true } } } });
  return p?.department?.hodId ?? null;
}

/** People on the academic side who should hear about a pass: the faculty who gave permission and the HOD. */
export async function academicContacts(studentId: string, facultyId: string | null): Promise<string[]> {
  const hod = await hodOf(studentId);
  return [...new Set([facultyId, hod].filter((x): x is string => !!x))];
}
