# ADR-030: Inventory detail editing — core field management UI

## Status

Accepted

## Date

2026-05-24

## Context

The Inventory page currently functions only as a "Listing authoring workshop." Users can edit listing-related fields (title, description, tags, category, strategy fields) and manage pictures, but there is no way to view or edit core inventory data fields from the UI: `purchase_cost`, `sale_revenue`, `condition_code`, `condition_notes`, `has_condition_issue`, `status`, `quantity`, `date_purchased`, `date_listed`, `date_of_sale`, `shipping_date`, `shipping_cost`, `category_tags`, or `notes`. The only way to set these fields is through the API directly. This makes the inventory page incomplete for actual store management.

## Decision

**Add a full inventory detail panel alongside the existing listing workshop.** The page is restructured into two major sections: **Inventory detail** (core data) and **Listing workshop** (authoring and publish workflow). Both operate on the same selected inventory item.

---

### Page layout

```
┌─────────────────────────────────────────────────────────┐
│ Inventory              [Search] [Status filter chips]   │
│                        [+ Add item]                     │
├─────────────────────────────────────────────────────────┤
│ DataTable (item list with pagination)                   │
├────────────────────────┬────────────────────────────────┤
│ Item detail panel      │ Listing workshop (existing)    │
│ (editable fields)      │ (collapsed by default,         │
│                        │  expand to work on listing)    │
└────────────────────────┴────────────────────────────────┘
```

On screens < `lg`, the two panels stack vertically (detail on top, listing below).

---

### Inventory detail panel — fields (exact)

All fields use `FormField` + `TextInput` or `SelectInput`. Changes are saved via `PATCH /api/inventory/[id]` on explicit "Save changes" button click (not on blur).

**Identity section:**

| Field         | Label       | Input type                | Notes                                                                                    |
| ------------- | ----------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| `item_number` | Item number | `TextInput`               | Read-only after creation (unique constraint)                                             |
| `description` | Description | `TextArea` (multi-line)   | Free text                                                                                |
| `status`      | Status      | `SelectInput`             | Options: `Draft`, `In stock`, `Listed`, `Sold`, `Reserved`, `Retired` (ADR-002, ADR-017) |
| `quantity`    | Quantity    | `TextInput` type="number" | Default 1                                                                                |

**Financials section:**

| Field           | Label                   | Input type                | Notes                      |
| --------------- | ----------------------- | ------------------------- | -------------------------- |
| `purchase_cost` | Purchase cost           | `TextInput` type="number" | Currency formatted display |
| `shipping_cost` | Shipping cost (inbound) | `TextInput` type="number" | Cost to receive item       |
| `sale_revenue`  | Sale price              | `TextInput` type="number" | What it sold for           |
| `category_tags` | Category / tags         | `TextInput`               | Comma-separated            |

**Dates section:**

| Field            | Label          | Input type              | Notes                           |
| ---------------- | -------------- | ----------------------- | ------------------------------- |
| `date_purchased` | Date purchased | `TextInput` type="date" | HTML date input                 |
| `date_listed`    | Date listed    | `TextInput` type="date" | Auto-set when published to Etsy |
| `date_of_sale`   | Date sold      | `TextInput` type="date" | Auto-set when order synced      |
| `shipping_date`  | Date shipped   | `TextInput` type="date" |                                 |

**Condition section:**

| Field                 | Label               | Input type    | Notes                                                                               |
| --------------------- | ------------------- | ------------- | ----------------------------------------------------------------------------------- |
| `condition_code`      | Condition           | `SelectInput` | Options: `Mint/Near Mint`, `Excellent`, `Very Good`, `Good`, `Fair/As-Is` (ADR-002) |
| `has_condition_issue` | Has condition issue | Checkbox      | Boolean toggle                                                                      |
| `condition_notes`     | Condition notes     | `TextArea`    | Free text; required if `has_condition_issue` is true                                |

**Notes section:**

| Field   | Label          | Input type | Notes                               |
| ------- | -------------- | ---------- | ----------------------------------- |
| `notes` | Internal notes | `TextArea` | Free text; never shown to customers |

**Etsy Listing Details section:**

