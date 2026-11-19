"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Eye,
  EyeOff,
  Lock,
  User,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Package,
  BarChart3,
  ShieldCheck,
  KeyRound,
  RefreshCw,
  Building2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import LoadingSpinner from "@/components/custom/spinner/LoadingSpinner";
import { loginUser } from "@/actions/_actions";
import {
  resendTwoFactorCode,
  verifyTwoFactorLogin,
} from "@/actions/security";
import type { TwoFactorMethod } from "@/types/globals";
import Logo from "../custom/Logo";
import { useSettings } from "@/providers/SettingsProvider";
import { useRouter } from "next/navigation";
import Link from "next/link";

const signInSchema = z.object({
  usernameOrEmail: z.string().min(1, "Username or Email is required"),
  password: z.string().min(1, "Password is required"),
  workspaceSlug: z.string().optional(),
});

type SignInValues = z.infer<typeof signInSchema>;

// Carousel content for the right-hand promo panel. Swap copy/icons freely —
// structure supports any number of slides.
const SLIDES = [
  {
    icon: Package,
    title: "Never lose track of stock",
    body: "Real-time counts, low-stock alerts, and a single source of truth for every item you sell.",
  },
  {
    icon: BarChart3,
    title: "See your business clearly",
    body: "Sales, trends, and reports laid out at a glance so you always know where you stand.",
  },
  {
    icon: ShieldCheck,
    title: "Built for reliability",
    body: "Your data stays synced and secure, whether you're on the shop floor or on the road.",
  },
];

const AUTOPLAY_MS = 4500;

