import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import {
  BellRing,
  CheckSquare,
  Mail,
  MessageSquare,
  Plus,
  Send,
  Smartphone,
  Square,
  Truck,
  UserCog,
  Users,
  X,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Badge, Button, Card, Input } from "@/components/ui";
import { useTheme } from "@/theme";
import type {
  BroadcastChannel,
  BroadcastMessageItem,
  BroadcastRecipient,
  BroadcastRecipientGroup,
} from "@/types/domain";
import { formatDateTime } from "@/utils/formatters";

const GROUP_OPTIONS: Array<{
  value: BroadcastRecipientGroup;
  label: string;
}> = [
  { value: "employees", label: "Team" },
  { value: "customers", label: "Customers" },
  { value: "suppliers", label: "Suppliers" },
];

const CHANNEL_OPTIONS: Array<{
  value: BroadcastChannel;
  label: string;
}> = [
  { value: "in_app", label: "In-App" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
];

export default function MessagesScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const { refreshUnreadNotifications } = useAuth();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [messages, setMessages] = useState<BroadcastMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  // Compose modal state
  const [composeOpen, setComposeOpen] = useState(false);
  const [recipientGroup, setRecipientGroup] =
    useState<BroadcastRecipientGroup>("employees");
  const [channel, setChannel] = useState<BroadcastChannel>("in_app");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadHistory = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setErrorMsg(null);
      try {
        const list = await api.getBroadcastMessages();
        setMessages(list);
        hasLoadedRef.current = true;
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Failed to load broadcast history.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void loadHistory(false);
  }, [loadHistory]);

  useFocusEffect(
    useCallback(() => {
      if (hasLoadedRef.current) {
        void loadHistory(true);
      }
    }, [loadHistory]),
  );

  const loadRecipients = useCallback(
    async (group: BroadcastRecipientGroup) => {
      setLoadingRecipients(true);
      try {
        const list = await api.getBroadcastRecipients(group);
        setRecipients(list);
        setSelectedIds(null);
      } catch {
        setRecipients([]);
      } finally {
        setLoadingRecipients(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (composeOpen) {
      void loadRecipients(recipientGroup);
    }
  }, [composeOpen, recipientGroup, loadRecipients]);

  const handleSelectGroup = (group: BroadcastRecipientGroup) => {
    setRecipientGroup(group);
    if (group !== "employees" && channel === "in_app") {
      setChannel("sms");
    }
    setFormError(null);
  };

  const handleSelectChannel = (nextChannel: BroadcastChannel) => {
    if (nextChannel === "in_app" && recipientGroup !== "employees") {
      setRecipientGroup("employees");
    }
    setChannel(nextChannel);
    setFormError(null);
  };

  const eligibleRecipients = useMemo(() => {
    return recipients.filter((r) => {
      if (channel === "email") return r.hasValidEmail;
      if (channel === "sms") return r.hasValidPhone;
      return r.canReceiveInApp;
    });
  }, [recipients, channel]);

  const effectiveTargetIds = useMemo(() => {
    if (selectedIds === null) {
      return eligibleRecipients.map((r) => r.id);
    }
    const eligibleSet = new Set(eligibleRecipients.map((r) => r.id));
    return selectedIds.filter((id) => eligibleSet.has(id));
  }, [eligibleRecipients, selectedIds]);

  const toggleRecipient = (id: string) => {
    setSelectedIds((prev) => {
      const current =
        prev === null ? eligibleRecipients.map((r) => r.id) : prev;
      if (current.includes(id)) {
        return current.filter((x) => x !== id);
      }
      return [...current, id];
    });
  };

  const openCompose = () => {
    setRecipientGroup("employees");
    setChannel("in_app");
    setSubject("");
    setContent("");
    setSelectedIds(null);
    setFormError(null);
    setComposeOpen(true);
  };

  const handleSend = async () => {
    if (!content.trim()) {
      setFormError("Message body cannot be empty.");
      return;
    }
    if (channel === "email" && !subject.trim()) {
      setFormError("Please enter an email subject line.");
      return;
    }
    if (effectiveTargetIds.length === 0) {
      setFormError("Select at least one eligible recipient.");
      return;
    }

    setSending(true);
    setFormError(null);
    try {
      const created = await api.sendBroadcastMessage({
        recipientGroup,
        channel,
        subject: subject.trim() || undefined,
        content: content.trim(),
        recipientIds: selectedIds === null ? undefined : effectiveTargetIds,
      });
      setMessages((prev) => [created, ...prev]);
      setComposeOpen(false);
      await refreshUnreadNotifications();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to send broadcast.",
      );
    } finally {
      setSending(false);
    }
  };

  const getGroupIcon = (group: BroadcastRecipientGroup) => {
    if (group === "employees") return <UserCog size={13} color={colors.primary} />;
    if (group === "suppliers") return <Truck size={13} color={colors.primary} />;
    return <Users size={13} color={colors.primary} />;
  };

  const getChannelBadge = (ch: BroadcastChannel) => {
    if (ch === "in_app") {
      return {
        label: "In-App",
        icon: <BellRing size={12} color={colors.primary} />,
      };
    }
    if (ch === "sms") {
      return {
        label: "SMS",
        icon: <Smartphone size={12} color={colors.primary} />,
      };
    }
    return {
      label: "Email",
      icon: <Mail size={12} color={colors.primary} />,
    };
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={{
          paddingHorizontal: spacing.base,
          paddingTop: spacing.md,
          paddingBottom: spacing.sm,
          gap: spacing.sm + 2,
        }}
      >
        <View
          style={[
            styles.summaryBar,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: radii.xl,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm + 2,
            },
          ]}
        >
          <View style={styles.summaryTextCol}>
            <Text style={[typography.bodySemibold, { color: colors.foreground }]}>
              Team & Store Broadcasts
            </Text>
            <Text
              numberOfLines={2}
              style={[typography.caption, { color: colors.mutedForeground }]}
            >
              In-app announcements deliver directly to staff notifications; SMS &
              email campaigns queue locally.
            </Text>
          </View>
          <Button
            title="Compose"
            size="sm"
            leftIcon={<Plus size={15} color="#FFFFFF" />}
            onPress={openCompose}
          />
        </View>

        {errorMsg ? (
          <View
            style={[
              styles.errorBanner,
              {
                backgroundColor: colors.dangerTint,
                borderColor: colors.dangerBorder,
                borderRadius: radii.lg,
                padding: spacing.sm + 2,
              },
            ]}
          >
            <Text style={[typography.caption, { color: colors.dangerText }]}>
              {errorMsg}
            </Text>
          </View>
        ) : null}
      </View>

      {loading && messages.length === 0 ? (
        <LoadingState message="Loading broadcast history..." />
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: spacing.base,
            paddingTop: spacing.xs,
            gap: spacing.sm + 2,
            paddingBottom: spacing["3xl"],
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadHistory(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => {
            const channelMeta = getChannelBadge(item.channel);
            const statusVariant =
              item.status === "sent"
                ? "success"
                : item.status === "queued"
                  ? "warning"
                  : item.status === "failed"
                    ? "danger"
                    : "secondary";

            return (
              <Card>
                <View style={{ padding: spacing.md + 2, gap: 8 }}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.badgeGroup}>
                      <View
                        style={[
                          styles.pillTag,
                          {
                            backgroundColor: colors.primaryTint,
                            borderRadius: radii.md,
                          },
                        ]}
                      >
                        {channelMeta.icon}
                        <Text
                          style={[
                            typography.micro,
                            {
                              color: colors.primary,
                              fontFamily: fontFamilies.semibold,
                            },
                          ]}
                        >
                          {channelMeta.label}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.pillTag,
                          {
                            backgroundColor: colors.muted,
                            borderRadius: radii.md,
                          },
                        ]}
                      >
                        {getGroupIcon(item.recipientGroup)}
                        <Text
                          style={[
                            typography.micro,
                            {
                              color: colors.foreground,
                              fontFamily: fontFamilies.medium,
                            },
                          ]}
                        >
                          {item.recipientGroup === "employees"
                            ? "Team"
                            : item.recipientGroup === "customers"
                              ? "Customers"
                              : "Suppliers"}
                        </Text>
                      </View>
                    </View>

                    <Badge
                      label={item.status.toUpperCase()}
                      variant={statusVariant}
                    />
                  </View>

                  {item.subject ? (
                    <Text
                      style={[
                        typography.bodySemibold,
                        { color: colors.foreground },
                      ]}
                    >
                      {item.subject}
                    </Text>
                  ) : null}

                  <Text
                    style={[typography.body, { color: colors.mutedForeground }]}
                  >
                    {item.content}
                  </Text>

                  <View
                    style={[styles.divider, { backgroundColor: colors.border }]}
                  />

                  <View style={styles.cardFooter}>
                    <Text
                      style={[
                        typography.micro,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      By {item.senderName} · {item.recipientCount} recipient
                      {item.recipientCount === 1 ? "" : "s"}
                    </Text>
                    <Text
                      style={[
                        typography.micro,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {formatDateTime(item.createdAt)}
                    </Text>
                  </View>
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<MessageSquare size={36} color={colors.mutedForeground} />}
              title="No messages sent yet"
              description="Send shift updates to your team or queue customer & supplier announcements."
              action={
                <Button
                  title="Send first message"
                  size="sm"
                  leftIcon={<Plus size={15} color="#FFFFFF" />}
                  onPress={openCompose}
                />
              }
            />
          }
        />
      )}

      {/* Compose Broadcast Modal */}
      <Modal
        visible={composeOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setComposeOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.card,
                borderTopLeftRadius: radii["2xl"],
                borderTopRightRadius: radii["2xl"],
                borderColor: colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.modalHeader,
                {
                  borderBottomColor: colors.border,
                  paddingHorizontal: spacing.base,
                  paddingVertical: spacing.md,
                },
              ]}
            >
              <Text style={[typography.titleSm, { color: colors.foreground }]}>
                Compose Broadcast
              </Text>
              <Pressable onPress={() => setComposeOpen(false)} hitSlop={10}>
                <X size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                padding: spacing.base,
                gap: spacing.md,
                paddingBottom: spacing["2xl"],
              }}
            >
              <View style={{ gap: 6 }}>
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  Audience
                </Text>
                <View style={styles.optionRow}>
                  {GROUP_OPTIONS.map((opt) => {
                    const active = recipientGroup === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => handleSelectGroup(opt.value)}
                        style={[
                          styles.optionChip,
                          {
                            backgroundColor: active
                              ? colors.primaryTint
                              : colors.background,
                            borderColor: active
                              ? colors.primary
                              : colors.border,
                            borderRadius: radii.lg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            typography.caption,
                            {
                              color: active
                                ? colors.primary
                                : colors.foreground,
                              fontFamily: active
                                ? fontFamilies.bold
                                : fontFamilies.medium,
                            },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: 6 }}>
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  Delivery Channel
                </Text>
                <View style={styles.optionRow}>
                  {CHANNEL_OPTIONS.map((opt) => {
                    const active = channel === opt.value;
                    const disabled =
                      opt.value === "in_app" && recipientGroup !== "employees";
                    return (
                      <Pressable
                        key={opt.value}
                        disabled={disabled}
                        onPress={() => handleSelectChannel(opt.value)}
                        style={[
                          styles.optionChip,
                          {
                            backgroundColor: active
                              ? colors.primaryTint
                              : colors.background,
                            borderColor: active
                              ? colors.primary
                              : colors.border,
                            borderRadius: radii.lg,
                            opacity: disabled ? 0.45 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            typography.caption,
                            {
                              color: active
                                ? colors.primary
                                : colors.foreground,
                              fontFamily: active
                                ? fontFamilies.bold
                                : fontFamilies.medium,
                            },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {channel !== "in_app" ? (
                  <Text
                    style={[
                      typography.micro,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Queued locally on device until remote SMS/Email gateway sync
                    is connected.
                  </Text>
                ) : null}
              </View>

              <View style={{ gap: 6 }}>
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  {channel === "email"
                    ? "Subject (required)"
                    : "Title / Subject"}
                </Text>
                <Input
                  value={subject}
                  onChangeText={setSubject}
                  placeholder={
                    channel === "in_app"
                      ? "e.g., Afternoon Shift Update"
                      : "Campaign subject..."
                  }
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  Message
                </Text>
                <Input
                  value={content}
                  onChangeText={setContent}
                  placeholder="Write your announcement or message..."
                  multiline
                  numberOfLines={4}
                  containerStyle={{
                    height: 112,
                    alignItems: "flex-start",
                    paddingVertical: 10,
                  }}
                  style={{ textAlignVertical: "top" }}
                />
              </View>

              {/* Eligible Recipients Selector */}
              <View style={{ gap: 8 }}>
                <View style={styles.recipientsHeader}>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Eligible Recipients ({effectiveTargetIds.length}/
                    {eligibleRecipients.length})
                  </Text>
                  {selectedIds !== null ? (
                    <Pressable onPress={() => setSelectedIds(null)}>
                      <Text
                        style={[
                          typography.micro,
                          {
                            color: colors.primary,
                            fontFamily: fontFamilies.semibold,
                          },
                        ]}
                      >
                        Select all
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {loadingRecipients ? (
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Loading recipients...
                  </Text>
                ) : eligibleRecipients.length === 0 ? (
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.warningText },
                    ]}
                  >
                    No recipients in this group have a valid{" "}
                    {channel === "email"
                      ? "email address"
                      : channel === "sms"
                        ? "phone number"
                        : "account"}
                    .
                  </Text>
                ) : (
                  <View
                    style={[
                      styles.recipientListBox,
                      {
                        borderColor: colors.border,
                        borderRadius: radii.lg,
                        backgroundColor: colors.background,
                      },
                    ]}
                  >
                    {eligibleRecipients.map((r, idx) => {
                      const checked = effectiveTargetIds.includes(r.id);
                      return (
                        <React.Fragment key={r.id}>
                          {idx > 0 ? (
                            <View
                              style={[
                                styles.divider,
                                { backgroundColor: colors.border },
                              ]}
                            />
                          ) : null}
                          <Pressable
                            onPress={() => toggleRecipient(r.id)}
                            style={styles.recipientRow}
                          >
                            {checked ? (
                              <CheckSquare size={16} color={colors.primary} />
                            ) : (
                              <Square
                                size={16}
                                color={colors.mutedForeground}
                              />
                            )}
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text
                                numberOfLines={1}
                                style={[
                                  typography.bodyMedium,
                                  { color: colors.foreground },
                                ]}
                              >
                                {r.name}
                              </Text>
                              {r.subtitle ? (
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    typography.micro,
                                    { color: colors.mutedForeground },
                                  ]}
                                >
                                  {r.subtitle}
                                </Text>
                              ) : null}
                            </View>
                          </Pressable>
                        </React.Fragment>
                      );
                    })}
                  </View>
                )}
              </View>

              {formError ? (
                <View
                  style={[
                    styles.errorBanner,
                    {
                      backgroundColor: colors.dangerTint,
                      borderColor: colors.dangerBorder,
                      borderRadius: radii.lg,
                      padding: spacing.sm + 2,
                    },
                  ]}
                >
                  <Text
                    style={[typography.caption, { color: colors.dangerText }]}
                  >
                    {formError}
                  </Text>
                </View>
              ) : null}

              <Button
                title={
                  channel === "in_app"
                    ? `Send to ${effectiveTargetIds.length} team member${effectiveTargetIds.length === 1 ? "" : "s"}`
                    : `Queue ${channel.toUpperCase()} (${effectiveTargetIds.length})`
                }
                loading={sending}
                disabled={eligibleRecipients.length === 0}
                leftIcon={<Send size={15} color="#FFFFFF" />}
                onPress={() => void handleSend()}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryBar: {
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  errorBanner: {
    borderWidth: 1,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  badgeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pillTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    maxHeight: "88%",
    borderTopWidth: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionRow: {
    flexDirection: "row",
    gap: 8,
  },
  optionChip: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 9,
    alignItems: "center",
  },
  recipientsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recipientListBox: {
    borderWidth: 1,
    overflow: "hidden",
  },
  recipientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
