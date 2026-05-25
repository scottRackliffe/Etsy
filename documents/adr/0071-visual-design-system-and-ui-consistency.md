# ADR-071: Visual design system and UI consistency

## Status

Accepted

## Date

2026-05-24

## Context

Colors live in [System_Colors.md](../System_Colors.md); components in ADR-028 and [frontend-architecture.md](../frontend-architecture.md). Navigation is spread across ui-design and ADR-009/035. Status semantics (paid, shipped, listing state) are inconsistent across pages. **Consistency across the system is a core requirement** — implementers need one canonical document for colors, navigation, badges, and “transaction complete” feedback.

## Decision

**[System_Colors.md](../System_Colors.md) remains the hex/CSS variable source of truth.** This ADR defines **how** those tokens are applied everywhere. All UI must use `var(--ui-*)` or Tailwind `bg-[var(--ui-*)]` — never hardcoded hex in components (`.cursorrules`).

---

### 1. Typography and layout density

| Token | Value | Use |
|-------|-------|-----|
| Page title | `text-xl` / `1.25rem`, `font-semibold`, `--ui-title` | Tab page H1 |
| Section title | `text-lg` / `1.125rem`, `font-semibold`, `--ui-title` | Card headings |
| Body | `text-sm` / `0.875rem`, `--ui-body` | Default labels, table cells |
| Caption | `text-xs` / `0.75rem`, `--ui-muted` | Hints, timestamps |
| Font family | System UI stack (`ui-sans-serif` via Tailwind) | No custom webfonts v1 |

**Spacing:** 4px base grid. Card padding `p-4` (16px); section gap `space-y-4`; form field gap `space-y-3`. Master-detail gap `gap-4` (lg: `gap-6`).

**Radius:** Cards and inputs `rounded-lg` (8px). Buttons `rounded-lg`. Modals `rounded-xl` (12px).

**Elevation:** No drop shadows v1; depth via `border border-[var(--ui-border)]` and background step (background → panel → card).

**Motion:** Respect `prefers-reduced-motion: reduce` (ADR-045). Default transitions ≤ 200ms for hover/focus. No decorative animation v1.

---

### 2. Semantic color usage (mandatory)

| Semantic | CSS variable | Use for |
|----------|--------------|---------|
| Success / complete | `--ui-green` | Paid, shipped (fulfillment complete), save toast, inline-edit confirm flash, connected Etsy |
| Warning / attention | `--ui-yellow` | Unpaid, not shipped, draft listing, ship-without-paid warning, integrity warning |
| Error / danger | `--ui-red` | Validation errors, API failures, void blocked actions, not connected critical |
| Info | `--ui-accent` | Listed, Etsy source, links, primary CTAs |
| Neutral | `--ui-muted` | Void/cancelled, retired, disabled, secondary text |

**Do not** use green for non-success (e.g. never green primary buttons except explicit “success” actions).

---

### 3. Navigation standards

#### 3.1 Tab bar (primary navigation)

- **Order (fixed):** Dashboard → Sales → Inventory → Customers → Reports → Tutorial & Tips → Outstanding → Config.
- **Component:** `TabBar` — `Link` per tab, active = bottom border `2px solid var(--ui-accent)` + `--ui-title` text.
- **Outstanding tab:** Badge with count from `GET /api/outstanding` (ADR-020).
- **Mobile (ADR-061):** Horizontal scroll tab bar; same order.

#### 3.2 App header (global chrome)

Specified in detail in [ui-design.md](../ui-design.md) §1b. Summary:

| Zone (left → right) | Content |
|-------------------|---------|
| Left | App name (from `business_name` or default) |
| Center (optional lg+) | — |
| Right | Etsy status badge → Shop selector (if connected) → Recent (ADR-063) → Print queue (ADR-055) → Notifications (ADR-051) → Global search trigger (ADR-041) |

- **Connect Etsy** when disconnected: primary button in header **and** Dashboard empty state.
- **Global search:** `Cmd/Ctrl+K` opens modal (ADR-041, ADR-049).

#### 3.3 Deep linking (context in place)

| Param | Target tab | Behavior |
|-------|------------|----------|
| `orderId` | Sales | Select order, scroll into view, highlight row 2s (`--ui-accent` outline) |
| `itemId` | Inventory | Select item, load detail + workshop |
| `customerId` | Customers | Select customer, load detail |

- Source: Outstanding click (ADR-035), global search, notifications, recent items.
- After selection: `router.replace` to strip query (ADR-035).

#### 3.4 Keyboard

- Per ADR-049 and ADR-045: tab order header → tab bar → main content; modals trap focus (ADR-032).

---

### 4. Badge component — canonical variant map

All status display uses shared `Badge` (ADR-028). **Label** is user-facing English; **variant** drives color.

#### 4.1 Order / payment / fulfillment

| Condition | Badge label | Variant | Notes |
|-----------|-------------|---------|-------|
| `was_paid = 1` | Paid | `success` | |
| `was_paid = 0` | Unpaid | `warning` | |
| `payment_status = refunded` | Refunded | `neutral` | Manual/record only (ADR-070) |
| `shipping_date` set AND `shipper` set | Shipped | `success` | Fulfillment complete; `order_status` stays `active` |
| Else (active order) | Not shipped | `warning` | |
| `shipped_without_paid_override = 1` | Shipped (unpaid) | `warning` | Tooltip per ADR-060 |
| `order_status = void` | Void | `neutral` | Strikethrough row optional |
| `order_status = cancelled` | Cancelled | `neutral` | |
| `source_channel = etsy` | Etsy | `info` | |
| `source_channel = manual` | Manual | `neutral` | |

