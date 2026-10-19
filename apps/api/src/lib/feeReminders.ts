import { prisma } from "./prisma";
import { guardianIds, notify } from "./notify";
import { FEE_LABEL, rupees } from "../routes/fees";

const DAY = 86_400_000;
const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Fee reminders: three days before, on the due date, then weekly while
 * overdue (parents are told once it's overdue). Each fee's stage is claimed
 * with a conditional update, so two servers never both send.
 */
export async function sendFeeReminders(now = new Date()): Promise<number> {
  const today = new Date(now.toISOString().slice(0, 10));
  const fees = await prisma.fee.findMany({
    where: { status: "DUE", dueDate: { lte: new Date(today.getTime() + 3 * DAY) } },
    take: 2000,
  });
  let sent = 0;
  for (const f of fees) {
    const daysLeft = Math.round((f.dueDate.getTime() - today.getTime()) / DAY);
    let stage = f.remindStage;
    let title: string | null = null;
    let body = "";
    let parents = false;
    if (daysLeft > 0 && stage < 1) {
      stage = 1;
      title = `${f.title} due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
      body = `${rupees(f.amountPaise)} by ${fmt(f.dueDate)}. Pay in the app or at the office.`;
    } else if (daysLeft === 0 && stage < 2) {
      stage = 2;
      title = `${f.title} is due today`;
      body = `${rupees(f.amountPaise)}. Pay in the app or at the office.`;
    } else if (daysLeft < 0 && (!f.lastRemindedAt || now.getTime() - f.lastRemindedAt.getTime() >= 7 * DAY || stage < 3)) {
      stage = Math.max(3, stage + 1);
      title = `${FEE_LABEL[f.category]} overdue: ${f.title}`;
      body = `${rupees(f.amountPaise)} was due ${fmt(f.dueDate)}. Please pay as soon as you can, or tell the office if there's a problem.`;
      parents = true;
    }
    if (!title) continue;
    const claimed = await prisma.fee.updateMany({ where: { id: f.id, remindStage: f.remindStage, status: "DUE" }, data: { remindStage: stage, lastRemindedAt: now } });
    if (claimed.count === 0) continue;
    await notify([f.studentId, ...(parents ? await guardianIds(f.studentId) : [])], { kind: "FEE_DUE", title, body, data: { feeId: f.id } });
    sent++;
  }
  return sent;
}

export function startFeeReminders(intervalMs = 60 * 60_000) {
  const tick = () => void sendFeeReminders().catch((err) => console.warn("fee reminders failed", err));
  setTimeout(tick, 30_000);
  return setInterval(tick, intervalMs);
}
