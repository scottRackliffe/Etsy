# Ticket WS-E4 — Migrate Expenses (AP Lite) to SEMS

| Field | Value |
|-------|-------|
| Workstream | **E** — SEMS rollout, entity 3 of 5. |
| Source ADR | **ADR-079**, **ADR-042**; ADR-077 (business expenses), ADR-076 (VendorPicker), ADR-056 (GL). |
| Pattern reference | **`src/app/(app)/vendors/page.tsx`** + `src/components/sems/*`. |
| Recommended model | **Sonnet-tier** — already has a dirty boolean + Save button + list infra; mostly a structural swap + guard wiring. |
| Complexity | Medium-Large (~1,100-line page; ~25-field editor, bill payments, OCR, summary widgets). |
| Risk | Medium — preserve OCR create, bill-payment sub-CRUD, summary/upcoming widgets, GL fields. |

---

## Goal

Refactor `/expenses` (AP Lite) to the SEMS scaffold, preserving OCR create, the full expense editor, the
bill-payment AP sub-system, and the summary/upcoming widgets.

## Standard SEMS rollout rules (as in the Vendors pilot)

1. Full-width list → full-width editor (replaces list) + compact breadcrumb; Region 3 below editor.
   Remove the always-open create panel.
2. **List:** keep columns (Date, Category, Vendor, Amount, Status), keep Status + Category chips and
   search; keep pagination. Add pinned **"+ Add new expense"** first affordance + a separate **"Scan
   invoice"** button (OCR path). Trailing **Edit/Delete** row actions; double-click = edit. Single click
   selects only.
3. Editor uses **`useDirtyTracking` + `useSemsEditorGuard`** + the sticky Cancel/Save bar (move the
   current header "Save changes" button to the sticky bar; keep `data-save-button`). Replace the manual
   `editDirty` boolean with `useDirtyTracking`.
4. **3-button guard:** wire `registerSaveHandler` via `useSemsEditorGuard` (today navigation is
   **unguarded** — this adds the guard). Confirm the Save's required fields (`category`, `expense_date`)
   gate Save as today.
5. Delete: keep `ConfirmDialog`.
6. **Deep link `?expenseId=`**: open via `controllerRef.openRecord(...)` (it currently selects inline).
7. `var(--ui-*)` only; no API/schema change.

## Editor fields (preserve all ~25)

Sections to keep: **Transaction** (`expense_date`*, `due_date`, `amount`*, `currency_code`,
`payment_method`, `paid_by`), **Categorization** (`category`*, `subcategory`, `vendor_id` via
VendorPicker, `gl_account`, `is_cogs`, `is_asset`, `depreciation_years`), **Tax** (`tax_category`,
`business_use_pct`, `tax_deductible`), **Documentation** (`invoice_number`, `fiscal_quarter`,
`period_from`, `period_to`), **Recurring** (`is_recurring`, `recurring_frequency`, `recurring_next_date`,
`contract_end_date`), **Notes**. Keep `DropdownWithAddNew` option sources. `date_paid` stays driven by
the payment flow (no direct control). Don't expose `inventory_id`/`receipt_*` (out of scope).

## Immediate-commit sub-actions — keep OUTSIDE the main dirty draft (Region 3)

- **Bill payments**: the payments table + "Record payment" sub-form + delete-payment ConfirmDialog
  (`/api/expenses/[id]/payments`). These recompute `payment_status`/`date_paid` server-side and are NOT
  part of the expense Save draft. (Clean up the dead `payNotes` state, or render the notes input.)

## Keep as page-level chrome (above `SemsScreen`, list mode)

- **Summary cards** (`/api/expenses/summary`) and **Upcoming recurring** widget (`/api/expenses/upcoming`).
- The Category filter chips' **top-6-from-summary** source logic.

## OCR create path (preserve)

"Scan invoice" → `POST /api/expenses/scan` → opens the **Add-New editor pre-filled** (apply the full OCR
result incl. `subcategory`/`tax_deductible`/`is_recurring`/`recurring_frequency`, which today are
returned but not applied — apply them). Manual "Add new expense" opens a blank editor. Save → `POST /api/expenses`.

## Files

- Edit: `src/app/(app)/expenses/page.tsx` (decompose into a SEMS editor; optionally extract
  `ExpenseEditor`). Reuse `VendorPicker`, `DropdownWithAddNew`, `src/components/sems/*`, `ConfirmDialog`,
  `FilterChipRow`, `PaginationBar`, `Badge`.

## Acceptance criteria

- [ ] `/expenses` uses the SEMS scaffold; full-width list with Status/Category chips + search +
      pagination, Add-New first affordance + separate **Scan invoice** button, Edit/Delete row actions,
      double-click-to-edit.
- [ ] Full editor preserved; Save on the **sticky bar**; `useDirtyTracking` drives dirty; required-field
      gating preserved.
- [ ] Leaving a dirty editor shows the **3-button** dialog with a working Save path (new behavior).
- [ ] OCR create opens a pre-filled editor (full mapping); manual create opens blank; both save.
- [ ] Bill payments (record/delete + status recompute) preserved as Region-3 immediate actions.
- [ ] Summary cards + Upcoming recurring + dynamic category chips preserved (list chrome).
- [ ] `?expenseId=` deep link opens the editor; delete uses ConfirmDialog.
- [ ] `var(--ui-*)` only; no API/schema change; `npm run build` passes; no new lint.

## Escalation triggers (STOP and ask)

- Bill-payment status recompute can't be cleanly separated from the expense Save.
- Adding the navigation guard meaningfully changes existing OCR/quick-add UX.

## Kickoff prompt

> Implement `documents/tickets/WS-E4_sems-expenses.md`. Read it, **ADR-079**, and the **Vendors pilot**
> first; follow `.cursor/rules/implementer.mdc`. Migrate `/expenses` (AP Lite) to the SEMS scaffold:
> full-width list with existing chips/search/pagination, Add-New + separate Scan-invoice button,
> Edit/Delete row actions, double-click-to-edit; move Save to the sticky bar with `useDirtyTracking` +
> `useSemsEditorGuard`; preserve the full ~25-field editor + required-field gating, OCR create (apply the
> full OCR mapping), bill payments (record/delete + status recompute) as Region-3 actions, the summary
> cards + upcoming-recurring widgets + dynamic category chips, the `?expenseId=` deep link, and
> ConfirmDialog delete. `var(--ui-*)` only; no API/schema changes. Run `npm run build`, report changes,
> confirm each acceptance checkbox, STOP on any escalation trigger.
