import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Mail,
  MapPin,
  Monitor,
  Moon,
  Palette,
  Percent,
  Phone,
  RotateCcw,
  Sun,
} from "lucide-react-native";
import { useAuth } from "@/api/AuthProvider";
import { DemoBanner } from "@/components/DemoBanner";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  SegmentedTabs,
} from "@/components/ui";
import {
  DEFAULT_ACCENT_COLOR,
  normalizeHexColor,
  useTheme,
  type ThemePreference,
} from "@/theme";

type SettingsTabValue = "business" | "appearance";

const CURRENCY_OPTIONS = ["GHS", "USD", "EUR", "GBP", "NGN"] as const;

const ACCENT_PRESETS: ReadonlyArray<{ label: string; hex: string }> = [
  { label: "Blue", hex: "#3B82F6" },
  { label: "Ocean", hex: "#196B94" },
  { label: "Emerald", hex: "#10B981" },
  { label: "Violet", hex: "#8B5CF6" },
  { label: "Amber", hex: "#F59E0B" },
  { label: "Rose", hex: "#E11D48" },
];

const THEME_CHOICES: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  description: string;
}> = [
  { value: "light", label: "Light", description: "Bright daytime surfaces" },
  { value: "dark", label: "Dark", description: "Low-glare night theme" },
  { value: "system", label: "System", description: "Follow device setting" },
];

function formatTaxPercentInput(taxRateDecimal: number | undefined): string {
  const pct = Number(((taxRateDecimal ?? 0) * 100).toFixed(2));
  return String(pct);
}

