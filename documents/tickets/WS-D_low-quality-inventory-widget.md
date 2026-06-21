# Ticket WS-D — Dashboard "Needs work" low-quality inventory widget

| Field | Value |
|-------|-------|
| Workstream | D (low-quality inventory widget) |
| Source ADR(s) | **ADR-016 §7** (authoritative). Context: ADR-068 (quality score), ADR-064 (widget pattern), ADR-035 (deep-link), ADR-028 (components). |
| Recommended model | **T2 — Sonnet (`claude-4.6-sonnet-medium-thinking`)** (new lib query + API route + component + wiring). Composer is fine if it stays in scope. |
| Complexity | Small–Medium (one query, one route, one widget, one placement) |
| Risk | Low (additive; no schema/enum/API-shape changes) |

---

## Goal

Add a dashboard widget that lists **current inventory items whose listing-quality score is below the
pass threshold**, sorted **lowest score first**, so the user can jump straight to items needing work.
(Per ADR-016 §7.)

## Key decisions (locked — don't deviate)

- **Threshold source:** read the **existing canonical setting** `listing.min_quality_score`
  (default **80**) via `getSetting("listing.min_quality_score")`. This is the SAME threshold the
  Inventory list badge, Outstanding, listing-approve, and listing-score endpoint already use — so the
  dashboard and inventory views never disagree. **Do NOT** introduce `listing.quality_threshold`/85
  here (ADR-016 §7 mentions 85 as a future target; the implemented threshold today is
  `listing.min_quality_score`. WS-G will reconcile. Add a one-line note to ADR-016 §7 — see Step 5).
- **Score computation:** compute server-side with the existing pure function
  `computeListingScore(input, minScore)` from `src/lib/listing-score.ts`. Include an item when
  `result.score < minScore`.
- **Status filter:** reuse the existing `UNSOLD_STATUSES` list in `src/lib/dashboard.ts`
  (`Draft`, `In stock`, `Listed`, `Reserved`) — this already excludes **Sold** and **Retired**.
  There is **no separate inventory "Inactive" flag** in the schema, so the ADR's "Inactive" exclusion
  is satisfied by the status filter. Do not invent an `is_active` column.
- **Deep-link:** each row links to `/inventory?itemId=<id>` (ADR-035).

## Files (create/edit only these)

1. **`src/lib/dashboard.ts`** — add `getLowQualityInventory()`.
2. **`src/app/api/dashboard/low-quality-inventory/route.ts`** — new GET route (copy the guard +
   error-envelope pattern from `src/app/api/dashboard/inventory-value/route.ts`).
3. **`src/components/dashboard/LowQualityInventoryWidget.tsx`** — new widget component.
4. **`src/app/(app)/dashboard/page.tsx`** — render the widget (placement in Step 4).
5. **`documents/adr/0016-dashboard-content-and-behavior.md`** — one-line threshold note (Step 5).

> If you need to touch anything else, **STOP and ask**.

## Steps

