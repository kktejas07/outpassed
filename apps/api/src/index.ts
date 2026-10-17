import { buildApp } from "./app";
import { env } from "./env";
import { prisma } from "./lib/prisma";

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: "0.0.0.0", port: env.PORT });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
