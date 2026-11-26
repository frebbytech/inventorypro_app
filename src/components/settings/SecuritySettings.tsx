
"use client";

import { useMemo, useState } from "react";
import { Mail, MessageSquare, Search, Shield } from "lucide-react";
import { toast } from "sonner";

import {
  bulkUpdateStaffTwoFactor,
  updateUserTwoFactor,
} from "@/actions/security";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { StaffTwoFactorAccount, TwoFactorMethod } from "@/types/globals";

interface SecuritySettingsProps {
  initialAccounts: StaffTwoFactorAccount[];
  emailConfigured: boolean;
  smsConfigured: boolean;
  loadError?: string | null;
}

type RoleFilter = "all" | "member" | "admin";
type StatusFilter = "all" | "enabled" | "disabled";
type BulkAction = "enable" | "disable";

/* -------------------------------------------------------------------------- */
/*  Helpers (module scope)                                                    */
/* -------------------------------------------------------------------------- */

const countFormat = new Intl.NumberFormat("en-GH");
const pluralize = (n: number, singular: string, plural = `${singular}s`) =>
  `${countFormat.format(n)} ${n === 1 ? singular : plural}`;

const displayName = (account: StaffTwoFactorAccount) => account.fullname || account.username;

function getInitials(account: StaffTwoFactorAccount): string {
  const first = account.firstname?.[0] ?? "";
  const last = account.lastname?.[0] ?? "";
  const combined = `${first}${last}`.trim();
  if (combined) return combined.toUpperCase();
  return (account.username.slice(0, 2) || "ST").toUpperCase();
}

interface Providers {
  emailConfigured: boolean;
  smsConfigured: boolean;
}

/** Whether a code could actually reach this person by the given method. */
function deliveryIssue(
  account: StaffTwoFactorAccount,
  method: TwoFactorMethod,
  { emailConfigured, smsConfigured }: Providers
): string | null {
  if (method === "sms") {
    if (!account.phonenumber) return "Add a phone number to their profile to use SMS codes.";
    if (!smsConfigured) return "SMS isn't set up yet. Configure it under API integration.";
  } else {
    if (!account.email) return "Add an email address to their profile to use email codes.";
    if (!emailConfigured) return "Email isn't set up yet. Configure it under API integration.";
  }
  return null;
}

