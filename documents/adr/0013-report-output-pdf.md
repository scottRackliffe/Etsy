# ADR-013: Report output format — PDF and CSV

## Status

Accepted

## Date

2025-02-15

## Context

ADR-006 defines the set of reports (thank you note, invoice, sales, costs, income MTD/YTD, postal by vendor). Output format is specified in this ADR (PDF and CSV). Reports should look professional and be easy to share, print, or archive. Screen-only or plain-text output would not meet that bar.

## Decision

> **Data model (2026-05-24):** Queries use `orders` + `order_items`; global filter `orders.order_status = 'active'`. Legacy term mapping in Notes schema table.

**Primary report output is PDF, with CSV export for the same report data.** All reports listed in ADR-006 (including profit-by-item, sales tax summary, inventory aging, and accounting export per ADR-038/039/054/056) are generated with a printable PDF view and support CSV export from the same filtered dataset.

- **Generation (updated 2026-06-17):** Reports use an **HTML-based rendering approach**. The API returns report data as structured JSON (`format=json`). The frontend `<ReportViewer>` component renders a branded, print-ready HTML view. The browser's native Print / Save-as-PDF handles PDF output. Server-side PDFKit generation has been removed from regular reports (retained only for batch print queue). Report output is **not cached**; each run generates from current data (see ADR-008).
- **Auth:** Report API routes do **not** require Etsy OAuth. Reports query local SQLite data and work without an Etsy connection.
- **User choices after a report is generated:** The user is offered exactly three actions: **Print / Save as PDF** (browser print dialog), **Export CSV** (download as comma-delimited file), **Close** (dismiss report view). The browser's print dialog handles both printing and PDF export.
- **Export CSV:** Comma-delimited file; same report data and global filter as the HTML view. First row is a header (column names); one row per detail line. Values that contain commas or newlines are quoted per RFC 4180. File extension typically `.csv`.
- **Layout:** Each report uses the **report layout (full spec)** below. Layout is consistent across report types (headers, tables, totals) suitable for a business document.

**Report layout (full spec)**

- **Fonts:** Headings use **Crimson Text** (serif); body text and table data use **Raleway** (sans-serif). These match the Trudy's Classic Treasures brand guide.
- **Brand header:** The report banner image (`/brand/banner.png`) appears at the top of every printed report.
- **Page setup:** `@page { margin: 0.75in; size: letter; }` via CSS `@media print`.
- **Tables:** Proper HTML tables with column headers, alternating row colors (white / cream `#FAF8F3`), right-aligned money columns with monospace `tabular-nums`.
- **Metrics:** Key metrics displayed as card grid above data tables.
- **Page breaks:** `break-inside: avoid` on table rows; `display: table-header-group` on thead for repeating headers.
- **Spacing:** Single line spacing for body; section headers separated by horizontal rules.
- **Brand footer:** "Trudy's Classic Treasures — Classic treasures to warm your home" centered at bottom.

---

**Report content (exact — no ambiguity)**

The following specifies the **exact content** that each report must include. Data sources are per ADR-006; field names refer to ADR-017 (`orders`, `order_items`, `inventory`, `other_costs`). Layout follows the full spec above; content is fixed.

**Report data filter (global — single source of truth):** For every report that uses order/sales data (thank you note, invoice, sales, income MTD/YTD, postal by vendor, AR aging), include **only** `orders` where `order_status = 'active'`. Exclude void and cancelled orders (ADR-017). Each report below applies this filter unless otherwise noted.

**Date-range defaults (global):** If a report supports date filters and no `from_date` / `to_date` is provided, use **All time** (subject to the global active-order filter). If only `from_date` is provided, filter from `from_date` through today. If only `to_date` is provided, filter through `to_date`.

---

**Thank you note** (per order; one `orders` row)

- **Data filter:** Per global rule above (active orders only).
- **Required content:** (1) A greeting (e.g. “Thank you for your order”). (2) Ship-to name: `orders.ship_to_first_name`, `ship_to_last_name`. (3) Order date: `orders.order_date`. (4) List of items: for each `order_items` row on the order, show linked `inventory.description` (or `item_number` if description empty) and `order_items.quantity`. (5) **Tracking section (ADR-074):** If `orders.tracking_number` is non-empty, include: “Your package is on its way!” followed by Tracking number: `orders.tracking_number`, Carrier: `orders.shipping_carrier_service` (when available), and a “Track your package” line with the carrier tracking URL (clickable link in PDF). If no tracking number, omit this section entirely. (6) A closing (e.g. “We hope you enjoy your purchase.”). Optional: business name from settings.
- **Data:** `orders` by id; `order_items` joined to `inventory` for line text. Tracking data from `orders.tracking_number` and `orders.shipping_carrier_service`.

---

**Invoice** (per order)

