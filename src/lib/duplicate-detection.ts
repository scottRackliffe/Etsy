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

export type CustomerDuplicateGroupMember = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  order_count: number;
};

export type CustomerDuplicateGroup = {
  customers: CustomerDuplicateGroupMember[];
  match_reason: string;
};

function customerNameSimilar(a: CustomerDuplicateGroupMember, b: CustomerDuplicateGroupMember): boolean {
  const lnA = normalize(a.last_name ?? "");
  const lnB = normalize(b.last_name ?? "");
  const fnA = normalize(a.first_name ?? "");
  const fnB = normalize(b.first_name ?? "");
  if (!lnA || !lnB || lnA !== lnB) return false;
  if (!fnA || !fnB) return false;
  return levenshtein(fnA, fnB) <= 2;
}

function customerEmailMatch(a: CustomerDuplicateGroupMember, b: CustomerDuplicateGroupMember): boolean {
  const emailA = normalize(a.email ?? "");
  const emailB = normalize(b.email ?? "");
  return emailA.length > 0 && emailA === emailB;
}

function duplicateMatchReason(a: CustomerDuplicateGroupMember, b: CustomerDuplicateGroupMember): string {
  if (customerEmailMatch(a, b)) return "Same email address";
  return "Same last name, similar first name";
}

export function findCustomerDuplicateGroups(): CustomerDuplicateGroup[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id, c.first_name, c.last_name, c.email,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.order_status = 'active') AS order_count
       FROM customers c
       ORDER BY c.id`
    )
    .all() as CustomerDuplicateGroupMember[];

  const parent = rows.map((_, i) => i);
  const find = (i: number): number => {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      if (customerEmailMatch(rows[i], rows[j]) || customerNameSimilar(rows[i], rows[j])) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, CustomerDuplicateGroupMember[]>();
  for (let i = 0; i < rows.length; i += 1) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(rows[i]);
    groups.set(root, list);
  }

  const result: CustomerDuplicateGroup[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    members.sort((a, b) => a.id - b.id);
    let matchReason = "Potential duplicate customers";
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        if (customerEmailMatch(members[i], members[j]) || customerNameSimilar(members[i], members[j])) {
          matchReason = duplicateMatchReason(members[i], members[j]);
          break;
        }
      }
      if (matchReason !== "Potential duplicate customers") break;
    }
    result.push({ customers: members, match_reason: matchReason });
  }

  return result.sort((a, b) => a.customers[0].id - b.customers[0].id);
}
