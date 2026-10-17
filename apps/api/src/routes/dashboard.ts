import type { FastifyInstance } from "fastify";
import type { DashboardSummary } from "@outpassed/shared";
import { prisma } from "../lib/prisma";
import { outpassInclude, toOutpassDto } from "../lib/dto";
import { requireRole } from "../plugins/auth";

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /** Live campus picture for wardens and admins. */
  app.get("/dashboard/summary", async (request) => {
    requireRole(request, "WARDEN", "ADMIN");
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const [outNow, overdueRows, pendingApprovals, visitorsOnSite, movementsToday] = await Promise.all([
      prisma.outpass.count({ where: { status: "OUT" } }),
      prisma.outpass.findMany({
        where: { status: "OUT", returnBy: { lt: now } },
        include: outpassInclude,
        orderBy: { returnBy: "asc" },
        take: 50,
      }),
      prisma.outpass.count({ where: { status: { in: ["PENDING_PARENT", "PENDING_WARDEN"] } } }),
      prisma.visit.count({ where: { status: "CHECKED_IN" } }),
      prisma.gateEvent.count({ where: { accepted: true, createdAt: { gte: startOfDay } } }),
    ]);

    const summary: DashboardSummary = {
      outNow,
      overdue: overdueRows.length,
      pendingApprovals,
      visitorsOnSite,
      movementsToday,
      overdueList: overdueRows.map((r) => toOutpassDto(r, now)),
    };
    return summary;
  });
}
