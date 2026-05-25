import { getDb } from "@/lib/sqlite";
import { logActivity } from "@/lib/activity-log";
import { getCustomer } from "@/lib/records";
import { ApiRouteError } from "@/lib/api-error";

export const MERGE_CUSTOMER_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "notes",
  "address_1",
  "address_2",
  "city",
  "state",
  "postal_code",
  "country",
] as const;

export type MergeCustomerField = (typeof MERGE_CUSTOMER_FIELDS)[number];

export function mergeCustomers(input: {
  primaryId: number;
  secondaryId: number;
  fieldOverrides?: Partial<Record<MergeCustomerField, string | null>>;
}): { merged_customer_id: number; orders_moved: number; addresses_moved: number } {
  if (input.primaryId === input.secondaryId) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "primary_id equals secondary_id",
      userMessage: "Choose two different customers to merge.",
      actions: ["Select a different secondary customer."],
      fields: { secondary_id: ["Must differ from primary customer"] },
      canRetry: false,
    });
  }

  const primary = getCustomer(input.primaryId) as Record<string, unknown> | undefined;
  const secondary = getCustomer(input.secondaryId) as Record<string, unknown> | undefined;

  if (!primary) {
    throw new ApiRouteError({
      status: 404,
      code: "NOT_FOUND",
      message: "Primary customer not found",
      userMessage: "The primary customer was not found.",
      actions: ["Refresh the customer list and try again."],
      canRetry: false,
    });
  }

  if (!secondary) {
    throw new ApiRouteError({
      status: 409,
      code: "CONFLICT_STALE_RECORD",
      message: "Secondary customer not found",
      userMessage: "The secondary customer was already deleted or could not be found.",
      actions: ["Refresh the customer list and try again."],
      canRetry: false,
    });
  }

  const db = getDb();
  const secondaryName = [secondary.first_name, secondary.last_name].filter(Boolean).join(" ") || `Customer ${input.secondaryId}`;

  const run = db.transaction(() => {
    const ordersMoved = (
      db
        .prepare("UPDATE orders SET customer_id = ?, updated_at = ? WHERE customer_id = ?")
        .run(input.primaryId, new Date().toISOString(), input.secondaryId)
    ).changes;

    const primaryHasDefault = db
      .prepare("SELECT 1 FROM addresses WHERE customer_id = ? AND is_default = 1 LIMIT 1")
      .get(input.primaryId);
    if (primaryHasDefault) {
      db.prepare("UPDATE addresses SET is_default = 0, updated_at = ? WHERE customer_id = ? AND is_default = 1").run(
        new Date().toISOString(),
        input.secondaryId
      );
    }

    const addressesMoved = (
      db
        .prepare("UPDATE addresses SET customer_id = ?, updated_at = ? WHERE customer_id = ?")
        .run(input.primaryId, new Date().toISOString(), input.secondaryId)
    ).changes;

    db.prepare("UPDATE customer_notes SET customer_id = ? WHERE customer_id = ?").run(
      input.primaryId,
      input.secondaryId
    );

    const overrides = input.fieldOverrides ?? {};
    const keys = Object.keys(overrides).filter((k) =>
      MERGE_CUSTOMER_FIELDS.includes(k as MergeCustomerField)
    );
    if (keys.length > 0) {
      const sets = keys.map((k) => `${k} = @${k}`).join(", ");
      const params: Record<string, unknown> = { id: input.primaryId, updated_at: new Date().toISOString() };
      for (const key of keys) {
        params[key] = overrides[key as MergeCustomerField] ?? null;
      }
      db.prepare(`UPDATE customers SET ${sets}, updated_at = @updated_at WHERE id = @id`).run(params);
    }

    const deleted = db.prepare("DELETE FROM customers WHERE id = ?").run(input.secondaryId).changes;
    if (deleted === 0) {
      throw new ApiRouteError({
        status: 409,
        code: "CONFLICT_STALE_RECORD",
        message: "Secondary customer delete failed",
        userMessage: "The secondary customer could not be deleted.",
        actions: ["Refresh and try again."],
        canRetry: true,
      });
    }

    return { ordersMoved, addressesMoved };
  });

  const { ordersMoved, addressesMoved } = run();

  logActivity({
    action: "customer.merged",
    entityType: "customer",
    entityId: input.primaryId,
    entityLabel: [primary.first_name, primary.last_name].filter(Boolean).join(" ") || `Customer ${input.primaryId}`,
    detail: {
      secondary_id: input.secondaryId,
      secondary_name: secondaryName,
      orders_moved: ordersMoved,
      addresses_moved: addressesMoved,
    },
    source: "user",
  });

  return {
    merged_customer_id: input.primaryId,
    orders_moved: ordersMoved,
    addresses_moved: addressesMoved,
  };
}
