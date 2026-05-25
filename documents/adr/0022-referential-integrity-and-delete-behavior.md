# ADR-022: Referential integrity and delete behavior (no ambiguity)

## Status

Accepted

## Date

2025-02-15 (implementation aligned 2026-05-24)

## Context

When the user deletes a customer, an inventory item, an address, or another entity, we must define exactly what happens: whether the delete is allowed, whether related rows are deleted or updated, and what error the user sees. No ambiguity for implementers.

## Decision

> **Implementation (2026-05-24):** Customer sales = `orders` + `order_items`; ship-to snapshot on `orders`; vendor buys = `purchases` only. Canonical tables: ADR-017.

The following rules apply. “Restrict” means the delete is rejected with HTTP 409 (Conflict) or 400 with a clear message. “Cascade” means related rows are deleted as part of the operation. Orders keep ship-to snapshot fields even if source customer/address changes.

---

### 1. Delete customer

**Rule:** **Restrict** delete if the customer has at least one row in `orders` (`orders.customer_id = this customer.id`).

**Behavior:** `DELETE /api/customers/[id]`: (1) If no orders reference this customer, delete the customer (and cascade `addresses`, `customer_notes` per FK). Return 204. (2) If any order exists, return 409: “Cannot delete customer who has orders.”

---

### 2. Delete inventory item

**Rule:** **Restrict** delete if any `order_items.inventory_id` references this inventory.

**Behavior:** `DELETE /api/inventory/[id]` (or retire): (1) If no `order_items`, delete inventory and cascade `other_costs`. Return 204. (2) If referenced, return 409: “Cannot delete item that has been sold. Retire the item instead.”

**Retire:** `PATCH` status to `Retired` is always allowed.

---

### 3. Delete customer address (`addresses`)

**Rule:** **Allow** delete even if the address was used when creating past orders.

**Reason:** Ship-to on `orders` is a snapshot; orders do not require the address row for display. v1 does not use `customer_address_id` on orders.

**Behavior:** `DELETE /api/addresses/[id]`: delete the row; return 204. If `customers.default_address_id` pointed here, clear it (optional). 404 if not found.

---

### 4. Delete inventory other cost (`other_costs`)

**Rule:** **Allow** delete. No other table references `other_costs.id` by FK for sales data.

**Behavior:** `DELETE /api/other-costs/[id]`: delete row; return 204.

---

### 5. Delete order; void and cancel

**Rule:** **No DELETE** for `orders` or `order_items`. Void/cancel via `orders.order_status` only (`void` | `cancelled`). Corrections via `PATCH /api/orders/[id]`. Excluded from reports (ADR-013) and outstanding (ADR-020).

---

### 6. Summary table

| Entity           | Delete allowed? | Condition                                      | If restricted |
| ---------------- | --------------- | ---------------------------------------------- | ------------- |
| customers        | Yes             | Only if no `orders` reference `customer_id`    | 409           |
| inventory        | Yes             | Only if no `order_items` reference `inventory_id` | 409       |
| addresses        | Yes             | Always (snapshot on orders unchanged)          | 204           |
| other_costs      | Yes             | Always                                         | 204           |
| orders           | No              | —                                              | No endpoint   |
| order_items      | No              | —                                              | No endpoint   |

---

## Consequences

- **Positive:** Clear, unambiguous delete behavior; audit trail preserved.
- **Negative:** User cannot delete a customer or item that has orders; use retire or keep the record.

## Notes

- 409 Conflict for “operation cannot be performed because of state of the resource.”
- “Retire” for inventory: `status = Retired`; excluded from active pick lists (ADR-015).

### Schema mapping (updated 2026-05-24)

| ADR-022 term | Implementation |
|-------------|----------------|
| purchase row | `orders` + `order_items` |
| purchase.customer_id | `orders.customer_id` |
| purchase.inventory_id | `order_items.inventory_id` |
| customer_address | `addresses` |
| inventory_other_cost | `other_costs` |
