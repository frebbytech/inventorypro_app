"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  AlertCircle,
  Ban,
  Building2,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Globe,
  MonitorSmartphone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
} from "lucide-react";
import {
  createTenantBySuperAdmin,
  deleteTenantBySuperAdmin,
  getSuperAdminOverviewAndTenants,
  updateTenantBySuperAdmin,
} from "@/actions/super-admin";
import type {
  PlatformMobileServerConfig,
  SuperAdminOverviewMetrics,
  TenantAccessMode,
  TenantGrowthPoint,
  TenantSummaryItem,
} from "@/types/super-admin";
import PlatformServerUrlCard from "@/components/super-admin/PlatformServerUrlCard";
import TenantGrowthChart from "@/components/super-admin/TenantGrowthChart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TenantsConsoleProps {
  initialMetrics: SuperAdminOverviewMetrics;
  initialTenants: TenantSummaryItem[];
  initialGrowthSeries?: TenantGrowthPoint[];
  initialPlatformConfig?: PlatformMobileServerConfig;
  showGrowthChart?: boolean;
  heading?: string;
  subheading?: string;
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function slugPreview(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderAccessModeBadge(accessMode: TenantAccessMode) {
  if (accessMode === "mobile_only") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
        <Smartphone className="h-3.5 w-3.5 shrink-0" />
        <span>Mobile Only</span>
      </span>
    );
  }
  if (accessMode === "web_only") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">
        <Globe className="h-3.5 w-3.5 shrink-0" />
        <span>Web Only</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground">
      <MonitorSmartphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span>Web + Mobile</span>
    </span>
  );
}

