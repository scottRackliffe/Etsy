# ADR-060: Contextual Help Tooltips

## Status

Accepted

## Date

2026-05-24

## Context

Fields like `condition_code`, `listing_draft_state`, and `seller_shipping_cost` have non-obvious meanings. Users currently have no in-app explanation for these fields — they must either guess or read external documentation. Contextual help tooltips provide just-in-time explanations directly in the form interface.

## Decision

### Help icon

- Small circular `?` icon (16×16px) rendered inline next to the field label
- Icon uses `--ui-muted` (#9bb0d1) color; on hover, transitions to `--ui-body` (#c7d6f2)
- Positioned immediately after the label text, with 4px left margin

### Interaction

- **Desktop:** Hover over `?` icon to show tooltip; tooltip disappears on mouse leave (300ms delay before hide to allow reading)
- **Mobile:** Tap `?` icon to toggle tooltip visibility; tap again or tap elsewhere to dismiss
- Tooltip appears above the icon by default; if insufficient space above, appears below (auto-positioning)

### Implementation

- `FormField` component (ADR-024, ADR-028) gets an optional `helpText: string` prop
- When `helpText` is provided, the `?` icon is rendered after the label
- Tooltip component: lightweight, no external library required — a positioned `<div>` with arrow, managed by local state
- Tooltip width: max 280px, text wraps naturally
- Animation: fade in 150ms on show, fade out 100ms on hide

### Tooltip definitions

| Field                           | Location         | Tooltip text                                                                                                                                |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `condition_code`                | Inventory detail | "Rate the item's physical condition using standard vintage/antique grading terms."                                                          |
| `has_condition_issue`           | Inventory detail | "Check this if the item has notable damage, wear, or defects that a buyer should know about."                                               |
| `purchase_cost`                 | Inventory detail | "What you paid to acquire this item from the vendor (not including shipping to you)."                                                       |
| `shipping_cost` (on inventory)  | Inventory detail | "Your cost to receive this item from the vendor/seller."                                                                                    |
| `sale_revenue`                  | Inventory detail | "The price the buyer paid (or will pay) for this item."                                                                                     |
| `listing_draft_state`           | Listing workshop | "Listing drafts progress through stages: draft → generated/imported → approved → published. Only approved drafts can be published to Etsy." |
| `seller_shipping_cost`          | Order detail     | "What you paid the carrier to ship this order to the buyer."                                                                                |
| `tracking_number`               | Order detail     | "The carrier tracking number for this shipment. Customers can use this to track their package."                                             |
| `order_status`                  | Order detail     | "Active = order is in progress or complete. Void = cancelled by seller. Cancelled = cancelled by buyer."                                    |
| `tax_total`                     | Order detail     | "Total sales tax collected on this order."                                                                                                  |
| `payment_status`                | Order detail     | "Whether the buyer has paid for this order. Orders must be paid before shipping (unless overridden)."                                       |
| `shipped_without_paid_override` | Order detail     | "This order was shipped before payment was confirmed. An audit record has been created."                                                    |
| `source_channel`                | Order detail     | "How this order was created: 'etsy' = synced from Etsy, 'manual' = entered by hand."                                                        |
| `category_tags`                 | Inventory detail | "Comma-separated tags for organizing inventory (e.g., 'glassware, depression era, pink')."                                                  |
| `listing_tags`                  | Listing workshop | "Search tags for Etsy. Up to 13 tags, each up to 20 characters. Choose words buyers would search for."                                      |

### Tooltip styling

- Background: `var(--ui-card-bg)` (#0f2b55)
- Text: `var(--ui-body)` (#c7d6f2)
- Border: 1px solid `var(--ui-border)` (#1a3a66)
- Border radius: 6px
- Padding: 8px 12px
- Font size: 13px (slightly smaller than form labels)
- Box shadow: `0 2px 8px rgba(0, 0, 0, 0.3)`
- Arrow: 6px CSS triangle pointing toward the `?` icon
- Z-index: above form fields but below modals (z-index: 100)

### Adding new tooltips

- Any developer can add tooltips by passing `helpText` to `FormField`
- No centralized tooltip registry — tooltips are defined inline where the field is rendered
- Keep tooltip text to 1–2 sentences maximum; link to documentation for longer explanations

## Consequences

- **Positive:** Users understand non-obvious fields without leaving the form. Reduces support questions and data entry errors. Tooltips are lightweight — no external tooltip library needed. Mobile-friendly via tap-to-toggle.
- **Negative:** Adds visual clutter (many `?` icons) if overused — should only be applied to genuinely non-obvious fields. Tooltip positioning logic adds minor complexity to `FormField`.

## Notes

- Cross-references: ADR-028 (FormField shared component — adding `helpText` prop), ADR-024 (frontend component architecture — FormField spec), ADR-045 (accessibility — tooltips must be keyboard-accessible via focus on the `?` icon, with `aria-describedby` linking the tooltip to the field)
- Tooltips are not shown for fields that are self-explanatory (e.g., `first_name`, `email`, `phone`)
- The `?` icon should use `role="img"` with `aria-label="Help"` and the tooltip should have `role="tooltip"` for screen readers
- Future enhancement: tooltips could link to the Tutorial & Tips tab for deeper explanations
