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
import { readImage, storeImage } from "../lib/blobStore";
import { receiptPdf } from "../lib/receipt";
import { campusInfo } from "./setup";

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
  payments: { orderBy: { createdAt: "desc" }, take: 30, select: { id: true, method: true, status: true, amountPaise: true, reference: true, note: true, createdAt: true, proofMime: true, reviewedAt: true, receiptNo: true } },
  student: { select: { id: true, name: true, student: { select: { rollNo: true, hostel: true } } } },
} satisfies Prisma.FeeInclude;
type FeeRow = Prisma.FeeGetPayload<{ include: typeof feeInclude }>;

const today = () => new Date(new Date().toISOString().slice(0, 10));

/** Paise accepted so far (verified payments). */
const paidOf = (f: { payments: { status: string; amountPaise: number }[] }) => f.payments.filter((p) => p.status === "VERIFIED").reduce((n, p) => n + p.amountPaise, 0);

function toFeeDto(f: FeeRow) {
  const paid = paidOf(f);
  return {
    id: f.id,
    category: f.category,
    title: f.title,
    amountPaise: f.amountPaise,
    paidPaise: paid,
    remainingPaise: f.status === "WAIVED" ? 0 : Math.max(0, f.amountPaise - paid),
    allowParts: f.allowParts,
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
      receiptNo: p.receiptNo,
      receiptUrl: p.status === "VERIFIED" && p.receiptNo ? mediaUrl("receipt", p.id) : null,
    })),
  };
}

/**
 * Accepts a payment: gives it a receipt number, then marks the fee paid once
 * accepted payments cover it (a part-payment leaves it due for the rest).
 */
async function acceptPayment(feeId: string, paymentId: string, reviewerId: string | null) {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "fees" WHERE id = ${feeId} FOR UPDATE`;
    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('fee_receipt_seq') AS n`;
    const payment = await tx.feePayment.update({ where: { id: paymentId }, data: { status: "VERIFIED", reviewedById: reviewerId, reviewedAt: now, receiptNo: Number(n) } });
    const fee = await tx.fee.findUniqueOrThrow({ where: { id: feeId }, include: { payments: { select: { status: true, amountPaise: true, method: true } } } });
    const paid = paidOf(fee);
    const pendingProof = fee.payments.some((p) => p.status === "PENDING" && p.method === "PROOF");
    const full = paid >= fee.amountPaise;
    await tx.fee.update({ where: { id: feeId }, data: full ? { status: "PAID", paidAt: now } : { status: pendingProof ? "SUBMITTED" : "DUE" } });
    return { fee, paid, full, amount: payment.amountPaise };
  });
  const { fee, paid, full, amount } = result;
  notifyLater([fee.studentId, ...(await guardianIds(fee.studentId))], {
    kind: "FEE_PAID",
    title: full ? `${fee.title} paid` : `${rupees(amount)} received for ${fee.title}`,
    body: full ? `${rupees(amount)} received. Thank you. Your receipt is in the app.` : `${rupees(fee.amountPaise - paid)} left to pay. Your receipt is in the app.`,
    data: { feeId },
  });
}

/** How much this payment should be: the rest of the fee, or a part the student chose when the fee allows it. */
function payAmount(fee: { amountPaise: number; allowParts: boolean }, paid: number, requested?: number) {
  const remaining = fee.amountPaise - paid;
  if (remaining <= 0) throw new HttpError(409, "ALREADY_PAID", "This fee is already settled");
  if (requested === undefined || requested === remaining) return remaining;
  if (!fee.allowParts) throw new HttpError(400, "NO_PART_PAYMENTS", "This fee has to be paid in full");
  const min = Math.min(10_000, remaining); // ₹100, or what's left if less
  if (requested < min || requested > remaining) throw new HttpError(400, "BAD_AMOUNT", `Pay between ${rupees(min)} and ${rupees(remaining)}`);
  return requested;
}

async function verifiedPaid(feeId: string) {
  const agg = await prisma.feePayment.aggregate({ where: { feeId, status: "VERIFIED" }, _sum: { amountPaise: true } });
  return agg._sum.amountPaise ?? 0;
}

