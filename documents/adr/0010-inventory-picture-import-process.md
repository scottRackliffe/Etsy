# ADR-010: Inventory picture import — upload, import from folder, replace/reorder/remove

## Status

Accepted

## Date

2025-02-15

## Context

Inventory items have up to 10 pictures (ADR-002); paths or URLs are stored in the database, files on disk or object storage. We need a defined way for users to get pictures into the app: upload, bulk import from a folder, and to replace, reorder, or remove pictures without confusion.

## Decision

**Ways to get pictures in**

- **Directory picker:** For any picture need (main or condition), open a file directory (folder) window; user selects the directory that contains the images.
- **Import from folder:** User selects a single folder; app discovers image files (by name or order), maps them to picture 1–10 (first 10 if more), copies or moves files into app-controlled storage, saves paths to the database. Optional: bulk flow where a parent folder contains one subfolder per item and we import each subfolder’s images into that item’s slots.
- **URL (optional):** User can paste a URL for a picture; app stores the URL in the corresponding slot (no file copy).
- **Preview (required after directory selection):** Display a preview of some pictures in the selected directory so the user can confirm correct folder before importing. Same for Replace per slot.
- **"Why pictures matter" link:** Show a link to a doc on why pictures matter for sales. Default: documents/pictures-and-sales.md. Optional in Config: user path or URL (e.g. a PDF that was a beginning of this project).

**Commands and behavior**

- **Add / Import pictures** — Open directory picker → user selects folder → show preview of some pictures from that folder → user confirms → assign to slots; show link to "Why pictures matter" doc (default: documents/pictures-and-sales.md; optional in Config: user's own path or URL, e.g. a PDF that was a beginning of this project).
- **Replace** — Per-slot: same directory picker → preview → confirm.
- **Reorder** — Change order of slots (e.g. drag-and-drop); picture 1 is primary.
- **Remove** — Clear one or more slots (path/URL set to null).

**Storage and constraints**

- Storage path: one directory per item (e.g. `uploads/inventory/<item_id>/`) or equivalent; do not overwrite another item’s files.
- File types: at least JPEG, PNG; optional WebP, GIF. Reject or convert others.
- Optional: max file size and max dimension; optional resize on upload. Stored filenames can be original or generated (e.g. `1.jpg`) to avoid collisions.

**Where it appears**

- Available when adding or editing an inventory item (Inventory tab). “Upload pictures” and “Import from folder” are explicit commands; replace/reorder/remove are available in the picture area for the selected item.

## Consequences

- **Positive**
  - Clear, consistent way to add and manage the 10 pictures; supports both one-off upload and folder-based import (and optional bulk by item).
  - Aligns with ADR-002 (picture 1–10, paths in DB); no schema change.
- **Negative**
  - Implementation must handle file I/O, safe paths, and optional size/dimension limits.

## Notes

- Full process description and “etc.” (e.g. thumbnails, “copy from another item”) are in [documents/ui-design.md](../ui-design.md) section 5.8. This ADR records the decision for the import mechanisms and commands.
