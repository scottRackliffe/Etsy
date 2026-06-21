# ADR-084: AI dimension annotation from a reference-ruler photo

## Status

Accepted — implemented (WS-H2, 2026-06-21)

**Implementation note (WS-H2):** `src/lib/dimension-annotation.ts` — `estimateDimensions()` reads the
ruler photo via the OpenAI Responses API on the WS-AICOST economy lane (`resolveModelForTask(…,
"measure")`) and degrades to manual entry on failure; `renderAnnotatedImage()` composites dual-unit
SVG callouts onto a copy of `picture_1` with Sharp and stores it (via `processAndStorePicture`) in a
secondary slot classified `measurement`, never the hero. Endpoints: `POST /api/inventory/[id]/measure`
and `POST /api/inventory/[id]/annotate-dimensions`. UI: `src/components/inventory/MeasurementPhotoPanel.tsx`
(upload → mandatory confirm/correct → render). Confirmed values + render metadata persist in
`dimension_annotation_json`. Activity: `inventory.dimensions_annotated`.

## Date

2026-06-21

## Context

Buyers want clear size information, and a "measurement" photo (item shown with dimensions) is a
high-value shot. The owner wants to **provide a photo that contains a reference ruler**, and have
the system **copy the primary photo and overlay the derived dimensions** (length, height, and
width as needed) — producing a polished measurement image without manual graphics work.

Existing capabilities: **Sharp** (image processing, already a dependency) for compositing
overlays; **OpenAI vision** for estimating dimensions from the ruler scale; picture storage
(ADR-026) and the shot-type taxonomy (ADR-072, `measurement`).

Program reference: `documents/PROGRAM_2026-06-21_major-enhancements.md` workstream **H (10.b)**.

## Decision

Add an **AI dimension-annotation** feature: from a **ruler photo** (the item photographed next to
a ruler/tape) plus the **primary photo**, estimate the item's dimensions, let the user **confirm
or correct** them, then render an **annotated copy of the primary photo** with dimension callouts,
saved as a measurement picture. Optionally write the measured values into the item's dimension
fields.

---

### 1. Inputs

- **Ruler photo** — required: the item with a visible measuring scale (ruler/tape) in-frame, used
  to establish real-world scale.
- **Primary photo** (`picture_1`) — required: the image that will be annotated (clean hero, no
  ruler).
- **Units** — from `inventory.item_dimensions_unit` / Config default (`in` default; ADR-017).

### 2. Process

1. **Estimate:** send the ruler photo (and optionally the hero) to the vision model with a prompt
   to detect the ruler scale and estimate item **length, height, and width** (width only when the
   item/photo implies depth). Returns numeric estimates + a confidence per dimension.
2. **Confirm/correct (required step):** show the user the estimated dimensions in editable fields
   **before** rendering. The user can adjust any value. This is the reliability fallback for
   imperfect ruler detection — rendering always uses the **confirmed** values, never raw
   estimates silently.
3. **Render:** using **Sharp**, copy `picture_1` and composite clean dimension callouts per the
   **overlay style standard (§6)**. Output is a new JPEG.
4. **Save:** store the annotated image in the item's picture storage (ADR-026) and assign it to a
   **secondary** slot (never overwrite the clean hero — see §6), classified as `measurement`
   (ADR-072). The original hero is unchanged.
5. **Optional field write-back:** offer to set `item_length`, `item_height`, `item_width` (and
   `item_dimensions_unit`) from the confirmed values.

### 3. Storage

- Annotated image saved under `uploads/inventory/<item_id>/pictures/` (ADR-026); its path stored
  in the chosen `picture_n` slot with `picture_classifications` entry `measurement`.
- No new table. Optional new **additive** column `inventory.dimension_annotation_json` (TEXT) to
  retain the confirmed values + source ruler photo reference for re-rendering (optional; may be
  deferred).

### 4. API (added to ADR-018)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/inventory/[id]/measure` | Body: ruler photo (upload ref) → returns `{ length, width, height, unit, confidence:{} }`. No render yet. 400 if no ruler photo / no `picture_1`. |
| POST | `/api/inventory/[id]/annotate-dimensions` | Body: confirmed `{ length, width, height, unit, target_slot? , write_back?:bool }` → renders annotated copy of `picture_1`, saves to a slot, optional field write-back. Returns the new picture path. |

Logs activity (ADR-037): `inventory.dimensions_annotated`
(`detail_json: { length, width, height, unit, slot }`), entity_type `inventory`.

### 5. UI

- In the inventory picture area (ADR-033) / Listing Coach (ADR-072): **"Add measurement photo"**
  → upload ruler photo → review/correct estimated dimensions → preview annotated image → save.
- Satisfies the `measurement` shot in the shot list (ADR-083) and the photo rubric (ADR-082).

---

### 6. Overlay style standard (research §11)

The rendered annotation must follow these rules so it is professional, truthful, and legible —
~22% of online returns stem from size surprises, so this image directly reduces returns:

- **Dual-arrow measurement lines** along the relevant edges; **floating, high-contrast labels**
  positioned so they **do not obscure the product**.
- **Dual units — inches and centimeters** (e.g. `12 in (30.5 cm)`).
- **Large, legible font** that stays readable at **thumbnail size**; respect **safe margins**
  (no edge clipping); consistent style across the catalog.
- **Truthful scaling:** lines must match the confirmed measurements; never distort.
- **Keep the hero clean:** the annotated image goes in a **secondary slot**, not `picture_1`
  (marketplaces forbid/penalize text on the main image; Etsy is lenient but the hero stays clean).
- Add descriptive **alt text** (e.g. "Teapot shown with height 6 in and width 9 in").

**Per-shape dimension logic:**
- **Box-like / furniture →** Height × Width × Depth.
- **Round / cylindrical (bowls, vases, plates) →** Diameter × Height.
- **Artwork / framed →** outer frame size **and** visible image size.

## Consequences

- **Positive**
  - Produces a professional measurement photo with minimal effort; can also populate dimension
    fields and the shipping size inputs.
  - Reuses Sharp + OpenAI + existing picture storage; no new table required.
- **Negative**
  - Dimension estimation is approximate; mitigated by the mandatory confirm/correct step.
  - Adds vision + image-processing cost/latency (logged via ADR-075).

## Notes

- The confirm/correct step is **mandatory** — the system never publishes machine-estimated
  dimensions without user confirmation.
- Evidence base: `documents/research/2026-06-21_etsy-listing-best-practices.md` §11 (dimension
  imagery best practices; dual-unit labels; keep-hero-clean; per-shape logic).
- **Cross-references to update at implementation (.cursorrules §1b):** ADR-026/033 (picture storage
  + UI), ADR-072 (`measurement` shot), ADR-082 (measurement photo rubric), ADR-017/002 (optional
  `dimension_annotation_json`; dimension fields already exist), ADR-018 (endpoints), ADR-075 (API
  usage), ADR-037 (activity action), `.cursorrules` (optional column + action).
