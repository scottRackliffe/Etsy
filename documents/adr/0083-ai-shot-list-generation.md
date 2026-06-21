# ADR-083: AI shot-list generation from the primary photo

## Status

Accepted — implemented (WS-H1, 2026-06-21)

**Implementation note (WS-H1):** `src/lib/shot-list.ts` generates the list from `picture_1` +
item context via the OpenAI Responses API on the WS-AICOST economy lane (`resolveModelForTask(…,
"shot-list")`). Persisted to `inventory.shot_list_json`; `captured` is derived at read time from
existing pictures + classifications (shared parser `src/lib/picture-classifications.ts`, which
handles both the Coach array shape and the PictureGrid record shape). Endpoints:
`GET/POST /api/inventory/[id]/shot-list`. UI: `src/components/inventory/ShotListPanel.tsx` in the
inventory picture area. Activity: `listing.shot_list_generated`.

## Date

2026-06-21

## Context

To reach top photo quality, a seller needs the *right set* of photos (hero, angles, scale,
detail, backstamp, condition, lifestyle, measurement, etc.). Knowing which shots an item needs is
itself a skill. The owner wants to upload the **primary photo**, then have the system **generate a
shot list** — every photo/video needed for the highest rating — each item with a **name** and a
**purpose/description** of what it must show.

This feeds the photo portion of the quality rubric (ADR-082) and reuses the photo **shot-type
taxonomy** already defined in ADR-072 (`hero, angle, detail, backstamp, scale, imperfection,
underside, grouping, lifestyle, measurement, extra`).

Program reference: `documents/PROGRAM_2026-06-21_major-enhancements.md` workstream **H (10.a)**.

## Decision

Add an **AI shot-list generator**: given the primary photo plus item context, produce a
**persisted, checklist-style shot list** tailored to the item, using the OpenAI vision model
(existing `openai` dependency) and the ADR-072 shot-type taxonomy.

---

### 1. Inputs

- **Primary photo** (`picture_1`) — required. May be the just-uploaded hero before other shots
  exist.
- **Item context** (when available): `description`, `condition_code`, `condition_notes`,
  `materials`, `is_supply`, category/taxonomy, dimensions — sent as text to ground the suggestions
  (e.g. a teapot needs a backstamp + lid + spout-tip shots; a framed print needs corner + hanging
  hardware shots).

### 2. Output — shot list

An ordered array; each item:

```json
{
  "shot_type": "backstamp",          // one of the ADR-072 taxonomy values
  "name": "Maker's mark / backstamp",
  "purpose": "Sharp close-up of the underside stamp to prove maker and authenticity.",
  "pass_spec": "Fill the frame with the mark; tack-sharp; even light; no glare.",
  "tips": "Use raking light to lift a faint impressed mark; manual white balance.",
  "required": true,                   // required for top rating vs. recommended
  "captured": false                   // becomes true when a matching picture exists/classified
}
```

The `pass_spec` mirrors the §6 standard so the same wording flows into the ADR-082 quality
remediation when a shot is missing or off-spec.

- Always includes the **hero** (already satisfied by `picture_1`) and the high-value shots for the
  item type; marks each `required` or recommended.
- `captured` is derived by matching against existing pictures and their
  `picture_classifications` (ADR-072) so the list doubles as a **progress checklist**.

### 3. Storage

- New **additive** column `inventory.shot_list_json` (TEXT, JSON) on the `inventory` table
  (ADR-017/ADR-002 additive). Stores the generated list so it persists as a working checklist.
- Regenerating overwrites it (with a confirm if the user has already captured shots, to avoid
  losing `captured` state — implementer merges captured flags on regenerate).

### 4. API (added to ADR-018)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/inventory/[id]/shot-list` | Generate (or regenerate) the shot list from `picture_1` + context. Saves `shot_list_json`. 400 if no `picture_1`. Returns the list. |
| GET | `/api/inventory/[id]/shot-list` | Return the saved `shot_list_json` (with refreshed `captured` flags). |

Logs activity (ADR-037): `listing.shot_list_generated`
(`detail_json: { count, required_count }`), entity_type `inventory`.

### 5. UI

- On the inventory detail picture area (ADR-033) and in Listing Coach (ADR-072): a **"Generate
  shot list"** action (enabled once a hero exists). Renders the list as a checklist; each item
  shows name + purpose and whether it's captured. Tapping an uncaptured item highlights the
  matching empty picture slot.
