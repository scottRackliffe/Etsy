import { listCustomers, listInventory, listOrders } from "@/lib/records";

const MAX_BATCH = 100;

export type OrderBatchFilter = {
  search?: string;
  payment_status?: string;
  shipping_status?: string;
  source_channel?: string;
};

export type InventoryBatchFilter = {
  search?: string;
  status?: string;
};

export type CustomerBatchFilter = {
  search?: string;
  is_active?: number;
};

function capIds(ids: number[], total: number): number[] {
  if (total > MAX_BATCH) {
    throw new Error("BATCH_TOO_LARGE");
  }
  return ids;
}

export function resolveOrderIds(filter: OrderBatchFilter): number[] {
  const shipping_status =
    filter.shipping_status === "shipped" || filter.shipping_status === "not_shipped"
      ? filter.shipping_status
      : undefined;
  const { items, total } = listOrders({
    limit: MAX_BATCH + 1,
    offset: 0,
    search: filter.search,
    payment_status: filter.payment_status,
    shipping_status,
    source_channel: filter.source_channel,
  });
  return capIds(
    items.map((row) => Number((row as { id: number }).id)),
    total
  );
}

export function resolveInventoryIds(filter: InventoryBatchFilter): number[] {
  const { items, total } = listInventory({
    limit: MAX_BATCH + 1,
    offset: 0,
    search: filter.search,
    status: filter.status,
  });
  return capIds(
    items.map((row) => Number((row as { id: number }).id)),
    total
  );
}

export function resolveCustomerIds(filter: CustomerBatchFilter): number[] {
  const { items, total } = listCustomers({
    limit: MAX_BATCH + 1,
    offset: 0,
    search: filter.search,
    is_active: filter.is_active,
  });
  return capIds(
    items.map((row) => Number((row as { id: number }).id)),
    total
  );
}

export function resolveBatchIds(
  entity: "orders" | "inventory" | "customers",
  ids: unknown,
  filter: unknown
): number[] {
  if (Array.isArray(ids) && ids.length > 0) {
    return [...new Set(ids.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0))];
  }
  if (filter && typeof filter === "object") {
    const f = filter as Record<string, unknown>;
    if (entity === "orders") {
      return resolveOrderIds({
        search: typeof f.search === "string" ? f.search : undefined,
        payment_status: typeof f.payment_status === "string" ? f.payment_status : undefined,
        shipping_status: typeof f.shipping_status === "string" ? f.shipping_status : undefined,
        source_channel: typeof f.source_channel === "string" ? f.source_channel : undefined,
      });
    }
    if (entity === "inventory") {
      return resolveInventoryIds({
        search: typeof f.search === "string" ? f.search : undefined,
        status: typeof f.status === "string" ? f.status : undefined,
      });
    }
    return resolveCustomerIds({
      search: typeof f.search === "string" ? f.search : undefined,
      is_active: typeof f.is_active === "number" ? f.is_active : undefined,
    });
  }
  return [];
}
