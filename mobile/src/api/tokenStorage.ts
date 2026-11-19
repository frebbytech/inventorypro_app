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

const ONBOARDING_COMPLETED_KEY = "inventory_pro_mobile_onboarding_completed";

export async function getHasCompletedOnboarding(): Promise<boolean> {
  try {
    let raw: string | null = null;
    if (Platform.OS === "web") {
      raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(ONBOARDING_COMPLETED_KEY)
          : null;
    } else {
      raw = await SecureStore.getItemAsync(ONBOARDING_COMPLETED_KEY);
    }
    return raw === "true";
  } catch {
    return false;
  }
}

export async function setHasCompletedOnboarding(
  completed: boolean,
): Promise<void> {
  const value = completed ? "true" : "false";
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ONBOARDING_COMPLETED_KEY, value);
      }
    } catch {
      // ignore storage quota errors
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(ONBOARDING_COMPLETED_KEY, value);
  } catch {
    // ignore SecureStore write errors
  }
}

const WORKSPACE_MODE_KEY = "inventory_pro_workspace_mode";
const SERVER_URL_KEY = "inventory_pro_server_url";
const TENANT_INFO_KEY = "inventory_pro_tenant_info";
const SYNC_CURSOR_KEY = "inventory_pro_sync_cursor";

async function getKey(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return typeof window !== "undefined"
        ? window.localStorage.getItem(key)
        : null;
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setKey(key: string, value: string | null): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined") {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
      }
    } catch {
      // ignore storage errors
    }
    return;
  }
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // ignore SecureStore errors
  }
}

export async function getStoredWorkspaceMode(): Promise<"mobile_only" | "synced"> {
  const raw = await getKey(WORKSPACE_MODE_KEY);
  return raw === "synced" ? "synced" : "mobile_only";
}

export async function setStoredWorkspaceMode(
  mode: "mobile_only" | "synced",
): Promise<void> {
  await setKey(WORKSPACE_MODE_KEY, mode);
}

export async function getStoredServerUrl(): Promise<string | null> {
  return getKey(SERVER_URL_KEY);
}

export async function setStoredServerUrl(url: string | null): Promise<void> {
  await setKey(SERVER_URL_KEY, url ? url.trim().replace(/\/+$/, "") : null);
}

export interface StoredTenantInfo {
  id: string;
  name: string;
  slug: string;
}

export async function getStoredTenantInfo(): Promise<StoredTenantInfo | null> {
  const raw = await getKey(TENANT_INFO_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredTenantInfo;
    return parsed?.id && parsed?.slug ? parsed : null;
  } catch {
    return null;
  }
}

export async function setStoredTenantInfo(
  tenant: StoredTenantInfo | null,
): Promise<void> {
  await setKey(TENANT_INFO_KEY, tenant ? JSON.stringify(tenant) : null);
}

export async function getStoredSyncCursor(): Promise<number> {
  const raw = await getKey(SYNC_CURSOR_KEY);
  const parsed = Number(raw ?? "0");
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

export async function setStoredSyncCursor(cursor: number): Promise<void> {
  await setKey(SYNC_CURSOR_KEY, String(Math.max(0, Math.trunc(cursor || 0))));
}

