/** Short times for notification text, in the campus time zone. */
const TZ = process.env.TZ_DISPLAY ?? "Asia/Kolkata";

export function when(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);
}

export function clock(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
}
