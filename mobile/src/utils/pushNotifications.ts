import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getUserErrorMessage } from "./errorHandler";

export type PushRegistrationStatus =
  | "idle"
  | "granted"
  | "denied"
  | "unsupported"
  | "no_project_id"
  | "error";

export interface PushTokenRegistrationResult {
  status: PushRegistrationStatus;
  token: string | null;
  reason?: string;
}

let handlerConfigured = false;

export function configureForegroundNotifications(): void {
  if (handlerConfigured || Platform.OS === "web") return;
  handlerConfigured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // Ignore when native module is unavailable
  }
}

export async function ensureAndroidNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("default", {
      name: "General Updates",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: "#3B82F6",
    });
    await Notifications.setNotificationChannelAsync("alerts", {
      name: "Stock & Team Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: "#3B82F6",
      sound: "default",
    });
  } catch {
    // Ignore on unsupported Android versions / simulators
  }
}

export function getEasProjectId(): string | null {
  const fromExtra = (
    Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined
  )?.eas?.projectId;
  if (typeof fromExtra === "string" && fromExtra.trim()) {
    return fromExtra.trim();
  }
  const fromEasConfig = (
    Constants as unknown as { easConfig?: { projectId?: unknown } }
  ).easConfig?.projectId;
  if (typeof fromEasConfig === "string" && fromEasConfig.trim()) {
    return fromEasConfig.trim();
  }
  const fromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim();
  }
  return null;
}

export async function registerForExpoPushTokenAsync(options?: {
  promptPermission?: boolean;
}): Promise<PushTokenRegistrationResult> {
  if (Platform.OS === "web") {
    return {
      status: "unsupported",
      token: null,
      reason: "Push notifications are only available on iOS and Android devices.",
    };
  }

  try {
    configureForegroundNotifications();
    await ensureAndroidNotificationChannels();

    const current = await Notifications.getPermissionsAsync();
    let finalStatus = current.status;

    if (finalStatus !== "granted" && options?.promptPermission !== false) {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }

    if (finalStatus !== "granted") {
      return {
        status: "denied",
        token: null,
        reason:
          "Notification permission was denied. Enable notifications in device Settings to receive alerts.",
      };
    }

    const projectId = getEasProjectId();
    if (!projectId) {
      return {
        status: "no_project_id",
        token: null,
        reason:
          "Device notifications are allowed. Link an EAS projectId via `npx eas init` to receive remote push tokens.",
      };
    }

    const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
    const cleanToken = String(tokenRes?.data || "").trim();
    if (!cleanToken) {
      return {
        status: "error",
        token: null,
        reason: "Expo did not return a device push token.",
      };
    }

    return {
      status: "granted",
      token: cleanToken,
    };
  } catch (err) {
    return {
      status: "error",
      token: null,
      reason: getUserErrorMessage(
        err,
        "Unable to initialize Expo push notifications on this device.",
        "pushNotifications.registerForExpoPushTokenAsync",
      ),
    };
  }
}

export async function sendTestLocalNotificationAsync(params?: {
  title?: string;
  body?: string;
}): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    configureForegroundNotifications();
    await ensureAndroidNotificationChannels();
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      if (req.status !== "granted") return false;
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: params?.title || "Inventory Pro Alert Ready",
        body:
          params?.body ||
          "Local & hardware notification alerts are active on this device.",
        sound: "default",
        data: {
          referenceType: "notifications",
          route: "/notifications",
        },
      },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}

export function resolveNotificationNavigationTarget(
  data: Record<string, unknown> | undefined | null,
):
  | { pathname: "/product/[id]"; params: { id: string } }
  | { pathname: "/sales/[id]"; params: { id: string } }
  | "/messages"
  | "/security"
  | "/notifications" {
  const refType = String(data?.referenceType || "").trim().toLowerCase();
  const refId = String(data?.referenceId || "").trim();

  if ((refType === "product" || refType === "product_low_stock") && refId) {
    return { pathname: "/product/[id]", params: { id: refId } };
  }
  if (refType === "sale" && refId) {
    return { pathname: "/sales/[id]", params: { id: refId } };
  }
  if (refType === "broadcast") {
    return "/messages";
  }
  if (refType === "security") {
    return "/security";
  }
  return "/notifications";
}
