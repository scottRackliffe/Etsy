# ADR-062: Inline editing on list views

## Status

Accepted

## Date

2026-05-24

## Context

Every edit currently requires opening a detail panel, changing a field, and saving. For quick single-field changes (status, price, payment flag), this workflow is unnecessarily slow. Inline editing lets the user change a value directly in the list row without leaving the table.

## Decision

### Editable cell mechanism

- `DataTable` column definitions gain an optional `editable: true` property.
- When a user clicks an editable cell the cell transforms into the appropriate input control:
  - `SelectInput` for enum columns (e.g. inventory `status`, order `shipper`).
  - Number input (`<input type="number" step="0.01">`) for currency/numeric columns (e.g. `sale_revenue`).
  - Toggle/checkbox for boolean-like columns (e.g. `was_paid`).
- Non-editable cells retain existing behavior: click selects the row.

### Save / cancel

- **Enter** or **blur** commits the change via a `PATCH` request to the entity's API endpoint.
- **Escape** cancels and reverts the cell to its display state.
- While the PATCH is in flight the cell shows a small inline spinner (no full-row loader).
- On **success**: cell updates in place and briefly flashes green (`var(--ui-green)`, 400 ms fade) to confirm.
- On **failure**: cell reverts to the original value and an error toast is shown with the API `user_message`.

### Editable columns per page

| Page      | Column         | Input type                                                                 | API endpoint                                                 |
| --------- | -------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Inventory | `status`       | SelectInput (`Draft`, `In stock`, `Listed`, `Sold`, `Reserved`, `Retired`) | `PATCH /api/inventory/[id]`                                  |
| Inventory | `sale_revenue` | Number input                                                               | `PATCH /api/inventory/[id]`                                  |
| Sales     | `was_paid`     | Toggle                                                                     | `PATCH /api/orders/[id]` (sets `payment_status` accordingly) |
| Sales     | `shipper`      | SelectInput (`USPS`, `UPS`, `FedEx`, `DHL`, `Other`)                       | `PATCH /api/orders/[id]`                                     |
| Customers | (none)         | —                                                                          | —                                                            |

### Visual affordance

- Editable cells show a subtle pencil icon on hover (8 px, `var(--ui-muted)` opacity 0.5, right-aligned inside the cell).
- The pencil icon disappears when the cell enters edit mode.

### Keyboard navigation

- **Tab** from an active editable cell moves focus to the next editable cell in the same row (wraps to next row if at end).
- **Shift+Tab** moves backwards.
- If the cell value changed on Tab-out, it is committed (same as blur).

### Validation

- All validation rules from ADR-021 still apply. The PATCH request body contains only the single changed field; the server validates as usual.
- If the server returns 409 (concurrent edit per ADR-046), the cell reverts and a toast reads: "This record was modified by another process. Reload to see the latest version."

## Consequences

- **Positive:** Dramatically faster for common quick-edit tasks; fewer panel open/close cycles; keyboard-friendly workflow.
- **Negative:** Adds complexity to DataTable; risk of accidental edits (mitigated by requiring explicit Enter/blur to commit and Escape to cancel); not suitable for multi-field edits.

## Notes

- Cross-ref: ADR-028 (DataTable shared component), ADR-046 (concurrent edit detection).
- The `was_paid` toggle on Sales sets `payment_status = 'paid'` or `'unpaid'` and updates `was_paid` accordingly in a single PATCH.
- Inline editing does NOT replace the detail panel — it supplements it for single-field changes.
