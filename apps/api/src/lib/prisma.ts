import { PrismaClient } from "@prisma/client";
import { env } from "../env";

/**
 * Single Prisma client for the process. In development, tsx watch reloads the
 * module on change; caching on globalThis avoids opening a new pool each reload.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
