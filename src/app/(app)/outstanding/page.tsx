"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";

export default function OutstandingPage() {
  const { orders, inventory, customers } = useApp();
  const router = useRouter();

  const unpaidOrders = orders.filter((o) => (o.payment_status ?? "").toLowerCase() !== "paid").slice(0, 10);
  const paidNotShipped = orders.filter(
    (o) => (o.payment_status ?? "").toLowerCase() === "paid" && (o.order_status ?? "").toLowerCase() !== "shipped"
  ).slice(0, 10);
  const unlistedInventory = inventory.filter((item) => !item.is_listed).slice(0, 10);
  const missingAddressCustomers = customers.filter((c) => !c.address_1 || !c.postal_code).slice(0, 10);

  const hasItems = unpaidOrders.length > 0 || paidNotShipped.length > 0 || unlistedInventory.length > 0 || missingAddressCustomers.length > 0;

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Outstanding</h3>
      <div className="space-y-2 text-sm">
        {unpaidOrders.map((order) => (
          <button
            key={`outstanding-order-${order.id}`}
            type="button"
            onClick={() => router.push(`/sales?orderId=${order.id}`)}
            className="block w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-left hover:bg-[var(--ui-list-hover)]"
          >
            Unpaid order: {order.order_number ?? order.id}
          </button>
        ))}
        {paidNotShipped.map((order) => (
          <button
            key={`outstanding-ship-${order.id}`}
            type="button"
            onClick={() => router.push(`/sales?orderId=${order.id}`)}
            className="block w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-left hover:bg-[var(--ui-list-hover)]"
          >
            Paid not shipped: {order.order_number ?? order.id}
          </button>
        ))}
        {unlistedInventory.map((item) => (
          <button
            key={`outstanding-item-${item.id}`}
            type="button"
            onClick={() => router.push(`/inventory?itemId=${item.id}`)}
            className="block w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-left hover:bg-[var(--ui-list-hover)]"
          >
            Inventory not listed: {item.item_number ?? item.id}
          </button>
        ))}
        {missingAddressCustomers.map((customer) => (
          <button
            key={`outstanding-customer-${customer.id}`}
            type="button"
            onClick={() => router.push(`/customers?customerId=${customer.id}`)}
            className="block w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-left hover:bg-[var(--ui-list-hover)]"
          >
            Customer missing address:{" "}
            {[customer.first_name, customer.last_name].filter(Boolean).join(" ") || `Customer ${customer.id}`}
          </button>
        ))}
      </div>
      {!hasItems && (
        <p className="mt-2 text-sm text-[var(--ui-muted)]">No outstanding tasks right now.</p>
      )}
    </section>
  );
}
