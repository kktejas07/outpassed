import { deleteImages } from "./blobStore";
import { prisma } from "./prisma";
import { campusSettings } from "./settings";

const DAY = 86_400_000;

/**
 * Deletes gate photos and walk-in visitor photos older than the college's
 * retention period (Settings → Keep gate photos for). The movements
 * themselves stay in the log; only the pictures go.
 */
export async function purgeOldPhotos(now = new Date()) {
  const { photoRetentionDays } = await campusSettings();
  const cutoff = new Date(now.getTime() - photoRetentionDays * DAY);
  const keys = [
    ...(await prisma.gatePhoto.findMany({ where: { createdAt: { lt: cutoff }, storageKey: { not: null } }, select: { storageKey: true } })).map((r) => r.storageKey),
    ...(await prisma.visit.findMany({ where: { createdAt: { lt: cutoff }, visitorPhotoKey: { not: null } }, select: { visitorPhotoKey: true } })).map((r) => r.visitorPhotoKey),
  ];
  const [gate, visitors] = await Promise.all([
    prisma.gatePhoto.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.visit.updateMany({ where: { createdAt: { lt: cutoff }, visitorPhotoMime: { not: null } }, data: { visitorPhoto: null, visitorPhotoKey: null, visitorPhotoMime: null } }),
  ]);
  await deleteImages(keys);
  if (gate.count || visitors.count) console.info(`photo retention: removed ${gate.count} gate photos and ${visitors.count} visitor photos older than ${photoRetentionDays} days`);
  return { gate: gate.count, visitors: visitors.count, cutoff };
}

/** Runs the purge shortly after boot and then every 6 hours. */
export function startPhotoPurge(intervalMs = 6 * 3_600_000) {
  const tick = () => void purgeOldPhotos().catch((err) => console.warn("photo purge failed", err));
  setTimeout(tick, 60_000);
  return setInterval(tick, intervalMs);
}
