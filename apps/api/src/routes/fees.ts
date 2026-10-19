import { createHmac, timingSafeEqual } from "node:crypto";
import type { FeeCategory, Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idParamSchema, photoUploadSchema } from "@outpassed/shared";
import { env } from "../env";
import { audit } from "../lib/audit";
import { guardianIds, notifyLater } from "../lib/notify";
import { onlinePaymentsEnabled, paymentGateway } from "../lib/payments";
import { mediaUrl, verifyMedia } from "../lib/photo";
import { prisma } from "../lib/prisma";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";
import { decodePhoto } from "./photos";

export const FEE_LABEL: Record<FeeCategory, string> = {
  HOSTEL: "Hostel fee",
  MESS: "Mess fee",
  BUS: "Bus fee",
  TUITION: "Tuition fee",
  EXAM: "Exam fee",
  FINE: "Fine",
  OTHER: "Fee",
};
export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const feeInclude = {
  payments: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, method: true, status: true, amountPaise: true, reference: true, note: true, createdAt: true, proofMime: true, reviewedAt: true } },
  student: { select: { id: true, name: true, student: { select: { rollNo: true, hostel: true } } } },
} satisfies Prisma.FeeInclude;
type FeeRow = Prisma.FeeGetPayload<{ include: typeof feeInclude }>;

const today = () => new Date(new Date().toISOString().slice(0, 10));

function toFeeDto(f: FeeRow) {
  return {
    id: f.id,
    category: f.category,
    title: f.title,
    amountPaise: f.amountPaise,
    dueDate: f.dueDate.toISOString().slice(0, 10),
    status: f.status,
    overdue: f.status === "DUE" && f.dueDate < today(),
    note: f.note,
    paidAt: f.paidAt?.toISOString() ?? null,
    student: { id: f.student.id, name: f.student.name, rollNo: f.student.student?.rollNo ?? null, hostel: f.student.student?.hostel ?? null },
    payments: f.payments.map((p) => ({
      id: p.id,
      method: p.method,
      status: p.status,
      amountPaise: p.amountPaise,
      reference: p.reference,
      note: p.note,
      createdAt: p.createdAt.toISOString(),
      proofUrl: p.proofMime ? mediaUrl("fee-proof", p.id) : null,
    })),
  };
}

async function markPaid(feeId: string, paymentId: string, reviewerId: string | null) {
  const now = new Date();
  await prisma.$transaction([
    prisma.feePayment.update({ where: { id: paymentId }, data: { status: "VERIFIED", reviewedById: reviewerId, reviewedAt: now } }),
    prisma.fee.update({ where: { id: feeId }, data: { status: "PAID", paidAt: now } }),
  ]);
  const fee = await prisma.fee.findUniqueOrThrow({ where: { id: feeId } });
  notifyLater([fee.studentId, ...(await guardianIds(fee.studentId))], {
    kind: "FEE_PAID",
    title: `${fee.title} paid`,
    body: `${rupees(fee.amountPaise)} received. Thank you.`,
    data: { feeId },
  });
}

const targetSchema = z
  .object({
    studentIds: z.array(z.uuid()).max(5000).optional(),
    hostelId: z.uuid().optional(),
    departmentId: z.uuid().optional(),
    allStudents: z.boolean().optional(),
  })
  .refine((t) => [t.studentIds?.length, t.hostelId, t.departmentId, t.allStudents].filter(Boolean).length === 1, { message: "Choose who the fee is for" });

/**
 * Fees and dues: the office assigns them; students pay online, or upload a
 * payment screenshot for the office to check; reminders go out on their own.
 */
