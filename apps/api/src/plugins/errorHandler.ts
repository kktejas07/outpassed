import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { FlowError } from "../domain/outpassFlow";

/** Error with a stable machine-readable code, rendered by the error handler. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function isFastifyJwtError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.startsWith("FST_JWT");
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
        },
      });
    }

    if (error instanceof FlowError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    }

    if (error instanceof HttpError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    }

    if (isFastifyJwtError(error)) {
      return reply
        .status(401)
        .send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
    }

    // Fastify types the handler's `error` as `unknown`; narrow the fields we use.
    const known = error as { statusCode?: number; code?: string; message?: string };
    if (
      typeof known.statusCode === "number" &&
      known.statusCode >= 400 &&
      known.statusCode < 500
    ) {
      return reply.status(known.statusCode).send({
        error: {
          code: known.code ?? "BAD_REQUEST",
          message: known.message ?? "Bad request",
        },
      });
    }

    app.log.error(error);
    return reply
      .status(500)
      .send({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply
      .status(404)
      .send({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
}
