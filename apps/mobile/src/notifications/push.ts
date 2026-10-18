import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";
import { api } from "../api/client";

/**
 * Phone push for iOS and Android via Expo. The web build skips all of this;
 * web users see the same alerts in the in-app inbox.
 */

const native = Platform.OS === "ios" || Platform.OS === "android";
let registered: string | null = null;

if (native) {
  Notifications.setNotificationHandler({
    // While the app is open the in-app ribbon shows the alert instead of the system banner.
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Asks for permission and registers this phone for alerts. Never throws. */
export async function registerForPush(authToken: string): Promise<void> {
  if (!native || !Device.isDevice) return;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Outpass alerts",
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: "#C9A227",
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return;
    const id = projectId();
    if (!id) {
      console.warn("Push disabled: no EAS projectId (run `eas init` in apps/mobile).");
      return;
    }
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await api.registerDevice(authToken, data, Platform.OS as "ios" | "android");
    registered = data;
  } catch (err) {
    console.warn("Push registration failed", err);
  }
}

/** Stops alerts for this phone when the user signs out. */
export async function unregisterPush(authToken: string): Promise<void> {
  if (!registered) return;
  const token = registered;
  registered = null;
  await api.removeDevice(authToken, token).catch(() => undefined);
}

/** Where tapping an alert should take you. */
export function openFromData(data: Record<string, unknown> | undefined) {
  if (!data) return;
  if (typeof data.outpassId === "string") router.push(`/outpass/${data.outpassId}`);
  else if (typeof data.visitId === "string") router.push(`/visit/${data.visitId}`);
  else if (typeof data.sosId === "string") router.push("/sos");
  else if (typeof data.parcelId === "string") router.push("/parcels");
  else if (typeof data.noticeId === "string") router.push("/notices");
  else router.push("/notifications");
}

/** Opens the right screen when the user taps an alert (including from a cold start). */
export function listenForTaps(): () => void {
  if (!native) return () => undefined;
  void Notifications.getLastNotificationResponseAsync().then((r) => {
    if (r) openFromData(r.notification.request.content.data);
  });
  const sub = Notifications.addNotificationResponseReceivedListener((r) => openFromData(r.notification.request.content.data));
  return () => sub.remove();
}

/** Calls back when a push arrives while the app is open. */
export function onForegroundPush(cb: (n: { title: string; body: string; data: Record<string, unknown> }) => void): () => void {
  if (!native) return () => undefined;
  const sub = Notifications.addNotificationReceivedListener((n) =>
    cb({ title: n.request.content.title ?? "", body: n.request.content.body ?? "", data: (n.request.content.data ?? {}) as Record<string, unknown> }),
  );
  return () => sub.remove();
}
