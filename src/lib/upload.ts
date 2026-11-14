
interface UploadOptions {
  folder: string;
  file: File;
  onProgress?: (progress: number) => void;
}

interface UploadResponse {
  downloadURL: string;
  fullPath: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

export async function uploadFile({
  folder,
  file,
  onProgress,
}: UploadOptions): Promise<UploadResponse> {
  if (!(file instanceof File)) {
    throw new Error("A valid file is required.");
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(
      "Only JPEG, PNG, and WebP images are supported."
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      "Image must not exceed 5 MB."
    );
  }

  onProgress?.(10);

  /*
   * Give the server a sanitized original filename.
   *
   * The server will ultimately generate its own
   * UUID.webp filename.
   */
  const safeName = sanitizeFileName(file.name);

  const formData = new FormData();

  formData.append("file", file, safeName);
  formData.append("folder", folder);

  onProgress?.(20);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  onProgress?.(90);

  let data: UploadResponse & {
    error?: string;
  };

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Invalid response from upload server."
    );
  }

  if (!response.ok) {
    throw new Error(
      data.error ?? "Upload failed."
    );
  }

  onProgress?.(100);

  return data;
}


// import { v7 as uuid } from "uuid";
// import { compressImage } from "./compress-image";

// interface UploadOptions {
//   folder: string;
//   file: File;
//   onProgress?: (progress: number) => void;
// }

// interface UploadResponse {
//   downloadURL: string;
//   fullPath: string;
// }

// const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// const ALLOWED_IMAGE_TYPES = new Set([
//   "image/jpeg",
//   "image/png",
//   "image/webp",
// ]);

// function sanitizeFileName(fileName: string): string {
//   return fileName
//     .trim()
//     .replace(/[^a-zA-Z0-9._-]/g, "-")
//     .replace(/-+/g, "-");
// }

// export async function uploadFile({
//   folder,
//   file,
//   onProgress,
// }: UploadOptions): Promise<UploadResponse> {
//   if (!(file instanceof File)) {
//     throw new Error("A valid file is required.");
//   }

//   if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
//     throw new Error(
//       "Invalid file type. Only JPEG, PNG, and WebP images are allowed."
//     );
//   }

//   if (file.size > MAX_FILE_SIZE) {
//     throw new Error("Image must not exceed 5 MB.");
//   }

//   onProgress?.(5);

//   /*
//    * Compress image before uploading.
//    */
//   const optimizedFile = await compressImage(file, {
//     maxSizeInMB: 5,
//     maxWidth: 1920,
//     maxHeight: 1920,
//     quality: 0.5,
//   });

//   onProgress?.(30);

//   if (!(optimizedFile instanceof File)) {
//     throw new Error("Image compression failed.");
//   }

//   /*
//    * Generate a safe unique filename.
//    */
//   const sanitizedName = sanitizeFileName(
//     optimizedFile.name
//   );

//   const fileName = `${uuid()}-${sanitizedName}`;

//   /*
//    * Send the actual File instead of converting it
//    * to Base64.
//    */
//   const formData = new FormData();

//   formData.append("file", optimizedFile);
//   formData.append("fileName", fileName);
//   formData.append("folder", folder);

//   onProgress?.(40);

//   const response = await fetch("/api/upload", {
//     method: "POST",
//     body: formData,
//   });

//   onProgress?.(90);

//   let data: UploadResponse & { error?: string };

//   try {
//     data = await response.json();
//   } catch {
//     throw new Error("Invalid response from upload server.");
//   }

//   if (!response.ok) {
//     throw new Error(data.error ?? "Upload failed.");
//   }

//   onProgress?.(100);

//   return {
//     downloadURL: data.downloadURL,
//     fullPath: data.fullPath,
//   };
// }

// import { v7 as uuid } from "uuid";
// import { compressImage } from "./compress-image";

// interface UploadOptions {
//   folder: string;
//   file: File;
//   onProgress?: (progress: number) => void;
// }

// async function fileToBase64(
//   file: File,
//   onProgress?: (progress: number) => void,
// ): Promise<string> {
//   return new Promise((resolve, reject) => {
//     const reader = new FileReader();

//     reader.onprogress = (event) => {
//       if (event.lengthComputable) {
//         onProgress?.((event.loaded / event.total) * 50); // first half: reading
//       }
//     };

//     reader.onload = () => resolve(reader.result as string);
//     reader.onerror = () =>
//       reject(reader.error ?? new Error("Failed to read file."));
//     console.log(file);

//     reader.readAsDataURL(file);
//   });
// }

// export async function uploadFile({
//   folder,
//   file,
//   onProgress,
// }: UploadOptions): Promise<{
//   downloadURL: string;
//   fullPath: string;
// }> {
//   if (!file) {
//     throw new Error("File is required.");
//   }

//   // 🔥 Compress if > 5MB
//   const optimizedFile = await compressImage(file, {
//     maxSizeInMB: 5,
//     maxWidth: 1920,
//     maxHeight: 1920,
//     quality: 0.5,
//   });

//   const fileName = `${uuid()}-${optimizedFile.name}`;
//   const base64 = await fileToBase64(optimizedFile, onProgress);

//   if (!base64.startsWith("data:")) {
//     throw new Error("File was not converted to a valid Data URL.");
//   }

//   const response = await fetch("/api/upload", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ base64, fileName, folder }),
//   });

//   onProgress?.(100);

//   if (!response.ok) {
//     const errorBody = await response.json().catch(() => ({}));
//     throw new Error(errorBody.error ?? "Upload failed.");
//   }
//   const data = await response.json();
//   // console.log(data.downloadURL, data.fullPath)
//   return {
//     downloadURL: data.downloadURL,
//     fullPath: data.fullPath,
//   };
// }
