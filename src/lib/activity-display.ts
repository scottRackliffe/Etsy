export type ActivityItem = {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  entity_label: string | null;
  detail: Record<string, unknown> | null;
  source: string;
  created_at: string;
};

export function formatActivityAction(action: string): string {
  return action
    .replace(/\./g, " · ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Actions that remove a record. Their rows must NOT link, because the target no
 * longer exists (ADR-037 §A3 "deleted = no link").
 */
const REMOVAL_ACTIONS = new Set<string>([
  "inventory.deleted",
  "customer.deleted",
  "customer.batch_deleted",
  "address.deleted",
  "receipt.deleted",
  "vendor.deleted",
  "expense.deleted",
  "tax_payment.deleted",
]);

/**
 * Resolve a deep-link back to the record an activity row acted on (ADR-037 §A3,
 * ADR-035). Returns null for entity types with no per-record target (config,
 * sync, backup, system, report) and for rows whose action deleted the record.
 */
export function activityEntityHref(
  entityType: string | null,
  entityId: number | null,
  action?: string | null
): string | null {
  if (!entityType || entityId == null) return null;
  if (action && REMOVAL_ACTIONS.has(action)) return null;
  switch (entityType) {
    case "order":
      return `/orders?orderId=${entityId}`;
    case "shipping":
      return `/shipping?orderId=${entityId}`;
    case "inventory":
      return `/inventory?itemId=${entityId}`;
    case "customer":
      return `/customers?customerId=${entityId}`;
    case "receipt":
      return `/receipts?receiptId=${entityId}`;
    case "vendor":
      return `/vendors?vendorId=${entityId}`;
    case "expense":
      return `/expenses?expenseId=${entityId}`;
    case "tax_payment":
      return `/expenses?taxPaymentId=${entityId}`;
    default:
      return null;
  }
}

export function formatRelativeTime(iso: string): string {
  try {
    const now = Date.now();
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return iso;
    const diffMs = now - then;
    if (diffMs < 0) return "just now";

    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return "just now";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatActivityTimestamp(iso: string): string {
  return formatRelativeTime(iso);
}

export function formatActivityDetail(detail: Record<string, unknown> | null): string | null {
  if (!detail || Object.keys(detail).length === 0) return null;
  const parts: string[] = [];
  if (typeof detail.shipper === "string") parts.push(`Shipper: ${detail.shipper}`);
  if (typeof detail.tracking_number === "string") parts.push(`Tracking: ${detail.tracking_number}`);
  if (typeof detail.count === "number") parts.push(`Count: ${detail.count}`);
  if (Array.isArray(detail.changed_fields)) {
    parts.push(`Changed: ${(detail.changed_fields as string[]).join(", ")}`);
  }
  if (parts.length > 0) return parts.join(" · ");
  try {
    const raw = JSON.stringify(detail);
    return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
  } catch {
    return null;
  }
}
