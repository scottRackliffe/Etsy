# ADR-026: Picture storage layout and thumbnail specification (no ambiguity)

## Status

Accepted

**Update (WS-H2, ADR-084):** AI dimension annotation reuses `processAndStorePicture()` to store the
rendered measurement image in a **secondary** main slot under `uploads/inventory/<id>/pictures/`
(never `picture_1`, so the hero stays clean and the thumbnail is unaffected).

## Date

2026-05-24

## Context

ADR-010 defines the picture import UX (directory picker, preview, confirm). ADR-002 defines 20 main picture slots and 5 condition picture slots. The no-developer-questions checklist flagged missing details: canonical storage path layout, filename strategy and collision handling, upload/import limits (type, size, count), failure/rollback behavior, and thumbnail generation specification.

## Decision

### 1. Storage path layout

All imported pictures are stored under a single root directory relative to the project:

```
uploads/
  inventory/
    <item_id>/
      pictures/
        1.jpg          # picture_1
        2.jpg          # picture_2
        ...
        20.jpg         # picture_20
      condition/
        1.jpg          # condition_picture_1
        ...
        5.jpg          # condition_picture_5
      thumbnail.jpg    # Generated thumbnail
```

- `<item_id>` is the numeric inventory row ID.
- Main pictures are stored in `pictures/` with filenames `1` through `20` (matching slot number).
- Condition pictures are stored in `condition/` with filenames `1` through `5`.
- All stored files use `.jpg` extension (all formats are re-encoded to JPEG during processing).
- The `uploads/` directory is at the project root; configurable via environment variable `UPLOADS_PATH` (default: `./uploads`).
- The `uploads/` directory is added to `.gitignore`.

### 2. Filename strategy and collision handling

| Rule              | Behavior                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Naming            | Files are renamed to their slot number with `.jpg` extension (e.g. `1.jpg`, `2.jpg`) upon import                             |
| Collision         | Importing to an occupied slot **replaces** the existing file (old file is deleted)                                           |
| Original filename | Not preserved in the filesystem; the database stores only the canonical path                                                 |
| Path stored in DB | Relative path from project root, e.g. `uploads/inventory/42/pictures/1.jpg`                                                  |
| URL pictures      | When a picture slot contains a URL (http/https), no local file is stored; the URL string is stored directly in the DB column |

### 3. File type and size limits

| Constraint    | Value                                             | Behavior on violation                                                                       |
| ------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Allowed types | JPEG, PNG, WebP, GIF                              | Reject with error: "Unsupported image format. Please use JPEG, PNG, WebP, or GIF."          |
| Max file size | 15 MB per image                                   | Reject with error: "Image exceeds 15 MB limit. Please use a smaller file."                  |
| Max dimension | 4000 × 4000 px                                    | Resize (proportional, `fit: inside`, `withoutEnlargement: true`) using Sharp before storing |
| Min dimension | 50 × 50 px                                        | Reject with error: "Image is too small (minimum 50×50 pixels)."                             |
| Target DPI    | 300 (metadata only; set via Sharp `withMetadata`) | Applied on save                                                                             |
| JPEG quality  | 85                                                | Applied to all stored images (all formats re-encoded to JPEG)                               |

Type detection uses the file's magic bytes (not just extension) via Sharp's metadata reader.

**Processing pipeline detail (updated 2026-06-09):**

- Images exceeding 4000×4000 pixels are resized to fit within 4000×4000 (maintaining aspect ratio) using Sharp. Images at or below this size are not resized.
- All images are re-encoded to JPEG at 85% quality regardless of input format.
- Original uploaded files are NOT preserved — only the processed version is stored.

### 4. Import flow (atomic per item)

When importing pictures for an item:

1. **Validate** all selected files (type, size, dimensions) before writing any.
2. **Create** the item's storage directory if it doesn't exist.
3. **Process** each file: resize if over max dimension, set metadata, write to slot path.
4. **Update** the database: set `picture_N` = relative path for each imported slot.
5. **Generate thumbnail** (see §5).

