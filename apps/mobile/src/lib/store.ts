import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Small persisted values (keychain on phones, localStorage on web). Best
 * effort: a failure reads as "nothing stored" and never throws.
 */
export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(key) ?? null : await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    const raw = JSON.stringify(value);
    if (Platform.OS === "web") globalThis.localStorage?.setItem(key, raw);
    else await SecureStore.setItemAsync(key, raw);
  } catch {
    // ignore
  }
}

/** SecureStore keys allow only letters, digits and . - _ */
export const safeKey = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_");
