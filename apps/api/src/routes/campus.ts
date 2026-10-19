import type { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { idParamSchema } from "@outpassed/shared";
import { audit } from "../lib/audit";
import { toUserDto, userInclude } from "../lib/dto";
import { idsOfRoles, notifyLater } from "../lib/notify";
import { mediaUrl } from "../lib/photo";
import { prisma } from "../lib/prisma";
import { campusSettings } from "../lib/settings";
import { when } from "../lib/time";
import { requireRole } from "../plugins/auth";
import { HttpError } from "../plugins/errorHandler";
import { decodePhoto } from "./photos";

const isAdmin = (r: FastifyRequest) => r.user.role === "ADMIN";

// ---------------------------------------------------------------- events

const eventInclude = {
  createdBy: { select: { id: true, name: true, role: true } },
  _count: { select: { registrations: true } },
} satisfies Prisma.CampusEventInclude;
type EventRow = Prisma.CampusEventGetPayload<{ include: typeof eventInclude }>;

function toEventDto(e: EventRow, registered: boolean) {
  const count = e._count.registrations;
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    venue: e.venue,
    category: e.category,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    capacity: e.capacity,
    registered,
    registrations: count,
    seatsLeft: e.capacity === null ? null : Math.max(0, e.capacity - count),
    registrationOpen: e.registrationOpen && e.status === "APPROVED" && e.endsAt > new Date(),
    status: e.status,
    rejectReason: e.rejectReason,
    organizer: { id: e.createdBy.id, name: e.createdBy.name },
  };
}

const eventBody = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(1).max(4000),
    venue: z.string().trim().min(1).max(160),
    category: z.string().trim().min(1).max(40).default("General"),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    capacity: z.number().int().min(1).max(100_000).optional(),
  })
  .refine((e) => new Date(e.endsAt) > new Date(e.startsAt), { message: "The end must be after the start", path: ["endsAt"] });

async function announceEvent(e: EventRow) {
  notifyLater(await idsOfRoles(["STUDENT", "FACULTY"]), {
    kind: "EVENT_PUBLISHED",
    title: `${e.category === "General" ? "Event" : e.category}: ${e.title}`,
    body: `${when(e.startsAt)} · ${e.venue}.${e.capacity ? ` ${e.capacity} seats.` : ""} Tap to register.`,
    data: { eventId: e.id },
  });
}

// ---------------------------------------------------------------- marketplace

const MARKET_CATEGORIES = ["Books", "Electronics", "Cycles", "Furniture", "Clothing", "Sports", "Other"] as const;

const itemInclude = {
  seller: { select: { id: true, name: true, phoneNormalized: true, student: { select: { hostel: true } } } },
  _count: { select: { interests: true } },
} satisfies Prisma.MarketItemInclude;
type ItemRow = Prisma.MarketItemGetPayload<{ include: typeof itemInclude }>;

