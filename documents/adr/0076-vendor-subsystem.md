# ADR-076: Vendor subsystem — normalized vendor records with dedicated tab

## Status

Accepted

## Date

2026-06-17

## Context

Vendors (suppliers from whom Trudy buys inventory to resell) are currently tracked as a free-text `vendor_name` column on the `purchases` and `receipts` tables. There is no normalized vendor record, no contact information, no address, and no way to view all purchases from a single vendor. The `GET /api/purchases/vendors` endpoint returns `SELECT DISTINCT vendor_name` as a convenience, but this provides no structure.

A proper vendor subsystem enables:
- Consistent vendor identity across purchases and receipts (no typo-based duplicates)
- Vendor contact info for reordering and communication
- Purchase history per vendor
- Better data quality for the Vendor Profitability report (ADR-006, reporting.ts)

## Decision

### 1. New `vendors` table

| Column                  | Type    | Constraints               | Notes                                                         |
| ----------------------- | ------- | ------------------------- | ------------------------------------------------------------- |
| id                      | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key.                                                |
| name                    | TEXT    | NOT NULL, UNIQUE          | Business/vendor name.                                         |
| address_1               | TEXT    |                           | Street address line 1.                                        |
| address_2               | TEXT    |                           | Street address line 2 (optional).                             |
| city                    | TEXT    |                           |                                                               |
| state                   | TEXT    |                           | State / province.                                             |
| postal_code             | TEXT    |                           |                                                               |
| country                 | TEXT    |                           | Default: "US".                                                |
| contact_person          | TEXT    |                           | Primary contact name.                                         |
| email                   | TEXT    |                           |                                                               |
| phone                   | TEXT    |                           |                                                               |
| website                 | TEXT    |                           | Vendor website or online store URL.                           |
| account_number          | TEXT    |                           | Your account number with this vendor (for reorders).          |
| payment_terms           | TEXT    |                           | e.g. "Net 30", "COD", "Prepaid".                              |
| tax_id                  | TEXT    |                           | Vendor EIN / Tax ID (for 1099 reporting).                     |
| is_preferred            | INTEGER | NOT NULL DEFAULT 0        | 1 = preferred/favorite vendor.                                |
| vendor_category         | TEXT    |                           | e.g. "Estate sale", "Auction house", "Antique mall", "Online".|
| default_shipping_method | TEXT    |                           | How vendor typically ships to you.                            |
| notes                   | TEXT    |                           | Free-text notes about this vendor.                            |
| is_active               | INTEGER | NOT NULL DEFAULT 1        | 1 = active, 0 = inactive (soft-delete).                       |
| created_at              | TEXT    | NOT NULL                  | ISO 8601 timestamp.                                           |
| updated_at              | TEXT    | NOT NULL                  | ISO 8601 timestamp.                                           |

### 2. Foreign key on `purchases` and `receipts`

Add `vendor_id INTEGER REFERENCES vendors(id)` to both `purchases` and `receipts` tables.

- **`purchases.vendor_id`**: optional FK to `vendors.id`. When set, `vendor_name` is populated from `vendors.name` for backward compatibility.
- **`receipts.vendor_id`**: optional FK to `vendors.id`. Same backward-compat behavior.
- **Backward compatibility**: keep `vendor_name` TEXT on both tables. Old rows with `vendor_name` but no `vendor_id` continue to work. Reports fall back to `vendor_name` when `vendor_id` is NULL.

### 3. Migration strategy

1. Create `vendors` table
2. Backfill vendors from existing data:
   ```sql
   INSERT INTO vendors (name)
   SELECT DISTINCT vendor_name FROM purchases
   WHERE vendor_name IS NOT NULL AND vendor_name != ''
   UNION
   SELECT DISTINCT vendor_name FROM receipts
   WHERE vendor_name IS NOT NULL AND vendor_name != '';
   ```
