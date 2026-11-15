import React, { useCallback, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
  type BarcodeType,
} from "expo-camera";
import {
  AlertCircle,
  Barcode,
  Camera,
  CameraOff,
  CheckCircle2,
  Flashlight,
  Keyboard,
  PackagePlus,
  RefreshCw,
  Settings,
  ShoppingCart,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { DEMO_SAMPLE_BARCODES } from "@/api/demoData";
import { DemoBanner } from "@/components/DemoBanner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@/components/ui";
import { useTheme } from "@/theme";
import { LOW_STOCK_THRESHOLD, type ProductItem } from "@/types/domain";
import { formatCurrency } from "@/utils/formatters";

/**
 * Matches SUPPORTED_FORMATS and REPEAT_SCAN_WINDOW_MS in
 * src/components/barcode/barcode-scanner-modal.tsx
 */
const SUPPORTED_BARCODE_TYPES: BarcodeType[] = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "itf14",
  "qr",
  "datamatrix",
];

const REPEAT_SCAN_WINDOW_MS = 1200;

export default function ScanScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [permission, requestPermission] = useCameraPermissions();
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const [scannerPaused, setScannerPaused] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const [manualCode, setManualCode] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [matchedProduct, setMatchedProduct] = useState<ProductItem | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);

  const lastScanTimeRef = useRef(0);
  const isLookingUpRef = useRef(false);

  // Release the camera when navigating away to Product Details or another tab
  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      return () => {
        setIsScreenFocused(false);
        setTorchOn(false);
      };
    }, []),
  );

  const performLookup = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code || isLookingUpRef.current) return;

      isLookingUpRef.current = true;
      setIsLookingUp(true);
      setLastScannedCode(code);
      setNotFoundCode(null);

      try {
        const product = await api.lookupProductByBarcode(code);
        if (product) {
          setMatchedProduct(product);
          setScannerPaused(true);
        } else {
          setMatchedProduct(null);
          setNotFoundCode(code);
        }
      } finally {
        isLookingUpRef.current = false;
        setIsLookingUp(false);
      }
    },
    [api],
  );

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (scannerPaused || isLookingUpRef.current) return;

      const now = Date.now();
      if (now - lastScanTimeRef.current < REPEAT_SCAN_WINDOW_MS) return;
      lastScanTimeRef.current = now;

      if (result.data) {
        void performLookup(result.data);
      }
    },
    [scannerPaused, performLookup],
  );

  const handleResumeScanning = () => {
    setScannerPaused(false);
    setMatchedProduct(null);
    setNotFoundCode(null);
    lastScanTimeRef.current = 0;
  };

  const renderCameraSection = () => {
    if (!permission) {
      return (
        <View style={[styles.permissionBox, { backgroundColor: colors.muted }]}>
          <Camera size={30} color={colors.mutedForeground} />
          <Text style={[typography.body, { color: colors.mutedForeground }]}>
            Checking camera permission...
          </Text>
        </View>
      );
    }

    if (!permission.granted) {
      const deniedPermanently = !permission.canAskAgain;
      return (
        <View
          style={[
            styles.permissionBox,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
              borderRadius: radii.xl,
              padding: spacing.lg,
            },
          ]}
        >
          <View
            style={[
              styles.permissionIconCircle,
              { backgroundColor: colors.dangerTint },
            ]}
          >
            <CameraOff size={26} color={colors.dangerText} />
          </View>

          <Text
            style={[
              typography.subtitle,
              { color: colors.foreground, textAlign: "center" },
            ]}
          >
            {deniedPermanently
              ? "Camera access is disabled"
              : "Camera permission required"}
          </Text>

          <Text
            style={[
              typography.body,
              { color: colors.mutedForeground, textAlign: "center" },
            ]}
          >
            {deniedPermanently
              ? "Enable Camera permission in Android Settings to scan barcodes live, or use manual entry below."
              : "Allow camera access to scan EAN-13, UPC, Code 128, or QR barcodes directly from product packaging."}
          </Text>

          <View style={styles.permissionButtons}>
            {permission.canAskAgain ? (
              <Button
                title="Allow Camera Access"
                leftIcon={<Camera size={16} color="#FFFFFF" />}
                onPress={() => void requestPermission()}
              />
            ) : (
              <Button
                title="Open App Settings"
                leftIcon={<Settings size={16} color="#FFFFFF" />}
                onPress={() => void Linking.openSettings()}
              />
            )}
          </View>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.cameraWrapper,
          {
            borderRadius: radii.xl,
            borderColor: colors.border,
            backgroundColor: "#000000",
          },
        ]}
      >
        {isScreenFocused ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torchOn}
            barcodeScannerSettings={{
              barcodeTypes: SUPPORTED_BARCODE_TYPES,
            }}
            onBarcodeScanned={scannerPaused ? undefined : handleBarcodeScanned}
          />
        ) : null}

        {/* Scanner reticle overlay */}
        <View style={styles.overlay} pointerEvents="none">
          <View
            style={[
              styles.reticle,
              {
                borderColor: scannerPaused ? colors.success : colors.primary,
                borderRadius: radii.lg,
              },
            ]}
          />
          <View style={styles.scanHintPill}>
            <Text style={[typography.caption, { color: "#FFFFFF" }]}>
              {scannerPaused
                ? "Scan paused — review match below"
                : "Align barcode inside frame"}
            </Text>
          </View>
        </View>

        {/* Camera toolbar */}
        <View style={styles.cameraToolbar}>
          <Pressable
            onPress={() => setTorchOn((v) => !v)}
            style={({ pressed }) => [
              styles.overlayBtn,
              {
                backgroundColor: torchOn
                  ? colors.primary
                  : "rgba(15, 23, 42, 0.72)",
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Flashlight size={16} color="#FFFFFF" />
            <Text style={[typography.caption, { color: "#FFFFFF" }]}>
              {torchOn ? "Torch On" : "Torch"}
            </Text>
          </Pressable>

          {scannerPaused ? (
            <Pressable
              onPress={handleResumeScanning}
              style={({ pressed }) => [
                styles.overlayBtn,
                {
                  backgroundColor: "rgba(15, 23, 42, 0.78)",
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <RefreshCw size={15} color="#FFFFFF" />
              <Text style={[typography.caption, { color: "#FFFFFF" }]}>
                Scan Again
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <DemoBanner title="Scan" subtitle="Camera barcode lookup & manual entry" />

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.base,
          paddingBottom: spacing["2xl"],
        }}
      >
        {renderCameraSection()}

        {/* Lookup Result Card */}
        {matchedProduct ? (
          <Card style={{ borderColor: colors.successBorder }}>
            <CardHeader bordered>
              <View style={styles.resultHeader}>
                <View style={styles.resultTitleRow}>
                  <CheckCircle2 size={18} color={colors.successText} />
                  <CardTitle>Product found</CardTitle>
                </View>
                <Badge
                  label={
                    matchedProduct.stockQuantity <= 0
                      ? "Out of Stock"
                      : matchedProduct.stockQuantity < LOW_STOCK_THRESHOLD
                        ? `${matchedProduct.stockQuantity} left`
                        : `${matchedProduct.stockQuantity} in stock`
                  }
                  variant={
                    matchedProduct.stockQuantity <= 0
                      ? "danger"
                      : matchedProduct.stockQuantity < LOW_STOCK_THRESHOLD
                        ? "warning"
                        : "success"
                  }
                />
              </View>
            </CardHeader>

            <CardContent style={{ paddingTop: spacing.md, gap: spacing.md }}>
              <View>
                <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                  {matchedProduct.categoryName} · {matchedProduct.barcode}
                </Text>
                <Text
                  style={[
                    typography.titleXsm,
                    { color: colors.foreground, marginTop: 2 },
                  ]}
                >
                  {matchedProduct.name}
                </Text>
              </View>

              <View
                style={[
                  styles.matchMetrics,
                  {
                    backgroundColor: colors.muted,
                    borderRadius: radii.lg,
                    padding: spacing.md,
                  },
                ]}
              >
                <View>
                  <Text style={[typography.micro, { color: colors.mutedForeground }]}>
                    Unit Price
                  </Text>
                  <Text
                    style={[
                      typography.titleSm,
                      typography.tabular,
                      { color: colors.foreground, fontFamily: fontFamilies.bold },
                    ]}
                  >
                    {formatCurrency(matchedProduct.unitPrice)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[typography.micro, { color: colors.mutedForeground }]}>
                    Available Stock
                  </Text>
                  <Text
                    style={[
                      typography.titleSm,
                      typography.tabular,
                      { color: colors.foreground },
                    ]}
                  >
                    {matchedProduct.stockQuantity} units
                  </Text>
                </View>
              </View>

              <View style={styles.resultActions}>
                <Button
                  title="Details"
                  variant="outline"
                  style={{ flex: 1 }}
                  onPress={() =>
                    router.push({
                      pathname: "/product/[id]",
                      params: { id: matchedProduct.id },
                    })
                  }
                />
                <Button
                  title="Sell Item"
                  style={{ flex: 1 }}
                  disabled={matchedProduct.stockQuantity <= 0}
                  leftIcon={<ShoppingCart size={15} color="#FFFFFF" />}
                  onPress={() =>
                    router.push({
                      pathname: "/sales/new",
                      params: { productId: matchedProduct.id },
                    })
                  }
                />
                <Button
                  title="Clear"
                  variant="ghost"
                  onPress={handleResumeScanning}
                />
              </View>
            </CardContent>
          </Card>
        ) : notFoundCode ? (
          <Card style={{ borderColor: colors.dangerBorder }}>
            <CardContent
              style={{
                paddingTop: spacing.base,
                gap: spacing.md,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <AlertCircle size={22} color={colors.dangerText} />
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodySemibold, { color: colors.foreground }]}>
                    No product matched barcode
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      typography.tabular,
                      { color: colors.mutedForeground, marginTop: 2 },
                    ]}
                  >
                    Code &ldquo;{notFoundCode}&rdquo; was not found in the SQLite product catalog.
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Button
                  title="Add Product"
                  size="sm"
                  style={{ flex: 1 }}
                  leftIcon={<PackagePlus size={15} color="#FFFFFF" />}
                  onPress={() =>
                    router.push({
                      pathname: "/product/new",
                      params: { barcode: notFoundCode },
                    })
                  }
                />
                <Button
                  title="Dismiss"
                  variant="outline"
                  size="sm"
                  onPress={() => setNotFoundCode(null)}
                />
              </View>
            </CardContent>
          </Card>
        ) : null}

        {/* Manual Barcode Entry */}
        <Card>
          <CardHeader bordered>
            <View style={styles.manualHeader}>
              <Keyboard size={16} color={colors.primary} />
              <CardTitle>Manual barcode entry</CardTitle>
            </View>
          </CardHeader>

          <CardContent style={{ paddingTop: spacing.md, gap: spacing.md }}>
            <View style={styles.manualRow}>
              <View style={{ flex: 1 }}>
                <Input
                  value={manualCode}
                  onChangeText={setManualCode}
                  placeholder="Enter EAN / UPC / Code 128..."
                  keyboardType="default"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={() => void performLookup(manualCode)}
                  leftIcon={<Barcode size={18} color={colors.mutedForeground} />}
                />
              </View>
              <Button
                title="Lookup"
                loading={isLookingUp}
                disabled={!manualCode.trim()}
                onPress={() => void performLookup(manualCode)}
              />
            </View>

            {lastScannedCode ? (
              <Text
                style={[
                  typography.caption,
                  typography.tabular,
                  { color: colors.mutedForeground },
                ]}
              >
                Last queried: {lastScannedCode}
              </Text>
            ) : null}

            {/* Sample demo barcodes for testing without physical labels */}
            <View style={{ gap: spacing.xs + 2 }}>
              <Text style={[typography.micro, { color: colors.mutedForeground }]}>
                TRY DEMO BARCODES
              </Text>
              <View style={styles.sampleChips}>
                {DEMO_SAMPLE_BARCODES.map((sample) => (
                  <Pressable
                    key={sample.code}
                    onPress={() => {
                      setManualCode(sample.code);
                      void performLookup(sample.code);
                    }}
                    style={({ pressed }) => [
                      styles.sampleChip,
                      {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        borderRadius: radii.md,
                        paddingHorizontal: spacing.sm + 2,
                        paddingVertical: spacing.xs + 2,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.foreground, fontFamily: fontFamilies.medium },
                      ]}
                    >
                      {sample.label}
                    </Text>
                    <Text
                      style={[
                        typography.micro,
                        typography.tabular,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {sample.code}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  permissionBox: {
    minHeight: 230,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  permissionIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionButtons: {
    marginTop: 6,
  },
  cameraWrapper: {
    height: 250,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  reticle: {
    width: 240,
    height: 130,
    borderWidth: 2,
    backgroundColor: "transparent",
  },
  scanHintPill: {
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 9999,
  },
  cameraToolbar: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  overlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  resultTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  matchMetrics: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resultActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  manualHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  manualRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sampleChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sampleChip: {
    borderWidth: 1,
  },
});
