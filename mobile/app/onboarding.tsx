import React, { useCallback, useRef, useState } from "react";
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  ChevronLeft,
  FileSpreadsheet,
  Package,
  Printer,
  Receipt,
  ScanBarcode,
  ShoppingCart,
} from "lucide-react-native";
import { useAuth } from "@/api/AuthProvider";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import { useTheme } from "@/theme";

interface OnboardingStep {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: (color: string) => React.ReactNode;
  highlights: ReadonlyArray<{
    icon: (color: string) => React.ReactNode;
    title: string;
    subtitle: string;
  }>;
}

const ONBOARDING_STEPS: ReadonlyArray<OnboardingStep> = [
  {
    id: "inventory",
    eyebrow: "STEP 1 OF 3 · INVENTORY CONTROL",
    title: "Track stock levels before shelves run dry",
    description:
      "Monitor live quantities, configure custom low-stock alerts, and bulk-import catalogs directly from Excel or CSV files.",
    icon: (color) => <Package size={36} color={color} />,
    highlights: [
      {
        icon: (color) => <AlertTriangle size={16} color={color} />,
        title: "Configurable low-stock alerts",
        subtitle: "Instant highlights when items dip below your threshold",
      },
      {
        icon: (color) => <FileSpreadsheet size={16} color={color} />,
        title: "Excel & CSV batch import",
        subtitle: "Add dozens of SKUs and categories in one tap",
      },
    ],
  },
  {
    id: "pos-scan",
    eyebrow: "STEP 2 OF 3 · FAST POS CHECKOUT",
    title: "Scan barcodes straight into your sales cart",
    description:
      "Use your device camera for instant EAN, UPC, Code 128, or QR scanning and accept Cash, MoMo, Bank, or Cheque payments.",
    icon: (color) => <ScanBarcode size={36} color={color} />,
    highlights: [
      {
        icon: (color) => <ShoppingCart size={16} color={color} />,
        title: "Camera scan-to-cart workflow",
        subtitle: "Continuous barcode scanning with live quantity steppers",
      },
      {
        icon: (color) => <Check size={16} color={color} />,
        title: "Multi-tender & change calculator",
        subtitle: "Automatic cash change calculation and discount support",
      },
    ],
  },
  {
    id: "receipts-reports",
    eyebrow: "STEP 3 OF 3 · RECEIPTS & INSIGHTS",
    title: "Offline-first receipts, refunds, and reports",
    description:
      "Print or share PDF receipts, process refunds with optional stock restocking, and review sales summaries and audit logs anytime.",
    icon: (color) => <Receipt size={36} color={color} />,
    highlights: [
      {
        icon: (color) => <Printer size={16} color={color} />,
        title: "PDF & printable POS receipts",
        subtitle: "Export or share branded receipts straight from the counter",
      },
      {
        icon: (color) => <BarChart3 size={16} color={color} />,
        title: "Profit reports & refund restocking",
        subtitle: "Every transaction saved securely in on-device SQLite",
      },
    ],
  },
];

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const { completeOnboarding } = useAuth();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const listRef = useRef<FlatList<OnboardingStep>>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;

  const handleFinish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await completeOnboarding();
    } finally {
      setFinishing(false);
    }
  }, [completeOnboarding, finishing]);

  const goToStep = useCallback((nextIndex: number) => {
    const clamped = Math.max(
      0,
      Math.min(ONBOARDING_STEPS.length - 1, nextIndex),
    );
    setStepIndex(clamped);
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
  }, []);

  const syncStepFromOffset = useCallback(
    (offsetX: number) => {
      if (width <= 0) return;
      const next = Math.round(offsetX / width);
      if (next >= 0 && next < ONBOARDING_STEPS.length) {
        setStepIndex(next);
      }
    },
    [width],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncStepFromOffset(event.nativeEvent.contentOffset.x);
    },
    [syncStepFromOffset],
  );

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      {/* Top Bar */}
      <View
        style={[
          styles.topBar,
          {
            paddingHorizontal: spacing.base,
            paddingTop: spacing.sm,
            paddingBottom: spacing.xs,
          },
        ]}
      >
        <Badge label="Inventory Pro" variant="outline" />

        {!isLastStep ? (
          <Pressable
            onPress={() => void handleFinish()}
            disabled={finishing}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            style={({ pressed }) => [
              styles.skipBtn,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text
              style={[
                typography.bodySemibold,
                { color: colors.mutedForeground },
              ]}
            >
              Skip
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Horizontal 3-Step Pager */}
      <FlatList
        ref={listRef}
        data={ONBOARDING_STEPS}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScroll}
        renderItem={({ item }) => (
          <View
            style={[
              styles.slide,
              {
                width,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.base,
                gap: spacing.lg,
              },
            ]}
          >
            {/* Hero Visual Card */}
            <Card
              style={{
                borderColor: colors.border,
                backgroundColor: colors.card,
              }}
            >
              <CardContent
                style={{
                  paddingTop: spacing.xl,
                  paddingBottom: spacing.xl,
                  alignItems: "center",
                  gap: spacing.lg,
                }}
              >
                <View
                  style={[
                    styles.heroRingOuter,
                    {
                      backgroundColor: colors.primaryTint,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.heroIconBox,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.primary,
                        borderRadius: radii["2xl"],
                      },
                    ]}
                  >
                    {item.icon(colors.primary)}
                  </View>
                </View>

                <View style={styles.highlightStack}>
                  {item.highlights.map((h) => (
                    <View
                      key={h.title}
                      style={[
                        styles.highlightRow,
                        {
                          backgroundColor: colors.cardMuted,
                          borderColor: colors.border,
                          borderRadius: radii.xl,
                          padding: spacing.md,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.highlightIcon,
                          {
                            backgroundColor: colors.primaryTint,
                            borderRadius: radii.lg,
                          },
                        ]}
                      >
                        {h.icon(colors.primary)}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            typography.bodySemibold,
                            { color: colors.foreground },
                          ]}
                        >
                          {h.title}
                        </Text>
                        <Text
                          style={[
                            typography.caption,
                            { color: colors.mutedForeground, marginTop: 1 },
                          ]}
                        >
                          {h.subtitle}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </CardContent>
            </Card>

            {/* Copy Block */}
            <View style={{ gap: spacing.xs + 2 }}>
              <Text
                style={[
                  typography.micro,
                  {
                    color: colors.primary,
                    fontFamily: fontFamilies.bold,
                    letterSpacing: 0.8,
                  },
                ]}
              >
                {item.eyebrow}
              </Text>
              <Text style={[typography.titleLg, { color: colors.foreground }]}>
                {item.title}
              </Text>
              <Text
                style={[
                  typography.body,
                  { color: colors.mutedForeground, lineHeight: 21 },
                ]}
              >
                {item.description}
              </Text>
            </View>
          </View>
        )}
      />

      {/* Footer: Progress Dots & Navigation Buttons */}
      <View
        style={[
          styles.footer,
          {
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: spacing.base,
            gap: spacing.base,
          },
        ]}
      >
        <View style={styles.dotsRow}>
          {ONBOARDING_STEPS.map((step, idx) => {
            const active = idx === stepIndex;
            return (
              <Pressable
                key={step.id}
                onPress={() => goToStep(idx)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Go to step ${idx + 1}`}
                style={[
                  styles.dot,
                  {
                    width: active ? 26 : 8,
                    backgroundColor: active ? colors.primary : colors.border,
                  },
                ]}
              />
            );
          })}
        </View>

        <View style={styles.ctaRow}>
          {stepIndex > 0 ? (
            <Button
              title="Back"
              variant="outline"
              size="lg"
              leftIcon={<ChevronLeft size={17} color={colors.foreground} />}
              onPress={() => goToStep(stepIndex - 1)}
            />
          ) : null}

          <Button
            title={isLastStep ? "Get Started" : "Next"}
            size="lg"
            style={{ flex: 1 }}
            loading={finishing}
            rightIcon={
              isLastStep ? (
                <Check size={17} color={colors.primaryForeground} />
              ) : (
                <ArrowRight size={17} color={colors.primaryForeground} />
              )
            }
            onPress={() => {
              if (isLastStep) {
                void handleFinish();
              } else {
                goToStep(stepIndex + 1);
              }
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  skipBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  slide: {
    justifyContent: "center",
  },
  heroRingOuter: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  heroIconBox: {
    width: 78,
    height: 78,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  highlightStack: {
    width: "100%",
    gap: 10,
  },
  highlightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
  },
  highlightIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    width: "100%",
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 9999,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
