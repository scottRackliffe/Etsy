export type SortDir = "asc" | "desc";

export function parseSortDir(raw: string | null): SortDir {
  return raw?.toLowerCase() === "asc" ? "asc" : "desc";
}

export function resolveSortColumn(
  requested: string | null | undefined,
  allowed: Record<string, string>,
  fallback: string
): string {
  if (!requested) return allowed[fallback] ?? fallback;
  const key = requested.trim().toLowerCase();
  return allowed[key] ?? allowed[fallback] ?? fallback;
}

export function buildSearchClause(
  columns: string[],
  search: string | undefined,
  params: Record<string, unknown>
): string {
  if (!search?.trim()) return "";
  const term = `%${search.trim().toLowerCase()}%`;
  params._search = term;
  const parts = columns.map((col) => `LOWER(COALESCE(${col}, '')) LIKE @_search`);
  return ` AND (${parts.join(" OR ")})`;
}
