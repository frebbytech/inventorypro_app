import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const existingExtra = (config.extra ?? {}) as Record<string, unknown>;
  const existingEas = (existingExtra.eas ?? {}) as Record<string, unknown>;

  const envProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  const projectId =
    (typeof existingEas.projectId === "string" && existingEas.projectId.trim()) ||
    envProjectId ||
    "";

  const envApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const apiBaseUrl =
    envApiBaseUrl ||
    (typeof existingExtra.apiBaseUrl === "string" ? existingExtra.apiBaseUrl.trim() : "");

  const envOwner = process.env.EXPO_OWNER?.trim();
  const owner =
    envOwner || (typeof config.owner === "string" ? config.owner.trim() : "");

  const existingUpdates = config.updates ?? {};
  const updatesUrl =
    existingUpdates.url ||
    (projectId ? `https://u.expo.dev/${projectId}` : undefined);

  return {
    ...config,
    name: config.name ?? "Inventory Pro",
    slug: config.slug ?? "inventory-pro",
    ...(owner ? { owner } : {}),
    updates: {
      ...existingUpdates,
      ...(updatesUrl ? { url: updatesUrl } : {}),
    },
    extra: {
      ...existingExtra,
      apiBaseUrl,
      ...(projectId
        ? {
            eas: {
              ...existingEas,
              projectId,
            },
          }
        : {}),
    },
  };
};
