"use client";

import { useId, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Mail, Search, Smartphone, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { getRecipientsForGroup, sendBroadcastMessage } from "@/actions/messages";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  BroadcastChannel,
  BroadcastMessage,
  BroadcastRecipient,
  RecipientGroup,
  Settings,
} from "@/types/globals";

interface MessagesClientProps {
  settings: Settings | null;
  initialHistory: BroadcastMessage[];
  initialSuppliers: BroadcastRecipient[];
  initialCustomers: BroadcastRecipient[];
  initialEmployees: BroadcastRecipient[];
}

/* -------------------------------------------------------------------------- */
/*  Static config & pure helpers (module scope)                               */
/* -------------------------------------------------------------------------- */

const GROUP_ORDER: RecipientGroup[] = ["employees", "customers", "suppliers"];
const CHANNEL_ORDER: BroadcastChannel[] = ["in_app", "email", "sms"];

const GROUP_LABELS: Record<RecipientGroup, string> = {
  employees: "Employees",
  customers: "Customers",
  suppliers: "Suppliers",
};
const GROUP_SINGULAR: Record<RecipientGroup, string> = {
  employees: "employee",
  customers: "customer",
  suppliers: "supplier",
};
const CHANNEL_LABELS: Record<BroadcastChannel, string> = {
  in_app: "In-app",
  email: "Email",
  sms: "SMS",
};
const CHANNEL_ICONS: Record<BroadcastChannel, LucideIcon> = {
  in_app: Bell,
  email: Mail,
  sms: Smartphone,
};
const MISSING_LABELS: Record<BroadcastChannel, string> = {
  in_app: "No app access",
  email: "No valid email",
  sms: "No valid phone",
};

// Fixed locales avoid server/client hydration mismatches.
const countFormat = new Intl.NumberFormat("en-GH");
const dateTimeFormat = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" });

const formatCount = (n: number) => countFormat.format(n);
const pluralize = (n: number, singular: string, plural = `${singular}s`) =>
  `${formatCount(n)} ${n === 1 ? singular : plural}`;

