"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { MERGE_CUSTOMER_FIELDS, type MergeCustomerField } from "@/lib/customer-merge-fields";
import type { ApiErrorShape, Customer, CustomerAddress, Order } from "@/types";

const FIELD_LABELS: Record<MergeCustomerField, string> = {
  first_name: "First name",
  last_name: "Last name",
  email: "Email",
  phone: "Phone",
  notes: "Notes",
  address_1: "Address line 1",
  address_2: "Address line 2",
  city: "City",
  state: "State",
  postal_code: "Postal code",
  country: "Country",
};

type FieldChoice = "primary" | "secondary" | "combine";

function customerLabel(c: Customer): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || `Customer ${c.id}`;
  const email = c.email?.trim() || "no email";
  const orders = c.order_count ?? 0;
  return `${name} — ${email} — ${orders} orders`;
}

function fieldValue(c: Customer, field: MergeCustomerField): string {
  const raw = c[field];
  return raw == null ? "" : String(raw);
}

function buildOverrides(
  primary: Customer,
  secondary: Customer,
  choices: Record<MergeCustomerField, FieldChoice>
): Partial<Record<MergeCustomerField, string | null>> {
  const overrides: Partial<Record<MergeCustomerField, string | null>> = {};
  for (const field of MERGE_CUSTOMER_FIELDS) {
    const choice = choices[field];
    if (choice === "secondary") {
      overrides[field] = fieldValue(secondary, field) || null;
    } else if (choice === "combine" && field === "notes") {
      const parts = [fieldValue(primary, "notes"), fieldValue(secondary, "notes")].filter(Boolean);
      overrides.notes = parts.length > 0 ? parts.join("\n") : null;
    }
  }
  return overrides;
}

type CustomerMergeModalProps = {
  open: boolean;
  onClose: () => void;
  initialPrimaryId?: number | null;
  initialSecondaryId?: number | null;
  onMerged: (primaryId: number) => void;
  onError: (title: string, message: string, err?: unknown) => void;
};

