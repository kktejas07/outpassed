import type { FastifyInstance } from "fastify";
import type { DashboardSummary } from "@outpassed/shared";
import { prisma } from "../lib/prisma";
import { outpassInclude, toOutpassDto } from "../lib/dto";
import { requireRole } from "../plugins/auth";
import { studentInHostels, wardenScope } from "../lib/hostels";

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /** Live campus picture for wardens and admins. */
  app.get("/dashboard/summary", async (request) => {
    requireRole(request, "WARDEN", "ADMIN");
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    // A warden assigned to hostels sees only their students' numbers.
    const scope = await wardenScope(request.user.sub, request.user.role);
    const mine = scope ? { student: studentInHostels(scope) } : {};
    const mineSos = scope ? { raisedBy: studentInHostels(scope) } : {};

    const [outNow, overdueRows, pendingApprovals, visitorsOnSite, movementsToday, openSos, parcelsWaiting, extensionRequests] = await Promise.all([
      prisma.outpass.count({ where: { ...mine, status: "OUT" } }),
      prisma.outpass.findMany({
        where: { ...mine, status: "OUT", returnBy: { lt: now } },
        include: outpassInclude,
        orderBy: { returnBy: "asc" },
        take: 50,
      }),
      prisma.outpass.count({ where: { ...mine, status: { in: ["PENDING_PARENT", "PENDING_WARDEN"] } } }),
      prisma.visit.count({ where: { status: "CHECKED_IN" } }),
      prisma.gateEvent.count({ where: { accepted: true, createdAt: { gte: startOfDay } } }),
      prisma.sosAlert.count({ where: { ...mineSos, status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
      prisma.parcel.count({ where: { ...mine, status: "AT_GATE" } }),
      prisma.outpassExtension.count({ where: { status: "PENDING", ...(scope ? { outpass: mine } : {}) } }),
    ]);

    const summary: DashboardSummary = {
      outNow,
      overdue: overdueRows.length,
      pendingApprovals,
      visitorsOnSite,
      movementsToday,
      openSos,
      parcelsWaiting,
      extensionRequests,
      overdueList: overdueRows.map((r) => toOutpassDto(r, now)),
    };
    return summary;
  });
}
