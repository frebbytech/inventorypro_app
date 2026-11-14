import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "inventory_pro_mobile_token";

export async function getStoredAuthToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return typeof window !== "undefined"
        ? window.localStorage.getItem(TOKEN_KEY)
        : null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setStoredAuthToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(TOKEN_KEY, token);
      }
    } catch {
      // ignore storage quota errors
    }
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredAuthToken(): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      // ignore
    }
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
