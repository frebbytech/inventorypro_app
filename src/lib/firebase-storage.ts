import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

export type FirebaseCredentialMode =
  | "service_account_json"
  | "service_account_fields"
  | "application_default"
  | "unconfigured";

export interface FirebaseStorageConfig {
  configured: boolean;
  projectId: string | null;
  storageBucket: string | null;
  credentialMode: FirebaseCredentialMode;
}

export interface UploadImageToFirebaseInput {
  buffer: Buffer;
  folder: string;
  fileName: string;
  tenantId?: string | null;
  contentType?: string;
}

export interface UploadImageToFirebaseResult {
  downloadURL: string;
  fullPath: string;
  bucket: string;
}

type TestUploaderFn = (
  input: UploadImageToFirebaseInput,
) => Promise<UploadImageToFirebaseResult>;

let testUploaderOverride: TestUploaderFn | null = null;

export function setFirebaseStorageUploaderForTests(
  uploader: TestUploaderFn | null,
): void {
  testUploaderOverride = uploader;
}

const FIREBASE_STORAGE_APP_NAME = "inventorypro-storage";

interface AppletFirebaseConfig {
  projectId?: string;
  storageBucket?: string;
}

function readAppletFirebaseConfig(): AppletFirebaseConfig | null {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (!fs.existsSync(configPath)) return null;
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as AppletFirebaseConfig;
    if (
      !parsed?.projectId ||
      parsed.projectId === "remixed-project-id"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseServiceAccountFromEnv(): ServiceAccount | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as {
        project_id?: string;
        projectId?: string;
        client_email?: string;
        clientEmail?: string;
        private_key?: string;
        privateKey?: string;
      };
      const projectId = parsed.project_id || parsed.projectId;
      const clientEmail = parsed.client_email || parsed.clientEmail;
      const privateKey = (parsed.private_key || parsed.privateKey || "").replace(
        /\\n/g,
        "\n",
      );
      if (projectId && clientEmail && privateKey) {
        return { projectId, clientEmail, privateKey };
      }
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON credentials.",
      );
    }
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (clientEmail && privateKeyRaw) {
    const appletConfig = readAppletFirebaseConfig();
    const projectId =
      process.env.FIREBASE_PROJECT_ID?.trim() ||
      appletConfig?.projectId?.trim() ||
      "";
    if (projectId) {
      return {
        projectId,
        clientEmail,
        privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
      };
    }
  }

  return null;
}

export function getFirebaseStorageConfig(): FirebaseStorageConfig {
  const appletConfig = readAppletFirebaseConfig();

  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    appletConfig?.projectId?.trim() ||
    null;

  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    appletConfig?.storageBucket?.trim() ||
    null;

  let credentialMode: FirebaseCredentialMode = "unconfigured";
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
    credentialMode = "service_account_json";
  } else if (
    process.env.FIREBASE_CLIENT_EMAIL?.trim() &&
    process.env.FIREBASE_PRIVATE_KEY?.trim()
  ) {
    credentialMode = "service_account_fields";
  } else if (projectId && storageBucket) {
    credentialMode = "application_default";
  }

  return {
    configured: Boolean(projectId && storageBucket),
    projectId,
    storageBucket,
    credentialMode,
  };
}

function getOrInitializeStorageApp(): { app: App; bucketName: string } {
  const config = getFirebaseStorageConfig();
  if (!config.configured || !config.projectId || !config.storageBucket) {
    throw new Error(
      "Firebase Storage is not configured (missing projectId or storageBucket).",
    );
  }

  const existing = getApps().find(
    (candidate) => candidate.name === FIREBASE_STORAGE_APP_NAME,
  );
  if (existing) {
    return { app: existing, bucketName: config.storageBucket };
  }

  const serviceAccount = parseServiceAccountFromEnv();
  const app = serviceAccount
    ? initializeApp(
        {
          credential: cert(serviceAccount),
          projectId: serviceAccount.projectId || config.projectId,
          storageBucket: config.storageBucket,
        },
        FIREBASE_STORAGE_APP_NAME,
      )
    : initializeApp(
        {
          projectId: config.projectId,
          storageBucket: config.storageBucket,
        },
        FIREBASE_STORAGE_APP_NAME,
      );

  return { app, bucketName: config.storageBucket };
}

function sanitizeObjectSegment(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/\.{2,}/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "default";
}

export async function uploadImageToFirebaseStorage(
  input: UploadImageToFirebaseInput,
): Promise<UploadImageToFirebaseResult> {
  if (testUploaderOverride) {
    return testUploaderOverride(input);
  }

  const { app, bucketName } = getOrInitializeStorageApp();
  const bucket = getStorage(app).bucket(bucketName);

  const safeFolder = sanitizeObjectSegment(input.folder);
  const safeFileName = sanitizeObjectSegment(path.basename(input.fileName));
  const safeTenant = input.tenantId
    ? sanitizeObjectSegment(input.tenantId)
    : "shared";

  const objectPath = `images/${safeTenant}/${safeFolder}/${safeFileName}`;
  const downloadToken = crypto.randomUUID();
  const contentType = input.contentType || "image/webp";

  const fileRef = bucket.file(objectPath);
  await fileRef.save(input.buffer, {
    resumable: false,
    validation: "crc32c",
    metadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
        tenantId: safeTenant,
        folder: safeFolder,
      },
    },
  });

  const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    bucketName,
  )}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(
    downloadToken,
  )}`;

  return {
    downloadURL,
    fullPath: objectPath,
    bucket: bucketName,
  };
}
