import * as Sentry from "@sentry/node";
import { env } from "../env";

/**
 * Crash reporting. Off unless SENTRY_DSN is set; then server errors (500s)
 * and crashes the apps report are sent to Sentry. Never sends request bodies,
 * passwords or photos: only the error, where it happened and the user's id and role.
 */
let on = false;

export function initErrorReporting() {
  if (!env.SENTRY_DSN || env.NODE_ENV === "test") return;
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV, tracesSampleRate: 0 });
  on = true;
}

export const errorReportingOn = () => on;

type Who = { id?: string; role?: string } | undefined;

export function reportServerError(error: unknown, ctx: { method: string; url: string; user?: Who }) {
  if (!on) return;
  Sentry.withScope((scope) => {
    scope.setTag("source", "api");
    scope.setContext("request", { method: ctx.method, route: ctx.url.split("?")[0] });
    if (ctx.user?.id) scope.setUser({ id: ctx.user.id, segment: ctx.user.role });
    Sentry.captureException(error);
  });
}

export type ClientError = { message: string; stack?: string; screen?: string; platform: string; appVersion?: string; fatal?: boolean };

export function reportClientError(e: ClientError, user?: Who) {
  if (!on) return;
  Sentry.withScope((scope) => {
    scope.setTag("source", "app");
    scope.setTag("platform", e.platform);
    if (e.appVersion) scope.setTag("app_version", e.appVersion);
    if (e.screen) scope.setTag("screen", e.screen);
    scope.setLevel(e.fatal ? "fatal" : "error");
    if (user?.id) scope.setUser({ id: user.id, segment: user.role });
    const err = new Error(e.message);
    err.name = "AppError";
    if (e.stack) err.stack = e.stack;
    Sentry.captureException(err);
  });
}
