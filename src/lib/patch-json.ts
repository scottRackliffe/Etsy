import type { ApiErrorShape } from "@/types";

export function patchHeaders(updatedAt: string | null | undefined): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (updatedAt?.trim()) {
    headers["If-Match"] = updatedAt.trim();
  }
  return headers;
}

export function isStaleConflictPayload(payload: unknown): payload is ApiErrorShape {
  if (!payload || typeof payload !== "object") return false;
  const err = (payload as ApiErrorShape).error;
  return err?.code === "CONCURRENT_EDIT";
}
