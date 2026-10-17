import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness probe for Dokploy / load balancers.
  app.get("/health", async () => ({ status: "ok" }));
}