- **Data filter:** Per global rule above (active orders only).
- **Required content:** (1) Optional: user logo (from system, when set) at top. (2) Business name and address (from settings: business*name, business_address_line_1, business_address_line_2, business_city, business_state_province, business_country, business_postal_code). (3) “Invoice” or “Invoice #” + `orders.order_number` (or id). (4) Buyer / ship-to: `orders.ship_to*\*`snapshot fields. (5) Date:`orders.order_date`. (6) Table of line items: for each `order_items`row — inventory description (or item_number),`quantity`, unit price (`order_items.unit_price`), line total (`order_items.line_total`). **`order_items.unit_price` and `order_items.line_total` are authoritative; `inventory.sale_revenue` is fallback only when order_items values are NULL.** (7) Subtotal (`orders.subtotal`or sum of line totals). (8) Discount: if`orders.discount_total`> 0, show and subtract. (9) Shipping: `orders.shipping_total` (buyer-facing shipping charge); show `orders.shipper` if set. (10) Tax: if `orders.tax_total` > 0, show as a separate line. (11) Total: `orders.grand_total` (= subtotal + shipping_total + tax_total − discount_total; per ADR-017). (12) Payment/shipping status from `orders.was_paid`, `orders.shipping_date`, `orders.shipper`. (13) **Shipping details (ADR-074):** If `orders.tracking_number` is non-empty, show: Shipping method: `orders.shipping_carrier_service` (when available); Tracking: `orders.tracking_number`. These appear in the shipping/status section of the invoice.
- **Data:** `orders` + `order_items` joined to `inventory`; ship-to from order snapshot only. Tracking from `orders.tracking_number` and `orders.shipping_carrier_service`.

