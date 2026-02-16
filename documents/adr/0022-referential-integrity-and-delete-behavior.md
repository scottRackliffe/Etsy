# ADR-022: Referential integrity and delete behavior (no ambiguity)

## Status

Accepted

## Date

2025-02-15

## Context

When the user deletes a customer, an inventory item, an address, or another entity, we must define exactly what happens: whether the delete is allowed, whether related rows are deleted or updated, and what error the user sees. No ambiguity for implementers.

## Decision

The following rules apply. “Restrict” means the delete is rejected with an HTTP 409 (Conflict) or 400 and a clear message. “Cascade” means related rows are deleted (or updated) as part of the operation. “Snapshot” means the purchase (or other row) keeps a copy of data at time of sale; we do not change that snapshot when the source is deleted.

---

### 1. Delete customer

**Rule:** **Restrict** delete if the customer has at least one row in `purchase` (i.e. any purchase.customer_id = this customer.id).

**Reason:** Purchases hold a snapshot of ship-to name and address (ADR-003) but are linked by customer_id for “purchases by customer” and reports. We do not cascade delete purchases (audit trail). We do not allow deleting a customer who has purchases because that would orphan purchase rows or require nulling customer_id, which would break reports and thank-you/invoice.

**Behavior:** When the user requests DELETE /api/customers/[id]: (1) If no rows in purchase with that customer_id, delete the customer and all their customer_address rows; return 204. (2) If any purchase row exists with that customer_id, return 409 with body e.g. { "error": "Cannot delete customer who has orders. Retire or archive the customer instead, or remove orders first." }. Do not delete the customer.

**Optional future:** “Retire” or “archive” customer (soft delete) is out of scope for this ADR; if added, it is a separate flag and does not remove the customer row.

---

### 2. Delete inventory item

**Rule:** **Restrict** delete if the inventory item is referenced by at least one row in `purchase` (i.e. any purchase.inventory_id = this inventory.id).

**Reason:** Purchase rows reference inventory_id for “item purchased” and for reports (sale revenue, description). We do not cascade delete purchases. We do not allow nulling inventory_id on purchase (schema requires NOT NULL per ADR-017).

**Behavior:** When the user requests DELETE /api/inventory/[id] (or “Delete” with confirmation): (1) If no rows in purchase with that inventory_id, delete the inventory row and all rows in inventory_other_cost for that inventory_id; return 204. (2) If any purchase row exists, return 409 with body e.g. { "error": "Cannot delete item that has been sold. Retire the item instead." }. Do not delete the inventory row.

**Retire:** If the UI supports “Retire” (status = Retired) as distinct from “Delete,” then Retire is always allowed (PATCH status to Retired). Delete remains restricted as above.

---

### 3. Delete customer address

**Rule:** **Allow** delete even if the address was used in one or more purchases.

**Reason:** The purchase row holds a snapshot of ship-to address (ship*to*\* columns); it does not reference customer_address_id for display of past orders. customer_address_id on purchase is optional and for “which address was picked” only (ADR-003). So deleting an address does not alter past purchase data. We allow delete; optionally set purchase.customer_address_id to NULL for any purchase that pointed to this address (so we don’t have a dangling FK). **Decision:** On delete of customer_address, set purchase.customer_address_id = NULL for all purchase rows where customer_address_id = this id. Then delete the address row. Return 204.

**Behavior:** DELETE /api/addresses/[id]: (1) UPDATE purchase SET customer_address_id = NULL WHERE customer_address_id = [id]. (2) DELETE FROM customer_address WHERE id = [id]. Return 204. 404 if address not found.

---

### 4. Delete inventory other cost

**Rule:** **Allow** delete. No purchase or other table references inventory_other_cost by id. Simple delete.

**Behavior:** DELETE /api/other-costs/[id]: delete the row; return 204. 404 if not found.

---

### 5. Delete purchase (order); void and cancel

## **Rule:** We **do not** support deleting purchase rows. Void and cancel are implemented via order_status only (no row delete). (ADR-018: “No DELETE for purchases”). Corrections are done via PATCH (e.g. fix date, shipper, or notes). **Void and cancel (in scope):** Use order_status = 'void' or 'cancelled' on all purchase rows with that order_id (status change only; no row delete). Schema: ADR-017. Exclusion from reports and outstanding list: ADR-013 (global report filter), ADR-020 (outstanding filter). Full behavior index: design-decisions-implementation §4.

### 6. Summary table

| Entity               | Delete allowed? | Condition                                                                 | If restricted: response |
| -------------------- | --------------- | ------------------------------------------------------------------------- | ----------------------- |
| customer             | Yes             | Only if no purchase rows reference this customer_id                       | 409, message            |
| inventory            | Yes             | Only if no purchase rows reference this inventory_id                      | 409, message            |
| customer_address     | Yes             | Always; first null customer_address_id on purchase rows that reference it | 204                     |
| inventory_other_cost | Yes             | Always                                                                    | 204                     |
| purchase             | No              | —                                                                         | No endpoint             |

---

## Consequences

- **Positive:** Clear, unambiguous delete behavior; no accidental data loss; audit trail preserved.
- **Negative:** User cannot “delete” a customer or item that has orders; they must be told to retire or keep the record.

## Notes

- 409 Conflict is the standard HTTP code for “operation cannot be performed because of state of the resource.” Message body must be human-readable so the UI can display it.
- “Retire” for inventory: set status = Retired; item remains in DB and in reports but can be filtered out of “active” lists and pick lists (Retired items are excluded from the add-sale pick list per ADR-015).
