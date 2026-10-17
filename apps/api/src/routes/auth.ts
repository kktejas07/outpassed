import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { loginSchema, registerSchema, type AuthResponse } from "@outpassed/shared";
import { prisma } from "../lib/prisma";
import { toUserDto } from "../lib/dto";
import { HttpError } from "../plugins/errorHandler";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const email = body.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new HttpError(409, "EMAIL_TAKEN", "Email is already registered");
    }
    if (body.role === "STUDENT" && body.rollNo) {
      const taken = await prisma.studentProfile.findUnique({ where: { rollNo: body.rollNo } });
      if (taken) throw new HttpError(409, "ROLL_TAKEN", "Roll number is already registered");
    }

    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: body.name,
        phone: body.phone ?? null,
        role: body.role,
        student:
          body.role === "STUDENT"
            ? {
                create: {
                  rollNo: body.rollNo ?? null,
                  hostel: body.hostel ?? null,
                  room: body.room ?? null,
                  dateOfBirth: body.dateOfBirth ? new Date(`${body.dateOfBirth}T00:00:00Z`) : null,
                },
              }
            : undefined,
      },
      include: { student: true },
    });

    const payload: AuthResponse = {
      accessToken: app.jwt.sign({ sub: user.id, email: user.email, role: user.role }),
      user: toUserDto(user),
    };
    return reply.status(201).send(payload);
  });

  app.post("/auth/login", async (request) => {
    const body = loginSchema.parse(request.body);
    const email = body.email.toLowerCase();

    const user = await prisma.user.findUnique({ where: { email }, include: { student: true } });
    if (!user) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const valid = await argon2.verify(user.passwordHash, body.password);
    if (!valid) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const payload: AuthResponse = {
      accessToken: app.jwt.sign({ sub: user.id, email: user.email, role: user.role }),
      user: toUserDto(user),
    };
    return payload;
  });

  app.get("/auth/me", { onRequest: [app.authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      include: { student: true },
    });
    if (!user) {
      throw new HttpError(404, "NOT_FOUND", "User not found");
    }
    return { user: toUserDto(user) };
  });
}
