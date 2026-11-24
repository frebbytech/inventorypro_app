import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { v7 as uuid } from "uuid";
import sharp from "sharp";

import { detectImageType } from "@/lib/file-signature";
import { getAuthSession, getBearerAuthSession } from "@/lib/auth";
import {
  getFirebaseStorageConfig,
  uploadImageToFirebaseStorage,
} from "@/lib/firebase-storage";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1920;
const MAX_PIXELS = 25_000_000;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ALLOWED_FOLDERS = new Set([
  "products",
  "categories",
  "users",
  "inventories",
  "customers",
  "employees",
  "suppliers",
  "company",
]);

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-");
}

function getSafeFolder(folder: string): string | null {
  if (!ALLOWED_FOLDERS.has(folder)) {
    return null;
  }
  return sanitizeSegment(folder);
}

export async function POST(request: NextRequest) {
  try {
    const session =
      (await getAuthSession()) ??
      (await getBearerAuthSession(request))?.session ??
      null;

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const folder = formData.get("folder");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No valid file was uploaded." },
        { status: 400 },
      );
    }

    if (typeof folder !== "string") {
      return NextResponse.json(
        { error: "Upload folder is required." },
        { status: 400 },
      );
    }

    const safeFolder = getSafeFolder(folder);
    if (!safeFolder) {
      return NextResponse.json(
        { error: "Invalid upload folder." },
        { status: 400 },
      );
    }

    const declaredMimeType =
      file.type === "image/jpg" ? "image/jpeg" : file.type;

    if (!ALLOWED_MIME_TYPES.has(declaredMimeType)) {
      return NextResponse.json(
        {
          error:
            "Invalid file type. Only JPEG, PNG, and WebP images are allowed.",
        },
        { status: 415 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "Uploaded file is empty." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Image exceeds the 5 MB upload limit." },
        { status: 413 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    if (!inputBuffer.length) {
      return NextResponse.json(
        { error: "Unable to read uploaded file." },
        { status: 400 },
      );
    }

    const detectedFile = detectImageType(inputBuffer);
    if (!detectedFile) {
      return NextResponse.json(
        {
          error:
            "The uploaded file is not a valid JPEG, PNG, or WebP image.",
        },
        { status: 415 },
      );
    }

    if (detectedFile.mimeType !== declaredMimeType) {
      console.warn("Image MIME mismatch", {
        declared: declaredMimeType,
        detected: detectedFile.mimeType,
        name: file.name,
      });

      return NextResponse.json(
        {
          error:
            "The uploaded file content does not match its declared MIME type.",
        },
        { status: 415 },
      );
    }

    let metadata;
    try {
      metadata = await sharp(inputBuffer).metadata();
    } catch (error) {
      console.error("Image metadata parsing failed:", error);
      return NextResponse.json(
        { error: "The uploaded image is corrupted or invalid." },
        { status: 415 },
      );
    }

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (!width || !height) {
      return NextResponse.json(
        { error: "Unable to determine image dimensions." },
        { status: 415 },
      );
    }

    if (width * height > MAX_PIXELS) {
      return NextResponse.json(
        { error: "Image dimensions are too large to process." },
        { status: 413 },
      );
    }

    const fileName = `${uuid()}.webp`;

    const outputBuffer = await sharp(inputBuffer, {
      limitInputPixels: MAX_PIXELS,
    })
      .rotate()
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: 82,
        effort: 4,
      })
      .toBuffer();

    if (!outputBuffer.length) {
      return NextResponse.json(
        { error: "Image conversion failed." },
        { status: 500 },
      );
    }

    const firebaseConfig = getFirebaseStorageConfig();
    const requireFirebase =
      Boolean(process.env.VERCEL) ||
      process.env.FIREBASE_STORAGE_REQUIRED === "true";

    let downloadURL: string;
    let fullPath: string;
    let storageProvider: "firebase_storage" | "local_disk" = "firebase_storage";
    let bucket: string | null = firebaseConfig.storageBucket;

    if (firebaseConfig.configured) {
      try {
        const uploaded = await uploadImageToFirebaseStorage({
          buffer: outputBuffer,
          folder: safeFolder,
          fileName,
          tenantId: session.tenant_id || null,
          contentType: "image/webp",
        });
        downloadURL = uploaded.downloadURL;
        fullPath = uploaded.fullPath;
        bucket = uploaded.bucket;
      } catch (firebaseError) {
        if (requireFirebase) {
          console.error(
            "Firebase Storage upload failed:",
            firebaseError instanceof Error
              ? firebaseError.message
              : firebaseError,
          );
          return NextResponse.json(
            {
              error:
                "Cloud media upload failed. Verify Firebase Storage bucket access.",
            },
            { status: 503 },
          );
        }

        console.warn(
          "[upload] Firebase Storage unavailable in local mode, falling back to public/images:",
          firebaseError instanceof Error
            ? firebaseError.message
            : "Unknown error",
        );

        const uploadDir = path.join(
          process.cwd(),
          "public",
          "images",
          safeFolder,
        );
        await mkdir(uploadDir, { recursive: true });
        await writeFile(path.join(uploadDir, fileName), outputBuffer);
        downloadURL = `/images/${encodeURIComponent(
          safeFolder,
        )}/${encodeURIComponent(fileName)}`;
        fullPath = `public/images/${safeFolder}/${fileName}`;
        storageProvider = "local_disk";
        bucket = null;
      }
    } else if (requireFirebase) {
      return NextResponse.json(
        {
          error:
            "Firebase Storage is required in production but not configured.",
        },
        { status: 503 },
      );
    } else {
      const uploadDir = path.join(
        process.cwd(),
        "public",
        "images",
        safeFolder,
      );
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, fileName), outputBuffer);
      downloadURL = `/images/${encodeURIComponent(
        safeFolder,
      )}/${encodeURIComponent(fileName)}`;
      fullPath = `public/images/${safeFolder}/${fileName}`;
      storageProvider = "local_disk";
      bucket = null;
    }

    return NextResponse.json(
      {
        success: true,
        downloadURL,
        fullPath,
        storageProvider,
        bucket,
        mimeType: "image/webp",
        size: outputBuffer.length,
        width: Math.min(width, MAX_WIDTH),
        height: Math.min(height, MAX_HEIGHT),
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Upload error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to upload image.",
      },
      { status: 500 },
    );
  }
}