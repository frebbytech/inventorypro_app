import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { v7 as uuid } from "uuid";
import sharp from "sharp";

import { detectImageType } from "@/lib/file-signature";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1920;

// Maximum number of pixels accepted from the source image.
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
    /*
     * -------------------------------------------------------
     * 1. Parse multipart/form-data
     * -------------------------------------------------------
     */

    const formData = await request.formData();

    const file = formData.get("file");
    const folder = formData.get("folder");

    /*
     * -------------------------------------------------------
     * 2. Validate uploaded file
     * -------------------------------------------------------
     */

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "No valid file was uploaded.",
        },
        { status: 400 }
      );
    }

    /*
     * -------------------------------------------------------
     * 3. Validate folder
     * -------------------------------------------------------
     */

    if (typeof folder !== "string") {
      return NextResponse.json(
        {
          error: "Upload folder is required.",
        },
        { status: 400 }
      );
    }

    const safeFolder = getSafeFolder(folder);

    if (!safeFolder) {
      return NextResponse.json(
        {
          error: "Invalid upload folder.",
        },
        { status: 400 }
      );
    }

    /*
     * -------------------------------------------------------
     * 4. Validate browser MIME type
     * -------------------------------------------------------
     *
     * This is only the first layer of validation.
     * We still verify the actual binary signature below.
     */

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error:
            "Invalid file type. Only JPEG, PNG, and WebP images are allowed.",
        },
        { status: 415 }
      );
    }

    /*
     * -------------------------------------------------------
     * 5. Validate file size
     * -------------------------------------------------------
     */

    if (file.size === 0) {
      return NextResponse.json(
        {
          error: "Uploaded file is empty.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: "Image exceeds the 5 MB upload limit.",
        },
        { status: 413 }
      );
    }

    /*
     * -------------------------------------------------------
     * 6. File → Buffer
     * -------------------------------------------------------
     */

    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    if (!inputBuffer.length) {
      return NextResponse.json(
        {
          error: "Unable to read uploaded file.",
        },
        { status: 400 }
      );
    }

    /*
     * -------------------------------------------------------
     * 7. MAGIC-BYTE VALIDATION
     * -------------------------------------------------------
     *
     * Detect the real file type from its binary contents.
     */

    const detectedFile = detectImageType(inputBuffer);

    if (!detectedFile) {
      return NextResponse.json(
        {
          error:
            "The uploaded file is not a valid JPEG, PNG, or WebP image.",
        },
        { status: 415 }
      );
    }

    /*
     * -------------------------------------------------------
     * 8. MIME TYPE CONSISTENCY CHECK
     * -------------------------------------------------------
     */

    if (detectedFile.mimeType !== file.type) {
      console.warn("Image MIME mismatch", {
        declared: file.type,
        detected: detectedFile.mimeType,
        name: file.name,
      });

      return NextResponse.json(
        {
          error:
            "The uploaded file content does not match its declared MIME type.",
        },
        { status: 415 }
      );
    }

    /*
     * -------------------------------------------------------
     * 9. Read image metadata
     * -------------------------------------------------------
     */

    let metadata;

    try {
      metadata = await sharp(inputBuffer).metadata();
    } catch (error) {
      console.error(
        "Image metadata parsing failed:",
        error
      );

      return NextResponse.json(
        {
          error: "The uploaded image is corrupted or invalid.",
        },
        { status: 415 }
      );
    }

    /*
     * -------------------------------------------------------
     * 10. Validate dimensions
     * -------------------------------------------------------
     */

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (!width || !height) {
      return NextResponse.json(
        {
          error: "Unable to determine image dimensions.",
        },
        { status: 415 }
      );
    }

    /*
     * Protect against extremely large images.
     */
    if (width * height > MAX_PIXELS) {
      return NextResponse.json(
        {
          error:
            "Image dimensions are too large to process.",
        },
        { status: 413 }
      );
    }

    /*
     * -------------------------------------------------------
     * 11. Generate unique filename
     * -------------------------------------------------------
     *
     * The original extension is intentionally discarded.
     * Everything becomes WebP.
     */

    const fileName = `${uuid()}.webp`;

    /*
     * -------------------------------------------------------
     * 12. Storage directory
     * -------------------------------------------------------
     */

    const uploadDir = path.join(
      process.cwd(),
      "public",
      "images",
      safeFolder
    );

    await mkdir(uploadDir, {
      recursive: true,
    });

    const filePath = path.join(
      uploadDir,
      fileName
    );

    /*
     * -------------------------------------------------------
     * 13. Normalize → WebP
     * -------------------------------------------------------
     *
     * - Auto rotates according to EXIF orientation
     * - Resizes large images
     * - Removes unnecessary metadata
     * - Converts to WebP
     * - Uses consistent quality
     */

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

    /*
     * -------------------------------------------------------
     * 14. Final output sanity check
     * -------------------------------------------------------
     */

    if (!outputBuffer.length) {
      return NextResponse.json(
        {
          error: "Image conversion failed.",
        },
        { status: 500 }
      );
    }

    /*
     * -------------------------------------------------------
     * 15. Save normalized WebP
     * -------------------------------------------------------
     */

    await writeFile(filePath, outputBuffer);

    /*
     * -------------------------------------------------------
     * 16. Public URL
     * -------------------------------------------------------
     */

    const downloadURL =
      `/images/${encodeURIComponent(
        safeFolder
      )}/${encodeURIComponent(fileName)}`;

    const fullPath =
      `public/images/${safeFolder}/${fileName}`;

    /*
     * -------------------------------------------------------
     * 17. Logging
     * -------------------------------------------------------
     */

    // console.log("Image uploaded successfully:", {
    //   fileName,
    //   folder: safeFolder,

    //   originalMimeType: file.type,
    //   detectedMimeType: detectedFile.mimeType,

    //   originalSize: file.size,
    //   optimizedSize: outputBuffer.length,

    //   originalWidth: width,
    //   originalHeight: height,

    //   compressionRatio:
    //     (
    //       (1 - outputBuffer.length / file.size) *
    //       100
    //     ).toFixed(2) + "%",
    // });

    /*
     * -------------------------------------------------------
     * 18. Response
     * -------------------------------------------------------
     */

    return NextResponse.json(
      {
        success: true,
        downloadURL,
        fullPath,

        // Useful for debugging/admin monitoring.
        mimeType: "image/webp",
        size: outputBuffer.length,
        width: Math.min(width, MAX_WIDTH),
        height: Math.min(height, MAX_HEIGHT),
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error("Upload error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to upload image.",
      },
      { status: 500 }
    );
  }
}

