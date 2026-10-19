import Constants from "expo-constants";
import { Platform } from "react-native";
import { BASE_URL } from "../api/client";
import { getToken } from "../auth/tokenStore";

/**
 * Sends app crashes to the server (POST /client-errors), which logs them and
 * forwards them to Sentry when the server has a SENTRY_DSN. No extra native
 * module, so it works the same on iPhone, Android and the web. Capped per
 * session so a crash loop can't flood the server.
 */
let sent = 0;
const seen = new Set<string>();
let screen: string | undefined;

export function setCrashScreen(path: string) {
  screen = path;
}

export async function reportError(error: unknown, fatal = false) {
  const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  const key = `${e.message}|${screen ?? ""}`;
  if (sent >= 10 || seen.has(key)) return;
  sent += 1;
  seen.add(key);
  try {
    const token = await getToken().catch(() => null);
    await fetch(`${BASE_URL}/client-errors`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        message: e.message.slice(0, 500) || "Error",
        stack: e.stack?.slice(0, 8000),
        screen,
        platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web",
        appVersion: Constants.expoConfig?.version,
        fatal,
      }),
    });
  } catch {
    // Reporting must never cause another error.
  }
}

let installed = false;

/** Catches errors nothing else handled: JS crashes on phones, uncaught errors and rejections on the web. */
export function installCrashReporting() {
  if (installed) return;
  installed = true;
  if (Platform.OS === "web") {
    const w = globalThis as unknown as { addEventListener?: (t: string, f: (e: { error?: unknown; reason?: unknown; message?: string }) => void) => void };
    w.addEventListener?.("error", (ev) => void reportError(ev.error ?? ev.message));
    w.addEventListener?.("unhandledrejection", (ev) => void reportError(ev.reason));
    return;
  }
  const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void } };
  const utils = g.ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((err, fatal) => {
    void reportError(err, !!fatal);
    previous(err, fatal);
  });
}
