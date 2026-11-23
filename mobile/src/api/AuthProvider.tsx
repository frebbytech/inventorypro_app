import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { eq } from "drizzle-orm";
import { Platform } from "react-native";
import {
  ensureDbReady,
  isSqliteFullError,
  resetDatabaseForCloudSync,
} from "@/db/client";
import {
  getStoreProfile,
  getUnreadNotificationCount as getLocalUnreadNotificationCount,
} from "@/db/queries";
import { users } from "@/db/schema";
import { listAllOutboxItems } from "@/db/syncStore";
import { HttpApiClient, resolveApiBaseUrl } from "./httpAdapter";
import {
  ExpoSqliteDrizzleClient,
  type AuthenticatedApiClient,
} from "./sqliteAdapter";
import { SyncedApiClient } from "./syncedAdapter";
import { SyncEngine } from "./syncEngine";
import {
  clearStoredAuthToken,
  getHasCompletedOnboarding,
  getStoredAuthToken,
  getStoredExpoPushToken,
  getStoredServerUrl,
  getStoredTenantInfo,
  getStoredWorkspaceMode,
  setHasCompletedOnboarding,
  setStoredAuthToken,
  setStoredExpoPushToken,
  setStoredServerUrl,
  setStoredSyncCursor,
  setStoredTenantInfo,
  setStoredWorkspaceMode,
} from "./tokenStorage";
import {
  registerForExpoPushTokenAsync,
  type PushRegistrationStatus,
  type PushTokenRegistrationResult,
} from "@/utils/pushNotifications";
import type {
  AuthLoginPayload,
  AuthLoginResponse,
  AuthLoginResult,
  ChangePasswordInput,
  SendDailyReportResult,
  SessionUser,
  StaffTwoFactorAccount,
  StoreProfile,
  SyncOutboxItem,
  SyncStatus,
  TenantInfo,
  UpdateBusinessHoursInput,
  UpdateBusinessSettingsInput,
  UpdateMyProfileInput,
  UpdateNotificationSettingsInput,
  UpdateTwoFactorInput,
  WorkspaceMode,
} from "@/types/domain";

