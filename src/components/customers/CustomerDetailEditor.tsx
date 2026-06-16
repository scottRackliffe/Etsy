"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { customerToDetailDraft, type CustomerDetailDraft } from "@/lib/customer-detail-draft";
import { formStatesEqual } from "@/lib/deep-equal-form";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import { useZipLookup } from "@/hooks/useZipLookup";
import { formatPhone } from "@/hooks/usePhoneFormat";
import { FormField } from "@/components/ui/FormField";
import type { Customer } from "@/types";

type CustomerDetailEditorProps = {
  customer: Customer;
  busy: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onPatch: (payload: Record<string, unknown>) => Promise<void>;
};

export function CustomerDetailEditor({
  customer,
  busy,
  onDirtyChange,
  onPatch,
}: CustomerDetailEditorProps) {
  const customerSyncKey = `${customer.id}:${customer.updated_at ?? ""}`;
  const [draftSyncKey, setDraftSyncKey] = useState(customerSyncKey);
  const [draft, setDraft] = useState<CustomerDetailDraft>(() => customerToDetailDraft(customer));

  if (customerSyncKey !== draftSyncKey) {
    setDraftSyncKey(customerSyncKey);
    setDraft(customerToDetailDraft(customer));
  }

  const isDirty = useMemo(
    () => !formStatesEqual(draft, customerToDetailDraft(customer)),
    [draft, customer]
  );

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useBeforeUnload(isDirty);

  const { registerOnDiscard } = useUnsavedChanges();

  useEffect(() => {
    return registerOnDiscard(() => setDraft(customerToDetailDraft(customer)));
  }, [customer, registerOnDiscard]);

  const saveField = useCallback(
    async (field: keyof CustomerDetailDraft) => {
      const saved = customerToDetailDraft(customer);
      if (formStatesEqual({ [field]: draft[field] }, { [field]: saved[field] })) return;
      const value = draft[field].trim();
      const payload: Record<string, unknown> = {
        [field]: value.length > 0 ? value : null,
      };
      await onPatch(payload);
    },
    [customer, draft, onPatch]
  );

  const zipLookup = useZipLookup();
  const prevPostalRef = useRef(draft.postal_code);
  const [zipWarning, setZipWarning] = useState<string | null>(null);

  const update = (field: keyof CustomerDetailDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const handlePostalBlur = useCallback(async () => {
    const zip = draft.postal_code.trim();
    const saved = customerToDetailDraft(customer);
    const postalChanged = zip !== saved.postal_code.trim();
    const zipChanged = zip !== prevPostalRef.current.trim();
    prevPostalRef.current = zip;

    if (zip.length < 3) {
      setZipWarning(null);
      if (postalChanged) await onPatch({ postal_code: zip || null });
      return;
    }

    const needsLookup = zipChanged || !draft.city || !draft.state;
    if (!needsLookup) {
      if (postalChanged) await onPatch({ postal_code: zip });
      return;
    }

    const result = await zipLookup(zip, draft.country || "US");

    if (!result.valid) {
      setZipWarning(`"${zip}" doesn't appear to be a valid postal code for ${draft.country || "US"}.`);
    } else {
      setZipWarning(null);
    }

    const patch: Record<string, unknown> = {};
    if (postalChanged) patch.postal_code = zip;
    if (result.city && (zipChanged || !draft.city)) patch.city = result.city;
    if (result.state && (zipChanged || !draft.state)) patch.state = result.state;

    if (patch.city || patch.state) {
      setDraft((current) => ({
        ...current,
        ...(patch.city ? { city: patch.city as string } : {}),
        ...(patch.state ? { state: patch.state as string } : {}),
      }));
    }

    if (Object.keys(patch).length > 0) {
      await onPatch(patch);
    }
  }, [draft.postal_code, draft.city, draft.state, draft.country, customer, zipLookup, onPatch]);

  return (
    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
      <FormField label="First name" required>
        <input
          value={draft.first_name}
          onChange={(e) => update("first_name", e.target.value)}
          onBlur={() => void saveField("first_name")}
          placeholder="First name"
          disabled={busy}
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
      </FormField>
      <FormField label="Last name" required>
        <input
          value={draft.last_name}
          onChange={(e) => update("last_name", e.target.value)}
          onBlur={() => void saveField("last_name")}
          placeholder="Last name"
          disabled={busy}
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
      </FormField>
      <FormField label="Phone">
        <input
          value={draft.phone}
          onChange={(e) => update("phone", e.target.value)}
          onBlur={async () => {
            const formatted = formatPhone(draft.phone, draft.country || "US");
            if (formatted !== draft.phone) {
              setDraft((cur) => ({ ...cur, phone: formatted }));
              const saved = customerToDetailDraft(customer);
              if (formatted.trim() !== saved.phone.trim()) {
                await onPatch({ phone: formatted.trim() || null });
              }
            } else {
              await saveField("phone");
            }
          }}
          placeholder="Phone"
          disabled={busy}
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
      </FormField>
      <FormField label="Address line 1" required>
        <input
          value={draft.address_1}
          onChange={(e) => update("address_1", e.target.value)}
          onBlur={() => void saveField("address_1")}
          placeholder="Street address"
          disabled={busy}
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
      </FormField>
      <FormField label="Address line 2">
        <input
          value={draft.address_2}
          onChange={(e) => update("address_2", e.target.value)}
          onBlur={() => void saveField("address_2")}
          placeholder="Apt, suite, unit, etc."
          disabled={busy}
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
      </FormField>
      <FormField label="Country" required>
        <input
          value={draft.country}
          onChange={(e) => update("country", e.target.value.toUpperCase())}
          onBlur={() => void saveField("country")}
          placeholder="US"
          maxLength={2}
          disabled={busy}
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
      </FormField>
      <FormField label="Postal code" required error={zipWarning ?? undefined}>
        <input
          value={draft.postal_code}
          onChange={(e) => {
            update("postal_code", e.target.value);
            if (zipWarning) setZipWarning(null);
          }}
          onBlur={() => void handlePostalBlur()}
          placeholder="Postal code"
          disabled={busy}
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
      </FormField>
      <FormField label="City" required>
        <input
          value={draft.city}
          onChange={(e) => update("city", e.target.value)}
          onBlur={() => void saveField("city")}
          placeholder="City"
          disabled={busy}
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
      </FormField>
      <FormField label="State" required>
        <input
          value={draft.state}
          onChange={(e) => update("state", e.target.value.toUpperCase().slice(0, 2))}
          onBlur={() => void saveField("state")}
          placeholder="ST"
          maxLength={2}
          disabled={busy}
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
      </FormField>
    </div>
  );
}
