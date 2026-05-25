"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  loadRecentSearches,
  removeRecentSearch,
  saveRecentSearch,
} from "@/lib/global-search-recent";

type SearchOrder = {
  id: number;
  order_number: string;
  ship_to_first_name?: string | null;
  ship_to_last_name?: string | null;
  grand_total?: number | null;
  order_status?: string;
};

type SearchInventory = {
  id: number;
  item_number: string;
  description?: string | null;
  status?: string;
};

type SearchCustomer = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type SearchResponse = {
  ok?: boolean;
  orders?: { items: SearchOrder[]; total: number };
  inventory?: { items: SearchInventory[]; total: number };
  customers?: { items: SearchCustomer[]; total: number };
};

type NavResult = {
  key: string;
  href: string;
  primary: string;
  secondary: string;
  badge?: string;
};

function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(value));
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function badgeVariantForStatus(status: string | undefined): "success" | "warning" | "error" | "info" | "neutral" {
  const s = (status ?? "").toLowerCase();
  if (s === "active" || s === "sold" || s === "listed" || s === "paid") return "success";
  if (s === "void" || s === "cancelled" || s === "retired") return "error";
  if (s === "unpaid" || s === "draft" || s === "reserved") return "warning";
  if (s === "etsy" || s === "in stock") return "info";
  return "neutral";
}

function ResultSection({
  title,
  total,
  children,
  seeAllHref,
  onSeeAll,
}: {
  title: string;
  total: number;
  children: ReactNode;
  seeAllHref?: string;
  onSeeAll?: (href: string) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">{title}</p>
      <div className="space-y-1">{children}</div>
      {seeAllHref && total > 0 && onSeeAll ? (
        <button
          type="button"
          onClick={() => onSeeAll(seeAllHref)}
          className="mt-2 text-sm text-[var(--ui-accent)] hover:underline"
        >
          See all {total} results →
        </button>
      ) : null}
    </div>
  );
}

function ResultRow({
  primary,
  secondary,
  badge,
  highlighted,
  onClick,
  onMouseEnter,
}: {
  primary: string;
  secondary: string;
  badge?: string;
  highlighted?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
        highlighted
          ? "border-[var(--ui-accent)]/50 bg-[var(--ui-accent)]/15"
          : "border-[var(--ui-border)] bg-[var(--ui-card-bg)] hover:border-[var(--ui-accent)]/50"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--ui-title)]">{primary}</p>
        {secondary ? <p className="truncate text-xs text-[var(--ui-muted)]">{secondary}</p> : null}
      </div>
      {badge ? <Badge label={badge} variant={badgeVariantForStatus(badge)} /> : null}
    </button>
  );
}

function buildNavResults(data: SearchResponse | null, q: string): NavResult[] {
  if (!data || q.length < 2) return [];
  const items: NavResult[] = [];
  for (const order of data.orders?.items ?? []) {
    const name = [order.ship_to_first_name, order.ship_to_last_name].filter(Boolean).join(" ");
    const secondary = [name, formatMoney(order.grand_total)].filter(Boolean).join(" • ");
    items.push({
      key: `order-${order.id}`,
      href: `/sales?orderId=${order.id}`,
      primary: order.order_number,
      secondary,
      badge: order.order_status,
    });
  }
  for (const item of data.inventory?.items ?? []) {
    items.push({
      key: `inv-${item.id}`,
      href: `/inventory?itemId=${item.id}`,
      primary: item.item_number,
      secondary: truncate(item.description, 50),
      badge: item.status,
    });
  }
  for (const customer of data.customers?.items ?? []) {
    const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Customer";
    items.push({
      key: `cust-${customer.id}`,
      href: `/customers?customerId=${customer.id}`,
      primary: name,
      secondary: customer.email ?? customer.phone ?? "",
    });
  }
  return items;
}