interface AuthContextValue {
  workspaceMode: WorkspaceMode;
  serverUrl: string;
  isPlatformUrlConfigured: boolean;
  isResolvingServerUrl: boolean;
  refreshPlatformServerUrl: (force?: boolean) => Promise<string>;
  tenant: TenantInfo | null;
  syncStatus: SyncStatus;
  syncVersion: number;
  pendingOutboxCount: number;
  conflictOutboxCount: number;
  lastSyncedAt: string | null;
  syncError: string | null;
  user: SessionUser | null;
  store: StoreProfile | null;
  token: string | null;
  isRestoring: boolean;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  unreadNotificationsCount: number;
  refreshUnreadNotifications: () => Promise<void>;
  pushStatus: PushRegistrationStatus;
  expoPushToken: string | null;
  pushStatusMessage: string | null;
  registerDevicePushToken: (opts?: {
    promptPermission?: boolean;
  }) => Promise<PushTokenRegistrationResult>;
  unregisterDevicePushToken: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  apiClient: AuthenticatedApiClient;
  setWorkspaceModePreference: (mode: WorkspaceMode) => Promise<void>;
  signIn: (
    identifier: string,
    password: string,
    options?: { workspaceSlug?: string },
  ) => Promise<AuthLoginResult>;
  verifyTwoFactorSignIn: (
    challengeToken: string,
    code: string,
  ) => Promise<void>;
  resendTwoFactorCode: (challengeToken: string) => Promise<{
    challengeToken: string;
    method: string;
    maskedTarget: string;
  }>;
  authenticateCloudPreview: (
    payload: AuthLoginPayload,
  ) => Promise<AuthLoginResult>;
  verifyTwoFactorPreview: (payload: {
    challengeToken: string;
    code: string;
  }) => Promise<AuthLoginResponse>;
  finalizeCloudTransition: (
    authResponse: AuthLoginResponse,
    strategy: "merge" | "pull",
  ) => Promise<void>;
  switchBackToMobileOnly: () => Promise<void>;
  triggerSyncNow: () => Promise<void>;
  discardSyncConflicts: () => Promise<void>;
  listSyncOutboxItems: () => Promise<SyncOutboxItem[]>;
  retrySyncOutboxItem: (id: string) => Promise<void>;
  retryAllSyncConflicts: () => Promise<void>;
  discardSyncOutboxItem: (
    id: string,
  ) => Promise<{ refreshedFromCloud: boolean }>;
  signOut: () => Promise<void>;
  refreshStoreSettings: () => Promise<StoreProfile>;
  updateStockThreshold: (threshold: number) => Promise<StoreProfile>;
  updateBusinessSettings: (
    input: UpdateBusinessSettingsInput,
  ) => Promise<StoreProfile>;
  updateNotificationSettings: (
    input: UpdateNotificationSettingsInput,
  ) => Promise<StoreProfile>;
  updateBusinessHours: (
    input: UpdateBusinessHoursInput,
  ) => Promise<StoreProfile>;
  sendDailyReportNow: (dateStr?: string) => Promise<SendDailyReportResult>;
  updateMyProfile: (input: UpdateMyProfileInput) => Promise<SessionUser>;
  updateUserTwoFactor: (
    input: UpdateTwoFactorInput,
  ) => Promise<StaffTwoFactorAccount>;
  changePassword: (input: ChangePasswordInput) => Promise<void>;
  uploadProductImage: (
    localUri: string,
    opts?: { mimeType?: string; fileName?: string; webFile?: Blob },
  ) => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function extractTenant(res: {
  tenant?: TenantInfo;
  user?: SessionUser;
}): TenantInfo | null {
  if (res.tenant?.id && res.tenant?.slug) return res.tenant;
  if (res.user?.tenantId && res.user?.tenantSlug) {
    return {
      id: res.user.tenantId,
      name: res.user.tenantName || "Store Workspace",
      slug: res.user.tenantSlug,
    };
  }
  return null;
}

function isLegacyMetroUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /:(8081|19000|19001|19006)(\/|$)/.test(url);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("mobile_only");
  const [serverUrl, setServerUrlState] = useState<string>(resolveApiBaseUrl());
  const [isPlatformUrlConfigured, setIsPlatformUrlConfigured] = useState(false);
  const [isResolvingServerUrl, setIsResolvingServerUrl] = useState(false);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboardingState] =
    useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [pushStatus, setPushStatus] = useState<PushRegistrationStatus>("idle");
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local_only");
  const [syncVersion, setSyncVersion] = useState(0);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [conflictOutboxCount, setConflictOutboxCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);
  const userRef = useRef<SessionUser | null>(null);
  const serverUrlRef = useRef<string>(resolveApiBaseUrl());
  const syncEngineRef = useRef<SyncEngine | null>(null);
  const authEpochRef = useRef(0);
  const isBootstrappingRef = useRef(false);
  const refreshPromiseRef = useRef<Promise<string> | null>(null);
  const lastServerResolveAtRef = useRef<number>(0);

  const commitToken = useCallback((next: string | null) => {
    tokenRef.current = next;
    setToken(next);
  }, []);

  const commitUser = useCallback(
    (
      next:
        | SessionUser
        | null
        | ((prev: SessionUser | null) => SessionUser | null),
    ) => {
      if (typeof next === "function") {
        setUser((prev) => {
          const resolved = next(prev);
          userRef.current = resolved;
          return resolved;
        });
      } else {
        userRef.current = next;
        setUser(next);
      }
    },
    [],
  );

  const commitServerUrl = useCallback((next: string) => {
    const clean = next.trim().replace(/\/+$/, "");
    serverUrlRef.current = clean;
    setServerUrlState(clean);
  }, []);

  const handleUnauthorized = useCallback(() => {
    if (isBootstrappingRef.current) return;
    authEpochRef.current += 1;
    syncEngineRef.current?.stop();
    syncEngineRef.current = null;
    commitToken(null);
    commitUser(null);
    setTenant(null);
    setUnreadNotificationsCount(0);
    setSyncStatus("local_only");
    void clearStoredAuthToken();
    void setStoredTenantInfo(null);
  }, [commitToken, commitUser]);

  const sqliteClient = useMemo(
    () =>
      new ExpoSqliteDrizzleClient({
        getAccessToken: () => tokenRef.current,
        onUnauthorized: handleUnauthorized,
      }),
    [handleUnauthorized],
  );

  const httpClient = useMemo(
    () =>
      new HttpApiClient({
        getBaseUrl: () => serverUrlRef.current,
        getAccessToken: () => tokenRef.current,
        onUnauthorized: handleUnauthorized,
      }),
    [handleUnauthorized],
  );

  const syncedClient = useMemo(
    () =>
      new SyncedApiClient(
        httpClient,
        () => userRef.current?.id ?? null,
        () => syncEngineRef.current,
        () => setSyncVersion((v) => v + 1),
      ),
    [httpClient],
  );

  const apiClient = workspaceMode === "synced" ? syncedClient : sqliteClient;

  const refreshUnreadNotifications = useCallback(async () => {
    if (!tokenRef.current) {
      setUnreadNotificationsCount(0);
      return;
    }
    try {
      const cnt = await apiClient.getUnreadNotificationCount();
      setUnreadNotificationsCount(cnt);
    } catch {
      // Ignore transient errors
    }
  }, [apiClient]);

  const registerDevicePushToken = useCallback(
    async (opts?: {
      promptPermission?: boolean;
    }): Promise<PushTokenRegistrationResult> => {
      const result = await registerForExpoPushTokenAsync({
        promptPermission: opts?.promptPermission ?? true,
      });
      setPushStatus(result.status);
      setPushStatusMessage(result.reason ?? null);

      if (result.token) {
        setExpoPushToken(result.token);
        await setStoredExpoPushToken(result.token);
        if (workspaceMode === "synced" && tokenRef.current) {
          await httpClient
            .registerPushToken({
              token: result.token,
              platform: Platform.OS,
              deviceName: `Inventory Pro (${Platform.OS})`,
            })
            .catch(() => {});
        }
      }
      return result;
    },
    [workspaceMode, httpClient],
  );

  const unregisterDevicePushToken = useCallback(async (): Promise<void> => {
    const activeToken = expoPushToken || (await getStoredExpoPushToken());
    if (activeToken && tokenRef.current) {
      await httpClient.unregisterPushToken(activeToken).catch(() => {});
    }
    setExpoPushToken(null);
    setPushStatus("idle");
    setPushStatusMessage(null);
    await setStoredExpoPushToken(null);
  }, [expoPushToken, httpClient]);

  useEffect(() => {
    if (
      workspaceMode !== "synced" ||
      !token ||
      !user ||
      store?.notificationPush === false
    ) {
      return;
    }
    void registerDevicePushToken({ promptPermission: false });
  }, [
    workspaceMode,
    token,
    user?.id,
    store?.notificationPush,
    registerDevicePushToken,
  ]);

  // Manage live SyncEngine lifecycle whenever authenticated in Synced mode
  useEffect(() => {
    if (workspaceMode !== "synced" || !token || !user) {
      if (syncEngineRef.current) {
        syncEngineRef.current.stop();
        syncEngineRef.current = null;
      }
      setSyncStatus(workspaceMode === "synced" ? "offline" : "local_only");
      setPendingOutboxCount(0);
      setConflictOutboxCount(0);
      return;
    }

    const engine = new SyncEngine(
      httpClient,
      () => tokenRef.current,
      (snapshot) => {
        setStore(snapshot.store);
        commitUser(snapshot.user);
        setTenant(snapshot.tenant);
        if (Array.isArray(snapshot.notifications)) {
          setUnreadNotificationsCount(
            snapshot.notifications.filter((n) => !n.isRead).length,
          );
        }
        setSyncVersion((v) => v + 1);
      },
      () => userRef.current?.id ?? null,
      (res) => {
        if (!res.storeUpdated && !res.currentUserUpdated && !res.notificationsChanged) {
          return;
        }
        void ensureDbReady()
          .then((db) => {
            if (res.storeUpdated) {
              setStore(getStoreProfile(db));
            }
            const uid = userRef.current?.id;
            if (res.currentUserUpdated && uid) {
              const row = db
                .select()
                .from(users)
                .where(eq(users.id, uid))
                .limit(1)
                .get();
              if (row) {
                commitUser((prev) =>
                  prev
                    ? {
                        ...prev,
                        username: row.username,
                        email: row.email,
                        firstname: row.firstname,
                        lastname: row.lastname,
                        phonenumber: row.phonenumber ?? undefined,
                        role: row.role,
                        lastLoginAt: row.lastLoginAt,
                        twoFactorEnabled: row.twoFactorEnabled === 1,
                        twoFactorMethod:
                          row.twoFactorMethod === "sms" ? "sms" : "email",
                      }
                    : prev,
                );
              }
            }
            if (res.notificationsChanged && uid) {
              setUnreadNotificationsCount(
                getLocalUnreadNotificationCount(db, uid),
              );
            }
          })
          .catch(() => {});
      },
    );
    syncEngineRef.current = engine;

    const unsubscribe = engine.subscribe((snap, event) => {
      setSyncStatus(snap.status);
      setPendingOutboxCount(snap.pendingOutboxCount);
      setConflictOutboxCount(snap.conflictOutboxCount);
      setLastSyncedAt(snap.lastSyncedAt);
      setSyncError(snap.lastError);
      if (event) {
        setSyncVersion((v) => v + 1);
      }
    });

    void engine.start();

    return () => {
      unsubscribe();
      engine.stop();
      if (syncEngineRef.current === engine) {
        syncEngineRef.current = null;
      }
    };
  }, [
    workspaceMode,
    token,
    user?.id,
    httpClient,
    commitUser,
  ]);

  const refreshPlatformServerUrl = useCallback(
    async (force = false): Promise<string> => {
      if (!force && refreshPromiseRef.current) {
        return refreshPromiseRef.current;
      }
      if (
        !force &&
        lastServerResolveAtRef.current > 0 &&
        Date.now() - lastServerResolveAtRef.current < 30_000
      ) {
        return serverUrlRef.current;
      }

      const promise = (async () => {
        setIsResolvingServerUrl(true);
        try {
          const bootstrapUrl = resolveApiBaseUrl();
          const current = isLegacyMetroUrl(serverUrlRef.current)
            ? ""
            : serverUrlRef.current;

          const candidates = Array.from(
            new Set(
              [bootstrapUrl, current].map((u) => u.trim().replace(/\/+$/, "")),
            ),
          );

          for (const candidate of candidates) {
            try {
              const cfg = await httpClient.getPlatformConfig(candidate);
              if (cfg?.ok) {
                const discovered =
                  typeof cfg.serverUrl === "string" && cfg.serverUrl.trim()
                    ? cfg.serverUrl.trim().replace(/\/+$/, "")
                    : candidate;

                let chosen = discovered;
                let configured = Boolean(cfg.configuredBySuperAdmin);

                if (discovered !== candidate) {
                  let discoveredReachable = false;
                  try {
                    const remoteCfg = await httpClient.getPlatformConfig(discovered);
                    discoveredReachable = Boolean(remoteCfg?.ok);
                  } catch {
                    discoveredReachable = false;
                  }

                  if (!discoveredReachable) {
                    console.warn(
                      `[AuthProvider] Configured server URL (${discovered}) failed verification; using reachable server (${candidate || "same-origin"}).`,
                    );
                    chosen = candidate;
                    configured = false;
                  }
                }

                commitServerUrl(chosen);
                setIsPlatformUrlConfigured(configured);
                if (chosen) {
                  await setStoredServerUrl(chosen);
                }
                lastServerResolveAtRef.current = Date.now();
                return chosen;
              }
            } catch {
              // Try next candidate
            }
          }

          return current || bootstrapUrl;
        } finally {
          setIsResolvingServerUrl(false);
          refreshPromiseRef.current = null;
        }
      })();

      refreshPromiseRef.current = promise;
      return promise;
    },
    [httpClient, commitServerUrl],
  );

  // Restore session & workspace mode on startup
  useEffect(() => {
    let active = true;
    const epochAtStart = authEpochRef.current;

    async function restoreSession() {
      try {
        const [storedToken, onboarded, storedMode, storedServer, storedTenant] =
          await Promise.all([
            getStoredAuthToken(),
            getHasCompletedOnboarding(),
            getStoredWorkspaceMode(),
            getStoredServerUrl(),
            getStoredTenantInfo(),
          ]);

        if (!active || authEpochRef.current !== epochAtStart) return;

        const cleanStoredServer =
          storedServer && !isLegacyMetroUrl(storedServer) ? storedServer : null;
        const resolvedServer = cleanStoredServer || resolveApiBaseUrl();
        commitServerUrl(resolvedServer);
        setWorkspaceMode(storedMode);
        setSyncStatus(storedMode === "synced" ? "connecting" : "local_only");
        setHasCompletedOnboardingState(onboarded);
        if (storedTenant) setTenant(storedTenant);

        // Automatically fetch the Super-Admin configured static server URL
        await refreshPlatformServerUrl().catch(() => resolvedServer);
        if (!active || authEpochRef.current !== epochAtStart) return;

        if (!storedToken) {
          return;
        }

        tokenRef.current = storedToken;
        const activeClient =
          storedMode === "synced" ? httpClient : sqliteClient;

        const session = await activeClient.getMe();
        if (!active || authEpochRef.current !== epochAtStart) return;

        commitToken(storedToken);
        commitUser(session.user);
        setStore(session.store);
        const resolvedTenant = extractTenant(session) ?? storedTenant;
        setTenant(resolvedTenant);
        if (resolvedTenant) {
          void setStoredTenantInfo(resolvedTenant);
        }

        if (!onboarded) {
          setHasCompletedOnboardingState(true);
          void setHasCompletedOnboarding(true);
        }

        const unread = await activeClient
          .getUnreadNotificationCount()
          .catch(() => 0);
        if (active && authEpochRef.current === epochAtStart) {
          setUnreadNotificationsCount(unread);
        }
      } catch {
        if (authEpochRef.current !== epochAtStart) return;
        tokenRef.current = null;
        await clearStoredAuthToken();
        if (active && authEpochRef.current === epochAtStart) {
          commitToken(null);
          commitUser(null);
          setStore(null);
          setUnreadNotificationsCount(0);
        }
      } finally {
        if (active) {
          setIsRestoring(false);
        }
      }
    }
    void restoreSession();
    return () => {
      active = false;
    };
  }, [
    httpClient,
    sqliteClient,
    refreshPlatformServerUrl,
    commitServerUrl,
    commitToken,
    commitUser,
  ]);

  const completeOnboarding = useCallback(async () => {
    setHasCompletedOnboardingState(true);
    await setHasCompletedOnboarding(true);
  }, []);

  const setWorkspaceModePreference = useCallback(
    async (mode: WorkspaceMode) => {
      setWorkspaceMode(mode);
      setSyncStatus(mode === "synced" ? "offline" : "local_only");
      await setStoredWorkspaceMode(mode);
      if (mode === "synced") {
        void refreshPlatformServerUrl();
      }
    },
    [refreshPlatformServerUrl],
  );

  const commitSyncedSession = useCallback(
    async (res: AuthLoginResponse, strategy: "merge" | "pull" = "pull") => {
      if (!res || typeof res.token !== "string" || !res.token.trim()) {
        throw new Error(
          "Web server returned an invalid session token. Please check the Super Admin server configuration.",
        );
      }
      authEpochRef.current += 1;
      const cleanToken = res.token.trim();
      const previousToken = tokenRef.current;
      const resolvedTenant = extractTenant(res);

      tokenRef.current = cleanToken;
      isBootstrappingRef.current = true;
      try {
        await setStoredSyncCursor(0);

        // Hydrate / merge local cache BEFORE activating synced SyncEngine in React state
        const tempEngine = new SyncEngine(httpClient, () => cleanToken);
        try {
          if (strategy === "merge") {
            await tempEngine.mergeLocalAndBootstrap();
          } else {
            await tempEngine.bootstrapAndHydrate();
          }
        } catch (hydrationErr) {
          if (!isSqliteFullError(hydrationErr)) {
            throw hydrationErr;
          }
          await resetDatabaseForCloudSync();
          await tempEngine.bootstrapAndHydrate();
        }

        await setStoredAuthToken(cleanToken);
        await setStoredWorkspaceMode("synced");
        await setStoredTenantInfo(resolvedTenant);
      } catch (err) {
        // Preserve previous in-memory token ref if pre-activation bootstrap fails
        if (tokenRef.current === cleanToken) {
          tokenRef.current = previousToken;
        }
        throw err;
      } finally {
        isBootstrappingRef.current = false;
      }

      const unread = await httpClient
        .getUnreadNotificationCount(cleanToken)
        .catch(() => 0);

      setTenant(resolvedTenant);
      setStore(res.store);
      setWorkspaceMode("synced");
      commitToken(cleanToken);
      commitUser(res.user);
      setUnreadNotificationsCount(unread);
      setSyncVersion((v) => v + 1);
    },
    [httpClient, commitToken, commitUser],
  );

  const signIn = useCallback(
    async (
      identifier: string,
      password: string,
      options?: { workspaceSlug?: string },
    ): Promise<AuthLoginResult> => {
      if (workspaceMode === "synced") {
        await refreshPlatformServerUrl().catch(() => {});
        const res = await httpClient.login({
          identifier,
          password,
          workspaceSlug: options?.workspaceSlug,
          deviceName: `Inventory Pro (${Platform.OS})`,
          deviceType: "mobile",
          operatingSystem: Platform.OS,
        });
        if ("twoFactorRequired" in res && res.twoFactorRequired) {
          return res;
        }
        await commitSyncedSession(res, "pull");
        return res;
      }

      authEpochRef.current += 1;
      const response = (await sqliteClient.login({
        identifier,
        password,
        deviceName: `Inventory Pro (${Platform.OS})`,
      })) as AuthLoginResponse;
      if (
        !response ||
        typeof response.token !== "string" ||
        !response.token.trim()
      ) {
        throw new Error("Local device login failed to issue a session token.");
      }
      await setStoredAuthToken(response.token);
      commitToken(response.token);
      commitUser(response.user);
      setStore(response.store);
      setTenant(null);
      setSyncStatus("local_only");
      const unread = await sqliteClient
        .getUnreadNotificationCount()
        .catch(() => 0);
      setUnreadNotificationsCount(unread);
      return response;
    },
    [
      workspaceMode,
      httpClient,
      sqliteClient,
      commitSyncedSession,
      refreshPlatformServerUrl,
      commitToken,
      commitUser,
    ],
  );

  const verifyTwoFactorSignIn = useCallback(
    async (challengeToken: string, code: string) => {
      const res = await httpClient.verifyTwoFactor({
        challengeToken,
        code,
        deviceName: `Inventory Pro (${Platform.OS})`,
        deviceType: "mobile",
        operatingSystem: Platform.OS,
      });
      await commitSyncedSession(res, "pull");
    },
    [httpClient, commitSyncedSession],
  );

  const resendTwoFactorCode = useCallback(
    (challengeToken: string) => httpClient.resendTwoFactor(challengeToken),
    [httpClient],
  );

  const authenticateCloudPreview = useCallback(
    async (payload: AuthLoginPayload) => {
      await refreshPlatformServerUrl().catch(() => {});
      return httpClient.login({
        ...payload,
        deviceName: `Inventory Pro (${Platform.OS})`,
        deviceType: "mobile",
        operatingSystem: Platform.OS,
      });
    },
    [httpClient, refreshPlatformServerUrl],
  );

  const verifyTwoFactorPreview = useCallback(
    (payload: { challengeToken: string; code: string }) =>
      httpClient.verifyTwoFactor({
        ...payload,
        deviceName: `Inventory Pro (${Platform.OS})`,
        deviceType: "mobile",
        operatingSystem: Platform.OS,
      }),
    [httpClient],
  );

  const finalizeCloudTransition = useCallback(
    async (authResponse: AuthLoginResponse, strategy: "merge" | "pull") => {
      await commitSyncedSession(authResponse, strategy);
    },
    [commitSyncedSession],
  );

  const switchBackToMobileOnly = useCallback(async () => {
    authEpochRef.current += 1;
    if (syncEngineRef.current) {
      await syncEngineRef.current.flushOutbox().catch(() => {});
      syncEngineRef.current.stop();
      syncEngineRef.current = null;
    }
    try {
      if (tokenRef.current) {
        const storedPush = await getStoredExpoPushToken();
        if (storedPush) {
          await httpClient.unregisterPushToken(storedPush).catch(() => {});
        }
        await httpClient.logout();
      }
    } catch {
      // ignore
    }
    await setStoredExpoPushToken(null);
    setExpoPushToken(null);
    setPushStatus("idle");
    setPushStatusMessage(null);
    await clearStoredAuthToken();
    await setStoredTenantInfo(null);
    await setStoredSyncCursor(0);
    await setStoredWorkspaceMode("mobile_only");
    setWorkspaceMode("mobile_only");
    commitToken(null);
    commitUser(null);
    setStore(null);
    setTenant(null);
    setSyncStatus("local_only");
    setPendingOutboxCount(0);
    setConflictOutboxCount(0);
    setUnreadNotificationsCount(0);
  }, [httpClient, commitToken, commitUser]);

  const triggerSyncNow = useCallback(async () => {
    if (syncEngineRef.current) {
      await syncEngineRef.current.catchUpNow();
      setSyncVersion((v) => v + 1);
    }
  }, []);

  const discardSyncConflicts = useCallback(async () => {
    if (syncEngineRef.current) {
      await syncEngineRef.current.discardConflicts();
      setSyncVersion((v) => v + 1);
    }
  }, []);

  const listSyncOutboxItems = useCallback(async (): Promise<
    SyncOutboxItem[]
  > => {
    if (syncEngineRef.current) {
      return syncEngineRef.current.listOutboxItems();
    }
    const db = await ensureDbReady();
    return listAllOutboxItems(db);
  }, []);

  const retrySyncOutboxItem = useCallback(async (id: string) => {
    if (syncEngineRef.current) {
      await syncEngineRef.current.retryOutboxItem(id);
      setSyncVersion((v) => v + 1);
    }
  }, []);

  const retryAllSyncConflicts = useCallback(async () => {
    if (syncEngineRef.current) {
      await syncEngineRef.current.retryAllConflicts();
      setSyncVersion((v) => v + 1);
    }
  }, []);

  const discardSyncOutboxItem = useCallback(
    async (id: string): Promise<{ refreshedFromCloud: boolean }> => {
      if (syncEngineRef.current) {
        const res = await syncEngineRef.current.discardOutboxItem(id);
        setSyncVersion((v) => v + 1);
        return res;
      }
      return { refreshedFromCloud: false };
    },
    [],
  );

  const signOut = useCallback(async () => {
    authEpochRef.current += 1;
    syncEngineRef.current?.stop();
    syncEngineRef.current = null;
    try {
      if (tokenRef.current) {
        if (workspaceMode === "synced") {
          const storedPush = await getStoredExpoPushToken();
          if (storedPush) {
            await httpClient.unregisterPushToken(storedPush).catch(() => {});
          }
        }
        await apiClient.logout();
      }
    } catch {
      // Ignore network errors during logout
    } finally {
      await setStoredExpoPushToken(null);
      setExpoPushToken(null);
      setPushStatus("idle");
      setPushStatusMessage(null);
      await clearStoredAuthToken();
      await setStoredTenantInfo(null);
      await setStoredSyncCursor(0);
      commitToken(null);
      commitUser(null);
      setStore(null);
      setTenant(null);
      setUnreadNotificationsCount(0);
      setSyncStatus(workspaceMode === "synced" ? "offline" : "local_only");
    }
  }, [apiClient, workspaceMode, commitToken, commitUser]);

  const refreshStoreSettings = useCallback(async (): Promise<StoreProfile> => {
    const latest = await apiClient.getStoreSettings();
    setStore(latest);
    return latest;
  }, [apiClient]);

  const updateStockThreshold = useCallback(
    async (threshold: number): Promise<StoreProfile> => {
      const updated = await apiClient.updateStockAlertThreshold(threshold);
      setStore(updated);
      return updated;
    },
    [apiClient],
  );

  const updateBusinessSettings = useCallback(
    async (input: UpdateBusinessSettingsInput): Promise<StoreProfile> => {
      const updated = await apiClient.updateBusinessSettings(input);
      setStore(updated);
      return updated;
    },
    [apiClient],
  );

  const updateNotificationSettings = useCallback(
    async (input: UpdateNotificationSettingsInput): Promise<StoreProfile> => {
      const updated = await apiClient.updateNotificationSettings(input);
      setStore(updated);
      return updated;
    },
    [apiClient],
  );

  const updateBusinessHours = useCallback(
    async (input: UpdateBusinessHoursInput): Promise<StoreProfile> => {
      const updated = await apiClient.updateBusinessHours(input);
      setStore(updated);
      return updated;
    },
    [apiClient],
  );

  const sendDailyReportNow = useCallback(
    async (dateStr?: string): Promise<SendDailyReportResult> => {
      return apiClient.sendDailyReportNow(dateStr);
    },
    [apiClient],
  );

  const updateMyProfile = useCallback(
    async (input: UpdateMyProfileInput): Promise<SessionUser> => {
      const updated = await apiClient.updateMyProfile(input);
      commitUser(updated);
      return updated;
    },
    [apiClient, commitUser],
  );

  const updateUserTwoFactor = useCallback(
    async (input: UpdateTwoFactorInput): Promise<StaffTwoFactorAccount> => {
      const updated = await apiClient.updateUserTwoFactor(input);
      if (updated.isCurrentUser || updated.id === userRef.current?.id) {
        commitUser((prev) =>
          prev
            ? {
                ...prev,
                twoFactorEnabled: updated.twoFactorEnabled,
                twoFactorMethod: updated.twoFactorMethod,
              }
            : prev,
        );
      }
      return updated;
    },
    [apiClient, commitUser],
  );

  const changePassword = useCallback(
    async (input: ChangePasswordInput): Promise<void> => {
      await apiClient.changeMyPassword(input);
      await refreshUnreadNotifications();
    },
    [apiClient, refreshUnreadNotifications],
  );

  const uploadProductImage = useCallback(
    async (
      localUri: string,
      opts?: { mimeType?: string; fileName?: string; webFile?: Blob },
    ): Promise<string> => {
      return httpClient.uploadProductImage(localUri, opts);
    },
    [httpClient],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      workspaceMode,
      serverUrl,
      isPlatformUrlConfigured,
      isResolvingServerUrl,
      refreshPlatformServerUrl,
      tenant,
      syncStatus,
      syncVersion,
      pendingOutboxCount,
      conflictOutboxCount,
      lastSyncedAt,
      syncError,
      user,
      store,
      token,
      isRestoring,
      isAuthenticated: Boolean(user && token),
      hasCompletedOnboarding,
      unreadNotificationsCount,
      refreshUnreadNotifications,
      pushStatus,
      expoPushToken,
      pushStatusMessage,
      registerDevicePushToken,
      unregisterDevicePushToken,
      completeOnboarding,
      apiClient,
      setWorkspaceModePreference,
      signIn,
      verifyTwoFactorSignIn,
      resendTwoFactorCode,
      authenticateCloudPreview,
      verifyTwoFactorPreview,
      finalizeCloudTransition,
      switchBackToMobileOnly,
      triggerSyncNow,
      discardSyncConflicts,
      listSyncOutboxItems,
      retrySyncOutboxItem,
      retryAllSyncConflicts,
      discardSyncOutboxItem,
      signOut,
      refreshStoreSettings,
      updateStockThreshold,
      updateBusinessSettings,
      updateNotificationSettings,
      updateBusinessHours,
      sendDailyReportNow,
      updateMyProfile,
      updateUserTwoFactor,
      changePassword,
      uploadProductImage,
    }),
    [
      workspaceMode,
      serverUrl,
      isPlatformUrlConfigured,
      isResolvingServerUrl,
      refreshPlatformServerUrl,
      tenant,
      syncStatus,
      syncVersion,
      pendingOutboxCount,
      conflictOutboxCount,
      lastSyncedAt,
      syncError,
      user,
      store,
      token,
      isRestoring,
      hasCompletedOnboarding,
      unreadNotificationsCount,
      refreshUnreadNotifications,
      pushStatus,
      expoPushToken,
      pushStatusMessage,
      registerDevicePushToken,
      unregisterDevicePushToken,
      completeOnboarding,
      apiClient,
      setWorkspaceModePreference,
      signIn,
      verifyTwoFactorSignIn,
      resendTwoFactorCode,
      authenticateCloudPreview,
      verifyTwoFactorPreview,
      finalizeCloudTransition,
      switchBackToMobileOnly,
      triggerSyncNow,
      discardSyncConflicts,
      listSyncOutboxItems,
      retrySyncOutboxItem,
      retryAllSyncConflicts,
      discardSyncOutboxItem,
      signOut,
      refreshStoreSettings,
      updateStockThreshold,
      updateBusinessSettings,
      updateNotificationSettings,
      updateBusinessHours,
      sendDailyReportNow,
      updateMyProfile,
      updateUserTwoFactor,
      changePassword,
      uploadProductImage,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
