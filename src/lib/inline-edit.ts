import { apiFetch } from "@/lib/api-fetch";
import type { InlineEditResult } from "@/components/ui/DataTable";
import { isStaleConflictPayload, patchHeaders } from "@/lib/patch-json";
import type { ApiErrorShape } from "@/types";

export async function patchInlineRecord<T extends { updated_at?: string | null }>(
  url: string,
  updatedAt: string | null | undefined,
  body: Record<string, unknown>,
  pickRecord: (payload: Record<string, unknown>) => T | null | undefined
): Promise<InlineEditResult<T>> {
  try {
    const response = await apiFetch(url, {
      method: "PATCH",
      headers: patchHeaders(updatedAt),
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape & Record<string, unknown>;
    if (!response.ok) {
      if (response.status === 409 && isStaleConflictPayload(data)) {
        return { status: "stale" };
      }
      return {
        status: "error",
        message: data.error?.user_message ?? "We could not save that change.",
      };
    }
    const record = pickRecord(data);
    if (!record) {
      return { status: "error", message: "We could not save that change." };
    }
    return { status: "success", patch: record };
  } catch {
    return { status: "error", message: "We could not save that change." };
  }
}
