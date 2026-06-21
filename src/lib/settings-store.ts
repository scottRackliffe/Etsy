import { getDb } from "@/lib/sqlite";

export const DEFAULT_MIN_QUALITY_SCORE = 85;

export function getMinQualityScore(): number {
  const raw = getSetting("listing.min_quality_score");
  if (raw == null) return DEFAULT_MIN_QUALITY_SCORE;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MIN_QUALITY_SCORE;
}

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): string {
  const db = getDb();
  const updated_at = new Date().toISOString();
  db.prepare(
    `
      INSERT INTO settings(key, value, updated_at)
      VALUES(@key, @value, @updated_at)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `
  ).run({ key, value, updated_at });
  return updated_at;
}

export function deleteSetting(key: string): void {
  const db = getDb();
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}