- The shot list contributes to the photo section of the quality rubric (ADR-082): missing
  `required` shots become **quality remediation** items (ADR-081 §4).

---

### 6. Shot specifications & photography standard (research §10–§11)

The generator must emit, for each shot, a **purpose** and an explicit **pass spec** so the photo
can later be judged by the ADR-082 rubric. These are the canonical default specs (item-type
context may add/remove shots, e.g. no `backstamp` for an unmarked item):

| Shot (`shot_type`) | Purpose | Pass spec |
| --- | --- | --- |
| `hero` | Primary thumbnail; whole item | Front-on, eye-level; **square or 4:3**; subject **centered, fills ~70–85%** with crop-safe margin; clean **white/neutral** bg; sharp; ≥2000px shortest side |
| `angle` (3/4, 45°) | Show depth/form | 45° rotation showing sides/depth not visible in hero |
| `angle`/`underside` (back + underside) | Construction, finish, marks | Back view **and** underside/bottom; required for vintage authenticity |
| `detail` | "Virtually touch" the material | Macro of grain/weave/stitching/hardware/joinery/finish; tack-sharp |
| `backstamp` | Authenticity | Sharp close-up of **maker's mark / signature / label / stamp**; required **if the item bears any mark** |
| `imperfection` | Honest condition | Each disclosed flaw shown clearly **with a scale reference** |
| `scale` | Communicate size | Item beside a **common object** (hand, coin, ruler, mug) on the same depth plane |
| `measurement` | Exact size | Dimensions shown via ruler/overlay (see ADR-084) |
| `lifestyle` | Context/emotion | Item in a real/period-appropriate setting; uncluttered bg |
| `grouping` | Set/extras | All included pieces together |
| `extra` (video) | Confidence | Short listing video (see §7) |

**Photography technique the generator should recommend in each shot's `purpose`/tips
(research §10):**
- **Lighting:** one **large diffused key light at ~45°** + **reflector/foam board** fill;
  **black card/polarizer** for reflective glaze/glass/metal; **raking light** (shallow angle) to
  reveal **patina, grain, and surface texture** on antiques.
- **Color accuracy (critical for vintage):** **natural window light / overcast**, **manual white
  balance**, optional color-calibration card, **no color-distorting filters**; protect highlights.
- **Consistency:** same lighting/background/editing across all of a shop's items.
- **Count:** aim to **use all 10 slots (7–10 convert markedly better than 1–3)**.

### 7. Listing video (optional shot — research §11)

When the item benefits from motion, the shot list includes a **video** item with this spec
(consistent with ADR-026 storage limits):

- **5–15 seconds**, **≤ 100 MB**, MP4/MOV (H.264), **silent** (Etsy strips audio — no
  music/voiceover), **1080p** recommended, **square 1:1 (or 4:5)** for mobile.
- **First 2–3 seconds = the hero/in-use "money shot."** 4-beat formula: **hero/in-use → context
  → detail (texture) → scale (hold 1–2s).** Use/scale videos out-engage plain 360° spins. Steady
  tripod, natural light. End on the finished item.

## Consequences

- **Positive**
  - Removes guesswork; gives the owner a concrete, item-specific photo plan **with explicit
    pass specs and photography technique** that drives the 98%+ quality goal.
  - Reuses the ADR-072 taxonomy and existing OpenAI dependency; integrates with the rubric.
- **Negative**
  - One additive column; one vision call per generation (cost/latency, logged via ADR-075).
  - Quality of suggestions depends on the vision model and provided context.

## Notes

- Video: the list may include a short video item (`shot_type: extra`/lifestyle) per ADR-072/H and
  §7 above.
- Evidence base: `documents/research/2026-06-21_etsy-listing-best-practices.md` §10–§11
  (Etsy photo ideas, furniture/antique studio technique, eBay/Chairish/1stDibs shot sets, Etsy
  video rules).
- **Cross-references to update at implementation (.cursorrules §1b):** ADR-017/002
  (`shot_list_json`), ADR-018 (endpoints), ADR-033 (picture UI), ADR-072 (taxonomy + Coach),
  ADR-082 (required-shot → remediation), ADR-075 (API usage logging), ADR-037 (activity action),
  `.cursorrules` (column + action).
