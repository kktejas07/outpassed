import fastifyJwt from "@fastify/jwt";
import type { Role } from "@outpassed/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../env";
import { HttpError } from "./errorHandler";

export type JwtUser = { sub: string; email: string; role: Role };

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
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

/** Throws 403 unless the authenticated caller has one of `roles`. */
export function requireRole(request: FastifyRequest, ...roles: Role[]): void {
  if (!roles.includes(request.user.role)) {
    throw new HttpError(403, "FORBIDDEN", "You do not have access to this action");
  }
}
