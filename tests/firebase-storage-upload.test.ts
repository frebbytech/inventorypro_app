import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { POST as uploadPost } from "@/app/api/upload/route";
import db from "@/db/knex";
import { createJWT, ensureAuthSchema } from "@/lib/auth";
import {
  getFirebaseStorageConfig,
  setFirebaseStorageUploaderForTests,
} from "@/lib/firebase-storage";
import { getProductionOpsSnapshot } from "@/lib/ops";
import { DEFAULT_TENANT_ID, ensureMultiTenantSchema } from "@/lib/tenant";

describe("Firebase Admin Storage Media Upload (/api/upload)", () => {
  let bearerToken = "";
  const createdLocalPaths: string[] = [];

  beforeAll(async () => {
    await ensureAuthSchema();
    await ensureMultiTenantSchema();

    const adminUser = await db("users")
      .where({ tenant_id: DEFAULT_TENANT_ID })
      .first("id", "username", "email", "role", "tenant_id");

    expect(adminUser?.id).toBeTruthy();

    bearerToken = await createJWT({
      userId: String(adminUser.id),
      username: String(adminUser.username || "admin"),
      role: adminUser.role === "member" ? "member" : "admin",
      tenantId: String(adminUser.tenant_id || DEFAULT_TENANT_ID),
    });
  });

  afterEach(() => {
    setFirebaseStorageUploaderForTests(null);
    delete process.env.FIREBASE_STORAGE_REQUIRED;

    for (const relPath of createdLocalPaths.splice(0)) {
      const abs = path.join(process.cwd(), relPath);
      if (fs.existsSync(abs)) {
        fs.unlinkSync(abs);
      }
    }
  });

  it("reads nanaakwasi-8d50e bucket config and exposes it in ops snapshot", async () => {
    const config = getFirebaseStorageConfig();
    expect(config.configured).toBe(true);
    expect(config.projectId).toBe("nanaakwasi-8d50e");
    expect(config.storageBucket).toBe("nanaakwasi-8d50e.firebasestorage.app");

    const ops = await getProductionOpsSnapshot();
    expect(ops.storage.firebaseStorage.configured).toBe(true);
    expect(ops.storage.firebaseStorage.storageBucket).toBe(
      "nanaakwasi-8d50e.firebasestorage.app",
    );
  });

  it("rejects unauthenticated requests and non-image spoofed payloads", async () => {
    const unauthReq = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      body: new FormData(),
    });
    const unauthRes = await uploadPost(unauthReq);
    expect(unauthRes.status).toBe(401);

    const form = new FormData();
    form.append(
      "file",
      new File([Buffer.from("not-a-real-png")], "fake.png", {
        type: "image/png",
      }),
    );
    form.append("folder", "products");

    const badImgReq = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${bearerToken}` },
      body: form,
    });
    const badImgRes = await uploadPost(badImgReq);
    expect(badImgRes.status).toBe(415);
  });

  it("converts image to WebP and uploads to Firebase Storage with tenant-scoped path", async () => {
    const captured: Array<{
      folder: string;
      fileName: string;
      tenantId?: string | null;
      contentType?: string;
      byteLength: number;
    }> = [];

    setFirebaseStorageUploaderForTests(async (input) => {
      captured.push({
        folder: input.folder,
        fileName: input.fileName,
        tenantId: input.tenantId,
        contentType: input.contentType,
        byteLength: input.buffer.length,
      });

      const objectPath = `images/${input.tenantId}/${input.folder}/${input.fileName}`;
      return {
        bucket: "nanaakwasi-8d50e.firebasestorage.app",
        fullPath: objectPath,
        downloadURL: `https://firebasestorage.googleapis.com/v0/b/nanaakwasi-8d50e.firebasestorage.app/o/${encodeURIComponent(
          objectPath,
        )}?alt=media&token=test-token`,
      };
    });

    const pngBuffer = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: { r: 59, g: 130, b: 246 },
      },
    })
      .png()
      .toBuffer();

    const form = new FormData();
    form.append("file", new File([new Uint8Array(pngBuffer)], "sample.png", { type: "image/png" }));
    form.append("folder", "products");

    const req = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${bearerToken}` },
      body: form,
    });

    const res = await uploadPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.storageProvider).toBe("firebase_storage");
    expect(json.bucket).toBe("nanaakwasi-8d50e.firebasestorage.app");
    expect(json.mimeType).toBe("image/webp");
    expect(json.downloadURL).toContain(
      "https://firebasestorage.googleapis.com/v0/b/nanaakwasi-8d50e.firebasestorage.app/o/",
    );

    expect(captured).toHaveLength(1);
    expect(captured[0].folder).toBe("products");
    expect(captured[0].tenantId).toBe(DEFAULT_TENANT_ID);
    expect(captured[0].fileName.endsWith(".webp")).toBe(true);
    expect(captured[0].byteLength).toBeGreaterThan(0);
  });

  it("returns HTTP 503 when FIREBASE_STORAGE_REQUIRED=true and Firebase upload errors, otherwise falls back locally", async () => {
    setFirebaseStorageUploaderForTests(async () => {
      throw new Error("Simulated IAM denial");
    });

    const pngBuffer = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 16, g: 185, b: 129 },
      },
    })
      .png()
      .toBuffer();

    // 1) Strict mode returns 503
    process.env.FIREBASE_STORAGE_REQUIRED = "true";
    const strictForm = new FormData();
    strictForm.append(
      "file",
      new File([new Uint8Array(pngBuffer)], "strict.png", { type: "image/png" }),
    );
    strictForm.append("folder", "products");

    const strictReq = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${bearerToken}` },
      body: strictForm,
    });
    const strictRes = await uploadPost(strictReq);
    expect(strictRes.status).toBe(503);

    // 2) Local mode falls back cleanly
    delete process.env.FIREBASE_STORAGE_REQUIRED;
    const localForm = new FormData();
    localForm.append(
      "file",
      new File([new Uint8Array(pngBuffer)], "fallback.png", { type: "image/png" }),
    );
    localForm.append("folder", "products");

    const localReq = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${bearerToken}` },
      body: localForm,
    });
    const localRes = await uploadPost(localReq);
    expect(localRes.status).toBe(201);
    const localJson = await localRes.json();
    expect(localJson.storageProvider).toBe("local_disk");
    expect(localJson.downloadURL).toMatch(/^\/images\/products\/.+\.webp$/);
    if (localJson.fullPath) {
      createdLocalPaths.push(String(localJson.fullPath));
    }
  });
});