Fields required by Etsy for publishing. Per-item values here override global defaults from Config (ADR-034 §5). See ADR-017 §1c.

| Field                      | Label               | Input type                                           | DB column(s)                                                                         | Notes                                                                                                                                                                                                                                                                                                     |
| -------------------------- | -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `etsy_when_made`           | Era (When made)      | `SelectInput`                                        | `inventory.etsy_when_made`                                                           | Full Etsy `when_made` enum per ADR-017 §1a: `made_to_order`, `2020_2026`, `2010_2019`, `2004_2009`, `2000_2003`, `1990s`, `1980s`, `1970s`, `1960s`, `1950s`, `1940s`, `1930s`, `1920s`, `1910s`, `1900s`, `1800s`, `1700s`, `before_1700`. Required before publish.                                       |
| `etsy_taxonomy_id`         | Category             | Search/browse input (Etsy taxonomy)                  | `inventory.etsy_taxonomy_id` (numeric) + `inventory.listing_category_path` (display) | Resolves to Etsy taxonomy ID. Display text stored in `listing_category_path`. Required before publish.                                                                                                                                                                                                    |
| `materials`                | Materials            | Tag-style multi-value input                          | `inventory.materials` (JSON array)                                                   | Optional but recommended. Etsy allows up to 13 materials.                                                                                                                                                                                                                                                 |
| `item_length`              | Length               | `TextInput` type="number"                            | `inventory.item_length`                                                              | Part of Dimensions group. Numeric.                                                                                                                                                                                                                                                                         |
| `item_width`               | Width                | `TextInput` type="number"                            | `inventory.item_width`                                                               | Part of Dimensions group. Numeric.                                                                                                                                                                                                                                                                         |
| `item_height`              | Height               | `TextInput` type="number"                            | `inventory.item_height`                                                              | Part of Dimensions group. Numeric.                                                                                                                                                                                                                                                                         |
| `item_dimensions_unit`     | Dimensions unit      | `SelectInput`                                        | `inventory.item_dimensions_unit`                                                     | Options: `in`, `ft`, `mm`, `cm`, `m`. Default: `in`.                                                                                                                                                                                                                                                      |
| `item_weight`              | Weight               | `TextInput` type="number"                            | `inventory.item_weight`                                                              | Numeric.                                                                                                                                                                                                                                                                                                   |
| `item_weight_unit`         | Weight unit          | `SelectInput`                                        | `inventory.item_weight_unit`                                                         | Options: `oz`, `lb`, `g`, `kg`. Default: `oz`.                                                                                                                                                                                                                                                             |
| `video_path`               | Video                | File upload (MP4/MOV, max 100 MB, 5–15 sec)         | `inventory.video_path`                                                               | Optional listing video. See ADR-026 §9 and ADR-033 video upload zone.                                                                                                                                                                                                                                     |
| `is_supply`                | Is supply            | Checkbox                                             | `inventory.is_supply`                                                                | Default unchecked (finished product). Etsy requires this field; most vintage items are not supplies.                                                                                                                                                                                                        |

**Pictures section (20 slots):**

- Photo grid: 20 item photo slots (`picture_1..picture_20`) per ADR-033.
- Each photo thumbnail shows its **shot type classification badge** (from `picture_classifications` JSON). Clicking the badge opens the classification dropdown: first option "OK" (keep current type), then the full shot type enum per ADR-072 §Photo classification.
- Photos added outside the Listing Coach default to `extra` unless the operator assigns a type.
- **"Auto-sort by type"** button: reorders photos into canonical Photo Guide sequence (hero first, then angle, detail, backstamp, scale, imperfection, underside, grouping, lifestyle, measurement, extra). Confirmation prompt before reorder.
- Condition photo grid: 5 slots (`condition_picture_1..condition_picture_5`). Not classified.
- See ADR-033 for full grid UX specification.

---

### Vendor sourcing section (`purchases` table)

**Purpose:** Record what Trudy paid **vendors** (flea markets, estate sales) for an item — distinct from `purchase_cost` on the inventory row (summary) and from customer **orders**.

**UI label:** “Where I bought this” (not “Purchase” alone — avoid confusion with customer sales).