export function CustomerMergeModal({
  open,
  onClose,
  initialPrimaryId,
  initialSecondaryId,
  onMerged,
  onError,
}: CustomerMergeModalProps) {
  const [step, setStep] = useState<0 | 1>(0);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [options, setOptions] = useState<Customer[]>([]);
  const [primaryId, setPrimaryId] = useState<number | "">("");
  const [secondaryId, setSecondaryId] = useState<number | "">("");
  const [primary, setPrimary] = useState<Customer | null>(null);
  const [secondary, setSecondary] = useState<Customer | null>(null);
  const [secondaryOrders, setSecondaryOrders] = useState<Order[]>([]);
  const [secondaryAddresses, setSecondaryAddresses] = useState<CustomerAddress[]>([]);
  const [secondaryNotesCount, setSecondaryNotesCount] = useState(0);
  const [choices, setChoices] = useState<Record<MergeCustomerField, FieldChoice>>(
    () =>
      Object.fromEntries(MERGE_CUSTOMER_FIELDS.map((f) => [f, "primary"])) as Record<
        MergeCustomerField,
        FieldChoice
      >
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setStep(0);
    setPrimaryId(initialPrimaryId ?? "");
    setSecondaryId(initialSecondaryId ?? "");
    setPrimary(null);
    setSecondary(null);
    setSecondaryOrders([]);
    setSecondaryAddresses([]);
    setSecondaryNotesCount(0);
    setChoices(
      Object.fromEntries(MERGE_CUSTOMER_FIELDS.map((f) => [f, "primary"])) as Record<
        MergeCustomerField,
        FieldChoice
      >
    );
    setConfirmOpen(false);
  }, [initialPrimaryId, initialSecondaryId]);

  const loadPreview = useCallback(
    async (overridePrimary?: number, overrideSecondary?: number) => {
      const pId = overridePrimary ?? (typeof primaryId === "number" ? primaryId : null);
      const sId = overrideSecondary ?? (typeof secondaryId === "number" ? secondaryId : null);
      if (!pId || !sId || pId === sId) {
        onError("Invalid selection", "Choose two different customers to merge.");
        return;
      }
      setBusy(true);
      try {
        const [pRes, sRes, oRes, aRes, nRes] = await Promise.all([
          fetch(`/api/customers/${pId}`, { headers: { Accept: "application/json" } }),
          fetch(`/api/customers/${sId}`, { headers: { Accept: "application/json" } }),
          fetch(`/api/customers/${sId}/orders?limit=50`, {
            headers: { Accept: "application/json" },
          }),
          fetch(`/api/customers/${sId}/addresses`, { headers: { Accept: "application/json" } }),
          fetch(`/api/customers/${sId}/notes`, { headers: { Accept: "application/json" } }),
        ]);
        const pData = (await pRes.json()) as ApiErrorShape & { customer?: Customer };
        const sData = (await sRes.json()) as ApiErrorShape & { customer?: Customer };
        const oData = (await oRes.json()) as { items?: Order[] };
        const aData = (await aRes.json()) as { items?: CustomerAddress[] };
        const nData = (await nRes.json().catch(() => ({}))) as { items?: unknown[] };
        if (!pRes.ok || !pData.customer) throw pData;
        if (!sRes.ok || !sData.customer) throw sData;
        setPrimaryId(pId);
        setSecondaryId(sId);
        setPrimary(pData.customer);
        setSecondary(sData.customer);
        setSecondaryOrders(oData.items ?? []);
        setSecondaryAddresses(aData.items ?? []);
        setSecondaryNotesCount(nData.items?.length ?? 0);
        setChoices(
          Object.fromEntries(MERGE_CUSTOMER_FIELDS.map((f) => [f, "primary"])) as Record<
            MergeCustomerField,
            FieldChoice
          >
        );
        setStep(1);
      } catch (err) {
        onError(
          "Could not load customers",
          "We could not load customer details for merge preview.",
          err
        );
      } finally {
        setBusy(false);
      }
    },
    [onError, primaryId, secondaryId]
  );

  useEffect(() => {
    if (!open) return;
    reset();
    setLoadingOptions(true);
    void fetch("/api/customers?limit=500&is_active=1", { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((data: { items?: Customer[] }) => setOptions(data.items ?? []))
      .catch(() => setOptions([]))
      .finally(() => setLoadingOptions(false));

    if (initialPrimaryId && initialSecondaryId && initialPrimaryId !== initialSecondaryId) {
      void loadPreview(initialPrimaryId, initialSecondaryId);
    }
  }, [open, reset, initialPrimaryId, initialSecondaryId, loadPreview]);

  const performMerge = async () => {
    if (!primary || !secondary) return;
    setBusy(true);
    try {
      const field_overrides = buildOverrides(primary, secondary, choices);
      const response = await fetch("/api/customers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          primary_id: primary.id,
          secondary_id: secondary.id,
          field_overrides,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        merged_customer_id?: number;
      };
      if (!response.ok) throw data;
      setConfirmOpen(false);
      onClose();
      onMerged(data.merged_customer_id ?? primary.id);
    } catch (err) {
      onError("Merge failed", "We could not merge those customers.", err);
    } finally {
      setBusy(false);
    }
  };

  const secondaryName = useMemo(() => {
    if (!secondary) return "";
    return (
      [secondary.first_name, secondary.last_name].filter(Boolean).join(" ") ||
      `Customer ${secondary.id}`
    );
  }, [secondary]);

  const primaryName = useMemo(() => {
    if (!primary) return "";
    return (
      [primary.first_name, primary.last_name].filter(Boolean).join(" ") || `Customer ${primary.id}`
    );
  }, [primary]);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={step === 0 ? "Merge customers" : "Review merge"}
        maxWidth="max-w-2xl"
      >
        {step === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--ui-muted)]">
              Choose the customer record to keep (primary) and the duplicate to merge into it
              (secondary).
            </p>
            {loadingOptions ? (
              <p className="text-sm text-[var(--ui-muted)]">Loading customers…</p>
            ) : (
              <>
                <label className="block text-sm text-[var(--ui-body)]">
                  Primary customer (keep)
                  <select
                    value={primaryId}
                    onChange={(e) => setPrimaryId(e.target.value ? Number(e.target.value) : "")}
                    className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                  >
                    <option value="">Select customer…</option>
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {customerLabel(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-[var(--ui-body)]">
                  Secondary customer (merge in, then delete)
                  <select
                    value={secondaryId}
                    onChange={(e) => setSecondaryId(e.target.value ? Number(e.target.value) : "")}
                    className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                  >
                    <option value="">Select customer…</option>
                    {options.map((c) => (
                      <option key={c.id} value={c.id} disabled={c.id === primaryId}>
                        {customerLabel(c)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="accent"
                busy={busy}
                disabled={!primaryId || !secondaryId || primaryId === secondaryId}
                onClick={() => void loadPreview()}
              >
                Preview merge
              </Button>
            </div>
          </div>
        ) : primary && secondary ? (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-lg border border-[var(--ui-border)]">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--ui-border)] bg-[var(--ui-panel-bg)] text-left text-xs text-[var(--ui-muted)]">
                    <th className="px-3 py-2">Field</th>
                    <th className="px-3 py-2">Primary</th>
                    <th className="px-3 py-2">Secondary</th>
                    <th className="px-3 py-2">Keep</th>
                  </tr>
                </thead>
                <tbody>
                  {MERGE_CUSTOMER_FIELDS.map((field) => (
                    <tr key={field} className="border-b border-[var(--ui-border)]/60">
                      <td className="px-3 py-2 font-medium text-[var(--ui-title)]">
                        {FIELD_LABELS[field]}
                      </td>
                      <td className="px-3 py-2 text-[var(--ui-body)]">
                        {fieldValue(primary, field) || "—"}
                      </td>
                      <td className="px-3 py-2 text-[var(--ui-body)]">
                        {fieldValue(secondary, field) || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={choices[field]}
                          onChange={(e) =>
                            setChoices((c) => ({
                              ...c,
                              [field]: e.target.value as FieldChoice,
                            }))
                          }
                          className="rounded border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-1 text-xs"
                        >
                          <option value="primary">Primary</option>
                          <option value="secondary">Secondary</option>
                          {field === "notes" ? <option value="combine">Combine</option> : null}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--ui-title)]">
                Orders to move ({secondaryOrders.length})
              </p>
              {secondaryOrders.length === 0 ? (
                <p className="text-xs text-[var(--ui-muted)]">No orders on secondary customer.</p>
              ) : (
                <ul className="mt-1 max-h-28 overflow-y-auto text-xs text-[var(--ui-body)]">
                  {secondaryOrders.map((o) => (
                    <li key={o.id}>
                      {o.order_number ?? `#${o.id}`} · {o.order_date ?? "—"} · ${o.grand_total ?? 0}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {secondaryNotesCount > 0 ? (
              <p className="text-sm text-[var(--ui-body)]">
                {secondaryNotesCount} interaction note{secondaryNotesCount === 1 ? "" : "s"} will be
                moved.
              </p>
            ) : null}
            <div>
              <p className="text-sm font-medium text-[var(--ui-title)]">
                Addresses to move ({secondaryAddresses.length})
              </p>
              {secondaryAddresses.length === 0 ? (
                <p className="text-xs text-[var(--ui-muted)]">
                  No separate addresses on secondary customer.
                </p>
              ) : (
                <ul className="mt-1 max-h-28 overflow-y-auto text-xs text-[var(--ui-body)]">
                  {secondaryAddresses.map((a) => (
                    <li key={a.id}>
                      {a.first_line ?? "—"}, {a.city ?? "—"} {a.postal_code ?? ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="secondary" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button variant="accent" onClick={() => setConfirmOpen(true)}>
                Continue
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void performMerge()}
        title={`Merge "${secondaryName}" into "${primaryName}"?`}
        description={`${secondaryOrders.length} order(s), ${secondaryAddresses.length} address(es)${secondaryNotesCount > 0 ? `, and ${secondaryNotesCount} note(s)` : ""} will move to ${primaryName}. ${secondaryName} will be permanently deleted. This cannot be undone.`}
        confirmLabel="Merge"
        confirmVariant="danger"
        busy={busy}
      />
    </>
  );
}
