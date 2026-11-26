import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
  type BarcodeType,
} from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AlertCircle,
  Barcode,
  Camera,
  CameraOff,
  CheckCircle2,
  Flashlight,
  Minus,
  Plus,
  ScanBarcode,
  Settings,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { DEMO_SAMPLE_BARCODES } from "@/api/demoData";
import { Button, Card, CardContent, Input } from "@/components/ui";
import { useTheme } from "@/theme";
import type { ProductItem } from "@/types/domain";
import { getUserErrorMessage } from "@/utils/errorHandler";
import { formatCurrency } from "@/utils/formatters";
import {
  hapticError,
  hapticLight,
  hapticSuccess,
  hapticWarning,
} from "@/utils/haptics";
import { resolveProductImageUri } from "@/utils/productImage";

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

const SAME_CODE_COOLDOWN_MS = 2200;
const ANY_SCAN_COOLDOWN_MS = 700;

interface ScanFeedback {
  status: "added" | "warning" | "not_found";
  code: string;
  message: string;
  product?: ProductItem;
}

export interface SalesBarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onOpenCart: () => void;
  cartCount: number;
  cartQtyById: Map<string, number>;
  onAddProduct: (product: ProductItem) => {
    ok: boolean;
    quantity: number;
    reason?: string;
  };
  onDecrementProduct: (productId: string) => void;
  currency: string;
}

