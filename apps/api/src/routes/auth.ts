import { createHash, randomInt } from "node:crypto";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, type AuthResponse } from "@outpassed/shared";
import { sendMail } from "../lib/mailer";
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

  /**
   * Emails a 6-digit reset code. Always answers the same way so the endpoint
   * can't be used to find out which emails have accounts.
   */
  app.post("/auth/forgot", async (request) => {
    const { email } = forgotPasswordSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user) {
      const recent = await prisma.passwordReset.count({
        where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 15 * 60_000) } },
      });
      if (recent < 3) {
        const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
        await prisma.passwordReset.create({
          data: { userId: user.id, codeHash: hashCode(user.id, code), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
        });
        await sendMail({
          to: user.email,
          subject: "Your Outpass password reset code",
          text: `Hi ${user.name},\n\nYour code to reset your Outpass password is ${code}. It expires in 15 minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
        });
      }
    }
    return { ok: true, message: "If that email has an account, we've sent a reset code to it." };
  });

  app.post("/auth/reset", async (request) => {
    const body = resetPasswordSchema.parse(request.body);
    const invalid = new HttpError(400, "INVALID_CODE", "That code is wrong or has expired. Request a new one.");
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() }, include: { student: true } });
    if (!user) throw invalid;
    const reset = await prisma.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!reset || reset.attempts >= MAX_ATTEMPTS) throw invalid;
    if (reset.codeHash !== hashCode(user.id, body.code)) {
      await prisma.passwordReset.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
      throw invalid;
    }
    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    ]);
    const payload: AuthResponse = {
      accessToken: app.jwt.sign({ sub: user.id, email: user.email, role: user.role }),
      user: toUserDto(user),
    };
    return payload;
  });
}

const RESET_TTL_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

function hashCode(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}
