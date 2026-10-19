import type { FastifyInstance } from "fastify";
import { markReadSchema, registerDeviceSchema, type NotificationList } from "@outpassed/shared";
import { prisma } from "../lib/prisma";

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.get("/notifications", async (request) => {
    const userId = request.user.sub;
    const [rows, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 60 }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    const body: NotificationList = {
      unread,
      notifications: rows.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        data: (n.data as Record<string, string> | null) ?? null,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    };
    return body;
  });

  app.post("/notifications/read", async (request) => {
    const { ids } = markReadSchema.parse(request.body ?? {});
    const res = await prisma.notification.updateMany({
      where: { userId: request.user.sub, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  });

  /** The app registers its Expo push token after sign-in. A token moves to whoever signed in last. */
  app.post("/devices", async (request, reply) => {
    const { token, platform } = registerDeviceSchema.parse(request.body);
    await prisma.pushToken.upsert({
      where: { token },
      create: { token, platform, userId: request.user.sub },
      update: { platform, userId: request.user.sub },
    });
    return reply.status(204).send();
  });

  /** Called on sign-out so a shared phone stops getting the previous user's alerts. */
  app.post("/devices/remove", async (request, reply) => {
    const { token } = registerDeviceSchema.pick({ token: true }).parse(request.body);
    await prisma.pushToken.deleteMany({ where: { token, userId: request.user.sub } });
    return reply.status(204).send();
  });
}
