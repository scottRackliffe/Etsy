"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { ApiErrorShape } from "@/types";

type DuplicateCustomer = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  order_count?: number;
};

type DuplicateGroup = {
  customers: DuplicateCustomer[];
  match_reason: string;
};

type CustomerDuplicatesModalProps = {
  open: boolean;
  onClose: () => void;
  onMergeGroup: (primaryId: number, secondaryId: number) => void;
  onError: (title: string, message: string, err?: unknown) => void;
};

function customerName(c: DuplicateCustomer): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || `Customer ${c.id}`;
}

export function CustomerDuplicatesModal({
  open,
  onClose,
  onMergeGroup,
  onError,
}: CustomerDuplicatesModalProps) {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);

  const loadDuplicates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/customers/duplicates", { headers: { Accept: "application/json" } });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { groups?: DuplicateGroup[] };
      if (!response.ok) throw data;
      setGroups(data.groups ?? []);
    } catch (err) {
      onError("Could not find duplicates", "We could not scan for duplicate customers.", err);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (!open) return;
    void loadDuplicates();
  }, [open, loadDuplicates]);

  return (
    <Modal open={open} onClose={onClose} title="Potential duplicate customers" maxWidth="max-w-3xl">
      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-[var(--ui-muted)]">Scanning customers…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-[var(--ui-muted)]">No potential duplicates found.</p>
        ) : (
          <ul className="space-y-3">
            {groups.map((group) => (
              <li
                key={group.customers.map((c) => c.id).join("-")}
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3"
              >
                <p className="text-xs text-[var(--ui-muted)]">{group.match_reason}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {group.customers.map((c) => (
                    <div key={c.id} className="rounded border border-[var(--ui-border)]/60 p-2 text-sm">
                      <p className="font-medium text-[var(--ui-title)]">{customerName(c)}</p>
                      <p className="text-xs text-[var(--ui-body)]">{c.email?.trim() || "No email"}</p>
                      <p className="text-xs text-[var(--ui-muted)]">{c.order_count ?? 0} orders</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => {
                      const [primary, secondary] = group.customers;
                      if (!primary || !secondary) return;
                      onClose();
                      onMergeGroup(primary.id, secondary.id);
                    }}
                  >
                    Merge
                  </Button>
                  {group.customers.length > 2 ? (
                    <span className="text-xs text-[var(--ui-muted)]">
                      Merge two at a time — first two shown as default; change selection in the merge dialog.
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => void loadDuplicates()} disabled={loading}>
            Rescan
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
