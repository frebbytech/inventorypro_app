"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  MonitorSmartphone,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Trash2,
  Unlock,
  UserCheck,
  Users,
} from "lucide-react";
import {
  createTenantMemberBySuperAdmin,
  deleteTenantMemberBySuperAdmin,
  getTenantMembersBySuperAdmin,
  resetTenantMemberPasswordBySuperAdmin,
  revokeTenantMemberSessionsBySuperAdmin,
  updateTenantBySuperAdmin,
  updateTenantMemberBySuperAdmin,
} from "@/actions/super-admin";
import type {
  TenantAccessMode,
  TenantDetailData,
  TenantMemberItem,
} from "@/types/super-admin";
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

interface TenantMembersConsoleProps {
  initialData: TenantDetailData;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isAccountLocked(lockedUntil: string | null): boolean {
  if (!lockedUntil) return false;
  const dt = new Date(lockedUntil);
  return !Number.isNaN(dt.getTime()) && dt.getTime() > Date.now();
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

export default function TenantMembersConsole({
  initialData,
}: TenantMembersConsoleProps) {
  const router = useRouter();
  const [data, setData] = useState<TenantDetailData>(initialData);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "member">(
    "all",
  );
  const [refreshing, setRefreshing] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerInfo, setBannerInfo] = useState<string | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);

