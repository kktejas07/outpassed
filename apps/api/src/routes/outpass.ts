import type { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createOutpassSchema,
  extensionDecisionSchema,
  extensionRequestSchema,
  idParamSchema,
  outpassDecisionSchema,
  outpassListQuerySchema,
  type QrTokenResponse,
} from "@outpassed/shared";
import { env } from "../env";
import { applyDecision, canCancel, FlowError, initialStatus } from "../domain/outpassFlow";
import { issueQrToken } from "../domain/qrToken";
import { prisma } from "../lib/prisma";
import { outpassInclude, toOutpassDto } from "../lib/dto";
import { guardianIds, notifyLater, wardenIds } from "../lib/notify";
import { when } from "../lib/time";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";

/** Which outpasses the caller is allowed to see. */
async function visibilityFilter(request: FastifyRequest): Promise<Prisma.OutpassWhereInput> {
  const { role, sub } = request.user;
  switch (role) {
    case "STUDENT":
      return { studentId: sub };
    case "PARENT": {
      const wards = await prisma.guardianship.findMany({
        where: { parentId: sub },
        select: { studentId: true },
      });
      return { studentId: { in: wards.map((w) => w.studentId) } };
    }
    case "WARDEN":
    case "ADMIN":
      return {};
    default:
      throw new HttpError(403, "FORBIDDEN", "You do not have access to outpasses");
  }
}

async function findVisibleOutpass(request: FastifyRequest, id: string) {
  const where = await visibilityFilter(request);
  const row = await prisma.outpass.findFirst({ where: { ...where, id }, include: outpassInclude });
  if (!row) throw new HttpError(404, "NOT_FOUND", "Outpass not found");
  return row;
}

