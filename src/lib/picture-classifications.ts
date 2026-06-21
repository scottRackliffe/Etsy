/**
 * Shared parser for `inventory.picture_classifications`.
 *
 * Two shapes exist in the wild:
 *  - Listing Coach (ADR-072): an array of `{ photo_index, type, confidence }`.
 *  - PictureGrid (ADR-033): a `Record<slot, shot_type>` map.
 * This normalizes either into a lowercased Set of shot-type strings.
 */
export function parseShotTypeSet(raw: string | null | undefined): Set<string> {
  const set = new Set<string>();
  if (!raw || typeof raw !== "string" || !raw.trim()) return set;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        const t = (entry as { type?: unknown })?.type;
        if (typeof t === "string" && t.trim()) set.add(t.trim().toLowerCase());
      }
    } else if (parsed && typeof parsed === "object") {
      for (const value of Object.values(parsed as Record<string, unknown>)) {
        if (typeof value === "string" && value.trim()) set.add(value.trim().toLowerCase());
      }
    }
  } catch {
    /* malformed classifications → empty set */
  }
  return set;
}
