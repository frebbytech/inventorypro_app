import React, { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  useFonts,
} from "@expo-google-fonts/figtree";
import { ApiProvider } from "@/api/ApiProvider";
import { AuthProvider, useAuth } from "@/api/AuthProvider";
import { LoadingState } from "@/components/LoadingState";
import { ToastProvider } from "@/components/ui";
import { ThemeProvider, useTheme } from "@/theme";
import {
  configureForegroundNotifications,
  resolveNotificationNavigationTarget,
} from "@/utils/pushNotifications";

configureForegroundNotifications();

SplashScreen.preventAutoHideAsync().catch(() => {});

function ThemedNavigator() {
  const { theme, mode } = useTheme();
  const { isAuthenticated, isRestoring, hasCompletedOnboarding } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated || !hasCompletedOnboarding || Platform.OS === "web") {
      return;
    }

    const handleResponse = (
      response: Notifications.NotificationResponse | null,
    ) => {
      if (!response) return;
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const target = resolveNotificationNavigationTarget(data);
      router.push(target as never);
    };

    void Notifications.getLastNotificationResponseAsync()
      .then((last) => handleResponse(last))
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      handleResponse(resp);
    });

    return () => {
      sub.remove();
    };
  }, [isAuthenticated, hasCompletedOnboarding, router]);

  if (isRestoring) {
    return <LoadingState message="Restoring POS session..." />;
  }

  return (
    <>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.headerBackground },
          headerTintColor: theme.colors.foreground,
          headerTitleStyle: {
            fontFamily: theme.fontFamilies.semibold,
            fontSize: 17,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Protected guard={!hasCompletedOnboarding} redirectTo="/sign-in">
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={hasCompletedOnboarding && !isAuthenticated}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={hasCompletedOnboarding && isAuthenticated}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="product/new"
            options={{
              title: "Add Products",
              headerBackTitle: "Inventory",
            }}
          />
          <Stack.Screen
            name="product/edit"
            options={{
              title: "Edit Product",
              headerBackTitle: "Product",
            }}
          />
          <Stack.Screen
            name="product/[id]"
            options={{
              title: "Product Details",
              headerBackTitle: "Back",
            }}
          />
          <Stack.Screen
            name="categories"
            options={{
              title: "Categories",
              headerBackTitle: "Back",
            }}
          />
          <Stack.Screen
            name="restocks"
            options={{
              title: "Restock History",
              headerBackTitle: "Back",
            }}
          />
          <Stack.Screen
            name="sales/new"
            options={{
              title: "New Sale",
              headerBackTitle: "Back",
            }}
          />
          <Stack.Screen
            name="sales/summary"
            options={{
              title: "Sales Report",
              headerBackTitle: "Sales",
            }}
          />
          <Stack.Screen
            name="sales/[id]"
            options={{
              title: "Receipt Details",
              headerBackTitle: "Sales",
            }}
          />
          <Stack.Screen
            name="customers"
            options={{
              title: "Customers",
              headerBackTitle: "Account",
            }}
          />
          <Stack.Screen
            name="customer/[id]"
            options={{
              title: "Customer Profile",
              headerBackTitle: "Customers",
            }}
          />
          <Stack.Screen
            name="suppliers"
            options={{
              title: "Suppliers",
              headerBackTitle: "Account",
            }}
          />
          <Stack.Screen
            name="supplier/[id]"
            options={{
              title: "Supplier Profile",
              headerBackTitle: "Suppliers",
            }}
          />
          <Stack.Screen
            name="employees"
            options={{
              title: "Team & Cashiers",
              headerBackTitle: "Account",
            }}
          />
          <Stack.Screen
            name="employee/[id]"
            options={{
              title: "Staff Performance",
              headerBackTitle: "Team",
            }}
          />
          <Stack.Screen
            name="reports"
            options={{
              title: "Daily Reports",
              headerBackTitle: "Account",
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              title: "Settings",
              headerBackTitle: "Account",
            }}
          />
          <Stack.Screen
            name="audit-logs"
            options={{
              title: "Audit Logs",
              headerBackTitle: "Account",
            }}
          />
          <Stack.Screen
            name="notifications"
            options={{
              title: "Notifications",
              headerBackTitle: "Back",
            }}
          />
          <Stack.Screen
            name="messages"
            options={{
              title: "Messages & Broadcasts",
              headerBackTitle: "Account",
            }}
          />
          <Stack.Screen
            name="security"
            options={{
              title: "Security & 2FA",
              headerBackTitle: "Account",
            }}
          />
          <Stack.Screen
            name="sync-queue"
            options={{
              title: "Sync Queue & Conflicts",
              headerBackTitle: "Back",
            }}
          />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <ApiProvider>
              <ThemedNavigator />
            </ApiProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
