# ADR-013: Report output format — PDF

## Status

Accepted

## Date

2025-02-15

## Context

ADR-006 defines the set of reports (thank you note, invoice, sales, costs, income MTD/YTD, postal by vendor) and leaves output format to implementation. Reports should look professional and be easy to share, print, or archive. Screen-only or plain-text output would not meet that bar.

## Decision

**Report output will be PDF.** All reports listed in ADR-006 (thank you note, invoice, sales, costs, income month-to-date, income year-to-date, postal costs by vendor) will be generated as PDFs so they look professional and can be printed, saved, or sent to customers or accountants as needed.

- **Generation:** Use a PDF library (e.g. a Node/JS PDF library such as PDFKit, jsPDF, or React-PDF) to produce PDFs from report data. Report output is **not cached**; each run generates from current data (see ADR-008).
- **User choices after a report is generated:** The customer (user) is offered **View**, **Print**, **Back**, or **Cancel** — view the report (e.g. in-browser or PDF viewer), print it, go back to the previous screen, or cancel and close. No other actions are required; the user chooses what to do next.
- **Layout:** Each report type will have a consistent, readable layout (headers, tables, totals) suitable for a business document.

## Consequences

- **Positive**
  - Professional, consistent output suitable for customers and records.
  - PDFs are portable and work across devices and platforms.
  - Single format simplifies implementation and support.
- **Negative**
  - Requires choosing and integrating a PDF library and designing layouts per report type.
  - No built-in “edit in place”; changes require re-running the report or editing outside the app.

## Notes

- Screen preview (e.g. “Preview before download”) can be offered using the same layout rendered to HTML or a PDF viewer; the canonical output remains PDF.
- Thank you note and invoice are customer-facing and should be especially polished; sales, costs, income, and postal-by-vendor can be clean tabular/summary layouts.