**Failure / rollback:** If any file in a batch fails validation (step 1), reject the entire batch with errors listing which files failed and why. If a file fails during processing (step 3, e.g. corrupt image), skip that file, report the error, and continue with remaining files. Already-written files from the same batch are kept (partial success is acceptable; user sees which slots were filled).

### 5. Thumbnail specification

| Property  | Value                                                                                      |
| --------- | ------------------------------------------------------------------------------------------ |
| Size      | **Max dimension 200 px** (default), **aspect ratio preserved**; user-configurable via `settings.thumbnail_size` (100–400 px range) |
| Fit       | `inside` — scale to fit within the max dimension, **aspect ratio preserved (no crop)**     |
| Format    | JPEG                                                                                       |
| Quality   | 80                                                                                         |
| Storage   | `uploads/inventory/<item_id>/thumbnail.jpg`                                                |
| DB column | `inventory.thumbnail_path`                                                                 |

**Generation triggers:**

- When `picture_1` is set or changed (thumbnail is always derived from the primary picture).
- When `picture_1` is removed and `picture_2` exists, thumbnail regenerates from `picture_2` (use the first non-null picture slot).
- When all pictures are removed, delete the thumbnail and set `thumbnail_path = NULL`.
- When the user changes `thumbnail_size` in settings, regenerate all thumbnails (batch job via API endpoint `POST /api/inventory/regenerate-thumbnails`).

**No-picture placeholder:** When `thumbnail_path` is null, the UI renders a generic placeholder icon (e.g. a camera icon SVG). The placeholder is a static asset in `public/icons/no-picture.svg`, not stored per item.

### 6. Picture reorder behavior

Reordering changes which file is in which slot:

1. Receive new slot order (e.g. `[3, 1, 2, 4, 5, ...]` meaning current slot 3 becomes slot 1).
2. Rename files in the storage directory to match new slots (use temporary names to avoid collisions during rename: `1.jpg` → `tmp_1.jpg`, then `tmp_1.jpg` → `3.jpg`).
3. Update all `picture_N` DB columns to reflect new paths.
4. Regenerate thumbnail from new `picture_1`.

### 7. Picture removal

Removing a picture from a slot:

1. Delete the file from disk.
2. Set the DB column (`picture_N`) to `NULL`.
3. If the removed picture was `picture_1`, regenerate thumbnail from the next non-null picture (or set `thumbnail_path = NULL` if no pictures remain).

Pictures are **not** renumbered after removal. Slot 3 can be empty while slots 1, 2, 4 have pictures. This preserves the user's intentional ordering.

### 8. Bulk import (directory → item)

When importing from a directory:

1. App reads all image files from the selected directory (filtered by allowed types).
2. Files are sorted alphabetically by filename.
3. First 20 files are assigned to `picture_1` through `picture_20` (or first 5 for condition pictures).
4. If fewer than 20 files, remaining slots are left empty.
5. If more than 20 files, excess files are ignored; UI shows a message: "Imported first 20 of N images."

### 9. Video storage

Video files stored at `uploads/inventory/<item_id>/video/` path. Accepted formats: MP4, MOV. Max 100 MB. Duration 5–15 seconds. Path stored in `inventory.video_path`. Only one video per item. Uploading a new video replaces the existing one (old file is deleted). Video files are included in the item's storage directory and deleted when the inventory item is deleted (same as pictures per §9 below).

### 10. Disk usage and cleanup

- When an inventory item is deleted (ADR-022), the entire `uploads/inventory/<item_id>/` directory is deleted from disk.
- Orphaned upload directories (no matching inventory row) can be cleaned via a maintenance script (`scripts/cleanup-uploads.mjs`).

## Consequences

- **Positive:** Deterministic file layout; collision-free; thumbnails always in sync; clear limits and error messages.
- **Negative:** Disk storage grows with inventory; no built-in cloud storage (local only for v1).

## Notes

- This ADR is the SSOT for picture storage layout and thumbnail spec. ADR-010 remains the SSOT for the import UX flow. ADR-002 remains the SSOT for the data model (20 picture columns + 5 condition picture columns).
- The `uploads/` directory should be included in backups (ADR-027).
