# ADR-065: Customer interaction notes log

## Status
Accepted

## Date
2026-05-24

## Context
The customer record has a single `notes` text field. There is no chronological log of interactions, preferences, shipping issues, or follow-ups. As the business grows, tracking customer communications and history becomes essential for good service.

## Decision

### New table: `customer_notes`

```sql
CREATE TABLE customer_notes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id    INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  note_text      TEXT    NOT NULL,
  note_type      TEXT    NOT NULL DEFAULT 'general',
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_customer_notes_customer_id ON customer_notes(customer_id);
```

#### `note_type` values
| Value | Use |
|-------|-----|
| `general` | Default; freeform notes |
| `shipping_preference` | Preferred carrier, delivery instructions, PO box vs street |
| `communication` | Email/message log entries |
| `follow_up` | Reminders for future action |
| `complaint` | Issue tracking |

### API endpoints

#### List notes
`GET /api/customers/[id]/notes?limit=20&offset=0`

Response:
```json
{
  "items": [
    {
      "id": 1,
      "customer_id": 42,
      "note_text": "Prefers USPS flat-rate boxes.",
      "note_type": "shipping_preference",
      "created_at": "2026-05-24T14:30:00Z"
    }
  ],
  "pagination": { "limit": 20, "offset": 0, "total": 5, "has_more": false }
}
```
Sorted newest first (`ORDER BY created_at DESC`).

#### Create note
`POST /api/customers/[id]/notes`

Request body:
```json
{
  "note_text": "Called about shipping delay on order #1042.",
  "note_type": "communication"
}
```
- `note_text` is required, non-empty, max 2000 characters.
- `note_type` is optional, defaults to `general`. Must be one of the five allowed values.
- Returns 201 with the created note object.

#### Delete note
`DELETE /api/customer-notes/[id]`

Returns 204 on success. Confirmation dialog required on the frontend (ADR-032).

### UI integration

- **Customer detail panel:** Below the existing customer fields, a "Notes" section displays the chronological list.
- **Add note form:** Text area (4 rows) + type dropdown + "Add Note" button. Appears above the notes list.
- **Each note card:** Shows `created_at` as formatted date/time, `note_type` as a `Badge` (color-coded: general=neutral, shipping_preference=blue, communication=purple, follow_up=yellow, complaint=red), note text, and a delete icon button.
- **Existing `customers.notes` field:** Kept as-is. Displayed as a "Pinned Note" card at the top of the customer detail, visually distinct (border accent). This field is editable inline as part of the customer form. The new chronological notes are separate and additive.

### Activity log
- Creating a note logs: `action = 'customer.note_added'`, `entity_type = 'customer'`, `entity_id = customer_id`, `entity_label = customer full name`, `detail_json = { note_type }`.
- Deleting a note logs: `action = 'customer.note_deleted'`.

## Consequences
- **Positive:** Full interaction history per customer; categorized notes enable filtering; preserves backward compatibility with existing `notes` field.
- **Negative:** New table adds migration complexity; potential for many notes per customer (mitigated by pagination).

## Notes
- Cross-ref: ADR-003 (customer data model), ADR-017 (database schema), ADR-037 (activity log), ADR-032 (confirmation dialogs for delete).
- Migration must be added to the migration system to create the `customer_notes` table and index.
- The `ON DELETE CASCADE` ensures notes are removed when a customer is deleted (which is only possible if the customer has zero orders per ADR-022).
