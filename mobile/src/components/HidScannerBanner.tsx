import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Keyboard, RefreshCw } from "lucide-react-native";
import { useTheme } from "@/theme";
import type { UseHidBarcodeScannerResult } from "@/hooks/useHidBarcodeScanner";

interface HidScannerBannerProps {
  scanner: UseHidBarcodeScannerResult;
  enabled: boolean;
  suspended?: boolean;
  contextHint?: string;
}

export function HidScannerBanner({
  scanner,
  enabled,
  suspended = false,
  contextHint = "Ready for Bluetooth or USB-C barcode gun",
}: HidScannerBannerProps) {
  const { theme } = useTheme();
  const { colors, radii, typography, fontFamilies } = theme;

  if (!enabled) return null;

  return (
    <>
      {/* Zero-footprint soft-keyboard-free capture input for HID keyboard-wedge scanners */}
      <TextInput
        ref={scanner.inputRef}
        {...scanner.inputProps}
        style={styles.hiddenCaptureInput}
      />

      <Pressable
        onPress={scanner.rearm}
        accessibilityRole="button"
        accessibilityLabel="Re-arm HID barcode scanner"
        style={({ pressed }) => [
          styles.banner,
          {
            backgroundColor: suspended
              ? colors.muted
              : scanner.isArmed
                ? colors.successTint
                : colors.warningTint,
            borderColor: suspended
              ? colors.border
              : scanner.isArmed
                ? colors.successBorder
                : colors.warningBorder,
            borderRadius: radii.lg,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Keyboard
          size={15}
          color={
            suspended
              ? colors.mutedForeground
              : scanner.isArmed
                ? colors.successText
                : colors.warningText
          }
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={[
              typography.micro,
              {
                color: suspended
                  ? colors.mutedForeground
                  : scanner.isArmed
                    ? colors.successText
                    : colors.warningText,
                fontFamily: fontFamilies.bold,
              },
            ]}
          >
            {suspended
              ? "HID Scanner Paused (Typing / Modal Active)"
              : scanner.isArmed
                ? "HID Wedge Armed"
                : "Tap Here to Focus HID Scanner"}
          </Text>
          <Text
            numberOfLines={1}
            style={[typography.micro, { color: colors.mutedForeground }]}
          >
            {scanner.lastScan
              ? `Last scan: ${scanner.lastScan}`
              : contextHint}
          </Text>
        </View>
        {!suspended && !scanner.isArmed ? (
          <RefreshCw size={13} color={colors.warningText} />
        ) : null}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  hiddenCaptureInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    left: -100,
    top: -100,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
});