export function SalesBarcodeScannerModal({
  visible,
  onClose,
  onOpenCart,
  cartCount,
  cartQtyById,
  onAddProduct,
  onDecrementProduct,
  currency,
}: SalesBarcodeScannerModalProps) {
  const { theme } = useTheme();
  const api = useApiClient();
  const { serverUrl } = useAuth();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [feedbackImageError, setFeedbackImageError] = useState(false);

  const isLookingUpRef = useRef(false);
  const lastScanRef = useRef<{ code: string; at: number }>({
    code: "",
    at: 0,
  });

  useEffect(() => {
    setFeedbackImageError(false);
  }, [feedback?.product?.photoUrl]);

  // Reset transient torch and cooldown when modal closes
  useEffect(() => {
    if (!visible) {
      setTorchOn(false);
      lastScanRef.current = { code: "", at: 0 };
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    setTorchOn(false);
    onClose();
  }, [onClose]);

  const handleLookupAndAdd = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code || isLookingUpRef.current) return;

      isLookingUpRef.current = true;
      setLookingUp(true);
      try {
        const product = await api.lookupProductByBarcode(code);
        if (!product) {
          void hapticError();
          setFeedback({
            status: "not_found",
            code,
            message: `No product matched barcode "${code}".`,
          });
          return;
        }

        if (!product.active) {
          void hapticWarning();
          setFeedback({
            status: "warning",
            code,
            product,
            message: `${product.name} is disabled and cannot be sold.`,
          });
          return;
        }

        const result = onAddProduct(product);
        if (!result.ok) {
          void hapticWarning();
          setFeedback({
            status: "warning",
            code,
            product,
            message:
              result.reason ||
              `${product.name} is out of stock or max quantity reached.`,
          });
          return;
        }

        void hapticSuccess();
        setFeedback({
          status: "added",
          code,
          product,
          message: `Added ${product.name} to cart`,
        });
      } catch (err) {
        void hapticError();
        setFeedback({
          status: "not_found",
          code,
          message: getUserErrorMessage(
            err,
            "Could not look up that barcode right now. Please try again.",
            "sales-scanner.lookup",
          ),
        });
      } finally {
        isLookingUpRef.current = false;
        setLookingUp(false);
      }
    },
    [api, onAddProduct],
  );

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      const code = result.data?.trim();
      if (!code || isLookingUpRef.current) return;

      const now = Date.now();
      const prev = lastScanRef.current;
      const elapsed = now - prev.at;

      if (code === prev.code && elapsed < SAME_CODE_COOLDOWN_MS) return;
      if (elapsed < ANY_SCAN_COOLDOWN_MS) return;

      lastScanRef.current = { code, at: now };
      void handleLookupAndAdd(code);
    },
    [handleLookupAndAdd],
  );

  const renderCameraSection = () => {
    if (!permission) {
      return (
        <View
          style={[
            styles.permissionBox,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
              borderRadius: radii.xl,
            },
          ]}
        >
          <Camera size={28} color={colors.mutedForeground} />
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
            <CameraOff size={24} color={colors.dangerText} />
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
              typography.caption,
              { color: colors.mutedForeground, textAlign: "center" },
            ]}
          >
            {deniedPermanently
              ? "Enable Camera permission in device Settings to scan product barcodes, or enter a barcode manually below."
              : "Allow camera access to scan product barcodes straight into your sales cart."}
          </Text>
          {permission.canAskAgain ? (
            <Button
              title="Allow Camera Access"
              size="sm"
              leftIcon={<Camera size={15} color="#FFFFFF" />}
              onPress={() => void requestPermission()}
            />
          ) : (
            <Button
              title="Open App Settings"
              size="sm"
              leftIcon={<Settings size={15} color="#FFFFFF" />}
              onPress={() => void Linking.openSettings()}
            />
          )}
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
        {visible ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torchOn}
            barcodeScannerSettings={{
              barcodeTypes: SUPPORTED_BARCODE_TYPES,
            }}
            onBarcodeScanned={handleBarcodeScanned}
          />
        ) : null}

        <View style={styles.overlay} pointerEvents="none">
          <View
            style={[
              styles.reticle,
              {
                borderColor:
                  feedback?.status === "added"
                    ? colors.success
                    : colors.primary,
                borderRadius: radii.lg,
              },
            ]}
          />
          <View style={styles.scanHintPill}>
            <Text style={[typography.caption, { color: "#FFFFFF" }]}>
              {lookingUp
                ? "Looking up product..."
                : "Point camera at barcode to add to cart"}
            </Text>
          </View>
        </View>

        <View style={styles.cameraToolbar}>
          <Pressable
            onPress={() => {
              void hapticLight();
              setTorchOn((v) => !v);
            }}
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
            <Flashlight size={15} color="#FFFFFF" />
            <Text style={[typography.caption, { color: "#FFFFFF" }]}>
              {torchOn ? "Torch On" : "Torch"}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const feedbackProductQty = feedback?.product
    ? (cartQtyById.get(feedback.product.id) ?? 0)
    : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View
        style={[
          styles.modalRoot,
          {
            backgroundColor: colors.background,
            paddingTop: Platform.OS === "ios" ? spacing.sm : insets.top,
          },
        ]}
      >
        {/* Header */}
        <View
          style={[
            styles.modalHeader,
            {
              backgroundColor: colors.headerBackground,
              borderBottomColor: colors.border,
              paddingHorizontal: spacing.base,
              paddingVertical: spacing.md,
            },
          ]}
        >
          <View style={styles.rowCenter}>
            <ScanBarcode size={18} color={colors.primary} />
            <Text style={[typography.titleSm, { color: colors.foreground }]}>
              Scan to Add
            </Text>
          </View>

          <Pressable
            onPress={handleClose}
            hitSlop={8}
            accessibilityLabel="Close barcode scanner"
            style={[
              styles.closeBtn,
              {
                backgroundColor: colors.muted,
                borderColor: colors.border,
                borderRadius: radii.lg,
              },
            ]}
          >
            <X size={18} color={colors.foreground} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: spacing.base,
              gap: spacing.base,
              paddingBottom: spacing.xl,
            }}
          >
            {renderCameraSection()}

            {/* Live Scan Feedback Banner */}
            {feedback ? (
              <Card
                style={{
                  borderColor:
                    feedback.status === "added"
                      ? colors.successBorder
                      : feedback.status === "warning"
                        ? colors.warningBorder
                        : colors.dangerBorder,
                }}
              >
                <CardContent
                  style={{
                    paddingTop: spacing.md,
                    paddingBottom: spacing.md,
                    gap: spacing.sm,
                  }}
                >
                  <View style={styles.feedbackRow}>
                    {(() => {
                      const feedbackPhotoUri = resolveProductImageUri(
                        feedback.product?.photoUrl,
                        serverUrl,
                      );
                      if (feedbackPhotoUri && !feedbackImageError) {
                        return (
                          <View
                            style={[
                              styles.feedbackThumb,
                              {
                                borderColor: colors.border,
                                backgroundColor: colors.muted,
                                borderRadius: radii.md,
                              },
                            ]}
                          >
                            <Image
                              source={{ uri: feedbackPhotoUri }}
                              style={styles.feedbackThumbImage}
                              resizeMode="cover"
                              onError={() => setFeedbackImageError(true)}
                            />
                          </View>
                        );
                      }
                      if (feedback.status === "added") {
                        return <CheckCircle2 size={18} color={colors.successText} />;
                      }
                      return (
                        <AlertCircle
                          size={18}
                          color={
                            feedback.status === "warning"
                              ? colors.warningText
                              : colors.dangerText
                          }
                        />
                      );
                    })()}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          typography.bodySemibold,
                          { color: colors.foreground },
                        ]}
                      >
                        {feedback.message}
                      </Text>
                      {feedback.product ? (
                        <Text
                          style={[
                            typography.caption,
                            typography.tabular,
                            { color: colors.mutedForeground, marginTop: 1 },
                          ]}
                        >
                          {formatCurrency(feedback.product.unitPrice, currency)}{" "}
                          · {feedback.product.stockQuantity} in stock
                        </Text>
                      ) : (
                        <Text
                          style={[
                            typography.caption,
                            typography.tabular,
                            { color: colors.mutedForeground, marginTop: 1 },
                          ]}
                        >
                          Barcode: {feedback.code}
                        </Text>
                      )}
                    </View>

                    {feedback.product && feedback.product.active ? (
                      <View style={styles.stepperRow}>
                        {feedbackProductQty > 0 ? (
                          <Pressable
                            onPress={() => {
                              void hapticLight();
                              onDecrementProduct(feedback.product!.id);
                            }}
                            style={[
                              styles.stepBtn,
                              {
                                backgroundColor: colors.muted,
                                borderColor: colors.border,
                                borderRadius: radii.md,
                              },
                            ]}
                          >
                            {feedbackProductQty === 1 ? (
                              <Trash2 size={13} color={colors.dangerText} />
                            ) : (
                              <Minus size={13} color={colors.foreground} />
                            )}
                          </Pressable>
                        ) : null}

                        <Text
                          style={[
                            typography.bodySemibold,
                            typography.tabular,
                            {
                              color: colors.primary,
                              minWidth: 22,
                              textAlign: "center",
                            },
                          ]}
                        >
                          ×{feedbackProductQty}
                        </Text>

                        <Pressable
                          onPress={() => {
                            const res = onAddProduct(feedback.product!);
                            if (!res.ok) {
                              void hapticWarning();
                              setFeedback({
                                status: "warning",
                                code: feedback.code,
                                product: feedback.product,
                                message:
                                  res.reason ||
                                  "Maximum available stock reached.",
                              });
                            } else {
                              void hapticLight();
                            }
                          }}
                          disabled={
                            feedbackProductQty >=
                            feedback.product.stockQuantity
                          }
                          style={[
                            styles.stepBtn,
                            {
                              backgroundColor: colors.primaryTint,
                              borderColor: colors.primary,
                              borderRadius: radii.md,
                              opacity:
                                feedbackProductQty >=
                                feedback.product.stockQuantity
                                  ? 0.4
                                  : 1,
                            },
                          ]}
                        >
                          <Plus size={13} color={colors.primary} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </CardContent>
              </Card>
            ) : null}

            {/* Manual Barcode Fallback + Demo Barcodes */}
            <Card>
              <CardContent style={{ paddingTop: spacing.base, gap: spacing.md }}>
                <Text
                  style={[
                    typography.caption,
                    {
                      color: colors.foreground,
                      fontFamily: fontFamilies.semibold,
                    },
                  ]}
                >
                  Manual barcode entry
                </Text>
                <View style={styles.manualRow}>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={manualCode}
                      onChangeText={setManualCode}
                      placeholder="Enter EAN / UPC / Code 128..."
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        const code = manualCode.trim();
                        if (code) {
                          void handleLookupAndAdd(code);
                          setManualCode("");
                        }
                      }}
                      leftIcon={
                        <Barcode size={16} color={colors.mutedForeground} />
                      }
                    />
                  </View>
                  <Button
                    title="Add"
                    loading={lookingUp}
                    disabled={!manualCode.trim()}
                    onPress={() => {
                      const code = manualCode.trim();
                      if (code) {
                        void handleLookupAndAdd(code);
                        setManualCode("");
                      }
                    }}
                  />
                </View>

                <View style={{ gap: spacing.xs + 2 }}>
                  <Text
                    style={[
                      typography.micro,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    QUICK TEST BARCODES
                  </Text>
                  <View style={styles.sampleChips}>
                    {DEMO_SAMPLE_BARCODES.map((sample) => (
                      <Pressable
                        key={sample.code}
                        onPress={() => void handleLookupAndAdd(sample.code)}
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
                            {
                              color: colors.foreground,
                              fontFamily: fontFamilies.medium,
                            },
                          ]}
                        >
                          {sample.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </CardContent>
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Sticky Footer Bar */}
        <View
          style={[
            styles.modalFooter,
            {
              backgroundColor: colors.headerBackground,
              borderTopColor: colors.border,
              paddingHorizontal: spacing.base,
              paddingTop: spacing.md,
              paddingBottom: Math.max(insets.bottom, spacing.md),
            },
          ]}
        >
          <Button
            title="Products List"
            variant="outline"
            style={{ flex: 1 }}
            onPress={handleClose}
          />
          <Button
            title={`View Cart (${cartCount})`}
            style={{ flex: 1.3 }}
            leftIcon={
              <ShoppingCart size={16} color={colors.primaryForeground} />
            }
            onPress={() => {
              handleClose();
              onOpenCart();
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  rowCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionBox: {
    minHeight: 220,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  permissionIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraWrapper: {
    height: 240,
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
    gap: 10,
  },
  reticle: {
    width: 230,
    height: 122,
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
    bottom: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  overlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
  },
  feedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  feedbackThumb: {
    width: 36,
    height: 36,
    borderWidth: 1,
    overflow: "hidden",
  },
  feedbackThumbImage: {
    width: "100%",
    height: "100%",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
  },
});
