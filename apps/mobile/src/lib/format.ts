import type { OutpassDto, OutpassStatus, OutpassType, VisitDto, VisitStatus, VisitorType } from "@outpassed/shared";
import type Ionicons from "@expo/vector-icons/Ionicons";
import type { PillTone } from "../ui/Pill";

const pad = (n: number) => String(n).padStart(2, "0");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function time(iso: string | Date): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${((h + 11) % 12) + 1}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today, 4:30 PM" · "Tomorrow, 9:00 AM" · "Sat 21 Oct, 6:00 PM" */
export function when(iso: string | Date, now = new Date()): string {
  const d = new Date(iso);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const day = sameDay(d, now)
    ? "Today"
    : sameDay(d, tomorrow)
      ? "Tomorrow"
      : sameDay(d, yesterday)
        ? "Yesterday"
        : `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `${day}, ${time(d)}`;
}

/** "in 2h 10m" / "40m ago" */
export function relative(iso: string | Date, now = new Date()): string {
  const diff = new Date(iso).getTime() - now.getTime();
  const mins = Math.round(Math.abs(diff) / 60000);
  const text = mins < 60 ? `${mins}m` : mins < 60 * 48 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${Math.round(mins / 1440)}d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

export const outpassTypes: { value: OutpassType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "MEDICAL", label: "Sick / medical", icon: "medkit-outline" },
  { value: "HOME", label: "Home / family trip", icon: "home-outline" },
  { value: "LOCAL", label: "Local outing", icon: "walk-outline" },
  { value: "ACADEMIC", label: "Academic", icon: "school-outline" },
  { value: "PERSONAL", label: "Personal", icon: "person-outline" },
  { value: "EMERGENCY", label: "Emergency", icon: "alert-circle-outline" },
];

export function typeLabel(t: OutpassType) {
  return outpassTypes.find((o) => o.value === t)?.label ?? t;
}

export function outpassStatus(o: Pick<OutpassDto, "status" | "overdue">): { label: string; tone: PillTone } {
  if (o.overdue) return { label: "Overdue", tone: "red" };
  const map: Record<OutpassStatus, { label: string; tone: PillTone }> = {
    PENDING_FACULTY: { label: "Awaiting faculty", tone: "amber" },
    PENDING_PARENT: { label: "Awaiting parent", tone: "amber" },
    PENDING_WARDEN: { label: "Awaiting warden", tone: "amber" },
    APPROVED: { label: "Approved", tone: "accent" },
    OUT: { label: "Out of campus", tone: "indigo" },
    RETURNED: { label: "Returned", tone: "green" },
    REJECTED: { label: "Rejected", tone: "red" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
  };
  return map[o.status];
}

export function isActive(status: OutpassStatus) {
  return status === "PENDING_FACULTY" || status === "PENDING_PARENT" || status === "PENDING_WARDEN" || status === "APPROVED" || status === "OUT";
}

export function visitStatus(v: Pick<VisitDto, "status">): { label: string; tone: PillTone } {
  const map: Record<VisitStatus, { label: string; tone: PillTone }> = {
    PENDING_HOST: { label: "Awaiting host", tone: "amber" },
    APPROVED: { label: "Expected", tone: "accent" },
    REJECTED: { label: "Declined", tone: "red" },
    CHECKED_IN: { label: "On campus", tone: "indigo" },
    CHECKED_OUT: { label: "Left", tone: "green" },
  };
  return map[v.status];
}

export const visitorTypes: { value: VisitorType; label: string }[] = [
  { value: "GUEST", label: "Guest" },
  { value: "PARENT", label: "Parent" },
  { value: "RECRUITER", label: "Recruiter" },
  { value: "VENDOR", label: "Vendor" },
  { value: "EVENT", label: "Event" },
  { value: "ALUMNI", label: "Alumni" },
  { value: "DELIVERY", label: "Delivery" },
];

export function studentLine(s: Pick<OutpassDto["student"], "rollNo" | "hostel" | "room">) {
  return [s.rollNo, s.hostel, s.room ? `Room ${s.room}` : null].filter(Boolean).join(" · ");
}

/** "Good morning," / "Good afternoon," / "Good evening," */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning," : h < 17 ? "Good afternoon," : "Good evening,";
}
