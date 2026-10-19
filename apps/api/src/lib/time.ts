/** Short times for notification text, in the campus time zone. */
const TZ = process.env.TZ_DISPLAY ?? process.env.CAMPUS_TZ ?? "Asia/Kolkata";

export function when(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);
}

export function clock(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
}

/** YYYY-MM-DD in the campus time zone. */
export function campusDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * The night a roll call belongs to. Roll calls run late, so anything before
 * 6 AM counts as the previous night.
 */
export function rollCallDate(now = new Date()): string {
  return campusDate(new Date(now.getTime() - 6 * 3_600_000));
}

/** "2026-10-19 21:45" in campus time, for CSV exports. */
export function stamp(d: Date | null | undefined): string {
  if (!d) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