export async function feeRoutes(app: FastifyInstance): Promise<void> {
  // --- Razorpay webhook: needs the raw body to check the signature, so it lives in its own scope ---
  await app.register(async (scope) => {
    scope.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => done(null, body));
    scope.post("/payments/razorpay/webhook", async (request, reply) => {
      const raw = typeof request.body === "string" ? request.body : "";
      const given = String(request.headers["x-razorpay-signature"] ?? "");
      if (!env.RAZORPAY_WEBHOOK_SECRET) throw new HttpError(503, "NOT_CONFIGURED", "Webhook secret not set");
      const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex");
      if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
        throw new HttpError(401, "BAD_SIGNATURE", "Signature mismatch");
      }
      const event = JSON.parse(raw) as { event?: string; payload?: { payment_link?: { entity?: { id?: string } }; payment?: { entity?: { id?: string } } } };
      if (event.event === "payment_link.paid") {
        const linkId = event.payload?.payment_link?.entity?.id;
        const payment = linkId ? await prisma.feePayment.findUnique({ where: { gatewayOrderId: linkId } }) : null;
        if (payment && payment.status === "PENDING") {
          await prisma.feePayment.update({ where: { id: payment.id }, data: { gatewayPaymentId: event.payload?.payment?.entity?.id ?? null } });
          await markPaid(payment.feeId, payment.id, null);
        }
      }
      return reply.status(200).send({ ok: true });
    });
  });

  app.register(async (authed) => {
    authed.addHook("onRequest", app.authenticate);

    /** A student's own fees (parents see their children's). */
    authed.get("/fees", async (request) => {
      requireRole(request, "STUDENT", "PARENT");
      const ids =
        request.user.role === "STUDENT"
          ? [request.user.sub]
          : (await prisma.guardianship.findMany({ where: { parentId: request.user.sub }, select: { studentId: true } })).map((g) => g.studentId);
      const rows = await prisma.fee.findMany({ where: { studentId: { in: ids }, status: { not: "WAIVED" } }, include: feeInclude, orderBy: [{ status: "asc" }, { dueDate: "asc" }] });
      const fees = rows.map(toFeeDto);
      const open = fees.filter((f) => f.status === "DUE" || f.status === "SUBMITTED");
      return {
        fees,
        totals: { duePaise: open.reduce((n, f) => n + f.amountPaise, 0), overdue: fees.filter((f) => f.overdue).length, open: open.length },
        onlinePayment: onlinePaymentsEnabled(),
      };
    });

    /** Pay online: returns a Razorpay payment link to open. */
    authed.post("/fees/:id/pay", async (request) => {
      requireRole(request, "STUDENT", "PARENT");
      const { id } = idParamSchema.parse(request.params);
      if (!onlinePaymentsEnabled()) throw new HttpError(400, "ONLINE_PAYMENT_OFF", "Online payment isn't set up yet. Pay at the office or upload your payment proof.");
      const fee = await prisma.fee.findUnique({ where: { id }, include: { student: true } });
      const allowed = fee && (fee.studentId === request.user.sub || (await prisma.guardianship.count({ where: { parentId: request.user.sub, studentId: fee.studentId } })) > 0);
      if (!fee || !allowed) throw new HttpError(404, "NOT_FOUND", "Fee not found");
      if (fee.status === "PAID" || fee.status === "WAIVED") throw new HttpError(409, "ALREADY_PAID", "This fee is already settled");
      const payer = await prisma.user.findUniqueOrThrow({ where: { id: request.user.sub } });
      const link = await paymentGateway().createLink({
        amountPaise: fee.amountPaise,
        feeId: fee.id,
        description: `${fee.title} · ${fee.student.name}`,
        name: payer.name,
        phone: payer.phoneNormalized,
        email: payer.email,
        callbackUrl: `${env.PUBLIC_WEB_URL.replace(/\/+$/, "")}/app/fees?checked=${fee.id}`,
      });
      await prisma.feePayment.create({ data: { feeId: fee.id, method: "ONLINE", amountPaise: fee.amountPaise, gatewayOrderId: link.id } });
      return { url: link.url };
    });

    /** "I've paid": checks the gateway in case the webhook hasn't arrived yet. */
    authed.post("/fees/:id/check", async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const pending = await prisma.feePayment.findMany({ where: { feeId: id, method: "ONLINE", status: "PENDING", gatewayOrderId: { not: null } }, orderBy: { createdAt: "desc" }, take: 3 });
      for (const p of pending) {
        const s = await paymentGateway().linkStatus(p.gatewayOrderId!);
        if (s.status === "paid") {
          await prisma.feePayment.update({ where: { id: p.id }, data: { gatewayPaymentId: s.paymentId } });
          await markPaid(id, p.id, null);
          break;
        }
      }
      const fee = await prisma.fee.findUnique({ where: { id }, include: feeInclude });
      if (!fee) throw new HttpError(404, "NOT_FOUND", "Fee not found");
      return toFeeDto(fee);
    });

    /** Paid by UPI or at the bank: upload the screenshot and reference for the office to check. */
    authed.post("/fees/:id/proof", { bodyLimit: 1024 * 1024 }, async (request, reply) => {
      requireRole(request, "STUDENT", "PARENT");
      const { id } = idParamSchema.parse(request.params);
      const body = photoUploadSchema.extend({ reference: z.string().trim().min(4).max(60) }).parse(request.body);
      const fee = await prisma.fee.findUnique({ where: { id } });
      const allowed = fee && (fee.studentId === request.user.sub || (await prisma.guardianship.count({ where: { parentId: request.user.sub, studentId: fee.studentId } })) > 0);
      if (!fee || !allowed) throw new HttpError(404, "NOT_FOUND", "Fee not found");
      if (fee.status !== "DUE") throw new HttpError(409, "NOT_DUE", fee.status === "SUBMITTED" ? "Your proof is already with the office" : "This fee is already settled");
      const { data, mime } = decodePhoto(body.image);
      await prisma.$transaction([
        prisma.feePayment.create({ data: { feeId: id, method: "PROOF", amountPaise: fee.amountPaise, reference: body.reference, proof: data, proofMime: mime } }),
        prisma.fee.update({ where: { id }, data: { status: "SUBMITTED" } }),
      ]);
      const updated = await prisma.fee.findUniqueOrThrow({ where: { id }, include: feeInclude });
      return reply.status(201).send(toFeeDto(updated));
    });

    // --- office ---

    authed.post("/admin/fees", async (request, reply) => {
      requireRole(request, "ADMIN");
      const body = z
        .object({
          category: z.enum(["HOSTEL", "MESS", "BUS", "TUITION", "EXAM", "FINE", "OTHER"]),
          title: z.string().trim().min(2).max(120),
          amountPaise: z.number().int().min(100).max(1_00_00_000_00),
          dueDate: z.iso.date(),
          note: z.string().trim().max(300).optional(),
          target: targetSchema,
        })
        .parse(request.body);
      const t = body.target;
      const students = await prisma.user.findMany({
        where: {
          role: "STUDENT",
          ...(t.studentIds ? { id: { in: t.studentIds } } : {}),
          ...(t.hostelId ? { student: { hostelId: t.hostelId } } : {}),
          ...(t.departmentId ? { student: { departmentId: t.departmentId } } : {}),
        },
        select: { id: true },
      });
      if (students.length === 0) throw new HttpError(400, "NO_STUDENTS", "No students match");
      const due = new Date(`${body.dueDate}T00:00:00Z`);
      await prisma.fee.createMany({
        data: students.map((s) => ({ studentId: s.id, category: body.category, title: body.title, amountPaise: body.amountPaise, dueDate: due, note: body.note ?? null, createdById: request.user.sub })),
      });
      notifyLater(students.map((s) => s.id), {
        kind: "FEE_DUE",
        title: `${body.title}: ${rupees(body.amountPaise)}`,
        body: `Due ${due.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}. Pay in the app or at the office.`,
      });
      await audit(request, "FEES_ASSIGNED", `Assigned "${body.title}" (${rupees(body.amountPaise)}) to ${students.length} student${students.length === 1 ? "" : "s"}`, undefined, { category: body.category, count: students.length });
      return reply.status(201).send({ created: students.length });
    });

    authed.get("/admin/fees", async (request) => {
      requireRole(request, "ADMIN");
      const q = z.object({ status: z.enum(["DUE", "SUBMITTED", "PAID", "WAIVED", "OVERDUE"]).optional(), q: z.string().trim().max(80).optional() }).parse(request.query);
      const where: Prisma.FeeWhereInput = {
        ...(q.status === "OVERDUE" ? { status: "DUE", dueDate: { lt: today() } } : q.status ? { status: q.status } : {}),
        ...(q.q ? { student: { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { student: { rollNo: { equals: q.q, mode: "insensitive" } } }] } } : {}),
      };
      const [rows, open, paid, toReview] = await Promise.all([
        prisma.fee.findMany({ where, include: feeInclude, orderBy: [{ dueDate: "asc" }], take: 300 }),
        prisma.fee.aggregate({ where: { status: { in: ["DUE", "SUBMITTED"] } }, _sum: { amountPaise: true }, _count: true }),
        prisma.fee.aggregate({ where: { status: "PAID" }, _sum: { amountPaise: true }, _count: true }),
        prisma.feePayment.count({ where: { method: "PROOF", status: "PENDING" } }),
      ]);
      return {
        fees: rows.map(toFeeDto),
        summary: { outstandingPaise: open._sum.amountPaise ?? 0, outstanding: open._count, collectedPaise: paid._sum.amountPaise ?? 0, paid: paid._count, proofsToReview: toReview },
      };
    });

    /** The office checks an uploaded proof. */
    authed.post("/admin/fee-payments/:id/review", async (request) => {
      requireRole(request, "ADMIN");
      const { id } = idParamSchema.parse(request.params);
      const body = z.object({ decision: z.enum(["APPROVE", "REJECT"]), note: z.string().trim().max(300).optional() }).parse(request.body);
      const p = await prisma.feePayment.findUnique({ where: { id }, include: { fee: true } });
      if (!p || p.method !== "PROOF") throw new HttpError(404, "NOT_FOUND", "Payment not found");
      if (p.status !== "PENDING") throw new HttpError(409, "ALREADY_REVIEWED", "This payment was already checked");
      if (body.decision === "APPROVE") {
        await markPaid(p.feeId, p.id, request.user.sub);
      } else {
        if (!body.note) throw new HttpError(400, "REASON_REQUIRED", "Say why, so the student can fix it");
        await prisma.$transaction([
          prisma.feePayment.update({ where: { id }, data: { status: "REJECTED", reviewedById: request.user.sub, reviewedAt: new Date(), note: body.note } }),
          prisma.fee.update({ where: { id: p.feeId }, data: { status: "DUE" } }),
        ]);
        notifyLater([p.fee.studentId], { kind: "FEE_PROOF_REJECTED", title: `Payment proof not accepted: ${p.fee.title}`, body: body.note, data: { feeId: p.feeId } });
      }
      await audit(request, body.decision === "APPROVE" ? "FEE_PROOF_ACCEPTED" : "FEE_PROOF_REJECTED", `${body.decision === "APPROVE" ? "Accepted" : "Rejected"} payment proof for "${p.fee.title}" (ref ${p.reference})`, { type: "fee", id: p.feeId });
      const fee = await prisma.fee.findUniqueOrThrow({ where: { id: p.feeId }, include: feeInclude });
      return toFeeDto(fee);
    });

    /** Paid at the counter. */
    authed.post("/admin/fees/:id/mark-paid", async (request) => {
      requireRole(request, "ADMIN");
      const { id } = idParamSchema.parse(request.params);
      const { reference } = z.object({ reference: z.string().trim().max(60).optional() }).parse(request.body ?? {});
      const fee = await prisma.fee.findUnique({ where: { id } });
      if (!fee) throw new HttpError(404, "NOT_FOUND", "Fee not found");
      if (fee.status === "PAID") throw new HttpError(409, "ALREADY_PAID", "Already paid");
      const p = await prisma.feePayment.create({ data: { feeId: id, method: "OFFICE", amountPaise: fee.amountPaise, reference: reference ?? null } });
      await markPaid(id, p.id, request.user.sub);
      await audit(request, "FEE_MARKED_PAID", `Marked "${fee.title}" paid at the office${reference ? ` (ref ${reference})` : ""}`, { type: "fee", id });
      return toFeeDto(await prisma.fee.findUniqueOrThrow({ where: { id }, include: feeInclude }));
    });

    authed.post("/admin/fees/:id/waive", async (request) => {
      requireRole(request, "ADMIN");
      const { id } = idParamSchema.parse(request.params);
      const { reason } = z.object({ reason: z.string().trim().min(3).max(200) }).parse(request.body);
      const fee = await prisma.fee.update({ where: { id }, data: { status: "WAIVED", note: reason } });
      await audit(request, "FEE_WAIVED", `Waived "${fee.title}" — ${reason}`, { type: "fee", id });
      return toFeeDto(await prisma.fee.findUniqueOrThrow({ where: { id }, include: feeInclude }));
    });

    /** Proofs and other stored images, by signed link. */
    authed.get("/admin/fee-proofs-pending", async (request) => {
      requireRole(request, "ADMIN");
      const rows = await prisma.fee.findMany({ where: { status: "SUBMITTED" }, include: feeInclude, orderBy: { createdAt: "asc" }, take: 100 });
      return { fees: rows.map(toFeeDto) };
    });
  });

  // Signed media (no sign-in header, so <Image> works everywhere).
  app.get("/media/:kind/:id", async (request, reply) => {
    const { kind, id } = z.object({ kind: z.enum(["fee-proof", "market"]), id: z.uuid() }).parse(request.params);
    const q = z.object({ v: z.coerce.number().int().default(0), exp: z.coerce.number().int(), sig: z.string().min(10).max(100) }).safeParse(request.query);
    if (!q.success || !verifyMedia(kind, id, q.data.exp, q.data.v, q.data.sig)) throw new HttpError(403, "FORBIDDEN", "This link has expired");
    const row =
      kind === "fee-proof"
        ? await prisma.feePayment.findUnique({ where: { id }, select: { proof: true, proofMime: true } }).then((r) => (r?.proof ? { data: r.proof, mime: r.proofMime! } : null))
        : await prisma.marketItem.findUnique({ where: { id }, select: { photo: true, photoMime: true } }).then((r) => (r?.photo ? { data: r.photo, mime: r.photoMime! } : null));
    if (!row) throw new HttpError(404, "NOT_FOUND", "Not found");
    reply.header("content-type", row.mime).header("cache-control", "private, max-age=3600").header("cross-origin-resource-policy", "cross-origin");
    return reply.send(Buffer.from(row.data));
  });

}
