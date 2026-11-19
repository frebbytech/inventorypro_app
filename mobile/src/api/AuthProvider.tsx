import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
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
  getStoredServerUrl,
  getStoredTenantInfo,
  getStoredWorkspaceMode,
  setHasCompletedOnboarding,
  setStoredAuthToken,
  setStoredServerUrl,
  setStoredSyncCursor,
  setStoredTenantInfo,
  setStoredWorkspaceMode,
} from "./tokenStorage";
import type {
  AuthLoginPayload,
  AuthLoginResponse,
  AuthLoginResult,
  ChangePasswordInput,
  SessionUser,
  StoreProfile,
  SyncStatus,
  TenantInfo,
  UpdateBusinessSettingsInput,
  UpdateMyProfileInput,
  WorkspaceMode,
} from "@/types/domain";

interface AuthContextValue {
  workspaceMode: WorkspaceMode;
  serverUrl: string;
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
  completeOnboarding: () => Promise<void>;
  apiClient: AuthenticatedApiClient;
  setWorkspaceModePreference: (mode: WorkspaceMode) => Promise<void>;
  setServerUrl: (url: string) => Promise<void>;
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
  signOut: () => Promise<void>;
  updateStockThreshold: (threshold: number) => Promise<StoreProfile>;
  updateBusinessSettings: (
    input: UpdateBusinessSettingsInput,
  ) => Promise<StoreProfile>;
  updateMyProfile: (input: UpdateMyProfileInput) => Promise<SessionUser>;
  changePassword: (input: ChangePasswordInput) => Promise<void>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("mobile_only");
  const [serverUrl, setServerUrlState] = useState<string>(resolveApiBaseUrl());
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboardingState] =
    useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [isRestoring, setIsRestoring] = useState(true);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local_only");
  const [syncVersion, setSyncVersion] = useState(0);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [conflictOutboxCount, setConflictOutboxCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;
  const userRef = useRef<SessionUser | null>(null);
  userRef.current = user;
  const serverUrlRef = useRef<string>(serverUrl);
  serverUrlRef.current = serverUrl;
  const syncEngineRef = useRef<SyncEngine | null>(null);

  const handleUnauthorized = useCallback(() => {
    syncEngineRef.current?.stop();
    syncEngineRef.current = null;
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    setTenant(null);
    setUnreadNotificationsCount(0);
    setSyncStatus("local_only");
    void clearStoredAuthToken();
    void setStoredTenantInfo(null);
  }, []);

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
        setUser(snapshot.user);
        setTenant(snapshot.tenant);
        setSyncVersion((v) => v + 1);
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
        void refreshUnreadNotifications();
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
  }, [workspaceMode, token, user?.id, httpClient, refreshUnreadNotifications]);

  // Restore session & workspace mode on startup
  useEffect(() => {
    let active = true;
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

        if (!active) return;

        const resolvedServer = storedServer || resolveApiBaseUrl();
        serverUrlRef.current = resolvedServer;
        setServerUrlState(resolvedServer);
        setWorkspaceMode(storedMode);
        setSyncStatus(storedMode === "synced" ? "connecting" : "local_only");
        setHasCompletedOnboardingState(onboarded);
        if (storedTenant) setTenant(storedTenant);

        if (!storedToken) {
          return;
        }

        tokenRef.current = storedToken;
        const activeClient =
          storedMode === "synced" ? httpClient : sqliteClient;

        const session = await activeClient.getMe();
        if (!active) return;

        setToken(storedToken);
        setUser(session.user);
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
        if (active) {
          setUnreadNotificationsCount(unread);
        }
      } catch {
        tokenRef.current = null;
        await clearStoredAuthToken();
        if (active) {
          setToken(null);
          setUser(null);
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
  }, [httpClient, sqliteClient]);

  const completeOnboarding = useCallback(async () => {
    setHasCompletedOnboardingState(true);
    await setHasCompletedOnboarding(true);
  }, []);

  const setServerUrl = useCallback(async (url: string) => {
    const clean = url.trim().replace(/\/+$/, "");
    serverUrlRef.current = clean;
    setServerUrlState(clean);
    await setStoredServerUrl(clean || null);
  }, []);

  const setWorkspaceModePreference = useCallback(
    async (mode: WorkspaceMode) => {
      setWorkspaceMode(mode);
      setSyncStatus(mode === "synced" ? "offline" : "local_only");
      await setStoredWorkspaceMode(mode);
    },
    [],
  );

  const commitSyncedSession = useCallback(
    async (res: AuthLoginResponse, strategy: "merge" | "pull" = "pull") => {
      tokenRef.current = res.token;
      await setStoredAuthToken(res.token);
      await setStoredWorkspaceMode("synced");
      const resolvedTenant = extractTenant(res);
      setTenant(resolvedTenant);
      await setStoredTenantInfo(resolvedTenant);
      await setStoredSyncCursor(0);

      // Run migration or initial bootstrap BEFORE flipping user+token+mode into SyncEngine
      const tempEngine = new SyncEngine(httpClient, () => res.token);
      if (strategy === "merge") {
        await tempEngine.mergeLocalAndBootstrap();
      } else {
        await tempEngine.bootstrapAndHydrate();
      }

      setWorkspaceMode("synced");
      setToken(res.token);
      setUser(res.user);
      setStore(res.store);
      setSyncVersion((v) => v + 1);
      const unread = await httpClient
        .getUnreadNotificationCount()
        .catch(() => 0);
      setUnreadNotificationsCount(unread);
    },
    [httpClient],
  );

  const signIn = useCallback(
    async (
      identifier: string,
      password: string,
      options?: { workspaceSlug?: string },
    ): Promise<AuthLoginResult> => {
      if (workspaceMode === "synced") {
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

      const response = (await sqliteClient.login({
        identifier,
        password,
        deviceName: `Inventory Pro (${Platform.OS})`,
      })) as AuthLoginResponse;
      tokenRef.current = response.token;
      await setStoredAuthToken(response.token);
      setToken(response.token);
      setUser(response.user);
      setStore(response.store);
      setTenant(null);
      setSyncStatus("local_only");
      const unread = await sqliteClient
        .getUnreadNotificationCount()
        .catch(() => 0);
      setUnreadNotificationsCount(unread);
      return response;
    },
    [workspaceMode, httpClient, sqliteClient, commitSyncedSession],
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
    (payload: AuthLoginPayload) =>
      httpClient.login({
        ...payload,
        deviceName: `Inventory Pro (${Platform.OS})`,
        deviceType: "mobile",
        operatingSystem: Platform.OS,
      }),
    [httpClient],
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
    if (syncEngineRef.current) {
      await syncEngineRef.current.flushOutbox().catch(() => {});
      syncEngineRef.current.stop();
      syncEngineRef.current = null;
    }
    try {
      if (tokenRef.current) {
        await httpClient.logout();
      }
    } catch {
      // ignore
    }
    tokenRef.current = null;
    await clearStoredAuthToken();
    await setStoredTenantInfo(null);
    await setStoredSyncCursor(0);
    await setStoredWorkspaceMode("mobile_only");
    setWorkspaceMode("mobile_only");
    setToken(null);
    setUser(null);
    setStore(null);
    setTenant(null);
    setSyncStatus("local_only");
    setPendingOutboxCount(0);
    setConflictOutboxCount(0);
    setUnreadNotificationsCount(0);
  }, [httpClient]);

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

  const signOut = useCallback(async () => {
    syncEngineRef.current?.stop();
    syncEngineRef.current = null;
    try {
      if (tokenRef.current) {
        await apiClient.logout();
      }
    } catch {
      // Ignore network errors during logout
    } finally {
      tokenRef.current = null;
      await clearStoredAuthToken();
      await setStoredTenantInfo(null);
      await setStoredSyncCursor(0);
      setToken(null);
      setUser(null);
      setStore(null);
      setTenant(null);
      setUnreadNotificationsCount(0);
      setSyncStatus(workspaceMode === "synced" ? "offline" : "local_only");
    }
  }, [apiClient, workspaceMode]);

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

  const updateMyProfile = useCallback(
    async (input: UpdateMyProfileInput): Promise<SessionUser> => {
      const updated = await apiClient.updateMyProfile(input);
      setUser(updated);
      return updated;
    },
    [apiClient],
  );

  const changePassword = useCallback(
    async (input: ChangePasswordInput): Promise<void> => {
      await apiClient.changeMyPassword(input);
      await refreshUnreadNotifications();
    },
    [apiClient, refreshUnreadNotifications],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      workspaceMode,
      serverUrl,
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
      completeOnboarding,
      apiClient,
      setWorkspaceModePreference,
      setServerUrl,
      signIn,
      verifyTwoFactorSignIn,
      resendTwoFactorCode,
      authenticateCloudPreview,
      verifyTwoFactorPreview,
      finalizeCloudTransition,
      switchBackToMobileOnly,
      triggerSyncNow,
      discardSyncConflicts,
      signOut,
      updateStockThreshold,
      updateBusinessSettings,
      updateMyProfile,
      changePassword,
    }),
    [
      workspaceMode,
      serverUrl,
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
      completeOnboarding,
      apiClient,
      setWorkspaceModePreference,
      setServerUrl,
      signIn,
      verifyTwoFactorSignIn,
      resendTwoFactorCode,
      authenticateCloudPreview,
      verifyTwoFactorPreview,
      finalizeCloudTransition,
      switchBackToMobileOnly,
      triggerSyncNow,
      discardSyncConflicts,
      signOut,
      updateStockThreshold,
      updateBusinessSettings,
      updateMyProfile,
      changePassword,
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
