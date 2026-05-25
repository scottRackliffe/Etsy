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

export function activityEntityHref(
  entityType: string | null,
  entityId: number | null
): string | null {
  if (!entityType || entityId == null) return null;
  switch (entityType) {
    case "order":
      return `/sales?orderId=${entityId}`;
    case "inventory":
      return `/inventory?itemId=${entityId}`;
    case "customer":
      return `/customers?customerId=${entityId}`;
    default:
      return null;
  }
}

export function formatActivityTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
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
