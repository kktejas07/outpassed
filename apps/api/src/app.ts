import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "./env";
import { registerAuth } from "./plugins/auth";
import { registerErrorHandler } from "./plugins/errorHandler";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { recordRoutes } from "./routes/record";

/** Builds the Fastify instance. Kept separate from listen() so tests can inject. */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty" } }
        : true,
  });

  registerErrorHandler(app);

  await app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
  });

  await registerAuth(app);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(recordRoutes);

  return app;
}