3. Add `vendor_id` column to `purchases` and `receipts`
4. Backfill `vendor_id` on existing rows:
   ```sql
   UPDATE purchases SET vendor_id = (
     SELECT id FROM vendors WHERE vendors.name = purchases.vendor_name
   ) WHERE vendor_name IS NOT NULL AND vendor_name != '';

   UPDATE receipts SET vendor_id = (
     SELECT id FROM vendors WHERE vendors.name = receipts.vendor_name
   ) WHERE vendor_name IS NOT NULL AND vendor_name != '';
   ```
5. Create index: `CREATE INDEX idx_purchases_vendor_id ON purchases(vendor_id)`
6. Create index: `CREATE INDEX idx_receipts_vendor_id ON receipts(vendor_id)`

### 4. API endpoints

| Method | Path                        | Auth | Purpose                                                     |
| ------ | --------------------------- | ---- | ----------------------------------------------------------- |
| GET    | `/api/vendors`              | App  | List vendors. Supports `search`, `sort_by`, `sort_dir`, `limit`, `offset`, `is_active` filter. Returns `{ items, pagination }`. |
| POST   | `/api/vendors`              | App  | Create vendor. Body: `{ name, address_1?, address_2?, city?, state?, postal_code?, country?, contact_person?, email?, phone?, notes? }`. 201. |
| GET    | `/api/vendors/[id]`         | App  | Get single vendor with purchase summary (total purchases, total spend). |
| PUT    | `/api/vendors/[id]`         | App  | Update vendor fields. PATCH semantics (omitted = unchanged). |
| DELETE | `/api/vendors/[id]`         | App  | Soft-delete: set `is_active = 0`. If vendor has purchases, deactivate only (never hard-delete). |
| GET    | `/api/vendors/[id]/purchases` | App | Purchase history for vendor. Returns purchases with linked inventory details. |

The existing `GET /api/purchases/vendors` endpoint is **deprecated** — new code should use `GET /api/vendors` instead. The old endpoint remains for backward compatibility.

Update existing APIs:
- `POST /api/purchases` and `PATCH /api/purchases/[id]`: accept optional `vendor_id`. When `vendor_id` is provided, `vendor_name` is auto-populated from `vendors.name`.
- `POST /api/receipts` and `PATCH /api/receipts/[id]`: accept optional `vendor_id`. Same auto-populate behavior. When creating a receipt with a `vendor_name` that matches an existing vendor, auto-link the `vendor_id`.

### 5. Vendors tab (UI)

**Position in tab bar:** After Customers, before Reports.

```
Dashboard | Sales | Inventory | Receipts | Customers | Vendors | Reports | Tutorial & Tips | Outstanding | Config
```

**Route:** `src/app/(app)/vendors/page.tsx`

**Layout:** Standard Entity Management Screen (**SEMS**, ADR-079). Vendors was the SEMS **pilot**
(WS-E1). Full-width record list with **"+ Add New Vendor"** as the first row; selecting/editing
opens the **inline editor that replaces the list** (list collapses to a breadcrumb), with a sticky
Cancel/Save bar and the 3-button unsaved-changes guard (ADR-079 §2/§4).

- **Record list (Region 1):**
  - Search bar (name, contact person, email)
  - Sortable columns: Name, Contact Person, City/State, Phone
  - Active/inactive filter toggle
  - "+ Add New Vendor" as the first row; per-row Edit/Delete actions; double-click row = edit

- **Editor (Region 2) + record context (Region 3):**
  - Header: vendor name (editable)
  - Contact section: contact person, email, phone
  - Address section: full address fields
  - Notes field
  - Purchase history (Region 3): table of purchases from this vendor (date, item, cost, shipping)
  - Summary: total purchases count, total spend, last purchase date
  - Sticky Cancel / Save bar (Delete via row action + ConfirmDialog)

**Deep-link:** `?vendorId=<id>` query parameter selects and scrolls to vendor (per ADR-035 pattern).