const targetSchema = z
  .object({
    studentIds: z.array(z.uuid()).max(5000).optional(),
    hostelId: z.uuid().optional(),
    departmentId: z.uuid().optional(),
    allStudents: z.boolean().optional(),
    /** Every hosteller, or every day scholar (e.g. hostel fee vs bus fee). */
    residence: z.enum(["HOSTELLER", "DAY_SCHOLAR"]).optional(),
  })
  .refine((t) => [t.studentIds?.length, t.hostelId, t.departmentId, t.allStudents, t.residence].filter(Boolean).length === 1, { message: "Choose who the fee is for" });

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
          await acceptPayment(payment.feeId, payment.id, null);
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
        totals: { duePaise: open.reduce((n, f) => n + f.remainingPaise, 0), overdue: fees.filter((f) => f.overdue).length, open: open.length },
        onlinePayment: onlinePaymentsEnabled(),
      };
    });

    /** Pay online: returns a Razorpay payment link to open. */
    authed.post("/fees/:id/pay", async (request) => {
      requireRole(request, "STUDENT", "PARENT");
      const { id } = idParamSchema.parse(request.params);
      const { amountPaise: requested } = z.object({ amountPaise: z.number().int().positive().optional() }).parse(request.body ?? {});
      if (!onlinePaymentsEnabled()) throw new HttpError(400, "ONLINE_PAYMENT_OFF", "Online payment isn't set up yet. Pay at the office or upload your payment proof.");
      const fee = await prisma.fee.findUnique({ where: { id }, include: { student: true } });
      const allowed = fee && (fee.studentId === request.user.sub || (await prisma.guardianship.count({ where: { parentId: request.user.sub, studentId: fee.studentId } })) > 0);
      if (!fee || !allowed) throw new HttpError(404, "NOT_FOUND", "Fee not found");
      if (fee.status === "PAID" || fee.status === "WAIVED") throw new HttpError(409, "ALREADY_PAID", "This fee is already settled");
      const amount = payAmount(fee, await verifiedPaid(fee.id), requested);
      const payer = await prisma.user.findUniqueOrThrow({ where: { id: request.user.sub } });
      const link = await paymentGateway().createLink({
        amountPaise: amount,
        feeId: fee.id,
        description: `${fee.title} · ${fee.student.name}`,
        name: payer.name,
        phone: payer.phoneNormalized,
        email: payer.email,
        callbackUrl: `${env.PUBLIC_WEB_URL.replace(/\/+$/, "")}/app/fees?checked=${fee.id}`,
      });
      await prisma.feePayment.create({ data: { feeId: fee.id, method: "ONLINE", amountPaise: amount, gatewayOrderId: link.id } });
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
          await acceptPayment(id, p.id, null);
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
      const body = photoUploadSchema.extend({ reference: z.string().trim().min(4).max(60), amountPaise: z.number().int().positive().optional() }).parse(request.body);
      const fee = await prisma.fee.findUnique({ where: { id } });
      const allowed = fee && (fee.studentId === request.user.sub || (await prisma.guardianship.count({ where: { parentId: request.user.sub, studentId: fee.studentId } })) > 0);
      if (!fee || !allowed) throw new HttpError(404, "NOT_FOUND", "Fee not found");
      if (fee.status !== "DUE") throw new HttpError(409, "NOT_DUE", fee.status === "SUBMITTED" ? "Your proof is already with the office" : "This fee is already settled");
      const amount = payAmount(fee, await verifiedPaid(id), body.amountPaise);
      const img = decodePhoto(body.image);
      const stored = await storeImage("fee-proof", img);
      await prisma.$transaction([
        prisma.feePayment.create({ data: { feeId: id, method: "PROOF", amountPaise: amount, reference: body.reference, proof: stored.data, proofKey: stored.key, proofMime: img.mime } }),
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
          allowParts: z.boolean().default(false),
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
          ...(t.residence ? { student: { residence: t.residence } } : {}),
        },
        select: { id: true },
      });
      if (students.length === 0) throw new HttpError(400, "NO_STUDENTS", "No students match");
      const due = new Date(`${body.dueDate}T00:00:00Z`);
      await prisma.fee.createMany({
        data: students.map((s) => ({ studentId: s.id, category: body.category, title: body.title, amountPaise: body.amountPaise, dueDate: due, note: body.note ?? null, allowParts: body.allowParts, createdById: request.user.sub })),
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
      const openWhere: Prisma.FeeWhereInput = { status: { in: ["DUE", "SUBMITTED"] } };
      const [rows, open, partOfOpen, collected, paidCount, toReview] = await Promise.all([
        prisma.fee.findMany({ where, include: feeInclude, orderBy: [{ dueDate: "asc" }], take: 300 }),
        prisma.fee.aggregate({ where: openWhere, _sum: { amountPaise: true }, _count: true }),
        prisma.feePayment.aggregate({ where: { status: "VERIFIED", fee: openWhere }, _sum: { amountPaise: true } }),
        prisma.feePayment.aggregate({ where: { status: "VERIFIED" }, _sum: { amountPaise: true } }),
        prisma.fee.count({ where: { status: "PAID" } }),
        prisma.feePayment.count({ where: { method: "PROOF", status: "PENDING" } }),
      ]);
      return {
        fees: rows.map(toFeeDto),
        summary: {
          outstandingPaise: (open._sum.amountPaise ?? 0) - (partOfOpen._sum.amountPaise ?? 0),
          outstanding: open._count,
          collectedPaise: collected._sum.amountPaise ?? 0,
          paid: paidCount,
          proofsToReview: toReview,
        },
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
        await acceptPayment(p.feeId, p.id, request.user.sub);
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
      const { reference, amountPaise } = z.object({ reference: z.string().trim().max(60).optional(), amountPaise: z.number().int().positive().optional() }).parse(request.body ?? {});
      const fee = await prisma.fee.findUnique({ where: { id } });
      if (!fee) throw new HttpError(404, "NOT_FOUND", "Fee not found");
      if (fee.status === "PAID" || fee.status === "WAIVED") throw new HttpError(409, "ALREADY_PAID", "Already paid");
      // The office can take part of a fee at the counter even if online part-payments are off.
      const amount = payAmount({ ...fee, allowParts: true }, await verifiedPaid(id), amountPaise);
      const p = await prisma.feePayment.create({ data: { feeId: id, method: "OFFICE", amountPaise: amount, reference: reference ?? null } });
      await acceptPayment(id, p.id, request.user.sub);
      await audit(request, "FEE_MARKED_PAID", `Took ${rupees(amount)} for "${fee.title}" at the office${reference ? ` (ref ${reference})` : ""}`, { type: "fee", id });
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
    const { kind, id } = z.object({ kind: z.enum(["fee-proof", "market", "receipt", "ticket"]), id: z.uuid() }).parse(request.params);
    const q = z.object({ v: z.coerce.number().int().default(0), exp: z.coerce.number().int(), sig: z.string().min(10).max(100) }).safeParse(request.query);
    if (!q.success || !verifyMedia(kind, id, q.data.exp, q.data.v, q.data.sig)) throw new HttpError(403, "FORBIDDEN", "This link has expired");

    if (kind === "receipt") {
      const p = await prisma.feePayment.findUnique({
        where: { id },
        include: { fee: { include: { student: { select: { name: true, student: { select: { rollNo: true, hostel: true } } } }, payments: { select: { status: true, amountPaise: true, receiptNo: true } } } } },
      });
      if (!p || p.status !== "VERIFIED" || !p.receiptNo) throw new HttpError(404, "NOT_FOUND", "No receipt for this payment");
      // Paid so far as of this receipt: accepted payments up to and including this one.
      const upTo = p.fee.payments.filter((x) => x.status === "VERIFIED" && x.receiptNo !== null && x.receiptNo <= p.receiptNo!).reduce((n, x) => n + x.amountPaise, 0);
      const pdf = await receiptPdf({
        college: await campusInfo(),
        receiptNo: p.receiptNo,
        paidAt: p.reviewedAt ?? p.createdAt,
        student: { name: p.fee.student.name, rollNo: p.fee.student.student?.rollNo ?? null, hostel: p.fee.student.student?.hostel ?? null },
        fee: { title: p.fee.title, category: FEE_LABEL[p.fee.category], amountPaise: p.fee.amountPaise },
        payment: { amountPaise: p.amountPaise, method: p.method, reference: p.reference },
        paidSoFarPaise: upTo,
      });
      reply.header("content-type", "application/pdf").header("content-disposition", `inline; filename="receipt-OP-${String(p.receiptNo).padStart(6, "0")}.pdf"`).header("cache-control", "private, max-age=3600");
      return reply.send(pdf);
    }

    const row =
      kind === "fee-proof"
        ? await prisma.feePayment.findUnique({ where: { id }, select: { proof: true, proofKey: true, proofMime: true } }).then((r) => (r?.proofMime ? { data: r.proof, key: r.proofKey, mime: r.proofMime } : null))
        : kind === "market"
          ? await prisma.marketItem.findUnique({ where: { id }, select: { photo: true, photoKey: true, photoMime: true } }).then((r) => (r?.photoMime ? { data: r.photo, key: r.photoKey, mime: r.photoMime } : null))
          : await prisma.ticket.findUnique({ where: { id }, select: { photo: true, photoKey: true, photoMime: true } }).then((r) => (r?.photoMime ? { data: r.photo, key: r.photoKey, mime: r.photoMime } : null));
    const bytes = row ? await readImage(row) : null;
    if (!row || !bytes) throw new HttpError(404, "NOT_FOUND", "Not found");
    reply.header("content-type", row.mime).header("cache-control", "private, max-age=3600").header("cross-origin-resource-policy", "cross-origin");
    return reply.send(Buffer.from(bytes));
  });

}
