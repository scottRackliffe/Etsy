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


export function parseOptionalString(params: URLSearchParams, key: string): string | undefined {
  const v = params.get(key)?.trim();
  return v ? v : undefined;
}

export function parseOptionalIntFlag(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === "0") return 0;
  if (raw === "1") return 1;
  return undefined;
}
