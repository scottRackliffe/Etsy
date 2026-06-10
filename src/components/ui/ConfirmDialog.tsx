"use client";

import { useId } from "react";
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
  cancelLabel = "Cancel",
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
  cancelLabel?: string;
  confirmVariant?: "danger" | "accent";
  busy?: boolean;
}) {
  const descriptionId = useId();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
      role="alertdialog"
      aria-describedby={descriptionId}
    >
      <p id={descriptionId} className="text-sm text-[var(--ui-body)]">
        {description}
      </p>
      {affectedLabel ? (
        <p className="mt-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm font-medium text-[var(--ui-title)]">
          {affectedLabel}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm} busy={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
