import { getDb } from "@/lib/sqlite";

export const CUSTOMER_NOTE_TYPES = new Set([
  "general",
  "shipping_preference",
  "communication",
  "follow_up",
  "complaint",
]);

export type CustomerNoteRow = {
  id: number;
  customer_id: number;
  note_text: string;
  note_type: string;
  created_at: string;
};

export function listCustomerNotes(customerId: number, limit: number, offset: number) {
  const db = getDb();
  const total = (
    db.prepare("SELECT COUNT(*) AS c FROM customer_notes WHERE customer_id = ?").get(customerId) as {
      c: number;
    }
  ).c;
  const items = db
    .prepare(
      `SELECT * FROM customer_notes WHERE customer_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(customerId, limit, offset) as CustomerNoteRow[];
  return { items, total };
}

export function createCustomerNote(customerId: number, noteText: string, noteType: string): CustomerNoteRow {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO customer_notes (customer_id, note_text, note_type, created_at) VALUES (?, ?, ?, ?)`
    )
    .run(customerId, noteText, noteType, now);
  return db.prepare("SELECT * FROM customer_notes WHERE id = ?").get(result.lastInsertRowid) as CustomerNoteRow;
}

export function deleteCustomerNote(id: number): boolean {
  return getDb().prepare("DELETE FROM customer_notes WHERE id = ?").run(id).changes > 0;
}

export function getCustomerNote(id: number): CustomerNoteRow | null {
  const row = getDb().prepare("SELECT * FROM customer_notes WHERE id = ?").get(id) as
    | CustomerNoteRow
    | undefined;
  return row ?? null;
}