#### 4.2 Inventory `status`

| `status` value | Badge label | Variant |
|----------------|-------------|---------|
| Draft | Draft | `neutral` |
| In stock | In stock | `warning` |
| Listed | Listed | `info` |
| Sold | Sold | `success` |
| Reserved | Reserved | `warning` |
| Retired | Retired | `neutral` |

#### 4.3 Listing `listing_draft_state`

| State | Badge label | Variant |
|-------|-------------|---------|
| draft | Draft | `neutral` |
| generated, imported | Needs review | `warning` |
| approved | Approved | `success` |
| published | Published | `info` |

#### 4.4 Etsy connection

| State | Badge label | Variant |
|-------|-------------|---------|
| Connected | Connected | `success` |
| Not connected | Not connected | `warning` |
| Token error / revoked | Reconnect required | `error` |

---

### 5. Order lifecycle — user-visible “transaction complete”

**Important:** `order_status` is only `active | void | cancelled`. **Paid** and **shipped** are separate flags/fields (ADR-031).

#### 5.1 Fulfillment progress (active orders)

Display a compact **progress indicator** on order detail (not a fourth order_status):

```
[ Paid ] — [ Shipped ] — [ Documents ]
   ✓          ○            ○
```

| Step | Complete when | Visual |
|------|---------------|--------|
| Paid | `was_paid = 1` | Green check, label Paid |
| Shipped | `shipping_date` AND `shipper` both non-empty | Green check, label Shipped |
| Documents optional | User printed invoice/thank-you (optional v1: not tracked) | Gray until post-v1 |

- **Sale complete (operations):** Paid + Shipped = show subtle banner on order detail: “This order is complete” (`--ui-green` border-left card). Still `order_status = active`.

#### 5.2 Action feedback (after user action)

| Action | Feedback pattern | Message example |
|--------|------------------|-----------------|
| Save order/inventory/customer | Toast `success` | “Changes saved.” |
| Mark paid | Toast `success` + badge update | “Order marked paid.” |
| Mark shipped | Toast `success` + badge update | “Order marked shipped.” |
| Create record | Toast `success` | “Order created.” |
| Delete/void/merge | Toast `success` after confirm | “Order voided.” |
| API error | Toast `error` or `ErrorPanel` | User message from API envelope |
| Long job | Progress modal / SSE (ADR-043) | Determinate bar |
| Etsy sync complete | Toast `success` | “Synced N new orders.” |

**Never** use `ErrorPanel` for success (ADR-028).

#### 5.3 Inline edit confirm (ADR-062)

- On successful cell save: 400ms background flash `var(--ui-green)` at 20% opacity.

---

### 6. Buttons (canonical — ADR-028)

| Variant | Use |
|---------|-----|
| `accent` | Primary action: Save, Create, Connect, Confirm |
| `secondary` | Cancel, Print, Export, secondary navigation |
| `danger` | Void, Delete, Remove sample data |
| `ghost` | Link customer, View history |

**Sizes:** default; `lg` for empty-state primary CTA only.

**Loading:** `busy` prop shows spinner; disable double-submit.

---

### 7. Toast, modal, empty, loading

| Pattern | Component | When |
|---------|-----------|------|
| Transient success/error | `Toast` via `useToast` | After mutations |
| Confirm destructive | `ConfirmDialog` (ADR-032) | Void, delete, merge, remove sample data |
| Form / ship / create | `Modal` | Multi-field flows |
| No data | `EmptyState` (ADR-059) | Lists with actions |
| Initial load | `LoadingSpinner` center | First fetch |
| Table refresh | Skeleton rows (preferred) or spinner overlay | ADR-029 lists |

---

### 8. DataTable and list rows

- Zebra: `--ui-list-dark` / `--ui-list-light` from System_Colors.
- Hover: `--ui-list-hover`.
- Selected row: `outline 2px solid var(--ui-accent)`.
- Void/cancelled orders: `opacity-60`, optional strikethrough on order number.

---

### 9. Implementation checklist (per screen)

Before marking a tab “UI complete,” verify:

1. All colors use CSS variables.
2. All statuses use `Badge` per §4 tables.
3. All saves use toast success, not ErrorPanel.
4. Destructive actions use ConfirmDialog.
5. Deep links from Outstanding/search work (ADR-035).
6. Empty states have CTA per ADR-059.
7. Form fields use `FormField` + help tooltips where ADR-060 lists keys.

## Consequences

- **Positive:** One place for “what does paid look like?” and “what happens after save?”; accessible contrast rules in ADR-045 align with fixed tokens.
- **Negative:** Tables must be updated when new enums are added; badge proliferation requires discipline.

## Notes

- Cross-ref: ADR-028 (components), ADR-045 (a11y), ADR-060 (tooltips), ADR-070 (scope), ui-design §1b–§1d, System_Colors.md.
- **System_Colors.md** should reference this ADR for semantic usage; hex values stay in System_Colors only.
