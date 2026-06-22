# ADR-033: Image upload UI and thumbnail preview grid

## Status

Accepted

**Update (WS-H2, ADR-084):** the inventory picture area now also hosts `MeasurementPhotoPanel` —
an "Add measurement photo" flow that uploads a ruler photo, confirms AI-estimated dimensions, and
saves an annotated copy of the hero into a secondary main slot (classified `measurement`). The
generated image flows through the same `picture-storage.ts` pipeline (ADR-026).

## Date

2026-05-24

## Context

The backend fully supports image upload, processing, storage, and thumbnail generation (ADR-026, `picture-storage.ts`). The API accepts `multipart/form-data` file uploads at `POST /api/inventory/[id]/pictures`. However, the frontend picture management UI only accepts text path input in a plain text field. Users cannot drag-and-drop or browse for files, and pictures are displayed as text path strings (`"Slot 1: /uploads/inventory/42/pictures/1.jpg"`) with no visual preview. This makes picture management effectively unusable for non-technical users.

## Decision

**Replace the text-based picture UI with a visual upload grid featuring drag-and-drop, file browser, thumbnail previews, and drag-to-reorder.**

---

### Picture grid layout

```
┌──────────────────────────────────────────────────────────┐
│ Pictures (20 slots)                         [+ Add]      │
├──────────────────────────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│ │  pic 1 │ │  pic 2 │ │  pic 3 │ │  pic 4 │ │  pic 5 │ │
│ │ (thumb)│ │ (thumb)│ │ (thumb)│ │ (empty)│ │ (empty)│ │
│ │  ✕     │ │  ✕     │ │  ✕     │ │        │ │        │ │
│ │  ★     │ │        │ │        │ │  drop  │ │  drop  │ │
│ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│ │  pic 6 │ │  pic 7 │ │  pic 8 │ │  pic 9 │ │ pic 10 │ │
│ │ (empty)│ │ (empty)│ │ (empty)│ │ (empty)│ │ (empty)│ │
│ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│ │ pic 11 │ │ pic 12 │ │ pic 13 │ │ pic 14 │ │ pic 15 │ │
│ │ (empty)│ │ (empty)│ │ (empty)│ │ (empty)│ │ (empty)│ │
│ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│ │ pic 16 │ │ pic 17 │ │ pic 18 │ │ pic 19 │ │ pic 20 │ │
│ │ (empty)│ │ (empty)│ │ (empty)│ │ (empty)│ │ (empty)│ │
│ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │
│                                                          │
│ Drag to reorder. Slot 1 is the primary listing image.    │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 🎬 Video (optional)              [Upload video]      │ │
│ │ MP4/MOV · max 100 MB · 5–15 seconds                  │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

- 20 item photo slots displayed in a 5×4 grid (responsive: 3-col on medium, 2-col on small; grid scrolls vertically as needed).
- Each slot is a square card (~120×120px on desktop, ~100×100px on mobile).
- Optional video upload zone (MP4/MOV, max 100 MB, 5–15 seconds) below the photo grid. Video is stored at `inventory.video_path`.

---

### Slot states

**Filled slot:**

- Displays the image thumbnail. Source: `thumbnail_path` for slot 1; for other slots, the picture path itself served via a static route or API.
- Thumbnail loading: show a small `LoadingSpinner` centered in the card until the image loads.
- Overlay on hover: semi-transparent dark overlay with two action buttons:
  - `✕` (top-right corner): delete this picture (confirmation per ADR-032: "Remove picture from slot {n}?").
  - `👁` or expand icon (center): open full-size preview in a `Modal`.
- Slot 1 indicator: a small `★` badge in the bottom-left corner ("Primary image").
- **Shot type badge:** If `picture_classifications` contains an entry for this slot, display a small label badge in the top-left corner with the shot type (e.g. "Hero", "Detail", "Backstamp"). Badge color: `var(--ui-accent)` background with white text. In edit mode (inventory detail), the badge is a compact dropdown: first option "OK" (accept current), followed by the full shot type enum (hero, angle, detail, backstamp, scale, imperfection, underside, grouping, lifestyle, measurement, extra). See ADR-072 §Photo classification.
- Draggable: the card can be dragged to another slot position to reorder. When reordering, classifications move with their photos (the classification is bound to the image, not the slot number).

**Empty slot:**

- Shows a dashed border with a `+` icon and text "Drop image" (or "Click to upload" on mobile).
- Drop target: accepts files dragged from the OS file manager.
- Click: opens the native file picker (`<input type="file" accept="image/jpeg,image/png,image/webp,image/gif">`).

---

### Upload flow

1. **File selection:** User drops a file onto an empty slot, or clicks an empty slot and selects a file, or clicks the global "+ Add" button (which uploads to the first empty slot).
2. **Validation (client-side pre-check):**
   - File type must be JPEG, PNG, WebP, or GIF.
   - File size must be ≤ 15 MB.
   - If invalid: toast error with specific reason ("File must be JPEG, PNG, WebP, or GIF" or "File must be under 15 MB").
   - Do not send invalid files to the server.
3. **Upload:** Send as `multipart/form-data` to `POST /api/inventory/[id]/pictures` with fields `slot` (number) and `file` (the image blob).
4. **Progress indicator:** Replace the slot content with a circular progress indicator or indeterminate spinner during upload.
5. **Success:** The API returns the updated item. Refresh the slot with the new image. Toast: "Picture uploaded to slot {n}."
6. **Failure:** Restore the empty slot. Toast error with the server's error message (e.g., "Image exceeds maximum dimensions and could not be processed").

> **Reconciliation note (2026-06-09):** Per ADR-026, images exceeding 4000×4000 pixels are automatically resized (not rejected). The server only rejects files that fail type or size validation (not image type, or >15 MB). The previous "10000×10000 limit" error example was incorrect.

---

### Drag-to-reorder

- Filled slots can be dragged and dropped onto other slots (filled or empty).
- Use the HTML Drag and Drop API (no external library required for 20 items).
- Visual feedback during drag: dragged card becomes semi-transparent; drop target shows a blue highlight border.
- On drop: call `PATCH /api/inventory/[id]/pictures/reorder` with body `{ order: [3, 1, 2, 4, ...] }` where the array represents the new slot permutation — the value at index 0 becomes `picture_1`, the value at index 1 becomes `picture_2`, etc. Array values are the original slot numbers being moved into each position.
- During reorder API call: show a brief loading overlay on the grid.
- On success: refresh all slot images. Thumbnail regenerates if slot 1 changed.

---

### Full-size preview modal

When the user clicks the expand icon on a filled slot:

- Opens a `Modal` (maxWidth: `max-w-3xl`).
- Title: "Slot {n} — {item_number}"
- Content: the full-resolution image, scaled to fit the modal with `object-contain`.
- If the image fails to load: show placeholder text "Image could not be loaded."
- Navigation: "← Previous" and "Next →" buttons to cycle through filled slots without closing the modal.
- Close: `×` button, Escape key, or backdrop click.

---

### Image serving

Pictures stored under `uploads/inventory/[id]/pictures/` need to be accessible to the browser.

**Option chosen:** Serve uploads via a static route or API endpoint.

- Add a catch-all API route at `GET /api/uploads/[...path]` that serves files from the `uploads/` directory.
- Set `Cache-Control: public, max-age=3600` for served images.
- Validate that the requested path is within the uploads directory (path traversal protection).
- Content-Type set based on file extension.

Alternative (simpler, if Next.js supports it): configure `next.config.ts` to serve the `uploads/` directory as a static asset directory. If this is reliable, prefer it over a custom API route.

---

### Bulk upload

The "+ Add" button supports multi-file selection:

- `<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif">`.
- Files are assigned to consecutive empty slots (slot 1, then 2, then 3, etc.) up to 20 slots.
- If more files are selected than empty slots, show a toast: "Only {n} slots available. {m} files were not uploaded."
- Files upload sequentially (one at a time) to avoid overwhelming the server.
- Progress: each slot shows its individual upload state.

