import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { idParamSchema, photoUploadSchema } from "@outpassed/shared";
import { photoUrl, verifyPhotoSig } from "../lib/photo";
import { prisma } from "../lib/prisma";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";
import { audit } from "../lib/audit";

const MAX_BYTES = 500 * 1024;

/** Decodes an uploaded photo and checks it really is a JPEG or PNG. */
export function decodePhoto(image: string): { data: Buffer; mime: string } {
  const base64 = image.replace(/^data:image\/[a-z+]+;base64,/i, "").replace(/\s/g, "");
  const data = Buffer.from(base64, "base64");
  if (data.length > MAX_BYTES) throw new HttpError(413, "PHOTO_TOO_LARGE", "That photo is too large. Use one under 500 KB.");
  const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!jpeg && !png) throw new HttpError(400, "INVALID_PHOTO", "Upload a JPEG or PNG photo");
  return { data, mime: jpeg ? "image/jpeg" : "image/png" };
}

async function savePhoto(userId: string, image: string) {
  const { data, mime } = decodePhoto(image);
  const bytes = new Uint8Array(data);
  const row = await prisma.userPhoto.upsert({
    where: { userId },
    create: { userId, data: bytes, mime },
    update: { data: bytes, mime },
    select: { updatedAt: true },
  });
  return { photoUrl: photoUrl(userId, row.updatedAt) };
}

/**
 * Profile photos, shown to guards at the gate so they can check the face
 * matches the pass. Uploads need sign-in; viewing uses a signed link.
 */
export async function photoRoutes(app: FastifyInstance): Promise<void> {
  const bodyLimit = 1024 * 1024;

  app.put("/me/photo", { onRequest: [app.authenticate], bodyLimit }, async (request: FastifyRequest) => {
    const { image } = photoUploadSchema.parse(request.body);
    return savePhoto(request.user.sub, image);
  });

  app.delete("/me/photo", { onRequest: [app.authenticate] }, async (request, reply) => {
    await prisma.userPhoto.deleteMany({ where: { userId: request.user.sub } });
    return reply.status(204).send();
  });

  /** Admins (and wardens, for their students) can add photos for people who can't. */
  app.put("/admin/users/:id/photo", { onRequest: [app.authenticate], bodyLimit }, async (request) => {
    requireRole(request, "ADMIN", "WARDEN");
    const { id } = idParamSchema.parse(request.params);
    const { image } = photoUploadSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");
    if (request.user.role === "WARDEN" && user.role !== "STUDENT") {
      throw new HttpError(403, "FORBIDDEN", "Wardens can only add student photos");
    }
    const saved = await savePhoto(id, image);
    await audit(request, "PHOTO_SET", `Set the profile photo for ${user.name}`, { type: "user", id });
    return saved;
  });

  app.get("/photos/:userId", async (request, reply) => {
    const { userId } = z.object({ userId: z.uuid() }).parse(request.params);
    const q = z
      .object({ v: z.coerce.number().int(), exp: z.coerce.number().int(), sig: z.string().min(10).max(100) })
      .safeParse(request.query);
    if (!q.success || !verifyPhotoSig(userId, q.data.exp, q.data.v, q.data.sig)) {
      throw new HttpError(403, "FORBIDDEN", "This photo link has expired");
    }
    const photo = await prisma.userPhoto.findUnique({ where: { userId } });
    if (!photo) throw new HttpError(404, "NOT_FOUND", "No photo");
    reply.header("content-type", photo.mime);
    reply.header("cache-control", "private, max-age=3600");
    reply.header("cross-origin-resource-policy", "cross-origin");
    return reply.send(Buffer.from(photo.data));
  });
}
