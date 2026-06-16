import { useCallback } from "react";

type ZipResult = { city: string | null; state: string | null; valid: boolean };

export function useZipLookup() {
  return useCallback(async (zip: string, country?: string): Promise<ZipResult> => {
    const trimmed = zip.trim();
    if (trimmed.length < 3) return { city: null, state: null, valid: false };
    try {
      const params = new URLSearchParams({ zip: trimmed });
      if (country) params.set("country", country);
      const res = await fetch(`/api/zip-lookup?${params}`, {
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as { city?: string | null; state?: string | null; ok?: boolean };
      if (data.city || data.state) {
        return { city: data.city ?? null, state: data.state ?? null, valid: true };
      }
      return { city: null, state: null, valid: false };
    } catch {
      // Network error — don't flag as invalid, just return empty
      return { city: null, state: null, valid: true };
    }
  }, []);
}
