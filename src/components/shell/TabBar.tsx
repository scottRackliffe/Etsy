"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: Array<{ id: string; label: string; href: string }> = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard" },
  { id: "sales", label: "Sales", href: "/sales" },
  { id: "inventory", label: "Inventory", href: "/inventory" },
  { id: "customers", label: "Customers", href: "/customers" },
  { id: "reports", label: "Reports", href: "/reports" },
  { id: "outstanding", label: "Outstanding", href: "/outstanding" },
  { id: "tutorial", label: "Tutorial & tips", href: "/tutorial" },
  { id: "config", label: "Config", href: "/config" },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3 shadow-sm">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Primary navigation tabs">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.id}
              href={tab.href}
              role="tab"
              aria-selected={isActive}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[var(--ui-accent)] text-white"
                  : "border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] text-[var(--ui-body)] hover:bg-[var(--ui-neutral-hover)]"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
