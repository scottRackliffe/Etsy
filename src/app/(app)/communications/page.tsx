"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { usePagination } from "@/hooks/usePagination";
import { formatCurrency } from "@/lib/format-currency";
import { useApp } from "@/context/AppContext";
import { SendCommunicationModal } from "@/components/communications/SendCommunicationModal";

type MessageType = "payment_reminder" | "thank_you";
type Channel = "email" | "print";

type Candidate = {
  order_id: number;
  order_number: string;
  customer_id: number | null;
  customer_name: string;
  customer_email: string | null;
  grand_total: number;
  order_date: string | null;
  shipping_date: string | null;
  is_shipped: 0 | 1;
  source_channel: string | null;
  payment_status: string | null;
  already_reminded_at: string | null;
};

const MESSAGE_LABELS: Record<MessageType, string> = {
  payment_reminder: "Payment Reminders",
  thank_you: "Thank-You Notes",
};

function CommunicationsPageInner() {
  const searchParams = useSearchParams();
  const { currencyCode, setError: setAppError } = useApp();

  const initialType = (searchParams.get("type") ?? "payment_reminder") as MessageType;
  const [messageType, setMessageType] = useState<MessageType>(initialType);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [channel, setChannel] = useState<Channel>("email");

  const { page, pageSize, offset, total, setPage, setTotal } = usePagination(25);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const params = new URLSearchParams({
        type: messageType,
        limit: String(pageSize),
        offset: String(offset),
      });
      const res = await fetch(`/api/communications/candidates?${params}`, {
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: Candidate[];
        pagination?: { total: number };
        error?: { user_message?: string };
      };
      if (!res.ok || !data.ok) {
        setError(data.error?.user_message ?? "Could not load candidates.");
        setCandidates([]);
        setTotal(0);
        return;
      }
      setCandidates(data.items ?? []);
      setTotal(data.pagination?.total ?? 0);
    } catch {
      setError("An unexpected error occurred.");
      setCandidates([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [messageType, pageSize, offset, setTotal]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  // Re-select type from URL (deep-link ?type=)
  useEffect(() => {
    const t = searchParams.get("type") as MessageType | null;
    if (t && (t === "payment_reminder" || t === "thank_you")) {
      setMessageType(t);
    }
  }, [searchParams]);

  const toggleSelect = (orderId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map((c) => c.order_id)));
    }
  };

  const handleSent = (results: { order_id: number; status: string; error?: string }[]) => {
    setShowModal(false);
    const sentCount = results.filter((r) => r.status === "sent" || r.status === "printed").length;
    const failedCount = results.filter((r) => r.status === "failed").length;
    if (sentCount > 0) {
      setAppError({
        title: "Sent",
        message: `${sentCount} message${sentCount !== 1 ? "s" : ""} sent successfully.${failedCount > 0 ? ` ${failedCount} failed.` : ""}`,
        actions: [],
      });
    } else {
      setAppError({ title: "Error", message: "All sends failed. Check email settings.", actions: [] });
    }
    void loadCandidates();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--ui-title)]">Communications</h1>
          <p className="text-sm text-[var(--ui-muted)]">
            Send transactional messages to customers for active orders.
          </p>
        </div>
      </div>

      {/* Message type selector */}
      <div className="flex gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
        {(["payment_reminder", "thank_you"] as MessageType[]).map((t) => (
          <button
            key={t}
            onClick={() => { setMessageType(t); setPage(1); }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              messageType === t
                ? "bg-[var(--ui-accent)] text-white"
                : "border border-[var(--ui-border)] bg-[var(--ui-card-bg)] text-[var(--ui-body)] hover:bg-[var(--ui-neutral)]"
            }`}
          >
            {MESSAGE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Description */}
      <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-4 text-sm text-[var(--ui-muted)]">
        {messageType === "payment_reminder" ? (
          <span>
            Active, <strong className="text-[var(--ui-body)]">manually-entered</strong>, unpaid
            orders — eligible for a payment reminder. (Etsy orders are excluded; Etsy collects
            payment at checkout.)
          </span>
        ) : (
          <span>
            Shipped orders that have <strong className="text-[var(--ui-body)]">not yet</strong>{" "}
            received a successful thank-you message.
          </span>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-[var(--ui-red)] bg-[var(--ui-card-bg)] p-4 text-sm text-[var(--ui-red)]">
          {error}
        </div>
      )}

      {/* Candidate list */}
      {!loading && candidates.length === 0 && !error && (
        <EmptyState
          message={
            messageType === "payment_reminder"
              ? "There are no unpaid manual orders that need a payment reminder right now."
              : "All shipped orders have already received a thank-you note."
          }
        />
      )}

      {candidates.length > 0 && (
        <>
          {/* Actions bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
            <span className="text-sm text-[var(--ui-muted)]">
              {selected.size === 0 ? "Select orders to send" : `${selected.size} selected`}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-sm text-[var(--ui-muted)]">Channel:</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as Channel)}
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-1.5 text-sm text-[var(--ui-body)]"
              >
                <option value="email">Email</option>
                <option value="print">Print (PDF)</option>
              </select>
              <Button
                variant="primary"
                disabled={selected.size === 0}
                onClick={() => setShowModal(true)}
              >
                Send {MESSAGE_LABELS[messageType]}
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ui-border)] text-left text-xs font-medium uppercase tracking-wider text-[var(--ui-muted)]">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size === candidates.length && candidates.length > 0}
                      onChange={toggleAll}
                      aria-label="Select all"
                      className="accent-[var(--ui-accent)]"
                    />
                  </th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Sent</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr
                    key={c.order_id}
                    className={`border-b border-[var(--ui-border)] transition-colors hover:bg-[var(--ui-panel-bg)] ${
                      selected.has(c.order_id) ? "bg-[var(--ui-panel-bg)]" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(c.order_id)}
                        onChange={() => toggleSelect(c.order_id)}
                        aria-label={`Select order ${c.order_number}`}
                        className="accent-[var(--ui-accent)]"
                      />
                    </td>
                    <td className="px-4 py-2.5 font-medium text-[var(--ui-body)]">
                      {c.order_number}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--ui-body)]">{c.customer_name}</td>
                    <td className="px-4 py-2.5 text-[var(--ui-muted)]">
                      {c.customer_email ?? <span className="italic">none</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--ui-body)]">
                      {formatCurrency(c.grand_total, currencyCode)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex flex-wrap gap-1">
                        {c.is_shipped === 1 && (
                          <Badge label="Shipped" variant="success" />
                        )}
                        {c.payment_status === "unpaid" && (
                          <Badge label="Unpaid" variant="warning" />
                        )}
                        {c.payment_status === "paid" && (
                          <Badge label="Paid" variant="success" />
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--ui-muted)]">
                      {c.already_reminded_at
                        ? new Date(c.already_reminded_at).toLocaleDateString()
                        : <span className="italic">Never</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}

      {loading && (
        <div className="py-8 text-center text-sm text-[var(--ui-muted)]">Loading…</div>
      )}

      {showModal && (
        <SendCommunicationModal
          type={messageType}
          orderIds={Array.from(selected)}
          channel={channel}
          onClose={() => setShowModal(false)}
          onSent={handleSent}
        />
      )}

    </div>
  );
}

export default function CommunicationsPage() {
  return (
    <Suspense>
      <CommunicationsPageInner />
    </Suspense>
  );
}
