# Ticket WS-LABEL — Standardize UI on "Orders" + "Settings" (labels + routes)

| Field | Value |
|-------|-------|
| Workstream | Cross-cutting terminology cleanup |
| Decision owner | Scott (locked): use **Orders** and **Settings** everywhere user-facing, aligned to the code |
| Recommended model | **T2 — Sonnet (`claude-4.6-sonnet-medium-thinking`)**. Wide but mechanical; the full occurrence map is below. |
| Complexity | Medium-wide (route rename + many string/href edits) |
| Risk | Medium — page **routes** are renamed; deep-links/redirects must stay working. Discovery is already done. |

---

## Decision (locked — do not re-litigate)

The app's domain model is already standardized on **`order`** and **`setting`** (DB tables `orders`/`settings`,
API routes `/api/orders` + `/api/settings`, canonical `entity_type` enums `order`/`setting`). To make the UI
match the code top-to-bottom, **all user-facing labels and the two page routes** become **Orders** and
**Settings**.

### MUST NOT change (these are canonical/internal — changing them breaks things)
- DB tables `orders`, `order_items`, `settings`; any SQL.
- API route folders `src/app/api/orders/**`, `src/app/api/settings/**` (already correct).
- Canonical `entity_type` / `action` enum values: `order`, `setting` (frozen in `.cursorrules`).
- Code identifiers / types / functions / variables: `AiConfig`, `PublishConfig`, `IconConfig`,
  `ConfigPage`, `setShippingSettings`, `configBaseline`, `markConfigClean`, `buildConfigFormSnapshot`,
  `aiConfigured`, `secondaryOrders`, `setOrders`, etc. **Leave all of these.**
- The `src/components/sales/**` component folder and its `@/components/sales/...` imports (internal code org,
  not a route or label). Leave as-is.
- The **"Sales" report type** in Reports (a financial report named "Sales") and the brand string
  "Etsy Sales"/"Trudy's Etsy Sales" in the header. **Leave these — they are not the Orders section.**

---

## Part 1 — Rename the two page-route folders (use `git mv` to preserve history)

```
git mv "src/app/(app)/sales"  "src/app/(app)/orders"
git mv "src/app/(app)/config" "src/app/(app)/settings"
```

After moving, the page components inside are unchanged except the label/href edits below.

## Part 2 — Update `/sales` → `/orders` URL references (8 spots)

| File | Line (approx) | Note |
|------|------|------|
| `src/app/(app)/layout.tsx` | 138, 171 | `pathname.startsWith("/sales")` → `"/orders"` |
| `src/lib/recently-viewed.ts` | 45 | `/sales?orderId=` → `/orders?orderId=` |
| `src/components/customers/CustomerOrderHistory.tsx` | 152 | `/sales?orderId=` → `/orders?orderId=` |
| `src/components/shell/TabBar.tsx` | 9 | `href: "/sales"` → `"/orders"` |
| `src/lib/activity-display.ts` | ~49 | **two** returns: the `order` case AND the `shipping` case both return `/sales?orderId=` → `/orders?orderId=` |
| `src/components/search/GlobalSearchModal.tsx` | 160, 356, 377 | `/sales?orderId=` and `/sales?search=` → `/orders?...` |
| `src/components/onboarding/SetupWizard.tsx` | 360 | `finish("/sales", …)` → `finish("/orders", …)` |
| `src/components/shell/KeyboardShortcutsModal.tsx` | 45 | `pathname.startsWith("/sales")` → `"/orders"` |

## Part 3 — Update `/config` → `/settings` URL references (8 spots; keep any `#hash`)

| File | Line (approx) | Note |
|------|------|------|
| `src/components/shell/TabBar.tsx` | 18 | `href: "/config"` → `"/settings"` |
| `src/components/sales/OrderDetailPanel.tsx` | 1243 | `/config#shipping` → `/settings#shipping` |
| `src/components/dashboard/ActivityFeed.tsx` | 251, 276 | `/config#etsy-connection` → `/settings#etsy-connection` |
| `src/components/shell/IntegrityWarningBanner.tsx` | 39 | `/config#backup-restore` → `/settings#backup-restore` |
| `src/app/(app)/customers/page.tsx` | 1170 | `/config#etsy-connection` → `/settings#…` |
| `src/app/(app)/orders/page.tsx` (was sales) | 967 | `/config#etsy-connection` → `/settings#…` |
| `src/app/(app)/listing-coach/page.tsx` | 821 | `/config` → `/settings` |
| `src/app/(app)/dashboard/page.tsx` | 309 | `/config#etsy-connection` → `/settings#…` |

## Part 4 — Update visible label TEXT

**"Sales" → "Orders":**
- `src/components/shell/TabBar.tsx` :9 — `label: "Sales"` → `"Orders"`
- `src/app/(app)/orders/page.tsx` (was sales) :712 — heading `Sales / Orders` → `Orders`
- `src/components/onboarding/SetupWizard.tsx` :364 — `"Explore Sales"` → `"Explore Orders"`
- `src/components/activity/ActivityLogSection.tsx` :21 — entity chip `{ value: "order", label: "Sales" }` → `label: "Orders"`
- (No change needed: `GlobalSearchModal` and `recently-viewed.ts` already say "Orders".)

