"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Moon,
  Shield,
  Sun,
  User,
} from "lucide-react";
import { loginSuperAdmin } from "@/actions/super-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SuperAdminLoginForm() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!identifier.trim() || !password) {
      setError("Enter both your Super Admin username or email and password.");
      return;
    }

    setLoading(true);
    try {
      const res = await loginSuperAdmin({
        identifier: identifier.trim(),
        password,
      });

      if (!res.success) {
        setError(res.message || "Invalid Super Admin credentials.");
        return;
      }

      router.replace("/super-admin");
      router.refresh();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to sign in right now.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-svh w-full bg-background text-foreground flex flex-col justify-between px-4 py-6 sm:px-8">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <Link
          href="/auth/sign-in"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Store Sign In</span>
        </Link>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="h-8 gap-1.5 px-2.5 text-xs"
          aria-label="Toggle color theme"
        >
          {isDark ? (
            <>
              <Sun className="h-3.5 w-3.5" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className="h-3.5 w-3.5" />
              <span>Dark</span>
            </>
          )}
        </Button>
      </header>

      <main className="mx-auto my-auto w-full max-w-[420px] py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl border border-border bg-card p-6 sm:p-8"
        >
          <div className="mb-6 space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
              <Shield className="h-4 w-4" />
              <span>Platform Control</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Super Admin Sign In
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage business tenants, workspace status, and staff access across
              InventoryPro.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="super-admin-id">Username or Email</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="super-admin-id"
                  type="text"
                  autoComplete="username"
                  placeholder="superadmin or superadmin@inventorypro.app"
                  className="pl-9"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="super-admin-password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="super-admin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-9 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="mt-2 w-full gap-2"
              disabled={loading}
            >
              <span>{loading ? "Signing in..." : "Enter Super Admin Console"}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </motion.div>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl items-center justify-between text-xs text-muted-foreground">
        <span>InventoryPro Platform Administration</span>
        <span>Isolated Operator Session</span>
      </footer>
    </div>
  );
}
