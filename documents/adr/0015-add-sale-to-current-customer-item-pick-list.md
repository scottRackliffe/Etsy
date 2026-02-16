# ADR-015: Add sale to current customer — item pick list (picture icon + name, scroll or filter)

## Status

Accepted

## Date

2025-02-15

## Context

Users need to record multiple sales for the same customer (e.g. in-person or non-Etsy sales). When adding a sale, they must choose which inventory item was sold. A long list of items by name alone is hard to scan; users recognize items by sight and by name. We need a way to select the item that supports both browsing (scroll) and quick narrowing (type to filter).

## Decision

- **Allow the user to add another sale to the current customer.** From the Customers tab (with a customer selected) or from Sales, the user can record a sale for that customer. They can record **multiple sales** for the same customer in sequence (add sale → choose item → save → add another sale for same customer if needed).

- **Item sold is chosen from a pick list** that shows:
  - A **picture icon** (thumbnail) of the item — **created when the item is entered** (when the user adds the inventory item or adds its first picture). We do not generate the icon on demand when the pick list is shown; we create and store it at item entry time.
  - The **item name** (and optionally item number or short description)
  Each row in the list is selectable (one item = one sale line when recording a sale).

- **Selection methods:**
  - **Scroll** — User scrolls through the list of items (picture icon + name) and selects one.
  - **Type to filter** — User can enter the item name (or part of it); the list **narrows** to matching items, still showing picture icon and name. As they type, the possibilities decrease so they can quickly find and select the right item.

- **Scope:** This applies when recording a manual sale (new order or “add sale for this customer”). The same pick list pattern can be used wherever the app needs “choose an inventory item” (e.g. link order to item, mark item sold).

## Consequences

- **Positive**
  - Users can record multiple sales for the current customer without re-selecting the customer each time.
  - Picture icon + name makes it easy to identify items; typing to filter speeds up selection when there are many items.
- **Negative**
  - Implementation must create and store the picture icon when the item is entered, and support a filterable pick list (by name).

## Notes

- **Picture icon created at item entry:** When the user enters (creates) an inventory item or adds its first picture, the app **creates the picture icon** (thumbnail) at that time and stores it (e.g. alongside the item or in a thumbnails store). The pick list then uses this pre-created icon. If an item has no picture yet, show a placeholder icon with the name. See ADR-002 (inventory pictures), ADR-010 (picture import).
- Filter: match item name (and optionally item number) against the typed text; case-insensitive substring is sufficient for v1.
