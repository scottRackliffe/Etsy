import { ApiRouteError } from "@/lib/api-error";
import { getDb } from "@/lib/sqlite";

const STALE_TABLES = ["inventory", "orders", "customers", "addresses"] as const;

export type StaleCheckTable = (typeof STALE_TABLES)[number];

export function getIfMatchHeader(request: Request): string | null {
  const value = request.headers.get("If-Match")?.trim();
  return value && value.length > 0 ? value : null;
}

export function assertRecordNotStale(
  table: StaleCheckTable,
  id: number,
  ifMatch: string | null
): void {
  if (!ifMatch) return;
  if (!STALE_TABLES.includes(table)) return;

  const row = getDb().prepare(`SELECT updated_at FROM ${table} WHERE id = ?`).get(id) as
    | { updated_at?: string | null }
    | undefined;

  if (!row) return;

  const current = row.updated_at ?? "";
  if (current !== ifMatch) {
    throw new ApiRouteError({
      status: 409,
      code: "CONCURRENT_EDIT",
      message: "Record has been modified since it was loaded",
      userMessage: "This record was modified since you loaded it. Please reload and try again.",
      actions: ["Reload"],
      canRetry: true,
    });
  }
}