export default function SignInForm() {
  const { settings, refetchSettings } = useSettings();
  const router = useRouter();
  const [showWorkspaceField, setShowWorkspaceField] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [slide, setSlide] = useState(0);
  const [twoFactorStep, setTwoFactorStep] = useState<{
    challengeToken: string;
    method: TwoFactorMethod;
    maskedTarget: string;
    username: string;
  } | null>(null);
  const [otpCode, setOtpCode] = useState("");

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      usernameOrEmail: "",
      password: "",
      workspaceSlug: "",
    },
  });

  // Autoplay the promo carousel.
  useEffect(() => {
    const id = setInterval(() => {
      setSlide((s) => (s + 1) % SLIDES.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, []);

  async function onSubmit(data: SignInValues) {
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      const res = await loginUser({
        usernameOrEmail: data.usernameOrEmail,
        password: data.password,
        workspaceSlug: data.workspaceSlug?.trim() || undefined,
      });

      if (!res.success) {
        const msg = res.message || "Invalid username or password";
        if (msg.toLowerCase().includes("workspace code")) {
          setShowWorkspaceField(true);
        }
        setError(msg);
        setLoading(false);
        return;
      }

      if (res.data?.requiresTwoFactor && res.data.challengeToken) {
        setTwoFactorStep({
          challengeToken: res.data.challengeToken,
          method: res.data.method || "email",
          maskedTarget: res.data.maskedTarget || "",
          username: res.data.username,
        });
        setOtpCode("");
        setLoading(false);
        return;
      }

      await refetchSettings().catch(() => {});
      router.replace(res.data?.role === "admin" ? "/admin" : "/");
    } catch (err: any) {
      setError(
        err?.message || "An unexpected error occurred. Please try again.",
      );
      setLoading(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!twoFactorStep) return;

    setError(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      const res = await verifyTwoFactorLogin({
        challengeToken: twoFactorStep.challengeToken,
        code: otpCode,
      });

      if (!res.success) {
        setError(res.message || "Invalid verification code");
        setLoading(false);
        return;
      }

      await refetchSettings().catch(() => {});
      router.replace(res.data?.role === "admin" ? "/admin" : "/");
    } catch (err: any) {
      setError(
        err?.message || "An unexpected error occurred. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (!twoFactorStep || resending) return;

    setError(null);
    setInfoMessage(null);
    setResending(true);

    try {
      const res = await resendTwoFactorCode({
        challengeToken: twoFactorStep.challengeToken,
      });
      if (!res.success || !res.data) {
        setError(res.message || "Could not resend verification code");
      } else {
        setTwoFactorStep({
          ...twoFactorStep,
          challengeToken: res.data.challengeToken,
          method: res.data.method,
          maskedTarget: res.data.maskedTarget,
        });
        setInfoMessage(
          `A new verification code has been sent via ${res.data.method === "sms" ? "SMS" : "email"}.`,
        );
      }
    } catch (err: any) {
      setError(err?.message || "Could not resend verification code");
    } finally {
      setResending(false);
    }
  }

  const ActiveIcon = SLIDES[slide].icon;

  return (
    <div className="flex h-svh w-full items-center justify-center ">
      <div className="grid w-full h-full overflow-hidden  bg-white shadow-xl dark:bg-zinc-900 dark:shadow-black/40 dark:ring-1 dark:ring-white/10 md:grid-cols-2">
        {/* ---------------------------------------------------------------- */}
        {/* Left: promo panel with carousel                                  */}
        {/* ---------------------------------------------------------------- */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-primary/90 dark:bg-gradient-to-br from-primary/30 via-primary/50 to-primary/90 p-10 text-white md:flex">
          {/* ambient glow */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl dark:bg-white/5" />
          <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-black/10 blur-3xl dark:bg-black/30" />

          <div className="relative z-10 text-center">
            <h2 className="text-4xl font-bold leading-tight">
              {settings?.business_name || "Inventory Pro"}
            </h2>
            <p className="mx-auto mt-4 max-w-xs text-sm text-white/80">
              Track stock, manage sales, and keep your business running — all
              from one dashboard.
            </p>
          </div>

          {/* floating icon */}
          <div className="relative z-10 flex flex-1 items-center justify-center py-8">
            <div className="relative flex h-40 w-40 items-center justify-center">
              <div className="absolute inset-0 animate-pulse rounded-full bg-white/15 blur-2xl dark:bg-white/10" />
              <div className="relative flex h-32 w-32 -translate-y-2 animate-[float_3s_ease-in-out_infinite] items-center justify-center rounded-full bg-white/10 shadow-2xl ring-1 ring-white/30 backdrop-blur-sm dark:bg-white/5 dark:ring-white/20">
                <ActiveIcon
                  className="h-14 w-14 text-white"
                  strokeWidth={1.5}
                />
              </div>
            </div>
          </div>

          <div className="relative z-10 space-y-4 text-center">
            <h3 className="text-xl font-semibold">{SLIDES[slide].title}</h3>
            <p className="mx-auto max-w-xs text-sm text-white/80">
              {SLIDES[slide].body}
            </p>

            <div className="flex items-center justify-center gap-2 pt-2">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  onClick={() => setSlide(i)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i === slide ? "w-6 bg-white" : "w-2 bg-white/40"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Left: form panel                                                  */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-col justify-between p-8 sm:p-10">
          {/* <div> */}
          <div className="mb-10 flex items-center gap-2">
            <span className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full">
              {/* <span className="absolute left-0 top-0 h-full w-1/2 bg-white dark:bg-zinc-900" /> */}
              <Logo />
            </span>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              {settings?.business_name || "Inventory Pro"}
            </span>
          </div>

          <div className="mx-auto w-full max-w-sm space-y-6">
            {twoFactorStep ? (
              <>
                <div className="space-y-2">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Two-Factor Verification
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Enter the 6-digit code sent via{" "}
                    {twoFactorStep.method === "sms" ? "SMS" : "email"} to{" "}
                    <span className="font-medium text-foreground">
                      {twoFactorStep.maskedTarget || twoFactorStep.username}
                    </span>
                    .
                  </p>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive dark:border-destructive/40 dark:bg-destructive/15">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {infoMessage && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                    {infoMessage}
                  </div>
                )}

                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="two-factor-code"
                      className="text-sm font-medium leading-none"
                    >
                      Verification Code
                    </label>
                    <Input
                      id="two-factor-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="000000"
                      value={otpCode}
                      onChange={(e) =>
                        setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      className="text-center font-mono text-lg tracking-[0.4em]"
                      disabled={loading}
                      autoFocus
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={loading || otpCode.length !== 6}
                  >
                    {loading ? (
                      <LoadingSpinner loadingText="Verifying..." />
                    ) : (
                      <>
                        <span>Verify & Sign In</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <div className="flex items-center justify-between pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={loading}
                      onClick={() => {
                        setTwoFactorStep(null);
                        setOtpCode("");
                        setError(null);
                        setInfoMessage(null);
                      }}
                      className="gap-1.5 px-2 text-muted-foreground"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Back to sign in
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={loading || resending}
                      onClick={handleResendOtp}
                      className="gap-1.5 px-2 text-primary"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`}
                      />
                      {resending ? "Sending..." : "Resend code"}
                    </Button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Sign in to {settings?.business_name || "Inventory Pro"}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Enter your credentials to access your store workspace
                  </p>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive dark:border-destructive/40 dark:bg-destructive/15">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-4"
                  >
                      <FormField
                        control={form.control}
                        name="usernameOrEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username or Email Address</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...field}
                                  placeholder="admin or user@example.com"
                                  className="pl-9"
                                  disabled={loading}
                                  autoComplete="username"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...field}
                                  type={showPassword ? "text" : "password"}
                                  placeholder="••••••••"
                                  className="pl-9 pr-10"
                                  disabled={loading}
                                  autoComplete="current-password"
                                />
                                <button
                                  type="button"
                                  disabled={loading}
                                  onClick={() => setShowPassword(!showPassword)}
                                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                                  tabIndex={-1}
                                >
                                  {showPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {showWorkspaceField ? (
                        <FormField
                          control={form.control}
                          name="workspaceSlug"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Workspace Code (optional)</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                  <Input
                                    {...field}
                                    placeholder="e.g. my-store-slug"
                                    className="pl-9 font-mono text-sm"
                                    disabled={loading}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setShowWorkspaceField(true)}
                            className="text-xs font-medium text-muted-foreground hover:text-primary"
                          >
                            Have a Workspace Code?
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input accent-primary dark:accent-p"
                          />
                          Remember me
                        </label>
                        <a
                          href="/forgot-password"
                          className="text-sm font-medium text-primary hover:underline dark:text-primary/80"
                        >
                          Forgot password?
                        </a>
                      </div>

                      <Button
                        type="submit"
                        className="mt-2 w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-p dark:text-zinc-950 dark:hover:bg-primary/80"
                        disabled={loading}
                      >
                        {loading ? (
                          <LoadingSpinner loadingText="Signing in..." />
                        ) : (
                          <>
                            <span>Sign In</span>
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </form>
                  </Form>
              </>
            )}
          </div>
          {/* </div> */}

          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between sm:items-center mt-10 text-sm text-muted-foreground">
            {/* Copyright with linked company name */}
            <p className="text-center sm:text-left">
              © {new Date().getFullYear()}{" "}
              <a
                href="https://nanaakwasi.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline text-primary/90"
              >
                Frebbytech Solutions
              </a>
              .{" "}
              <Link
                href="/super-admin/login"
                className="ml-1 text-xs text-muted-foreground/80 underline-offset-4 hover:text-primary hover:underline"
              >
                Super Admin
              </Link>
            </p>
            {/* Contact on the right */}
            <span className="">
              Contact:{" "}
              <a
                href="mailto:frebbytech@gmail.com"
                className="hover:underline hover:text-primary"
              >
                frebbytech@gmail.com
              </a>
              <br />
              {/* <span className="hidden sm:inline">or</span>{" "} */}
              <a
                href="tel:+233543772591"
                className="hover:underline hover:text-primary block text-center md:text-right"
              >
                +233 543 772 591
              </a>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
