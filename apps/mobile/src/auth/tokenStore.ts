import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "outpassed.accessToken";

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