function StatusText({ enabled }: { enabled: boolean }) {
  return (
    <span className="inline-flex w-20 items-center gap-1.5 text-sm text-muted-foreground">
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", enabled ? "bg-emerald-500" : "bg-muted-foreground/40")}
      />
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function SecuritySettings({
  initialAccounts,
  emailConfigured,
  smsConfigured,
  loadError,
}: SecuritySettingsProps) {
  const providers = useMemo<Providers>(
    () => ({ emailConfigured, smsConfigured }),
    [emailConfigured, smsConfigured]
  );

  const [accounts, setAccounts] = useState<StaffTwoFactorAccount[]>(initialAccounts);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pendingUserIds, setPendingUserIds] = useState<Record<string, boolean>>({});

  // The dialog's wording follows `bulkAction`, so that must outlive the dialog
  // closing. Resetting it to null on close made the text flip to the "disable"
  // copy for the duration of the fade-out.
  const [bulkAction, setBulkAction] = useState<BulkAction>("enable");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  const staffOnlyAccounts = useMemo(
    () => accounts.filter((a) => a.role === "member" && !a.isCurrentUser),
    [accounts]
  );

  // Enabling 2FA for someone whose codes can't reach them locks them out of
  // signing in, so bulk-enable only ever targets people who can receive a code.
  const enableTargets = useMemo(
    () =>
      staffOnlyAccounts.filter(
        (a) => !a.two_factor_enabled && !deliveryIssue(a, a.two_factor_method, providers)
      ),
    [staffOnlyAccounts, providers]
  );
  const enableBlockedCount = useMemo(
    () =>
      staffOnlyAccounts.filter(
        (a) => !a.two_factor_enabled && deliveryIssue(a, a.two_factor_method, providers)
      ).length,
    [staffOnlyAccounts, providers]
  );
  const disableTargets = useMemo(
    () => staffOnlyAccounts.filter((a) => a.two_factor_enabled),
    [staffOnlyAccounts]
  );

  const stats = useMemo(() => {
    const totalStaff = accounts.filter((a) => a.role === "member").length;
    const enabledStaff = accounts.filter((a) => a.role === "member" && a.two_factor_enabled).length;
    return { totalStaff, enabledStaff, disabledStaff: Math.max(0, totalStaff - enabledStaff) };
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return accounts.filter((account) => {
      if (roleFilter !== "all" && account.role !== roleFilter) return false;
      if (statusFilter === "enabled" && !account.two_factor_enabled) return false;
      if (statusFilter === "disabled" && account.two_factor_enabled) return false;
      if (!query) return true;

      return (
        (account.fullname ?? "").toLowerCase().includes(query) ||
        (account.username ?? "").toLowerCase().includes(query) ||
        (account.email ?? "").toLowerCase().includes(query) ||
        (account.phonenumber ?? "").toLowerCase().includes(query)
      );
    });
  }, [accounts, roleFilter, search, statusFilter]);

  function setPending(id: string, pending: boolean) {
    setPendingUserIds((prev) => {
      const next = { ...prev };
      if (pending) next[id] = true;
      else delete next[id];
      return next;
    });
  }

  async function handleToggleTwoFactor(account: StaffTwoFactorAccount, enabled: boolean) {
    if (pendingUserIds[account.id] || isBulkSubmitting) return;

    setPending(account.id, true);
    try {
      const result = await updateUserTwoFactor({
        userId: account.id,
        enabled,
        method: account.two_factor_method,
      });

      if (!result.success || !result.data) {
        toast.error("Couldn't update 2FA setting", {
          description: result.message || "Please try again.",
          position: "top-right",
        });
        return;
      }

      setAccounts((prev) => prev.map((item) => (item.id === account.id ? result.data! : item)));

      toast.success(
        enabled ? `2FA enabled for ${displayName(account)}` : `2FA disabled for ${displayName(account)}`,
        {
          description: enabled
            ? `Codes will be sent by ${result.data.two_factor_method === "sms" ? "SMS" : "email"}.`
            : undefined,
          position: "top-right",
        }
      );
    } catch {
      toast.error("Couldn't update 2FA setting", {
        description: "Check your connection and try again.",
        position: "top-right",
      });
    } finally {
      setPending(account.id, false);
    }
  }

  async function handleMethodChange(account: StaffTwoFactorAccount, method: TwoFactorMethod) {
    if (pendingUserIds[account.id] || isBulkSubmitting || account.two_factor_method === method) return;

    setPending(account.id, true);
    try {
      const result = await updateUserTwoFactor({
        userId: account.id,
        enabled: account.two_factor_enabled,
        method,
      });

      if (!result.success || !result.data) {
        toast.error("Couldn't update delivery method", {
          description: result.message || "Please try again.",
          position: "top-right",
        });
        return;
      }

      setAccounts((prev) => prev.map((item) => (item.id === account.id ? result.data! : item)));

      toast.success(`Delivery method updated for ${displayName(account)}`, {
        description: `Codes now go by ${method === "sms" ? "SMS" : "email"}.`,
        position: "top-right",
      });
    } catch {
      toast.error("Couldn't update delivery method", {
        description: "Check your connection and try again.",
        position: "top-right",
      });
    } finally {
      setPending(account.id, false);
    }
  }

  function openBulkDialog(action: BulkAction) {
    setBulkAction(action);
    setBulkOpen(true);
  }

  async function handleConfirmBulkAction() {
    if (isBulkSubmitting) return;

    const enable = bulkAction === "enable";
    const targets = enable ? enableTargets : disableTargets;
    const targetIds = targets.map((a) => a.id);

    if (targetIds.length === 0) {
      setBulkOpen(false);
      return;
    }

    setIsBulkSubmitting(true);
    try {
      const result = await bulkUpdateStaffTwoFactor({ userIds: targetIds, enabled: enable });

      if (!result.success || !result.data) {
        toast.error("Bulk update failed", {
          description: result.message || "Please try again.",
          position: "top-right",
        });
        return;
      }

      const skippedSet = new Set(result.data.skippedUsernames);
      const idSet = new Set(targetIds);
      const nowIso = new Date().toISOString();

      setAccounts((prev) =>
        prev.map((item) =>
          !idSet.has(item.id) || skippedSet.has(item.username)
            ? item
            : { ...item, two_factor_enabled: enable, two_factor_updated_at: nowIso }
        )
      );

      const { updatedCount, skippedUsernames } = result.data;
      toast.success(
        `2FA ${enable ? "enabled" : "disabled"} for ${pluralize(updatedCount, "staff account")}`,
        {
          description:
            skippedUsernames.length > 0
              ? `Skipped ${skippedUsernames.join(", ")}: missing contact details for their delivery method.`
              : undefined,
          position: "top-right",
        }
      );
      setBulkOpen(false);
    } catch {
      toast.error("Bulk update failed", {
        description: "Check your connection and try again.",
        position: "top-right",
      });
    } finally {
      setIsBulkSubmitting(false);
    }
  }

  const bulkTargetCount = bulkAction === "enable" ? enableTargets.length : disableTargets.length;
  const noProvider = !emailConfigured && !smsConfigured;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card" aria-labelledby="security-settings-title">
        <header className="flex flex-col gap-4 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="space-y-1">
            <h2 id="security-settings-title" className="text-base font-semibold tracking-tight">
              Two-factor authentication
            </h2>
            <p className="text-sm text-muted-foreground">
              Require staff to confirm each sign-in with a 6-digit one-time code.
            </p>
          </div>

          {staffOnlyAccounts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBulkSubmitting || enableTargets.length === 0}
                onClick={() => openBulkDialog("enable")}
              >
                Enable for all staff
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBulkSubmitting || disableTargets.length === 0}
                onClick={() => openBulkDialog("disable")}
              >
                Disable for all staff
              </Button>
            </div>
          )}
        </header>

        {/* Summary */}
        <dl className="grid grid-cols-1 gap-px border-b bg-border sm:grid-cols-3">
          <div className="bg-card px-5 py-4 sm:px-6">
            <dt className="text-sm font-medium text-muted-foreground">Staff accounts</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {countFormat.format(stats.totalStaff)}
            </dd>
          </div>
          <div className="bg-card px-5 py-4 sm:px-6">
            <dt className="text-sm font-medium text-muted-foreground">With 2FA on</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {countFormat.format(stats.enabledStaff)}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                of {countFormat.format(stats.totalStaff)}
              </span>
            </dd>
          </div>
          <div className="bg-card px-5 py-4 sm:px-6">
            <dt className="text-sm font-medium text-muted-foreground">Without 2FA</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {countFormat.format(stats.disabledStaff)}
            </dd>
          </div>
        </dl>

        {(!emailConfigured || !smsConfigured) && (
          <div className="border-b border-l-4 border-l-amber-500 px-5 py-3 text-sm sm:px-6">
            <p className="font-medium">
              {noProvider
                ? "No delivery method is set up"
                : !emailConfigured
                  ? "Email delivery isn't set up"
                  : "SMS delivery isn't set up"}
            </p>
            <p className="text-muted-foreground">
              {noProvider
                ? "Set up email (SMTP) or SMS (Arkessel) under API integration before turning 2FA on. Without one, staff can't receive codes and won't be able to sign in."
                : !emailConfigured
                  ? "Set up email (SMTP) under API integration to send 2FA codes by email. Until then, email can't be chosen for anyone."
                  : "Set up SMS (Arkessel) under API integration to send 2FA codes by SMS. Until then, SMS can't be chosen for anyone."}
            </p>
          </div>
        )}

        {loadError && (
          <div role="alert" className="border-b border-l-4 border-l-destructive px-5 py-3 text-sm text-destructive sm:px-6">
            {loadError}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="relative flex-1 sm:max-w-xs">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, username, email or phone"
              className="pl-9"
              aria-label="Search accounts"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={roleFilter} onValueChange={(value: RoleFilter) => setRoleFilter(value)}>
              <SelectTrigger className="w-36" aria-label="Filter by role">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                <SelectItem value="member">Staff only</SelectItem>
                <SelectItem value="admin">Admins only</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
              <SelectTrigger className="w-36" aria-label="Filter by 2FA status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="enabled">2FA on</SelectItem>
                <SelectItem value="disabled">2FA off</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Accounts */}
        {filteredAccounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center sm:px-6">
            <Shield aria-hidden className="size-8 text-muted-foreground/60" />
            <p className="text-sm font-medium">No matching accounts</p>
            <p className="text-sm text-muted-foreground">
              {accounts.length === 0
                ? "No staff accounts were found."
                : "Try clearing your search or changing the filters."}
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {filteredAccounts.map((account) => {
              const isBusy = Boolean(pendingUserIds[account.id]) || isBulkSubmitting;
              const issue = deliveryIssue(account, account.two_factor_method, providers);
              const emailBlocked = Boolean(deliveryIssue(account, "email", providers));
              const smsBlocked = Boolean(deliveryIssue(account, "sms", providers));

              return (
                <li
                  key={account.id}
                  className="flex flex-col gap-4 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      aria-hidden
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium"
                    >
                      {getInitials(account)}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-sm font-medium">{displayName(account)}</span>
                        <span className="text-sm text-muted-foreground">@{account.username}</span>
                        <Badge variant={account.role === "admin" ? "default" : "secondary"}>
                          {account.role === "admin" ? "Admin" : "Staff"}
                        </Badge>
                        {account.isCurrentUser && <Badge variant="outline">You</Badge>}
                      </div>

                      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>{account.email || "No email on file"}</span>
                        {account.phonenumber && <span>{account.phonenumber}</span>}
                      </p>

                      {issue && (
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          {account.two_factor_enabled
                            ? `Codes can't reach them right now. ${issue}`
                            : issue}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 sm:justify-end">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Send by</span>
                      <Select
                        value={account.two_factor_method}
                        disabled={isBusy}
                        onValueChange={(value: TwoFactorMethod) => handleMethodChange(account, value)}
                      >
                        <SelectTrigger
                          className="w-28"
                          aria-label={`2FA delivery method for ${displayName(account)}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* While 2FA is on, switching to a method that can't reach
                              this person would lock them out, so it isn't offered. */}
                          <SelectItem value="email" disabled={account.two_factor_enabled && emailBlocked}>
                            <span className="flex items-center gap-1.5">
                              <Mail aria-hidden className="size-3.5" />
                              Email
                            </span>
                          </SelectItem>
                          <SelectItem value="sms" disabled={account.two_factor_enabled && smsBlocked}>
                            <span className="flex items-center gap-1.5">
                              <MessageSquare aria-hidden className="size-3.5" />
                              SMS
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-3">
                      <StatusText enabled={account.two_factor_enabled} />
                      <Switch
                        checked={account.two_factor_enabled}
                        // Turning 2FA off is always allowed; turning it on is blocked
                        // while the person couldn't receive a code.
                        disabled={isBusy || (!account.two_factor_enabled && Boolean(issue))}
                        onCheckedChange={(checked) => handleToggleTwoFactor(account, checked)}
                        aria-label={`Two-factor authentication for ${displayName(account)}`}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AlertDialog open={bulkOpen} onOpenChange={(open) => !open && !isBulkSubmitting && setBulkOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === "enable" ? "Turn on 2FA for all staff?" : "Turn off 2FA for all staff?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === "enable"
                ? `Sign-in will require a one-time code for ${pluralize(bulkTargetCount, "staff account")}.${
                    enableBlockedCount > 0
                      ? ` ${pluralize(enableBlockedCount, "other account")} can't be included yet because their codes couldn't be delivered (missing contact details, or their delivery method isn't set up).`
                      : ""
                  }`
                : `This turns off two-factor verification for ${pluralize(bulkTargetCount, "staff account")}. Administrator accounts aren't changed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBulkSubmitting}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmBulkAction();
              }}
            >
              {isBulkSubmitting ? "Updating…" : bulkAction === "enable" ? "Turn on 2FA" : "Turn off 2FA"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}




// "use client";

// import { useMemo, useState } from "react";
// import {
//   AlertTriangle,
//   CheckCircle2,
//   Mail,
//   MessageSquare,
//   Search,
//   Shield,
//   ShieldAlert,
//   ShieldCheck,
//   Users,
// } from "lucide-react";
// import { toast } from "sonner";

// import {
//   bulkUpdateStaffTwoFactor,
//   updateUserTwoFactor,
// } from "@/actions/security";
// import {
//   AlertDialog,
//   AlertDialogAction,
//   AlertDialogCancel,
//   AlertDialogContent,
//   AlertDialogDescription,
//   AlertDialogFooter,
//   AlertDialogHeader,
//   AlertDialogTitle,
// } from "@/components/ui/alert-dialog";
// import { Badge } from "@/components/ui/badge";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import { Switch } from "@/components/ui/switch";
// import type { StaffTwoFactorAccount, TwoFactorMethod } from "@/types/globals";

// interface SecuritySettingsProps {
//   initialAccounts: StaffTwoFactorAccount[];
//   emailConfigured: boolean;
//   smsConfigured: boolean;
//   loadError?: string | null;
// }

// type RoleFilter = "all" | "member" | "admin";
// type StatusFilter = "all" | "enabled" | "disabled";

// function getInitials(account: StaffTwoFactorAccount): string {
//   const first = account.firstname?.[0] ?? "";
//   const last = account.lastname?.[0] ?? "";
//   const combined = `${first}${last}`.trim();
//   if (combined) return combined.toUpperCase();
//   return (account.username.slice(0, 2) || "ST").toUpperCase();
// }

// export default function SecuritySettings({
//   initialAccounts,
//   emailConfigured,
//   smsConfigured,
//   loadError,
// }: SecuritySettingsProps) {
//   const [accounts, setAccounts] =
//     useState<StaffTwoFactorAccount[]>(initialAccounts);
//   const [search, setSearch] = useState("");
//   const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
//   const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
//   const [pendingUserIds, setPendingUserIds] = useState<Record<string, boolean>>(
//     {},
//   );
//   const [bulkAction, setBulkAction] = useState<"enable" | "disable" | null>(
//     null,
//   );
//   const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

//   const staffOnlyAccounts = useMemo(
//     () => accounts.filter((a) => a.role === "member" && !a.isCurrentUser),
//     [accounts],
//   );

//   const stats = useMemo(() => {
//     const totalStaff = accounts.filter((a) => a.role === "member").length;
//     const enabledStaff = accounts.filter(
//       (a) => a.role === "member" && a.two_factor_enabled,
//     ).length;
//     const totalEnabled = accounts.filter((a) => a.two_factor_enabled).length;
//     return {
//       totalAccounts: accounts.length,
//       totalStaff,
//       enabledStaff,
//       disabledStaff: Math.max(0, totalStaff - enabledStaff),
//       totalEnabled,
//     };
//   }, [accounts]);

//   const filteredAccounts = useMemo(() => {
//     const query = search.trim().toLowerCase();
//     return accounts.filter((account) => {
//       if (roleFilter !== "all" && account.role !== roleFilter) {
//         return false;
//       }
//       if (statusFilter === "enabled" && !account.two_factor_enabled) {
//         return false;
//       }
//       if (statusFilter === "disabled" && account.two_factor_enabled) {
//         return false;
//       }
//       if (!query) return true;

//       return (
//         (account.fullname ?? "").toLowerCase().includes(query) ||
//         (account.username ?? "").toLowerCase().includes(query) ||
//         (account.email ?? "").toLowerCase().includes(query) ||
//         (account.phonenumber ?? "").toLowerCase().includes(query)
//       );
//     });
//   }, [accounts, roleFilter, search, statusFilter]);

//   async function handleToggleTwoFactor(
//     account: StaffTwoFactorAccount,
//     enabled: boolean,
//   ) {
//     if (pendingUserIds[account.id]) return;

//     setPendingUserIds((prev) => ({ ...prev, [account.id]: true }));
//     try {
//       const result = await updateUserTwoFactor({
//         userId: account.id,
//         enabled,
//         method: account.two_factor_method,
//       });

//       if (!result.success || !result.data) {
//         toast.error("Couldn't update 2FA setting", {
//           description: result.message || "Please try again.",
//           position: "top-right",
//         });
//         return;
//       }

//       setAccounts((prev) =>
//         prev.map((item) => (item.id === account.id ? result.data! : item)),
//       );

//       toast.success(
//         enabled
//           ? `2FA enabled for ${account.fullname}`
//           : `2FA disabled for ${account.fullname}`,
//         {
//           description: enabled
//             ? `Verification codes will be sent via ${result.data.two_factor_method === "sms" ? "SMS" : "email"}.`
//             : undefined,
//           position: "top-right",
//         },
//       );
//     } catch {
//       toast.error("Couldn't update 2FA setting", {
//         description: "Check your connection and try again.",
//         position: "top-right",
//       });
//     } finally {
//       setPendingUserIds((prev) => {
//         const next = { ...prev };
//         delete next[account.id];
//         return next;
//       });
//     }
//   }

//   async function handleMethodChange(
//     account: StaffTwoFactorAccount,
//     method: TwoFactorMethod,
//   ) {
//     if (pendingUserIds[account.id] || account.two_factor_method === method) {
//       return;
//     }

//     setPendingUserIds((prev) => ({ ...prev, [account.id]: true }));
//     try {
//       const result = await updateUserTwoFactor({
//         userId: account.id,
//         enabled: account.two_factor_enabled,
//         method,
//       });

//       if (!result.success || !result.data) {
//         toast.error("Couldn't update verification method", {
//           description: result.message || "Please try again.",
//           position: "top-right",
//         });
//         return;
//       }

//       setAccounts((prev) =>
//         prev.map((item) => (item.id === account.id ? result.data! : item)),
//       );

//       toast.success(`2FA method updated for ${account.fullname}`, {
//         description: `Delivery channel set to ${method === "sms" ? "SMS" : "Email"}.`,
//         position: "top-right",
//       });
//     } catch {
//       toast.error("Couldn't update verification method", {
//         description: "Check your connection and try again.",
//         position: "top-right",
//       });
//     } finally {
//       setPendingUserIds((prev) => {
//         const next = { ...prev };
//         delete next[account.id];
//         return next;
//       });
//     }
//   }

//   async function handleConfirmBulkAction() {
//     if (!bulkAction || isBulkSubmitting) return;

//     const enable = bulkAction === "enable";
//     const targetIds = staffOnlyAccounts.map((a) => a.id);

//     if (targetIds.length === 0) {
//       setBulkAction(null);
//       return;
//     }

//     setIsBulkSubmitting(true);
//     try {
//       const result = await bulkUpdateStaffTwoFactor({
//         userIds: targetIds,
//         enabled: enable,
//       });

//       if (!result.success || !result.data) {
//         toast.error("Bulk update failed", {
//           description: result.message || "Please try again.",
//           position: "top-right",
//         });
//         return;
//       }

//       const skippedSet = new Set(result.data.skippedUsernames);
//       const nowIso = new Date().toISOString();

//       setAccounts((prev) =>
//         prev.map((item) => {
//           if (!targetIds.includes(item.id) || skippedSet.has(item.username)) {
//             return item;
//           }
//           return {
//             ...item,
//             two_factor_enabled: enable,
//             two_factor_updated_at: nowIso,
//           };
//         }),
//       );

//       const { updatedCount, skippedUsernames } = result.data;
//       toast.success(
//         enable
//           ? `2FA enabled for ${updatedCount} staff account${updatedCount === 1 ? "" : "s"}`
//           : `2FA disabled for ${updatedCount} staff account${updatedCount === 1 ? "" : "s"}`,
//         {
//           description:
//             skippedUsernames.length > 0
//               ? `Skipped ${skippedUsernames.join(", ")} (missing contact details for selected 2FA method).`
//               : undefined,
//           position: "top-right",
//         },
//       );
//       setBulkAction(null);
//     } catch {
//       toast.error("Bulk update failed", {
//         description: "Check your connection and try again.",
//         position: "top-right",
//       });
//     } finally {
//       setIsBulkSubmitting(false);
//     }
//   }

//   const bulkTargetCount =
//     bulkAction === "enable"
//       ? staffOnlyAccounts.filter((a) => !a.two_factor_enabled).length
//       : staffOnlyAccounts.filter((a) => a.two_factor_enabled).length;

//   return (
//     <div className="space-y-6">
//       <section
//         className="rounded-xl border bg-card"
//         aria-labelledby="security-settings-title"
//       >
//         <header className="flex flex-col gap-4 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
//           <div className="space-y-1">
//             <div className="flex items-center gap-2">
//               <Shield className="h-4 w-4 text-primary" />
//               <h2
//                 id="security-settings-title"
//                 className="text-base font-semibold tracking-tight"
//               >
//                 Two-Factor Authentication (2FA)
//               </h2>
//             </div>
//             <p className="text-sm text-muted-foreground">
//               Manage whether staff accounts must verify sign-ins with a 6-digit
//               one-time code.
//             </p>
//           </div>

//           {staffOnlyAccounts.length > 0 && (
//             <div className="flex flex-wrap items-center gap-2">
//               <Button
//                 type="button"
//                 variant="outline"
//                 size="sm"
//                 disabled={
//                   isBulkSubmitting ||
//                   staffOnlyAccounts.every((a) => a.two_factor_enabled)
//                 }
//                 onClick={() => setBulkAction("enable")}
//               >
//                 Enable all staff
//               </Button>
//               <Button
//                 type="button"
//                 variant="outline"
//                 size="sm"
//                 disabled={
//                   isBulkSubmitting ||
//                   staffOnlyAccounts.every((a) => !a.two_factor_enabled)
//                 }
//                 onClick={() => setBulkAction("disable")}
//               >
//                 Disable all staff
//               </Button>
//             </div>
//           )}
//         </header>

//         {/* Summary metrics */}
//         <div className="grid gap-4 border-b bg-muted/20 px-5 py-4 sm:grid-cols-3 sm:px-6">
//           <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3">
//             <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
//               <Users className="h-4 w-4" />
//             </div>
//             <div>
//               <p className="text-xs font-medium text-muted-foreground">
//                 Staff Accounts
//               </p>
//               <p className="text-lg font-semibold tabular-nums">
//                 {stats.totalStaff}
//               </p>
//             </div>
//           </div>

//           <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3">
//             <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
//               <ShieldCheck className="h-4 w-4" />
//             </div>
//             <div>
//               <p className="text-xs font-medium text-muted-foreground">
//                 Staff with 2FA Enabled
//               </p>
//               <p className="text-lg font-semibold tabular-nums">
//                 {stats.enabledStaff}
//                 <span className="ml-1.5 text-xs font-normal text-muted-foreground">
//                   / {stats.totalStaff}
//                 </span>
//               </p>
//             </div>
//           </div>

//           <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3">
//             <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
//               <ShieldAlert className="h-4 w-4" />
//             </div>
//             <div>
//               <p className="text-xs font-medium text-muted-foreground">
//                 Staff without 2FA
//               </p>
//               <p className="text-lg font-semibold tabular-nums">
//                 {stats.disabledStaff}
//               </p>
//             </div>
//           </div>
//         </div>

//         {/* Delivery channel notice if SMTP/SMS is not configured */}
//         {(!emailConfigured || !smsConfigured) && (
//           <div className="flex items-start gap-3 border-b bg-amber-500/5 px-5 py-3.5 text-sm sm:px-6">
//             <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
//             <div className="space-y-0.5 text-muted-foreground">
//               <p className="font-medium text-foreground">
//                 Delivery channel configuration status
//               </p>
//               <p>
//                 {!emailConfigured && !smsConfigured
//                   ? "Neither Email (SMTP) nor SMS (Arkessel) is configured yet. Set up at least one provider under the API Integration tab so staff can receive 2FA codes when signing in."
//                   : !emailConfigured
//                     ? "Email (SMTP) is not configured yet. Configure it in the API Integration tab to deliver 2FA codes via email."
//                     : "SMS (Arkessel) is not configured yet. Configure it in the API Integration tab to deliver 2FA codes via SMS."}
//               </p>
//             </div>
//           </div>
//         )}

//         {loadError && (
//           <div className="border-b bg-destructive/10 px-5 py-3 text-sm text-destructive sm:px-6">
//             {loadError}
//           </div>
//         )}

//         {/* Filter toolbar */}
//         <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
//           <div className="relative flex-1 sm:max-w-xs">
//             <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
//             <Input
//               value={search}
//               onChange={(e) => setSearch(e.target.value)}
//               placeholder="Search staff by name, username, or email…"
//               className="pl-9"
//               aria-label="Search staff accounts"
//             />
//           </div>

//           <div className="flex flex-wrap items-center gap-2">
//             <Select
//               value={roleFilter}
//               onValueChange={(value: RoleFilter) => setRoleFilter(value)}
//             >
//               <SelectTrigger className="w-36" aria-label="Filter by role">
//                 <SelectValue placeholder="All roles" />
//               </SelectTrigger>
//               <SelectContent>
//                 <SelectItem value="all">All accounts</SelectItem>
//                 <SelectItem value="member">Staff only</SelectItem>
//                 <SelectItem value="admin">Admins only</SelectItem>
//               </SelectContent>
//             </Select>

//             <Select
//               value={statusFilter}
//               onValueChange={(value: StatusFilter) => setStatusFilter(value)}
//             >
//               <SelectTrigger className="w-36" aria-label="Filter by 2FA status">
//                 <SelectValue placeholder="All statuses" />
//               </SelectTrigger>
//               <SelectContent>
//                 <SelectItem value="all">All statuses</SelectItem>
//                 <SelectItem value="enabled">2FA enabled</SelectItem>
//                 <SelectItem value="disabled">2FA disabled</SelectItem>
//               </SelectContent>
//             </Select>
//           </div>
//         </div>

//         {/* Staff account rows */}
//         {filteredAccounts.length === 0 ? (
//           <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center sm:px-6">
//             <Shield className="h-8 w-8 text-muted-foreground/60" />
//             <p className="text-sm font-medium">No matching accounts</p>
//             <p className="text-sm text-muted-foreground">
//               {accounts.length === 0
//                 ? "No staff accounts were found."
//                 : "Try clearing your search or changing the filters."}
//             </p>
//           </div>
//         ) : (
//           <ul className="divide-y">
//             {filteredAccounts.map((account) => {
//               const isPending = Boolean(pendingUserIds[account.id]);
//               const missingContact =
//                 account.two_factor_method === "sms"
//                   ? !account.phonenumber
//                   : !account.email;
//               const providerMissing =
//                 account.two_factor_method === "sms"
//                   ? !smsConfigured
//                   : !emailConfigured;

//               return (
//                 <li
//                   key={account.id}
//                   className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-muted/20 sm:px-6 lg:flex-row lg:items-center lg:justify-between"
//                 >
//                   {/* Staff identity */}
//                   <div className="flex min-w-0 items-start gap-3.5">
//                     <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
//                       {getInitials(account)}
//                     </div>

//                     <div className="min-w-0 space-y-1">
//                       <div className="flex flex-wrap items-center gap-2">
//                         <span className="truncate text-sm font-medium text-foreground">
//                           {account.fullname}
//                         </span>
//                         <span className="text-xs text-muted-foreground">
//                           @{account.username}
//                         </span>
//                         <Badge
//                           variant={
//                             account.role === "admin" ? "default" : "secondary"
//                           }
//                           className="text-xs font-medium"
//                         >
//                           {account.role === "admin" ? "Admin" : "Staff"}
//                         </Badge>
//                         {account.isCurrentUser && (
//                           <Badge variant="outline" className="text-xs">
//                             You
//                           </Badge>
//                         )}
//                       </div>

//                       <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
//                         <span>{account.email || "No email on file"}</span>
//                         {account.phonenumber && (
//                           <span>{account.phonenumber}</span>
//                         )}
//                       </div>

//                       {missingContact && (
//                         <p className="text-xs text-amber-600 dark:text-amber-400">
//                           {account.two_factor_method === "sms"
//                             ? "Add a phone number on the employee profile before enabling SMS 2FA."
//                             : "Add an email address on the employee profile before enabling Email 2FA."}
//                         </p>
//                       )}

//                       {!missingContact &&
//                         account.two_factor_enabled &&
//                         providerMissing && (
//                           <p className="text-xs text-amber-600 dark:text-amber-400">
//                             {account.two_factor_method === "sms"
//                               ? "SMS provider is not configured in API Integration."
//                               : "SMTP email is not configured in API Integration."}
//                           </p>
//                         )}
//                     </div>
//                   </div>

//                   {/* Method selector, status badge & toggle */}
//                   <div className="flex flex-wrap items-center justify-between gap-4 sm:justify-end">
//                     <div className="flex items-center gap-2">
//                       <span className="text-xs text-muted-foreground">
//                         Channel
//                       </span>
//                       <Select
//                         value={account.two_factor_method}
//                         disabled={isPending}
//                         onValueChange={(value: TwoFactorMethod) =>
//                           handleMethodChange(account, value)
//                         }
//                       >
//                         <SelectTrigger
//                           className="h-8 w-28 text-xs"
//                           aria-label={`2FA delivery method for ${account.fullname}`}
//                         >
//                           <SelectValue />
//                         </SelectTrigger>
//                         <SelectContent>
//                           <SelectItem value="email">
//                             <span className="flex items-center gap-1.5">
//                               <Mail className="h-3.5 w-3.5" />
//                               Email
//                             </span>
//                           </SelectItem>
//                           <SelectItem value="sms">
//                             <span className="flex items-center gap-1.5">
//                               <MessageSquare className="h-3.5 w-3.5" />
//                               SMS
//                             </span>
//                           </SelectItem>
//                         </SelectContent>
//                       </Select>
//                     </div>

//                     <div className="flex items-center gap-3">
//                       <Badge
//                         variant={
//                           account.two_factor_enabled ? "default" : "outline"
//                         }
//                         className={
//                           account.two_factor_enabled
//                             ? "gap-1 bg-emerald-600 text-white hover:bg-emerald-600/90"
//                             : "text-muted-foreground"
//                         }
//                       >
//                         {account.two_factor_enabled && (
//                           <CheckCircle2 className="h-3 w-3" />
//                         )}
//                         {account.two_factor_enabled ? "Enabled" : "Disabled"}
//                       </Badge>

//                       <Switch
//                         checked={account.two_factor_enabled}
//                         disabled={isPending}
//                         onCheckedChange={(checked) =>
//                           handleToggleTwoFactor(account, checked)
//                         }
//                         aria-label={`Toggle two-factor authentication for ${account.fullname}`}
//                       />
//                     </div>
//                   </div>
//                 </li>
//               );
//             })}
//           </ul>
//         )}
//       </section>

//       <AlertDialog
//         open={bulkAction !== null}
//         onOpenChange={(open) => !open && !isBulkSubmitting && setBulkAction(null)}
//       >
//         <AlertDialogContent>
//           <AlertDialogHeader>
//             <AlertDialogTitle>
//               {bulkAction === "enable"
//                 ? "Enable 2FA for all staff accounts?"
//                 : "Disable 2FA for all staff accounts?"}
//             </AlertDialogTitle>
//             <AlertDialogDescription>
//               {bulkAction === "enable"
//                 ? `This will require two-factor verification on sign-in for ${bulkTargetCount} staff account${bulkTargetCount === 1 ? "" : "s"} (accounts missing contact details for their selected channel will be skipped).`
//                 : `This will turn off two-factor verification for ${bulkTargetCount} staff account${bulkTargetCount === 1 ? "" : "s"}. Administrator accounts will not be changed.`}
//             </AlertDialogDescription>
//           </AlertDialogHeader>
//           <AlertDialogFooter>
//             <AlertDialogCancel disabled={isBulkSubmitting}>
//               Cancel
//             </AlertDialogCancel>
//             <AlertDialogAction
//               disabled={isBulkSubmitting}
//               onClick={(e) => {
//                 e.preventDefault();
//                 handleConfirmBulkAction();
//               }}
//             >
//               {isBulkSubmitting
//                 ? "Updating…"
//                 : bulkAction === "enable"
//                   ? "Enable 2FA"
//                   : "Disable 2FA"}
//             </AlertDialogAction>
//           </AlertDialogFooter>
//         </AlertDialogContent>
//       </AlertDialog>
//     </div>
//   );
// }