function DateTime({ value }: { value: string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>Unknown</span>;
  // The server and the browser can be in different timezones.
  return (
    <time dateTime={date.toISOString()} suppressHydrationWarning>
      {dateTimeFormat.format(date)}
    </time>
  );
}

interface ChannelFlags {
  email: boolean;
  sms: boolean;
  push: boolean;
}

const OFF_IN_SETTINGS = "Turned off in notification settings";

function getAvailability(
  channel: BroadcastChannel,
  group: RecipientGroup,
  flags: ChannelFlags
): { allowed: boolean; reason: string } {
  switch (channel) {
    case "email":
      return flags.email ? { allowed: true, reason: "" } : { allowed: false, reason: OFF_IN_SETTINGS };
    case "sms":
      return flags.sms ? { allowed: true, reason: "" } : { allowed: false, reason: OFF_IN_SETTINGS };
    case "in_app":
      if (group !== "employees") return { allowed: false, reason: "Employees only" };
      return flags.push ? { allowed: true, reason: "" } : { allowed: false, reason: OFF_IN_SETTINGS };
  }
}

/** Keeps the preferred channel if it's usable for this group, otherwise the first one that is. */
function pickChannel(
  group: RecipientGroup,
  flags: ChannelFlags,
  preferred?: BroadcastChannel
): BroadcastChannel {
  if (preferred && getAvailability(preferred, group, flags).allowed) return preferred;
  return CHANNEL_ORDER.find((c) => getAvailability(c, group, flags).allowed) ?? "email";
}

const canReceive = (r: BroadcastRecipient, channel: BroadcastChannel) =>
  channel === "email" ? r.hasValidEmail : channel === "sms" ? r.hasValidPhone : r.canReceiveInApp;

/* -------------------------------------------------------------------------- */
/*  Small building blocks                                                     */
/* -------------------------------------------------------------------------- */

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 px-5 py-5 sm:px-6">
      <div className="space-y-1">
        <p id={id} className="text-sm font-medium">
          {title}
        </p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function ChoiceOption({
  id,
  name,
  value,
  checked,
  disabled,
  onSelect,
  icon: Icon,
  label,
  hint,
}: {
  id: string;
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon?: LucideIcon;
  label: string;
  hint?: string;
}) {
  return (
    <label className={cn("block", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="peer sr-only"
      />
      <span className="flex h-full flex-col gap-0.5 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/40 peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary/30 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:opacity-50 peer-disabled:hover:bg-transparent">
        <span className="flex items-center gap-2 text-sm font-medium">
          {Icon && <Icon aria-hidden className="size-4 text-muted-foreground" />}
          {label}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

const linkClass =
  "rounded-sm font-medium text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/* -------------------------------------------------------------------------- */
/*  Recipients panel                                                          */
/* -------------------------------------------------------------------------- */

function RecipientsPanel({
  recipients,
  channel,
  groupLabel,
  selectedIds,
  onSelectedIdsChange,
  isLoading,
  audience,
}: {
  recipients: BroadcastRecipient[];
  channel: BroadcastChannel;
  groupLabel: string;
  selectedIds: Set<string>;
  onSelectedIdsChange: (next: Set<string>) => void;
  isLoading: boolean;
  audience: { size: number; eligible: number };
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.phonenumber?.includes(q) ||
        r.company_name?.toLowerCase().includes(q)
    );
  }, [recipients, query]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const someSelected = filtered.some((r) => selectedIds.has(r.id));

  function toggle(id: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedIdsChange(next);
  }

  return (
    <section aria-label="Recipients" className="rounded-xl border bg-card">
      <header className="space-y-3 border-b px-5 py-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Recipients</h3>
          <p className="text-sm text-muted-foreground">
            {selectedIds.size > 0
              ? `${pluralize(selectedIds.size, "person", "people")} selected`
              : `Everyone in ${groupLabel.toLowerCase()}, unless you pick people.`}
          </p>
        </div>

        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label={`Search ${groupLabel.toLowerCase()}`}
            placeholder="Search by name, email or phone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </header>

      {isLoading ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">Loading recipients…</p>
      ) : filtered.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          {query.trim() ? `Nobody matches “${query.trim()}”.` : `No ${groupLabel.toLowerCase()} yet.`}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2">
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(checked) =>
                  onSelectedIdsChange(
                    checked === true ? new Set(filtered.map((r) => r.id)) : new Set()
                  )
                }
              />
              Select all {formatCount(filtered.length)}
            </label>
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => onSelectedIdsChange(new Set())}
                className={cn(linkClass, "text-sm")}
              >
                Clear
              </button>
            )}
          </div>

          <div
            role="region"
            aria-label={`${groupLabel} list`}
            tabIndex={0}
            className="max-h-80 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <ul className="divide-y">
              {filtered.map((r, index) => (
                // Index in the key: ids aren't guaranteed unique in this data.
                <li key={`${r.id}-${index}`}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                    <Checkbox
                      checked={selectedIds.has(r.id)}
                      onCheckedChange={(checked) => toggle(r.id, checked === true)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {r.email || r.phonenumber || "No contact details"}
                      </span>
                    </span>
                    {!canReceive(r, channel) && (
                      <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
                        {MISSING_LABELS[channel]}
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <footer className="border-t px-5 py-3 text-sm text-muted-foreground">
        <span className="tabular-nums text-foreground">
          {formatCount(audience.eligible)} of {formatCount(audience.size)}
        </span>{" "}
        can receive {CHANNEL_LABELS[channel].toLowerCase()}
      </footer>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Preview                                                                   */
/* -------------------------------------------------------------------------- */

function BroadcastPreview({
  channel,
  group,
  subject,
  content,
}: {
  channel: BroadcastChannel;
  group: RecipientGroup;
  subject: string;
  content: string;
}) {
  const body = content.trim();
  const title = subject.trim();
  const empty = (text: string) => <span className="text-muted-foreground">{text}</span>;

  return (
    <section aria-label="Message preview" className="rounded-xl border bg-card">
      <header className="border-b px-5 py-4">
        <h3 className="text-sm font-medium">Preview</h3>
        <p className="text-sm text-muted-foreground">
          How it will look to {GROUP_LABELS[group].toLowerCase()}.
        </p>
      </header>

      <div className="p-5">
        {channel === "sms" && (
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm break-words whitespace-pre-wrap text-primary-foreground">
            {body || <span className="opacity-70">Your text message appears here.</span>}
          </div>
        )}

        {channel === "email" && (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="border-b pb-3 text-sm font-medium">
              {title || empty("Subject line")}
            </p>
            <p className="min-h-12 text-sm leading-relaxed break-words whitespace-pre-wrap">
              {body || empty("Your email appears here.")}
            </p>
          </div>
        )}

        {channel === "in_app" && (
          <div className="space-y-1 rounded-lg border p-4">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-sm font-medium">{title || "Announcement"}</p>
              <span className="shrink-0 text-xs text-muted-foreground">Just now</span>
            </div>
            <p className="text-sm break-words whitespace-pre-wrap text-muted-foreground">
              {body || "Your notification appears here."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  History                                                                   */
/* -------------------------------------------------------------------------- */

function HistoryPanel({ history }: { history: BroadcastMessage[] }) {
  const [channelFilter, setChannelFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [selected, setSelected] = useState<BroadcastMessage | null>(null);

  const filtered = useMemo(
    () =>
      history.filter(
        (item) =>
          (channelFilter === "all" || item.channel === channelFilter) &&
          (groupFilter === "all" || item.recipient_group === groupFilter)
      ),
    [history, channelFilter, groupFilter]
  );

  return (
    <>
      <section aria-label="Broadcast history" className="rounded-xl border bg-card">
        <header className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight">History</h2>
            <p className="text-sm text-muted-foreground">Everything sent by SMS, email and in-app.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger aria-label="Filter by channel" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                {CHANNEL_ORDER.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CHANNEL_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger aria-label="Filter by audience" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All audiences</SelectItem>
                {GROUP_ORDER.map((g) => (
                  <SelectItem key={g} value={g}>
                    {GROUP_LABELS[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        {filtered.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            {history.length === 0 ? "Nothing has been sent yet." : "No broadcasts match these filters."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5 sm:pl-6">Sent</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="text-right">Recipients</TableHead>
                <TableHead>Sent by</TableHead>
                <TableHead className="pr-5 text-right sm:pr-6">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="pl-5 whitespace-nowrap text-muted-foreground sm:pl-6">
                    <DateTime value={item.created_at} />
                  </TableCell>
                  <TableCell>{CHANNEL_LABELS[item.channel]}</TableCell>
                  <TableCell>{GROUP_LABELS[item.recipient_group]}</TableCell>
                  <TableCell className="max-w-[18rem]">
                    <p className="truncate font-medium">{item.subject || "No subject"}</p>
                    <p className="truncate text-muted-foreground">{item.content}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(item.recipient_count)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.sender_name}</TableCell>
                  <TableCell className="pr-5 text-right sm:pr-6">
                    <Button variant="ghost" size="sm" onClick={() => setSelected(item)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-[520px]">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.subject || "Broadcast details"}</DialogTitle>
                <DialogDescription>
                  Sent <DateTime value={selected.created_at} /> by {selected.sender_name}
                </DialogDescription>
              </DialogHeader>

              <dl className="divide-y border-y">
                <DetailRow label="Channel">{CHANNEL_LABELS[selected.channel]}</DetailRow>
                <DetailRow label="To">{GROUP_LABELS[selected.recipient_group]}</DetailRow>
                <DetailRow label="Recipients">{pluralize(selected.recipient_count, "person", "people")}</DetailRow>
              </dl>

              <p className="max-h-60 overflow-y-auto rounded-lg bg-muted/40 p-3 text-sm leading-relaxed break-words whitespace-pre-wrap">
                {selected.content}
              </p>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export default function MessagesClient({
  settings,
  initialHistory,
  initialSuppliers,
  initialCustomers,
  initialEmployees,
}: MessagesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const groupLabelId = useId();
  const channelLabelId = useId();

  const flags = useMemo<ChannelFlags>(
    () => ({
      email: Boolean(settings?.notification_email),
      sms: Boolean(settings?.notification_sms),
      push: Boolean(settings?.notification_push),
    }),
    [settings]
  );

  // Compose state
  const [group, setGroup] = useState<RecipientGroup>("employees");
  const [channel, setChannel] = useState<BroadcastChannel>(() =>
    pickChannel("employees", flags, "in_app")
  );
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [recipientsMap, setRecipientsMap] = useState<Record<RecipientGroup, BroadcastRecipient[]>>({
    suppliers: initialSuppliers,
    customers: initialCustomers,
    employees: initialEmployees,
  });
  const [loadingGroup, setLoadingGroup] = useState<RecipientGroup | null>(null);

  const groupRecipients = recipientsMap[group];
  const hasSubject = channel !== "sms";

  // No selection means everyone in the group.
  const audience = useMemo(() => {
    const pool =
      selectedIds.size > 0 ? groupRecipients.filter((r) => selectedIds.has(r.id)) : groupRecipients;
    return { size: pool.length, eligible: pool.filter((r) => canReceive(r, channel)).length };
  }, [groupRecipients, selectedIds, channel]);

  const availability = getAvailability(channel, group, flags);

  const blocker = !availability.allowed
    ? `${CHANNEL_LABELS[channel]}: ${availability.reason.toLowerCase()}.`
    : channel === "email" && !subject.trim()
      ? "Add a subject line."
      : !content.trim()
        ? "Write a message."
        : audience.eligible === 0
          ? `Nobody selected can receive ${CHANNEL_LABELS[channel].toLowerCase()}.`
          : null;

  async function handleGroupChange(next: RecipientGroup) {
    if (next === group) return;

    setGroup(next);
    setSelectedIds(new Set());
    setChannel((current) => pickChannel(next, flags, current));

    if (recipientsMap[next].length > 0) return;

    setLoadingGroup(next);
    try {
      const res = await getRecipientsForGroup(next);
      if (res.success && res.data) {
        const data = res.data;
        setRecipientsMap((prev) => ({ ...prev, [next]: data }));
      } else {
        toast.error("Couldn't load recipients", { description: res.message });
      }
    } catch {
      toast.error("Couldn't load recipients", { description: "Check your connection and try again." });
    } finally {
      setLoadingGroup((current) => (current === next ? null : current));
    }
  }

  function confirmSend() {
    setConfirmOpen(false);
    startTransition(async () => {
      try {
        const res = await sendBroadcastMessage({
          recipientGroup: group,
          channel,
          // Don't send a leftover subject with an SMS.
          subject: hasSubject ? subject.trim() : "",
          content,
          recipientIds: Array.from(selectedIds),
        });

        if (res.success && res.data) {
          toast.success(`Sent to ${pluralize(res.data.recipientCount, GROUP_SINGULAR[group])}`, {
            position: "top-right",
          });
          setContent("");
          setSubject("");
          setSelectedIds(new Set());
          router.refresh();
        } else {
          toast.error("Couldn't send broadcast", {
            description: res.message || "Try again in a moment.",
            position: "top-right",
          });
        }
      } catch {
        toast.error("Couldn't send broadcast", {
          description: "Check your connection and try again.",
          position: "top-right",
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="compose" className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className='w-fit'>
            <TabsTrigger value="compose">Compose</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* <Button asChild variant="outline" size="sm">
            <Link href="/admin/settings">Notification settings</Link>
          </Button> */}
        </div>

        {/* Compose */}
        <TabsContent value="compose">
          <div className="grid gap-6 lg:grid-cols-12">
            <section aria-label="Compose broadcast" className="self-start rounded-xl border bg-card lg:col-span-7">
              <div className="divide-y">
                <Section id={groupLabelId} title="Send to" description="Who should receive this message.">
                  <div role="radiogroup" aria-labelledby={groupLabelId} className="grid grid-cols-3 gap-3">
                    {GROUP_ORDER.map((g) => (
                      <ChoiceOption
                        key={g}
                        id={`select-group-${g}`}
                        name="recipient-group"
                        value={g}
                        checked={group === g}
                        onSelect={() => handleGroupChange(g)}
                        label={GROUP_LABELS[g]}
                        hint={pluralize(recipientsMap[g].length, "contact")}
                      />
                    ))}
                  </div>
                </Section>

                <Section
                  id={channelLabelId}
                  title="Channel"
                  description={
                    <>
                      Channels follow your{" "}
                      <Link href="/admin/settings" className={linkClass}>
                        notification settings
                      </Link>
                      .
                    </>
                  }
                >
                  <div role="radiogroup" aria-labelledby={channelLabelId} className="grid grid-cols-3 gap-3">
                    {CHANNEL_ORDER.map((c) => {
                      const { allowed, reason } = getAvailability(c, group, flags);
                      return (
                        <ChoiceOption
                          key={c}
                          id={`select-channel-${c.replace("_", "-")}`}
                          name="broadcast-channel"
                          value={c}
                          checked={channel === c}
                          disabled={!allowed}
                          onSelect={() => setChannel(c)}
                          icon={CHANNEL_ICONS[c]}
                          label={CHANNEL_LABELS[c]}
                          hint={allowed ? (c === "in_app" ? "Employees only" : undefined) : reason}
                        />
                      );
                    })}
                  </div>
                </Section>

                <div className="space-y-4 px-5 py-5 sm:px-6">
                  {hasSubject && (
                    <div className="space-y-2">
                      <Label htmlFor="broadcast-subject">
                        Subject{" "}
                        {channel === "in_app" && (
                          <span className="font-normal text-muted-foreground">Optional</span>
                        )}
                      </Label>
                      <Input
                        id="broadcast-subject"
                        placeholder={
                          channel === "email"
                            ? "e.g. New stock arriving this week"
                            : "e.g. Schedule change on Friday"
                        }
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <Label htmlFor="broadcast-content">Message</Label>
                      {channel === "sms" && (
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {formatCount(content.length)} characters,{" "}
                          {pluralize(Math.ceil(content.length / 160) || 1, "SMS", "SMS")}
                        </span>
                      )}
                    </div>
                    <Textarea
                      id="broadcast-content"
                      rows={6}
                      placeholder={
                        channel === "sms"
                          ? "e.g. Our store hours change this Friday. Reply if you have questions."
                          : "Write your message"
                      }
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <p aria-live="polite" className="text-sm text-muted-foreground">
                    {blocker ?? (
                      <>
                        Sending to{" "}
                        <span className="text-foreground">
                          {pluralize(audience.eligible, GROUP_SINGULAR[group])}
                        </span>
                      </>
                    )}
                  </p>
                  <Button
                    id="trigger-broadcast-modal-btn"
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    disabled={isPending || blocker !== null}
                  >
                    {isPending ? "Sending…" : "Send broadcast"}
                  </Button>
                </div>
              </div>
            </section>

            <div className="space-y-6 lg:col-span-5">
              {/* key resets the search box when the group changes */}
              <RecipientsPanel
                key={group}
                recipients={groupRecipients}
                channel={channel}
                groupLabel={GROUP_LABELS[group]}
                selectedIds={selectedIds}
                onSelectedIdsChange={setSelectedIds}
                isLoading={loadingGroup === group}
                audience={audience}
              />
              <BroadcastPreview channel={channel} group={group} subject={subject} content={content} />
            </div>
          </div>
        </TabsContent>

        {/* History */}
        <TabsContent value="history">
          <HistoryPanel history={initialHistory} />
        </TabsContent>
      </Tabs>

      {/* Confirm before sending: messages can't be recalled */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Send this broadcast?</DialogTitle>
            <DialogDescription>Messages can't be recalled once they're sent.</DialogDescription>
          </DialogHeader>

          <dl className="divide-y border-y">
            <DetailRow label="Channel">{CHANNEL_LABELS[channel]}</DetailRow>
            <DetailRow label="To">{GROUP_LABELS[group]}</DetailRow>
            <DetailRow label="Recipients">{pluralize(audience.eligible, "person", "people")}</DetailRow>
            {hasSubject && subject.trim() && (
              <DetailRow label="Subject">
                <span className="block max-w-[16rem] truncate">{subject.trim()}</span>
              </DetailRow>
            )}
          </dl>

          {audience.size > audience.eligible && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {formatCount(audience.size - audience.eligible)} will be skipped because they have no{" "}
              {CHANNEL_LABELS[channel].toLowerCase()} details.
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button id="confirm-send-broadcast-btn" onClick={confirmSend}>
              Send to {pluralize(audience.eligible, "recipient")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// "use client";

// import React, { useState, useTransition, useMemo } from "react";
// import { toast } from "sonner";
// import Link from "next/link";
// import { useRouter } from "next/navigation";
// import {
//   BroadcastChannel,
//   BroadcastMessage,
//   BroadcastRecipient,
//   RecipientGroup,
//   Settings,
// } from "@/types/globals";
// import {
//   sendBroadcastMessage,
//   getRecipientsForGroup,
// } from "@/actions/messages";
// import { Button } from "@/components/ui/button";
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
//   CardFooter,
// } from "@/components/ui/card";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Textarea } from "@/components/ui/textarea";
// import { Badge } from "@/components/ui/badge";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import { Separator } from "@/components/ui/separator";
// import { Checkbox } from "@/components/ui/checkbox";
// import {
//   Table,
//   TableBody,
//   TableCell,
//   TableHead,
//   TableHeader,
//   TableRow,
// } from "@/components/ui/table";
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import {
//   MessageSquare,
//   Mail,
//   Send,
//   Users,
//   Container,
//   PersonStanding,
//   Bell,
//   CheckCircle2,
//   XCircle,
//   AlertTriangle,
//   Lock,
//   Loader2,
//   Search,
//   History,
//   Smartphone,
//   Info,
//   ArrowRight,
//   Settings as SettingsIcon,
//   Eye,
//   Calendar,
//   UserCheck,
// } from "lucide-react";

// interface MessagesClientProps {
//   settings: Settings | null;
//   initialHistory: BroadcastMessage[];
//   initialSuppliers: BroadcastRecipient[];
//   initialCustomers: BroadcastRecipient[];
//   initialEmployees: BroadcastRecipient[];
// }

// export default function MessagesClient({
//   settings,
//   initialHistory,
//   initialSuppliers,
//   initialCustomers,
//   initialEmployees,
// }: MessagesClientProps) {
//   const router = useRouter();
//   const [isPending, startTransition] = useTransition();

//   // Channel settings state
//   const isEmailEnabled = Boolean(settings?.notification_email);
//   const isSmsEnabled = Boolean(settings?.notification_sms);
//   const isPushEnabled = Boolean(settings?.notification_push);

//   // Active Tab
//   const [activeTab, setActiveTab] = useState<"compose" | "history" | "channels">("compose");

//   // Broadcast Form State
//   const [recipientGroup, setRecipientGroup] = useState<RecipientGroup>("employees");
//   const [channel, setChannel] = useState<BroadcastChannel>("in_app");
//   const [subject, setSubject] = useState("");
//   const [content, setContent] = useState("");
//   const [searchQuery, setSearchQuery] = useState("");

//   // Recipient Selection State
//   const [recipientsMap, setRecipientsMap] = useState<Record<RecipientGroup, BroadcastRecipient[]>>({
//     suppliers: initialSuppliers,
//     customers: initialCustomers,
//     employees: initialEmployees,
//   });

//   const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
//   const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);

//   // Confirmation Modal
//   const [showConfirmModal, setShowConfirmModal] = useState(false);

//   // History Detail Modal
//   const [selectedHistoryItem, setSelectedHistoryItem] = useState<BroadcastMessage | null>(null);

//   // History Filter
//   const [historyChannelFilter, setHistoryChannelFilter] = useState<string>("all");
//   const [historyGroupFilter, setHistoryGroupFilter] = useState<string>("all");

//   // Current active list of recipients for selected group
//   const currentGroupRecipients = useMemo(
//     () => recipientsMap[recipientGroup] || [],
//     [recipientsMap, recipientGroup]
//   );

//   // Filtered recipients based on search query
//   const filteredRecipients = useMemo(() => {
//     if (!searchQuery.trim()) return currentGroupRecipients;
//     const q = searchQuery.toLowerCase();
//     return currentGroupRecipients.filter(
//       (r) =>
//         r.name.toLowerCase().includes(q) ||
//         (r.email && r.email.toLowerCase().includes(q)) ||
//         (r.phonenumber && r.phonenumber.includes(q)) ||
//         (r.company_name && r.company_name.toLowerCase().includes(q))
//     );
//   }, [currentGroupRecipients, searchQuery]);

//   // Check channel validity & settings constraint
//   const channelCheck = useMemo(() => {
//     if (channel === "sms") {
//       if (!isSmsEnabled) {
//         return {
//           allowed: false,
//           reason: "SMS broadcasting is disabled in system Settings (`notification_sms: false`).",
//         };
//       }
//     } else if (channel === "email") {
//       if (!isEmailEnabled) {
//         return {
//           allowed: false,
//           reason: "Email broadcasting is disabled in system Settings (`notification_email: false`).",
//         };
//       }
//     } else if (channel === "in_app") {
//       if (recipientGroup !== "employees") {
//         return {
//           allowed: false,
//           reason: "In-App notifications are only available for internal Employees.",
//         };
//       }
//       if (!isPushEnabled) {
//         return {
//           allowed: false,
//           reason: "In-App / Push notifications are disabled in system Settings (`notification_push: false`).",
//         };
//       }
//     }

//     return { allowed: true, reason: "" };
//   }, [channel, recipientGroup, isSmsEnabled, isEmailEnabled, isPushEnabled]);

//   // Compute eligible recipients count
//   const eligibleRecipientsCount = useMemo(() => {
//     const targetPool = selectedIds.size > 0
//       ? currentGroupRecipients.filter((r) => selectedIds.has(r.id))
//       : currentGroupRecipients;

//     if (channel === "email") {
//       return targetPool.filter((r) => r.hasValidEmail).length;
//     } else if (channel === "sms") {
//       return targetPool.filter((r) => r.hasValidPhone).length;
//     } else if (channel === "in_app") {
//       return targetPool.filter((r) => r.canReceiveInApp).length;
//     }
//     return 0;
//   }, [currentGroupRecipients, selectedIds, channel]);

//   // Group change handler
//   const handleGroupChange = async (group: RecipientGroup) => {
//     setRecipientGroup(group);
//     setSelectedIds(new Set());

//     // Auto switch channel if in_app was selected and switching away from employees
//     if (group !== "employees" && channel === "in_app") {
//       setChannel(isEmailEnabled ? "email" : isSmsEnabled ? "sms" : "email");
//     }

//     // Refresh recipient list if needed
//     if (!recipientsMap[group] || recipientsMap[group].length === 0) {
//       setIsLoadingRecipients(true);
//       const res = await getRecipientsForGroup(group);
//       if (res.success && res.data) {
//         setRecipientsMap((prev) => ({ ...prev, [group]: res.data! }));
//       }
//       setIsLoadingRecipients(false);
//     }
//   };

//   // Select all toggle
//   const handleSelectAllToggle = (checked: boolean) => {
//     if (checked) {
//       const allIds = new Set(filteredRecipients.map((r) => r.id));
//       setSelectedIds(allIds);
//     } else {
//       setSelectedIds(new Set());
//     }
//   };

//   // Single recipient checkbox toggle
//   const handleRecipientToggle = (id: string, checked: boolean) => {
//     setSelectedIds((prev) => {
//       const next = new Set(prev);
//       if (checked) {
//         next.add(id);
//       } else {
//         next.delete(id);
//       }
//       return next;
//     });
//   };

//   // Submit broadcast handler
//   const handleSendBroadcast = () => {
//     if (!content.trim()) {
//       toast.error("Please enter a message content before broadcasting.");
//       return;
//     }

//     if (channel === "email" && !subject.trim()) {
//       toast.error("Please enter an Email Subject line.");
//       return;
//     }

//     if (!channelCheck.allowed) {
//       toast.error(channelCheck.reason);
//       return;
//     }

//     if (eligibleRecipientsCount === 0) {
//       toast.error("No eligible recipients found for the selected channel.");
//       return;
//     }

//     setShowConfirmModal(true);
//   };

//   // Confirm execute broadcast
//   const confirmDispatch = () => {
//     setShowConfirmModal(false);
//     startTransition(async () => {
//       const res = await sendBroadcastMessage({
//         recipientGroup,
//         channel,
//         subject,
//         content,
//         recipientIds: Array.from(selectedIds),
//       });

//       if (res.success && res.data) {
//         toast.success(
//           `Broadcast sent successfully to ${res.data.recipientCount} ${recipientGroup}!`,
//           {
//             position: "top-right",
//             className: "p-4 text-emerald-600 dark:text-emerald-400",
//           }
//         );
//         // Reset message content
//         setContent("");
//         setSubject("");
//         setSelectedIds(new Set());
//         router.refresh();
//       } else {
//         toast.error("Failed to send broadcast", {
//           description: res.message || "An unexpected error occurred.",
//           position: "top-right",
//         });
//       }
//     });
//   };

//   // Filtered Broadcast History
//   const filteredHistory = useMemo(() => {
//     return initialHistory.filter((item) => {
//       if (historyChannelFilter !== "all" && item.channel !== historyChannelFilter) {
//         return false;
//       }
//       if (historyGroupFilter !== "all" && item.recipient_group !== historyGroupFilter) {
//         return false;
//       }
//       return true;
//     });
//   }, [initialHistory, historyChannelFilter, historyGroupFilter]);

//   // Channel Icon helper
//   const getChannelBadge = (ch: BroadcastChannel) => {
//     switch (ch) {
//       case "email":
//         return (
//           <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30 flex items-center gap-1">
//             <Mail className="h-3 w-3" /> Email
//           </Badge>
//         );
//       case "sms":
//         return (
//           <Badge variant="outline" className="bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30 flex items-center gap-1">
//             <Smartphone className="h-3 w-3" /> SMS
//           </Badge>
//         );
//       case "in_app":
//         return (
//           <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 flex items-center gap-1">
//             <Bell className="h-3 w-3" /> In-App
//           </Badge>
//         );
//     }
//   };

//   // Group Label helper
//   const getGroupLabel = (grp: RecipientGroup) => {
//     switch (grp) {
//       case "suppliers":
//         return "Suppliers";
//       case "customers":
//         return "Customers";
//       case "employees":
//         return "Employees";
//     }
//   };

//   return (
//     <div className="space-y-6">
//       {/* Overview Cards & Channel Settings Status */}
//       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//         {/* Email Channel Card */}
//         <Card className={`transition-all ${isEmailEnabled ? "border-l-4 border-l-blue-500" : "opacity-80 border-l-4 border-l-muted"}`}>
//           <CardContent className="p-4 flex items-center justify-between">
//             <div className="flex items-center gap-3">
//               <div className={`p-2.5 rounded-lg ${isEmailEnabled ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground"}`}>
//                 <Mail className="h-5 w-5" />
//               </div>
//               <div>
//                 <h4 className="font-semibold text-sm">Email Broadcasts</h4>
//                 <p className="text-xs text-muted-foreground">
//                   {isEmailEnabled ? "Active & Ready" : "Disabled in Settings"}
//                 </p>
//               </div>
//             </div>
//             <Badge variant="outline" className={isEmailEnabled ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-rose-500/10 text-rose-600 border-rose-500/30"}>
//               {isEmailEnabled ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
//               {isEmailEnabled ? "Enabled" : "Off"}
//             </Badge>
//           </CardContent>
//         </Card>

//         {/* SMS Channel Card */}
//         <Card className={`transition-all ${isSmsEnabled ? "border-l-4 border-l-purple-500" : "opacity-80 border-l-4 border-l-muted"}`}>
//           <CardContent className="p-4 flex items-center justify-between">
//             <div className="flex items-center gap-3">
//               <div className={`p-2.5 rounded-lg ${isSmsEnabled ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" : "bg-muted text-muted-foreground"}`}>
//                 <Smartphone className="h-5 w-5" />
//               </div>
//               <div>
//                 <h4 className="font-semibold text-sm">SMS Messages</h4>
//                 <p className="text-xs text-muted-foreground">
//                   {isSmsEnabled ? "Active & Ready" : "Disabled in Settings"}
//                 </p>
//               </div>
//             </div>
//             <Badge variant="outline" className={isSmsEnabled ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-rose-500/10 text-rose-600 border-rose-500/30"}>
//               {isSmsEnabled ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
//               {isSmsEnabled ? "Enabled" : "Off"}
//             </Badge>
//           </CardContent>
//         </Card>

//         {/* In-App / Push Card */}
//         <Card className={`transition-all ${isPushEnabled ? "border-l-4 border-l-amber-500" : "opacity-80 border-l-4 border-l-muted"}`}>
//           <CardContent className="p-4 flex items-center justify-between">
//             <div className="flex items-center gap-3">
//               <div className={`p-2.5 rounded-lg ${isPushEnabled ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>
//                 <Bell className="h-5 w-5" />
//               </div>
//               <div>
//                 <h4 className="font-semibold text-sm">In-App (Employees)</h4>
//                 <p className="text-xs text-muted-foreground">
//                   {isPushEnabled ? "Active & Ready" : "Disabled in Settings"}
//                 </p>
//               </div>
//             </div>
//             <Badge variant="outline" className={isPushEnabled ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-rose-500/10 text-rose-600 border-rose-500/30"}>
//               {isPushEnabled ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
//               {isPushEnabled ? "Enabled" : "Off"}
//             </Badge>
//           </CardContent>
//         </Card>
//       </div>

//       {/* Main Tabs Container */}
//       <Tabs
//         value={activeTab}
//         onValueChange={(val) => setActiveTab(val as any)}
//         className="space-y-6"
//       >
//         <div className="flex items-center justify-between flex-wrap gap-4">
//           <TabsList className="grid grid-cols-3 w-full max-w-md">
//             <TabsTrigger value="compose" className="gap-2">
//               <Send className="h-4 w-4" /> Compose
//             </TabsTrigger>
//             <TabsTrigger value="history" className="gap-2">
//               <History className="h-4 w-4" /> Broadcast History
//             </TabsTrigger>
//             <TabsTrigger value="channels" className="gap-2">
//               <SettingsIcon className="h-4 w-4" /> Channel Config
//             </TabsTrigger>
//           </TabsList>

//           <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
//             <Link href="/admin/settings">
//               <SettingsIcon className="h-3.5 w-3.5" /> Notification Settings
//             </Link>
//           </Button>
//         </div>

//         {/* COMPOSE BROADCAST TAB */}
//         <TabsContent value="compose" className="space-y-6">
//           <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
//             {/* Left Column: Form & Configuration (7 cols) */}
//             <div className="lg:col-span-7 space-y-6">
//               {/* Step 1: Select Target Recipient Group */}
//               <Card>
//                 <CardHeader className="pb-3">
//                   <CardTitle className="text-base font-semibold flex items-center gap-2">
//                     <Users className="h-4 w-4 text-primary" />
//                     1. Select Recipient Group
//                   </CardTitle>
//                   <CardDescription>
//                     Choose who should receive this broadcast message.
//                   </CardDescription>
//                 </CardHeader>
//                 <CardContent>
//                   <div className="grid grid-cols-3 gap-3">
//                     <button
//                       type="button"
//                       id="select-group-employees"
//                       onClick={() => handleGroupChange("employees")}
//                       className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
//                         recipientGroup === "employees"
//                           ? "border-primary bg-primary/5 text-primary font-semibold ring-1 ring-primary"
//                           : "border-border bg-card hover:bg-muted/30 text-muted-foreground"
//                       }`}
//                     >
//                       <Users className="h-5 w-5" />
//                       <span className="text-xs">Employees</span>
//                       <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
//                         {initialEmployees.length} Contacts
//                       </Badge>
//                     </button>

//                     <button
//                       type="button"
//                       id="select-group-customers"
//                       onClick={() => handleGroupChange("customers")}
//                       className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
//                         recipientGroup === "customers"
//                           ? "border-primary bg-primary/5 text-primary font-semibold ring-1 ring-primary"
//                           : "border-border bg-card hover:bg-muted/30 text-muted-foreground"
//                       }`}
//                     >
//                       <PersonStanding className="h-5 w-5" />
//                       <span className="text-xs">Customers</span>
//                       <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
//                         {initialCustomers.length} Contacts
//                       </Badge>
//                     </button>

//                     <button
//                       type="button"
//                       id="select-group-suppliers"
//                       onClick={() => handleGroupChange("suppliers")}
//                       className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
//                         recipientGroup === "suppliers"
//                           ? "border-primary bg-primary/5 text-primary font-semibold ring-1 ring-primary"
//                           : "border-border bg-card hover:bg-muted/30 text-muted-foreground"
//                       }`}
//                     >
//                       <Container className="h-5 w-5" />
//                       <span className="text-xs">Suppliers</span>
//                       <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
//                         {initialSuppliers.length} Contacts
//                       </Badge>
//                     </button>
//                   </div>
//                 </CardContent>
//               </Card>

//               {/* Step 2: Select Channel & Verification */}
//               <Card>
//                 <CardHeader className="pb-3">
//                   <CardTitle className="text-base font-semibold flex items-center gap-2">
//                     <MessageSquare className="h-4 w-4 text-primary" />
//                     2. Select Broadcast Channel
//                   </CardTitle>
//                   <CardDescription>
//                     Channels are enabled based on system notification settings.
//                   </CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-4">
//                   <div className="grid grid-cols-3 gap-3">
//                     {/* In-App Channel Option */}
//                     <button
//                       type="button"
//                       id="select-channel-in-app"
//                       onClick={() => setChannel("in_app")}
//                       disabled={recipientGroup !== "employees" || !isPushEnabled}
//                       className={`relative p-3.5 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
//                         channel === "in_app"
//                           ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold ring-1 ring-amber-500"
//                           : "border-border bg-card text-muted-foreground"
//                       } ${
//                         recipientGroup !== "employees" || !isPushEnabled
//                           ? "opacity-50 cursor-not-allowed bg-muted/50"
//                           : "hover:bg-muted/30 cursor-pointer"
//                       }`}
//                     >
//                       <Bell className="h-5 w-5" />
//                       <span className="text-xs">In-App</span>
//                       <span className="text-[10px] opacity-75">Employees Only</span>
//                       {(recipientGroup !== "employees" || !isPushEnabled) && (
//                         <Lock className="absolute top-2 right-2 h-3.5 w-3.5 text-muted-foreground" />
//                       )}
//                     </button>

//                     {/* Email Channel Option */}
//                     <button
//                       type="button"
//                       id="select-channel-email"
//                       onClick={() => setChannel("email")}
//                       disabled={!isEmailEnabled}
//                       className={`relative p-3.5 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
//                         channel === "email"
//                           ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400 font-semibold ring-1 ring-blue-500"
//                           : "border-border bg-card text-muted-foreground"
//                       } ${
//                         !isEmailEnabled
//                           ? "opacity-50 cursor-not-allowed bg-muted/50"
//                           : "hover:bg-muted/30 cursor-pointer"
//                       }`}
//                     >
//                       <Mail className="h-5 w-5" />
//                       <span className="text-xs">Email</span>
//                       <span className="text-[10px] opacity-75">
//                         {isEmailEnabled ? "Email Enabled" : "Off in Settings"}
//                       </span>
//                       {!isEmailEnabled && (
//                         <Lock className="absolute top-2 right-2 h-3.5 w-3.5 text-muted-foreground" />
//                       )}
//                     </button>

//                     {/* SMS Channel Option */}
//                     <button
//                       type="button"
//                       id="select-channel-sms"
//                       onClick={() => setChannel("sms")}
//                       disabled={!isSmsEnabled}
//                       className={`relative p-3.5 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
//                         channel === "sms"
//                           ? "border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-400 font-semibold ring-1 ring-purple-500"
//                           : "border-border bg-card text-muted-foreground"
//                       } ${
//                         !isSmsEnabled
//                           ? "opacity-50 cursor-not-allowed bg-muted/50"
//                           : "hover:bg-muted/30 cursor-pointer"
//                       }`}
//                     >
//                       <Smartphone className="h-5 w-5" />
//                       <span className="text-xs">SMS</span>
//                       <span className="text-[10px] opacity-75">
//                         {isSmsEnabled ? "SMS Enabled" : "Off in Settings"}
//                       </span>
//                       {!isSmsEnabled && (
//                         <Lock className="absolute top-2 right-2 h-3.5 w-3.5 text-muted-foreground" />
//                       )}
//                     </button>
//                   </div>

//                   {/* Channel Restriction Alert */}
//                   {!channelCheck.allowed && (
//                     <div className="p-3.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400 text-xs flex items-start gap-2.5">
//                       <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
//                       <div>
//                         <span className="font-semibold">Channel Locked:</span> {channelCheck.reason}
//                         <div className="mt-1">
//                           <Link href="/admin/settings" className="underline font-medium hover:text-rose-900 dark:hover:text-rose-200">
//                             Go to Notification Settings to toggle permissions
//                           </Link>
//                         </div>
//                       </div>
//                     </div>
//                   )}
//                 </CardContent>
//               </Card>

//               {/* Step 3: Message Content */}
//               <Card>
//                 <CardHeader className="pb-3">
//                   <CardTitle className="text-base font-semibold flex items-center gap-2">
//                     <Send className="h-4 w-4 text-primary" />
//                     3. Compose Message Body
//                   </CardTitle>
//                   <CardDescription>
//                     Write your broadcast content. Subject line is required for Email.
//                   </CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-4">
//                   {/* Subject Line for Email & In-App */}
//                   {(channel === "email" || channel === "in_app") && (
//                     <div className="space-y-2">
//                       <Label htmlFor="broadcast-subject" className="text-sm font-medium">
//                         Subject Line {channel === "email" && <span className="text-rose-500">*</span>}
//                       </Label>
//                       <Input
//                         id="broadcast-subject"
//                         placeholder={
//                           channel === "email"
//                             ? "e.g. Important Inventory Update & New Stock Arrival"
//                             : "e.g. Schedule Change Announcement"
//                         }
//                         value={subject}
//                         onChange={(e) => setSubject(e.target.value)}
//                       />
//                     </div>
//                   )}

//                   {/* Message Content */}
//                   <div className="space-y-2">
//                     <div className="flex items-center justify-between">
//                       <Label htmlFor="broadcast-content" className="text-sm font-medium">
//                         Message Content <span className="text-rose-500">*</span>
//                       </Label>
//                       {channel === "sms" && (
//                         <span className="text-xs text-muted-foreground font-mono">
//                           {content.length} chars (approx {Math.ceil(content.length / 160) || 1} SMS segment)
//                         </span>
//                       )}
//                     </div>
//                     <Textarea
//                       id="broadcast-content"
//                       rows={5}
//                       placeholder={
//                         channel === "sms"
//                           ? "e.g. Hello! Please note our store hours will be updated this Friday. Contact us if you have questions."
//                           : "Write your complete broadcast message here..."
//                       }
//                       value={content}
//                       onChange={(e) => setContent(e.target.value)}
//                     />
//                   </div>

//                   {/* Send Action */}
//                   <div className="pt-2 flex items-center justify-between">
//                     <div className="text-xs text-muted-foreground">
//                       Delivering to: <span className="font-semibold text-foreground">{eligibleRecipientsCount} {recipientGroup}</span>
//                     </div>

//                     <Button
//                       id="trigger-broadcast-modal-btn"
//                       type="button"
//                       onClick={handleSendBroadcast}
//                       disabled={isPending || !channelCheck.allowed || eligibleRecipientsCount === 0 || !content.trim()}
//                       className="gap-2 min-w-[150px]"
//                     >
//                       {isPending ? (
//                         <>
//                           <Loader2 className="h-4 w-4 animate-spin" />
//                           Sending...
//                         </>
//                       ) : (
//                         <>
//                           <Send className="h-4 w-4" />
//                           Send Broadcast
//                         </>
//                       )}
//                     </Button>
//                   </div>
//                 </CardContent>
//               </Card>
//             </div>

//             {/* Right Column: Audience Filter & Live Preview (5 cols) */}
//             <div className="lg:col-span-5 space-y-6">
//               {/* Audience Filter & Checklist */}
//               <Card className="h-full flex flex-col">
//                 <CardHeader className="pb-3">
//                   <div className="flex items-center justify-between">
//                     <CardTitle className="text-base font-semibold flex items-center gap-2">
//                       <UserCheck className="h-4 w-4 text-primary" />
//                       Target Recipients ({filteredRecipients.length})
//                     </CardTitle>
//                     <Badge variant="secondary" className="text-xs">
//                       {selectedIds.size === 0 ? "All Selected" : `${selectedIds.size} Selected`}
//                     </Badge>
//                   </div>
//                   <CardDescription>
//                     Select specific recipients or send to all in group.
//                   </CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-3 flex-1">
//                   {/* Search Bar */}
//                   <div className="relative">
//                     <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
//                     <Input
//                       placeholder="Filter by name, email, or phone..."
//                       value={searchQuery}
//                       onChange={(e) => setSearchQuery(e.target.value)}
//                       className="pl-8 text-xs h-9"
//                     />
//                   </div>

//                   {/* Select All Row */}
//                   <div className="flex items-center justify-between px-2 py-1.5 bg-muted/30 rounded border text-xs">
//                     <div className="flex items-center gap-2">
//                       <Checkbox
//                         id="select-all-recipients"
//                         checked={
//                           filteredRecipients.length > 0 &&
//                           filteredRecipients.every((r) => selectedIds.has(r.id))
//                         }
//                         onCheckedChange={handleSelectAllToggle}
//                       />
//                       <label htmlFor="select-all-recipients" className="font-medium cursor-pointer">
//                         Select All Filtered ({filteredRecipients.length})
//                       </label>
//                     </div>
//                     {selectedIds.size > 0 && (
//                       <button
//                         type="button"
//                         onClick={() => setSelectedIds(new Set())}
//                         className="text-primary hover:underline text-[11px]"
//                       >
//                         Clear Selection
//                       </button>
//                     )}
//                   </div>

//                   {/* Recipient List Scrollable */}
//                   {isLoadingRecipients ? (
//                     <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
//                       <Loader2 className="h-4 w-4 animate-spin" /> Loading recipients...
//                     </div>
//                   ) : filteredRecipients.length === 0 ? (
//                     <div className="p-8 text-center text-xs text-muted-foreground border rounded-lg">
//                       No matching recipients found for "{searchQuery}".
//                     </div>
//                   ) : (
//                     <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1 border rounded-lg p-1.5 divide-y divide-border/40">
//                       {filteredRecipients.map((r,index) => {
//                         const isSelected = selectedIds.size === 0 || selectedIds.has(r.id);
//                         const isEligible =
//                           channel === "email"
//                             ? r.hasValidEmail
//                             : channel === "sms"
//                             ? r.hasValidPhone
//                             : r.canReceiveInApp;

//                         return (
//                           <div
//                             key={`${r.id}${index}`}
//                             className={`p-2 rounded text-xs flex items-center justify-between gap-2 transition-colors ${
//                               isSelected ? "bg-muted/30" : "opacity-60"
//                             }`}
//                           >
//                             <div className="flex items-center gap-2 overflow-hidden">
//                               <Checkbox
//                                 id={`recipient-check-${r.id}`}
//                                 checked={selectedIds.has(r.id)}
//                                 onCheckedChange={(checked) =>
//                                   handleRecipientToggle(r.id, Boolean(checked))
//                                 }
//                               />
//                               <div className="truncate">
//                                 <span className="font-semibold text-foreground block truncate">
//                                   {r.name}
//                                 </span>
//                                 <span className="text-[10px] text-muted-foreground block truncate">
//                                   {r.email || r.phonenumber || "No contact info"}
//                                 </span>
//                               </div>
//                             </div>

//                             {/* Eligibility Badge */}
//                             <div>
//                               {isEligible ? (
//                                 <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
//                                   Eligible
//                                 </Badge>
//                               ) : (
//                                 <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20">
//                                   Missing Info
//                                 </Badge>
//                               )}
//                             </div>
//                           </div>
//                         );
//                       })}
//                     </div>
//                   )}

//                   <div className="p-2.5 rounded bg-muted/40 text-[11px] text-muted-foreground space-y-1">
//                     <div className="flex justify-between">
//                       <span>Group Size:</span>
//                       <span className="font-semibold text-foreground">{currentGroupRecipients.length}</span>
//                     </div>
//                     <div className="flex justify-between">
//                       <span>Eligible for {channel.toUpperCase()}:</span>
//                       <span className="font-semibold text-emerald-600 dark:text-emerald-400">
//                         {eligibleRecipientsCount}
//                       </span>
//                     </div>
//                   </div>
//                 </CardContent>
//               </Card>

//               {/* Live Preview Card */}
//               <Card>
//                 <CardHeader className="pb-2">
//                   <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
//                     <Eye className="h-3.5 w-3.5" /> Live Device Preview ({channel.toUpperCase()})
//                   </CardTitle>
//                 </CardHeader>
//                 <CardContent>
//                   {channel === "sms" && (
//                     <div className="border rounded-xl p-4 bg-muted/40 font-sans space-y-2">
//                       <div className="flex items-center justify-between text-[11px] text-muted-foreground border-b pb-2">
//                         <span className="flex items-center gap-1 font-semibold">
//                           <Smartphone className="h-3.5 w-3.5" /> SMS Message
//                         </span>
//                         <span>Now</span>
//                       </div>
//                       <div className="bg-primary/10 border border-primary/20 text-foreground text-xs p-3 rounded-2xl rounded-tl-xs shadow-xs">
//                         {content.trim() ? content : "Your SMS content will appear here..."}
//                       </div>
//                     </div>
//                   )}

//                   {channel === "email" && (
//                     <div className="border rounded-xl p-4 bg-background shadow-xs space-y-3 font-sans">
//                       <div className="border-b pb-2 space-y-1">
//                         <div className="text-xs font-semibold text-foreground">
//                           Subject: {subject.trim() ? subject : "(No Subject Provided)"}
//                         </div>
//                         <div className="text-[11px] text-muted-foreground flex justify-between">
//                           <span>From: Admin &lt;noreply@inventorypro.com&gt;</span>
//                           <span>To: {getGroupLabel(recipientGroup)}</span>
//                         </div>
//                       </div>
//                       <div className="text-xs text-foreground whitespace-pre-wrap leading-relaxed min-h-[60px]">
//                         {content.trim() ? content : "Your email content body will appear here..."}
//                       </div>
//                     </div>
//                   )}

//                   {channel === "in_app" && (
//                     <div className="border rounded-xl p-4 bg-card shadow-md space-y-2 border-l-4 border-l-amber-500">
//                       <div className="flex items-center justify-between text-xs">
//                         <div className="flex items-center gap-1.5 font-semibold text-foreground">
//                           <Bell className="h-4 w-4 text-amber-500" />
//                           {subject.trim() ? subject : "System Announcement"}
//                         </div>
//                         <span className="text-[10px] text-muted-foreground">Just now</span>
//                       </div>
//                       <p className="text-xs text-muted-foreground leading-normal">
//                         {content.trim() ? content : "Employee in-app notification text..."}
//                       </p>
//                     </div>
//                   )}
//                 </CardContent>
//               </Card>
//             </div>
//           </div>
//         </TabsContent>

//         {/* BROADCAST HISTORY TAB */}
//         <TabsContent value="history" className="space-y-4">
//           <Card>
//             <CardHeader className="pb-3">
//               <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
//                 <div>
//                   <CardTitle className="text-base font-semibold flex items-center gap-2">
//                     <History className="h-4 w-4 text-primary" />
//                     Broadcast Delivery Log
//                   </CardTitle>
//                   <CardDescription>
//                     History of all dispatches sent across SMS, Email, and In-App channels.
//                   </CardDescription>
//                 </div>

//                 {/* Filters */}
//                 <div className="flex items-center gap-2 flex-wrap">
//                   <select
//                     id="history-channel-filter"
//                     className="h-8 text-xs border rounded-md bg-background px-2"
//                     value={historyChannelFilter}
//                     onChange={(e) => setHistoryChannelFilter(e.target.value)}
//                   >
//                     <option value="all">All Channels</option>
//                     <option value="email">Email</option>
//                     <option value="sms">SMS</option>
//                     <option value="in_app">In-App</option>
//                   </select>

//                   <select
//                     id="history-group-filter"
//                     className="h-8 text-xs border rounded-md bg-background px-2"
//                     value={historyGroupFilter}
//                     onChange={(e) => setHistoryGroupFilter(e.target.value)}
//                   >
//                     <option value="all">All Groups</option>
//                     <option value="employees">Employees</option>
//                     <option value="customers">Customers</option>
//                     <option value="suppliers">Suppliers</option>
//                   </select>
//                 </div>
//               </div>
//             </CardHeader>
//             <CardContent>
//               {filteredHistory.length === 0 ? (
//                 <div className="py-12 text-center text-muted-foreground space-y-2">
//                   <History className="h-8 w-8 mx-auto opacity-40" />
//                   <p className="text-sm">No broadcast history records found.</p>
//                 </div>
//               ) : (
//                 <div className="rounded-md border overflow-x-auto">
//                   <Table>
//                     <TableHeader>
//                       <TableRow>
//                         <TableHead>Date & Time</TableHead>
//                         <TableHead>Channel</TableHead>
//                         <TableHead>Target Group</TableHead>
//                         <TableHead>Subject / Content</TableHead>
//                         <TableHead className="text-center">Recipients</TableHead>
//                         <TableHead>Sent By</TableHead>
//                         <TableHead className="text-right">Action</TableHead>
//                       </TableRow>
//                     </TableHeader>
//                     <TableBody>
//                       {filteredHistory.map((item) => (
//                         <TableRow key={item.id}>
//                           <TableCell className="text-xs whitespace-nowrap">
//                             <div className="flex items-center gap-1.5 text-muted-foreground">
//                               <Calendar className="h-3.5 w-3.5" />
//                               {new Date(item.created_at).toLocaleString()}
//                             </div>
//                           </TableCell>
//                           <TableCell>{getChannelBadge(item.channel)}</TableCell>
//                           <TableCell className="text-xs font-medium capitalize">
//                             {item.recipient_group}
//                           </TableCell>
//                           <TableCell className="max-w-[280px]">
//                             <div className="truncate text-xs font-semibold text-foreground">
//                               {item.subject || "No Subject"}
//                             </div>
//                             <div className="truncate text-[11px] text-muted-foreground">
//                               {item.content}
//                             </div>
//                           </TableCell>
//                           <TableCell className="text-center">
//                             <Badge variant="secondary" className="font-mono text-xs">
//                               {item.recipient_count}
//                             </Badge>
//                           </TableCell>
//                           <TableCell className="text-xs text-muted-foreground">
//                             {item.sender_name}
//                           </TableCell>
//                           <TableCell className="text-right">
//                             <Button
//                               variant="ghost"
//                               size="sm"
//                               onClick={() => setSelectedHistoryItem(item)}
//                               className="h-7 px-2 text-xs gap-1"
//                             >
//                               <Eye className="h-3.5 w-3.5" /> View
//                             </Button>
//                           </TableCell>
//                         </TableRow>
//                       ))}
//                     </TableBody>
//                   </Table>
//                 </div>
//               )}
//             </CardContent>
//           </Card>
//         </TabsContent>

//         {/* CHANNEL CONFIGURATION TAB */}
//         <TabsContent value="channels" className="space-y-6">
//           <Card>
//             <CardHeader>
//               <CardTitle className="text-base font-semibold flex items-center gap-2">
//                 <SettingsIcon className="h-4 w-4 text-primary" />
//                 Channel Rules & System Notification Toggles
//               </CardTitle>
//               <CardDescription>
//                 Overview of rules governing channel availability across recipient groups.
//               </CardDescription>
//             </CardHeader>
//             <CardContent className="space-y-6">
//               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
//                 <div className="p-4 rounded-xl border space-y-2 bg-card">
//                   <div className="flex items-center justify-between">
//                     <h4 className="font-semibold text-sm flex items-center gap-2">
//                       <Mail className="h-4 w-4 text-blue-500" /> Email Broadcast
//                     </h4>
//                     <Badge variant="outline" className={isEmailEnabled ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}>
//                       {isEmailEnabled ? "Active" : "Disabled"}
//                     </Badge>
//                   </div>
//                   <p className="text-xs text-muted-foreground">
//                     Delivers email messages to recipients with valid email addresses. Controlled by <code className="text-primary font-mono font-bold">notification_email</code>.
//                   </p>
//                 </div>

//                 <div className="p-4 rounded-xl border space-y-2 bg-card">
//                   <div className="flex items-center justify-between">
//                     <h4 className="font-semibold text-sm flex items-center gap-2">
//                       <Smartphone className="h-4 w-4 text-purple-500" /> SMS Broadcast
//                     </h4>
//                     <Badge variant="outline" className={isSmsEnabled ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}>
//                       {isSmsEnabled ? "Active" : "Disabled"}
//                     </Badge>
//                   </div>
//                   <p className="text-xs text-muted-foreground">
//                     Dispatches text messages to phone numbers. Controlled by <code className="text-primary font-mono font-bold">notification_sms</code>.
//                   </p>
//                 </div>

//                 <div className="p-4 rounded-xl border space-y-2 bg-card">
//                   <div className="flex items-center justify-between">
//                     <h4 className="font-semibold text-sm flex items-center gap-2">
//                       <Bell className="h-4 w-4 text-amber-500" /> In-App Notification
//                     </h4>
//                     <Badge variant="outline" className={isPushEnabled ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}>
//                       {isPushEnabled ? "Active" : "Disabled"}
//                     </Badge>
//                   </div>
//                   <p className="text-xs text-muted-foreground">
//                     Instant internal push alerts for active Employee accounts. Controlled by <code className="text-primary font-mono font-bold">notification_push</code>.
//                   </p>
//                 </div>
//               </div>

//               <div className="p-4 rounded-lg bg-muted/40 border flex items-center justify-between">
//                 <div className="space-y-1">
//                   <h5 className="text-sm font-semibold">Want to change notification channels?</h5>
//                   <p className="text-xs text-muted-foreground">
//                     Go to system settings to toggle notification_email, notification_sms, or notification_push flags.
//                   </p>
//                 </div>
//                 <Button asChild className="gap-2">
//                   <Link href="/admin/settings">
//                     Open Settings <ArrowRight className="h-4 w-4" />
//                   </Link>
//                 </Button>
//               </div>
//             </CardContent>
//           </Card>
//         </TabsContent>
//       </Tabs>

//       {/* CONFIRMATION MODAL */}
//       <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
//         <DialogContent className="sm:max-w-[480px]">
//           <DialogHeader className="gap-2">
//             <div className="flex items-center gap-3">
//               <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
//                 <Send className="h-5 w-5" />
//               </div>
//               <div>
//                 <DialogTitle className="text-lg font-semibold">
//                   Confirm Broadcast Dispatch
//                 </DialogTitle>
//                 <DialogDescription className="text-xs">
//                   Review broadcast details before sending.
//                 </DialogDescription>
//               </div>
//             </div>
//           </DialogHeader>

//           <div className="space-y-3 py-3 text-xs border-y my-2">
//             <div className="flex justify-between">
//               <span className="text-muted-foreground">Channel:</span>
//               <span className="font-semibold uppercase">{channel}</span>
//             </div>
//             <div className="flex justify-between">
//               <span className="text-muted-foreground">Target Audience:</span>
//               <span className="font-semibold capitalize">{recipientGroup}</span>
//             </div>
//             <div className="flex justify-between">
//               <span className="text-muted-foreground">Eligible Recipients:</span>
//               <span className="font-semibold text-emerald-600 dark:text-emerald-400">
//                 {eligibleRecipientsCount} contacts
//               </span>
//             </div>
//             {subject && (
//               <div className="flex justify-between">
//                 <span className="text-muted-foreground">Subject:</span>
//                 <span className="font-medium text-foreground truncate max-w-[220px]">
//                   {subject}
//                 </span>
//               </div>
//             )}
//           </div>

//           <DialogFooter className="gap-2 sm:gap-0">
//             <Button
//               variant="outline"
//               onClick={() => setShowConfirmModal(false)}
//               disabled={isPending}
//             >
//               Cancel
//             </Button>
//             <Button
//               id="confirm-send-broadcast-btn"
//               onClick={confirmDispatch}
//               disabled={isPending}
//               className="gap-2"
//             >
//               {isPending ? (
//                 <>
//                   <Loader2 className="h-4 w-4 animate-spin" />
//                   Dispatching...
//                 </>
//               ) : (
//                 <>
//                   <Send className="h-4 w-4" />
//                   Confirm & Dispatch
//                 </>
//               )}
//             </Button>
//           </DialogFooter>
//         </DialogContent>
//       </Dialog>

//       {/* HISTORY ITEM DETAILS MODAL */}
//       <Dialog
//         open={Boolean(selectedHistoryItem)}
//         onOpenChange={(open) => !open && setSelectedHistoryItem(null)}
//       >
//         <DialogContent className="sm:max-w-[540px]">
//           {selectedHistoryItem && (
//             <>
//               <DialogHeader>
//                 <div className="flex items-center justify-between">
//                   <DialogTitle className="text-lg font-semibold">
//                     Broadcast Details
//                   </DialogTitle>
//                   {getChannelBadge(selectedHistoryItem.channel)}
//                 </div>
//                 <DialogDescription className="text-xs">
//                   Sent on {new Date(selectedHistoryItem.created_at).toLocaleString()} by {selectedHistoryItem.sender_name}
//                 </DialogDescription>
//               </DialogHeader>

//               <div className="space-y-4 py-2 text-xs">
//                 <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-muted/40">
//                   <div>
//                     <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
//                       Target Audience
//                     </span>
//                     <span className="font-semibold text-sm capitalize">
//                       {selectedHistoryItem.recipient_group}
//                     </span>
//                   </div>
//                   <div>
//                     <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
//                       Delivered Count
//                     </span>
//                     <span className="font-semibold text-sm text-emerald-600">
//                       {selectedHistoryItem.recipient_count} recipients
//                     </span>
//                   </div>
//                 </div>

//                 {selectedHistoryItem.subject && (
//                   <div className="space-y-1">
//                     <span className="font-semibold text-muted-foreground">Subject:</span>
//                     <div className="p-2 rounded border font-medium text-foreground">
//                       {selectedHistoryItem.subject}
//                     </div>
//                   </div>
//                 )}

//                 <div className="space-y-1">
//                   <span className="font-semibold text-muted-foreground">Message Body:</span>
//                   <div className="p-3 rounded border bg-card whitespace-pre-wrap leading-relaxed">
//                     {selectedHistoryItem.content}
//                   </div>
//                 </div>
//               </div>

//               <DialogFooter>
//                 <Button
//                   variant="outline"
//                   onClick={() => setSelectedHistoryItem(null)}
//                 >
//                   Close
//                 </Button>
//               </DialogFooter>
//             </>
//           )}
//         </DialogContent>
//       </Dialog>
//     </div>
//   );
// }
