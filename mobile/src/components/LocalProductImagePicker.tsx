import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  AlertCircle,
  Camera,
  CameraOff,
  CloudUpload,
  Image as ImageIcon,
  RefreshCw,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react-native";
import { useAuth } from "@/api/AuthProvider";
import { ApiError } from "@/api/httpAdapter";
import { Button } from "@/components/ui";
import { useTheme } from "@/theme";
import { getUserErrorMessage } from "@/utils/errorHandler";
import {
  deleteLocalProductImageIfManaged,
  isLocalDeviceImageUri,
  pickProductImageFromDevice,
  resolveProductImageUri,
  saveLocalProductImageUri,
} from "@/utils/productImage";

interface LocalProductImagePickerProps {
  value: string;
  onChange: (nextUri: string) => void;
}

export function LocalProductImagePicker({
  value,
  onChange,
}: LocalProductImagePickerProps) {
  const { theme } = useTheme();
  const { workspaceMode, syncStatus, serverUrl, uploadProductImage } = useAuth();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [picking, setPicking] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [imageError, setImageError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const sessionPickedUrisRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setImageError(false);
  }, [value]);

  const cleanupPreviousSessionFile = (previousUri: string) => {
    if (previousUri && sessionPickedUrisRef.current.has(previousUri)) {
      deleteLocalProductImageIfManaged(previousUri);
      sessionPickedUrisRef.current.delete(previousUri);
    }
  };

  const attachResolvedImage = async (savedLocalUri: string) => {
    cleanupPreviousSessionFile(value);

    if (workspaceMode !== "synced" || syncStatus === "offline") {
      sessionPickedUrisRef.current.add(savedLocalUri);
      onChange(savedLocalUri);
      return;
    }

    setUploading(true);
    try {
      const cloudUrl = await uploadProductImage(savedLocalUri);
      deleteLocalProductImageIfManaged(savedLocalUri);
      onChange(cloudUrl);
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
        deleteLocalProductImageIfManaged(savedLocalUri);
        setErrorMessage(
          getUserErrorMessage(
            err,
            "Unable to upload product photo.",
            "product-image.upload",
          ),
        );
      } else {
        // Offline or transient server failure: keep local URI so outbox uploads it when online
        sessionPickedUrisRef.current.add(savedLocalUri);
        onChange(savedLocalUri);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleUploadDeferredNow = async () => {
    if (
      uploading ||
      picking ||
      capturing ||
      workspaceMode !== "synced" ||
      !isLocalDeviceImageUri(value)
    ) {
      return;
    }
    setErrorMessage(null);
    setUploading(true);
    try {
      const cloudUrl = await uploadProductImage(value);
      if (sessionPickedUrisRef.current.has(value)) {
        deleteLocalProductImageIfManaged(value);
        sessionPickedUrisRef.current.delete(value);
      }
      onChange(cloudUrl);
    } catch (err) {
      setErrorMessage(
        getUserErrorMessage(
          err,
          "Still offline. Photo remains safely queued on device.",
          "product-image.uploadDeferred",
        ),
      );
    } finally {
      setUploading(false);
    }
  };

  const handlePickImage = async () => {
    if (picking || capturing || uploading) return;
    setPicking(true);
    setErrorMessage(null);
    try {
      const savedUri = await pickProductImageFromDevice();
      if (savedUri) {
        await attachResolvedImage(savedUri);
      }
    } catch (err) {
      setErrorMessage(
        getUserErrorMessage(
          err,
          "Unable to load selected image.",
          "product-image.pick",
        ),
      );
    } finally {
      setPicking(false);
    }
  };

  const handleOpenCamera = async () => {
    if (picking || capturing || uploading) return;
    setErrorMessage(null);

    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        if (!next.canAskAgain) {
          setCameraOpen(true);
        } else {
          setErrorMessage("Camera permission is needed to take a product photo.");
        }
        return;
      }
    }

    setCameraOpen(true);
  };

  const handleCapturePhoto = async () => {
    if (!cameraRef.current || capturing || uploading) return;
    setCapturing(true);
    setErrorMessage(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.75,
      });
      if (photo?.uri) {
        const savedUri = await saveLocalProductImageUri(photo.uri, {
          mimeType: "image/jpeg",
        });
        setCameraOpen(false);
        await attachResolvedImage(savedUri);
      }
    } catch (err) {
      setErrorMessage(
        getUserErrorMessage(
          err,
          "Unable to capture product photo.",
          "product-image.capture",
        ),
      );
      setCameraOpen(false);
    } finally {
      setCapturing(false);
    }
  };

  const handleRemoveImage = () => {
    setErrorMessage(null);
    cleanupPreviousSessionFile(value);
    onChange("");
  };

  const previewUri = resolveProductImageUri(value, serverUrl);
  const hasValidPreview = Boolean(previewUri) && !imageError;
  const isSyncedPendingUpload =
    workspaceMode === "synced" && isLocalDeviceImageUri(value);

  const storageBadgeText = uploading
    ? "Uploading photo..."
    : workspaceMode === "synced"
      ? isSyncedPendingUpload
        ? "Saved offline · uploads on sync"
        : "Synced across web & mobile"
      : "Saved locally on device";

  const helperDescription = uploading
    ? "Uploading compressed product photo to workspace..."
    : hasValidPreview
      ? workspaceMode === "synced"
        ? isSyncedPendingUpload
          ? "Saved on device. Will upload automatically when reconnected."
          : "Stored in workspace cloud storage for web & mobile."
        : "Stored on this device for local inventory & catalog cards."
      : "Upload from files or take a photo with the camera.";

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={styles.labelRow}>
        <Text
          style={[
            typography.caption,
            { color: colors.foreground, fontFamily: fontFamilies.semibold },
          ]}
        >
          Product Image
        </Text>
        <Text style={[typography.micro, { color: colors.mutedForeground }]}>
          {storageBadgeText}
        </Text>
      </View>

      <View
        style={[
          styles.pickerContainer,
          {
            backgroundColor: colors.muted,
            borderColor: colors.border,
            borderRadius: radii.lg,
            padding: spacing.md,
          },
        ]}
      >
        <View style={styles.previewRow}>
          <View
            style={[
              styles.previewBox,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: radii.lg,
              },
            ]}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : hasValidPreview ? (
              <Image
                source={{ uri: previewUri }}
                style={styles.previewImage}
                resizeMode="cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <ImageIcon size={26} color={colors.mutedForeground} />
            )}
          </View>

          <View style={styles.metaCol}>
            <Text
              style={[
                typography.bodySemibold,
                { color: colors.foreground },
              ]}
            >
              {uploading
                ? "Uploading photo..."
                : hasValidPreview
                  ? "Photo attached"
                  : "No photo selected"}
            </Text>
            <Text
              numberOfLines={2}
              style={[
                typography.caption,
                { color: colors.mutedForeground, marginTop: 2 },
              ]}
            >
              {helperDescription}
            </Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Button
            title={hasValidPreview ? "Replace" : "Choose Image"}
            variant="outline"
            size="sm"
            loading={picking || uploading}
            disabled={capturing || uploading}
            style={{ flex: 1 }}
            leftIcon={<Upload size={14} color={colors.foreground} />}
            onPress={() => void handlePickImage()}
          />
          {Platform.OS !== "web" ? (
            <Button
              title="Take Photo"
              variant="secondary"
              size="sm"
              disabled={picking || capturing || uploading}
              style={{ flex: 1 }}
              leftIcon={<Camera size={14} color={colors.foreground} />}
              onPress={() => void handleOpenCamera()}
            />
          ) : null}
          {isSyncedPendingUpload && syncStatus !== "offline" ? (
            <Button
              title="Upload Now"
              variant="default"
              size="sm"
              loading={uploading}
              disabled={picking || capturing}
              leftIcon={<CloudUpload size={14} color="#FFFFFF" />}
              onPress={() => void handleUploadDeferredNow()}
            />
          ) : null}
          {value.trim() ? (
            <Button
              title="Remove"
              variant="ghost"
              size="sm"
              disabled={picking || capturing || uploading}
              leftIcon={<Trash2 size={14} color={colors.dangerText} />}
              textStyle={{ color: colors.dangerText }}
              onPress={handleRemoveImage}
            />
          ) : null}
        </View>
      </View>

      {errorMessage ? (
        <View
          style={[
            styles.errorBanner,
            {
              backgroundColor: colors.dangerTint,
              borderColor: colors.dangerBorder,
              borderRadius: radii.md,
              padding: spacing.sm,
            },
          ]}
        >
          <AlertCircle size={14} color={colors.dangerText} />
          <Text style={[typography.caption, { color: colors.dangerText, flex: 1 }]}>
            {errorMessage}
          </Text>
        </View>
      ) : null}

      <Modal
        visible={cameraOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setCameraOpen(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Pressable
              onPress={() => setCameraOpen(false)}
              style={styles.modalIconBtn}
              accessibilityLabel="Close camera"
            >
              <X size={20} color="#FFFFFF" />
            </Pressable>
            <Text style={[typography.subtitle, { color: "#FFFFFF" }]}>
              Take Product Photo
            </Text>
            <Pressable
              onPress={() =>
                setFacing((prev) => (prev === "back" ? "front" : "back"))
              }
              style={styles.modalIconBtn}
              accessibilityLabel="Switch camera"
            >
              <RefreshCw size={18} color="#FFFFFF" />
            </Pressable>
          </View>

          {permission?.granted ? (
            <View style={styles.cameraStage}>
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
              />
              <View style={styles.shutterBar}>
                <Pressable
                  onPress={() => void handleCapturePhoto()}
                  disabled={capturing}
                  style={({ pressed }) => [
                    styles.shutterOuter,
                    {
                      opacity: capturing ? 0.6 : pressed ? 0.85 : 1,
                    },
                  ]}
                  accessibilityLabel="Capture photo"
                >
                  <View style={styles.shutterInner}>
                    {capturing ? (
                      <ActivityIndicator size="small" color="#0F172A" />
                    ) : null}
                  </View>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.permissionFallback}>
              <CameraOff size={40} color="#94A3B8" />
              <Text
                style={[
                  typography.titleSm,
                  { color: "#FFFFFF", textAlign: "center" },
                ]}
              >
                Camera access required
              </Text>
              <Text
                style={[
                  typography.body,
                  { color: "#CBD5E1", textAlign: "center" },
                ]}
              >
                Allow camera access in Settings to photograph products directly.
              </Text>
              <View style={styles.permissionActions}>
                <Button
                  title="Open Settings"
                  leftIcon={<Settings size={15} color="#FFFFFF" />}
                  onPress={() => void Linking.openSettings()}
                />
                <Button
                  title="Cancel"
                  variant="outline"
                  onPress={() => setCameraOpen(false)}
                />
              </View>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerContainer: {
    borderWidth: 1,
    gap: 12,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  previewBox: {
    width: 72,
    height: 72,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  metaCol: {
    flex: 1,
    minWidth: 0,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
  },
  modalSafe: {
    flex: 1,
    backgroundColor: "#020617",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraStage: {
    flex: 1,
    position: "relative",
    justifyContent: "flex-end",
  },
  shutterBar: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 36,
    paddingTop: 20,
    backgroundColor: "rgba(2,6,23,0.45)",
  },
  shutterOuter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  permissionFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  permissionActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
});
