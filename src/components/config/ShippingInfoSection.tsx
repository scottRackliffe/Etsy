"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EMPTY_SHIPPING_INFO,
  type ShippingInfoData,
  shippingInfoSettingKey,
  isShippingInfoComplete,
} from "@/lib/shipping-info";
import type { ApiErrorShape } from "@/types";

const CARRIERS = ["USPS", "UPS", "FedEx", "DHL", "Other"] as const;

type Props = {
  onError: (title: string, message: string, err?: unknown) => void;
  onSuccess: (title: string, message: string) => void;
};

export function ShippingInfoSection({ onError, onSuccess }: Props) {
  const [activeCarrier, setActiveCarrier] = useState<(typeof CARRIERS)[number]>("USPS");
  const [byCarrier, setByCarrier] = useState<Record<string, ShippingInfoData>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/settings?limit=500", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        items?: Array<{ key: string; value: string }>;
      };
      if (!response.ok) throw data;
      const map = new Map((data.items ?? []).map((row) => [row.key, row.value]));
      const next: Record<string, ShippingInfoData> = {};
      for (const carrier of CARRIERS) {
        const raw = map.get(shippingInfoSettingKey(carrier));
        if (raw?.trim()) {
          try {
            next[carrier] = { ...EMPTY_SHIPPING_INFO, ...JSON.parse(raw) };
          } catch {
            next[carrier] = { ...EMPTY_SHIPPING_INFO };
          }
        } else {
          next[carrier] = { ...EMPTY_SHIPPING_INFO };
        }
      }
      setByCarrier(next);
    } catch (err) {
      onError("Could not load Shipping Info", "We could not load carrier label settings.", err);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = byCarrier[activeCarrier] ?? EMPTY_SHIPPING_INFO;
  const complete = isShippingInfoComplete(activeCarrier, current);

  const updateField = (key: keyof ShippingInfoData, value: string) => {
    setByCarrier((prev) => ({
      ...prev,
      [activeCarrier]: { ...(prev[activeCarrier] ?? EMPTY_SHIPPING_INFO), [key]: value },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const key = shippingInfoSettingKey(activeCarrier);
      const response = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          value: JSON.stringify(byCarrier[activeCarrier] ?? EMPTY_SHIPPING_INFO),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      onSuccess("Shipping Info saved", `${activeCarrier} label settings were updated.`);
    } catch (err) {
      onError("Could not save Shipping Info", "We could not save carrier label settings.", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      id="shipping"
      className="mb-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 lg:col-span-2"
    >
      <h4 className="mb-1 text-sm font-semibold text-[var(--ui-title)]">Shipping Info (labels)</h4>
      <p className="mb-3 text-xs text-[var(--ui-muted)]">
        Return address and account details used when printing shipping labels. No carrier API
        connection.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {CARRIERS.map((carrier) => (
          <button
            key={carrier}
            type="button"
            onClick={() => setActiveCarrier(carrier)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              activeCarrier === carrier
                ? "bg-[var(--ui-accent)] text-white"
                : "border border-[var(--ui-border)] text-[var(--ui-body)]"
            }`}
          >
            {carrier}
            {isShippingInfoComplete(carrier, byCarrier[carrier] ?? EMPTY_SHIPPING_INFO) ? " ✓" : ""}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-sm text-[var(--ui-muted)]">Loading…</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-[var(--ui-muted)]">
            Status: {complete ? "Ready for labels" : "Incomplete — add return address fields"}
            {["UPS", "FedEx", "DHL"].includes(activeCarrier) ? " and account number" : ""}
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              value={current.return_name}
              onChange={(e) => updateField("return_name", e.target.value)}
              placeholder="Return / sender name"
              className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm md:col-span-2"
            />
            <input
              value={current.return_address_line_1}
              onChange={(e) => updateField("return_address_line_1", e.target.value)}
              placeholder="Address line 1"
              className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm md:col-span-2"
            />
            <input
              value={current.return_address_line_2}
              onChange={(e) => updateField("return_address_line_2", e.target.value)}
              placeholder="Address line 2 (optional)"
              className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm md:col-span-2"
            />
            <input
              value={current.return_city}
              onChange={(e) => updateField("return_city", e.target.value)}
              placeholder="City"
              className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
            <input
              value={current.return_state}
              onChange={(e) => updateField("return_state", e.target.value)}
              placeholder="State / Province"
              className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
            <input
              value={current.return_postal_code}
              onChange={(e) => updateField("return_postal_code", e.target.value)}
              placeholder="Postal code"
              className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
            <input
              value={current.return_country}
              onChange={(e) => updateField("return_country", e.target.value)}
              placeholder="Country"
              className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
            <input
              value={current.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              placeholder="Phone (optional)"
              className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
            <input
              value={current.account_number}
              onChange={(e) => updateField("account_number", e.target.value)}
              placeholder="Account number (UPS/FedEx/DHL)"
              className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm md:col-span-2"
            />
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="mt-3 rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : `Save ${activeCarrier} Shipping Info`}
          </button>
        </>
      )}
    </div>
  );
}
