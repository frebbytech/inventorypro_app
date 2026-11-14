import "server-only";

import QRCode from "qrcode";
import { headers } from "next/headers";

interface QRResponse {
  success: boolean;
  qrCode?: string;
  error?: string;
}

// Accepts an optional dynamic path, like "/sales/123" or "/verify"
export async function generateQrCode(path: string = ""): Promise<QRResponse> {
  try {
    // 1. Dynamically get the base URL from the incoming request headers
    const headersList = await headers();
    const host = headersList.get("host") || "localhost:3000";
    const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    // 2. Combine the base URL with your route path safely
    // Clean up forward slashes to prevent "://domain.com"

    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const fullTargetUrl = `${baseUrl}${cleanPath}`;

    // 3. Generate the QR code using the full URL string
    const base64String = await QRCode.toDataURL(fullTargetUrl, {
      width: 200,
      margin: 2,
      errorCorrectionLevel: "H",
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    return { success: true, qrCode: base64String };
  } catch (error) {
    console.error("Failed to generate QR code:", error);
    return { success: false, error: "Failed to create QR code graphic" };
  }
}
