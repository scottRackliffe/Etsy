"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/format-currency";
import { patchHeaders } from "@/lib/patch-json";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type OtherCost = {
  id: number;
  inventory_id: number;
  cost_type: string | null;
  amount: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  inventoryId: number;
  disabled?: boolean;
  onTotalChanged?: () => void;
};

const COST_TYPES = ["Cleaning", "Repair", "Materials", "Packaging", "Advertising", "Other"];

export function OtherCostsManager({ inventoryId, disabled, onTotalChanged }: Props) {
  const { currencyCode } = useApp();
  const [costs, setCosts] = useState<OtherCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formType, setFormType] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OtherCost | null>(null);

  const fmtMoney = useCallback(
    (v: number | null | undefined) =>
      v != null ? formatCurrency(v, currencyCode) : "",
    [currencyCode]
  );

  const fetchCosts = useCallback(async () => {
    try {
      const res = await fetch(`/api/inventory/${inventoryId}/other-costs`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { items: OtherCost[] };
      setCosts(data.items ?? []);
      setError(null);
    } catch {
      setError("Could not load other costs.");
    } finally {
      setLoading(false);
    }
  }, [inventoryId]);

  useEffect(() => {
    setLoading(true);
    void fetchCosts();
  }, [fetchCosts]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormType("");
    setFormAmount("");
    setFormNote("");
  };

  const startEdit = (cost: OtherCost) => {
    setEditingId(cost.id);
    setFormType(cost.cost_type ?? "");
    setFormAmount(String(cost.amount));
    setFormNote(cost.note ?? "");
    setShowForm(true);
  };

  const startAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const handleSave = async () => {
    const amount = parseFloat(formAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Amount must be a number >= 0.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        cost_type: formType || null,
        amount,
        note: formNote || null,
      };
      if (editingId) {
        const editingCost = costs.find((c) => c.id === editingId);
        const res = await fetch(`/api/other-costs/${editingId}`, {
          method: "PATCH",
          headers: patchHeaders(editingCost?.updated_at),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Update failed");
      } else {
        const res = await fetch(`/api/inventory/${inventoryId}/other-costs`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Create failed");
      }
      resetForm();
      await fetchCosts();
      onTotalChanged?.();
    } catch {
      setError("Could not save the cost. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/other-costs/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Delete failed");
      setDeleteTarget(null);
      await fetchCosts();
      onTotalChanged?.();
    } catch {
      setError("Could not delete the cost.");
    }
  };

  const total = costs.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
          Other Costs
          {costs.length > 0 && (
            <span className="ml-1 font-normal">({fmtMoney(total)})</span>
          )}
        </p>
        {!disabled && (
          <Button variant="ghost" size="sm" onClick={startAdd}>
            + Add cost
          </Button>
        )}
      </div>

      {loading ? (
        <p className="py-2 text-center text-xs text-[var(--ui-muted)]">Loading…</p>
      ) : costs.length === 0 && !showForm ? (
        <p className="py-2 text-center text-xs text-[var(--ui-muted)]">
          No additional costs recorded.
        </p>
      ) : (
        <ul className="space-y-1">
          {costs.map((cost) => (
            <li
              key={cost.id}
              className="flex items-center justify-between gap-2 rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-1.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium text-[var(--ui-title)]">
                  {cost.cost_type || "Cost"}
                </span>
                {cost.note && (
                  <span className="ml-1 text-[var(--ui-muted)]">— {cost.note}</span>
                )}
              </div>
              <span className="shrink-0 font-medium text-[var(--ui-body)]">
                {fmtMoney(cost.amount)}
              </span>
              {!disabled && (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(cost)} title={`Edit ${cost.cost_type || "cost"}`}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleteTarget(cost)} title={`Delete ${cost.cost_type || "cost"}`}>
                    ×
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-[var(--ui-muted)]">
              Type
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-1.5 text-sm text-[var(--ui-body)]"
              >
                <option value="">Select type…</option>
                {COST_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-[var(--ui-muted)]">
              Amount
              <input
                type="number"
                step="0.01"
                min="0"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1 w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-1.5 text-sm text-[var(--ui-body)]"
              />
            </label>
          </div>
          <label className="block text-xs text-[var(--ui-muted)]">
            Note (optional)
            <input
              type="text"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="Brief description"
              className="mt-1 w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-1.5 text-sm text-[var(--ui-body)]"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={resetForm} disabled={saving}>
              Cancel
            </Button>
            <Button variant="accent" size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Update" : "Add"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-[var(--ui-red)]">{error}</p>
      )}

      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title="Delete cost?"
        description={`Remove "${deleteTarget?.cost_type || "this cost"}" (${fmtMoney(deleteTarget?.amount)}) from this item?`}
        confirmLabel="Delete"
        confirmVariant="danger"
      />
    </div>
  );
}
