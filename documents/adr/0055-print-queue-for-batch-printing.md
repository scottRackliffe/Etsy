# ADR-055: Print Queue for Batch Printing

## Status

Accepted

## Date

2026-05-24

## Context

Processing multiple orders requires printing invoices, thank-you notes, and shipping labels individually — one print dialog per document. For a seller processing 10+ orders, this is tedious and error-prone. A batch print queue allows collecting documents and printing them all at once.

## Decision

### Queue storage

- Stored in `localStorage` under key `printQueue`
- Data structure: JSON array of queue entries:
  ```json
  [
    {
      "type": "invoice",
      "orderId": 123,
      "orderNumber": "ORD-0001",
      "addedAt": "2026-05-24T12:00:00Z"
    },
    {
      "type": "thank-you",
      "orderId": 123,
      "orderNumber": "ORD-0001",
      "addedAt": "2026-05-24T12:00:01Z"
    },
    {
      "type": "label",
      "orderId": 124,
      "orderNumber": "ORD-0002",
      "addedAt": "2026-05-24T12:01:00Z"
    }
  ]
  ```
- `type`: `"invoice"` | `"thank-you"` | `"label"`
- Maximum queue size: 50 documents. Attempting to add beyond 50 shows a toast: "Print queue is full (50 max). Print or clear some items first."
- Duplicate detection: same `type` + `orderId` combination is not added twice; show toast "Already in queue" if attempted

### Adding to queue

- Sales detail panel: each document section (Invoice, Thank You, Shipping Label) gets an "Add to print queue" button alongside the existing "Print" button
- Batch action (ADR-040): "Add to print queue" option adds all selected orders' invoices (or other chosen document type) to the queue at once
- On add: show brief toast confirmation "Added invoice for ORD-0001 to print queue"

### Print queue panel

- Access: printer icon in the app header, with a badge showing the current queue count (hidden when count is 0)
- Click opens a dropdown panel listing queued documents grouped by order number
- Each entry shows: document type icon, document type label, order number
- Each entry has an individual "Remove" (×) button

### Queue actions

| Action             | Behavior                                                                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Print all**      | `POST /api/reports/print-queue` with `{ items: [{ type, orderId }] }` — returns a combined PDF with all documents concatenated, each starting on a new page. Opens PDF in a new browser tab for the native print dialog. Clears the queue on success. |
| **Print selected** | User checks a subset of items; same API call with only checked items. Removes only printed items from queue.                                                                                                                                          |
| **Clear queue**    | Removes all items from `localStorage`. Requires confirmation via `ConfirmDialog` (ADR-032): "Clear all 8 items from print queue?"                                                                                                                     |
| **Remove single**  | Removes one entry from the queue array. No confirmation needed.                                                                                                                                                                                       |

### API endpoint

```
POST /api/reports/print-queue
Content-Type: application/json

{
  "items": [
    { "type": "invoice", "orderId": 123 },
    { "type": "thank-you", "orderId": 123 },
    { "type": "label", "orderId": 124 }
  ]
}
```

- Response: `application/pdf` binary stream — all documents concatenated with page breaks
- Each document rendered per its existing template (ADR-013 for invoice/thank-you, shipping label per shipping-label-carrier-templates.md)
- If any `orderId` is not found or order is void/cancelled, return 400 with error envelope listing which items failed
- Max 50 items per request (matching queue max)

### Document ordering in combined PDF

1. Documents appear in the order specified in the `items` array
2. Each document starts on a new page (CSS `page-break-before: always` or PDF library equivalent)
3. Header on each page identifies the document type and order number

## Consequences

- **Positive:** Dramatically reduces print friction for multi-order processing. Single print dialog instead of N dialogs. Queue persists across page refreshes via localStorage.
- **Negative:** localStorage is per-browser — queue doesn't sync across browsers/devices (acceptable for single-user app). Combined PDF generation for 50 documents may take a few seconds; should show a loading spinner.

## Notes

- Cross-references: ADR-013 (PDF format and report templates), ADR-036 (per-order document endpoints — invoice, thank-you, label), ADR-040 (batch operations — batch add to queue), ADR-032 (confirmation dialog for clear queue)
- The print queue icon in the header uses a standard printer icon from the existing icon set
- Badge count uses `--ui-accent` (#2f80ed) background with white text
- If the user navigates away and returns, the queue persists (localStorage). If the user clears browser data, the queue is lost — this is acceptable.

### Partial failure handling

> Added 2026-06-09 — specifies behavior when some queued items fail validation during batch print.

If any queued item fails validation (e.g., void order, missing ship-to address for a label), it is skipped and listed in an error summary. Successfully generated documents are combined into the PDF as normal. The queue is cleared only for items that were successfully printed — failed items remain in the queue with an error indicator (red text or icon on the queue entry). The error summary is shown as a warning toast: "N of M documents printed. K items failed — check the print queue for details."
