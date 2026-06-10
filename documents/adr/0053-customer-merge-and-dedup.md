# ADR-053: Customer merge and deduplication tool

## Status

Accepted

## Date

2026-05-24

## Context

Etsy sync (ADR-019) can create duplicate customers when the same buyer uses slightly different name spellings across orders (e.g., "John Smith" vs "John D. Smith" vs "J. Smith"). Additionally, manual entry without duplicate detection (prior to ADR-048) may have created duplicates. There is currently no way to merge duplicate customer records, leading to fragmented order history and inaccurate reporting.

## Decision

Provide a customer merge tool with manual trigger, side-by-side preview, and an auto-detect duplicates feature.

### Merge UI flow

#### Access point

- On the Customers page toolbar: "Merge Customers" button.
- Also accessible from the auto-detect duplicates results (see below).

#### Step 1: Select customers

Modal opens with two selection areas:

- **Primary customer** (the record to keep): searchable dropdown or select from list.
- **Secondary customer** (the record to merge into primary): searchable dropdown or select from list.
- Both dropdowns show: "Name — email — N orders" for each customer.
- Validation: primary and secondary must be different customers.

#### Step 2: Preview

Side-by-side comparison showing:

| Field      | Primary value    | Secondary value    | Keep                                |
| ---------- | ---------------- | ------------------ | ----------------------------------- |
| First name | John             | John D.            | ○ Primary (default) / ○ Secondary   |
| Last name  | Smith            | Smith              | ○ Primary (default) / ○ Secondary   |
| Email      | john@example.com | jsmith@example.com | ○ Primary (default) / ○ Secondary   |
| Phone      | 555-0123         | (empty)            | ○ Primary (default) / ○ Secondary   |
| Notes      | "Repeat buyer"   | "Likes pottery"    | ○ Primary / ○ Secondary / ○ Combine |

For the `notes` field only: a third option "Combine" concatenates both values with a newline separator.

Below the field comparison:

- **Orders to be moved**: list of secondary customer's orders (order number, date, total) — these will all be reassigned to primary.
- **Addresses to be moved**: list of secondary customer's addresses — these will all be reassigned to primary.
- **Interaction notes to be moved**: count of `customer_notes` records that will be moved from the secondary customer (added 2026-06-09, per ADR-065).

#### Step 3: Confirm

ConfirmDialog (per ADR-032):

> **Merge "John D. Smith" into "John Smith"?**
>
> - 3 orders will be moved to John Smith
> - 1 address will be moved to John Smith
> - 2 interaction notes will be moved to John Smith
> - John D. Smith will be permanently deleted
>
> **This cannot be undone.**
>
> [Cancel] [Merge]

### API endpoint

```
POST /api/customers/merge
```

Request body:

```json
{
  "primary_id": 1,
  "secondary_id": 2,
  "field_overrides": {
    "email": "jsmith@example.com",
    "phone": "555-0123",
    "notes": "Repeat buyer\nLikes pottery"
  }
}
```

- `field_overrides` is optional. Only fields explicitly included are updated on the primary customer. Allowed override fields: `first_name`, `last_name`, `email`, `phone`, `notes`, `address_1`, `address_2`, `city`, `state`, `postal_code`, `country`.
- If `field_overrides` is omitted or empty, primary customer fields remain unchanged.

Response (success):

```json
{
  "ok": true,
  "merged_customer_id": 1,
  "orders_moved": 3,
  "addresses_moved": 1
}
```

Response (error cases):

- 404: primary or secondary customer not found
- 400: `primary_id` equals `secondary_id`
- 409: secondary customer has already been deleted (race condition)

### Server behavior (transaction)

All operations execute within a single database transaction:

1. `UPDATE orders SET customer_id = :primary_id WHERE customer_id = :secondary_id`
2. `UPDATE addresses SET customer_id = :primary_id WHERE customer_id = :secondary_id`
3. `UPDATE customer_notes SET customer_id = :primary_id WHERE customer_id = :secondary_id`
4. `UPDATE customers SET [field_overrides], updated_at = NOW() WHERE id = :primary_id` (only if overrides provided)
5. `DELETE FROM customers WHERE id = :secondary_id`
6. Insert activity log entry: action `customer.merged`, entity_type `customer`, entity_id = primary_id, detail_json = `{ "secondary_id": 2, "secondary_name": "John D. Smith", "orders_moved": 3, "addresses_moved": 1, "notes_moved": N }`

> Updated 2026-06-09: Step 3 added to move `customer_notes` from secondary to primary (ADR-065).

If any step fails, the entire transaction rolls back and returns 500.

### Auto-detect duplicates

#### Access point

- On the Customers page toolbar: "Find Duplicates" link/button (secondary style).

#### API endpoint

```
GET /api/customers/duplicates
```

Response:

```json
{
  "groups": [
    {
      "customers": [
        {
          "id": 1,
          "first_name": "John",
          "last_name": "Smith",
          "email": "john@example.com",
          "order_count": 5
        },
        {
          "id": 2,
          "first_name": "John D.",
          "last_name": "Smith",
          "email": "jsmith@example.com",
          "order_count": 3
        }
      ],
      "match_reason": "Same last name, similar first name"
    }
  ]
}
```

#### Matching algorithm

Two customers are considered potential duplicates if:

1. `LOWER(TRIM(last_name))` is identical, AND
2. `LOWER(TRIM(first_name))` has Levenshtein distance ≤ 2

OR: 3. `LOWER(TRIM(email))` is identical and non-empty (regardless of name)

#### UI for duplicate groups

- Display as a list of groups, each showing the matched customers side by side.
- Each group has a "Merge" button that opens the merge modal pre-filled with the two customers (first customer as primary by default).
- Groups with more than 2 potential duplicates show all members; user must select which two to merge at a time.

### Edge cases

- **Customer with no orders and no addresses**: can be deleted directly without merge (per existing delete behavior, ADR-022). Merge is for when both have data.
- **Address label conflicts**: if both customers have an address with `is_default = true`, after merge, only the primary's default remains. Secondary's address has `is_default` set to `false`.
- **Self-merge prevention**: API rejects with 400 if `primary_id === secondary_id`.

## Consequences

- **Positive**: Resolves the duplicate customer problem created by Etsy sync name variations. Consolidates order history for accurate reporting and customer lifetime value. Non-destructive to order data — only the customer record linkage changes.
- **Negative**: Merge is irreversible (by design — undo would require storing the pre-merge state). Fuzzy matching for auto-detect may surface false positives. Users must manually review each merge candidate.

## Notes

- Cross-references: ADR-022 (delete rules — merge bypasses the "customer with orders cannot be deleted" rule because orders are reassigned first), ADR-019 (Etsy sync customer matching — sync creates duplicates that this tool resolves), ADR-037 (activity log — `customer.merged` event logged), ADR-048 (duplicate detection on entry — prevents future duplicates; this ADR handles existing ones), ADR-032 (confirmation dialogs — merge confirmation)
- The merge operation is atomic (single transaction). If the server crashes mid-merge, no partial state is possible.
- Future consideration: bulk merge (merge an entire duplicate group at once). Not in scope for v1 — users merge two at a time.
