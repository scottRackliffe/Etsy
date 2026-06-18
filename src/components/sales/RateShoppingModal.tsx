"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { formatCurrency } from "@/lib/format-currency";
import type { Order } from "@/types";

type ShippingRate = {
  id: string;
  carrier: string;
  service: string;
  rate: string;
  currency: string;
  delivery_days: number | null;
  delivery_date: string | null;
};

type RateShoppingModalProps = {
  open: boolean;
  orderId: number | null;
  order: Order | null;
  onClose: () => void;
  onLabelPurchased: () => void;
  onError: (title: string, message: string, err?: unknown) => void;
};

export function RateShoppingModal({
  open,
  orderId,
  order,
  onClose,
  onLabelPurchased,
  onError,
}: RateShoppingModalProps) {
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState(false);
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [shipmentId, setShipmentId] = useState("");
  const [selectedRateId, setSelectedRateId] = useState("");
  const [weightOz, setWeightOz] = useState("");
  const [lengthIn, setLengthIn] = useState("");
  const [widthIn, setWidthIn] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [editDimensions, setEditDimensions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orderId) return;
    setRates([]);
    setSelectedRateId("");
    setShipmentId("");
    setError(null);
    if (order) {
      if (order.package_weight_oz != null) setWeightOz(String(order.package_weight_oz));
      if (order.package_length_in != null) setLengthIn(String(order.package_length_in));
      if (order.package_width_in != null) setWidthIn(String(order.package_width_in));
      if (order.package_height_in != null) setHeightIn(String(order.package_height_in));
    }
    void fetchRates();
  }, [open, orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRates = async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, number> = {};
      if (weightOz) body.weight_oz = parseFloat(weightOz);
      if (lengthIn) body.length_in = parseFloat(lengthIn);
      if (widthIn) body.width_in = parseFloat(widthIn);
      if (heightIn) body.height_in = parseFloat(heightIn);

      const res = await fetch(`/api/orders/${orderId}/shipping-rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        shipment_id?: string;
        rates?: ShippingRate[];
        error?: { message?: string; user_message?: string };
      };
      if (!res.ok) {
        setError(data.error?.message ?? data.error?.user_message ?? "Could not fetch shipping rates.");
        return;
      }
      setShipmentId(data.shipment_id ?? "");
      setRates(data.rates ?? []);
      if (data.rates?.length) {
        setSelectedRateId(data.rates[0].id);
      }
    } catch {
      setError("Could not connect to the shipping service.");
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = async () => {
    if (!orderId || !shipmentId || !selectedRateId) return;
    setBuying(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/shipping-buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipment_id: shipmentId, rate_id: selectedRateId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: { user_message?: string };
      };
      if (!res.ok) {
        setError(data.error?.user_message ?? "Could not buy the label.");
        return;
      }
      onLabelPurchased();
    } catch {
      setError("Could not purchase the label.");
    } finally {
      setBuying(false);
    }
  };

  const selectedRate = rates.find((r) => r.id === selectedRateId);
  const shipToName = [order?.ship_to_first_name, order?.ship_to_last_name]
    .filter(Boolean)
    .join(" ");
  const shipToLocation = [order?.ship_to_city, order?.ship_to_state_province]
    .filter(Boolean)
    .join(", ");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Ship Order #${order?.order_number ?? orderId ?? ""}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--ui-body)]">
          {shipToName}
          {shipToLocation ? ` — ${shipToLocation}` : ""}
        </p>

        <div>
          <button
            type="button"
            className="text-xs text-[var(--ui-accent)] underline"
            onClick={() => setEditDimensions(!editDimensions)}
          >
            {editDimensions ? "Hide dimensions" : "Edit package dimensions"}
          </button>
          {editDimensions && (
            <div className="mt-2 grid grid-cols-4 gap-2">
              <label className="text-xs text-[var(--ui-muted)]">
                Weight (oz)
                <input
                  type="number"
                  value={weightOz}
                  onChange={(e) => setWeightOz(e.target.value)}
                  className="mt-1 w-full rounded border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1 text-sm text-[var(--ui-body)]"
                />
              </label>
              <label className="text-xs text-[var(--ui-muted)]">
                Length (in)
                <input
                  type="number"
                  value={lengthIn}
                  onChange={(e) => setLengthIn(e.target.value)}
                  className="mt-1 w-full rounded border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1 text-sm text-[var(--ui-body)]"
                />
              </label>
              <label className="text-xs text-[var(--ui-muted)]">
                Width (in)
                <input
                  type="number"
                  value={widthIn}
                  onChange={(e) => setWidthIn(e.target.value)}
                  className="mt-1 w-full rounded border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1 text-sm text-[var(--ui-body)]"
                />
              </label>
              <label className="text-xs text-[var(--ui-muted)]">
                Height (in)
                <input
                  type="number"
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                  className="mt-1 w-full rounded border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1 text-sm text-[var(--ui-body)]"
                />
              </label>
              <div className="col-span-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void fetchRates()}
                  disabled={loading}
                >
                  Refresh rates
                </Button>
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner />
            <span className="ml-2 text-sm text-[var(--ui-muted)]">
              Fetching rates…
            </span>
          </div>
        )}

        {error && (
          <div className="rounded border border-[var(--ui-red)]/30 bg-[var(--ui-red)]/5 p-3 text-sm text-[var(--ui-red)]">
            {error}
          </div>
        )}

        {!loading && rates.length > 0 && (
          <div className="max-h-64 overflow-y-auto rounded border border-[var(--ui-border)]">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-[var(--ui-border)] bg-[var(--ui-panel-bg)]">
                  <th className="w-8 py-2 pl-3 pr-1 text-left text-xs text-[var(--ui-muted)]" />
                  <th className="w-[25%] px-2 py-2 text-left text-xs text-[var(--ui-muted)]">
                    Carrier
                  </th>
                  <th className="px-2 py-2 text-left text-xs text-[var(--ui-muted)]">
                    Service
                  </th>
                  <th className="w-14 px-2 py-2 text-right text-xs text-[var(--ui-muted)]">
                    Est.
                  </th>
                  <th className="w-20 px-2 py-2 text-right text-xs text-[var(--ui-muted)]">
                    Price
                  </th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => (
                  <tr
                    key={rate.id}
                    className={`cursor-pointer border-b border-[var(--ui-border)] hover:bg-[var(--ui-panel-bg)] ${
                      rate.id === selectedRateId ? "bg-[var(--ui-accent)]/10" : ""
                    }`}
                    onClick={() => setSelectedRateId(rate.id)}
                  >
                    <td className="py-2 pl-3 pr-1">
                      <input
                        type="radio"
                        name="shipping-rate"
                        checked={rate.id === selectedRateId}
                        onChange={() => setSelectedRateId(rate.id)}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-2 py-2 text-[var(--ui-body)]">
                      {rate.carrier}
                    </td>
                    <td className="px-2 py-2 text-[var(--ui-body)] truncate" title={rate.service}>
                      {rate.service}
                    </td>
                    <td className="px-2 py-2 text-right text-[var(--ui-muted)]">
                      {rate.delivery_days ? `${rate.delivery_days}d` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-medium text-[var(--ui-body)]">
                      {formatCurrency(parseFloat(rate.rate), rate.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && rates.length === 0 && open && (
          <p className="py-4 text-center text-sm text-[var(--ui-muted)]">
            No rates available. Check package dimensions and addresses.
          </p>
        )}

        <div className="flex items-center justify-between border-t border-[var(--ui-border)] pt-2">
          <div className="text-sm text-[var(--ui-body)]">
            {selectedRate
              ? `Selected: ${selectedRate.carrier} ${selectedRate.service} — ${formatCurrency(parseFloat(selectedRate.rate), selectedRate.currency)}`
              : "Select a shipping rate above"}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={buying}>
              Cancel
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={() => void handleBuy()}
              disabled={!selectedRateId || buying || loading}
              busy={buying}
            >
              {selectedRate
                ? `Buy this label ${formatCurrency(parseFloat(selectedRate.rate), selectedRate.currency)}`
                : "Buy label"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