function ThemePreviewMini({
  variant,
  accent,
}: {
  variant: ThemePreference;
  accent: string;
}) {
  if (variant === "system") {
    return (
      <View style={styles.previewFrame}>
        <View style={[styles.previewHalf, { backgroundColor: "#F5F5F5" }]}>
          <View style={[styles.previewCardMock, { backgroundColor: "#FFFFFF" }]}>
            <View style={[styles.previewDot, { backgroundColor: accent }]} />
            <View style={[styles.previewLine, { backgroundColor: "#CBD5E1" }]} />
          </View>
          <View style={[styles.previewLineShort, { backgroundColor: "#94A3B8" }]} />
        </View>
        <View style={[styles.previewHalf, { backgroundColor: "#070B13" }]}>
          <View style={[styles.previewCardMock, { backgroundColor: "#0F172A" }]}>
            <View style={[styles.previewDot, { backgroundColor: accent }]} />
            <View style={[styles.previewLine, { backgroundColor: "#334155" }]} />
          </View>
          <View style={[styles.previewLineShort, { backgroundColor: "#475569" }]} />
        </View>
      </View>
    );
  }

  const isDark = variant === "dark";
  return (
    <View
      style={[
        styles.previewFrame,
        { backgroundColor: isDark ? "#070B13" : "#F5F5F5", padding: 7 },
      ]}
    >
      <View
        style={[
          styles.previewSingleInner,
          { backgroundColor: isDark ? "#0F172A" : "#FFFFFF" },
        ]}
      >
        <View style={styles.previewMockRow}>
          <View style={[styles.previewDot, { backgroundColor: accent }]} />
          <View
            style={[
              styles.previewLine,
              { backgroundColor: isDark ? "#334155" : "#CBD5E1", flex: 1 },
            ]}
          />
        </View>
        <View
          style={[
            styles.previewLineShort,
            { backgroundColor: isDark ? "#1E293B" : "#E2E8F0", width: "70%" },
          ]}
        />
        <View
          style={[
            styles.previewPillMock,
            { backgroundColor: accent },
          ]}
        />
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const {
    theme,
    preference,
    accentColor,
    setPreference,
    setAccentColor,
  } = useTheme();
  const { store, updateBusinessSettings } = useAuth();
  const { colors, spacing, typography, radii, fontFamilies } = theme;
  const [activeTab, setActiveTab] = useState<SettingsTabValue>("business");

  const settingsTabs = useMemo(
    () => [
      {
        value: "business" as const,
        label: "Business Info",
        icon: (active: boolean) => (
          <Building2
            size={15}
            color={active ? colors.primaryForeground : colors.mutedForeground}
          />
        ),
      },
      {
        value: "appearance" as const,
        label: "Appearance",
        icon: (active: boolean) => (
          <Palette
            size={15}
            color={active ? colors.primaryForeground : colors.mutedForeground}
          />
        ),
      },
    ],
    [colors.primaryForeground, colors.mutedForeground],
  );

  // Business Info state
  const [storeName, setStoreName] = useState(store?.storeName ?? "Inventory Pro");
  const [storeAddress, setStoreAddress] = useState(
    store?.storeAddress ?? "AK-459-6364, Kumasi",
  );
  const [storePhone, setStorePhone] = useState(store?.storePhone ?? "");
  const [storeEmail, setStoreEmail] = useState(store?.storeEmail ?? "");
  const [currency, setCurrency] = useState(store?.currency ?? "GHS");
  const [taxPercentText, setTaxPercentText] = useState(
    formatTaxPercentInput(store?.taxRate ?? 0.01),
  );
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [businessSavedMsg, setBusinessSavedMsg] = useState<string | null>(null);

  // Appearance hex input state
  const [hexInput, setHexInput] = useState(accentColor);
  const [appearanceError, setAppearanceError] = useState<string | null>(null);
  const [appearanceSavedMsg, setAppearanceSavedMsg] = useState<string | null>(null);

  // Keep hex input synchronized when persisted accent color loads
  useEffect(() => {
    setHexInput(accentColor);
  }, [accentColor]);

  // Baseline snapshot from store for dirty tracking
  const initialBusiness = useMemo(
    () => ({
      storeName: store?.storeName ?? "Inventory Pro",
      storeAddress: store?.storeAddress ?? "AK-459-6364, Kumasi",
      storePhone: store?.storePhone ?? "",
      storeEmail: store?.storeEmail ?? "",
      currency: store?.currency ?? "GHS",
      taxPercentText: formatTaxPercentInput(store?.taxRate ?? 0.01),
    }),
    [store],
  );

  const isBusinessDirty =
    storeName.trim() !== initialBusiness.storeName.trim() ||
    storeAddress.trim() !== initialBusiness.storeAddress.trim() ||
    storePhone.trim() !== initialBusiness.storePhone.trim() ||
    storeEmail.trim() !== initialBusiness.storeEmail.trim() ||
    currency !== initialBusiness.currency ||
    taxPercentText.trim() !== initialBusiness.taxPercentText.trim();

  // Sync form inputs when store updates externally and form isn't dirty
  useEffect(() => {
    if (!store || isBusinessDirty) return;
    setStoreName(store.storeName);
    setStoreAddress(store.storeAddress);
    setStorePhone(store.storePhone);
    setStoreEmail(store.storeEmail);
    setCurrency(store.currency || "GHS");
    setTaxPercentText(formatTaxPercentInput(store.taxRate));
  }, [store]);

  const handleSaveBusinessInfo = async () => {
    setBusinessError(null);
    setBusinessSavedMsg(null);

    const cleanName = storeName.trim();
    const cleanAddress = storeAddress.trim();
    const cleanPhone = storePhone.trim();
    const cleanEmail = storeEmail.trim();
    const parsedPercent = Number(taxPercentText.replace(/,/g, ".").trim());

    if (cleanName.length < 2) {
      setBusinessError("Business name must be at least 2 characters.");
      return;
    }
    if (cleanAddress.length < 5) {
      setBusinessError("Address must be at least 5 characters.");
      return;
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setBusinessError("Please enter a valid email address or leave it blank.");
      return;
    }
    if (!Number.isFinite(parsedPercent) || parsedPercent < 0 || parsedPercent > 100) {
      setBusinessError("Default tax rate must be a percentage between 0 and 100.");
      return;
    }

    setSavingBusiness(true);
    try {
      const updated = await updateBusinessSettings({
        storeName: cleanName,
        storeAddress: cleanAddress,
        storePhone: cleanPhone,
        storeEmail: cleanEmail,
        currency,
        taxRate: Number((parsedPercent / 100).toFixed(4)),
      });
      setStoreName(updated.storeName);
      setStoreAddress(updated.storeAddress);
      setStorePhone(updated.storePhone);
      setStoreEmail(updated.storeEmail);
      setCurrency(updated.currency);
      setTaxPercentText(formatTaxPercentInput(updated.taxRate));
      setBusinessSavedMsg("Business details updated and saved.");
    } catch (err) {
      setBusinessError(
        err instanceof Error ? err.message : "Failed to save business info.",
      );
    } finally {
      setSavingBusiness(false);
    }
  };

  const handleSelectTheme = (pref: ThemePreference) => {
    setAppearanceError(null);
    setPreference(pref);
    setAppearanceSavedMsg(
      `Theme set to ${pref.charAt(0).toUpperCase() + pref.slice(1)}.`,
    );
  };

  const handleSelectAccent = (hex: string) => {
    const normalized = normalizeHexColor(hex);
    if (!normalized) {
      setAppearanceError("Enter a valid 6-digit hex color (e.g. #3B82F6).");
      return;
    }
    setAppearanceError(null);
    setHexInput(normalized);
    setAccentColor(normalized);
    setAppearanceSavedMsg(`Accent color applied (${normalized}).`);
  };

  const handleResetAppearance = () => {
    setAppearanceError(null);
    setPreference("system");
    setHexInput(DEFAULT_ACCENT_COLOR);
    setAccentColor(DEFAULT_ACCENT_COLOR);
    setAppearanceSavedMsg("Appearance reset to System theme & default blue.");
  };

  const normalizedTypedHex = normalizeHexColor(hexInput);
  const canApplyTypedHex =
    normalizedTypedHex !== null && normalizedTypedHex !== accentColor;

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <DemoBanner
        title="Settings"
        subtitle={store?.storeName || "Business info & appearance"}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: spacing.base,
            gap: spacing.base,
            paddingBottom: spacing["3xl"],
          }}
        >
          <SegmentedTabs
            options={settingsTabs}
            value={activeTab}
            onChange={setActiveTab}
          />

          {/* Section 1: Business Info */}
          {activeTab === "business" ? (
          <Card>
            <CardHeader bordered>
              <View style={styles.sectionTitleRow}>
                <View
                  style={[
                    styles.sectionIconBox,
                    {
                      backgroundColor: colors.primaryTint,
                      borderRadius: radii.lg,
                    },
                  ]}
                >
                  <Building2 size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <CardTitle>Business Info</CardTitle>
                  <CardDescription>
                    Store identity, receipt contact details, currency, and tax rate.
                  </CardDescription>
                </View>
              </View>
            </CardHeader>

            <CardContent style={{ paddingTop: spacing.base, gap: spacing.md }}>
              <View style={styles.fieldGroup}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Business name *
                </Text>
                <Input
                  value={storeName}
                  onChangeText={(text) => {
                    setStoreName(text);
                    setBusinessError(null);
                    setBusinessSavedMsg(null);
                  }}
                  placeholder="Inventory Pro"
                  leftIcon={<Building2 size={16} color={colors.mutedForeground} />}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Store address *
                </Text>
                <Input
                  value={storeAddress}
                  onChangeText={(text) => {
                    setStoreAddress(text);
                    setBusinessError(null);
                    setBusinessSavedMsg(null);
                  }}
                  placeholder="Street, digital address, city"
                  multiline
                  numberOfLines={3}
                  leftIcon={
                    <MapPin
                      size={16}
                      color={colors.mutedForeground}
                      style={{ marginTop: 3 }}
                    />
                  }
                  containerStyle={{
                    height: 84,
                    alignItems: "flex-start",
                    paddingVertical: 10,
                  }}
                  style={{ textAlignVertical: "top" }}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Phone number
                </Text>
                <Input
                  value={storePhone}
                  onChangeText={(text) => {
                    setStorePhone(text);
                    setBusinessError(null);
                    setBusinessSavedMsg(null);
                  }}
                  placeholder="+233 54 000 0000"
                  keyboardType="phone-pad"
                  leftIcon={<Phone size={16} color={colors.mutedForeground} />}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Email address
                </Text>
                <Input
                  value={storeEmail}
                  onChangeText={(text) => {
                    setStoreEmail(text);
                    setBusinessError(null);
                    setBusinessSavedMsg(null);
                  }}
                  placeholder="store@company.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  leftIcon={<Mail size={16} color={colors.mutedForeground} />}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Currency
                </Text>
                <View style={styles.currencyRow}>
                  {CURRENCY_OPTIONS.map((code) => {
                    const selected = currency === code;
                    return (
                      <Pressable
                        key={code}
                        onPress={() => {
                          setCurrency(code);
                          setBusinessError(null);
                          setBusinessSavedMsg(null);
                        }}
                        style={({ pressed }) => [
                          styles.currencyChip,
                          {
                            backgroundColor: selected
                              ? colors.primaryTint
                              : colors.cardMuted,
                            borderColor: selected ? colors.primary : colors.border,
                            borderRadius: radii.lg,
                            opacity: pressed ? 0.8 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            typography.caption,
                            {
                              color: selected ? colors.primary : colors.foreground,
                              fontFamily: selected
                                ? fontFamilies.bold
                                : fontFamilies.semibold,
                            },
                          ]}
                        >
                          {code}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.foreground, fontFamily: fontFamilies.semibold },
                    ]}
                  >
                    Default tax rate (%)
                  </Text>
                  <Text
                    style={[
                      typography.micro,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Applied to new POS sales
                  </Text>
                </View>
                <Input
                  value={taxPercentText}
                  onChangeText={(text) => {
                    setTaxPercentText(text);
                    setBusinessError(null);
                    setBusinessSavedMsg(null);
                  }}
                  placeholder="1"
                  keyboardType="decimal-pad"
                  leftIcon={<Percent size={16} color={colors.mutedForeground} />}
                />
              </View>

              {businessError ? (
                <View
                  style={[
                    styles.feedbackBanner,
                    {
                      backgroundColor: colors.dangerTint,
                      borderColor: colors.dangerBorder,
                      borderRadius: radii.lg,
                    },
                  ]}
                >
                  <AlertCircle size={15} color={colors.dangerText} />
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.dangerText, flex: 1 },
                    ]}
                  >
                    {businessError}
                  </Text>
                </View>
              ) : null}

              {businessSavedMsg ? (
                <View
                  style={[
                    styles.feedbackBanner,
                    {
                      backgroundColor: colors.successTint,
                      borderColor: colors.successBorder,
                      borderRadius: radii.lg,
                    },
                  ]}
                >
                  <CheckCircle2 size={15} color={colors.successText} />
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.successText, flex: 1 },
                    ]}
                  >
                    {businessSavedMsg}
                  </Text>
                </View>
              ) : null}
            </CardContent>

            <CardFooter style={styles.footerRow}>
              <Text
                style={[
                  typography.caption,
                  { color: colors.mutedForeground, flex: 1 },
                ]}
              >
                {isBusinessDirty ? "Unsaved changes" : "Up to date"}
              </Text>
              <Button
                title={savingBusiness ? "Saving..." : "Save Business Info"}
                size="sm"
                loading={savingBusiness}
                disabled={!isBusinessDirty || savingBusiness}
                onPress={() => void handleSaveBusinessInfo()}
              />
            </CardFooter>
          </Card>
          ) : (
          /* Section 2: Appearance */
          <Card>
            <CardHeader bordered>
              <View style={styles.sectionTitleRow}>
                <View
                  style={[
                    styles.sectionIconBox,
                    {
                      backgroundColor: colors.primaryTint,
                      borderRadius: radii.lg,
                    },
                  ]}
                >
                  <Palette size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <CardTitle>Appearance</CardTitle>
                  <CardDescription>
                    Choose your theme mode and highlight accent color.
                  </CardDescription>
                </View>
              </View>
            </CardHeader>

            <CardContent style={{ paddingTop: spacing.base, gap: spacing.lg }}>
              {/* Theme Mode 3-Tile Selector */}
              <View style={styles.fieldGroup}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Theme
                </Text>
                <View style={styles.themeGrid}>
                  {THEME_CHOICES.map((item) => {
                    const selected = preference === item.value;
                    const Icon =
                      item.value === "light"
                        ? Sun
                        : item.value === "dark"
                          ? Moon
                          : Monitor;

                    return (
                      <Pressable
                        key={item.value}
                        onPress={() => handleSelectTheme(item.value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={({ pressed }) => [
                          styles.themeTile,
                          {
                            borderRadius: radii.xl,
                            borderColor: selected ? colors.primary : colors.border,
                            borderWidth: selected ? 2 : 1,
                            backgroundColor: selected
                              ? colors.primaryTint
                              : colors.cardMuted,
                            opacity: pressed ? 0.85 : 1,
                          },
                        ]}
                      >
                        <ThemePreviewMini
                          variant={item.value}
                          accent={accentColor}
                        />
                        <View style={styles.themeTileFooter}>
                          <Icon
                            size={14}
                            color={
                              selected ? colors.primary : colors.mutedForeground
                            }
                          />
                          <Text
                            style={[
                              typography.caption,
                              {
                                color: selected
                                  ? colors.primary
                                  : colors.foreground,
                                fontFamily: selected
                                  ? fontFamilies.bold
                                  : fontFamilies.semibold,
                              },
                            ]}
                          >
                            {item.label}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Accent Color Picker */}
              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.foreground, fontFamily: fontFamilies.semibold },
                    ]}
                  >
                    Accent color
                  </Text>
                  <View style={styles.activeColorPill}>
                    <View
                      style={[
                        styles.activeColorDot,
                        {
                          backgroundColor: accentColor,
                          borderColor: colors.border,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        typography.micro,
                        {
                          color: colors.mutedForeground,
                          fontFamily: fontFamilies.semibold,
                        },
                      ]}
                    >
                      {accentColor}
                    </Text>
                  </View>
                </View>

                <View style={styles.swatchRow}>
                  {ACCENT_PRESETS.map((preset) => {
                    const selected = accentColor === preset.hex;
                    return (
                      <Pressable
                        key={preset.hex}
                        onPress={() => handleSelectAccent(preset.hex)}
                        accessibilityLabel={`${preset.label} accent color`}
                        style={({ pressed }) => [
                          styles.swatchButton,
                          {
                            backgroundColor: preset.hex,
                            borderColor: selected
                              ? colors.foreground
                              : "transparent",
                            transform: [{ scale: pressed ? 0.94 : 1 }],
                          },
                        ]}
                      >
                        {selected ? <Check size={16} color="#FFFFFF" /> : null}
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.hexInputRow}>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={hexInput}
                      onChangeText={(text) => {
                        setHexInput(text.toUpperCase());
                        setAppearanceError(null);
                        setAppearanceSavedMsg(null);
                      }}
                      placeholder="#3B82F6"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={7}
                      leftIcon={
                        <View
                          style={[
                            styles.hexPreviewSquare,
                            {
                              backgroundColor:
                                normalizedTypedHex ?? accentColor,
                              borderColor: colors.border,
                            },
                          ]}
                        />
                      }
                    />
                  </View>
                  <Button
                    title="Apply"
                    size="default"
                    variant="outline"
                    disabled={!canApplyTypedHex}
                    onPress={() => handleSelectAccent(hexInput)}
                  />
                </View>
              </View>

              {appearanceError ? (
                <View
                  style={[
                    styles.feedbackBanner,
                    {
                      backgroundColor: colors.dangerTint,
                      borderColor: colors.dangerBorder,
                      borderRadius: radii.lg,
                    },
                  ]}
                >
                  <AlertCircle size={15} color={colors.dangerText} />
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.dangerText, flex: 1 },
                    ]}
                  >
                    {appearanceError}
                  </Text>
                </View>
              ) : null}

              {appearanceSavedMsg ? (
                <View
                  style={[
                    styles.feedbackBanner,
                    {
                      backgroundColor: colors.successTint,
                      borderColor: colors.successBorder,
                      borderRadius: radii.lg,
                    },
                  ]}
                >
                  <CheckCircle2 size={15} color={colors.successText} />
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.successText, flex: 1 },
                    ]}
                  >
                    {appearanceSavedMsg}
                  </Text>
                </View>
              ) : null}
            </CardContent>

            <CardFooter style={styles.footerRow}>
              <Text
                style={[
                  typography.caption,
                  { color: colors.mutedForeground, flex: 1 },
                ]}
              >
                Saved automatically on this device
              </Text>
              <Button
                title="Reset"
                size="sm"
                variant="ghost"
                leftIcon={<RotateCcw size={14} color={colors.foreground} />}
                disabled={
                  preference === "system" && accentColor === DEFAULT_ACCENT_COLOR
                }
                onPress={handleResetAppearance}
              />
            </CardFooter>
          </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionIconBox: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldGroup: {
    gap: 6,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  currencyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  currencyChip: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  themeGrid: {
    flexDirection: "row",
    gap: 10,
  },
  themeTile: {
    flex: 1,
    padding: 8,
    gap: 8,
  },
  themeTileFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  previewFrame: {
    height: 54,
    borderRadius: 8,
    overflow: "hidden",
    flexDirection: "row",
  },
  previewHalf: {
    flex: 1,
    padding: 5,
    justifyContent: "space-between",
  },
  previewSingleInner: {
    flex: 1,
    borderRadius: 5,
    padding: 6,
    justifyContent: "space-between",
  },
  previewCardMock: {
    borderRadius: 4,
    padding: 4,
    gap: 3,
  },
  previewMockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 9999,
  },
  previewLine: {
    height: 4,
    borderRadius: 2,
  },
  previewLineShort: {
    height: 4,
    borderRadius: 2,
    width: "65%",
  },
  previewPillMock: {
    height: 6,
    width: 18,
    borderRadius: 9999,
    alignSelf: "flex-end",
  },
  activeColorPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  activeColorDot: {
    width: 12,
    height: 12,
    borderRadius: 9999,
    borderWidth: 1,
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 2,
  },
  swatchButton: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  hexInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  hexPreviewSquare: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
  },
});
