/**
 * SMTP email transport (nodemailer) with AES-256-GCM encrypted password (ADR-078 §5a).
 * Send failures are caught and returned as errors — never thrown to callers.
 */
import nodemailer from "nodemailer";
import { getSetting } from "@/lib/settings-store";
import { encryptValue, decryptValue } from "@/lib/secret-crypto";
import { logger } from "@/lib/logging";

export interface EmailPayload {
  to: string;
  subject: string;
  body: string; // plain-text body; nodemailer also sends as text
}

export interface EmailResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Settings helpers (read / write SMTP config)
// ---------------------------------------------------------------------------

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromAddress: string;
  enabled: boolean;
}

export function getSmtpConfig(): SmtpConfig {
  return {
    host: getSetting("email.smtp_host") ?? "",
    port: parseInt(getSetting("email.smtp_port") ?? "587", 10),
    secure: getSetting("email.smtp_secure") === "true",
    user: getSetting("email.smtp_user") ?? "",
    fromName: getSetting("email.from_name") ?? "",
    fromAddress: getSetting("email.from_address") ?? "",
    enabled: getSetting("email.enabled") === "true",
  };
}

/** Encrypt and return the base64 ciphertext for storage. */
export function encryptSmtpPassword(plainPassword: string): string {
  return encryptValue(plainPassword);
}

/** Decrypt the stored SMTP password. Returns null if not set or decryption fails. */
export function getDecryptedSmtpPassword(): string | null {
  const encrypted = getSetting("email.smtp_pass_encrypted");
  if (!encrypted) return null;
  try {
    return decryptValue(encrypted);
  } catch {
    logger.warn("email: failed to decrypt smtp password");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Transport factory
// ---------------------------------------------------------------------------

function buildTransport(config: SmtpConfig, password: string) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: password,
    },
  });
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const config = getSmtpConfig();

  if (!config.enabled) {
    return {
      ok: false,
      error: "Email is not enabled. Configure SMTP in Settings → Email and enable it.",
    };
  }
  if (!config.host || !config.user || !config.fromAddress) {
    return {
      ok: false,
      error: "SMTP is not fully configured. Complete SMTP settings in Settings → Email.",
    };
  }

  const password = getDecryptedSmtpPassword();
  if (!password) {
    return {
      ok: false,
      error: "SMTP password is not set. Enter your email password in Settings → Email.",
    };
  }

  try {
    const transport = buildTransport(config, password);
    await transport.sendMail({
      from: config.fromName ? `"${config.fromName}" <${config.fromAddress}>` : config.fromAddress,
      to: payload.to,
      subject: payload.subject,
      text: payload.body,
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("email: send failed", { to: payload.to, error: msg });
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

export async function testSmtpConnection(): Promise<EmailResult> {
  const config = getSmtpConfig();
  if (!config.host || !config.user) {
    return { ok: false, error: "SMTP host and user are required." };
  }
  const password = getDecryptedSmtpPassword();
  if (!password) {
    return { ok: false, error: "SMTP password is not set." };
  }
  try {
    const transport = buildTransport(config, password);
    await transport.verify();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