  // Add member modal
  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showAddPwd, setShowAddPwd] = useState(false);
  const [aFirstname, setAFirstname] = useState("");
  const [aLastname, setALastname] = useState("");
  const [aUsername, setAUsername] = useState("");
  const [aEmail, setAEmail] = useState("");
  const [aPhone, setAPhone] = useState("");
  const [aRole, setARole] = useState<"admin" | "member">("member");
  const [aPassword, setAPassword] = useState("");
  const [aTwoFactor, setATwoFactor] = useState(false);
  const [aTwoFactorMethod, setATwoFactorMethod] = useState<"email" | "sms">(
    "email",
  );

  // Edit member modal
  const [editingMember, setEditingMember] = useState<TenantMemberItem | null>(
    null,
  );
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [eFirstname, setEFirstname] = useState("");
  const [eLastname, setELastname] = useState("");
  const [eUsername, setEUsername] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eRole, setERole] = useState<"admin" | "member">("member");
  const [eTwoFactor, setETwoFactor] = useState(false);
  const [eTwoFactorMethod, setETwoFactorMethod] = useState<"email" | "sms">(
    "email",
  );
  const [eUnlock, setEUnlock] = useState(false);

  // Reset password modal
  const [pwdMember, setPwdMember] = useState<TenantMemberItem | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  // Remove member confirmation modal
  const [removingMember, setRemovingMember] =
    useState<TenantMemberItem | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Edit tenant info modal
  const [editTenantOpen, setEditTenantOpen] = useState(false);
  const [tName, setTName] = useState(initialData.tenant.name);
  const [tSlug, setTSlug] = useState(initialData.tenant.slug);
  const [tCurrency, setTCurrency] = useState(initialData.tenant.currency);
  const [tAddress, setTAddress] = useState(initialData.tenant.businessAddress);
  const [tAccessMode, setTAccessMode] = useState<TenantAccessMode>(
    initialData.tenant.accessMode,
  );
  const [tSaving, setTSaving] = useState(false);
  const [tError, setTError] = useState<string | null>(null);

  const tenant = data.tenant;
  const members = data.members;

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return members.filter((m) => {
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (!q) return true;
      return (
        m.fullname.toLowerCase().includes(q) ||
        m.username.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.phonenumber.toLowerCase().includes(q)
      );
    });
  }, [members, searchQuery, roleFilter]);

  async function reloadData() {
    setRefreshing(true);
    setBannerError(null);
    try {
      const res = await getTenantMembersBySuperAdmin(tenant.id);
      if (!res.success || !res.data) {
        setBannerError(res.message || "Failed to refresh tenant members.");
        return;
      }
      setData(res.data);
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  function resetAddForm() {
    setAFirstname("");
    setALastname("");
    setAUsername("");
    setAEmail("");
    setAPhone("");
    setARole("member");
    setAPassword("");
    setATwoFactor(false);
    setATwoFactorMethod("email");
    setAddError(null);
    setShowAddPwd(false);
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setBannerInfo(null);

    if (
      !aFirstname.trim() ||
      !aLastname.trim() ||
      !aUsername.trim() ||
      !aEmail.trim()
    ) {
      setAddError(
        "First name, last name, username, and email address are required.",
      );
      return;
    }
    if (aPassword.length < 6) {
      setAddError("Password must be at least 6 characters.");
      return;
    }

    setAddLoading(true);
    try {
      const res = await createTenantMemberBySuperAdmin({
        tenantId: tenant.id,
        firstname: aFirstname.trim(),
        lastname: aLastname.trim(),
        username: aUsername.trim(),
        email: aEmail.trim(),
        phonenumber: aPhone.trim() || undefined,
        password: aPassword,
        role: aRole,
        twoFactorEnabled: aTwoFactor,
        twoFactorMethod: aTwoFactorMethod,
      });

      if (!res.success) {
        setAddError(res.message || "Could not add tenant member.");
        return;
      }

      setAddOpen(false);
      resetAddForm();
      setBannerInfo(`Added ${aUsername.trim()} to ${tenant.name}.`);
      await reloadData();
    } catch (err: unknown) {
      setAddError(
        err instanceof Error ? err.message : "Failed to add tenant member.",
      );
    } finally {
      setAddLoading(false);
    }
  }

  function openEditMember(m: TenantMemberItem) {
    setEditingMember(m);
    setEFirstname(m.firstname);
    setELastname(m.lastname);
    setEUsername(m.username);
    setEEmail(m.email);
    setEPhone(m.phonenumber);
    setERole(m.role);
    setETwoFactor(m.twoFactorEnabled);
    setETwoFactorMethod(m.twoFactorMethod);
    setEUnlock(false);
    setEditError(null);
  }

  async function handleEditMemberSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMember) return;
    setEditError(null);
    setBannerInfo(null);

    setEditLoading(true);
    try {
      const res = await updateTenantMemberBySuperAdmin({
        tenantId: tenant.id,
        userId: editingMember.id,
        firstname: eFirstname.trim(),
        lastname: eLastname.trim(),
        username: eUsername.trim(),
        email: eEmail.trim(),
        phonenumber: ePhone.trim(),
        role: eRole,
        twoFactorEnabled: eTwoFactor,
        twoFactorMethod: eTwoFactorMethod,
        unlockAccount: eUnlock,
      });

      if (!res.success) {
        setEditError(res.message || "Failed to update member.");
        return;
      }

      setEditingMember(null);
      setBannerInfo(`Updated member @${eUsername.trim()}.`);
      await reloadData();
    } catch (err: unknown) {
      setEditError(
        err instanceof Error ? err.message : "Failed to update member.",
      );
    } finally {
      setEditLoading(false);
    }
  }

  async function handleQuickToggle2FA(m: TenantMemberItem) {
    setBusyMemberId(m.id);
    setBannerError(null);
    setBannerInfo(null);
    try {
      const res = await updateTenantMemberBySuperAdmin({
        tenantId: tenant.id,
        userId: m.id,
        twoFactorEnabled: !m.twoFactorEnabled,
        twoFactorMethod: m.twoFactorMethod,
      });
      if (!res.success) {
        setBannerError(res.message || "Could not update 2FA setting.");
        return;
      }
      setBannerInfo(
        `${!m.twoFactorEnabled ? "Enabled" : "Disabled"} 2FA for @${m.username}.`,
      );
      await reloadData();
    } finally {
      setBusyMemberId(null);
    }
  }

  async function handleQuickUnlock(m: TenantMemberItem) {
    setBusyMemberId(m.id);
    setBannerError(null);
    setBannerInfo(null);
    try {
      const res = await updateTenantMemberBySuperAdmin({
        tenantId: tenant.id,
        userId: m.id,
        unlockAccount: true,
      });
      if (!res.success) {
        setBannerError(res.message || "Could not unlock account.");
        return;
      }
      setBannerInfo(`Unlocked account @${m.username}.`);
      await reloadData();
    } finally {
      setBusyMemberId(null);
    }
  }

  async function handleRevokeSessions(m: TenantMemberItem) {
    setBusyMemberId(m.id);
    setBannerError(null);
    setBannerInfo(null);
    try {
      const res = await revokeTenantMemberSessionsBySuperAdmin({
        tenantId: tenant.id,
        userId: m.id,
      });
      if (!res.success || !res.data) {
        setBannerError(res.message || "Failed to revoke sessions.");
        return;
      }
      setBannerInfo(
        `Revoked ${res.data.revokedCount} active session${res.data.revokedCount === 1 ? "" : "s"} for @${m.username}.`,
      );
      await reloadData();
    } finally {
      setBusyMemberId(null);
    }
  }

  async function handleResetPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pwdMember) return;
    setPwdError(null);
    setBannerInfo(null);

    if (newPassword.length < 6) {
      setPwdError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError("Passwords do not match.");
      return;
    }

    setPwdLoading(true);
    try {
      const res = await resetTenantMemberPasswordBySuperAdmin({
        tenantId: tenant.id,
        userId: pwdMember.id,
        newPassword,
      });
      if (!res.success) {
        setPwdError(res.message || "Failed to reset password.");
        return;
      }
      const uname = pwdMember.username;
      setPwdMember(null);
      setNewPassword("");
      setConfirmPassword("");
      setBannerInfo(
        `Password reset for @${uname}. Active sessions have been revoked.`,
      );
      await reloadData();
    } catch (err: unknown) {
      setPwdError(
        err instanceof Error ? err.message : "Failed to reset password.",
      );
    } finally {
      setPwdLoading(false);
    }
  }

  async function handleRemoveMemberConfirm() {
    if (!removingMember) return;
    setRemoveError(null);
    setRemoveLoading(true);
    try {
      const res = await deleteTenantMemberBySuperAdmin({
        tenantId: tenant.id,
        userId: removingMember.id,
      });
      if (!res.success) {
        setRemoveError(res.message || "Failed to remove member.");
        return;
      }
      const uname = removingMember.username;
      setRemovingMember(null);
      setBannerInfo(`Removed @${uname} from ${tenant.name}.`);
      await reloadData();
    } catch (err: unknown) {
      setRemoveError(
        err instanceof Error ? err.message : "Failed to remove member.",
      );
    } finally {
      setRemoveLoading(false);
    }
  }

  async function handleToggleTenantStatus() {
    const nextStatus = tenant.status === "active" ? "suspended" : "active";
    setBannerError(null);
    setBannerInfo(null);
    const res = await updateTenantBySuperAdmin({
      tenantId: tenant.id,
      status: nextStatus,
    });
    if (!res.success) {
      setBannerError(res.message || "Could not update tenant status.");
      return;
    }
    setBannerInfo(
      `${tenant.name} is now ${nextStatus === "active" ? "active" : "suspended"}.`,
    );
    await reloadData();
  }

  async function handleSaveTenantMeta(e: React.FormEvent) {
    e.preventDefault();
    setTError(null);
    setTSaving(true);
    try {
      const res = await updateTenantBySuperAdmin({
        tenantId: tenant.id,
        name: tName.trim(),
        slug: tSlug.trim(),
        currency: tCurrency.trim().toUpperCase() || "GHS",
        businessAddress: tAddress.trim(),
        accessMode: tAccessMode,
      });
      if (!res.success) {
        setTError(res.message || "Failed to update workspace.");
        return;
      }
      setEditTenantOpen(false);
      setBannerInfo(`Updated workspace details for ${tName.trim()}.`);
      await reloadData();
    } finally {
      setTSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-6"
    >
      {/* Breadcrumb Back Action + Tenant Summary Header */}
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <Link
            href="/super-admin/tenants"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to All Tenants</span>
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {tenant.name}
            </h1>
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
            {renderAccessModeBadge(tenant.accessMode)}
          </div>

          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {tenant.slug} · {tenant.currency} · {tenant.memberCount} members ·{" "}
            {tenant.productCount} products · {tenant.activeSessionCount} active
            sessions
            {tenant.businessAddress ? ` · ${tenant.businessAddress}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setTName(tenant.name);
              setTSlug(tenant.slug);
              setTCurrency(tenant.currency);
              setTAddress(tenant.businessAddress);
              setTAccessMode(tenant.accessMode);
              setTError(null);
              setEditTenantOpen(true);
            }}
            className="gap-1.5"
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>Edit Business</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleToggleTenantStatus}
            className="gap-1.5"
          >
            {tenant.status === "active" ? (
              <>
                <Ban className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>Suspend</span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Reactivate</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => {
              resetAddForm();
              setAddOpen(true);
            }}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span>Add Member</span>
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

      {/* Members Directory Card */}
      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search member name, username, email..."
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
              {(["all", "admin", "member"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setRoleFilter(tab)}
                  className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    roleFilter === tab
                      ? "bg-card text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "all" ? "All Roles" : `${tab}s`}
                </button>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reloadData}
              disabled={refreshing}
              className="h-8 gap-1.5"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <Users className="h-8 w-8 text-muted-foreground/60" />
            <h2 className="mt-3 text-base font-semibold text-foreground">
              {members.length === 0
                ? "No members found in this tenant"
                : "No members match your filter"}
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Add staff or administrator accounts for this business workspace.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Security & 2FA</th>
                  <th className="px-4 py-3">Last Login & Sessions</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredMembers.map((m) => {
                  const locked = isAccountLocked(m.lockedUntil);
                  const isBusy = busyMemberId === m.id;
                  return (
                    <tr
                      key={m.id}
                      className="transition-colors hover:bg-muted/25"
                    >
                      <td className="px-4 py-3 align-middle">
                        <div className="font-medium text-foreground">
                          {m.fullname}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          @{m.username}
                          {m.isTenantOwner ? " · Tenant Owner" : ""}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-middle">
                        <div className="text-foreground">{m.email}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {m.phonenumber || "No phone"}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-middle">
                        {m.role === "admin" ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <span>Admin</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>Member</span>
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-col gap-0.5 text-xs">
                          {m.twoFactorEnabled ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span>
                                2FA On ({m.twoFactorMethod.toUpperCase()})
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              <ShieldOff className="h-3.5 w-3.5" />
                              <span>2FA Off</span>
                            </span>
                          )}
                          {locked && (
                            <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
                              <Lock className="h-3.5 w-3.5" />
                              <span>Locked</span>
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-middle tabular-nums">
                        <div className="text-xs text-foreground">
                          {formatDateTime(m.lastLoginAt)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {m.activeSessionsCount} active session
                          {m.activeSessionsCount === 1 ? "" : "s"}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-middle text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => openEditMember(m)}
                            className="h-8 px-2 text-xs"
                            title="Edit member"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => handleQuickToggle2FA(m)}
                            className="h-8 px-2 text-xs"
                            title={
                              m.twoFactorEnabled
                                ? "Disable 2FA"
                                : "Enable 2FA"
                            }
                          >
                            {m.twoFactorEnabled ? (
                              <ShieldOff className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                            ) : (
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            )}
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => {
                              setPwdMember(m);
                              setNewPassword("");
                              setConfirmPassword("");
                              setPwdError(null);
                              setShowResetPwd(false);
                            }}
                            className="h-8 px-2 text-xs"
                            title="Reset password"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>

                          {locked && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => handleQuickUnlock(m)}
                              className="h-8 px-2 text-xs text-amber-600 dark:text-amber-400"
                              title="Unlock account"
                            >
                              <Unlock className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {m.activeSessionsCount > 0 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => handleRevokeSessions(m)}
                              className="h-8 px-2 text-xs"
                              title="Revoke active sessions"
                            >
                              <ShieldAlert className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => {
                              setRemovingMember(m);
                              setRemoveError(null);
                            }}
                            className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                            title="Remove member"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add Member Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Member to {tenant.name}</DialogTitle>
            <DialogDescription>
              Provisions a staff or store administrator account scoped strictly
              to this business tenant.
            </DialogDescription>
          </DialogHeader>

          {addError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{addError}</span>
            </div>
          )}

          <form onSubmit={handleAddMember} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="add-first">First Name</Label>
                <Input
                  id="add-first"
                  value={aFirstname}
                  onChange={(e) => setAFirstname(e.target.value)}
                  disabled={addLoading}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-last">Last Name</Label>
                <Input
                  id="add-last"
                  value={aLastname}
                  onChange={(e) => setALastname(e.target.value)}
                  disabled={addLoading}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="add-username">Username</Label>
                <Input
                  id="add-username"
                  value={aUsername}
                  onChange={(e) => setAUsername(e.target.value)}
                  disabled={addLoading}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-role">Role</Label>
                <select
                  id="add-role"
                  value={aRole}
                  onChange={(e) =>
                    setARole(
                      e.target.value === "admin" ? "admin" : "member",
                    )
                  }
                  disabled={addLoading}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="member">Member (Cashier / Staff)</option>
                  <option value="admin">Admin (Workspace Manager)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="add-email">Email</Label>
                <Input
                  id="add-email"
                  type="email"
                  value={aEmail}
                  onChange={(e) => setAEmail(e.target.value)}
                  disabled={addLoading}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-phone">Phone (optional)</Label>
                <Input
                  id="add-phone"
                  value={aPhone}
                  onChange={(e) => setAPhone(e.target.value)}
                  placeholder="+233..."
                  disabled={addLoading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-password">Password</Label>
              <div className="relative">
                <Input
                  id="add-password"
                  type={showAddPwd ? "text" : "password"}
                  value={aPassword}
                  onChange={(e) => setAPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="pr-10"
                  disabled={addLoading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowAddPwd((p) => !p)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showAddPwd ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="rounded-md border border-border p-3 space-y-3">
              <label className="flex items-center justify-between gap-3 text-sm font-medium">
                <span>Require Two-Factor Authentication</span>
                <input
                  type="checkbox"
                  checked={aTwoFactor}
                  onChange={(e) => setATwoFactor(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              </label>

              {aTwoFactor && (
                <div className="space-y-1.5">
                  <Label htmlFor="add-2fa-method">Delivery Method</Label>
                  <select
                    id="add-2fa-method"
                    value={aTwoFactorMethod}
                    onChange={(e) =>
                      setATwoFactorMethod(
                        e.target.value === "sms" ? "sms" : "email",
                      )
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="email">Email OTP</option>
                    <option value="sms">SMS OTP</option>
                  </select>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
                disabled={addLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addLoading}>
                {addLoading ? "Adding..." : "Add Member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog
        open={Boolean(editingMember)}
        onOpenChange={(open) => {
          if (!open) setEditingMember(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Member @{editingMember?.username}</DialogTitle>
            <DialogDescription>
              Update profile details, workspace role, or security enforcement.
            </DialogDescription>
          </DialogHeader>

          {editError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <form onSubmit={handleEditMemberSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-first">First Name</Label>
                <Input
                  id="edit-first"
                  value={eFirstname}
                  onChange={(e) => setEFirstname(e.target.value)}
                  disabled={editLoading}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-last">Last Name</Label>
                <Input
                  id="edit-last"
                  value={eLastname}
                  onChange={(e) => setELastname(e.target.value)}
                  disabled={editLoading}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-username">Username</Label>
                <Input
                  id="edit-username"
                  value={eUsername}
                  onChange={(e) => setEUsername(e.target.value)}
                  disabled={editLoading}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-role">Role</Label>
                <select
                  id="edit-role"
                  value={eRole}
                  onChange={(e) =>
                    setERole(
                      e.target.value === "admin" ? "admin" : "member",
                    )
                  }
                  disabled={editLoading}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="member">Member (Cashier / Staff)</option>
                  <option value="admin">Admin (Workspace Manager)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={eEmail}
                  onChange={(e) => setEEmail(e.target.value)}
                  disabled={editLoading}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={ePhone}
                  onChange={(e) => setEPhone(e.target.value)}
                  disabled={editLoading}
                />
              </div>
            </div>

            <div className="rounded-md border border-border p-3 space-y-3">
              <label className="flex items-center justify-between gap-3 text-sm font-medium">
                <span>Require Two-Factor Authentication</span>
                <input
                  type="checkbox"
                  checked={eTwoFactor}
                  onChange={(e) => setETwoFactor(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              </label>

              {eTwoFactor && (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-2fa-method">Delivery Method</Label>
                  <select
                    id="edit-2fa-method"
                    value={eTwoFactorMethod}
                    onChange={(e) =>
                      setETwoFactorMethod(
                        e.target.value === "sms" ? "sms" : "email",
                      )
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="email">Email OTP</option>
                    <option value="sms">SMS OTP</option>
                  </select>
                </div>
              )}

              {editingMember && isAccountLocked(editingMember.lockedUntil) && (
                <label className="flex items-center justify-between gap-3 border-t border-border pt-2.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                  <span>Clear lockout & failed login counter</span>
                  <input
                    type="checkbox"
                    checked={eUnlock}
                    onChange={(e) => setEUnlock(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                </label>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingMember(null)}
                disabled={editLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editLoading}>
                {editLoading ? "Saving..." : "Save Member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Member Password Dialog */}
      <Dialog
        open={Boolean(pwdMember)}
        onOpenChange={(open) => {
          if (!open) setPwdMember(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password for @{pwdMember?.username}</DialogTitle>
            <DialogDescription>
              Assigns a new password and revokes all active web and mobile
              sessions for this member.
            </DialogDescription>
          </DialogHeader>

          {pwdError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{pwdError}</span>
            </div>
          )}

          <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-pwd-1">New Password</Label>
              <div className="relative">
                <Input
                  id="reset-pwd-1"
                  type={showResetPwd ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="pr-10"
                  disabled={pwdLoading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowResetPwd((p) => !p)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showResetPwd ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reset-pwd-2">Confirm Password</Label>
              <Input
                id="reset-pwd-2"
                type={showResetPwd ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                disabled={pwdLoading}
                required
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPwdMember(null)}
                disabled={pwdLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pwdLoading}>
                {pwdLoading ? "Updating..." : "Reset Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <Dialog
        open={Boolean(removingMember)}
        onOpenChange={(open) => {
          if (!open) setRemovingMember(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove @{removingMember?.username}?</DialogTitle>
            <DialogDescription>
              Removes{" "}
              <span className="font-semibold text-foreground">
                {removingMember?.fullname}
              </span>{" "}
              from {tenant.name}. Historical sales and product records authored
              by this user will be reassigned to the workspace administrator.
            </DialogDescription>
          </DialogHeader>

          {removeError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{removeError}</span>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemovingMember(null)}
              disabled={removeLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRemoveMemberConfirm}
              disabled={removeLoading}
            >
              {removeLoading ? "Removing..." : "Remove Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Business Details Dialog */}
      <Dialog open={editTenantOpen} onOpenChange={setEditTenantOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Business Profile</DialogTitle>
            <DialogDescription>
              Updates tenant identity and default store settings.
            </DialogDescription>
          </DialogHeader>

          {tError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{tError}</span>
            </div>
          )}

          <form onSubmit={handleSaveTenantMeta} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="detail-t-name">Business Name</Label>
              <Input
                id="detail-t-name"
                value={tName}
                onChange={(e) => setTName(e.target.value)}
                disabled={tSaving}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="detail-t-slug">Workspace Code</Label>
                <Input
                  id="detail-t-slug"
                  value={tSlug}
                  onChange={(e) => setTSlug(e.target.value)}
                  className="font-mono text-xs"
                  disabled={tSaving}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="detail-t-curr">Currency</Label>
                <Input
                  id="detail-t-curr"
                  value={tCurrency}
                  onChange={(e) => setTCurrency(e.target.value.toUpperCase())}
                  maxLength={6}
                  disabled={tSaving}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="detail-t-addr">Business Address</Label>
              <Input
                id="detail-t-addr"
                value={tAddress}
                onChange={(e) => setTAddress(e.target.value)}
                disabled={tSaving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="detail-t-access">Platform Access</Label>
              <select
                id="detail-t-access"
                value={tAccessMode}
                onChange={(e) =>
                  setTAccessMode(
                    e.target.value === "mobile_only"
                      ? "mobile_only"
                      : e.target.value === "web_only"
                        ? "web_only"
                        : "both",
                  )
                }
                disabled={tSaving}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="both">Web + Mobile (full cloud & mobile app)</option>
                <option value="mobile_only">Mobile Only (blocks web login & revokes web sessions)</option>
                <option value="web_only">Web Only (blocks mobile login & revokes mobile sessions)</option>
              </select>
              {tAccessMode !== tenant.accessMode && tAccessMode !== "both" && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {tAccessMode === "mobile_only"
                    ? "Saving revokes all active browser sessions immediately while keeping mobile devices signed in."
                    : "Saving revokes all active mobile app sessions immediately while keeping web browsers signed in."}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditTenantOpen(false)}
                disabled={tSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={tSaving}>
                {tSaving ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
