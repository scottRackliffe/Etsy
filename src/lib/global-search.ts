import { listCustomers, listInventory, listOrders } from "@/lib/records";

export function globalSearch(term: string, limitPerGroup: number) {
  const q = term.trim();
  const limit = Math.max(1, Math.min(20, limitPerGroup));
  const orders = listOrders({ limit, offset: 0, search: q });
  const inventory = listInventory({ limit, offset: 0, search: q });
  const customers = listCustomers({ limit, offset: 0, search: q });
  return {
    orders: { items: orders.items, total: orders.total },
    inventory: { items: inventory.items, total: inventory.total },
    customers: { items: customers.items, total: customers.total },
  };
}
