import type { UiError, UiErrorDetail } from "@/types";

export function stampUiError(error: UiError | null): UiError | null {
  if (!error) return null;
  if (error.occurredAt) return error;
  return { ...error, occurredAt: new Date().toISOString() };
}

export function createUiError(
  input: Omit<UiError, "occurredAt"> & { occurredAt?: string }
): UiError {
  return stampUiError({
    title: input.title,
    message: input.message,
    actions: input.actions,
    occurredAt: input.occurredAt,
    detail: input.detail,
    variant: input.variant,
  })!;
}

/**
 * Patterns that look like secrets — redact them before surfacing technical detail.
 * Matches common API key patterns: long alphanumeric strings, sk-/pk-/Bearer prefixes, etc.
 */
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /pk-[A-Za-z0-9_-]{20,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/gi,
  /key[=:]["']?[A-Za-z0-9_-]{20,}/gi,
  /token[=:]["']?[A-Za-z0-9_-]{20,}/gi,
  /secret[=:]["']?[A-Za-z0-9_-]{20,}/gi,
  // Long random-looking strings (32+ hex chars — API keys, session tokens, etc.)
  /\b[0-9a-f]{32,}\b/gi,
];

/** Strip potential secrets from a message before surfacing it to the UI. */
export function sanitizeErrorMessage(msg: string): string {
  let result = msg;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

/**
 * Extract a `UiErrorDetail` from an unknown API error payload.
 * Returns undefined when no technical detail is available.
 */
export function extractErrorDetail(
  payload: unknown,
  endpoint?: string
): UiErrorDetail | undefined {
  const data = payload as
    | {
        error?: {
          code?: string;
          message?: string;
          user_message?: string;
        };
        message?: string;
      }
    | null
    | undefined;

  const rawMessage =
    data?.error?.message ?? (data as { message?: string } | null)?.message;

  if (!rawMessage && !data?.error?.code) return undefined;

  return {
    code: data?.error?.code,
    message: rawMessage ? sanitizeErrorMessage(rawMessage) : "(no message)",
    timestamp: new Date().toISOString(),
    endpoint,
  };
}

export function formatUiErrorTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