> **Reconciliation note (2026-06-09):** Invoice shipping line corrected from `seller_shipping_cost` (seller's cost) to `shipping_total` (buyer-facing charge). Tax line added. Total formula aligned with ADR-017 `grand_total` definition. Line item pricing authority clarified: `order_items.unit_price`/`line_total` are canonical.

---

**Sales** (date range optional)

- **Required content:** (1) Title: “Sales Report”. (2) Date range (if provided: from_date – to_date; else “All time”). (3) Table: columns = Date (`orders.order_date`), Order ID, Customer (ship-to name or customer name), Item (inventory description or item_number), Revenue (`order_items.line_total`), optionally Paid/Shipped. **Canonical layout: one row per `order_items` line item** (not one row per order). (4) Total revenue (sum of displayed line revenue; treat NULL as 0).
- **Data:** `orders` joined to `order_items` and `inventory`; per global filter. Filter by `orders.order_date` when from_date/to_date given.

---

**Costs** (date range optional)

- **Required content:** (1) Title: “Costs Report”. (2) Date range if provided. (3) Table: item (item_number or description), purchase cost (`inventory.purchase_cost`), shipping cost (`inventory.shipping_cost`), other costs (sum of `other_costs.amount` for that item), total cost per item. (4) Sum across items. Optionally filter by `inventory.date_purchased` in range.
- **Data:** `inventory` left join `other_costs`; aggregate other costs per item. Seller shipping on sold orders (`orders.seller_shipping_cost`) may appear in a separate section per ADR-006.

---

**Income — month to date**

- **Required content:** (1) Title: “Income — Month to Date”. (2) Month and year (e.g. “February 2025”). (3) Total revenue: sum of non-null `inventory.sale_revenue` for items linked via `order_items` from active `orders` where `orders.order_date` is in the current month (NULL treated as 0). (4) Optional: count of orders.
- **Data:** Per ADR-006; active orders only.

---

**Income — year to date**

- **Required content:** (1) Title: “Income — Year to Date”. (2) Year (e.g. “2025”). (3) Total revenue: same as MTD for the current calendar year. (4) Optional: count of orders.
- **Data:** Same as MTD but for current year; active orders only.

---

**Postal costs by vendor**

- **Required content:** (1) Title: “Postal Costs by Vendor”. (2) Date range if provided. (3) Table: Vendor (`orders.shipper`: USPS, UPS, FedEx, DHL, Other), Amount (sum of `orders.seller_shipping_cost` for that shipper). (4) Total across vendors. Include “Other” / “Unspecified” for null shipper (per ADR-005).
- **Data:** `orders` table; per global filter. `GROUP BY shipper`; `SUM(seller_shipping_cost)`.

---

**Outstanding items** (new report; ADR-006)

- **Required content:** (1) Title: "Outstanding Items" (or "Outstanding To-Do Report"). (2) Run date/time. (3) Table: one row per outstanding item — columns = Type, Summary (e.g. order #, customer, item), Date, optionally "What to do." (4) Same data set as the outstanding panel/tab at run time (ADR-020).
- **Data:** Union of all outstanding item types per ADR-020; snapshot at report run time. Output: PDF per layout spec above.

---

**AR aging** (new report; ADR-006)

- **Required content:** (1) Title: "AR Aging" (or "Accounts Receivable Aging"). (2) Date range or "as of" date. (3) Table: unpaid orders (`orders.was_paid = 0`) grouped by age bucket: 0–30, 31–60, 61–90, 90+ days from `orders.order_date`. Columns: Order ID, Customer, Amount (`orders.grand_total` or subtotal), Days outstanding. (4) Totals per bucket and grand total.
- **Data:** Active `orders` with `was_paid = 0`; age = days from `order_date` to report date.

---

---

**Edge cases (no ambiguity)**

1. **Empty dataset:** When a report query returns zero rows and all metrics are zero, the PDF displays centered text: "No data found for the selected criteria." followed by "Try adjusting the date range or filters, or check that relevant records exist." The CSV output still includes the header row and metadata but with zero values.

2. **PDF generation failure:** If PDFKit or any PDF-rendering step throws an exception, the endpoint returns HTTP 500 with `user_message`: "Report generation failed. Please try again." and `actions`: ["Try again.", "Export as CSV instead."]. The CSV path is unaffected by PDF failures.

3. **Date handling:** All date filter parameters (`from_date`, `to_date`) use UTC dates in `YYYY-MM-DD` format. The UI converts display dates to/from the user's `date_format` preference (stored in settings). If no date range is provided, the report defaults to "All time" (subject to the global active-order filter). If only `from_date` is provided, it filters from that date through today. If only `to_date` is provided, it filters through that date.

4. **Accounting Export exception (2026-06-09):** Accounting Export is **CSV-only** (no PDF). Post-generation actions for this report: **Export CSV | Cancel**. The standard four-action flow (Print | Export PDF | Export CSV | Cancel) does not apply to this report type.

---

## Consequences

- **Positive**
  - Professional, consistent output suitable for customers and records.
  - PDFs are portable and work across devices and platforms.
  - CSV export supports downstream analysis and accounting workflows.
- **Negative**
  - Requires choosing and integrating a PDF library and designing layouts per report type.
  - No built-in “edit in place”; changes require re-running the report or editing outside the app.

## Notes

- Screen preview (e.g. “Preview before download”) can be offered using the same layout rendered to HTML or a PDF viewer; the canonical output remains PDF.
- Thank you note and invoice are customer-facing and should be especially polished; sales, costs, income, and postal-by-vendor can be clean tabular/summary layouts.

### Per-order document endpoints (updated 2026-05-24)

ADR-036 adds per-order invoice and thank-you note generation at dedicated endpoints:

- `GET /api/reports/invoice/[orderId]` — generates invoice PDF/CSV for a single order.
- `GET /api/reports/thank-you-note/[orderId]` — generates thank-you note PDF/CSV for a single order.
- `GET /api/reports/payment-reminder/[orderId]` — generates payment reminder letter PDF for a single order (ADR-078, WS-C, 2026-06-21). PDF only; CSV not supported. Uses business letterhead. Body rendered from `comm.template.payment_reminder.body` setting or built-in default.

The existing aggregate endpoints (`/api/reports/invoice`, `/api/reports/thank-you-note`) in ADR-018 that accept `order_id` as a query parameter remain valid and are equivalent. ADR-036's path-based routes are a convenience alias. Both routes return the same content per this ADR's specification.

### Date range UI (updated 2026-05-24)

ADR-036 adds a date range picker UI to the Reports page: From/To date inputs with quick presets (MTD, YTD, Last Month, Last Quarter, All Time). The date parameters flow to the existing `from_date`/`to_date` query parameters defined in ADR-018's report endpoints and the edge case rules in this ADR (section "Edge cases").

### Schema mapping (updated 2026-06-09)

The Decision body above uses ADR-017 field names. Legacy terms map as follows:

| ADR-013 term                             | Implementation                                                | Notes                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| purchase row(s)                          | `orders` + `order_items`                                      | Invoice line items come from `order_items` joined to `inventory`                                                             |
| date_of_purchase                         | `orders.order_date`                                           |                                                                                                                              |
| purchase.shipping_cost (seller)          | `orders.seller_shipping_cost`                                 | Seller's cost; used in Costs and Postal-by-Vendor reports                                                                    |
| invoice shipping line (buyer-facing)     | `orders.shipping_total`                                       | Buyer-facing charge shown on Invoice (2026-06-09 correction)                                                                 |
| purchase.discount_amount                 | `orders.discount_total`                                       |                                                                                                                              |
| purchase.was_paid                        | `orders.was_paid`                                             |                                                                                                                              |
| ship-to fields                           | `orders.ship_to_first_name`, `orders.ship_to_last_name`, etc. | Snapshot fields on orders table                                                                                              |
| sum of purchase.shipping_cost by shipper | `SUM(orders.seller_shipping_cost) GROUP BY orders.shipper`    | Postal costs by vendor report                                                                                                |
| ship*to*\* fields                        | `orders.ship_to_first_name`, `orders.ship_to_last_name`, etc. | Snapshot fields on orders table                                  |
| sum of purchase.shipping_cost by shipper | `SUM(orders.seller_shipping_cost) GROUP BY orders.shipper`    | Postal costs by vendor report                                    |

### Accounting export format (updated 2026-06-17)

The Accounting Export report (ADR-056) uses double-entry bookkeeping with GAAP account numbers. It is CSV-only (no PDF). Each transaction produces two rows (debit + credit). Account numbers are stored in the `chart_of_accounts` database table and are editable from Config. See ADR-056 for the full specification.