function toItemDto(i: ItemRow, viewerId: string, interested: boolean) {
  const mine = i.seller.id === viewerId;
  return {
    id: i.id,
    title: i.title,
    description: i.description,
    price: i.price,
    category: i.category,
    condition: i.condition,
    status: i.status,
    photoUrl: i.photoMime ? mediaUrl("market", i.id, Math.floor(i.updatedAt.getTime() / 1000)) : null,
    seller: { id: i.seller.id, name: i.seller.name, hostel: i.seller.student?.hostel ?? null },
    mine,
    interested,
    interests: mine ? i._count.interests : null,
    /** A WhatsApp chat link, revealed once the buyer has said they're interested. */
    contactUrl: !mine && interested && i.seller.phoneNormalized ? `https://wa.me/${i.seller.phoneNormalized.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi, I saw your "${i.title}" on Outpass. Is it still available?`)}` : null,
    createdAt: i.createdAt.toISOString(),
  };
}

async function marketAllowed() {
  if ((await campusSettings()).schoolMode) throw new HttpError(404, "NOT_AVAILABLE", "The marketplace isn't available on this campus");
}

// ---------------------------------------------------------------- offers

const OFFER_CATEGORIES = ["Coding & assessments", "Courses & training", "Internships & consulting", "Food near campus", "Coupons", "Other"] as const;

const offerBody = z.object({
  category: z.enum(OFFER_CATEGORIES),
  partnerName: z.string().trim().min(1).max(80),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(1).max(600),
  url: z.url().max(500).optional(),
  couponCode: z.string().trim().max(40).optional(),
  activeTo: z.iso.datetime().optional(),
  sortOrder: z.number().int().min(-1000).max(1000).default(0),
});

export async function campusRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  // ---- events ----

  app.get("/events", async (request) => {
    const { scope } = z.object({ scope: z.enum(["upcoming", "mine", "pending", "past"]).default("upcoming") }).parse(request.query);
    if (scope === "pending") requireRole(request, "ADMIN");
    const now = new Date();
    const where: Prisma.CampusEventWhereInput =
      scope === "upcoming"
        ? { status: "APPROVED", endsAt: { gte: now } }
        : scope === "past"
          ? { status: "APPROVED", endsAt: { lt: now } }
          : scope === "pending"
            ? { status: "PENDING" }
            : { OR: [{ createdById: request.user.sub }, { registrations: { some: { userId: request.user.sub } } }] };
    const rows = await prisma.campusEvent.findMany({ where, include: eventInclude, orderBy: { startsAt: scope === "past" ? "desc" : "asc" }, take: 100 });
    const mine = new Set((await prisma.eventRegistration.findMany({ where: { userId: request.user.sub, eventId: { in: rows.map((r) => r.id) } }, select: { eventId: true } })).map((r) => r.eventId));
    return { events: rows.map((e) => toEventDto(e, mine.has(e.id))) };
  });

  app.get("/events/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const e = await prisma.campusEvent.findUnique({ where: { id }, include: eventInclude });
    if (!e || (e.status !== "APPROVED" && e.createdById !== request.user.sub && !isAdmin(request))) throw new HttpError(404, "NOT_FOUND", "Event not found");
    const registered = (await prisma.eventRegistration.count({ where: { eventId: id, userId: request.user.sub } })) > 0;
    return toEventDto(e, registered);
  });

  /** Admins publish at once; anyone else's event waits for an admin. */
  app.post("/events", async (request, reply) => {
    requireRole(request, "STUDENT", "FACULTY", "WARDEN", "ADMIN");
    const body = eventBody.parse(request.body);
    const admin = isAdmin(request);
    const e = await prisma.campusEvent.create({
      data: { ...body, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), capacity: body.capacity ?? null, createdById: request.user.sub, status: admin ? "APPROVED" : "PENDING", approvedById: admin ? request.user.sub : null },
      include: eventInclude,
    });
    if (admin) await announceEvent(e);
    else {
      notifyLater(await idsOfRoles(["ADMIN"]), { kind: "EVENT_PENDING", title: `New event to review: ${e.title}`, body: `From ${e.createdBy.name} · ${when(e.startsAt)} · ${e.venue}.`, data: { eventId: e.id } });
    }
    await audit(request, "EVENT_CREATED", `${admin ? "Published" : "Proposed"} event "${e.title}"`, { type: "event", id: e.id });
    return reply.status(201).send(toEventDto(e, false));
  });

  app.post("/admin/events/:id/decision", async (request) => {
    requireRole(request, "ADMIN");
    const { id } = idParamSchema.parse(request.params);
    const body = z.object({ decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().trim().max(300).optional() }).parse(request.body);
    const changed = await prisma.campusEvent.updateMany({
      where: { id, status: "PENDING" },
      data: body.decision === "APPROVE" ? { status: "APPROVED", approvedById: request.user.sub } : { status: "REJECTED", rejectReason: body.reason ?? null },
    });
    if (changed.count === 0) throw new HttpError(409, "NOT_PENDING", "This event was already reviewed");
    const e = await prisma.campusEvent.findUniqueOrThrow({ where: { id }, include: eventInclude });
    notifyLater([e.createdById], {
      kind: "EVENT_DECIDED",
      title: body.decision === "APPROVE" ? `Your event is live: ${e.title}` : `Your event wasn't approved: ${e.title}`,
      body: body.decision === "APPROVE" ? "Students have been told and can register now." : body.reason ?? "Ask the office for details.",
      data: { eventId: id },
    });
    if (body.decision === "APPROVE") await announceEvent(e);
    await audit(request, body.decision === "APPROVE" ? "EVENT_APPROVED" : "EVENT_REJECTED", `${body.decision === "APPROVE" ? "Approved" : "Rejected"} event "${e.title}"`, { type: "event", id });
    return toEventDto(e, false);
  });

  app.post("/events/:id/register", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const result = await prisma.$transaction(async (tx) => {
      // Lock the event row so two last-seat registrations can't both win.
      await tx.$queryRaw`SELECT id FROM "campus_events" WHERE id = ${id} FOR UPDATE`;
      const e = await tx.campusEvent.findUnique({ where: { id }, include: eventInclude });
      if (!e || e.status !== "APPROVED") throw new HttpError(404, "NOT_FOUND", "Event not found");
      if (!e.registrationOpen || e.endsAt < new Date()) throw new HttpError(409, "CLOSED", "Registration has closed");
      const already = await tx.eventRegistration.findUnique({ where: { eventId_userId: { eventId: id, userId: request.user.sub } } });
      if (already) return e;
      if (e.capacity !== null && e._count.registrations >= e.capacity) throw new HttpError(409, "FULL", "This event is full");
      await tx.eventRegistration.create({ data: { eventId: id, userId: request.user.sub } });
      return tx.campusEvent.findUniqueOrThrow({ where: { id }, include: eventInclude });
    });
    return toEventDto(result, true);
  });

  app.delete("/events/:id/register", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    await prisma.eventRegistration.deleteMany({ where: { eventId: id, userId: request.user.sub } });
    const e = await prisma.campusEvent.findUnique({ where: { id }, include: eventInclude });
    if (!e) throw new HttpError(404, "NOT_FOUND", "Event not found");
    return toEventDto(e, false);
  });

  /** Who registered: for the organizer and admins. */
  app.get("/events/:id/registrations", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const e = await prisma.campusEvent.findUnique({ where: { id } });
    if (!e || (e.createdById !== request.user.sub && !isAdmin(request))) throw new HttpError(404, "NOT_FOUND", "Event not found");
    const rows = await prisma.eventRegistration.findMany({ where: { eventId: id }, include: { user: { include: userInclude } }, orderBy: { createdAt: "asc" } });
    return { registrations: rows.map((r) => ({ at: r.createdAt.toISOString(), user: toUserDto(r.user) })) };
  });

  // ---- marketplace ----

  app.get("/market", async (request) => {
    await marketAllowed();
    const q = z.object({ scope: z.enum(["browse", "mine", "pending"]).default("browse"), category: z.string().max(40).optional(), q: z.string().trim().max(80).optional() }).parse(request.query);
    if (q.scope === "pending") requireRole(request, "ADMIN");
    const where: Prisma.MarketItemWhereInput = {
      ...(q.scope === "browse" ? { status: "ACTIVE" } : q.scope === "mine" ? { sellerId: request.user.sub, status: { not: "REMOVED" } } : { status: "PENDING" }),
      ...(q.category ? { category: q.category } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { description: { contains: q.q, mode: "insensitive" } }] } : {}),
    };
    const rows = await prisma.marketItem.findMany({ where, include: itemInclude, orderBy: { createdAt: "desc" }, take: 100 });
    const interested = new Set((await prisma.marketInterest.findMany({ where: { buyerId: request.user.sub, itemId: { in: rows.map((r) => r.id) } }, select: { itemId: true } })).map((r) => r.itemId));
    return { items: rows.map((i) => toItemDto(i, request.user.sub, interested.has(i.id))), categories: MARKET_CATEGORIES };
  });

  app.get("/market/:id", async (request) => {
    await marketAllowed();
    const { id } = idParamSchema.parse(request.params);
    const i = await prisma.marketItem.findUnique({ where: { id }, include: itemInclude });
    if (!i || (i.status !== "ACTIVE" && i.status !== "SOLD" && i.sellerId !== request.user.sub && !isAdmin(request))) throw new HttpError(404, "NOT_FOUND", "Item not found");
    const interested = (await prisma.marketInterest.count({ where: { itemId: id, buyerId: request.user.sub } })) > 0;
    return toItemDto(i, request.user.sub, interested);
  });

  app.post("/market", { bodyLimit: 1024 * 1024 }, async (request, reply) => {
    await marketAllowed();
    requireRole(request, "STUDENT", "FACULTY", "WARDEN", "ADMIN");
    const body = z
      .object({
        title: z.string().trim().min(3).max(100),
        description: z.string().trim().min(1).max(1500),
        price: z.number().int().min(0).max(10_00_000),
        category: z.enum(MARKET_CATEGORIES),
        condition: z.enum(["New", "Like new", "Used", "Needs repair"]).default("Used"),
        photo: z.string().min(100).max(700_000).optional(),
      })
      .parse(request.body);
    const photo = body.photo ? decodePhoto(body.photo) : null;
    const admin = isAdmin(request);
    const item = await prisma.marketItem.create({
      data: { sellerId: request.user.sub, title: body.title, description: body.description, price: body.price, category: body.category, condition: body.condition, status: admin ? "ACTIVE" : "PENDING", ...(photo ? { photo: photo.data, photoMime: photo.mime } : {}) },
      include: itemInclude,
    });
    if (!admin) notifyLater(await idsOfRoles(["ADMIN"]), { kind: "MARKET_PENDING", title: `New listing to review: ${item.title}`, body: `${item.seller.name} · ₹${item.price}`, data: { itemId: item.id } });
    return reply.status(201).send(toItemDto(item, request.user.sub, false));
  });

  app.post("/admin/market/:id/decision", async (request) => {
    requireRole(request, "ADMIN");
    const { id } = idParamSchema.parse(request.params);
    const body = z.object({ decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().trim().max(300).optional() }).parse(request.body);
    const changed = await prisma.marketItem.updateMany({ where: { id, status: "PENDING" }, data: { status: body.decision === "APPROVE" ? "ACTIVE" : "REJECTED", reports: 0 } });
    if (changed.count === 0) throw new HttpError(409, "NOT_PENDING", "This listing was already reviewed");
    const item = await prisma.marketItem.findUniqueOrThrow({ where: { id }, include: itemInclude });
    notifyLater([item.sellerId], {
      kind: "MARKET_DECIDED",
      title: body.decision === "APPROVE" ? `Your listing is live: ${item.title}` : `Your listing wasn't approved: ${item.title}`,
      body: body.decision === "APPROVE" ? "Other students can see it now." : body.reason ?? "It doesn't meet the campus marketplace rules.",
      data: { itemId: id },
    });
    await audit(request, body.decision === "APPROVE" ? "MARKET_APPROVED" : "MARKET_REJECTED", `${body.decision === "APPROVE" ? "Approved" : "Rejected"} listing "${item.title}"`, { type: "market", id });
    return toItemDto(item, request.user.sub, false);
  });

  /** "I'm interested": tells the seller who's asking, and gives the buyer a WhatsApp chat link. */
  app.post("/market/:id/interest", async (request) => {
    await marketAllowed();
    const { id } = idParamSchema.parse(request.params);
    const item = await prisma.marketItem.findUnique({ where: { id }, include: itemInclude });
    if (!item || item.status !== "ACTIVE") throw new HttpError(404, "NOT_FOUND", "This item isn't available");
    if (item.sellerId === request.user.sub) throw new HttpError(400, "OWN_ITEM", "That's your own listing");
    const created = await prisma.marketInterest.createMany({ data: [{ itemId: id, buyerId: request.user.sub }], skipDuplicates: true });
    if (created.count) {
      const buyer = await prisma.user.findUniqueOrThrow({ where: { id: request.user.sub }, include: { student: true } });
      notifyLater([item.sellerId], {
        kind: "MARKET_INTEREST",
        title: `${buyer.name} is interested in your ${item.title}`,
        body: `${[buyer.student?.hostel, buyer.phone].filter(Boolean).join(" · ") || "Reply from the app"}.`,
        data: { itemId: id },
      });
    }
    return toItemDto(item, request.user.sub, true);
  });

  app.post("/market/:id/sold", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const item = await prisma.marketItem.findUnique({ where: { id } });
    if (!item || (item.sellerId !== request.user.sub && !isAdmin(request))) throw new HttpError(404, "NOT_FOUND", "Item not found");
    await prisma.marketItem.update({ where: { id }, data: { status: "SOLD" } });
    return toItemDto(await prisma.marketItem.findUniqueOrThrow({ where: { id }, include: itemInclude }), request.user.sub, false);
  });

  app.delete("/market/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const item = await prisma.marketItem.findUnique({ where: { id } });
    if (!item || (item.sellerId !== request.user.sub && !isAdmin(request))) throw new HttpError(404, "NOT_FOUND", "Item not found");
    await prisma.marketItem.update({ where: { id }, data: { status: "REMOVED" } });
    if (isAdmin(request) && item.sellerId !== request.user.sub) await audit(request, "MARKET_REMOVED", `Removed listing "${item.title}"`, { type: "market", id });
    return reply.status(204).send();
  });

  /** Three reports take a listing down until an admin looks at it. */
  app.post("/market/:id/report", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(200) }).parse(request.body);
    const item = await prisma.marketItem.update({ where: { id }, data: { reports: { increment: 1 } } }).catch(() => null);
    if (!item) throw new HttpError(404, "NOT_FOUND", "Item not found");
    if (item.reports >= 3 && item.status === "ACTIVE") {
      await prisma.marketItem.update({ where: { id }, data: { status: "PENDING" } });
      notifyLater(await idsOfRoles(["ADMIN"]), { kind: "MARKET_PENDING", title: `Listing reported: ${item.title}`, body: `Hidden after ${item.reports} reports. Latest: ${reason}`, data: { itemId: id } });
    }
    return { ok: true };
  });

  // ---- offers & opportunities ----

  /** The same list for every adult student; nothing is personalised or tracked per person. */
  app.get("/offers", async (request) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user.sub }, include: userInclude });
    if (!toUserDto(user).showOffers && !isAdmin(request)) return { offers: [], categories: OFFER_CATEGORIES };
    const now = new Date();
    const rows = await prisma.offer.findMany({
      where: { active: true, activeFrom: { lte: now }, OR: [{ activeTo: null }, { activeTo: { gte: now } }] },
      orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
      take: 100,
    });
    return {
      offers: rows.map((o) => ({ id: o.id, category: o.category, partnerName: o.partnerName, title: o.title, body: o.body, url: o.url, couponCode: o.couponCode, activeTo: o.activeTo?.toISOString() ?? null })),
      categories: OFFER_CATEGORIES,
    };
  });

  /** Counts a tap (in total only) and returns where to go. */
  app.post("/offers/:id/open", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const o = await prisma.offer.update({ where: { id }, data: { clicks: { increment: 1 } } }).catch(() => null);
    if (!o) throw new HttpError(404, "NOT_FOUND", "Offer not found");
    return { url: o.url };
  });

  app.get("/admin/offers", async (request) => {
    requireRole(request, "ADMIN");
    const rows = await prisma.offer.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "desc" }, { createdAt: "desc" }] });
    return { offers: rows.map((o) => ({ ...o, activeFrom: o.activeFrom.toISOString(), activeTo: o.activeTo?.toISOString() ?? null, createdAt: o.createdAt.toISOString() })), categories: OFFER_CATEGORIES };
  });

  app.post("/admin/offers", async (request, reply) => {
    requireRole(request, "ADMIN");
    const body = offerBody.parse(request.body);
    const o = await prisma.offer.create({ data: { ...body, url: body.url ?? null, couponCode: body.couponCode ?? null, activeTo: body.activeTo ? new Date(body.activeTo) : null, createdById: request.user.sub } });
    await audit(request, "OFFER_CREATED", `Added offer "${o.title}" from ${o.partnerName}`, { type: "offer", id: o.id });
    return reply.status(201).send(o);
  });

  app.patch("/admin/offers/:id", async (request) => {
    requireRole(request, "ADMIN");
    const { id } = idParamSchema.parse(request.params);
    const body = offerBody.partial().extend({ active: z.boolean().optional() }).parse(request.body);
    const o = await prisma.offer.update({ where: { id }, data: { ...body, ...(body.activeTo ? { activeTo: new Date(body.activeTo) } : {}) } });
    await audit(request, "OFFER_UPDATED", `${body.active === false ? "Paused" : "Updated"} offer "${o.title}"`, { type: "offer", id });
    return o;
  });
}
