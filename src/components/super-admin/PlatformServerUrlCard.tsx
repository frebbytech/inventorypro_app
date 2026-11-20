"use client";

import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Globe,
  RotateCcw,
  Server,
} from "lucide-react";
import { updatePlatformMobileServerUrl } from "@/actions/super-admin";
import type { PlatformMobileServerConfig } from "@/types/super-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PlatformServerUrlCardProps {
  initialConfig: PlatformMobileServerConfig;
}

export default function PlatformServerUrlCard({
  initialConfig,
}: PlatformServerUrlCardProps) {
  const [config, setConfig] =
    useState<PlatformMobileServerConfig>(initialConfig);
  const [urlInput, setUrlInput] = useState<string>(initialConfig.serverUrl);
  const [currentOrigin, setCurrentOrigin] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setConfig(initialConfig);
    setUrlInput(initialConfig.serverUrl);
  }, [initialConfig]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location?.origin) {
      setCurrentOrigin(window.location.origin.replace(/\/+$/, ""));
    }
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      const res = await updatePlatformMobileServerUrl(urlInput);
      if (!res.success || !res.data) {
        setError(res.message || "Failed to save static server URL.");
        return;
      }
      setConfig(res.data);
      setUrlInput(res.data.serverUrl);
      setSuccessMsg(
        res.data.serverUrl
          ? "Saved global static server URL for all mobile tenants."
          : "Cleared custom static URL; mobile will use automatic host fallback.",
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to save server URL.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      const res = await updatePlatformMobileServerUrl("");
      if (!res.success || !res.data) {
        setError(res.message || "Failed to reset server URL.");
        return;
      }
      setConfig(res.data);
      setUrlInput(res.data.serverUrl);
      setSuccessMsg("Reset to automatic host fallback.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    const valueToCopy = urlInput.trim() || currentOrigin;
    if (!valueToCopy || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(valueToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
            <Server className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                Mobile Sync Server URL (Global Static Endpoint)
              </h2>
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                  config.configuredBySuperAdmin
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-border bg-muted/50 text-muted-foreground"
                }`}
              >
                <Globe className="h-3 w-3" />
                <span>
                  {config.configuredBySuperAdmin
                    ? "Super Admin Configured"
                    : "Auto-Detect Fallback"}
                </span>
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Set the reusable backend URL once for every tenant. Mobile apps
              fetch this URL automatically on sign-in and cloud sync—tenants
              never need to enter a server address.
            </p>
          </div>
        </div>

        {config.updatedAt && (
          <p className="shrink-0 font-mono text-[11px] text-muted-foreground">
            Updated{" "}
            {new Date(config.updatedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            {config.updatedBy ? ` by @${config.updatedBy}` : ""}
          </p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="platform-mobile-server-url" className="text-xs">
            Static Backend URL
          </Label>
          <div className="flex gap-2">
            <Input
              id="platform-mobile-server-url"
              type="url"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                setError(null);
                setSuccessMsg(null);
              }}
              placeholder={
                currentOrigin || "https://your-inventorypro-server.com"
              }
              className="font-mono text-xs"
              disabled={saving}
            />
            {currentOrigin && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setUrlInput(currentOrigin);
                  setError(null);
                  setSuccessMsg(null);
                }}
                disabled={saving}
                className="shrink-0 text-xs"
              >
                Use Current Host
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!urlInput.trim() && !currentOrigin}
              className="shrink-0 gap-1.5 px-2.5 text-xs"
              title="Copy server URL"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span className="hidden md:inline">
                {copied ? "Copied" : "Copy"}
              </span>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {config.configuredBySuperAdmin && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={saving}
              className="gap-1.5 text-xs"
              title="Clear custom override and fall back to host auto-detection"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </Button>
          )}
          <Button type="submit" size="sm" disabled={saving} className="text-xs">
            {saving ? "Saving..." : "Save Static URL"}
          </Button>
        </div>
      </form>
    </section>
  );
}
