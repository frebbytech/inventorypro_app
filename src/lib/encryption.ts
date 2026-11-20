import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16;
const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;
const HEX_REGEX = /^[0-9a-fA-F]+$/;

function getKey(): Buffer {
  const rawKey = process.env.ENCRYPTION_KEY?.trim();
  if (rawKey) {
    if (HEX_64_REGEX.test(rawKey)) {
      return Buffer.from(rawKey, "hex");
    }
    return crypto.createHash("sha256").update(rawKey, "utf8").digest();
  }

  const fallbackSeed =
    process.env.JWT_SECRET?.trim() ||
    "inventorypro_default_encryption_secret_2026_change_in_prod";
  return crypto.createHash("sha256").update(fallbackSeed, "utf8").digest();
}

/**
 * Encrypt a plaintext string. Returns format: iv:authTag:ciphertext (hex)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return "";
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString(
    "hex"
  )}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a value produced by encrypt().
 */
export function decrypt(encryptedValue: string): string {
  if (!encryptedValue || typeof encryptedValue !== "string") return "";
  try {
    const parts = encryptedValue.trim().split(":");
    if (parts.length !== 3) return "";
    const [ivHex, authTagHex, ciphertextHex] = parts;
    if (
      !ivHex ||
      !authTagHex ||
      !ciphertextHex ||
      ivHex.length !== IV_LENGTH * 2 ||
      authTagHex.length !== AUTH_TAG_LENGTH * 2 ||
      ciphertextHex.length % 2 !== 0 ||
      !HEX_REGEX.test(ivHex) ||
      !HEX_REGEX.test(authTagHex) ||
      !HEX_REGEX.test(ciphertextHex)
    ) {
      return "";
    }

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}

/**
 * Mask a secret for display (e.g., "••••••••a1b2").
 */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  const last4 = value.slice(-4);
  return `••••••••${last4}`;
}