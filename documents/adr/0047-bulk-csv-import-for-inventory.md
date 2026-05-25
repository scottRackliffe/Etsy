# ADR-047: Bulk CSV import for inventory

## Status
Accepted

## Date
2026-05-24

## Context
Manually entering 100+ inventory items is prohibitively slow. Many users maintain spreadsheets of their antique/vintage stock. CSV import enables bulk intake from spreadsheets, drastically reducing onboarding time for the app.

## Decision
Provide a two-step CSV import flow: preview then import.

### API endpoints

#### Preview: `POST /api/inventory/import/preview`

- Content type: `multipart/form-data` with a single field `file` (the CSV)
- Parses the first 10 rows of the CSV
- Returns column mapping and per-row validation results without writing any data
- Response:
  ```json
  {
    "columns": ["item_number", "description", "purchase_cost", ...],
    "rows": [
      { "row": 1, "valid": true, "data": { "item_number": "A001", ... }, "errors": [] },
      { "row": 2, "valid": false, "data": { ... }, "errors": [{ "field": "status", "message": "Invalid status value 'unknown'" }] }
    ],
    "total_rows": 142
  }
  ```

#### Import: `POST /api/inventory/import`

- Content type: `multipart/form-data` with a single field `file` (the CSV)
- Processes all rows; valid rows are inserted, invalid rows are skipped
- Response:
  ```json
  {
    "imported": 138,
    "skipped": 4,
    "errors": [
      { "row": 12, "field": "item_number", "message": "Item number already exists" },
      { "row": 45, "field": "status", "message": "Invalid status value 'unknown'" }
    ]
  }
  ```
- HTTP 200 even if some rows are skipped (partial success). HTTP 400 only if the file itself is unparseable or has no valid header row.

### CSV format

- **Header row required** — first row must contain column names
- **Supported columns** (case-insensitive, trimmed):
  | Column | Required | Type | Notes |
  |--------|----------|------|-------|
  | `item_number` | Yes | string | Must be unique across all existing inventory + within the file |
  | `description` | No | string | |
  | `purchase_cost` | No | decimal | e.g., `12.50` |
  | `shipping_cost` | No | decimal | |
  | `sale_revenue` | No | decimal | |
  | `date_purchased` | No | date | `YYYY-MM-DD` format |
  | `date_listed` | No | date | `YYYY-MM-DD` format |
  | `status` | No | enum | One of: `Draft`, `In stock`, `Listed`, `Sold`, `Reserved`, `Retired`. Default: `Draft` |
  | `condition_code` | No | enum | One of: `Mint/Near Mint`, `Excellent`, `Very Good`, `Good`, `Fair/As-Is` |
  | `category_tags` | No | string | Comma-separated tags within the cell (e.g., `"pottery, blue, vintage"`) |
  | `notes` | No | string | |
- **Unknown columns**: ignored silently; logged as a warning in the server logs
- **Empty rows**: skipped without error

### Validation rules

- Each row is validated using the same rules as `POST /api/inventory` (per ADR-021):
  - `item_number` is required and must be unique
  - `status` must be a valid enum value (if provided)
  - `condition_code` must be a valid enum value (if provided)
  - Date fields must be valid `YYYY-MM-DD` format
  - Numeric fields must be non-negative decimals
- Duplicate `item_number` within the file: first occurrence wins; subsequent duplicates are skipped with error "Duplicate item number within file"
- Duplicate `item_number` vs existing DB records: skipped with error "Item number already exists"

### Constraints

- **Max file size**: 5 MB (approximately 50,000 rows). Requests exceeding this return 413 Payload Too Large.
- **Encoding**: UTF-8. BOM (`\xEF\xBB\xBF`) is detected and stripped if present.
- **Line endings**: LF, CRLF, and CR all accepted.
- **Quoting**: Standard RFC 4180 CSV — fields with commas, quotes, or newlines must be double-quoted. Escaped quotes are `""`.

### Frontend UI

- Accessible from the Inventory tab via an "Import CSV" button in the toolbar
- Opens a modal with:
  1. File picker (accept `.csv` only) + drag-and-drop zone
  2. After file selected: shows preview table (first 10 rows) with green rows (valid) and red rows (invalid, with error message)
  3. Summary: "142 total rows — 138 valid, 4 with errors"
  4. "Import 138 valid rows" primary button + "Cancel" secondary button
  5. After import completes: success toast with count; error rows shown in expandable list
- During import: show loading spinner with "Importing..." text; button disabled

### Activity log

- On successful import: log `inventory.bulk_imported` with `{ count: N, skipped: M, filename: "original.csv" }` (ADR-037)

## Consequences
- **Positive**: Dramatically reduces onboarding time for users with existing spreadsheet inventory. Non-destructive — invalid rows are skipped, not rejected entirely. Preview step prevents surprises.
- **Negative**: No update/upsert mode — import is create-only. Users with existing items must use PATCH individually. CSV parsing edge cases (encoding, quoting) require robust handling.

## Notes
- Cross-references: ADR-002 (inventory data model — field definitions), ADR-021 (validation rules — reused per-row), ADR-037 (activity log — bulk import event)
- Future consideration: an "Export to CSV" feature could reuse the same column mapping in reverse.
- The import endpoint is NOT idempotent — re-uploading the same file will skip all rows as duplicates (by `item_number`), which is safe but results in 0 imports.