### 1. Lib query — `src/lib/dashboard.ts`
Add:
```ts
export type LowQualityInventoryItem = {
  id: number;
  item_number: string | null;
  title: string;        // listing_title, else description, else "Untitled"
  score: number;
};

export function getLowQualityInventory(): {
  items: LowQualityInventoryItem[];
  threshold: number;
} {
  const db = getDb();
  const minScore = parseInt(getSetting("listing.min_quality_score") ?? "80", 10) || 80;
  const placeholders = UNSOLD_STATUSES.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT * FROM inventory WHERE status IN (${placeholders})`)
    .all(...UNSOLD_STATUSES) as Array<Record<string, unknown>>;

  const items: LowQualityInventoryItem[] = [];
  for (const row of rows) {
    const { score } = computeListingScore(row as ListingScoreInput, minScore);
    if (score < minScore) {
      const title =
        (row.listing_title as string)?.trim() ||
        (row.description as string)?.trim() ||
        "Untitled";
      items.push({
        id: row.id as number,
        item_number: (row.item_number as string) ?? null,
        title,
        score,
      });
    }
  }
  items.sort((a, b) => a.score - b.score); // lowest first
  return { items, threshold: minScore };
}
```
Add the imports for `computeListingScore` and `ListingScoreInput` from `@/lib/listing-score`
(`getSetting` and `UNSOLD_STATUSES` already exist in this file).

### 2. API route — `src/app/api/dashboard/low-quality-inventory/route.ts`
Mirror `inventory-value/route.ts` exactly (it calls `requireEtsyAccessToken(await cookies())`),
returning `NextResponse.json({ ok: true, ...getLowQualityInventory() })` and the same
`errorResponse(fromUnknownError(...))` envelope on failure.

### 3. Widget — `src/components/dashboard/LowQualityInventoryWidget.tsx`
- Client component, `embedded?: boolean` prop like `InventoryValueWidget` for consistency.
- Fetch `GET /api/dashboard/low-quality-inventory` on mount; optional 60s refresh.
- Title: **"Needs work"** with subtext like `{n} item(s) below quality {threshold}`.
- Body: a **scrollable**, single-spaced list (cap height, `overflow-y-auto`). Each row:
  item number · title (truncate w/ `title` tooltip) · score badge, wrapped in a
  `next/link` to `/inventory?itemId=<id>`.
- Color the score with existing tokens (e.g. red `var(--ui-red)` for low). No hardcoded hex.
- **Empty state** (no items): positive message "All active items meet the quality threshold."
  (use `EmptyState` or a simple centered line).
- Loading: skeleton rows like other widgets.

### 4. Placement — `src/app/(app)/dashboard/page.tsx`
Add the widget in the KPI/inventory area, **above** the activity-views row
(`grid ... lg:min-h-[36rem]` block). A simple full-width row works:
```tsx
<div className="mt-4">
  <LowQualityInventoryWidget />
</div>
```
Import it at the top alongside the other dashboard widgets. Don't disturb the activity-views row.

### 5. Doc note — ADR-016 §7
Add one line under §7: *"Implementation note (WS-D): the widget reads the existing
`listing.min_quality_score` setting (default 80) so it matches the Inventory list badge and
Outstanding; the 85/`listing.quality_threshold` target will be unified under WS-G."*

### 6. Build
Run `npm run build`; fix any type/lint errors you introduce.

## Acceptance criteria

- [ ] Dashboard shows a **"Needs work"** widget listing active inventory items with quality
      **score < `listing.min_quality_score`** (default 80), **sorted lowest score first**.
- [ ] **Sold** and **Retired** items never appear (uses `UNSOLD_STATUSES`).
- [ ] List is **scrollable**, single-spaced; each row shows item number, title, score, and
      **deep-links to `/inventory?itemId=<id>`**.
- [ ] When no items are below threshold, a **positive empty state** shows.
- [ ] Score + threshold match what the Inventory list badge shows for the same items (same setting).
- [ ] `npm run build` passes; no new lint errors; no `any` beyond the documented row casts; no
      hardcoded hex; standard API error envelope; no schema/enum/API-shape changes.

## Out of scope (do NOT do here)

- Changing the score rubric or thresholds (WS-G/ADR-082).
- Pagination/filters/sorting controls on the widget (it's a fixed lowest-first list).
- Any inventory list-view changes; any new settings.

## Escalation triggers (STOP and ask)

- `computeListingScore` needs inputs not present on the inventory row.
- You feel the widget belongs somewhere other than the dashboard, or the placement conflicts with
  the activity-views row.
- The threshold setting is missing/empty in a way the `?? "80"` default doesn't cover.

## How to verify (manual)

1. `npm run build` → `npm run start`, open the dashboard.
2. Confirm the "Needs work" widget lists low-score active items, lowest first; click a row → lands on
   that item in `/inventory`.
3. Temporarily ensure at least one active item is incomplete (e.g. missing title/tags) and confirm it
   appears; a fully-complete item should not.

---

## Kickoff prompt (paste into a new chat on the Recommended model)

> Implement ticket `documents/tickets/WS-D_low-quality-inventory-widget.md`. Read that ticket and
> **ADR-016 §7** (`documents/adr/0016-dashboard-content-and-behavior.md`) first, and follow
> `.cursor/rules/implementer.mdc`. Use the existing `computeListingScore` function and the
> `listing.min_quality_score` setting (default 80) — do not add new thresholds. Only touch the files
> the ticket lists. When done, run `npm run build`, report what you changed, and confirm each
> acceptance-criteria checkbox. STOP and ask me if you hit any escalation trigger.
