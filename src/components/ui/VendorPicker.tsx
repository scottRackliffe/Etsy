"use client";

import { useCallback, useEffect, useState } from "react";
import type { Vendor } from "@/types";

type VendorOption = { id: number; name: string };
type VendorMatch = { id: number; name: string; score: number; reason: string };

type Props = {
  /** Currently selected vendor ID (null = no vendor) */
  vendorId: number | null;
  /** Called when selection changes; receives id + name (or null) */
  onChange: (vendorId: number | null, vendorName: string | null) => void;
  /** CSS class for the select / input elements */
  className?: string;
  /** Placeholder text for the empty option */
  placeholder?: string;
  /** If true, show "No vendor" as the empty option label instead of placeholder */
  allowEmpty?: boolean;
  /**
   * OCR-detected vendor name hint. When provided, the picker calls the fuzzy
   * match endpoint and shows candidate suggestions the user can click to
   * auto-select. Cleared once a selection is made.
   */
  ocrHint?: string | null;
  /** Called after the hint has been consumed (user picked a match or dismissed) */
  onHintConsumed?: () => void;
};

export function VendorPicker({
  vendorId,
  onChange,
  className,
  placeholder,
  allowEmpty = true,
  ocrHint,
  onHintConsumed,
}: Props) {
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const [matches, setMatches] = useState<VendorMatch[]>([]);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);

  const loadVendors = useCallback(async () => {
    try {
      const response = await fetch("/api/vendors?limit=500&is_active=1", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as { items?: Vendor[] };
      if (data.items) setVendors(data.items.map((v) => ({ id: v.id, name: v.name })));
    } catch { /* use empty list */ }
  }, []);

  useEffect(() => { void loadVendors(); }, [loadVendors]);

  useEffect(() => {
    if (!ocrHint?.trim() || hintDismissed || vendorId) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    setMatchLoading(true);
    fetch(`/api/vendors/match?name=${encodeURIComponent(ocrHint.trim())}`)
      .then((r) => r.json())
      .then((data: { matches?: VendorMatch[] }) => {
        if (!cancelled) setMatches(data.matches ?? []);
      })
      .catch(() => { if (!cancelled) setMatches([]); })
      .finally(() => { if (!cancelled) setMatchLoading(false); });
    return () => { cancelled = true; };
  }, [ocrHint, hintDismissed, vendorId]);

  const consumeHint = useCallback(() => {
    setHintDismissed(true);
    setMatches([]);
    onHintConsumed?.();
  }, [onHintConsumed]);

  const selectMatch = useCallback((m: VendorMatch) => {
    onChange(m.id, m.name);
    consumeHint();
  }, [onChange, consumeHint]);

  const createFromHint = useCallback(async () => {
    if (!ocrHint?.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: ocrHint.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: number; name?: string };
      if (response.ok && data.id) {
        await loadVendors();
        onChange(data.id, data.name ?? ocrHint.trim());
        consumeHint();
      }
    } catch { /* silently fail */ } finally {
      setBusy(false);
    }
  }, [ocrHint, loadVendors, onChange, consumeHint]);

  const createVendor = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: number; name?: string };
      if (response.ok && data.id) {
        await loadVendors();
        onChange(data.id, data.name ?? newName.trim());
        setCreating(false);
        setNewName("");
      }
    } catch { /* silently fail — user can retry */ } finally {
      setBusy(false);
    }
  };

  const showHintBar = !!(ocrHint?.trim() && !hintDismissed && !vendorId);

  return (
    <div>
      {/* OCR hint suggestion bar */}
      {showHintBar && (
        <div className="mb-2 rounded-md border border-[var(--ui-yellow)]/30 bg-[var(--ui-yellow)]/5 px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--ui-yellow)]">
              Receipt says: &ldquo;{ocrHint}&rdquo;
            </span>
            <button
              type="button"
              onClick={() => { setHintDismissed(true); setMatches([]); }}
              className="text-xs text-[var(--ui-muted)] hover:text-[var(--ui-body)]"
            >
              Dismiss
            </button>
          </div>

          {matchLoading && (
            <p className="text-xs text-[var(--ui-muted)]">Searching vendors...</p>
          )}

          {!matchLoading && matches.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-[var(--ui-muted)]">Did you mean:</p>
              {matches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectMatch(m)}
                  className="block w-full rounded px-2 py-1 text-left text-sm text-[var(--ui-body)] hover:bg-[var(--ui-accent)]/10"
                >
                  <span className="font-medium">{m.name}</span>
                  <span className="ml-2 text-xs text-[var(--ui-muted)]">
                    ({m.score}% {m.reason})
                  </span>
                </button>
              ))}
            </div>
          )}

          {!matchLoading && matches.length === 0 && (
            <p className="text-xs text-[var(--ui-muted)]">No matching vendors found.</p>
          )}

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void createFromHint()}
              disabled={busy}
              className="rounded px-2 py-1 text-xs font-medium text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10 disabled:opacity-50"
            >
              {busy ? "Creating..." : `Create "${ocrHint?.trim()}" as new vendor`}
            </button>
          </div>
        </div>
      )}

      {/* Creating new vendor inline */}
      {creating ? (
        <div className="flex items-center gap-1">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) void createVendor();
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
            placeholder="New vendor name..."
            autoFocus
            disabled={busy}
            className={className}
          />
          <button
            type="button"
            onClick={() => void createVendor()}
            disabled={busy || !newName.trim()}
            className="shrink-0 rounded px-1.5 py-1 text-xs font-medium text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/10 disabled:opacity-50"
          >
            {busy ? "..." : "Create"}
          </button>
          <button
            type="button"
            onClick={() => { setCreating(false); setNewName(""); }}
            className="shrink-0 rounded px-1.5 py-1 text-xs text-[var(--ui-muted)] hover:bg-[var(--ui-neutral)]/30"
          >
            Cancel
          </button>
        </div>
      ) : (
        <select
          value={vendorId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__add_new__") {
              setCreating(true);
              setNewName(ocrHint?.trim() ?? "");
            } else if (v === "") {
              onChange(null, null);
            } else {
              const numId = parseInt(v, 10);
              const match = vendors.find((vendor) => vendor.id === numId);
              onChange(numId, match?.name ?? null);
              if (showHintBar) consumeHint();
            }
          }}
          className={className}
        >
          <option value="">{allowEmpty ? "No vendor" : (placeholder ?? "Select vendor...")}</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
          <option value="__add_new__">+ Add new vendor...</option>
        </select>
      )}
    </div>
  );
}
