# Ticket WS-RCPTIMG — Persist scanned receipt images

| Field | Value |
|-------|-------|
| Type | **Backlog / low priority** (quality-of-life; no regression today). |
| Origin | Deferred from **WS-E3** (SEMS Receipts). The SEMS migration intentionally did NOT add image persistence — out of scope for a screen refactor. |
| Source ADR | ADR-018 §31 (receipts API), ADR-026 (picture storage + serving), ADR-077-adjacent (receipts subsystem). |
| Recommended model | Sonnet-tier. |
| Complexity | Small-Medium (new storage helper + 1 endpoint + small UI wire-up). |

---

## Problem

The `receipts` table has a **`receipt_image`** column, but it is never populated. When a user scans a
receipt, `POST /api/receipts/ocr` runs AI vision on the uploaded bytes and returns only extracted text —
**the image itself is discarded.** After saving, the receipt has no retained photo. The WS-E3 editor
shows a transient blob-URL preview during review and renders `receipt_image` from disk **if present**,
but nothing ever writes it.

This is a real product gap (no audit image for a purchase) but **not a regression** — it has always
behaved this way. Hence: backlog.

## Why it wasn't done in WS-E3

`POST /api/receipts/ocr` happens **before** the receipt exists (no `receiptId` to associate the file
with), and persisting it would have meant touching the API + adding file-storage plumbing — outside a
SEMS migration's scope. The infra to reuse exists (`src/lib/picture-storage.ts`: `validateImageBuffer`,
Sharp pipeline, `getUploadsRootDir`) but is inventory-pathed.

## Approach (recommended: decouple image storage from OCR)

Do **not** try to make the OCR route persist the image. Instead, store the image **after the receipt
exists**, reusing the file the user already selected.

1. **New storage helper** — add `src/lib/receipt-image-storage.ts` (or extend `picture-storage.ts`):
   - `storeReceiptImage(receiptId: number, buffer: Buffer, filename: string): Promise<string>` →
     validates via the existing `validateImageBuffer`, runs the Sharp pipeline (resize/normalize, same
     limits: 15 MB, allowed JPEG/PNG/WebP/GIF), writes to **`uploads/receipts/<receiptId>/image.<ext>`**,
     returns the repo-relative path. Idempotent: replace any existing file for that receipt.
   - `removeReceiptImage(receiptId: number)` for cleanup on receipt delete (wire into the existing
     receipt DELETE handler).
2. **New endpoint** — `POST /api/receipts/[id]/image` (multipart `receipt_photo`): stores the image via
   the helper, sets `receipts.receipt_image = <path>`, returns the updated receipt. Standard error
   envelope; reuse the image MIME validation.
3. **UI wire-up (WS-E3 `ReceiptEditor`)**:
   - **Create + scan:** keep the `File` from the scan in editor state; after the receipt is created
     (POST returns the new id), `POST /api/receipts/<id>/image` with that file, then refresh.
   - **Create + manual / Edit:** add an **"Attach receipt photo"** affordance (file picker; optional
     drag-drop) that uploads to the same endpoint. Works whether or not OCR was used.
   - Render the stored image from `receipt_image` via the existing **`GET /api/uploads/[...path]`** server
     (already used for inventory pictures) — no new serving route.
4. **Cleanup** — call `removeReceiptImage(id)` in the receipt DELETE path so files don't orphan.

## Out of scope

- Multiple images per receipt (one image is sufficient).
- Thumbnails for receipt images.
- Re-running OCR from a stored image (could be a future enhancement).

## Acceptance criteria

- [ ] Scanning a receipt and saving it persists the uploaded photo; reopening the receipt shows the image.
- [ ] A manual or already-saved receipt can have a photo attached/replaced via "Attach receipt photo".
- [ ] Image stored under `uploads/receipts/<id>/`, served via `GET /api/uploads/[...path]`; `receipt_image`
      column set to the stored path.
- [ ] Same validation as inventory pictures (type + 15 MB limit); invalid files show a friendly error.
- [ ] Deleting a receipt removes its stored image file.
- [ ] Standard error envelope; `var(--ui-*)` only; `npm run build` passes; no new lint.

## Notes

- No schema change (the `receipt_image` column already exists).
- Keep this independent of the SEMS rollout — it can land any time after WS-E3.
