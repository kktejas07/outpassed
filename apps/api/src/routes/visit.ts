import type { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  createVisitSchema,
  idParamSchema,
  visitDecisionSchema,
  walkInSchema,
  type QrTokenResponse,
} from "@outpassed/shared";
import { env } from "../env";
import { FlowError } from "../domain/outpassFlow";
import { visitToken } from "../lib/passes";
import { storeImage } from "../lib/blobStore";
import { decodePhoto } from "./photos";
import { describeRepeat } from "@outpassed/shared/passToken";
import { prisma } from "../lib/prisma";
import { toVisitDto, visitInclude } from "../lib/dto";
import { background, notifyLater } from "../lib/notify";
import { normalizePhone } from "../lib/phone";
import { sendWhatsApp, whatsappEnabled } from "../lib/whatsapp";
import { passUrl } from "../lib/visitCode";
import { when } from "../lib/time";
import { newPassToken, newVisitCode } from "../lib/visitCode";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";

/** Visitor codes are sent ahead of time (SMS/WhatsApp), so they live for days. */
export const VISIT_QR_TTL_SECONDS = 7 * 24 * 60 * 60;

const staffRoles = new Set(["GUARD", "WARDEN", "ADMIN"]);

function visitWhere(request: FastifyRequest): Prisma.VisitWhereInput {
  if (staffRoles.has(request.user.role)) return {};
  return { OR: [{ hostId: request.user.sub }, { registeredById: request.user.sub }] };
}

