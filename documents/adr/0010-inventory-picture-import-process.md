# ADR-010: Inventory picture import — upload, import from folder, replace/reorder/remove

## Status

Accepted

## Date

2025-02-15

## Context

Inventory items have up to 20 pictures (ADR-002; Etsy allows up to 20 per listing); paths or URLs are stored in the database, files on disk or object storage. We need a defined way for users to get pictures into the app: upload, bulk import from a folder, and to replace, reorder, or remove pictures without confusion.

## Decision

**v1 browser (2026-05-24):** Per ADR-033, use file picker + drag-and-drop on the picture grid — not a native directory picker. Directory/bulk-folder flows below apply to desktop/Electron or future builds unless implemented via multi-file picker.

**Ways to get pictures in**

- **File picker + drag-and-drop (v1 — browser):** For any picture need (main or condition), user uploads files via the native browser file picker (`<input type="file" multiple>`) or by dragging and dropping files onto the picture grid slots. Multi-file selection is supported. See ADR-033 for the full UI specification.
- **Batch directory import (post-v1 / desktop):** In a future desktop/Electron context, a native directory picker may allow selecting a folder for batch import. This flow is **deferred to post-v1**. The concepts remain: app discovers image files by name or order, maps them to picture 1–20 (first 20 if more), copies files into app-controlled storage, saves paths to the database.
- **URL (optional):** User can paste a URL for a picture; app stores the URL in the corresponding slot (no file copy).
- **Preview (required after upload):** Display a thumbnail preview of uploaded pictures so the user can confirm before saving. Same for Replace per slot.
- **"Why pictures matter" link:** Show a link to a doc on why pictures matter for sales. Default: documents/pictures-and-sales.md. Optional in Config: user path or URL (e.g. a PDF that was a beginning of this project).

**Commands and behavior**

- **Add / Import pictures** — User selects files via browser file picker or drags files onto the picture grid → thumbnail previews are shown → user confirms → files are assigned to slots; show link to "Why pictures matter" doc (default: documents/pictures-and-sales.md; optional in Config: user's own path or URL, e.g. a PDF that was a beginning of this project).
- **Replace** — Per-slot: same file picker or drag-and-drop → preview → confirm.
- **Reorder** — Change order of slots (e.g. drag-and-drop); picture 1 is primary.
- **Remove** — Clear one or more slots (path/URL set to null).

**Storage and constraints**

- Storage path: one directory per item (e.g. `uploads/inventory/<item_id>/`) or equivalent; do not overwrite another item’s files.
- File types: at least JPEG, PNG; optional WebP, GIF. Reject or convert others.
- Optional: max file size and max dimension; optional resize on upload. Stored filenames can be original or generated (e.g. `1.jpg`) to avoid collisions.

**Where it appears**

- Available when adding or editing an inventory item (Inventory tab). “Upload pictures” is the primary command (file picker + drag-and-drop per ADR-033); replace/reorder/remove are available in the picture area for the selected item.

## Consequences

- **Positive**
  - Clear, consistent way to add and manage the 20 pictures; supports file-by-file upload with drag-and-drop (v1) and folder-based batch import (post-v1).
  - Aligns with ADR-002 (picture 1–20, paths in DB) and Etsy's 20-photo limit.
- **Negative**
  - Implementation must handle file I/O, safe paths, and optional size/dimension limits.

## Notes

- Full process description and “etc.” (e.g. thumbnails, “copy from another item”) are in [documents/ui-design.md](../ui-design.md) section 5.8. This ADR records the decision for the import mechanisms and commands.
- **Picture icon (thumbnail):** When an item is entered or when its first picture is added, the app creates the **picture icon** (thumbnail) at that time and stores it (storage approach in ADR-002). Used in pick lists (ADR-015). No picture yet → show placeholder in pick list.

### Implementation notes (updated 2026-05-24)

- **Frontend UI:** The browser-based frontend cannot use a native OS directory picker. ADR-033 specifies the implemented UI: a visual 10-slot grid with drag-and-drop file upload, native browser file picker (`<input type="file">`), thumbnail previews, and drag-to-reorder. Multi-file selection replaces the "select a folder" bulk import for browser contexts.
- **Backend storage:** ADR-026 specifies the canonical storage layout (`uploads/inventory/<item_id>/pictures/<slot>.<ext>`), file validation, processing with Sharp, and thumbnail generation. These implement the storage and constraint requirements of this ADR.
- **The import concepts in this ADR remain valid** for any future desktop/Electron context where native OS directory access is available. The browser UI adapts these concepts to the web platform's file access model.

### Reconciliation note (updated 2026-06-09)

Updated 2026-06-09: v1 uses file-by-file upload with drag-and-drop (ADR-033), not directory/batch folder import. Batch directory import is deferred to post-v1. All references to "directory picker" and "select a directory/folder" in the Decision section above have been replaced with file picker + drag-and-drop per ADR-033.
