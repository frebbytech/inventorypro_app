import React, { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
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
import { ThemeProvider, useTheme } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

function ThemedNavigator() {
  const { theme, mode } = useTheme();
  const { isAuthenticated, isRestoring } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isRestoring) return;
    const onSignInRoute = segments[0] === "sign-in";
    if (!isAuthenticated && !onSignInRoute) {
      router.replace("/sign-in");
    } else if (isAuthenticated && onSignInRoute) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isRestoring, segments, router]);

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
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="product/[id]"
          options={{
            title: "Product Details",
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
          name="sales/[id]"
          options={{
            title: "Receipt Details",
            headerBackTitle: "Sales",
          }}
        />
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
        <AuthProvider>
          <ApiProvider>
            <ThemedNavigator />
          </ApiProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