```
┌─────────────────────────────────────────┐
│ Where I bought this        [+ Add buy]  │
├─────────────────────────────────────────┤
│ DataTable: Date | Vendor | Price | Ship │
│            | Ref # | Notes | [Edit][Del]│
└─────────────────────────────────────────┘
```

| Column    | Source field                 |
| --------- | ---------------------------- |
| Date      | `purchases.purchase_date`    |
| Vendor    | `purchases.vendor_name`      |
| Price     | `purchases.purchase_price`   |
| Shipping  | `purchases.shipping_price`   |
| Reference | `purchases.reference_number` |
| Notes     | `purchases.notes`            |

- **API:** `GET/POST /api/purchases?inventory_id=` (filter by inventory) or nested `GET/POST /api/inventory/[id]/purchases` per ADR-018 catalog pattern; `PATCH/DELETE /api/purchases/[id]`.
- **Add buy modal:** Vendor name (required), purchase date (default today), purchase price, shipping price, reference #, notes.
- **Delete:** ConfirmDialog (ADR-032).
- **Empty state:** “No vendor purchases recorded. Add where you bought this item.” + **Add buy** CTA.
- **Optional rollup:** Show sum of `purchase_price + shipping_price` and compare to inventory `purchase_cost` (informational only).

Cross-ref: ADR-017 (`purchases` table), ADR-070 (vendor buys in scope), ADR-071 (toasts on save).

**Read-only metadata (displayed, not editable):**

- `id` — shown as "Item ID" in header
- `etsy_listing_id` — shown if present, with link to Etsy listing
- `is_listed` — shown as badge (Listed / Not listed)
- `created_at`, `updated_at` — shown as formatted dates

---

### Save behavior

- Explicit "Save changes" button at the bottom of the detail panel.
- Button uses `<Button variant="accent" busy={saving}>Save changes</Button>`.
- On success: toast notification ("Item updated").
- On error: toast notification with error message.
- **Dirty tracking:** If the user has unsaved changes and selects a different item, show a confirmation dialog (per ADR-032): "You have unsaved changes. Discard them?"

---

### Item list improvements

- Replace the current `<select>` dropdown with a `DataTable` showing: `item_number`, `description` (truncated to 40 chars), `status` (as `Badge`), `sale_revenue` (formatted).
- Click row to select and load detail panel.
- Search and filter per ADR-029.
- Pagination per ADR-029.

---

### Create item flow

- Replace the current inline inputs with a Modal (per ADR-032):
  - Title: "Add inventory item"
  - Fields: Item number (required), Description, Status (default: `draft`), Purchase cost, Condition.
  - Buttons: "Create" (accent) and "Cancel" (secondary).
- On success: close modal, select new item, toast "Item created."

---

### Delete item flow

- Per ADR-032: confirmation dialog before deletion.
- Dialog text: "Delete item {item_number}? This cannot be undone. Items linked to orders cannot be deleted."
- On success: remove from list, select next item or show empty state.

---

### Listing workshop changes

- The listing workshop UI (manual form, AI generation, portable import, approve/reject/publish) lives in a collapsible section below the inventory detail panel and above pictures.
- Default state: collapsed. Toggle via **Listing workshop** / **Hide workshop** button in the page toolbar (alongside Add item and Delete selected).
- When collapsed, draft state is shown on the selected-item summary line; a separate draft badge is not required in v1.
- Auto-expand when `listing_draft_state` is `generated` or `imported`, or when arriving from Listing Coach with `?itemId=<id>&openWorkshop=1`.
- When expanded, workshop UI uses shared components (ADR-028) and per-mode requirement info cards (ADR-023). Required listing fields are marked with a red asterisk.
- AI settings and Etsy publish defaults sections are **removed from Inventory** — they belong in Config only (eliminates duplication).
- v1 uses a **vertical stack** layout on all breakpoints; side-by-side detail | workshop is aspirational/post-v1.

## Consequences

- **Positive**
  - Users can view and edit all inventory fields from the UI for the first time.
  - Clean separation between inventory data management and listing authoring.
  - Removes duplicated settings sections from Inventory page.
  - Dirty tracking prevents accidental data loss.
- **Negative**
  - Significant refactor of the largest page in the app.
  - Page becomes two-panel layout which needs responsive handling.
