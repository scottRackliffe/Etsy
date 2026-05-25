"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  affectedLabel,
  confirmLabel,
  confirmVariant = "danger",
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  affectedLabel?: string;
  confirmLabel: string;
  confirmVariant?: "danger" | "accent";
  busy?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <p className="text-sm text-[var(--ui-body)]">{description}</p>
      {affectedLabel ? (
        <p className="mt-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm font-medium text-[var(--ui-title)]">
          {affectedLabel}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm} busy={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
