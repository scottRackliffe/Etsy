import type { UiError } from "@/types";

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
  })!;
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