---

### Mobile considerations

- Drag-to-reorder is not reliable on touch devices. On mobile (detected via `pointer: coarse` media query), show "Move up" / "Move down" buttons on each filled slot instead of drag handles.
- File picker: on mobile, the `<input type="file" capture="environment">` attribute allows direct camera capture.
- Grid: 2 columns on mobile, 3 on tablet, 5 on desktop (4 rows for 20 slots).

## Consequences

- **Positive**
  - Picture management becomes visual and intuitive.
  - Drag-and-drop upload matches user expectations from every modern web app.
  - Reorder by drag eliminates the error-prone comma-separated path input.
  - Full-size preview lets users verify image quality before publishing.
- **Negative**
  - Requires an image serving endpoint or static file configuration.
  - Drag-and-drop needs touch fallback for mobile.
  - Upload progress adds UI complexity.

## Notes

- **Clipboard paste (ADR-085):** The inventory `PictureGrid` supports **clipboard paste** (`⌘V` from macOS Photos), ported from the former Listing Coach. Same file type/size limits (ADR-026). Pasted images upload to the item via the picture API immediately (the standalone Coach is removed).
- **Photo slot limit:** 20 item photos (`picture_1..picture_20`). Condition photos remain at 5 (`condition_picture_1..condition_picture_5`).
