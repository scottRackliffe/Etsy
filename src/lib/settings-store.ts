import { getDb } from "@/lib/sqlite";

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO settings(key, value, updated_at)
      VALUES(@key, @value, @updated_at)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `
  ).run({
    key,
    value,
    updated_at: new Date().toISOString(),
  });
}

export function deleteSetting(key: string): void {
  const db = getDb();
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}
