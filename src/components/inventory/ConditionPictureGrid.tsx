"use client";

import { useCallback, useRef, useState } from "react";
import type { InventoryItem } from "@/types";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getConditionPictureSlotPath, pictureDisplayUrl } from "@/lib/picture-url";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const MAX_BYTES = 15 * 1024 * 1024;
const SLOT_COUNT = 5;

type ConditionPictureGridProps = {
  inventoryId: number | null;
  item: InventoryItem | null;
  disabled?: boolean;
  onItemUpdated: (item: InventoryItem) => void;
  onError: (title: string, message: string, err?: unknown) => void;
};

function slotPaths(item: InventoryItem | null): Array<{ slot: number; path: string | null }> {
  if (!item) {
    return Array.from({ length: SLOT_COUNT }, (_, i) => ({ slot: i + 1, path: null }));
  }
  return Array.from({ length: SLOT_COUNT }, (_, i) => {
    const slot = i + 1;
    return { slot, path: getConditionPictureSlotPath(item as Record<string, unknown>, slot) };
  });
}

export function ConditionPictureGrid({
  inventoryId,
  item,
  disabled,
  onItemUpdated,
  onError,
}: ConditionPictureGridProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadSlot, setUploadSlot] = useState<number | null>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [removeSlot, setRemoveSlot] = useState<number | null>(null);

  const slots = slotPaths(item);

  const validateFile = (file: File): string | null => {
    if (!ACCEPT.split(",").includes(file.type)) {
      return "File must be JPEG, PNG, WebP, or GIF.";
    }
    if (file.size > MAX_BYTES) {
      return "File must be under 15 MB.";
    }
    return null;
  };

  const uploadFile = useCallback(
    async (slot: number, file: File) => {
      if (!inventoryId) return;
      const validationError = validateFile(file);
      if (validationError) {
        onError("Invalid image", validationError);
        return;
      }
      setBusySlot(slot);
      try {
        const form = new FormData();
        form.set("slot", String(slot));
        form.set("file", file);
        form.set("type", "condition");
        const response = await fetch(`/api/inventory/${inventoryId}/pictures`, {
          method: "POST",
          body: form,
        });
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          item?: InventoryItem;
        };
        if (!response.ok) throw data;
        if (data.item) onItemUpdated(data.item);
      } catch (err) {
        onError("Upload failed", "We could not upload that condition picture.", err);
      } finally {
        setBusySlot(null);
      }
    },
    [inventoryId, onError, onItemUpdated]
  );

  const openPicker = (slot: number) => {
    if (disabled || !inventoryId) return;
    setUploadSlot(slot);
    fileInputRef.current?.click();
  };

  const addToFirstEmpty = () => {
    const empty = slots.find((s) => !s.path);
    if (empty) openPicker(empty.slot);
  };

  const confirmRemove = async () => {
    if (!inventoryId || removeSlot == null) return;
    setBusySlot(removeSlot);
    try {
      const response = await fetch(
        `/api/inventory/${inventoryId}/pictures/${removeSlot}?type=condition`,
        { method: "DELETE", headers: { Accept: "application/json" } }
      );
      const data = (await response.json().catch(() => ({}))) as { item?: InventoryItem };
      if (!response.ok) throw data;
      if (data.item) onItemUpdated(data.item);
      setRemoveSlot(null);
    } catch (err) {
      onError("Remove failed", "We could not remove that condition picture.", err);
    } finally {
      setBusySlot(null);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--ui-title)]">Condition pictures</p>
        <Button variant="secondary" size="sm" onClick={addToFirstEmpty} disabled={disabled || !inventoryId || !slots.some((s) => !s.path)}>
          + Add
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          const slot = uploadSlot;
          e.target.value = "";
          setUploadSlot(null);
          if (file && slot != null) void uploadFile(slot, file);
        }}
      />

      <div className="grid grid-cols-5 gap-2">
        {slots.map(({ slot, path }) => {
          const url = pictureDisplayUrl(path);
          const isBusy = busySlot === slot;
          return (
            <div
              key={slot}
              className="relative aspect-square overflow-hidden rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)]"
              onDragOver={(e) => {
                if (disabled || path) return;
                if (e.dataTransfer.types.includes("Files")) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (disabled || !inventoryId || path) return;
                const file = e.dataTransfer.files?.[0];
                if (file) void uploadFile(slot, file);
              }}
            >
              {isBusy ? (
                <div className="flex h-full items-center justify-center text-xs text-[var(--ui-muted)]">
                  Uploading…
                </div>
              ) : url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Condition ${slot}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setRemoveSlot(slot)}
                    disabled={disabled}
                    className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white hover:bg-[var(--ui-red)]"
                    aria-label={`Remove condition picture ${slot}`}
                  >
                    ×
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => openPicker(slot)}
                  disabled={disabled || !inventoryId}
                  className="flex h-full w-full flex-col items-center justify-center gap-1 border border-dashed border-[var(--ui-border)] text-xs text-[var(--ui-muted)] hover:border-[var(--ui-accent)] hover:text-[var(--ui-body)] disabled:opacity-50"
                >
                  <span className="text-lg">+</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-[var(--ui-muted)]">
        Document flaws, repairs, or unique condition details with up to 5 photos.
      </p>

      <ConfirmDialog
        open={removeSlot != null}
        onClose={() => setRemoveSlot(null)}
        onConfirm={() => void confirmRemove()}
        title="Remove condition picture?"
        description={`Remove condition picture ${removeSlot ?? ""}?`}
        confirmLabel="Remove"
        confirmVariant="danger"
        busy={busySlot != null}
      />
    </div>
  );
}