export function GlobalSearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  useFocusTrap(dialogRef, open, onClose);

  useEffect(() => {
    if (open) {
      setRecent(loadRecentSearches());
      setQuery("");
      setData(null);
      setHighlightIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const q = query.trim();
  const navResults = useMemo(() => buildNavResults(data, q), [data, q]);

  useEffect(() => {
    setHighlightIndex(navResults.length > 0 ? 0 : -1);
  }, [navResults]);

  useEffect(() => {
    if (!open) return;
    if (q.length < 2) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`, {
          headers: { Accept: "application/json" },
        });
        const json = (await res.json()) as SearchResponse;
        if (res.ok) setData(json);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [q, open]);

  const navigate = useCallback(
    (href: string, term: string) => {
      saveRecentSearch(term);
      onClose();
      router.push(href);
    },
    [onClose, router]
  );

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (navResults.length === 0) return;
      setHighlightIndex((i) => (i + 1) % navResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (navResults.length === 0) return;
      setHighlightIndex((i) => (i <= 0 ? navResults.length - 1 : i - 1));
    } else if (e.key === "Enter" && highlightIndex >= 0 && navResults[highlightIndex]) {
      e.preventDefault();
      navigate(navResults[highlightIndex].href, q);
    }
  };

  if (!open) return null;

  const orders = data?.orders;
  const inventory = data?.inventory;
  const customers = data?.customers;
  const hasResults =
    (orders?.items.length ?? 0) + (inventory?.items.length ?? 0) + (customers?.items.length ?? 0) > 0;

  const highlightKey = highlightIndex >= 0 ? navResults[highlightIndex]?.key : null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="max-h-[70vh] w-full max-w-xl overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
      >
        <div className="flex items-center gap-2 border-b border-[var(--ui-border)] px-4 py-3">
          {loading ? (
            <LoadingSpinner size="sm" />
          ) : (
            <span className="text-[var(--ui-muted)]" aria-hidden>
              ⌕
            </span>
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search orders, inventory, customers..."
            aria-label="Search orders, inventory, and customers"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ui-title)] outline-none placeholder:text-[var(--ui-muted)]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="text-[var(--ui-muted)] hover:text-[var(--ui-title)]"
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--ui-muted)] hover:text-[var(--ui-title)]"
            aria-label="Close search"
          >
            ×
          </button>
        </div>

        <div className="max-h-[calc(70vh-3.5rem)] overflow-y-auto px-4 py-3">
          {q.length >= 2 && !loading && !hasResults ? (
            <p className="py-6 text-center text-sm text-[var(--ui-muted)]">No results for &apos;{q}&apos;</p>
          ) : null}

          {orders && orders.total > 0 ? (
            <ResultSection
              title="Orders"
              total={orders.total}
              seeAllHref={`/sales?search=${encodeURIComponent(q)}`}
              onSeeAll={(href) => navigate(href, q)}
            >
              {orders.items.map((order) => {
                const key = `order-${order.id}`;
                const name = [order.ship_to_first_name, order.ship_to_last_name].filter(Boolean).join(" ");
                const secondary = [name, formatMoney(order.grand_total)].filter(Boolean).join(" • ");
                return (
                  <ResultRow
                    key={order.id}
                    primary={order.order_number}
                    secondary={secondary}
                    badge={order.order_status}
                    highlighted={highlightKey === key}
                    onMouseEnter={() => setHighlightIndex(navResults.findIndex((n) => n.key === key))}
                    onClick={() => navigate(`/sales?orderId=${order.id}`, q)}
                  />
                );
              })}
            </ResultSection>
          ) : null}

          {inventory && inventory.total > 0 ? (
            <ResultSection
              title="Inventory"
              total={inventory.total}
              seeAllHref={`/inventory?search=${encodeURIComponent(q)}`}
              onSeeAll={(href) => navigate(href, q)}
            >
              {inventory.items.map((item) => {
                const key = `inv-${item.id}`;
                return (
                  <ResultRow
                    key={item.id}
                    primary={item.item_number}
                    secondary={truncate(item.description, 50)}
                    badge={item.status}
                    highlighted={highlightKey === key}
                    onMouseEnter={() => setHighlightIndex(navResults.findIndex((n) => n.key === key))}
                    onClick={() => navigate(`/inventory?itemId=${item.id}`, q)}
                  />
                );
              })}
            </ResultSection>
          ) : null}

          {customers && customers.total > 0 ? (
            <ResultSection
              title="Customers"
              total={customers.total}
              seeAllHref={`/customers?search=${encodeURIComponent(q)}`}
              onSeeAll={(href) => navigate(href, q)}
            >
              {customers.items.map((customer) => {
                const key = `cust-${customer.id}`;
                const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Customer";
                const secondary = customer.email ?? customer.phone ?? "";
                return (
                  <ResultRow
                    key={customer.id}
                    primary={name}
                    secondary={secondary}
                    highlighted={highlightKey === key}
                    onMouseEnter={() => setHighlightIndex(navResults.findIndex((n) => n.key === key))}
                    onClick={() => navigate(`/customers?customerId=${customer.id}`, q)}
                  />
                );
              })}
            </ResultSection>
          ) : null}

          {q.length < 2 && recent.length > 0 ? (
            <div className="border-t border-[var(--ui-border)] pt-3">
              <p className="mb-2 text-xs text-[var(--ui-muted)]">Recent</p>
              <ul className="space-y-1">
                {recent.map((term) => (
                  <li key={term} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuery(term)}
                      className="min-w-0 flex-1 rounded-lg border border-[var(--ui-border)] px-3 py-1.5 text-left text-xs text-[var(--ui-body)] hover:border-[var(--ui-accent)]"
                    >
                      {term}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecent(removeRecentSearch(term))}
                      className="shrink-0 text-xs text-[var(--ui-muted)] hover:text-[var(--ui-red)]"
                      aria-label={`Remove ${term} from recent searches`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
