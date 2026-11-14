import * as Crypto from "expo-crypto";

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Computes a salted SHA-256 hash using Expo Crypto so authentication works
 * identically across Android, iOS, and Web without Node's `node:crypto`.
 */
async function stretchSha256(password: string, salt: string): Promise<string> {
  let digest = `${salt}:${password}`;
  for (let i = 0; i < 64; i += 1) {
    digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${digest}:${salt}`,
    );
  }
  return digest;
}

export async function hashPassword(password: string): Promise<string> {
  const saltBytes = Crypto.getRandomBytes(16);
  const salt = bytesToHex(saltBytes);
  const derived = await stretchSha256(password, salt);
  return `sha256$${salt}$${derived}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "sha256") {
    return false;
  }
  const [, salt, expectedDigest] = parts;
  if (!salt || !expectedDigest) {
    return false;
  }
  const actualDigest = await stretchSha256(password, salt);
  return constantTimeEqual(actualDigest, expectedDigest);
}

export function generateId(prefix: string): string {
  return `${prefix}-${Crypto.randomUUID()}`;
}

export function generateSessionToken(): string {
  return `ipm_${Crypto.randomUUID().replace(/-/g, "")}_${Crypto.randomUUID().replace(/-/g, "")}`;
}
