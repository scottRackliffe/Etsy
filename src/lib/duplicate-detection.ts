import { getDb } from "@/lib/sqlite";

export type InventoryDuplicate = {
  id: number;
  item_number: string | null;
  description: string | null;
};

export type CustomerDuplicate = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i += 1) matrix[i] = [i];
  for (let j = 0; j <= a.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function trigrams(text: string): Set<string> {
  const padded = `  ${text} `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) {
    set.add(padded.slice(i, i + 3));
  }
  return set;
}

function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) {
    if (tb.has(t)) overlap += 1;
  }
  return overlap / Math.max(ta.size, tb.size);
}

function descriptionsMatch(candidate: string, existing: string, rowCount: number): boolean {
  const a = normalize(candidate);
  const b = normalize(existing);
  if (!a || !b) return false;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 10 && (longer.includes(shorter) || shorter.includes(longer))) {
    return true;
  }

  if (rowCount <= 10_000 && a.length <= 100 && b.length <= 100 && levenshtein(a, b) <= 3) {
    return true;
  }

  return trigramSimilarity(a, b) > 0.5;
}

export function findInventoryDuplicates(description: string): InventoryDuplicate[] {
  const trimmed = description.trim();
  if (trimmed.length < 5) return [];

  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) AS c FROM inventory").get() as { c: number }).c;
  const rows = db
    .prepare(
      `SELECT id, item_number, description FROM inventory
       WHERE description IS NOT NULL AND TRIM(description) != ''
       AND description LIKE ? LIMIT 200`
    )
    .all(`%${trimmed.slice(0, Math.min(20, trimmed.length))}%`) as InventoryDuplicate[];

  const matches: InventoryDuplicate[] = [];
  for (const row of rows) {
    if (!row.description) continue;
    if (descriptionsMatch(trimmed, row.description, total)) {
      matches.push(row);
      if (matches.length >= 5) break;
    }
  }
  return matches;
}

export function findCustomerDuplicates(input: {
  first_name?: string;
  last_name?: string;
  email?: string;
}): CustomerDuplicate[] {
  const first = input.first_name?.trim() ?? "";
  const last = input.last_name?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  if ((!first || !last) && !email) return [];

  const db = getDb();
  const byId = new Map<number, CustomerDuplicate>();

  if (first && last) {
    const nameRows = db
      .prepare(
        `SELECT id, first_name, last_name, email FROM customers
         WHERE LOWER(TRIM(COALESCE(first_name, ''))) = LOWER(?)
         AND LOWER(TRIM(COALESCE(last_name, ''))) = LOWER(?)
         LIMIT 5`
      )
      .all(first, last) as CustomerDuplicate[];
    for (const row of nameRows) byId.set(row.id, row);
  }

  if (email) {
    const emailRows = db
      .prepare(
        `SELECT id, first_name, last_name, email FROM customers
         WHERE LOWER(TRIM(COALESCE(email, ''))) = LOWER(?)
         LIMIT 5`
      )
      .all(email) as CustomerDuplicate[];
    for (const row of emailRows) byId.set(row.id, row);
  }

  return [...byId.values()].slice(0, 5);
}
