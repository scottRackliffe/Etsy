import { logActivity } from "@/lib/activity-log";
import { OrderShipBlockedError } from "@/lib/order-validation";
import { prepareInventoryPayload } from "@/lib/inventory-validation";
import { getDb } from "@/lib/sqlite";
import {
  deleteCustomer,
  deleteInventory,
  getOrder,
  markOrderPaid,
  markOrderShipped,
} from "@/lib/records";

export type BatchResult = {
  succeeded: number;
  failed: Array<{ id: number; reason: string }>;
  total: number;
};

const MAX_BATCH = 100;

function normalizeIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  return [
    ...new Set(
      ids.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0)
    ),
  ];
}

export function batchOrders(
  action: string,
  ids: unknown,
  params: Record<string, unknown> = {}
): BatchResult {
  const idList = normalizeIds(ids);
  if (idList.length > MAX_BATCH) {
    throw new Error("BATCH_TOO_LARGE");
  }
  const failed: BatchResult["failed"] = [];
  let succeeded = 0;

  for (const id of idList) {
    try {
      if (action === "mark_paid") {
        const order = getOrder(id) as Record<string, unknown> | null;
        if (!order) {
          failed.push({ id, reason: "Order not found" });
          continue;
        }
        if (Number(order.was_paid) === 1) continue;
        markOrderPaid(id);
        succeeded += 1;
      } else if (action === "mark_shipped") {
        const order = getOrder(id) as Record<string, unknown> | null;
        if (!order) {
          failed.push({ id, reason: "Order not found" });
          continue;
        }
        if (order.shipping_date) continue;
        const shipper = typeof params.shipper === "string" ? params.shipper : "USPS";
        const shippingDate =
          typeof params.shipping_date === "string"
            ? params.shipping_date
            : new Date().toISOString().slice(0, 10);
        markOrderShipped(id, {
          shipper,
          shipping_date: shippingDate,
          tracking_number:
            typeof params.tracking_number === "string" ? params.tracking_number : undefined,
          shipped_without_paid_override: params.shipped_without_paid_override === true,
          force_unpaid: params.shipped_without_paid_override === true,
        });
        succeeded += 1;
      } else if (action === "void") {
        const db = getDb();
        const result = db
          .prepare(
            "UPDATE orders SET order_status = 'void', updated_at = ? WHERE id = ? AND order_status = 'active'"
          )
          .run(new Date().toISOString(), id);
        if (result.changes === 0) {
          failed.push({ id, reason: "Order not found or already void/cancelled" });
        } else {
          succeeded += 1;
        }
      } else {
        throw new Error("INVALID_ACTION");
      }
    } catch (err) {
      if (err instanceof OrderShipBlockedError) {
        failed.push({
          id,
          reason: "Order is not paid; use shipped_without_paid_override to ship anyway",
        });
      } else {
        failed.push({ id, reason: err instanceof Error ? err.message : "Operation failed" });
      }
    }
  }

  if (succeeded > 0 || failed.length > 0) {
    logActivity({
      action: `order.batch_${action}`,
      entityType: "order",
      entityLabel: `Batch: ${idList.length} orders`,
      detail: { ids: idList, succeeded, failed, params },
      source: "user",
    });
  }

  return { succeeded, failed, total: idList.length };
}

export function batchInventory(
  action: string,
  ids: unknown,
  params: Record<string, unknown> = {}
): BatchResult {
  const idList = normalizeIds(ids);
  if (idList.length > MAX_BATCH) throw new Error("BATCH_TOO_LARGE");
  const failed: BatchResult["failed"] = [];
  let succeeded = 0;
  const db = getDb();

  for (const id of idList) {
    try {
      if (action === "change_status") {
        const status = typeof params.status === "string" ? params.status : "";
        prepareInventoryPayload({ status });
        const result = db
          .prepare("UPDATE inventory SET status = ?, updated_at = ? WHERE id = ?")
          .run(status, new Date().toISOString(), id);
        if (result.changes === 0) failed.push({ id, reason: "Item not found" });
        else succeeded += 1;
      } else if (action === "delete") {
        const linked = db
          .prepare("SELECT COUNT(*) AS c FROM order_items WHERE inventory_id = ?")
          .get(id) as { c: number };
        if (linked.c > 0) {
          failed.push({ id, reason: "Item has associated orders and cannot be deleted" });
          continue;
        }
        if (deleteInventory(id)) succeeded += 1;
        else failed.push({ id, reason: "Item not found" });
      } else {
        throw new Error("INVALID_ACTION");
      }
    } catch (err) {
      failed.push({ id, reason: err instanceof Error ? err.message : "Operation failed" });
    }
  }

  if (succeeded > 0 || failed.length > 0) {
    logActivity({
      action: `inventory.batch_${action}`,
      entityType: "inventory",
      entityLabel: `Batch: ${idList.length} items`,
      detail: { ids: idList, succeeded, failed, params },
      source: "user",
    });
  }

  return { succeeded, failed, total: idList.length };
}

export function batchCustomers(action: string, ids: unknown): BatchResult {
  const idList = normalizeIds(ids);
  if (idList.length > MAX_BATCH) throw new Error("BATCH_TOO_LARGE");
  const failed: BatchResult["failed"] = [];
  let succeeded = 0;
  const db = getDb();

  for (const id of idList) {
    try {
      if (action !== "delete") throw new Error("INVALID_ACTION");
      const linked = db
        .prepare("SELECT COUNT(*) AS c FROM orders WHERE customer_id = ?")
        .get(id) as { c: number };
      if (linked.c > 0) {
        failed.push({ id, reason: "Customer has existing orders and cannot be deleted" });
        continue;
      }
      if (deleteCustomer(id)) succeeded += 1;
      else failed.push({ id, reason: "Customer not found" });
    } catch (err) {
      failed.push({ id, reason: err instanceof Error ? err.message : "Operation failed" });
    }
  }

  if (succeeded > 0 || failed.length > 0) {
    logActivity({
      action: "customer.batch_delete",
      entityType: "customer",
      entityLabel: `Batch: ${idList.length} customers`,
      detail: { ids: idList, succeeded, failed },
      source: "user",
    });
  }

  return { succeeded, failed, total: idList.length };
}
