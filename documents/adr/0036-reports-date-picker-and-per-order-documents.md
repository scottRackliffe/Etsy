# ADR-036: Reports date picker UI and per-order document generation

## Status

Accepted

## Date

2026-05-24

## Context

Two report gaps exist:

1. **Date picker:** The backend supports `from_date` and `to_date` query params on Sales and Postal-by-vendor reports, but the Reports page has no date picker controls. Users cannot filter reports by date range.

2. **Per-order documents:** ADR-013 specifies that Thank-you notes and Invoices are per-order documents (one order → one PDF). The current implementation generates aggregate list reports (all paid orders → thank-you list, all unpaid orders → invoice list). There is no way to generate a single thank-you note or invoice for a specific order.

## Decision

**Add date range controls to the Reports page and implement per-order document generation for thank-you notes and invoices.**

---

### Reports page — date range controls

Add a date range section above the report action buttons:

```
┌─────────────────────────────────────────────────────────┐
│ Reports                                                 │
├─────────────────────────────────────────────────────────┤
│ Report type: [Sales          ▼]                         │
│                                                         │
│ Date range:  [From: ____-__-__]  [To: ____-__-__]      │
│              [Today] [This week] [This month] [YTD]     │
│              [All time]                                 │
│                                                         │
│ [Preview CSV]  [Download CSV]  [Download PDF]           │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Preview area                                        │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Date input fields:**

- Two `TextInput` fields with `type="date"` (native HTML date picker).
- Labels: "From" and "To" via `FormField`.
- Both optional. Omitting both = "All time."

**Quick-select presets:**

- Horizontal row of small buttons below the date inputs.
- Each preset sets both `from_date` and `to_date`:

| Preset       | `from_date`                | `to_date`                |
| ------------ | -------------------------- | ------------------------ |
| Today        | Today's date               | Today's date             |
| This Week    | Monday of current week     | Today                    |
| This Month   | 1st of current month       | Today                    |
| This Quarter | 1st of current quarter     | Today                    |
| This Year    | Jan 1 of current year      | Today                    |
| Last Month   | 1st of previous month      | Last day of prev month   |
| Last Quarter | 1st of previous quarter    | Last day of prev quarter |
| Last Year    | Jan 1 of previous year     | Dec 31 of previous year  |
| Custom Range | User-specified             | User-specified           |
| All time     | (empty)                    | (empty)                  |

- Clicking a preset fills the date inputs and visually highlights the active preset.
- Manually editing a date input clears the preset highlight.

**Date params passed to API:**

- All download/preview URLs include `&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD` when set.
- Reports that don't support dates (Outstanding items, AR aging) ignore these params.

**Reports that support date filtering:**

| Report                     | Supports dates                   |
| -------------------------- | -------------------------------- |
| Sales                      | Yes                              |
| Costs                      | Yes (filter by `date_purchased`) |
| Income MTD                 | No (fixed to current month)      |
| Income YTD                 | No (fixed to current year)       |
| Postal by vendor           | Yes                              |
| AR aging                   | No (always as-of today)          |
| Thank-you note (aggregate) | Yes (filter by `order_date`)     |
| Invoice (aggregate)        | Yes                              |
| Outstanding items          | No                               |

For reports that don't support dates, the date inputs are visually disabled with a note: "This report does not support date filtering."

---

### Per-order document generation

**New API endpoints:**

| Method | Path                                    | Purpose                                        |
| ------ | --------------------------------------- | ---------------------------------------------- |
| GET    | `/api/reports/invoice/[orderId]`        | Generate invoice for a single order. Query param: `?format=pdf` (default) or `?format=csv`. |
| GET    | `/api/reports/thank-you-note/[orderId]` | Generate thank-you note PDF for a single order. Always PDF (no CSV option). |

**Invoice — single order (per ADR-013 spec):**

The PDF contains:

1. Business logo (from settings, if set).
2. Business name and address (from settings).
3. "Invoice #" + order number.
4. Buyer ship-to address (from order).
5. Order date.
6. Line items table: for each `order_item` — inventory description (or item_number), quantity, unit price, line total.
7. Subtotal.
8. Discount (if any `discount_total > 0`).
9. Shipping total.
10. Grand total.
11. Payment/shipping status (badges as text: "Paid" / "Unpaid", "Shipped" / "Not shipped").

**Thank-you note — single order:**

The PDF contains:

1. Business logo (optional).
2. Greeting: "Thank you for your order!"
3. Customer name: ship-to first + last name.
4. Order date.
5. Item list: for each order_item, show inventory description (or item_number) and quantity.
6. Closing: "We hope you enjoy your purchase!"
7. Business name (from settings).

**Implementation:**

Add to `reporting.ts`:

- `buildSingleInvoice(orderId: number): ReportResult` — queries order + order_items + inventory + customer + settings for one order.
- `buildSingleThankYou(orderId: number): ReportResult` — queries same data, formats as thank-you.

Both validate that the order exists and has `order_status = 'active'`. Return 404 if not found or not active.

**PDF layout for per-order docs:**

- Use the same `buildReportPdf` with enhanced layout: proper table with column headers, centered logo, formatted currency, structured address block.
- Page size: letter (8.5 × 11 in) per ADR-013.
- Fonts and layout per ADR-013 (brand layout: Crimson Text headings + Raleway body, brand banner).

---

### Integration with Orders page (ADR-031)

The order detail panel in Sales includes "Print invoice" and "Thank-you note" buttons. These link to:

- `/api/reports/invoice/{orderId}?format=pdf` — opens PDF in new tab for printing.
- `/api/reports/thank-you-note/{orderId}?format=pdf` — opens PDF in new tab.

---

### Report type display names

Replace kebab-case report names with user-friendly labels in the dropdown:

| Value               | Display label             |
| ------------------- | ------------------------- |
| `thank-you-note`    | Thank You Note            |
| `invoice`           | Invoice                   |
| `sales`             | Sales Report              |
| `costs`             | Costs Report              |
| `income-mtd`        | Income — Month to Date    |
| `income-ytd`        | Income — Year to Date     |
| `postal-by-vendor`  | Postal Costs by Carrier   |
| `outstanding-items` | Outstanding Items         |
| `ar-aging`          | Accounts Receivable Aging |
| `accounting-export` | Accounting Export         |

> **Note (2026-06-17):** `income-mtd`, `income-ytd`, and `postal-by-vendor` have been removed (redundant with enhanced Sales and Costs reports). `accounting-export` added with full double-entry bookkeeping and GAAP account numbers (ADR-056).

## Consequences

- **Positive**
  - Users can filter date-sensitive reports by any range.
  - Quick presets cover the most common date ranges with one click.
  - Per-order invoice and thank-you PDFs enable the customer-facing document workflow specified in ADR-013.
  - Reports are accessible both from the Reports page and from order context in Sales.
- **Negative**
  - Two new API route files for per-order reports.
  - Per-order PDFs need a more polished layout than the aggregate reports (logo, address block, table formatting).

### Reconciliation note (updated 2026-06-09)

Updated 2026-06-09: Per-order report URLs confirmed as path-based (`/api/reports/invoice/[orderId]`, `/api/reports/thank-you-note/[orderId]`). Added `?format=pdf|csv` parameter for invoices. Expanded date presets from 5 to 10 options: added This Quarter, This Year, Last Month, Last Quarter, Last Year, and Custom Range.
