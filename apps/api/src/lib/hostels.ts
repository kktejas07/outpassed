import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/** Finds a hostel by name (case-insensitive) or creates it. */
export async function ensureHostel(name: string): Promise<{ id: string; name: string }> {
  const clean = name.trim().replace(/\s+/g, " ");
  const found = await prisma.hostel.findFirst({ where: { name: { equals: clean, mode: "insensitive" } } });
  if (found) return found;
  return prisma.hostel.upsert({ where: { name: clean }, create: { name: clean }, update: {} });
}

/**
 * Hostels a warden looks after, or null when they cover every hostel
 * (no assignments, or an admin). Other roles get null.
 */
export async function wardenScope(userId: string, role: string): Promise<string[] | null> {
  if (role !== "WARDEN") return null;
  const rows = await prisma.wardenHostel.findMany({ where: { userId }, select: { hostelId: true } });
  return rows.length ? rows.map((r) => r.hostelId) : null;
}

/** Where-clause on a student user for a warden's hostels. */
export function studentInHostels(ids: string[] | null): Prisma.UserWhereInput {
  return ids ? { student: { hostelId: { in: ids } } } : {};
}

/** Wardens who should hear about this student: their hostel's wardens plus wardens without assignments. */
export async function wardensFor(studentId: string): Promise<string[]> {
  const profile = await prisma.studentProfile.findUnique({ where: { userId: studentId }, select: { hostelId: true } });
  const wardens = await prisma.user.findMany({
    where: {
      role: "WARDEN",
      OR: [
        { wardenHostels: { none: {} } },
        ...(profile?.hostelId ? [{ wardenHostels: { some: { hostelId: profile.hostelId } } }] : []),
      ],
    },
    select: { id: true },
  });
  return wardens.map((w) => w.id);
}

/** Hostel ids relevant to a student or parent, for notice filtering. */
export async function hostelsOfViewer(userId: string, role: string): Promise<string[]> {
  if (role === "STUDENT") {
    const p = await prisma.studentProfile.findUnique({ where: { userId }, select: { hostelId: true } });
    return p?.hostelId ? [p.hostelId] : [];
  }
  if (role === "PARENT") {
    const wards = await prisma.guardianship.findMany({ where: { parentId: userId }, select: { student: { select: { student: { select: { hostelId: true } } } } } });
    return [...new Set(wards.map((w) => w.student.student?.hostelId).filter((x): x is string => !!x))];
  }
  return [];
}