export async function outpassRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.get("/outpasses", async (request) => {
    const query = outpassListQuerySchema.parse(request.query);
    const where: Prisma.OutpassWhereInput = await visibilityFilter(request);

    if (query.status) where.status = query.status;
    if (query.scope === "actionable") {
      const role = request.user.role;
      if (role === "PARENT") where.status = "PENDING_PARENT";
      else if (role === "WARDEN" || role === "ADMIN") {
        // New requests, plus students out who asked to come back later.
        where.OR = [
          { status: { in: ["PENDING_WARDEN", "PENDING_PARENT"] } },
          { status: { in: ["APPROVED", "OUT"] }, extensions: { some: { status: "PENDING" } } },
        ];
      } else where.status = { in: [] };
    }

    const rows = await prisma.outpass.findMany({
      where,
      include: outpassInclude,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const now = new Date();
    return { outpasses: rows.map((r) => toOutpassDto(r, now)) };
  });

  app.post("/outpasses", async (request, reply) => {
    requireRole(request, "STUDENT");
    const body = createOutpassSchema.parse(request.body);
    const studentId = request.user.sub;

    const active = await prisma.outpass.count({
      where: { studentId, status: { in: ["PENDING_PARENT", "PENDING_WARDEN", "APPROVED", "OUT"] } },
    });
    if (active > 0) {
      throw new HttpError(
        409,
        "ACTIVE_OUTPASS",
        "You already have an active outpass. Cancel it or return before requesting another.",
      );
    }

    const [profile, guardianCount] = await Promise.all([
      prisma.studentProfile.findUnique({ where: { userId: studentId } }),
      prisma.guardianship.count({ where: { studentId } }),
    ]);

    const status = initialStatus({
      dateOfBirth: profile?.dateOfBirth ?? null,
      hasGuardian: guardianCount > 0,
      adultParentMode: env.ADULT_PARENT_MODE,
      now: new Date(),
    });

    const row = await prisma.outpass.create({
      data: {
        studentId,
        type: body.type,
        destination: body.destination,
        reason: body.reason,
        leaveAt: new Date(body.leaveAt),
        returnBy: new Date(body.returnBy),
        status,
      },
      include: outpassInclude,
    });

    const name = row.student.name;
    const summary = `${row.destination} · ${when(row.leaveAt)} to ${when(row.returnBy)}`;
    if (status === "PENDING_PARENT") {
      notifyLater(await guardianIds(studentId), {
        kind: "OUTPASS_NEEDS_PARENT",
        title: `${name} is asking to go out`,
        body: `${summary}. Tap to approve or reject.`,
        data: { outpassId: row.id },
      });
    } else {
      notifyLater(await wardenIds(), {
        kind: "OUTPASS_NEEDS_WARDEN",
        title: `New outpass from ${name}`,
        body: `${summary}. Waiting for your approval.`,
        data: { outpassId: row.id },
      });
    }
    return reply.status(201).send(toOutpassDto(row));
  });

  app.get("/outpasses/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return toOutpassDto(await findVisibleOutpass(request, id));
  });

  app.post("/outpasses/:id/decision", async (request) => {
    requireRole(request, "PARENT", "WARDEN", "ADMIN");
    const { id } = idParamSchema.parse(request.params);
    const body = outpassDecisionSchema.parse(request.body);
    const current = await findVisibleOutpass(request, id);

    const isGuardian =
      request.user.role === "PARENT" &&
      (await prisma.guardianship.count({
        where: { parentId: request.user.sub, studentId: current.studentId },
      })) > 0;

    const result = applyDecision({
      status: current.status,
      actorRole: request.user.role,
      isGuardian,
      decision: body.decision,
      reason: body.reason ?? null,
    });

    const updated = await prisma.$transaction(async (tx) => {
      // Conditional update: if someone else decided first, nothing matches.
      const changed = await tx.outpass.updateMany({
        where: { id, status: current.status },
        data: { status: result.nextStatus },
      });
      if (changed.count === 0) {
        throw new FlowError("CONFLICT", "This request was just updated by someone else");
      }
      await tx.approval.create({
        data: {
          outpassId: id,
          step: result.step,
          decision: body.decision,
          approverId: request.user.sub,
          override: result.override,
          reason: body.reason ?? null,
        },
      });
      return tx.outpass.findUniqueOrThrow({ where: { id }, include: outpassInclude });
    });

    const name = updated.student.name;
    const data = { outpassId: id };
    if (result.nextStatus === "PENDING_WARDEN") {
      notifyLater([updated.studentId], {
        kind: "OUTPASS_PARENT_APPROVED",
        title: "Your parent approved",
        body: `Your pass to ${updated.destination} is now with the warden.`,
        data,
      });
      notifyLater(await wardenIds(), {
        kind: "OUTPASS_NEEDS_WARDEN",
        title: `${name}'s outpass is ready for you`,
        body: `Parent approved · ${updated.destination} · ${when(updated.leaveAt)}.`,
        data,
      });
    } else if (result.nextStatus === "APPROVED") {
      notifyLater([updated.studentId], {
        kind: "OUTPASS_APPROVED",
        title: "Outpass approved",
        body: `You're cleared for ${updated.destination} from ${when(updated.leaveAt)}. Show your gate pass at the gate.`,
        data,
      });
      if (result.override) {
        notifyLater(await guardianIds(updated.studentId), {
          kind: "OUTPASS_APPROVED",
          title: `The warden approved ${name}'s outpass`,
          body: `${updated.destination} · ${when(updated.leaveAt)}. Reason: ${body.reason ?? ""}`.trim(),
          data,
        });
      }
    } else if (result.nextStatus === "REJECTED") {
      notifyLater([updated.studentId], {
        kind: "OUTPASS_REJECTED",
        title: "Outpass not approved",
        body: `Your request for ${updated.destination} was rejected${body.reason ? `: ${body.reason}` : "."}`,
        data,
      });
    }

    return toOutpassDto(updated);
  });

  app.post("/outpasses/:id/cancel", async (request) => {
    requireRole(request, "STUDENT");
    const { id } = idParamSchema.parse(request.params);
    const current = await findVisibleOutpass(request, id);
    if (!canCancel(current.status)) {
      throw new FlowError("NOT_CANCELLABLE", "This outpass can no longer be cancelled");
    }
    const changed = await prisma.outpass.updateMany({
      where: { id, status: current.status },
      data: { status: "CANCELLED" },
    });
    if (changed.count === 0) throw new FlowError("CONFLICT", "This outpass was just updated");
    const updated = await prisma.outpass.findUniqueOrThrow({ where: { id }, include: outpassInclude });
    return toOutpassDto(updated);
  });

  /** Student asks to come back later than the approved return time. */
  app.post("/outpasses/:id/extend", async (request) => {
    requireRole(request, "STUDENT");
    const { id } = idParamSchema.parse(request.params);
    const body = extensionRequestSchema.parse(request.body);
    const current = await findVisibleOutpass(request, id);
    if (current.status !== "OUT" && current.status !== "APPROVED") {
      throw new FlowError("NOT_EXTENDABLE", "You can only ask for more time on an approved pass or while you're out");
    }
    const requested = new Date(body.requestedReturnBy);
    if (requested <= current.returnBy) {
      throw new HttpError(400, "INVALID_TIME", "Pick a time later than your current return time");
    }
    if (requested.getTime() - current.returnBy.getTime() > 7 * 24 * 3_600_000) {
      throw new HttpError(400, "INVALID_TIME", "An extension can be at most 7 days. Request a new outpass instead.");
    }
    const pending = await prisma.outpassExtension.count({ where: { outpassId: id, status: "PENDING" } });
    if (pending > 0) throw new FlowError("EXTENSION_PENDING", "You already asked for more time. Wait for the warden to reply.");

    await prisma.outpassExtension.create({
      data: { outpassId: id, previousReturnBy: current.returnBy, requestedReturnBy: requested, reason: body.reason },
    });
    const updated = await prisma.outpass.findUniqueOrThrow({ where: { id }, include: outpassInclude });
    const name = updated.student.name;
    notifyLater(await wardenIds(), {
      kind: "EXTENSION_REQUESTED",
      title: `${name} is asking to return later`,
      body: `Wants until ${when(requested)} instead of ${when(current.returnBy)}: ${body.reason}`,
      data: { outpassId: id },
    });
    notifyLater(await guardianIds(updated.studentId), {
      kind: "EXTENSION_REQUESTED",
      title: `${name} asked to return later`,
      body: `New time requested: ${when(requested)}. The warden will decide.`,
      data: { outpassId: id },
    });
    return toOutpassDto(updated);
  });

  app.post("/outpasses/:id/extend/decision", async (request) => {
    requireRole(request, "WARDEN", "ADMIN");
    const { id } = idParamSchema.parse(request.params);
    const { decision } = extensionDecisionSchema.parse(request.body);
    const ext = await prisma.outpassExtension.findFirst({ where: { outpassId: id, status: "PENDING" }, orderBy: { createdAt: "desc" } });
    if (!ext) throw new FlowError("NOT_PENDING", "There's no pending request for more time");

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.outpassExtension.updateMany({
        where: { id: ext.id, status: "PENDING" },
        data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", decidedById: request.user.sub, decidedAt: new Date() },
      });
      if (changed.count === 0) throw new FlowError("CONFLICT", "This request was just decided");
      if (decision === "APPROVE") {
        // A new deadline gets its own overdue alert if missed.
        await tx.outpass.update({ where: { id }, data: { returnBy: ext.requestedReturnBy, overdueAlertedAt: null } });
      }
      return tx.outpass.findUniqueOrThrow({ where: { id }, include: outpassInclude });
    });

    const approved = decision === "APPROVE";
    const body = approved
      ? `You can return by ${when(ext.requestedReturnBy)}.`
      : `Please return by ${when(ext.previousReturnBy)} as approved.`;
    notifyLater([updated.studentId], {
      kind: approved ? "EXTENSION_APPROVED" : "EXTENSION_REJECTED",
      title: approved ? "More time approved" : "Extra time not approved",
      body,
      data: { outpassId: id },
    });
    notifyLater(await guardianIds(updated.studentId), {
      kind: approved ? "EXTENSION_APPROVED" : "EXTENSION_REJECTED",
      title: approved ? `${updated.student.name} can return later` : `${updated.student.name}'s request for more time was declined`,
      body: approved ? `New return time: ${when(ext.requestedReturnBy)}.` : `Return time stays ${when(ext.previousReturnBy)}.`,
      data: { outpassId: id },
    });
    return toOutpassDto(updated);
  });

  /** A fresh short-lived code for the student to show at the gate. */
  app.get("/outpasses/:id/qr", async (request) => {
    requireRole(request, "STUDENT");
    const { id } = idParamSchema.parse(request.params);
    const current = await findVisibleOutpass(request, id);
    if (current.status !== "APPROVED" && current.status !== "OUT") {
      throw new FlowError("NOT_APPROVED", "A QR code is only available once the pass is approved");
    }
    const response: QrTokenResponse = {
      token: issueQrToken(id, "OUTPASS", env.QR_SECRET),
      expiresIn: env.QR_TTL_SECONDS,
    };
    return response;
  });
}