export async function visitRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /** People a visitor can ask for at the gate. */
  app.get("/visits/hosts", async (request) => {
    const { q } = z.object({ q: z.string().trim().max(80).optional() }).parse(request.query);
    // Search students and faculty by name or roll number; with no search, list staff and faculty.
    const select = { id: true, name: true, role: true, department: { select: { name: true } }, student: { select: { rollNo: true, hostel: true } } } as const;
    const rows = q
      ? await prisma.user.findMany({
          where: {
            role: { in: ["WARDEN", "ADMIN", "STUDENT", "FACULTY"] },
            OR: [{ name: { contains: q, mode: "insensitive" as const } }, { student: { rollNo: { equals: q, mode: "insensitive" as const } } }],
          },
          orderBy: { name: "asc" },
          take: 30,
          select,
        })
      : // No search yet: faculty first (most visitors come for them), then wardens and the office.
        [
          ...(await prisma.user.findMany({ where: { role: "FACULTY" }, orderBy: { name: "asc" }, take: 60, select })),
          ...(await prisma.user.findMany({ where: { role: { in: ["WARDEN", "ADMIN"] } }, orderBy: { name: "asc" }, take: 20, select })),
        ];
    const hosts = rows.map((h) => ({
      id: h.id,
      name: h.name,
      role: h.role,
      detail:
        h.role === "STUDENT"
          ? [h.student?.rollNo, h.student?.hostel].filter(Boolean).join(" · ") || "Student"
          : h.role === "FACULTY"
            ? `Faculty${h.department ? ` · ${h.department.name}` : ""}`
            : h.role === "WARDEN"
              ? "Warden"
              : "Office",
    }));
    return { hosts };
  });

  /** A host pre-registers a visitor. Approved immediately: the host is the approver. */
  app.post("/visits", async (request, reply) => {
    requireRole(request, "STUDENT", "WARDEN", "ADMIN", "FACULTY");
    const body = createVisitSchema.parse(request.body);
    const row = await prisma.visit.create({
      data: {
        visitorName: body.visitorName,
        visitorPhone: body.visitorPhone,
        visitorType: body.visitorType,
        purpose: body.purpose,
        status: "APPROVED",
        validFrom: new Date(body.validFrom),
        validTo: new Date(body.validTo),
        hostId: request.user.sub,
        registeredById: request.user.sub,
        code: await newVisitCode(),
        passToken: newPassToken(),
        ...(body.repeat ? { repeatDays: [...new Set(body.repeat.days)].sort(), dailyFrom: body.repeat.from, dailyTo: body.repeat.to } : {}),
      },
      include: visitInclude,
    });
    sendPassToVisitor(row);
    return reply.status(201).send(toVisitDto(row));
  });

  /** A guard registers someone who arrived without an invite; the host must approve. */
  app.post("/visits/walk-in", { bodyLimit: 1024 * 1024 }, async (request, reply) => {
    requireRole(request, "GUARD", "ADMIN");
    const body = walkInSchema.parse(request.body);
    const photo = body.photo ? decodePhoto(body.photo) : null;
    const stored = photo ? await storeImage("visitor", photo) : null;
    const host = await prisma.user.findUnique({ where: { id: body.hostId } });
    if (!host || host.role === "GUARD" || host.role === "PARENT") {
      throw new HttpError(400, "INVALID_HOST", "Choose a valid host");
    }
    const now = new Date();
    const row = await prisma.visit.create({
      data: {
        visitorName: body.visitorName,
        visitorPhone: body.visitorPhone,
        visitorType: body.visitorType,
        purpose: body.purpose,
        status: "PENDING_HOST",
        walkIn: true,
        visitorIdNumber: body.visitorIdNumber ?? null,
        ...(stored ? { visitorPhoto: stored.data, visitorPhotoKey: stored.key, visitorPhotoMime: photo!.mime } : {}),
        validFrom: now,
        validTo: new Date(now.getTime() + body.durationMinutes * 60_000),
        hostId: host.id,
        registeredById: request.user.sub,
        code: await newVisitCode(),
        passToken: newPassToken(),
      },
      include: visitInclude,
    });
    notifyLater([host.id], {
      kind: "VISITOR_AT_GATE",
      title: `${row.visitorName} is at the gate`,
      body: `${row.purpose}${row.visitorIdNumber ? ` · ID ${row.visitorIdNumber}` : ""} · phone ${row.visitorPhone}. Tap to see their photo and let them in or decline.`,
      data: { visitId: row.id },
    });
    return reply.status(201).send(toVisitDto(row));
  });

  app.get("/visits", async (request) => {
    const { scope } = z
      .object({ scope: z.enum(["all", "pending", "onsite"]).default("all") })
      .parse(request.query);
    const where: Prisma.VisitWhereInput = visitWhere(request);
    if (scope === "pending") {
      where.status = "PENDING_HOST";
      if (!staffRoles.has(request.user.role)) {
        delete where.OR;
        where.hostId = request.user.sub;
      }
    }
    if (scope === "onsite") where.status = "CHECKED_IN";
    const rows = await prisma.visit.findMany({
      where,
      include: visitInclude,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { visits: rows.map(toVisitDto) };
  });

  app.get("/visits/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const row = await prisma.visit.findFirst({ where: { ...visitWhere(request), id }, include: visitInclude });
    if (!row) throw new HttpError(404, "NOT_FOUND", "Visit not found");
    return toVisitDto(row);
  });

  /** Only the host decides a walk-in. */
  app.post("/visits/:id/decision", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { decision } = visitDecisionSchema.parse(request.body);
    const row = await prisma.visit.findUnique({ where: { id } });
    if (!row || row.hostId !== request.user.sub) {
      throw new HttpError(404, "NOT_FOUND", "Visit not found");
    }
    if (row.status !== "PENDING_HOST") {
      throw new FlowError("NOT_PENDING", "This visit has already been decided");
    }
    const changed = await prisma.visit.updateMany({
      where: { id, status: "PENDING_HOST" },
      data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED" },
    });
    if (changed.count === 0) throw new FlowError("CONFLICT", "This visit was just updated");
    const updated = await prisma.visit.findUniqueOrThrow({ where: { id }, include: visitInclude });
    if (decision === "APPROVE") sendPassToVisitor(updated);
    if (updated.walkIn) {
      // Tell the guard who registered the walk-in.
      notifyLater([updated.registeredById], {
        kind: "VISIT_DECIDED",
        title: decision === "APPROVE" ? `Let ${updated.visitorName} in` : `${updated.visitorName} was declined`,
        body: decision === "APPROVE" ? `${updated.host.name} approved the visit.` : `${updated.host.name} declined the visit.`,
        data: { visitId: id },
      });
    }
    return toVisitDto(updated);
  });

  /** The code the host forwards to the visitor. */
  app.get("/visits/:id/qr", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const row = await prisma.visit.findFirst({ where: { ...visitWhere(request), id }, include: { host: true } });
    if (!row) throw new HttpError(404, "NOT_FOUND", "Visit not found");
    if (row.status !== "APPROVED" && row.status !== "CHECKED_IN") {
      throw new FlowError("NOT_APPROVED", "This visit is not approved");
    }
    const ttl = Math.max(60, Math.floor((row.validTo.getTime() - Date.now()) / 1000));
    const response: QrTokenResponse = {
      token: visitToken(row, VISIT_QR_TTL_SECONDS),
      expiresIn: Math.min(ttl, VISIT_QR_TTL_SECONDS),
      offlineToken: null,
      offlineExpiresAt: null,
    };
    return response;
  });
}

/** Sends the visitor their pass link (QR + 6-digit code) on WhatsApp, so the host doesn't have to forward it. */
function sendPassToVisitor(v: { visitorName: string; visitorPhone: string; code: string; passToken: string | null; validFrom: Date; validTo: Date; host: { name: string }; repeatDays: number[]; dailyFrom: string | null; dailyTo: string | null }) {
  const to = normalizePhone(v.visitorPhone);
  if (!to || !v.passToken || !whatsappEnabled()) return;
  const span =
    v.repeatDays.length && v.dailyFrom && v.dailyTo
      ? `as a regular visitor (${describeRepeat({ days: v.repeatDays, from: v.dailyFrom, to: v.dailyTo })}) until ${when(v.validTo)}. Keep this message: the same pass works every time`
      : `for ${when(v.validFrom)} – ${when(v.validTo)}`;
  const text = `Hi ${v.visitorName.split(" ")[0]}, ${v.host.name} has invited you to campus ${span}.\n\nShow this pass at the gate, or tell the guard the code *${v.code}*:\n${passUrl(v.passToken)}`;
  background(() => sendWhatsApp({ to, text, kind: "VISITOR_PASS", title: `Visitor pass from ${v.host.name}`, body: `Code ${v.code} · ${passUrl(v.passToken!)}` }), "visitor pass whatsapp");
}
