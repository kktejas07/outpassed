import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "./env";
import { drainNotifications } from "./lib/notify";
import { campusSettings } from "./lib/settings";
import { registerAuth } from "./plugins/auth";
import { registerErrorHandler } from "./plugins/errorHandler";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { adminRoutes } from "./routes/admin";
import { dashboardRoutes } from "./routes/dashboard";
import { gateRoutes } from "./routes/gate";
import { notificationRoutes } from "./routes/notifications";
import { outpassRoutes } from "./routes/outpass";
import { noticeRoutes } from "./routes/notices";
import { parcelRoutes } from "./routes/parcels";
import { publicRoutes } from "./routes/public";
import { sosRoutes } from "./routes/sos";
import { visitRoutes } from "./routes/visit";
import { hostelRoutes } from "./routes/hostels";
import { photoRoutes } from "./routes/photos";
import { setupRoutes } from "./routes/setup";
import { rollCallRoutes } from "./routes/rollcall";
import { departmentRoutes } from "./routes/departments";
import { feeRoutes } from "./routes/fees";
import { campusRoutes } from "./routes/campus";
import { consentRoutes } from "./routes/consent";
import { reportRoutes } from "./routes/reports";

/** Builds the Fastify instance. Kept separate from listen() so tests can inject. */
export async function buildApp(opts: { rateLimit?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    // Behind nginx / a load balancer: use X-Forwarded-For for the client address.
    trustProxy: true,
    logger:
      env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty" } }
        : true,
  });

  registerErrorHandler(app);
  await campusSettings();
  // Let in-flight notifications finish before the database connection closes.
  app.addHook("onClose", async () => drainNotifications());

  await app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
    // The default is only GET, HEAD and POST; the app also uses PUT, PATCH and DELETE.
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
  });

  // Security headers. CSP is left to the web server that serves the pages.
  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } });

  // Per-address limits: generous overall, strict on sign-in and code entry (see LIMITS).
  // This hook must run before the rate-limit plugin's own, so it's added first.
  app.addHook("onRoute", (route) => {
    const limit = LIMITS[route.url];
    if (limit) route.config = { ...(route.config as object), rateLimit: limit };
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    enableDraftSpec: true,
    allowList: () => !(opts.rateLimit ?? env.RATE_LIMIT),
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: { code: "RATE_LIMITED", message: `Too many attempts. Try again in ${Math.ceil(ctx.ttl / 1000)} seconds.` },
    }),
  });

  await registerAuth(app);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(outpassRoutes);
  await app.register(gateRoutes);
  await app.register(visitRoutes);
  await app.register(adminRoutes);
  await app.register(dashboardRoutes);
  await app.register(notificationRoutes);
  await app.register(publicRoutes);
  await app.register(parcelRoutes);
  await app.register(sosRoutes);
  await app.register(noticeRoutes);
  await app.register(hostelRoutes);
  await app.register(photoRoutes);
  await app.register(setupRoutes);
  await app.register(rollCallRoutes);
  await app.register(departmentRoutes);
  await app.register(feeRoutes);
  await app.register(campusRoutes);
  await app.register(consentRoutes);
  await app.register(reportRoutes);

  return app;
}

/** Stricter per-address limits for routes that take passwords or codes. */
const LIMITS: Record<string, { max: number; timeWindow: string }> = {
  "/auth/login": { max: 10, timeWindow: "1 minute" },
  "/auth/register": { max: 10, timeWindow: "1 minute" },
  "/auth/forgot": { max: 5, timeWindow: "1 minute" },
  "/auth/reset": { max: 10, timeWindow: "1 minute" },
  "/auth/otp/request": { max: 5, timeWindow: "1 minute" },
  "/auth/otp/verify": { max: 10, timeWindow: "1 minute" },
  "/auth/refresh": { max: 30, timeWindow: "1 minute" },
  "/setup": { max: 10, timeWindow: "1 minute" },
  "/public/visit-pass/:token": { max: 60, timeWindow: "1 minute" },
  "/gate/scan": { max: 120, timeWindow: "1 minute" },
  "/gate/lookup": { max: 60, timeWindow: "1 minute" },
};
