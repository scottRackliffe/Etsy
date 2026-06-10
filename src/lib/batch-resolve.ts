import { listCustomers, listInventory, listOrders } from "@/lib/records";

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

const CHUNK_SIZE = 100;

export function resolveOrderIds(filter: OrderBatchFilter): number[] {
  const shipping_status =
    filter.shipping_status === "shipped" || filter.shipping_status === "not_shipped"
      ? filter.shipping_status
      : undefined;

  const allIds: number[] = [];
  let offset = 0;
  const pageSize = CHUNK_SIZE;

  while (true) {
    const { items } = listOrders({
      limit: pageSize,
      offset,
      search: filter.search,
      payment_status: filter.payment_status,
      shipping_status,
      source_channel: filter.source_channel,
    });
    if (items.length === 0) break;
    for (const row of items) {
      allIds.push(Number((row as { id: number }).id));
    }
    if (items.length < pageSize) break;
    offset += pageSize;
  }

  return allIds;
}

export function resolveInventoryIds(filter: InventoryBatchFilter): number[] {
  const allIds: number[] = [];
  let offset = 0;
  const pageSize = CHUNK_SIZE;

  while (true) {
    const { items } = listInventory({
      limit: pageSize,
      offset,
      search: filter.search,
      status: filter.status,
    });
    if (items.length === 0) break;
    for (const row of items) {
      allIds.push(Number((row as { id: number }).id));
    }
    if (items.length < pageSize) break;
    offset += pageSize;
  }

  return allIds;
}

export function resolveCustomerIds(filter: CustomerBatchFilter): number[] {
  const allIds: number[] = [];
  let offset = 0;
  const pageSize = CHUNK_SIZE;

  while (true) {
    const { items } = listCustomers({
      limit: pageSize,
      offset,
      search: filter.search,
      is_active: filter.is_active,
    });
    if (items.length === 0) break;
    for (const row of items) {
      allIds.push(Number((row as { id: number }).id));
    }
    if (items.length < pageSize) break;
    offset += pageSize;
  }

  return allIds;
}

export function resolveBatchIds(
  entity: "orders" | "inventory" | "customers",
  ids: unknown,
  filter: unknown
): number[] {
  if (Array.isArray(ids) && ids.length > 0) {
    return [
      ...new Set(
        ids.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0)
      ),
    ];
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
