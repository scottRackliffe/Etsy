"use client";

import { useCallback, useRef, useState } from "react";
import type { InventoryItem } from "@/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getPictureSlotPath, pictureDisplayUrl } from "@/lib/picture-url";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const MAX_BYTES = 15 * 1024 * 1024;

type PictureGridProps = {
  inventoryId: number | null;
  item: InventoryItem | null;
  disabled?: boolean;
  onItemUpdated: (item: InventoryItem) => void;
  onError: (title: string, message: string, err?: unknown) => void;
};

function slotPaths(item: InventoryItem | null): Array<{ slot: number; path: string | null }> {
  if (!item) {
    return Array.from({ length: 10 }, (_, i) => ({ slot: i + 1, path: null }));
  }
  return Array.from({ length: 10 }, (_, i) => {
    const slot = i + 1;
    return { slot, path: getPictureSlotPath(item as Record<string, unknown>, slot) };
  });
}

export function PictureGrid({
  inventoryId,
  item,
  disabled,
  onItemUpdated,
  onError,
}: PictureGridProps) {
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
        onError("Upload failed", "We could not upload that picture.", err);
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
      const response = await fetch(`/api/inventory/${inventoryId}/pictures/${removeSlot}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as { item?: InventoryItem };
      if (!response.ok) throw data;
      if (data.item) onItemUpdated(data.item);
      setRemoveSlot(null);
    } catch (err) {
      onError("Remove failed", "We could not remove that picture.", err);
    } finally {
      setBusySlot(null);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--ui-title)]">Pictures</p>
        <button
          type="button"
          onClick={addToFirstEmpty}
          disabled={disabled || !inventoryId || !slots.some((s) => !s.path)}
          className="rounded-lg border border-[var(--ui-border)] px-2 py-1 text-xs disabled:opacity-50"
        >
          + Add
        </button>
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {slots.map(({ slot, path }) => {
          const url = pictureDisplayUrl(path);
          const isBusy = busySlot === slot;
          return (
            <div
              key={slot}
              className="relative aspect-square overflow-hidden rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)]"
              onDragOver={(e) => {
                if (!path && !disabled) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (path || disabled || !inventoryId) return;
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
                  <img src={url} alt={`Slot ${slot}`} className="h-full w-full object-cover" />
                  {slot === 1 ? (
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
                      ★ Primary
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setRemoveSlot(slot)}
                    disabled={disabled}
                    className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white hover:bg-[var(--ui-red)]"
                    aria-label={`Remove picture from slot ${slot}`}
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
                  <span>Drop image</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-[var(--ui-muted)]">
        Drag to upload. Slot 1 is the primary listing image.{" "}
        <a href="https://www.etsy.com/legal/policy" target="_blank" rel="noreferrer" className="text-[var(--ui-accent)]">
          Why pictures matter
        </a>
      </p>

      <ConfirmDialog
        open={removeSlot != null}
        onClose={() => setRemoveSlot(null)}
        onConfirm={() => void confirmRemove()}
        title="Remove picture?"
        description={`Remove the picture from slot ${removeSlot ?? ""}?`}
        confirmLabel="Remove"
        confirmVariant="danger"
        busy={busySlot != null}
      />
    </div>
  );
}
