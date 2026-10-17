import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../env";
import { HttpError } from "./errorHandler";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email: string };
    user: { sub: string; email: string };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.decorate("authenticate", async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
    }
  });
}
