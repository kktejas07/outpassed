import { createHash, randomInt } from "node:crypto";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import {
  forgotPasswordSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from "@outpassed/shared";
import { ensureHostel } from "../lib/hostels";
import { normalizePhone, phoneFields } from "../lib/phone";
import { endSession, issueSession, rotateSession } from "../lib/session";
import { sendSms } from "../lib/sms";
import { sendWhatsApp } from "../lib/whatsapp";
import { env } from "../env";
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

    // A picked hostel wins; typed text is matched to (or creates) a hostel.
    let hostel: { id: string; name: string } | null = null;
    if (body.role === "STUDENT") {
      if (body.hostelId) {
        hostel = await prisma.hostel.findUnique({ where: { id: body.hostelId } });
        if (!hostel) throw new HttpError(404, "HOSTEL_NOT_FOUND", "Hostel not found");
      } else if (body.hostel) {
        hostel = await ensureHostel(body.hostel);
      }
    }

    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: body.name,
        ...phoneFields(body.phone),
        role: body.role,
        student:
          body.role === "STUDENT"
            ? {
                create: {
                  rollNo: body.rollNo ?? null,
                  hostel: hostel?.name ?? null,
                  hostelId: hostel?.id ?? null,
                  room: body.room ?? null,
                  dateOfBirth: body.dateOfBirth ? new Date(`${body.dateOfBirth}T00:00:00Z`) : null,
                },
              }
            : undefined,
      },
      include: { student: true },
    });

    return reply.status(201).send(await issueSession(app, user));
  });

  app.post("/auth/login", async (request) => {
    const body = loginSchema.parse(request.body);
    const email = body.email.toLowerCase();

    const user = await prisma.user.findUnique({ where: { email }, include: withPhoto });
    if (!user) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const valid = await argon2.verify(user.passwordHash, body.password);
    if (!valid) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    return issueSession(app, user);
  });

  /** Swaps a refresh token for a fresh pair. */
  app.post("/auth/refresh", async (request) => {
    const { refreshToken } = refreshSchema.parse(request.body);
    return rotateSession(app, refreshToken);
  });

  /** Ends this device's session so its refresh token stops working. */
  app.post("/auth/logout", async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body);
    await endSession(refreshToken);
    return reply.status(204).send();
  });

  /**
   * Texts a 6-digit sign-in code. Answers the same way whether or not the
   * number has an account, and sends at most 3 codes per 10 minutes.
   */
  app.post("/auth/otp/request", async (request) => {
    const { phone } = otpRequestSchema.parse(request.body);
    const normalized = normalizePhone(phone);
    if (!normalized) throw new HttpError(400, "INVALID_PHONE", "Enter a valid mobile number");
    const known = await prisma.user.count({ where: { phoneNormalized: normalized } });
    if (known > 0) {
      const recent = await prisma.otpCode.count({ where: { phone: normalized, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } } });
      if (recent < 3) {
        const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
        await prisma.otpCode.create({
          data: { phone: normalized, codeHash: hashCode(normalized, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
        });
        const text = `${code} is your Outpass sign-in code. It expires in 10 minutes. Don't share it with anyone.`;
        if (env.OTP_CHANNEL === "whatsapp") await sendWhatsApp({ to: normalized, code, text, kind: "OTP" });
        else await sendSms({ to: normalized, code, text });
      }
    }
    return {
      ok: true,
      channel: env.OTP_CHANNEL,
      message: env.OTP_CHANNEL === "whatsapp" ? "If that number has an account, we've sent a code to it on WhatsApp." : "If that number has an account, we've texted a code to it.",
    };
  });

  app.post("/auth/otp/verify", async (request) => {
    const body = otpVerifySchema.parse(request.body);
    const invalid = new HttpError(400, "INVALID_CODE", "That code is wrong or has expired. Request a new one.");
    const normalized = normalizePhone(body.phone);
    if (!normalized) throw invalid;
    const otp = await prisma.otpCode.findFirst({
      where: { phone: normalized, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp || otp.attempts >= MAX_ATTEMPTS) throw invalid;
    if (otp.codeHash !== hashCode(normalized, body.code)) {
      await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw invalid;
    }
    const used = await prisma.otpCode.updateMany({ where: { id: otp.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count === 0) throw invalid;
    const users = await prisma.user.findMany({ where: { phoneNormalized: normalized }, include: withPhoto, take: 2 });
    if (users.length === 0) throw invalid;
    if (users.length > 1) {
      throw new HttpError(409, "MULTIPLE_ACCOUNTS", "More than one account uses this number. Sign in with your email instead.");
    }
    return issueSession(app, users[0]!);
  });

  app.get("/auth/me", { onRequest: [app.authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      include: withPhoto,
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
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() }, include: withPhoto });
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
      // A new password signs out every other device.
      prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return issueSession(app, user);
  });
}

const withPhoto = { student: true, photo: { select: { updatedAt: true } } } as const;
const RESET_TTL_MS = 15 * 60_000;
const OTP_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

function hashCode(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}
