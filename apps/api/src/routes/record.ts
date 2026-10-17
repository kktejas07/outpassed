import type { FastifyInstance } from "fastify";
import {
  createRecordSchema,
  idParamSchema,
  updateRecordSchema,
} from "@outpassed/shared";
import { prisma } from "../lib/prisma";
import { toRecordDto } from "../lib/dto";
import { HttpError } from "../plugins/errorHandler";

/**
 * Placeholder CRUD resource. Every query is scoped to `ownerId` so a user can
 * only ever see or mutate their own records.
 */
export async function recordRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.get("/records", async (request) => {
    const records = await prisma.record.findMany({
      where: { ownerId: request.user.sub },
      orderBy: { createdAt: "desc" },
    });
    return { records: records.map(toRecordDto) };
  });

  app.post("/records", async (request, reply) => {
    const body = createRecordSchema.parse(request.body);
    const record = await prisma.record.create({
      data: {
        title: body.title,
        description: body.description ?? null,
        status: body.status,
        ownerId: request.user.sub,
      },
    });
    return reply.status(201).send(toRecordDto(record));
  });

  app.get("/records/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const record = await prisma.record.findFirst({
      where: { id, ownerId: request.user.sub },
    });
    if (!record) {
      throw new HttpError(404, "NOT_FOUND", "Record not found");
    }
    return toRecordDto(record);
  });

  app.patch("/records/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = updateRecordSchema.parse(request.body);

    const existing = await prisma.record.findFirst({
      where: { id, ownerId: request.user.sub },
    });
    if (!existing) {
      throw new HttpError(404, "NOT_FOUND", "Record not found");
    }

    const record = await prisma.record.update({
      where: { id },
      data: {
        title: body.title,
        status: body.status,
        description:
          body.description === undefined ? undefined : (body.description ?? null),
      },
    });
    return toRecordDto(record);
  });

  app.delete("/records/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const existing = await prisma.record.findFirst({
      where: { id, ownerId: request.user.sub },
    });
    if (!existing) {
      throw new HttpError(404, "NOT_FOUND", "Record not found");
    }
    await prisma.record.delete({ where: { id } });
    return reply.status(204).send();
  });
}
