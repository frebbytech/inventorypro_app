import type { SupportedImageType } from "./types";

interface FileSignature {
  mimeType: SupportedImageType;
  extensions: string[];
}

const FILE_SIGNATURES: FileSignature[] = [
  {
    mimeType: "image/jpeg",
    extensions: [".jpg", ".jpeg"],
  },
  {
    mimeType: "image/png",
    extensions: [".png"],
  },
  {
    mimeType: "image/webp",
    extensions: [".webp"],
  },
];

export function detectImageType(
  buffer: Buffer
): FileSignature | null {
  if (buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return FILE_SIGNATURES.find(
      (item) => item.mimeType === "image/jpeg"
    )!;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return FILE_SIGNATURES.find(
      (item) => item.mimeType === "image/png"
    )!;
  }

  // WebP: RIFF....WEBP
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return FILE_SIGNATURES.find(
      (item) => item.mimeType === "image/webp"
    )!;
  }

  return null;
}

// import path from "path";

// export type SupportedImageType =
//   | "image/jpeg"
//   | "image/png"
//   | "image/webp";

// interface FileSignature {
//   mimeType: SupportedImageType;
//   extensions: string[];
// }

// const FILE_SIGNATURES: FileSignature[] = [
//   {
//     mimeType: "image/jpeg",
//     extensions: [".jpg", ".jpeg"],
//   },
//   {
//     mimeType: "image/png",
//     extensions: [".png"],
//   },
//   {
//     mimeType: "image/webp",
//     extensions: [".webp"],
//   },
// ];

// /**
//  * Detect the actual file type from its binary signature.
//  *
//  * This does NOT trust the browser-provided MIME type.
//  */
// export function detectImageType(
//   buffer: Buffer
// ): FileSignature | null {
//   if (buffer.length < 12) {
//     return null;
//   }

//   /*
//    * JPEG
//    *
//    * FF D8 FF
//    */
//   if (
//     buffer[0] === 0xff &&
//     buffer[1] === 0xd8 &&
//     buffer[2] === 0xff
//   ) {
//     return FILE_SIGNATURES.find(
//       (item) => item.mimeType === "image/jpeg"
//     )!;
//   }

//   /*
//    * PNG
//    *
//    * 89 50 4E 47 0D 0A 1A 0A
//    */
//   if (
//     buffer[0] === 0x89 &&
//     buffer[1] === 0x50 &&
//     buffer[2] === 0x4e &&
//     buffer[3] === 0x47 &&
//     buffer[4] === 0x0d &&
//     buffer[5] === 0x0a &&
//     buffer[6] === 0x1a &&
//     buffer[7] === 0x0a
//   ) {
//     return FILE_SIGNATURES.find(
//       (item) => item.mimeType === "image/png"
//     )!;
//   }

//   /*
//    * WebP
//    *
//    * RIFF
//    * ....
//    * WEBP
//    *
//    * Bytes:
//    * 52 49 46 46 xx xx xx xx
//    * 57 45 42 50
//    */
//   if (
//     buffer.toString("ascii", 0, 4) === "RIFF" &&
//     buffer.toString("ascii", 8, 12) === "WEBP"
//   ) {
//     return FILE_SIGNATURES.find(
//       (item) => item.mimeType === "image/webp"
//     )!;
//   }

//   return null;
// }

// /**
//  * Check whether the filename extension agrees
//  * with the actual binary file type.
//  */
// export function isMatchingImageExtension(
//   fileName: string,
//   detectedMimeType: SupportedImageType
// ): boolean {
//   const extension = path.extname(fileName).toLowerCase();

//   const signature = FILE_SIGNATURES.find(
//     (item) => item.mimeType === detectedMimeType
//   );

//   if (!signature) {
//     return false;
//   }

//   return signature.extensions.includes(extension);
// }