export default function TenantsConsole({
  initialMetrics,
  initialTenants,
  initialGrowthSeries = [],
  initialPlatformConfig,
  showGrowthChart = false,
  heading = "Tenants & Business Workspaces",
  subheading = "Provision, inspect, suspend, or configure isolated multi-tenant store workspaces and their teams.",
}: TenantsConsoleProps) {
  const router = useRouter();

  const [metrics, setMetrics] =
    useState<SuperAdminOverviewMetrics>(initialMetrics);
  const [tenants, setTenants] = useState<TenantSummaryItem[]>(initialTenants);
  const [growthSeries, setGrowthSeries] =
    useState<TenantGrowthPoint[]>(initialGrowthSeries);
  const [platformConfig, setPlatformConfig] = useState<
    PlatformMobileServerConfig | undefined
  >(initialPlatformConfig);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "suspended"
  >("all");
  const [accessFilter, setAccessFilter] = useState<"all" | TenantAccessMode>(
    "all",
  );
  const [refreshing, setRefreshing] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerInfo, setBannerInfo] = useState<string | null>(null);

  // Create tenant modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreatePwd, setShowCreatePwd] = useState(false);
  const [cBusinessName, setCBusinessName] = useState("");
  const [cSlug, setCSlug] = useState("");
  const [cCurrency, setCCurrency] = useState("GHS");
  const [cAddress, setCAddress] = useState("");
  const [cAccessMode, setCAccessMode] = useState<TenantAccessMode>("both");
  const [cOwnerUsername, setCOwnerUsername] = useState("");
  const [cOwnerEmail, setCOwnerEmail] = useState("");
  const [cOwnerFirstname, setCOwnerFirstname] = useState("");
  const [cOwnerLastname, setCOwnerLastname] = useState("");
  const [cOwnerPhone, setCOwnerPhone] = useState("");
  const [cOwnerPassword, setCOwnerPassword] = useState("");

  // Edit tenant modal state
  const [editingTenant, setEditingTenant] = useState<TenantSummaryItem | null>(
    null,
  );
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eSlug, setESlug] = useState("");
  const [eCurrency, setECurrency] = useState("GHS");
  const [eStatus, setEStatus] = useState<"active" | "suspended">("active");
  const [eAccessMode, setEAccessMode] = useState<TenantAccessMode>("both");

  // Delete tenant confirmation modal
  const [deletingTenant, setDeletingTenant] =
    useState<TenantSummaryItem | null>(null);
  const [deleteConfirmSlug, setDeleteConfirmSlug] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const filteredTenants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tenants.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (accessFilter !== "all" && t.accessMode !== accessFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        t.ownerEmail.toLowerCase().includes(q) ||
        t.ownerUsername.toLowerCase().includes(q) ||
        t.ownerFullname.toLowerCase().includes(q)
      );
    });
  }, [tenants, searchQuery, statusFilter, accessFilter]);

  async function reloadData() {
    setRefreshing(true);
    setBannerError(null);
    try {
      const res = await getSuperAdminOverviewAndTenants();
      if (!res.success || !res.data) {
        setBannerError(res.message || "Failed to refresh tenants.");
        return;
      }
      setMetrics(res.data.metrics);
      setTenants(res.data.tenants);
      setGrowthSeries(res.data.growthSeries);
      if (res.data.platformConfig) {
        setPlatformConfig(res.data.platformConfig);
      }
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  function resetCreateForm() {
    setCBusinessName("");
    setCSlug("");
    setCCurrency("GHS");
    setCAddress("");
    setCAccessMode("both");
    setCOwnerUsername("");
    setCOwnerEmail("");
    setCOwnerFirstname("");
    setCOwnerLastname("");
    setCOwnerPhone("");
    setCOwnerPassword("");
    setCreateError(null);
    setShowCreatePwd(false);
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setBannerInfo(null);

    if (!cBusinessName.trim() || !cOwnerUsername.trim() || !cOwnerEmail.trim()) {
      setCreateError(
        "Business name, owner username, and owner email are required.",
      );
      return;
    }
    if (cOwnerPassword.length < 6) {
      setCreateError("Owner password must be at least 6 characters.");
      return;
    }

    setCreateLoading(true);
    try {
      const res = await createTenantBySuperAdmin({
        businessName: cBusinessName.trim(),
        slug: cSlug.trim() || undefined,
        currency: cCurrency.trim().toUpperCase() || "GHS",
        businessAddress: cAddress.trim() || undefined,
        accessMode: cAccessMode,
        ownerUsername: cOwnerUsername.trim(),
        ownerEmail: cOwnerEmail.trim(),
        ownerFirstname: cOwnerFirstname.trim() || "Store",
        ownerLastname: cOwnerLastname.trim() || "Owner",
        ownerPhonenumber: cOwnerPhone.trim() || undefined,
        ownerPassword: cOwnerPassword,
      });

      if (!res.success || !res.data) {
        setCreateError(res.message || "Could not create tenant.");
        return;
      }

      setCreateOpen(false);
      resetCreateForm();
      setBannerInfo(
        `Created workspace "${cBusinessName.trim()}" (${res.data.slug}).`,
      );
      await reloadData();
    } catch (err: unknown) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create tenant.",
      );
    } finally {
      setCreateLoading(false);
    }
  }

  function openEditModal(tenant: TenantSummaryItem) {
    setEditingTenant(tenant);
    setEName(tenant.name);
    setESlug(tenant.slug);
    setECurrency(tenant.currency);
    setEStatus(tenant.status);
    setEAccessMode(tenant.accessMode);
    setEditError(null);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTenant) return;
    setEditError(null);
    setBannerInfo(null);

    if (eName.trim().length < 2) {
      setEditError("Business name must be at least 2 characters.");
      return;
    }

    setEditLoading(true);
    try {
      const res = await updateTenantBySuperAdmin({
        tenantId: editingTenant.id,
        name: eName.trim(),
        slug: eSlug.trim(),
        currency: eCurrency.trim().toUpperCase() || "GHS",
        status: eStatus,
        accessMode: eAccessMode,
      });

      if (!res.success) {
        setEditError(res.message || "Failed to update tenant.");
        return;
      }

      setEditingTenant(null);
      setBannerInfo(`Updated tenant "${eName.trim()}".`);
      await reloadData();
    } catch (err: unknown) {
      setEditError(
        err instanceof Error ? err.message : "Failed to update tenant.",
      );
    } finally {
      setEditLoading(false);
    }
  }

  async function handleToggleStatus(tenant: TenantSummaryItem) {
    const nextStatus = tenant.status === "active" ? "suspended" : "active";
    setTogglingId(tenant.id);
    setBannerError(null);
    setBannerInfo(null);
    try {
      const res = await updateTenantBySuperAdmin({
        tenantId: tenant.id,
        status: nextStatus,
      });
      if (!res.success) {
        setBannerError(res.message || "Failed to change tenant status.");
        return;
      }
      setBannerInfo(
        `${tenant.name} is now ${nextStatus === "active" ? "active" : "suspended"}.`,
      );
      await reloadData();
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDeleteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!deletingTenant) return;
    setDeleteError(null);

    if (deleteConfirmSlug.trim() !== deletingTenant.slug) {
      setDeleteError(`Type "${deletingTenant.slug}" to confirm deletion.`);
      return;
    }

    setDeleteLoading(true);
    try {
      const res = await deleteTenantBySuperAdmin(deletingTenant.id);
      if (!res.success) {
        setDeleteError(res.message || "Failed to delete tenant.");
        return;
      }
      const deletedName = deletingTenant.name;
      setDeletingTenant(null);
      setDeleteConfirmSlug("");
      setBannerInfo(`Permanently removed tenant "${deletedName}".`);
      await reloadData();
    } catch (err: unknown) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete tenant.",
      );
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-6"
    >
      {/* Top Heading + Primary Action */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {heading}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subheading}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reloadData}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span>New Tenant</span>
          </Button>
        </div>
      </div>

      {/* Feedback Banners */}
      {bannerError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{bannerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            className="text-xs font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {bannerInfo && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{bannerInfo}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerInfo(null)}
            className="text-xs font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Platform KPI Strip (Flat Single Elevation) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Total Tenants</span>
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
            {metrics.totalTenants}
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {metrics.totalProducts.toLocaleString()} catalog items tracked
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Active Businesses</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
            {metrics.activeTenants}
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {metrics.mobileOnlyTenants} mobile-only ·{" "}
            {metrics.dualAccessTenants} web + mobile
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Suspended</span>
            <Ban className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
            {metrics.suspendedTenants}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sign-in and sync access blocked
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Total Members</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
            {metrics.totalMembers}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Staff & store admins across tenants
          </p>
        </div>
      </section>

      {platformConfig && (
        <PlatformServerUrlCard initialConfig={platformConfig} />
      )}

      {showGrowthChart && <TenantGrowthChart data={growthSeries} />}

      {/* Filter & Search Bar + Tenants Table */}
      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search business name, slug, or owner..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
              {(["all", "active", "suspended"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`whitespace-nowrap shrink-0 rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    statusFilter === tab
                      ? "bg-card text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 overflow-x-auto">
              {(
                [
                  { key: "all", label: "All Access" },
                  { key: "both", label: "Web + Mobile" },
                  { key: "mobile_only", label: "Mobile Only" },
                  { key: "web_only", label: "Web Only" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setAccessFilter(tab.key)}
                  className={`whitespace-nowrap shrink-0 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    accessFilter === tab.key
                      ? "bg-card text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredTenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground/60" />
            <h2 className="mt-3 text-base font-semibold text-foreground">
              {tenants.length === 0
                ? "No business tenants provisioned"
                : "No tenants match your filters"}
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {tenants.length === 0
                ? "Create the first business workspace to provision an isolated database scope and store owner account."
                : "Adjust your search query, status filter, or platform access filter to inspect other business workspaces."}
            </p>
            {tenants.length === 0 ? (
              <Button
                type="button"
                size="sm"
                className="mt-4 gap-1.5"
                onClick={() => {
                  resetCreateForm();
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                <span>Create First Tenant</span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setAccessFilter("all");
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Business & Workspace Code</th>
                  <th className="px-4 py-3">Primary Owner</th>
                  <th className="px-4 py-3">Members</th>
                  <th className="px-4 py-3">Activity</th>
                  <th className="px-4 py-3">Platform Access</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTenants.map((tenant) => (
                  <tr
                    key={tenant.id}
                    className="transition-colors hover:bg-muted/25"
                  >
                    <td className="px-4 py-3 align-middle">
                      <div className="font-medium text-foreground">
                        <Link
                          href={`/super-admin/tenants/${tenant.id}`}
                          className="hover:text-primary transition-colors"
                        >
                          {tenant.name}
                        </Link>
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {tenant.slug} · {tenant.currency}
                        {tenant.isDefaultTenant ? " · System Default" : ""}
                      </div>
                    </td>

                    <td className="px-4 py-3 align-middle">
                      <div className="font-medium text-foreground">
                        {tenant.ownerFullname}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        @{tenant.ownerUsername} · {tenant.ownerEmail}
                      </div>
                    </td>

                    <td className="px-4 py-3 align-middle tabular-nums">
                      <div className="font-mono text-sm font-medium text-foreground">
                        {tenant.memberCount}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {tenant.adminCount} admin
                        {tenant.adminCount === 1 ? "" : "s"} ·{" "}
                        {tenant.activeSessionCount} active session
                        {tenant.activeSessionCount === 1 ? "" : "s"}
                      </div>
                    </td>

                    <td className="px-4 py-3 align-middle tabular-nums">
                      <div className="text-xs font-medium text-foreground">
                        {tenant.productCount} products · {tenant.salesCount} sales
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Updated {formatShortDate(tenant.lastActivityAt)}
                      </div>
                    </td>

                    <td className="px-4 py-3 align-middle">
                      {renderAccessModeBadge(tenant.accessMode)}
                    </td>

                    <td className="px-4 py-3 align-middle">
                      {tenant.status === "active" ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                          <Ban className="h-3.5 w-3.5" />
                          <span>Suspended</span>
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 align-middle text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                          <Link href={`/super-admin/tenants/${tenant.id}`}>
                            <Users className="h-3.5 w-3.5" />
                            <span>Members</span>
                          </Link>
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(tenant)}
                          className="h-8 px-2.5 text-xs"
                          title="Edit tenant details"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={togglingId === tenant.id}
                          onClick={() => handleToggleStatus(tenant)}
                          className="h-8 px-2.5 text-xs"
                          title={
                            tenant.status === "active"
                              ? "Suspend workspace"
                              : "Reactivate workspace"
                          }
                        >
                          {tenant.status === "active" ? (
                            <Ban className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          )}
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={tenant.isDefaultTenant}
                          onClick={() => {
                            setDeletingTenant(tenant);
                            setDeleteConfirmSlug("");
                            setDeleteError(null);
                          }}
                          className="h-8 px-2.5 text-xs text-destructive hover:text-destructive disabled:opacity-40"
                          title={
                            tenant.isDefaultTenant
                              ? "Default system tenant cannot be deleted"
                              : "Delete tenant"
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create Tenant Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Provision New Business Tenant</DialogTitle>
            <DialogDescription>
              Creates an isolated business workspace and its initial store
              administrator account.
            </DialogDescription>
          </DialogHeader>

          {createError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="new-tenant-name">Business Name</Label>
                <Input
                  id="new-tenant-name"
                  value={cBusinessName}
                  onChange={(e) => {
                    setCBusinessName(e.target.value);
                  }}
                  placeholder="Acme Pharmacy Ltd"
                  disabled={createLoading}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-tenant-currency">Currency</Label>
                <Input
                  id="new-tenant-currency"
                  value={cCurrency}
                  onChange={(e) => setCCurrency(e.target.value.toUpperCase())}
                  placeholder="GHS"
                  maxLength={6}
                  disabled={createLoading}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-tenant-slug">Workspace Code (optional)</Label>
                <Input
                  id="new-tenant-slug"
                  value={cSlug}
                  onChange={(e) => setCSlug(e.target.value)}
                  placeholder={slugPreview(cBusinessName) || "acme-pharmacy"}
                  className="font-mono text-xs"
                  disabled={createLoading}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-tenant-address">Business Address</Label>
                <Input
                  id="new-tenant-address"
                  value={cAddress}
                  onChange={(e) => setCAddress(e.target.value)}
                  placeholder="Accra Central, Ghana"
                  disabled={createLoading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-tenant-access">Platform Access</Label>
              <select
                id="new-tenant-access"
                value={cAccessMode}
                onChange={(e) =>
                  setCAccessMode(
                    e.target.value === "mobile_only"
                      ? "mobile_only"
                      : e.target.value === "web_only"
                        ? "web_only"
                        : "both",
                  )
                }
                disabled={createLoading}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="both">Web + Mobile (full cloud & mobile app)</option>
                <option value="mobile_only">Mobile Only (mobile app access only; web login blocked)</option>
                <option value="web_only">Web Only (browser dashboard only; mobile login blocked)</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Controls whether workspace members can sign in on the web dashboard, mobile app, or both.
              </p>
            </div>

            <div className="border-t border-border pt-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Initial Workspace Administrator
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="owner-first">First Name</Label>
                  <Input
                    id="owner-first"
                    value={cOwnerFirstname}
                    onChange={(e) => setCOwnerFirstname(e.target.value)}
                    placeholder="Kwame"
                    disabled={createLoading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="owner-last">Last Name</Label>
                  <Input
                    id="owner-last"
                    value={cOwnerLastname}
                    onChange={(e) => setCOwnerLastname(e.target.value)}
                    placeholder="Mensah"
                    disabled={createLoading}
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="owner-username">Owner Username</Label>
                  <Input
                    id="owner-username"
                    value={cOwnerUsername}
                    onChange={(e) => setCOwnerUsername(e.target.value)}
                    placeholder="kmensah"
                    disabled={createLoading}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="owner-phone">Phone (optional)</Label>
                  <Input
                    id="owner-phone"
                    value={cOwnerPhone}
                    onChange={(e) => setCOwnerPhone(e.target.value)}
                    placeholder="+233..."
                    disabled={createLoading}
                  />
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                <Label htmlFor="owner-email">Owner Email</Label>
                <Input
                  id="owner-email"
                  type="email"
                  value={cOwnerEmail}
                  onChange={(e) => setCOwnerEmail(e.target.value)}
                  placeholder="owner@acmepharmacy.com"
                  disabled={createLoading}
                  required
                />
              </div>

              <div className="mt-3 space-y-1.5">
                <Label htmlFor="owner-password">Initial Password</Label>
                <div className="relative">
                  <Input
                    id="owner-password"
                    type={showCreatePwd ? "text" : "password"}
                    value={cOwnerPassword}
                    onChange={(e) => setCOwnerPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="pr-10"
                    disabled={createLoading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePwd((p) => !p)}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showCreatePwd ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={createLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createLoading}>
                {createLoading ? "Creating..." : "Create Tenant"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Tenant Dialog */}
      <Dialog
        open={Boolean(editingTenant)}
        onOpenChange={(open) => {
          if (!open) setEditingTenant(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Tenant Settings</DialogTitle>
            <DialogDescription>
              Update workspace metadata, currency, or active/suspended status.
            </DialogDescription>
          </DialogHeader>

          {editError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-tenant-name">Business Name</Label>
              <Input
                id="edit-tenant-name"
                value={eName}
                onChange={(e) => setEName(e.target.value)}
                disabled={editLoading}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-tenant-slug">Workspace Code</Label>
                <Input
                  id="edit-tenant-slug"
                  value={eSlug}
                  onChange={(e) => setESlug(e.target.value)}
                  className="font-mono text-xs"
                  disabled={editLoading}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-tenant-currency">Currency</Label>
                <Input
                  id="edit-tenant-currency"
                  value={eCurrency}
                  onChange={(e) => setECurrency(e.target.value.toUpperCase())}
                  maxLength={6}
                  disabled={editLoading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-tenant-status">Workspace Status</Label>
              <select
                id="edit-tenant-status"
                value={eStatus}
                onChange={(e) =>
                  setEStatus(
                    e.target.value === "suspended" ? "suspended" : "active",
                  )
                }
                disabled={editLoading}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="active">Active (allow sign-in & sync)</option>
                <option value="suspended">
                  Suspended (block sign-in & revoke active sync)
                </option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-tenant-access">Platform Access</Label>
              <select
                id="edit-tenant-access"
                value={eAccessMode}
                onChange={(e) =>
                  setEAccessMode(
                    e.target.value === "mobile_only"
                      ? "mobile_only"
                      : e.target.value === "web_only"
                        ? "web_only"
                        : "both",
                  )
                }
                disabled={editLoading}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="both">Web + Mobile (full cloud & mobile app)</option>
                <option value="mobile_only">Mobile Only (blocks web login & revokes web sessions)</option>
                <option value="web_only">Web Only (blocks mobile login & revokes mobile sessions)</option>
              </select>
              {editingTenant &&
                eAccessMode !== editingTenant.accessMode &&
                eAccessMode !== "both" && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {eAccessMode === "mobile_only"
                      ? "Saving revokes all active browser sessions immediately while keeping mobile devices signed in."
                      : "Saving revokes all active mobile app sessions immediately while keeping web browsers signed in."}
                  </p>
                )}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingTenant(null)}
                disabled={editLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editLoading}>
                {editLoading ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Tenant Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingTenant)}
        onOpenChange={(open) => {
          if (!open) setDeletingTenant(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Business Tenant</DialogTitle>
            <DialogDescription>
              This permanently removes{" "}
              <span className="font-semibold text-foreground">
                {deletingTenant?.name}
              </span>{" "}
              and all its users, products, sales, and sync history. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}

          <form onSubmit={handleDeleteSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="confirm-delete-slug">
                Type{" "}
                <span className="font-mono font-semibold text-foreground">
                  {deletingTenant?.slug}
                </span>{" "}
                to confirm
              </Label>
              <Input
                id="confirm-delete-slug"
                value={deleteConfirmSlug}
                onChange={(e) => setDeleteConfirmSlug(e.target.value)}
                placeholder={deletingTenant?.slug || ""}
                className="font-mono text-xs"
                disabled={deleteLoading}
                autoFocus
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingTenant(null)}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={
                  deleteLoading ||
                  deleteConfirmSlug.trim() !== deletingTenant?.slug
                }
              >
                {deleteLoading ? "Deleting..." : "Delete Tenant Permanently"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
