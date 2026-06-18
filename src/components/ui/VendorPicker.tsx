"use client";

import { useCallback, useEffect, useState } from "react";
import type { Vendor } from "@/types";

type VendorOption = { id: number; name: string };
type VendorMatch = { id: number; name: string; score: number; reason: string };

type VendorDetail = {
  contact_person: string;
  email: string;
  phone: string;
  address_1: string;
  city: string;
  state: string;
  postal_code: string;
};

const EMPTY_DETAIL: VendorDetail = { contact_person: "", email: "", phone: "", address_1: "", city: "", state: "", postal_code: "" };

type Props = {
  vendorId: number | null;
  onChange: (vendorId: number | null, vendorName: string | null) => void;
  className?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  ocrHint?: string | null;
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

  // Post-creation detail panel
  const [justCreatedId, setJustCreatedId] = useState<number | null>(null);
  const [justCreatedName, setJustCreatedName] = useState("");
  const [detail, setDetail] = useState<VendorDetail>(EMPTY_DETAIL);
  const [savingDetail, setSavingDetail] = useState(false);

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

  // Re-fetch if vendorId points to a vendor not in the current list
  useEffect(() => {
    if (vendorId != null && vendors.length > 0 && !vendors.some((v) => v.id === vendorId)) {
      void loadVendors();
    }
  }, [vendorId, vendors, loadVendors]);

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

  const finishCreate = useCallback(async (id: number, name: string) => {
    await loadVendors();
    onChange(id, name);
    setJustCreatedId(id);
    setJustCreatedName(name);
    setDetail(EMPTY_DETAIL);
    setCreating(false);
    setNewName("");
  }, [loadVendors, onChange]);

  const createFromHint = useCallback(async () => {
    if (!ocrHint?.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: ocrHint.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: number; name?: string; vendor?: { id: number; name: string } };
      const created = data.vendor ?? data;
      if (response.ok && created.id) {
        consumeHint();
        await finishCreate(created.id, created.name ?? ocrHint.trim());
      }
    } catch { /* silently fail */ } finally {
      setBusy(false);
    }
  }, [ocrHint, finishCreate, consumeHint]);

  const createVendor = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: number; name?: string; vendor?: { id: number; name: string } };
      const created = data.vendor ?? data;
      if (response.ok && created.id) {
        await finishCreate(created.id, created.name ?? newName.trim());
      }
    } catch { /* silently fail — user can retry */ } finally {
      setBusy(false);
    }
  };

  const saveVendorDetails = async () => {
    if (!justCreatedId) return;
    setSavingDetail(true);
    try {
      const body: Record<string, string | null> = {};
      if (detail.contact_person.trim()) body.contact_person = detail.contact_person.trim();
      if (detail.email.trim()) body.email = detail.email.trim();
      if (detail.phone.trim()) body.phone = detail.phone.trim();
      if (detail.address_1.trim()) body.address_1 = detail.address_1.trim();
      if (detail.city.trim()) body.city = detail.city.trim();
      if (detail.state.trim()) body.state = detail.state.trim();
      if (detail.postal_code.trim()) body.postal_code = detail.postal_code.trim();
      if (Object.keys(body).length === 0) {
        setJustCreatedId(null);
        return;
      }
      await fetch(`/api/vendors/${justCreatedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      setJustCreatedId(null);
    } catch { /* fail silently */ } finally {
      setSavingDetail(false);
    }
  };

  const showHintBar = !!(ocrHint?.trim() && !hintDismissed && !vendorId);
  const inputCls = "w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm";

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
              setJustCreatedId(null);
            } else {
              const numId = parseInt(v, 10);
              const match = vendors.find((vendor) => vendor.id === numId);
              onChange(numId, match?.name ?? null);
              if (showHintBar) consumeHint();
              setJustCreatedId(null);
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

      {/* Post-creation vendor detail panel */}
      {justCreatedId != null && (
        <div className="mt-2 rounded-lg border border-[var(--ui-accent)]/30 bg-[var(--ui-accent)]/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-[var(--ui-title)]">
              New vendor: {justCreatedName}
            </p>
            <button
              type="button"
              onClick={() => setJustCreatedId(null)}
              className="text-xs text-[var(--ui-muted)] hover:text-[var(--ui-body)]"
            >
              Skip
            </button>
          </div>
          <p className="mb-2 text-xs text-[var(--ui-muted)]">
            Add details now, or skip and edit later on the Vendors tab.
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              value={detail.contact_person}
              onChange={(e) => setDetail((d) => ({ ...d, contact_person: e.target.value }))}
              placeholder="Contact person"
              className={inputCls}
            />
            <input
              value={detail.email}
              onChange={(e) => setDetail((d) => ({ ...d, email: e.target.value }))}
              placeholder="Email"
              type="email"
              className={inputCls}
            />
            <input
              value={detail.phone}
              onChange={(e) => setDetail((d) => ({ ...d, phone: e.target.value }))}
              placeholder="Phone"
              className={inputCls}
            />
            <input
              value={detail.address_1}
              onChange={(e) => setDetail((d) => ({ ...d, address_1: e.target.value }))}
              placeholder="Street address"
              className={inputCls}
            />
            <input
              value={detail.city}
              onChange={(e) => setDetail((d) => ({ ...d, city: e.target.value }))}
              placeholder="City"
              className={inputCls}
            />
            <div className="flex gap-1">
              <input
                value={detail.state}
                onChange={(e) => setDetail((d) => ({ ...d, state: e.target.value }))}
                placeholder="State"
                className={inputCls}
              />
              <input
                value={detail.postal_code}
                onChange={(e) => setDetail((d) => ({ ...d, postal_code: e.target.value }))}
                placeholder="ZIP"
                className={inputCls}
              />
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void saveVendorDetails()}
              disabled={savingDetail}
              className="rounded px-3 py-1 text-xs font-medium text-white bg-[var(--ui-accent)] hover:opacity-90 disabled:opacity-50"
            >
              {savingDetail ? "Saving..." : "Save vendor details"}
            </button>
            <button
              type="button"
              onClick={() => setJustCreatedId(null)}
              className="rounded px-3 py-1 text-xs text-[var(--ui-muted)] hover:text-[var(--ui-body)]"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
