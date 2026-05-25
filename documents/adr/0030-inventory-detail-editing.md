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

| Field | Label | Input type | Notes |
|-------|-------|------------|-------|
| `item_number` | Item number | `TextInput` | Read-only after creation (unique constraint) |
| `description` | Description | `TextArea` (multi-line) | Free text |
| `status` | Status | `SelectInput` | Options: `Draft`, `In stock`, `Listed`, `Sold`, `Reserved`, `Retired` (ADR-002, ADR-017) |
| `quantity` | Quantity | `TextInput` type="number" | Default 1 |

**Financials section:**

| Field | Label | Input type | Notes |
|-------|-------|------------|-------|
| `purchase_cost` | Purchase cost | `TextInput` type="number" | Currency formatted display |
| `shipping_cost` | Shipping cost (inbound) | `TextInput` type="number" | Cost to receive item |
| `sale_revenue` | Sale price | `TextInput` type="number" | What it sold for |
| `category_tags` | Category / tags | `TextInput` | Comma-separated |

**Dates section:**

| Field | Label | Input type | Notes |
|-------|-------|------------|-------|
| `date_purchased` | Date purchased | `TextInput` type="date" | HTML date input |
| `date_listed` | Date listed | `TextInput` type="date" | Auto-set when published to Etsy |
| `date_of_sale` | Date sold | `TextInput` type="date" | Auto-set when order synced |
| `shipping_date` | Date shipped | `TextInput` type="date" | |

**Condition section:**

| Field | Label | Input type | Notes |
|-------|-------|------------|-------|
| `condition_code` | Condition | `SelectInput` | Options: `Mint/Near Mint`, `Excellent`, `Very Good`, `Good`, `Fair/As-Is` (ADR-002) |
| `has_condition_issue` | Has condition issue | Checkbox | Boolean toggle |
| `condition_notes` | Condition notes | `TextArea` | Free text; required if `has_condition_issue` is true |

**Notes section:**

| Field | Label | Input type | Notes |
|-------|-------|------------|-------|
| `notes` | Internal notes | `TextArea` | Free text; never shown to customers |

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

- The existing listing workshop UI (manual form, AI generation, portable import, approve/reject/publish) moves into a collapsible section below the detail panel.
- Default state: collapsed, showing draft state badge and "Open listing workshop" button.
- When expanded, the existing workshop UI is displayed as-is (with shared component adoption per ADR-028).
- AI settings and Etsy publish defaults sections are **removed from Inventory** — they belong in Config only (eliminates duplication).

## Consequences

- **Positive**
  - Users can view and edit all inventory fields from the UI for the first time.
  - Clean separation between inventory data management and listing authoring.
  - Removes duplicated settings sections from Inventory page.
  - Dirty tracking prevents accidental data loss.
- **Negative**
  - Significant refactor of the largest page in the app.
  - Page becomes two-panel layout which needs responsive handling.
