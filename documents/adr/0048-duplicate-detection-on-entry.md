# ADR-048: Duplicate detection on entry

## Status
Accepted

## Date
2026-05-24

## Context
There is no warning when adding an inventory item with a similar description or a customer with the same name and email. Duplicate records cause confusion in reporting, order assignment, and customer communication. Etsy sync (ADR-019) already handles receipt-level deduplication, but manual entry has no such protection.

## Decision
Implement non-blocking duplicate detection warnings on record creation for inventory and customers. Warnings inform the user but never prevent creation.

### Inventory duplicate detection

#### Trigger
When creating a new inventory item, after the `item_number` uniqueness check passes, check the `description` field against existing inventory records.

#### Matching algorithm
A match is reported if ANY of the following conditions is true against an existing item's description:
1. **Case-insensitive substring**: the new description (trimmed, lowercased) is contained within an existing description, or vice versa, AND the shorter string is at least 10 characters long.
2. **Levenshtein distance ≤ 3**: computed on lowercase, trimmed strings (only checked when both strings are ≤ 100 characters to avoid performance issues).
3. **Trigram similarity > 0.5**: trigram overlap ratio between the two lowercased descriptions.

#### API endpoint
```
GET /api/inventory/check-duplicate?description=<text>
```
- Returns: `{ duplicates: [{ id, item_number, description }] }` (max 5 results)
- If no matches: `{ duplicates: [] }`
- The query parameter is URL-encoded. Minimum 5 characters required to trigger a search; shorter values return empty.

#### Frontend behavior
- On blur of the `description` field during item creation (not edit), call the check-duplicate endpoint.
- If duplicates returned: show inline warning below the description field:
  > ⚠️ Similar items found: [Item #123 — Blue ceramic vase], [Item #456 — Blue ceramic bowl]. Continue creating?
- Warning is dismissible — user can proceed without action.
- Warning does NOT appear during edit (only on create).

### Customer duplicate detection

#### Trigger
When creating a new customer, check for name and email matches against existing customers.

#### Matching rules
1. **Name match**: exact match on `LOWER(TRIM(first_name)) + ' ' + LOWER(TRIM(last_name))`. Matches where both first and last name are identical (case-insensitive).
2. **Email match**: if email is provided and non-empty, exact match on `LOWER(TRIM(email))` against existing customer emails.

#### API endpoint
```
GET /api/customers/check-duplicate?first_name=<text>&last_name=<text>&email=<text>
```
- All parameters are optional (but at least `first_name` + `last_name` OR `email` must be provided)
- Returns: `{ duplicates: [{ id, first_name, last_name, email }] }` (max 5 results)
- Results are the union of name matches and email matches (deduplicated by `id`)

#### Frontend behavior
- On blur of `last_name` field (if `first_name` is also filled) AND on blur of `email` field: call check-duplicate endpoint.
- If name match found, show inline warning:
  > ⚠️ A customer named "John Smith" already exists. [View existing](#) | Continue creating
- If email match found, show inline warning:
  > ⚠️ This email is already associated with "Jane Doe". [View existing](#) | Continue creating
- "View existing" opens the existing customer in the Customers tab (deep link per ADR-035).
- Warnings are non-blocking — user can always dismiss and proceed with creation.
- Warnings do NOT appear during edit (only on create).

### Performance considerations
- Duplicate checks are performed client-side on blur (not on every keystroke) to minimize API calls.
- Server-side queries use indexed columns (`item_number` is unique-indexed; `first_name`, `last_name`, `email` have composite index).
- For inventory description matching: if the inventory table exceeds 10,000 rows, only trigram matching is used (substring and Levenshtein are disabled for performance).

## Consequences
- **Positive**: Reduces accidental duplicates without blocking legitimate entries. Educates users about existing data. Lightweight — no schema changes, just new read-only API endpoints.
- **Negative**: Fuzzy matching may produce false positives (similar but distinct items). Performance cost on each create form blur event. Does not detect duplicates retroactively for existing data (see ADR-053 for customer merge).

## Notes
- Cross-references: ADR-021 (validation rules — duplicate check is advisory, not a validation failure), ADR-019 (Etsy sync customer matching — sync uses `etsy_receipt_id` for dedup, not this fuzzy logic), ADR-053 (customer merge — handles existing duplicates after the fact)
- The duplicate check endpoints are GET requests with no side effects — safe to call repeatedly.
- SQLite does not have built-in trigram support; implementation should use a simple JavaScript trigram function on the server side (iterate existing records with a LIKE pre-filter to narrow candidates before computing similarity).