### 6. VendorPicker component and OCR vendor matching

**`VendorPicker`** (`src/components/ui/VendorPicker.tsx`) is a reusable React component used wherever a vendor must be selected. It provides:

- Dropdown of active vendors from `GET /api/vendors`
- "+ Add new vendor..." inline creation flow (name input → `POST /api/vendors` → auto-select)
- `ocrHint` prop for OCR-detected vendor names:
  - When provided, calls `GET /api/vendors/match?name=<hint>` for fuzzy matching
  - Shows a yellow suggestion bar: "Receipt says: '<hint>' — Did you mean: <vendor>?"
  - User can click a match to auto-select, create the hint as a new vendor, or dismiss
  - Pre-fills the "Add new" input with the OCR name

**`GET /api/vendors/match`** fuzzy-match endpoint (ADR-018 §35):
- Scores: exact (100), prefix (90), substring contains (80), token overlap (20–70)
- Returns top 5 matches with `{ id, name, score, reason }`

**Used in:**
- **Receipts page** (`receipts/page.tsx`): OCR vendor name → `ocrHint` on new receipt form; VendorPicker in expanded receipt detail for fixing unlinked vendors on existing receipts
- **Expenses page** (`expenses/page.tsx`): OCR invoice scan → `ocrHint` on expense create form
- **Inventory detail panel** (`InventoryDetailPanel.tsx`): vendor selection in the "Where I bought this" add/edit purchase modals (the former Listing Coach usage moved here when the Coach was removed, ADR-085); yellow hint for unlinked legacy vendors

**Receipt vendor cascade:** When a receipt's vendor is updated via PATCH, the new `vendor_id`/`vendor_name` cascade to all `purchases` records created from that receipt's linked items.

### 7. Report impact

- **Vendor Profitability report** (`buildVendorProfitabilityReport`): join `purchases` to `vendors` via `vendor_id` for consistent vendor identity. Fall back to `purchases.vendor_name` when `vendor_id` is NULL.
- **Costs report** ("Purchase costs by vendor" section): same join/fallback.
- **Accounting export**: no change needed (uses purchase amounts, not vendor identity).

### 8. Delete/referential integrity (per ADR-022 pattern)

- **Vendor with purchases:** Cannot hard-delete. Soft-delete only (`is_active = 0`). Vendor remains visible in historical reports and purchase records.
- **Vendor with no purchases:** Can soft-delete. (Hard delete is also safe but soft-delete is preferred for consistency.)
- **Reactivation:** `PUT /api/vendors/[id]` with `is_active: true` reactivates a deactivated vendor.

## Consequences

- **Positive:** Normalized vendor data eliminates typo-based duplicates. Contact info and address enable communication and record-keeping. Purchase history per vendor provides visibility into sourcing patterns. Vendor Profitability report becomes more accurate with consistent vendor identity.
- **Negative:** Migration must backfill from free-text data, which may create near-duplicate vendor records that the user needs to review. Adds a new tab to the navigation bar.

## Notes

- Cross-references: ADR-002 (inventory data model — `purchase_cost` sourced from vendor), ADR-006 (reports — Vendor Profitability), ADR-017 (schema — `vendors` table §5c, `purchases.vendor_id`, `receipts.vendor_id`), ADR-018 (API — vendor endpoints §34, vendor match §35), ADR-022 (delete behavior — soft-delete pattern), ADR-024 (frontend routing — Vendors tab), ADR-029 (search/filter/sort/pagination on vendor list), ADR-035 (deep-link — `?vendorId=`), ADR-056 (accounting export — no direct impact)
- `VendorPicker` component at `src/components/ui/VendorPicker.tsx` — reusable across Receipts, Expenses, and Inventory detail.
- The existing `GET /api/purchases/vendors` endpoint (distinct vendor names) is deprecated but not removed.
- Future enhancements (post-v1): vendor rating, automatic reorder suggestions, vendor spend dashboard widget.
