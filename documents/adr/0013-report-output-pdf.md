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

- **Generation:** Use a PDF library (e.g. a Node/JS PDF library such as PDFKit, jsPDF, or React-PDF) to produce PDFs from report data. Report output is **not cached**; each run generates from current data (see ADR-008).
- **User choices after a report is generated:** The user is offered exactly four actions: **Print** (send to printer), **Export PDF** (save/download as PDF file), **Export CSV** (save/download as comma-delimited file), **Cancel** (close without printing or exporting). All reports support both export formats. No other actions are required; the user chooses what to do next.
- **Export CSV:** Comma-delimited file; same report data and global filter as the PDF. First row is a header (column names); one row per detail line. Values that contain commas or newlines are quoted per RFC 4180. File extension typically `.csv`.
- **Layout:** Each report uses the **report layout (full spec)** below. Layout is consistent across report types (headers, tables, totals) suitable for a business document.

**Report layout (full spec)**

- **Fonts:** 12 pt **Courier** for detail rows, header, and footer. Report title in header: **14 pt or 16 pt** as required to fit.
- **Page number:** Bottom of page, **centered**.
- **Header/footer on every page:** Report title (or short title) at top of each page; page number at bottom of each page.
- **User logo:** When a user logo is set (stored in system per ADR-017, `settings.business_logo_path`), the app places it on documents (thank-you note, invoice, report header). **Spec:** Max height 1.5 in (40 mm); position: top of first page, left-aligned or right-aligned; if business name appears, logo above business name. Format: use image as stored; scale proportionally to fit max height.
- **Margins:** **1 inch (or 25 mm)** all sides.
- **Tables:** Detail in tables: 12 pt Courier; **light grid lines** between rows/columns.
- **Spacing:** **Single** line spacing for body; one blank line between major sections.

---

**Report content (exact — no ambiguity)**

The following specifies the **exact content** that each report must include. Data sources are per ADR-006; field names refer to ADR-017 (`orders`, `order_items`, `inventory`, `other_costs`). Layout follows the full spec above; content is fixed.

**Report data filter (global — single source of truth):** For every report that uses order/sales data (thank you note, invoice, sales, income MTD/YTD, postal by vendor, AR aging), include **only** `orders` where `order_status = 'active'`. Exclude void and cancelled orders (ADR-017). Each report below applies this filter unless otherwise noted.

**Date-range defaults (global):** If a report supports date filters and no `from_date` / `to_date` is provided, use **All time** (subject to the global active-order filter). If only `from_date` is provided, filter from `from_date` through today. If only `to_date` is provided, filter through `to_date`.

---

**Thank you note** (per order; one `orders` row)

- **Data filter:** Per global rule above (active orders only).
- **Required content:** (1) A greeting (e.g. “Thank you for your order”). (2) Ship-to name: `orders.ship_to_first_name`, `ship_to_last_name`. (3) Order date: `orders.order_date`. (4) List of items: for each `order_items` row on the order, show linked `inventory.description` (or `item_number` if description empty) and `order_items.quantity`. (5) A closing (e.g. “We hope you enjoy your purchase.”). Optional: business name from settings.
- **Data:** `orders` by id; `order_items` joined to `inventory` for line text.

---

**Invoice** (per order)

- **Data filter:** Per global rule above (active orders only).
- **Required content:** (1) Optional: user logo (from system, when set) at top. (2) Business name and address (from settings: business*name, business_address_line_1, business_address_line_2, business_city, business_state_province, business_country, business_postal_code). (3) “Invoice” or “Invoice #” + `orders.order_number` (or id). (4) Buyer / ship-to: `orders.ship_to*\*`snapshot fields. (5) Date:`orders.order_date`. (6) Table of line items: for each `order_items`row — inventory description (or item_number),`quantity`, unit price (`order_items.unit_price`or`inventory.sale_revenue`per implementation),`line_total`. (7) Subtotal (`orders.subtotal`or sum of line totals). (8) Discount: if`orders.discount_total`> 0, show and subtract. (9) Shipping:`orders.seller_shipping_cost`; show `orders.shipper` if set. (10) Total (`orders.grand_total`or subtotal − discount + shipping). (11) Payment/shipping status from`orders.was_paid`, `orders.shipping_date`, `orders.shipper`.
- **Data:** `orders` + `order_items` joined to `inventory`; ship-to from order snapshot only.

---

**Sales** (date range optional)

- **Required content:** (1) Title: “Sales Report”. (2) Date range (if provided: from_date – to_date; else “All time”). (3) Table: columns = Date (`orders.order_date`), Order ID, Customer (ship-to name or customer name), Item (inventory description or item_number), Revenue (`inventory.sale_revenue` or line revenue), optionally Paid/Shipped. One row per `order_items` line (or one row per order with line count and total — pick one layout; document in implementation). (4) Total revenue (sum of displayed line revenue; treat NULL as 0).
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

The existing aggregate endpoints (`/api/reports/invoice`, `/api/reports/thank-you-note`) in ADR-018 that accept `order_id` as a query parameter remain valid and are equivalent. ADR-036's path-based routes are a convenience alias. Both routes return the same content per this ADR's specification.

### Date range UI (updated 2026-05-24)

ADR-036 adds a date range picker UI to the Reports page: From/To date inputs with quick presets (MTD, YTD, Last Month, Last Quarter, All Time). The date parameters flow to the existing `from_date`/`to_date` query parameters defined in ADR-018's report endpoints and the edge case rules in this ADR (section "Edge cases").

### Schema mapping (updated 2026-05-24)

The Decision body above uses ADR-017 field names. Legacy terms map as follows:

| ADR-013 term                             | Implementation                                                | Notes                                                            |
| ---------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| purchase row(s)                          | `orders` + `order_items`                                      | Invoice line items come from `order_items` joined to `inventory` |
| date_of_purchase                         | `orders.order_date`                                           |                                                                  |
| purchase.shipping_cost                   | `orders.seller_shipping_cost`                                 |                                                                  |
| purchase.discount_amount                 | `orders.discount_total`                                       |                                                                  |
| purchase.was_paid                        | `orders.was_paid`                                             |                                                                  |
| ship*to*\* fields                        | `orders.ship_to_first_name`, `orders.ship_to_last_name`, etc. | Snapshot fields on orders table                                  |
| sum of purchase.shipping_cost by shipper | `SUM(orders.seller_shipping_cost) GROUP BY orders.shipper`    | Postal costs by vendor report                                    |
