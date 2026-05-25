"use client";

import { Modal } from "@/components/ui/Modal";
import { formatShortcutLabel } from "@/lib/keyboard-utils";

type ShortcutRow = { label: string; keys: string[] };

function ShortcutList({ title, rows }: { title: string; rows: ShortcutRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">{title}</h4>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-[var(--ui-body)]">{row.label}</span>
            <kbd className="rounded border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-0.5 font-mono text-xs text-[var(--ui-muted)]">
              {formatShortcutLabel(row.keys)}
            </kbd>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function KeyboardShortcutsModal({
  open,
  onClose,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
}) {
  const global: ShortcutRow[] = [
    { label: "Global search", keys: ["meta", "K"] },
    { label: "Keyboard shortcuts help", keys: ["?"] },
    { label: "Close modal / search", keys: ["Escape"] },
  ];

  const page: ShortcutRow[] = [];
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/sales")) {
    page.push({ label: "Sync from Etsy", keys: ["meta", "shift", "S"] });
  }
  if (pathname.startsWith("/inventory")) {
    page.push({ label: "Open CSV import", keys: ["meta", "shift", "I"] });
  }
  if (pathname.startsWith("/reports")) {
    page.push({ label: "Download PDF report", keys: ["meta", "P"] });
  }

  const table: ShortcutRow[] = [
    { label: "Focus table (click table first)", keys: ["Tab"] },
    { label: "Open selected row", keys: ["Enter"] },
    { label: "Previous row", keys: ["ArrowUp"] },
    { label: "Next row", keys: ["ArrowDown"] },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" maxWidth="max-w-md">
      <ShortcutList title="Global" rows={global} />
      <ShortcutList title="This page" rows={page} />
      <ShortcutList title="List tables" rows={table} />
    </Modal>
  );
}
