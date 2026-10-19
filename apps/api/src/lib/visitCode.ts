import { randomBytes, randomInt } from "node:crypto";
import { env } from "../env";
import { prisma } from "./prisma";

/** A 6-digit code not used by any visit that can still be scanned. */
export async function newVisitCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const clash = await prisma.visit.count({
      where: { code, status: { in: ["PENDING_HOST", "APPROVED", "CHECKED_IN"] } },
    });
    if (clash === 0) return code;
  }
  throw new Error("Could not allocate a visitor code");
}

export function newPassToken(): string {
  return randomBytes(16).toString("base64url");
}

export function passUrl(passToken: string): string {
  return `${env.PUBLIC_WEB_URL.replace(/\/$/, "")}/app/pass/${passToken}`;
}
