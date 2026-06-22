/**
 * Shared AES-256-GCM encryption helpers for secrets at rest (ADR-025).
 * Used by easypost.ts and email.ts — single implementation, no duplication.
 */
import crypto from "node:crypto";

export function getEncryptionKey(): Buffer {
  const envKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (envKey) {
    return crypto.createHash("sha256").update(envKey).digest();
  }
  const clientSecret = process.env.ETSY_CLIENT_SECRET;
  if (clientSecret) {
    return crypto.createHash("sha256").update(`etsy-token-key:${clientSecret}`).digest();
  }
  return crypto.createHash("sha256").update("sales-manager-dev-key").digest();
}

export function encryptValue(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptValue(ciphertext: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
