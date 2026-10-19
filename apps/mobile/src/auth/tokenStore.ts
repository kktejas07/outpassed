import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "outpassed.accessToken";
const REFRESH_KEY = "outpassed.refreshToken";

/**
 * Token storage. expo-secure-store has no web implementation, so the web build
 * falls back to localStorage. Native platforms use the OS keychain/keystore.
 */
export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  }
  return SecureStore.getItemAsync(KEY);
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(KEY, token);
    return;
  }
  await SecureStore.setItemAsync(KEY, token);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === "web") return globalThis.localStorage?.getItem(REFRESH_KEY) ?? null;
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function setRefreshToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(REFRESH_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(REFRESH_KEY, token);
}

export async function clearRefreshToken(): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(REFRESH_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}
