import { when } from "./time";
import { guardianIds, notify, wardenIds } from "./notify";
import { prisma } from "./prisma";

/**
 * Finds students who are out past their return time and haven't been flagged
 * yet, and alerts the student, their parents and the wardens once.
 */
export async function sweepOverdue(now = new Date()): Promise<number> {
  const rows = await prisma.outpass.findMany({
    where: { status: "OUT", returnBy: { lt: now }, overdueAlertedAt: null },
    include: { student: true },
    take: 200,
  });
  if (rows.length === 0) return 0;
  const wardens = await wardenIds();
  for (const row of rows) {
    // Claim the row first so two server instances don't both alert.
    const claimed = await prisma.outpass.updateMany({
      where: { id: row.id, overdueAlertedAt: null },
      data: { overdueAlertedAt: now },
    });
    if (claimed.count === 0) continue;
    const parents = await guardianIds(row.studentId);
    await notify([row.studentId], {
      kind: "STUDENT_OVERDUE",
      title: "You're past your return time",
      body: `Your pass to ${row.destination} was due back ${when(row.returnBy)}. Head back and scan in at the gate.`,
      data: { outpassId: row.id },
    });
    await notify([...parents, ...wardens], {
      kind: "STUDENT_OVERDUE",
      title: `${row.student.name} is overdue`,
      body: `Was due back from ${row.destination} ${when(row.returnBy)} and hasn't returned yet.`,
      data: { outpassId: row.id },
    });
  }
  return rows.length;
}

/** Runs the sweep every few minutes for the life of the server. */
export function startOverdueSweeper(intervalMs = 5 * 60_000) {
  const tick = () => void sweepOverdue().catch((err) => console.warn("overdue sweep failed", err));
  tick();
  return setInterval(tick, intervalMs);
}
