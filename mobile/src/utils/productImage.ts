import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

const PRODUCT_IMAGES_DIR = "product-images";
const MAX_WEB_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB

function inferExtension(opts?: {
  fileName?: string;
  mimeType?: string;
  sourceUri?: string;
}): string {
  const mime = (opts?.mimeType ?? "").toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("heic")) return "heic";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";

  const candidate = opts?.fileName || opts?.sourceUri || "";
  const clean = candidate.split("?")[0] ?? "";
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext)) {
    return ext === "jpeg" ? "jpg" : ext;
  }
  return "jpg";
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read image file."));
      }
    };
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Copies a picked or camera-captured image into persistent app-local storage
 * so cache sweeps on iOS/Android do not invalidate stored SQLite `photo_url` URIs.
 */
export async function saveLocalProductImageUri(
  sourceUri: string,
  opts?: {
    mimeType?: string;
    fileName?: string;
    webFile?: Blob;
  },
): Promise<string> {
  const trimmed = sourceUri.trim();
  if (!trimmed) {
    throw new Error("No image URI was returned.");
  }

  if (Platform.OS === "web") {
    if (trimmed.startsWith("data:image/")) {
      return trimmed;
    }
    const blob =
      opts?.webFile ?? (await (await fetch(trimmed)).blob());
    if (blob.size > MAX_WEB_IMAGE_BYTES) {
      throw new Error("Image is larger than 4 MB. Choose a smaller photo.");
    }
    return readBlobAsDataUrl(blob);
  }

  try {
    const imagesDir = new Directory(Paths.document, PRODUCT_IMAGES_DIR);
    if (!imagesDir.exists) {
      imagesDir.create({ intermediates: true, idempotent: true });
    }

    const ext = inferExtension({
      fileName: opts?.fileName,
      mimeType: opts?.mimeType,
      sourceUri: trimmed,
    });
    const destName = `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const destFile = new File(imagesDir, destName);

    const srcFile = new File(trimmed);
    srcFile.copy(destFile);
    return destFile.uri;
  } catch {
    // Fallback cleanly to the picked/captured URI if the filesystem copy fails
    return trimmed;
  }
}

/**
 * Lets the user choose an image from device Files / Photo Library via `expo-document-picker`
 * (no extra native image-picker module required).
 */
export async function pickProductImageFromDevice(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["image/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];
  return saveLocalProductImageUri(asset.uri, {
    mimeType: asset.mimeType,
    fileName: asset.name,
    webFile: asset.file,
  });
}

/**
 * Best-effort cleanup for images stored inside our managed `product-images` directory.
 */
export function deleteLocalProductImageIfManaged(uri?: string | null): void {
  if (!uri || Platform.OS === "web") return;
  if (!uri.includes(PRODUCT_IMAGES_DIR)) return;
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Best-effort cleanup only
  }
}

export function isLocalDeviceImageUri(uri?: string | null): boolean {
  const trimmed = uri?.trim().toLowerCase() ?? "";
  if (!trimmed) return false;
  return (
    trimmed.startsWith("file://") ||
    trimmed.startsWith("content://") ||
    trimmed.startsWith("ph://") ||
    trimmed.startsWith("assets-library://") ||
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("blob:")
  );
}

export function resolveProductImageUri(
  photoUrl?: string | null,
  serverUrl?: string | null,
): string {
  const trimmed = photoUrl?.trim() ?? "";
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("file://") ||
    lower.startsWith("content://") ||
    lower.startsWith("ph://") ||
    lower.startsWith("assets-library://") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:")
  ) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    const base = serverUrl?.trim().replace(/\/+$/, "") ?? "";
    return base ? `${base}${trimmed}` : trimmed;
  }

  return trimmed;
}

export function inferProductImageUploadMeta(
  uri: string,
  opts?: { mimeType?: string; fileName?: string },
): { mimeType: "image/jpeg" | "image/png" | "image/webp"; fileName: string } {
  const rawMime = (opts?.mimeType ?? "").trim().toLowerCase();
  const dataMimeMatch = uri.match(/^data:(image\/[a-z0-9.+-]+);/i);
  const resolvedRaw = (dataMimeMatch?.[1] || rawMime).toLowerCase();

  let mimeType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";
  let ext = "jpg";

  if (resolvedRaw.includes("png")) {
    mimeType = "image/png";
    ext = "png";
  } else if (resolvedRaw.includes("webp")) {
    mimeType = "image/webp";
    ext = "webp";
  } else if (resolvedRaw.includes("jpeg") || resolvedRaw.includes("jpg")) {
    mimeType = "image/jpeg";
    ext = "jpg";
  } else {
    const candidate = (opts?.fileName || uri).split("?")[0] ?? "";
    const fileExt = candidate.split(".").pop()?.toLowerCase() ?? "";
    if (fileExt === "png") {
      mimeType = "image/png";
      ext = "png";
    } else if (fileExt === "webp") {
      mimeType = "image/webp";
      ext = "webp";
    }
  }

  const cleanName = opts?.fileName?.trim();
  const fileName = cleanName ? cleanName : `product-${Date.now()}.${ext}`;
  return { mimeType, fileName };
}
