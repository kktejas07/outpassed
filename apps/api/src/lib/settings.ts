import { prisma } from "./prisma";

export type CampusSettings = { offersEnabled: boolean; schoolMode: boolean; requireGatePhoto: boolean; photoRetentionDays: number };

const DEFAULTS: CampusSettings = { offersEnabled: true, schoolMode: false, requireGatePhoto: true, photoRetentionDays: 90 };
let cached: CampusSettings = DEFAULTS;
let loadedAt = 0;

/** College-wide switches, cached for 30 seconds. */
export async function campusSettings(): Promise<CampusSettings> {
  if (Date.now() - loadedAt > 30_000) {
    const row = await prisma.institution.findUnique({ where: { id: 1 } }).catch(() => null);
    cached = row
      ? { offersEnabled: row.offersEnabled, schoolMode: row.schoolMode, requireGatePhoto: row.requireGatePhoto, photoRetentionDays: row.photoRetentionDays }
      : DEFAULTS;
    loadedAt = Date.now();
  }
  return cached;
}

/** The last loaded settings, for synchronous code (e.g. building a user DTO). */
export const cachedSettings = () => cached;

/** Call after changing settings so the next read sees them. */
export function forgetSettings() {
  loadedAt = 0;
}
