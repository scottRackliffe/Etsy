"use client";

import { useId } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * Unsaved-changes dialog (ADR-079 §4 / ADR-042 §3).
 *
 * Shows THREE choices when the active editor can save (`canSave`):
 *   Save changes · Discard changes · Keep editing
 *
 * Falls back to the legacy TWO-button form (Discard changes · Keep editing)
 * for any dirty form that has not registered a save handler, preserving the
 * pre-SEMS behavior for those call sites.
 */
export function UnsavedChangesDialog({
  open,
  canSave,
  busy,
  onSave,
  onDiscard,
  onKeepEditing,
}: {
  open: boolean;
  canSave: boolean;
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onKeepEditing: () => void;
}) {
  const descriptionId = useId();
  return (
    <Modal
      open={open}
      onClose={onKeepEditing}
      title="Unsaved changes"
      maxWidth="max-w-md"
      role="alertdialog"
      aria-describedby={descriptionId}
    >
      <p id={descriptionId} className="text-sm text-[var(--ui-body)]">
        {canSave
          ? "You have unsaved changes. Save them, discard them, or keep editing."
          : "You have unsaved changes that will be lost. Discard them, or keep editing."}
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onKeepEditing} disabled={busy}>
          Keep editing
        </Button>
        <Button variant="danger" onClick={onDiscard} disabled={busy}>
          Discard changes
        </Button>
        {canSave ? (
          <Button variant="accent" onClick={onSave} busy={busy}>
            Save changes
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
