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
import { HttpApiClient } from "./httpAdapter";
import {
  ExpoSqliteDrizzleClient,
  type AuthenticatedApiClient,
} from "./sqliteAdapter";
import {
  clearStoredAuthToken,
  getHasCompletedOnboarding,
  getStoredAuthToken,
  setHasCompletedOnboarding,
  setStoredAuthToken,
} from "./tokenStorage";
import type {
  SessionUser,
  StoreProfile,
  UpdateBusinessSettingsInput,
} from "@/types/domain";

interface AuthContextValue {
  user: SessionUser | null;
  store: StoreProfile | null;
  token: string | null;
  isRestoring: boolean;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  completeOnboarding: () => Promise<void>;
  apiClient: AuthenticatedApiClient;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateStockThreshold: (threshold: number) => Promise<StoreProfile>;
  updateBusinessSettings: (input: UpdateBusinessSettingsInput) => Promise<StoreProfile>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboardingState] =
    useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;

  const handleUnauthorized = useCallback(() => {
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    void clearStoredAuthToken();
  }, []);

  const apiClient = useMemo<AuthenticatedApiClient>(() => {
    const remoteBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
    if (remoteBaseUrl) {
      return new HttpApiClient({
        baseUrl: remoteBaseUrl,
        getAccessToken: () => tokenRef.current,
        onUnauthorized: handleUnauthorized,
      });
    }

    return new ExpoSqliteDrizzleClient({
      getAccessToken: () => tokenRef.current,
      onUnauthorized: handleUnauthorized,
    });
  }, [handleUnauthorized]);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const [stored, onboarded] = await Promise.all([
          getStoredAuthToken(),
          getHasCompletedOnboarding(),
        ]);
        if (active) {
          setHasCompletedOnboardingState(onboarded);
        }
        if (!stored) {
          return;
        }
        tokenRef.current = stored;
        const session = await apiClient.getMe();
        if (active) {
          setToken(stored);
          setUser(session.user);
          setStore(session.store);
          if (!onboarded) {
            setHasCompletedOnboardingState(true);
            void setHasCompletedOnboarding(true);
          }
        }
      } catch {
        tokenRef.current = null;
        await clearStoredAuthToken();
        if (active) {
          setToken(null);
          setUser(null);
          setStore(null);
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
  }, [apiClient]);

  const completeOnboarding = useCallback(async () => {
    setHasCompletedOnboardingState(true);
    await setHasCompletedOnboarding(true);
  }, []);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      const response = await apiClient.login({
        identifier,
        password,
        deviceName: `Inventory Pro (${Platform.OS})`,
      });
      tokenRef.current = response.token;
      await setStoredAuthToken(response.token);
      setToken(response.token);
      setUser(response.user);
      setStore(response.store);
    },
    [apiClient],
  );

  const signOut = useCallback(async () => {
    try {
      if (tokenRef.current) {
        await apiClient.logout();
      }
    } catch {
      // Ignore network errors during logout
    } finally {
      tokenRef.current = null;
      await clearStoredAuthToken();
      setToken(null);
      setUser(null);
      setStore(null);
    }
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

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      store,
      token,
      isRestoring,
      isAuthenticated: Boolean(user && token),
      hasCompletedOnboarding,
      completeOnboarding,
      apiClient,
      signIn,
      signOut,
      updateStockThreshold,
      updateBusinessSettings,
    }),
    [
      user,
      store,
      token,
      isRestoring,
      hasCompletedOnboarding,
      completeOnboarding,
      apiClient,
      signIn,
      signOut,
      updateStockThreshold,
      updateBusinessSettings,
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
