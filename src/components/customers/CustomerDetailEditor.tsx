"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { customerToDetailDraft, type CustomerDetailDraft } from "@/lib/customer-detail-draft";
import { formStatesEqual } from "@/lib/deep-equal-form";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
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

  const update = (field: keyof CustomerDetailDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

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
          onBlur={() => void saveField("phone")}
          placeholder="Phone"
          disabled={busy}
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
      </FormField>
      <FormField label="Address">
        <input
          value={draft.address_1}
          onChange={(e) => update("address_1", e.target.value)}
          onBlur={() => void saveField("address_1")}
          placeholder="Address"
          disabled={busy}
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
      </FormField>
      <FormField label="Postal code">
        <input
          value={draft.postal_code}
          onChange={(e) => update("postal_code", e.target.value)}
          onBlur={() => void saveField("postal_code")}
          placeholder="Postal code"
          disabled={busy}
          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
      </FormField>
    </div>
  );
}
