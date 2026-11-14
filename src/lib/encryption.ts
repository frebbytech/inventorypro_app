import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"
    );
  }
  return Buffer.from(key, "hex");
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
  if (!encryptedValue) return "";
  try {
    const [ivHex, authTagHex, ciphertextHex] = encryptedValue.split(":");
    if (!ivHex || !authTagHex || !ciphertextHex) return "";
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
  } catch (err) {
    console.error("Decryption failed:", err);
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