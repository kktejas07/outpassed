import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { reportClientError } from "../lib/errors";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(500),
  stack: z.string().max(8000).optional(),
  screen: z.string().max(200).optional(),
  platform: z.enum(["ios", "android", "web"]),
  appVersion: z.string().max(40).optional(),
  fatal: z.boolean().optional(),
});

/**
 * The apps send their crashes here (signed in or not); they go to the server
 * log and, when SENTRY_DSN is set, to Sentry. Rate-limited per address.
 */
export async function clientErrorRoutes(app: FastifyInstance): Promise<void> {
  app.post("/client-errors", async (request, reply) => {
    const body = bodySchema.parse(request.body);
    // Who it happened to, if they were signed in; a crash before sign-in is still reported.
    const user = await request
      .jwtVerify<{ sub: string; role: string }>()
      .then((u) => ({ id: u.sub, role: u.role }))
      .catch(() => undefined);
    request.log.warn({ clientError: { message: body.message, screen: body.screen, platform: body.platform, fatal: body.fatal } }, "app error");
    reportClientError(body, user);
    return reply.status(202).send({ ok: true });
  });
}