// import { NextRequest, NextResponse } from "next/server";
// import { mkdir, writeFile } from "fs/promises";
// import path from "path";

// import {
//   detectImageType,
//   isMatchingImageExtension,
// } from "@/lib/file-signature";

// export const runtime = "nodejs";

// const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// const ALLOWED_IMAGE_TYPES = new Set([
//   "image/jpeg",
//   "image/png",
//   "image/webp",
// ]);

// const ALLOWED_FOLDERS = new Set([
//   "products",
//   "categories",
//   "users",
//   "suppliers",
// ]);

// function sanitizeSegment(value: string): string {
//   return value
//     .trim()
//     .replace(/[^a-zA-Z0-9_-]/g, "-")
//     .replace(/-+/g, "-");
// }

// function sanitizeFileName(fileName: string): string {
//   return path
//     .basename(fileName)
//     .replace(/[^a-zA-Z0-9._-]/g, "-")
//     .replace(/-+/g, "-");
// }

// export async function POST(request: NextRequest) {
//   try {
//     const formData = await request.formData();

//     const file = formData.get("file");
//     const fileName = formData.get("fileName");
//     const folder = formData.get("folder");

//     /*
//      * Basic request validation
//      */
//     if (!(file instanceof File)) {
//       return NextResponse.json(
//         {
//           error: "No valid file was uploaded.",
//         },
//         { status: 400 }
//       );
//     }

//     if (typeof fileName !== "string") {
//       return NextResponse.json(
//         {
//           error: "File name is required.",
//         },
//         { status: 400 }
//       );
//     }

//     if (typeof folder !== "string") {
//       return NextResponse.json(
//         {
//           error: "Upload folder is required.",
//         },
//         { status: 400 }
//       );
//     }

//     /*
//      * Only allow known application folders.
//      */
//     if (!ALLOWED_FOLDERS.has(folder)) {
//       return NextResponse.json(
//         {
//           error: "Invalid upload folder.",
//         },
//         { status: 400 }
//       );
//     }

