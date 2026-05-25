# ADR-033: Image upload UI and thumbnail preview grid

## Status

Accepted

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
│ Pictures                                    [+ Add]      │
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
│                                                          │
│ Drag to reorder. Slot 1 is the primary listing image.    │
└──────────────────────────────────────────────────────────┘
```

- 10 slots displayed in a 5×2 grid (responsive: 3×4 on medium, 2×5 on small).
- Each slot is a square card (~120×120px on desktop, ~100×100px on mobile).

---

### Slot states

**Filled slot:**

- Displays the image thumbnail. Source: `thumbnail_path` for slot 1; for other slots, the picture path itself served via a static route or API.
- Thumbnail loading: show a small `LoadingSpinner` centered in the card until the image loads.
- Overlay on hover: semi-transparent dark overlay with two action buttons:
  - `✕` (top-right corner): delete this picture (confirmation per ADR-032: "Remove picture from slot {n}?").
  - `👁` or expand icon (center): open full-size preview in a `Modal`.
- Slot 1 indicator: a small `★` badge in the bottom-left corner ("Primary image").
- Draggable: the card can be dragged to another slot position to reorder.

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
6. **Failure:** Restore the empty slot. Toast error with the server's error message (e.g., "Image dimensions exceed 10000×10000 limit").

---

### Drag-to-reorder

- Filled slots can be dragged and dropped onto other slots (filled or empty).
- Use the HTML Drag and Drop API (no external library required for 10 items).
- Visual feedback during drag: dragged card becomes semi-transparent; drop target shows a blue highlight border.
- On drop: call `PATCH /api/inventory/[id]/pictures/reorder` with the new ordered array of picture paths.
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
- Files are assigned to consecutive empty slots (slot 1, then 2, then 3, etc.).
- If more files are selected than empty slots, show a toast: "Only {n} slots available. {m} files were not uploaded."
- Files upload sequentially (one at a time) to avoid overwhelming the server.
- Progress: each slot shows its individual upload state.

---

### Mobile considerations

- Drag-to-reorder is not reliable on touch devices. On mobile (detected via `pointer: coarse` media query), show "Move up" / "Move down" buttons on each filled slot instead of drag handles.
- File picker: on mobile, the `<input type="file" capture="environment">` attribute allows direct camera capture.
- Grid: 2 columns on mobile, 3 on tablet, 5 on desktop.

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
