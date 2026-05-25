const ORDER_STATUSES = new Set(["active", "void", "cancelled"]);
const PAYMENT_STATUSES = new Set(["unpaid", "paid", "refunded"]);

const ORDER_STATUS_ALIASES: Record<string, string> = {
  open: "active",
  shipped: "active",
};

const PAYMENT_STATUS_ALIASES: Record<string, string> = {
  pending: "unpaid",
};

export class OrderValidationError extends Error {
  readonly fields: Record<string, string[]>;

  constructor(fields: Record<string, string[]>) {
    super("Order validation failed");
    this.name = "OrderValidationError";
    this.fields = fields;
  }
}

export class OrderShipBlockedError extends Error {
  constructor() {
    super("Order must be paid before shipping, or use shipped_without_paid_override");
    this.name = "OrderShipBlockedError";
  }
}

function normalizeEnum(
  value: unknown,
  allowed: Set<string>,
  aliases: Record<string, string>,
  fieldName: string,
  fields: Record<string, string[]>
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    fields[fieldName] = ["Must be a string"];
    return undefined;
  }
  const normalized = aliases[value.trim().toLowerCase()] ?? value.trim().toLowerCase();
  if (!allowed.has(normalized)) {
    fields[fieldName] = [`Must be one of: ${[...allowed].join(", ")}`];
    return undefined;
  }
  return normalized;
}

export function prepareOrderPayload(
  input: Record<string, unknown>,
  options: { forCreate?: boolean } = {}
): Record<string, unknown> {
  const payload = { ...input };
  const fields: Record<string, string[]> = {};

  const orderStatus = normalizeEnum(
    payload.order_status,
    ORDER_STATUSES,
    ORDER_STATUS_ALIASES,
    "order_status",
    fields
  );
  if (orderStatus !== undefined) {
    payload.order_status = orderStatus;
  } else if (options.forCreate) {
    payload.order_status = "active";
  }

  const paymentStatus = normalizeEnum(
    payload.payment_status,
    PAYMENT_STATUSES,
    PAYMENT_STATUS_ALIASES,
    "payment_status",
    fields
  );
  if (paymentStatus !== undefined) {
    payload.payment_status = paymentStatus;
  } else if (options.forCreate) {
    payload.payment_status = "unpaid";
  }

  if (Object.keys(fields).length > 0) {
    throw new OrderValidationError(fields);
  }

  return payload;
}

export type MarkOrderShippedInput = {
  shipper?: string;
  shipping_date?: string;
  seller_shipping_cost?: number;
  tracking_number?: string;
  shipped_without_paid_override?: boolean;
  force_unpaid?: boolean;
};