//     /*
//      * Check browser-provided MIME type.
//      *
//      * This is only an initial check.
//      * We do NOT trust it as the final validation.
//      */
//     if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
//       return NextResponse.json(
//         {
//           error:
//             "Invalid file type. Only JPEG, PNG, and WebP images are allowed.",
//         },
//         { status: 415 }
//       );
//     }

//     /*
//      * Check file size.
//      */
//     if (file.size === 0) {
//       return NextResponse.json(
//         {
//           error: "Uploaded file is empty.",
//         },
//         { status: 400 }
//       );
//     }

//     if (file.size > MAX_FILE_SIZE) {
//       return NextResponse.json(
//         {
//           error: "File exceeds the 5 MB size limit.",
//         },
//         { status: 413 }
//       );
//     }

//     /*
//      * Sanitize filename.
//      */
//     const safeFileName = sanitizeFileName(fileName);

//     if (!safeFileName) {
//       return NextResponse.json(
//         {
//           error: "Invalid file name.",
//         },
//         { status: 400 }
//       );
//     }

//     /*
//      * Convert File → Buffer.
//      */
//     const arrayBuffer = await file.arrayBuffer();
//     const buffer = Buffer.from(arrayBuffer);

//     if (!buffer.length) {
//       return NextResponse.json(
//         {
//           error: "Failed to read uploaded file.",
//         },
//         { status: 400 }
//       );
//     }

//     /*
//      * -------------------------------------------------------
//      * MAGIC-BYTE / FILE-SIGNATURE VALIDATION
//      * -------------------------------------------------------
//      *
//      * Detect the REAL file type from its binary contents.
//      */
//     const detectedFile = detectImageType(buffer);

//     if (!detectedFile) {
//       return NextResponse.json(
//         {
//           error:
//             "The uploaded file is not a valid JPEG, PNG, or WebP image.",
//         },
//         { status: 415 }
//       );
//     }

//     /*
//      * Verify that the browser MIME type agrees with
//      * the actual binary file.
//      */
//     if (detectedFile.mimeType !== file.type) {
//       console.warn("MIME type mismatch:", {
//         browserMimeType: file.type,
//         detectedMimeType: detectedFile.mimeType,
//         fileName: safeFileName,
//       });

//       return NextResponse.json(
//         {
//           error:
//             "File content does not match the declared MIME type.",
//         },
//         { status: 415 }
//       );
//     }

//     /*
//      * Verify that the filename extension also agrees
//      * with the actual binary content.
//      */
//     if (
//       !isMatchingImageExtension(
//         safeFileName,
//         detectedFile.mimeType
//       )
//     ) {
//       return NextResponse.json(
//         {
//           error:
//             "File extension does not match the actual file type.",
//         },
//         { status: 400 }
//       );
//     }

//     /*
//      * Sanitize folder.
//      */
//     const safeFolder = sanitizeSegment(folder);

//     /*
//      * Create:
//      *
//      * public/
//      *   images/
//      *     products/
//      */
//     const uploadDir = path.join(
//       process.cwd(),
//       "public",
//       "images",
//       safeFolder
//     );

//     await mkdir(uploadDir, {
//       recursive: true,
//     });

//     /*
//      * Final file path.
//      */
//     const filePath = path.join(
//       uploadDir,
//       safeFileName
//     );

//     /*
//      * Save file.
//      */
//     await writeFile(filePath, buffer);

//     /*
//      * Public URL.
//      */
//     const downloadURL =
//       `/images/${encodeURIComponent(
//         safeFolder
//       )}/${encodeURIComponent(safeFileName)}`;

//     const fullPath =
//       `public/images/${safeFolder}/${safeFileName}`;

//     console.log("File uploaded successfully:", {
//       fileName: safeFileName,
//       folder: safeFolder,
//       declaredMimeType: file.type,
//       detectedMimeType: detectedFile.mimeType,
//       size: buffer.length,
//     });

//     return NextResponse.json(
//       {
//         success: true,
//         downloadURL,
//         fullPath,
//       },
//       { status: 201 }
//     );
//   } catch (error) {
//     console.error("Upload error:", error);

//     return NextResponse.json(
//       {
//         error:
//           error instanceof Error
//             ? error.message
//             : "Failed to upload file.",
//       },
//       { status: 500 }
//     );
//   }
// }