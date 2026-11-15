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

const APPEARANCE_KEY = "inventory_pro_mobile_appearance";

export interface StoredAppearance {
  preference?: "system" | "light" | "dark";
  accentColor?: string;
}

export async function getStoredAppearance(): Promise<StoredAppearance | null> {
  try {
    let raw: string | null = null;
    if (Platform.OS === "web") {
      raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(APPEARANCE_KEY)
          : null;
    } else {
      raw = await SecureStore.getItemAsync(APPEARANCE_KEY);
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAppearance;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function setStoredAppearance(
  appearance: StoredAppearance,
): Promise<void> {
  const payload = JSON.stringify(appearance);
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(APPEARANCE_KEY, payload);
      }
    } catch {
      // ignore storage quota errors
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(APPEARANCE_KEY, payload);
  } catch {
    // ignore SecureStore write errors
  }
}
