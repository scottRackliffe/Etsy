"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

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

const RECENT_KEY = "globalSearch.recent";

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecent(term: string) {
  const trimmed = term.trim();
  if (trimmed.length < 2) return;
  const next = [trimmed, ...loadRecent().filter((t) => t !== trimmed)].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(value));
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
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
      {seeAllHref && total > 0 && onSeeAll && (
        <button
          type="button"
          onClick={() => onSeeAll(seeAllHref)}
          className="mt-2 text-sm text-[var(--ui-accent)] hover:underline"
        >
          See all {total} results →
        </button>
      )}
    </div>
  );
}

function ResultRow({
  primary,
  secondary,
  badge,
  onClick,
}: {
  primary: string;
  secondary: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-left transition hover:border-[var(--ui-accent)]/50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--ui-title)]">{primary}</p>
        {secondary ? <p className="truncate text-xs text-[var(--ui-muted)]">{secondary}</p> : null}
      </div>
      {badge ? (
        <span className="shrink-0 rounded-full border border-[var(--ui-border)] px-2 py-0.5 text-xs text-[var(--ui-muted)]">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function GlobalSearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setRecent(loadRecent());
      setQuery("");
      setData(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
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
  }, [query, open]);

  const navigate = useCallback(
    (href: string, term: string) => {
      saveRecent(term);
      onClose();
      router.push(href);
    },
    [onClose, router]
  );

  if (!open) return null;

  const q = query.trim();
  const orders = data?.orders;
  const inventory = data?.inventory;
  const customers = data?.customers;
  const hasResults =
    (orders?.items.length ?? 0) + (inventory?.items.length ?? 0) + (customers?.items.length ?? 0) > 0;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="max-h-[70vh] w-full max-w-xl overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[var(--ui-border)] px-4 py-3">
          <span className="text-[var(--ui-muted)]">{loading ? "…" : "⌕"}</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search orders, inventory, customers..."
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
                const name = [order.ship_to_first_name, order.ship_to_last_name].filter(Boolean).join(" ");
                const secondary = [name, formatMoney(order.grand_total)].filter(Boolean).join(" • ");
                return (
                  <ResultRow
                    key={order.id}
                    primary={order.order_number}
                    secondary={secondary}
                    badge={order.order_status}
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
              {inventory.items.map((item) => (
                <ResultRow
                  key={item.id}
                  primary={item.item_number}
                  secondary={truncate(item.description, 50)}
                  badge={item.status}
                  onClick={() => navigate(`/inventory?itemId=${item.id}`, q)}
                />
              ))}
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
                const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Customer";
                const secondary = customer.email ?? customer.phone ?? "";
                return (
                  <ResultRow
                    key={customer.id}
                    primary={name}
                    secondary={secondary}
                    onClick={() => navigate(`/customers?customerId=${customer.id}`, q)}
                  />
                );
              })}
            </ResultSection>
          ) : null}

          {q.length < 2 && recent.length > 0 ? (
            <div className="border-t border-[var(--ui-border)] pt-3">
              <p className="mb-2 text-xs text-[var(--ui-muted)]">Recent</p>
              <div className="flex flex-wrap gap-2">
                {recent.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setQuery(term)}
                    className="rounded-full border border-[var(--ui-border)] px-3 py-1 text-xs text-[var(--ui-body)] hover:border-[var(--ui-accent)]"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
