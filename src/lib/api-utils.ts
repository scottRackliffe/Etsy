export function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function parsePagination(params: URLSearchParams): { limit: number; offset: number } {
  const limitRaw = params.get("limit");
  const offsetRaw = params.get("offset");
  const limit = Number(limitRaw ?? 50);
  const offset = Number(offsetRaw ?? 0);
  return {
    limit: Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50,
    offset: Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0,
  };
}
