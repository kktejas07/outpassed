import { buildApp } from "./app";
import { env } from "./env";
import { startOverdueSweeper } from "./lib/overdue";
import { prisma } from "./lib/prisma";

let sweeper: ReturnType<typeof setInterval> | undefined;

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down`);
    if (sweeper) clearInterval(sweeper);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: "0.0.0.0", port: env.PORT });
  // Alerts students, parents and wardens when someone misses their return time.
  sweeper = startOverdueSweeper();
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
