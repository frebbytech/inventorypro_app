"use client";
import React from "react";
import ThemeProvider from "./ThemeToggle/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsProvider } from "@/providers/SettingsProvider";
import { TooltipProvider } from "../ui/tooltip";

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <QueryClientProvider client={queryClient}>
          <SettingsProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </SettingsProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </>
  );
}
