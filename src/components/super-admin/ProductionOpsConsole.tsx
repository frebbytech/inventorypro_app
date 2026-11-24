"use client";

import React, { useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Cloud,
  Copy,
  Check,
  Database,
  HardDrive,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Terminal,
  Trash2,
} from "lucide-react";
import {
  getProductionOpsOverview,
  revokeMobilePushDeviceBySuperAdmin,
  verifyCloudEndpointReachability,
} from "@/actions/super-admin";
import type { ProductionOpsSnapshot } from "@/lib/ops";
import PlatformServerUrlCard from "@/components/super-admin/PlatformServerUrlCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ProductionOpsConsoleProps {
  initialSnapshot: ProductionOpsSnapshot;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function driverLabel(driver: ProductionOpsSnapshot["database"]["driver"]): string {
  if (driver === "turso_remote") return "Turso / libSQL Cloud";
  if (driver === "libsql_local") return "Local libSQL File";
  return "Local SQLite File";
}

export default function ProductionOpsConsole({
  initialSnapshot,
}: ProductionOpsConsoleProps) {
  const [snapshot, setSnapshot] =
    useState<ProductionOpsSnapshot>(initialSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [probeUrl, setProbeUrl] = useState(
    initialSnapshot.mobileCloud.platformConfig.serverUrl || "",
  );
  const [probing, setProbing] = useState(false);
  const [probeFeedback, setProbeFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  async function refreshSnapshot() {
    setRefreshing(true);
    setBannerError(null);
    try {
      const res = await getProductionOpsOverview();
      if (!res.success || !res.data) {
        setBannerError(res.message || "Failed to refresh production ops.");
        return;
      }
      setSnapshot(res.data);
      if (res.data.mobileCloud.platformConfig.serverUrl && !probeUrl) {
        setProbeUrl(res.data.mobileCloud.platformConfig.serverUrl);
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function handleProbeEndpoint(e: React.FormEvent) {
    e.preventDefault();
    setProbeFeedback(null);
    setProbing(true);
    try {
      const res = await verifyCloudEndpointReachability(probeUrl);
      if (!res.success || !res.data) {
        setProbeFeedback({
          ok: false,
          message: res.message || "Endpoint verification failed.",
        });
        return;
      }
      setProbeFeedback({
        ok: true,
        message: `Reachable (${res.data.statusCode}) in ${res.data.latencyMs}ms · DB ${res.data.dbOk ? "connected" : "unknown"}`,
      });
    } finally {
      setProbing(false);
    }
  }

  async function handleRevokeDevice(deviceId: string) {
    setRevokingId(deviceId);
    setBannerError(null);
    try {
      const res = await revokeMobilePushDeviceBySuperAdmin(deviceId);
      if (!res.success) {
        setBannerError(res.message || "Failed to revoke mobile device.");
        return;
      }
      await refreshSnapshot();
    } finally {
      setRevokingId(null);
    }
  }

  async function handleCopyCommand(id: string, command: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCmd(id);
      setTimeout(() => setCopiedCmd(null), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  }

  const criticalConfiguredCount = snapshot.envAudit.filter(
    (item) => item.severity === "critical" && item.configured,
  ).length;
  const criticalTotalCount = snapshot.envAudit.filter(
    (item) => item.severity === "critical",
  ).length;

  const cliSteps = [
    {
      id: "eas-bind",
      label: "Bind Expo EAS Cloud Project",
      command: "cd mobile && npx eas login && npm run eas:init",
    },
    {
      id: "ops-preflight",
      label: "Verify Production Ops & Secrets",
      command: "npm run ops:check",
    },
    {
      id: "eas-build",
      label: "Build Production Binary via EAS",
      command: "npm --prefix mobile run eas:build:prod",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Production Ops & Cloud Binding
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor database connectivity, environment guardrails, Expo EAS
            cloud project binding, bound POS devices, and automated EOD jobs.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={refreshSnapshot}
          disabled={refreshing}
          className="gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          <span>Refresh Diagnostics</span>
        </Button>
      </div>

      {bannerError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{bannerError}</span>
        </div>
      )}

      {/* Top Infrastructure Summary Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Database Probe</span>
            <Database className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 font-mono text-xl font-semibold text-foreground">
            {snapshot.database.connected
              ? `Healthy · ${snapshot.database.latencyMs}ms`
              : "Degraded"}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {driverLabel(snapshot.database.driver)} ({snapshot.database.targetLabel})
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Security Guardrails</span>
            {criticalConfiguredCount === criticalTotalCount ? (
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            )}
          </div>
          <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground">
            {criticalConfiguredCount} / {criticalTotalCount} Critical Ready
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Runtime mode: {snapshot.nodeEnv}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Cloud Media Storage</span>
            <HardDrive className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 font-mono text-xl font-semibold text-foreground">
            {snapshot.storage.firebaseStorage.configured
              ? "Firebase Storage"
              : snapshot.storage.uploadsDirWritable
                ? "Local Disk"
                : "Read-Only"}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {snapshot.storage.firebaseStorage.storageBucket
              ? `${snapshot.storage.firebaseStorage.storageBucket} · ${snapshot.platformTotals.activeWebSessions}w/${snapshot.platformTotals.activeMobileSessions}m`
              : `${snapshot.platformTotals.activeWebSessions} web · ${snapshot.platformTotals.activeMobileSessions} mobile sessions`}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Bound Push Devices</span>
            <Smartphone className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground">
            {snapshot.deviceStats.activeTotal} Active
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {snapshot.deviceStats.androidActive} Android ·{" "}
            {snapshot.deviceStats.iosActive} iOS
          </p>
        </div>
      </section>

      {/* Global Static Mobile Endpoint Card */}
      <PlatformServerUrlCard
        initialConfig={snapshot.mobileCloud.platformConfig}
      />

      {/* Cloud Endpoint Verification + Expo EAS Binding */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
              <Cloud className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Expo EAS Cloud Project & Store Binding
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Verifies how mobile binaries bind to Expo Application Services
                (OTA updates, remote push tokens, and store bundle identifiers).
              </p>
            </div>
          </div>

          <dl className="divide-y divide-border rounded-md border border-border text-xs">
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <dt className="text-muted-foreground">Expo App Slug</dt>
              <dd className="font-mono font-medium text-foreground">
                {snapshot.mobileCloud.appSlug}
              </dd>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <dt className="text-muted-foreground">Android / iOS Bundle ID</dt>
              <dd className="font-mono font-medium text-foreground">
                {snapshot.mobileCloud.androidPackage}
              </dd>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <dt className="text-muted-foreground">EAS Project ID</dt>
              <dd className="font-mono font-medium text-foreground">
                {snapshot.mobileCloud.easProjectId ? (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {snapshot.mobileCloud.easProjectId}
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400">
                    Unbound (run eas init)
                  </span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <dt className="text-muted-foreground">EAS Account Owner</dt>
              <dd className="font-mono font-medium text-foreground">
                {snapshot.mobileCloud.easOwner || "Auto (CLI authenticated user)"}
              </dd>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <dt className="text-muted-foreground">Expo Push Security</dt>
              <dd className="font-medium text-foreground">
                {snapshot.mobileCloud.expoPushDisabled
                  ? "Disabled via DISABLE_EXPO_PUSH"
                  : snapshot.mobileCloud.expoAccessTokenConfigured
                    ? "Bearer Token Configured"
                    : "Standard Expo Push Transport"}
              </dd>
            </div>
          </dl>

          {/* Public Cloud Endpoint Reachability Probe */}
          <form onSubmit={handleProbeEndpoint} className="space-y-2 pt-1">
            <label
              htmlFor="probe-cloud-endpoint"
              className="block text-xs font-medium text-foreground"
            >
              Verify Public Cloud Endpoint Health
            </label>
            <div className="flex gap-2">
              <Input
                id="probe-cloud-endpoint"
                type="url"
                value={probeUrl}
                onChange={(e) => {
                  setProbeUrl(e.target.value);
                  setProbeFeedback(null);
                }}
                placeholder="https://your-production-domain.com"
                className="font-mono text-xs"
                disabled={probing}
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={probing || !probeUrl.trim()}
                className="shrink-0 text-xs"
              >
                {probing ? "Testing..." : "Test Reachability"}
              </Button>
            </div>
            {probeFeedback && (
              <p
                className={`text-xs ${
                  probeFeedback.ok
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-destructive"
                }`}
              >
                {probeFeedback.message}
              </p>
            )}
          </form>
        </div>

        {/* Secret & Environment Audit Checklist */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Environment & Secret Readiness Audit
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Checks server environment configuration without exposing secret
                values. Update runtime variables in your cloud host dashboard.
              </p>
            </div>
          </div>

          <ul className="divide-y divide-border rounded-md border border-border">
            {snapshot.envAudit.map((item) => (
              <li
                key={item.key}
                className="flex items-start justify-between gap-3 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs font-medium text-foreground">
                    {item.key}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                    item.configured
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : item.severity === "critical"
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {item.configured ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Configured</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3" />
                      <span>
                        {item.severity === "critical" ? "Required" : "Optional"}
                      </span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Quick Cloud Binding Commands */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            CLI Cloud Binding & Release Commands
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {cliSteps.map((step) => (
            <div
              key={step.id}
              className="flex flex-col justify-between gap-2 rounded-md border border-border bg-muted/30 p-3"
            >
              <span className="text-xs font-medium text-foreground">
                {step.label}
              </span>
              <div className="flex items-center justify-between gap-2 rounded border border-border bg-background px-2.5 py-1.5">
                <code className="truncate font-mono text-[11px] text-foreground">
                  {step.command}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopyCommand(step.id, step.command)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`Copy ${step.label}`}
                >
                  {copiedCmd === step.id ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bound Mobile Devices & Push Token Registry */}
      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Bound Mobile Devices & Push Registry
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Hardware POS devices currently registered for push alerts and
              cloud synchronization across all tenants.
            </p>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {snapshot.deviceStats.activeTotal} active /{" "}
            {snapshot.deviceStats.inactiveTotal} revoked
          </span>
        </div>

        {snapshot.deviceStats.devices.length === 0 ? (
          <div className="px-5 py-10 text-center text-xs text-muted-foreground">
            No mobile push device bindings recorded yet. Devices register
            automatically after a cloud sign-in on iOS or Android.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Workspace & User</th>
                  <th className="px-4 py-2.5">Device & Platform</th>
                  <th className="px-4 py-2.5">Push Token</th>
                  <th className="px-4 py-2.5">Last Seen</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {snapshot.deviceStats.devices.map((device) => (
                  <tr key={device.id} className="hover:bg-muted/25">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">
                        {device.tenantName}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        @{device.username} · {device.tenantSlug}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">
                        {device.deviceName || "POS Mobile Device"}
                      </p>
                      <p className="uppercase text-[11px] text-muted-foreground">
                        {device.platform}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {device.maskedToken}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatDateTime(device.lastSeenAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      {device.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          Revoked
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {device.isActive && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={revokingId === device.id}
                          onClick={() => handleRevokeDevice(device.id)}
                          className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Revoke</span>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Automated EOD Cron Dispatch History */}
      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Scheduled EOD Cron Execution Locks
              </h2>
              <p className="text-xs text-muted-foreground">
                Recent idempotent End-of-Day report runs dispatched via{" "}
                <code className="font-mono">/api/cron/eod-report</code>.
              </p>
            </div>
          </div>
        </div>

        {snapshot.eodRuns.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-muted-foreground">
            No scheduled EOD dispatches executed yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Tenant</th>
                  <th className="px-4 py-2.5">Report Date</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Claimed</th>
                  <th className="px-4 py-2.5">Completed / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {snapshot.eodRuns.map((run) => (
                  <tr
                    key={`${run.tenantId}-${run.reportDate}`}
                    className="hover:bg-muted/25"
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {run.tenantName}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">
                      {run.reportDate}
                    </td>
                    <td className="px-4 py-2.5 capitalize">{run.status}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatDateTime(run.claimedAt)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {run.errorMessage || formatDateTime(run.completedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