**"Config" → "Settings":**
- `src/components/shell/TabBar.tsx` :18 — `label: "Config"` → `"Settings"`
- `src/components/activity/ActivityLogSection.tsx` :28 — entity chip `{ value: "setting", label: "Config" }` → `label: "Settings"`
- `src/app/(app)/settings/page.tsx` (was config) :1290 — heading `Configuration` → `Settings`
- `src/components/etsy/TaxonomyCategoryPicker.tsx` :255 — "…from Config first." → "…from Settings first."
- `src/components/sales/OrderDetailPanel.tsx` :950 — helpText "Pre-filled from Config defaults." → "…from Settings defaults."; :1247 — confirmLabel `"Go to Config"` → `"Go to Settings"`
- `src/app/(app)/listing-coach/page.tsx` :822 — `"Open Config"` → `"Open Settings"`
- `src/components/shell/IntegrityWarningBanner.tsx` :40 — "Config → Backup & Restore" → "Settings → Backup & Restore"
- `src/app/(app)/layout.tsx` :259 — "Use Config → Sample Data" → "Use Settings → Sample Data"
- `src/components/onboarding/SetupWizard.tsx` :145, 146, 156, 218 — replace the word "Config" with "Settings" in the user-facing strings only
- `src/app/(app)/tutorial/page.tsx` :15, 27, 33, 45, 81 — in the help `body` strings, replace "Config" with "Settings" (e.g. "open Config" → "open Settings", "Config → Shipping Info" → "Settings → Shipping Info", "Config → Accounting" → "Settings → Accounting"). Leave the word "configure"/"configured" alone.

## Part 5 — Redirects so old links/bookmarks/deep-links still work

Edit `next.config.ts` to add permanent redirects (Next.js preserves query strings automatically):

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/sales", destination: "/orders", permanent: true },
      { source: "/config", destination: "/settings", permanent: true },
    ];
  },
};

export default nextConfig;
```

## Part 6 — Update docs

- `.cursorrules`: in the tab list and "UI RULES" layout line, change `Sales` → `Orders` and `Config` → `Settings`.
  Add one clarifying line: "UI label **Orders** = domain `order`; UI label **Settings** = domain `setting`
  (entity_type enums unchanged)." Do **not** change the canonical enum values.
- `documents/adr/0035-deep-link-navigation.md` and `documents/adr/0037-activity-log-and-audit-trail.md` §A3:
  change deep-link targets `/sales?orderId=` → `/orders?orderId=`.
- `documents/ui-design.md`: tab names Sales→Orders, Config→Settings (headings that say "Sales / Orders" and
  "Config / Settings" can become just "Orders" and "Settings").

## Steps

1. `git mv` both folders (Part 1).
2. Apply Parts 2–4 edits (use the table; verify each line still type-checks).
3. Add redirects (Part 5).
4. Update docs (Part 6).
5. **Sweep for stragglers:** search the repo for `"/sales"`, `'/sales'`, `` `/sales `` and the same for
   `/config`, plus visible whole-word `>Sales<` / `>Config<`. Fix any the table missed (but respect the
   "MUST NOT change" list — especially the Reports "Sales" report and brand "Etsy Sales").
6. `npm run build`; fix any type/lint errors. Then manually click the Orders and Settings tabs, the
   Outstanding deep-links, global search, and an activity-log row to confirm navigation works.

## Acceptance criteria

- [ ] Tabs read **Orders** and **Settings**; visiting `/orders` and `/settings` renders the pages.
- [ ] Old `/sales` and `/config` URLs redirect (with query string preserved, e.g. `/sales?orderId=5` → `/orders?orderId=5`).
- [ ] No user-facing string says "Sales" for the orders section or "Config" for settings (heading
      "Sales / Orders" is gone). Activity chips read "Orders" and "Settings".
- [ ] Deep-links from Outstanding, global search, recently-viewed, and activity rows land on `/orders?orderId=…`.
- [ ] Reports still has its **"Sales" report** type; header brand text unchanged; no DB/API/enum/code-identifier renames.
- [ ] `npm run build` passes; no new lint errors.

## Escalation triggers (STOP and ask)

- A `git mv` collides with an existing `orders`/`settings` folder under `(app)`.
- You find a `/sales` or `/config` reference that is NOT a page route (e.g. an API path) — do not change API paths.
- Renaming a string would touch a canonical enum value, DB column, or API route.

---

## Kickoff prompt (paste into a new chat on the Recommended model)

> Implement ticket `documents/tickets/WS-LABEL_orders-settings-terminology.md`. Read the whole ticket first
> and follow `.cursor/rules/implementer.mdc`. The decision is locked: standardize the UI on **Orders** and
> **Settings**, including renaming the `(app)/sales` and `(app)/config` page-route folders, but DO NOT change
> DB tables, `/api/*` routes, `entity_type` enums, or code identifiers. Use the occurrence tables in the
> ticket, add the redirects, update the listed docs, then run `npm run build`. Report what you changed and
> confirm each acceptance-criteria checkbox. STOP and ask me if you hit any escalation trigger.
