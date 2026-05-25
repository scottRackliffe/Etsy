"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { addNotificationEntry } from "@/lib/notifications";
import {
  clearPrintQueue,
  listPrintQueue,
  PRINT_QUEUE_CHANGED_EVENT,
  printQueueTypeLabel,
  removePrintQueueEntry,
  removePrintQueueEntries,
  type PrintQueueDocType,
  type PrintQueueEntry,
} from "@/lib/print-queue";
import type { ApiErrorShape } from "@/types";

function entryKey(entry: Pick<PrintQueueEntry, "type" | "orderId">): string {
  return `${entry.type}:${entry.orderId}`;
}

function docIcon(type: PrintQueueDocType): string {
  switch (type) {
    case "invoice":
      return "📄";
    case "thank-you":
      return "💌";
    case "label":
      return "🏷";
  }
}

export function PrintQueueMenu() {
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<PrintQueueEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    setQueue(listPrintQueue());
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener(PRINT_QUEUE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(PRINT_QUEUE_CHANGED_EVENT, handler);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    setSelected(new Set(queue.map(entryKey)));
  }, [queue]);

  const grouped = useMemo(() => {
    const map = new Map<string, PrintQueueEntry[]>();
    for (const entry of queue) {
      const existing = map.get(entry.orderNumber) ?? [];
      existing.push(entry);
      map.set(entry.orderNumber, existing);
    }
    return map;
  }, [queue]);

  const toggleSelected = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const printItems = async (
    items: Array<{ type: PrintQueueDocType; orderId: number }>,
    clearMode: "all" | "printed" | "none"
  ) => {
    if (items.length === 0) return;
    setBusy(true);
    try {
      const response = await fetch("/api/reports/print-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/pdf" },
        body: JSON.stringify({ items }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        addNotificationEntry({
          type: "warning",
          message: "Pop-up blocked. Allow pop-ups to print the combined document.",
        });
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

      if (clearMode === "all") {
        clearPrintQueue();
      } else if (clearMode === "printed") {
        removePrintQueueEntries(items);
      }
      addNotificationEntry({
        type: "success",
        message: `Opened ${items.length} document(s) for printing.`,
      });
    } catch (err) {
      const payload = err as ApiErrorShape;
      addNotificationEntry({
        type: "error",
        message: payload.error?.user_message ?? "We could not generate the print queue PDF.",
      });
    } finally {
      setBusy(false);
    }
  };

  const printAll = () => {
    void printItems(
      queue.map((entry) => ({ type: entry.type, orderId: entry.orderId })),
      "all"
    );
  };

  const printSelected = () => {
    const items = queue
      .filter((entry) => selected.has(entryKey(entry)))
      .map((entry) => ({ type: entry.type, orderId: entry.orderId }));
    void printItems(items, "printed");
  };

  const count = queue.length;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg border border-[var(--ui-border)] bg-[var(--ui-neutral)] px-3 py-2 text-sm font-medium text-[var(--ui-body)] shadow-sm transition hover:bg-[var(--ui-neutral-hover)]"
        aria-label={`Print queue${count > 0 ? `, ${count} items` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        title="Print queue"
      >
        <span aria-hidden="true">🖨</span>
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--ui-accent)] px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Print queue"
          className="absolute right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 shadow-xl max-md:fixed max-md:inset-x-4 max-md:top-20 max-md:right-auto max-md:mt-0 max-md:max-h-[calc(100vh-6rem)] max-md:overflow-y-auto"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--ui-title)]">Print queue</p>
            {busy ? <LoadingSpinner size="sm" /> : null}
          </div>

          {count === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--ui-muted)]">
              No documents queued. Add invoices, thank-you notes, or labels from Sales.
            </p>
          ) : (
            <>
              <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                {[...grouped.entries()].map(([orderNumber, entries]) => (
                  <div key={orderNumber}>
                    <p className="mb-1 text-xs font-medium text-[var(--ui-muted)]">{orderNumber}</p>
                    <ul className="space-y-1">
                      {entries.map((entry) => {
                        const key = entryKey(entry);
                        return (
                          <li
                            key={key}
                            className="flex items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-2"
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(key)}
                              onChange={() => toggleSelected(key)}
                              aria-label={`Select ${printQueueTypeLabel(entry.type)} for ${entry.orderNumber}`}
                              className="h-4 w-4"
                            />
                            <span aria-hidden="true">{docIcon(entry.type)}</span>
                            <span className="flex-1 text-sm text-[var(--ui-body)]">
                              {printQueueTypeLabel(entry.type)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removePrintQueueEntry(entry.type, entry.orderId)}
                              className="rounded px-2 py-1 text-lg leading-none text-[var(--ui-muted)] hover:bg-[var(--ui-neutral)] hover:text-[var(--ui-red)]"
                              aria-label={`Remove ${printQueueTypeLabel(entry.type)} for ${entry.orderNumber}`}
                            >
                              ×
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || count === 0}
                  onClick={printAll}
                  className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Print all
                </button>
                <button
                  type="button"
                  disabled={busy || selected.size === 0}
                  onClick={printSelected}
                  className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
                >
                  Print selected
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setClearOpen(true)}
                  className="rounded-lg border border-[var(--ui-red)]/40 px-3 py-2 text-sm text-[var(--ui-red)] disabled:opacity-60"
                >
                  Clear queue
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => {
          clearPrintQueue();
          setClearOpen(false);
          addNotificationEntry({ type: "info", message: "Print queue cleared." });
        }}
        title="Clear print queue?"
        description={`Clear all ${count} item${count === 1 ? "" : "s"} from the print queue?`}
        confirmLabel="Clear queue"
        confirmVariant="danger"
      />
    </div>
  );
}
