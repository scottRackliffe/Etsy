# Schema reconciliation — ADR-017 canonical model

**Last updated:** 2026-05-24  
**Status:** Reconciliation **complete in documentation**. [ADR-017](../adr/0017-database-schema.md) §8 DDL is the **sole schema SSOT**. Code (`src/lib/sqlite.ts`, `migrations/`) must converge to ADR-017; do not change ADR-017 to match incomplete bootstrap.

---

## Governing rule

**Documentation is canonical; code follows documentation.**

This file is a **reconciliation history + code compliance checklist**, not an alternate schema spec. For table/column definitions, use ADR-017 only.

---

## Canonical model (current)

Customer **sales** use three tables:

| Role         | Table         | Notes                                                                                                      |
| ------------ | ------------- | ---------------------------------------------------------------------------------------------------------- |
| Order header | `orders`      | Ship-to snapshot, `was_paid`, `order_status`, `shipper`, `seller_shipping_cost`, `etsy_receipt_id`, totals |
| Line items   | `order_items` | `inventory_id`, `quantity`, `unit_price`, `line_total`                                                     |
| Vendor buys  | `purchases`   | Sourcing only — **not** customer sales                                                                     |

Customers: `customers` (flat billing address + `default_address_id`, `currency_code`, `is_active`) and `addresses` (ship-to rows: `first_line`, `second_line`, `state`, …).

Other costs: `other_costs` (`cost_type`, `note`) — not `inventory_other_cost`.

Legacy ADR-017 “single `purchase` table per sale line” was **superseded** in the 2026-05-24 ADR-017 revision. See ADR-003, ADR-019 mapping notes.

---

## Historical note (pre-2026-05-24)

Early drafts described a single `purchase` table and a separate `customer_address` table. Implementation moved to `orders` + `order_items` + `addresses` before ADR-017 was fully rewritten. **Option B** (update ADR-017 to the three-table model) was adopted and is reflected in ADR-017 §8 today.

Migration [`migrations/002_schema_reconciliation.sql`](../../migrations/002_schema_reconciliation.sql) adds order/customer columns that were missing from the first bootstrap. It does **not** replace the three-table design.

---

## Name mapping (legacy doc terms → ADR-017 / implementation)

| Legacy term                               | Canonical                     |
| ----------------------------------------- | ----------------------------- |
| `customer`                                | `customers`                   |
| `customer_address`                        | `addresses`                   |
| `address_line_1` / `address_line_2`       | `first_line` / `second_line`  |
| `state_province`                          | `state`                       |
| Customer sale “purchase” / `purchase` row | `orders` + `order_items`      |
| `purchase.date_of_purchase`               | `orders.order_date`           |
| `purchase.shipping_cost` (seller)         | `orders.seller_shipping_cost` |
| `purchase.discount_amount`                | `orders.discount_total`       |
| `inventory_other_cost`                    | `other_costs`                 |

---

## Code compliance checklist (ADR-017 vs bootstrap)

Track gaps in [no-developer-questions-build.md](../no-developer-questions-build.md) §6 and [DOC_COMPLIANCE_AUDIT.md](../DOC_COMPLIANCE_AUDIT.md) (Phase 2 complete 2026-05-24). **Do not remove spec** until code implements it.

| ADR-017 requirement                                                                                     | Expected in code                            | Status (2026-05-24)                              |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| Three-table sales model                                                                                 | `orders`, `order_items`, vendor `purchases` | **Implemented** in `sqlite.ts` bootstrap         |
| Order ship-to snapshot, `was_paid`, `shipper`, `seller_shipping_cost`, `etsy_receipt_id`, override flag | `orders` columns                            | **Implemented** (002 migration + bootstrap)      |
| `customers.default_address_id`, `currency_code`, `is_active`                                            | `customers` columns                         | **Implemented**                                  |
| `other_costs` table                                                                                     | `other_costs`                               | **Implemented**                                  |
| `orders.tracking_number`                                                                                | Column on `orders`                          | **Spec in ADR-017; bootstrap/migration pending** |
| `activity_log` table                                                                                    | Full table + indexes                        | **Spec in ADR-017; bootstrap/migration pending** |
| `customer_notes` table                                                                                  | Full table + indexes                        | **Spec in ADR-017; bootstrap/migration pending** |
| `orders.source_channel`                                                                                 | `etsy` \| `manual`                          | **Implemented** in bootstrap                     |
| Listing `listing_*` columns on `inventory`                                                              | All ADR-023 fields                          | **Implemented** in `sqlite.ts`                   |
| `etsy_receipts`, `report_artifacts`, listing workflow tables                                            | Per ADR-017 §8                              | **Implemented** in bootstrap                     |

When implementing schema changes: add `migrations/00N_*.sql`, update `sqlite.ts` bootstrap for fresh installs, and re-run compliance audit.

---

## For implementers

1. Read **ADR-017 §1–§8** for every column and constraint.
2. Use this file only for **legacy name mapping** and **open code gaps**.
3. After code catches up, mark rows **Implemented** in the checklist above and in the build doc §5 table.

---

_Archived narrative: the table-by-table “missing ship_to” comparison from February 2026 is obsolete and was removed to avoid contradicting ADR-017._
