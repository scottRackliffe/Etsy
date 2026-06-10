"use client";

import { useCallback, useRef, useState } from "react";
import type { InventoryItem } from "@/types";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { patchHeaders } from "@/lib/patch-json";
import { getPictureSlotPath, pictureDisplayUrl } from "@/lib/picture-url";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const VIDEO_ACCEPT = "video/mp4,video/quicktime";
const MAX_BYTES = 15 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

type Classifications = Record<string, string>;

const SHOT_TYPES = [
  "hero", "angle", "detail", "backstamp", "scale",
  "imperfection", "underside", "grouping", "lifestyle", "measurement", "extra",
] as const;

type PictureGridProps = {
  inventoryId: number | null;
  item: InventoryItem | null;
  disabled?: boolean;
  classifications?: string | Classifications | null;
  itemNumber?: string;
  onItemUpdated: (item: InventoryItem) => void;
  onClassificationChange?: (slot: number, type: string) => void;
  onReorder?: (pictures: (string | null)[]) => void;
  onError: (title: string, message: string, err?: unknown) => void;
};

function slotPaths(item: InventoryItem | null): Array<{ slot: number; path: string | null }> {
  if (!item) {
    return Array.from({ length: 20 }, (_, i) => ({ slot: i + 1, path: null }));
  }
  return Array.from({ length: 20 }, (_, i) => {
    const slot = i + 1;
    return { slot, path: getPictureSlotPath(item as Record<string, unknown>, slot) };
  });
}

function parseClassifications(raw: string | Classifications | null | undefined): Classifications {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Classifications;
    } catch {
      return {};
    }
  }
  return raw;
}

export function PictureGrid({
  inventoryId,
  item,
  disabled,
  classifications: classificationsProp,
  itemNumber,
  onItemUpdated,
  onClassificationChange,
  onReorder,
  onError,
}: PictureGridProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [uploadSlot, setUploadSlot] = useState<number | null>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [loadingSlots, setLoadingSlots] = useState<Set<number>>(new Set());
  const [removeSlot, setRemoveSlot] = useState<number | null>(null);
  const [dragSlot, setDragSlot] = useState<number | null>(null);
  const [previewSlot, setPreviewSlot] = useState<number | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [classDropdownSlot, setClassDropdownSlot] = useState<number | null>(null);

  const classifications = parseClassifications(classificationsProp);

  const slots = slotPaths(item);

  const applyReorder = useCallback(
    async (fromSlot: number, toSlot: number) => {
      if (!inventoryId || fromSlot === toSlot) return;
      const paths = slots.map((s) => s.path);
      const fromIdx = fromSlot - 1;
      const toIdx = toSlot - 1;
      if (!paths[fromIdx]) return;
      const next = [...paths];
      if (next[toIdx]) {
        [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
      } else {
        next[toIdx] = next[fromIdx];
        next[fromIdx] = null;
      }
      setBusySlot(toSlot);
      try {
        const response = await fetch(`/api/inventory/${inventoryId}/pictures/reorder`, {
          method: "PATCH",
          headers: patchHeaders(item?.updated_at),
          body: JSON.stringify({ pictures: next.map((p) => p ?? "") }),
        });
        const data = (await response.json().catch(() => ({}))) as { item?: InventoryItem };
        if (!response.ok) throw data;
        if (data.item) onItemUpdated(data.item);
      } catch (err) {
        onError("Reorder failed", "We could not reorder pictures.", err);
      } finally {
        setBusySlot(null);
        setDragSlot(null);
      }
    },
    [inventoryId, slots, item, onError, onItemUpdated]
  );

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
      setLoadingSlots((prev) => new Set(prev).add(slot));
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
        setLoadingSlots((prev) => {
          const next = new Set(prev);
          next.delete(slot);
          return next;
        });
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

  const uploadVideo = useCallback(
    async (file: File) => {
      if (!inventoryId) return;
      if (!VIDEO_ACCEPT.split(",").includes(file.type)) {
        onError("Invalid video", "File must be MP4 or MOV.");
        return;
      }
      if (file.size > VIDEO_MAX_BYTES) {
        onError("Video too large", "Video must be under 100 MB.");
        return;
      }
      setVideoBusy(true);
      try {
        const form = new FormData();
        form.set("file", file);
        const response = await fetch(`/api/inventory/${inventoryId}/video`, {
          method: "POST",
          body: form,
        });
        const data = (await response.json().catch(() => ({}))) as { item?: InventoryItem };
        if (!response.ok) throw data;
        if (data.item) onItemUpdated(data.item);
      } catch (err) {
        onError("Video upload failed", "We could not upload the video.", err);
      } finally {
        setVideoBusy(false);
      }
    },
    [inventoryId, onError, onItemUpdated]
  );

  const removeVideo = useCallback(async () => {
    if (!inventoryId) return;
    setVideoBusy(true);
    try {
      const response = await fetch(`/api/inventory/${inventoryId}/video`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as { item?: InventoryItem };
      if (!response.ok) throw data;
      if (data.item) onItemUpdated(data.item);
    } catch (err) {
      onError("Remove failed", "We could not remove the video.", err);
    } finally {
      setVideoBusy(false);
    }
  }, [inventoryId, onError, onItemUpdated]);

  const videoPath = (item as Record<string, unknown> | null)?.video_path as string | null;
  const videoFilename = videoPath ? videoPath.split("/").pop() : null;
  const previewUrl = previewSlot != null
    ? pictureDisplayUrl(slots.find((s) => s.slot === previewSlot)?.path ?? null)
    : null;

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
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          const startSlot = uploadSlot;
          e.target.value = "";
          setUploadSlot(null);
          if (!files || !startSlot) return;
          if (files.length === 1) {
            void uploadFile(startSlot, files[0]);
          } else {
            const emptySlots = slots.filter((s) => !s.path).map((s) => s.slot);
            const targetSlots = [startSlot, ...emptySlots.filter((s) => s !== startSlot)];
            Array.from(files).forEach((file, i) => {
              if (i < targetSlots.length) {
                void uploadFile(targetSlots[i], file);
              }
            });
          }
        }}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {slots.map(({ slot, path }) => {
          const url = pictureDisplayUrl(path);
          const isBusy = busySlot === slot;
          const isLoading = loadingSlots.has(slot);
          const shotType = classifications[String(slot)];
          return (
            <div
              key={slot}
              className={`relative aspect-square overflow-hidden rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] ${
                dragSlot === slot ? "ring-2 ring-[var(--ui-accent)]" : ""
              }`}
              onDragOver={(e) => {
                if (disabled) return;
                if (
                  e.dataTransfer.types.includes("application/x-picture-slot") ||
                  (!path && e.dataTransfer.types.includes("Files"))
                ) {
                  e.preventDefault();
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (disabled || !inventoryId) return;
                const fromRaw = e.dataTransfer.getData("application/x-picture-slot");
                if (fromRaw) {
                  void applyReorder(Number(fromRaw), slot);
                  return;
                }
                if (path) return;
                const file = e.dataTransfer.files?.[0];
                if (file) void uploadFile(slot, file);
              }}
            >
              {(isBusy || isLoading) ? (
                <div className="flex h-full items-center justify-center">
                  <LoadingSpinner size="sm" />
                </div>
              ) : url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Slot ${slot}`}
                    draggable={!disabled}
                    onClick={() => setPreviewSlot(slot)}
                    onDragStart={(e) => {
                      if (disabled || !path) return;
                      e.dataTransfer.setData("application/x-picture-slot", String(slot));
                      e.dataTransfer.effectAllowed = "move";
                      setDragSlot(slot);
                    }}
                    onDragEnd={() => setDragSlot(null)}
                    className="h-full w-full cursor-pointer object-cover"
                  />
                  {slot === 1 ? (
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
                      ★ Primary
                    </span>
                  ) : null}
                  {shotType ? (
                    <div
                      className={`absolute ${
                        slot === 1 ? "bottom-1 right-6" : "bottom-1 left-1"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setClassDropdownSlot(classDropdownSlot === slot ? null : slot);
                        }}
                        disabled={disabled}
                        className="rounded bg-[var(--ui-accent)]/80 px-1 text-[10px] text-white hover:bg-[var(--ui-accent)]"
                      >
                        {shotType} ▾
                      </button>
                      {classDropdownSlot === slot && (
                        <div className="absolute bottom-full left-0 z-30 mb-1 max-h-48 overflow-y-auto rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] py-1 shadow-lg">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setClassDropdownSlot(null);
                            }}
                            className="w-full whitespace-nowrap px-3 py-1 text-left text-[10px] text-[var(--ui-body)] hover:bg-[var(--ui-card-bg)]"
                          >
                            OK as classified
                          </button>
                          {SHOT_TYPES.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onClassificationChange?.(slot, t);
                                setClassDropdownSlot(null);
                              }}
                              className={`w-full whitespace-nowrap px-3 py-1 text-left text-[10px] hover:bg-[var(--ui-card-bg)] ${
                                t === shotType ? "text-[var(--ui-accent)] font-medium" : "text-[var(--ui-body)]"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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
        Drag images between slots to reorder. Slot 1 is the primary listing image.{" "}
        <a
          href="https://www.etsy.com/legal/policy"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--ui-accent)]"
        >
          Why pictures matter
        </a>
      </p>

      {Object.keys(classifications).length > 0 && (
        <div className="mt-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled || !inventoryId}
            onClick={() => {
              const filledSlots = slots.filter((s) => s.path);
              const typeOrder = SHOT_TYPES as readonly string[];
              const sorted = [...filledSlots].sort((a, b) => {
                const aType = classifications[String(a.slot)] ?? "";
                const bType = classifications[String(b.slot)] ?? "";
                const aIdx = typeOrder.indexOf(aType);
                const bIdx = typeOrder.indexOf(bType);
                return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
              });
              const newPictures: (string | null)[] = Array(20).fill(null);
              sorted.forEach((s, i) => {
                newPictures[i] = s.path;
              });
              if (onReorder) {
                onReorder(newPictures);
              } else if (inventoryId) {
                void fetch(`/api/inventory/${inventoryId}/pictures/reorder`, {
                  method: "PATCH",
                  headers: patchHeaders(item?.updated_at),
                  body: JSON.stringify({ pictures: newPictures.map((p) => p ?? "") }),
                })
                  .then((r) => r.json())
                  .then((data: { item?: InventoryItem }) => {
                    if (data.item) onItemUpdated(data.item);
                  })
                  .catch((err) => onError("Reorder failed", "Could not auto-sort pictures.", err));
              }
            }}
          >
            Auto-sort by type
          </Button>
        </div>
      )}

      {/* Video upload zone */}
      <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <p className="mb-2 text-xs font-semibold text-[var(--ui-title)]">Video (optional)</p>
        {videoFilename ? (
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-[var(--ui-body)]">{videoFilename}</span>
            <button
              type="button"
              onClick={() => void removeVideo()}
              disabled={disabled || videoBusy}
              className="rounded border border-[var(--ui-border)] px-2 py-0.5 text-xs text-[var(--ui-red)] hover:bg-[var(--ui-red)]/10 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        ) : (
          <div
            className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-[var(--ui-border)] px-4 py-3 text-xs text-[var(--ui-muted)] hover:border-[var(--ui-accent)] hover:text-[var(--ui-body)]"
            onClick={() => {
              if (!disabled && inventoryId) videoInputRef.current?.click();
            }}
            onDragOver={(e) => {
              if (disabled) return;
              if (e.dataTransfer.types.includes("Files")) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (disabled || !inventoryId) return;
              const file = e.dataTransfer.files?.[0];
              if (file) void uploadVideo(file);
            }}
          >
            {videoBusy ? (
              <LoadingSpinner size="sm" />
            ) : (
              <span>Drop or click to add video (MP4 or MOV · max 100 MB · 5–15 seconds)</span>
            )}
          </div>
        )}
        <input
          ref={videoInputRef}
          type="file"
          accept={VIDEO_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (file) void uploadVideo(file);
          }}
        />
      </div>

      {/* Full-size preview modal */}
      <Modal
        open={previewSlot != null && previewUrl != null}
        onClose={() => setPreviewSlot(null)}
        title={
          previewSlot != null
            ? `Photo ${previewSlot}${itemNumber ? ` — ${itemNumber}` : ""}`
            : undefined
        }
        maxWidth="max-w-4xl"
      >
        {previewUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={previewSlot != null ? `Photo ${previewSlot} full size` : ""}
              className="mx-auto max-h-[70vh] max-w-full rounded object-contain"
            />
            <div className="mt-3 flex items-center justify-center gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  const filled = slots.filter((s) => s.path).map((s) => s.slot);
                  const idx = filled.indexOf(previewSlot!);
                  const prev = idx > 0 ? filled[idx - 1] : filled[filled.length - 1];
                  setPreviewSlot(prev);
                }}
              >
                ← Previous
              </Button>
              <span className="text-xs text-[var(--ui-muted)]">
                {(() => {
                  const filled = slots.filter((s) => s.path).map((s) => s.slot);
                  const idx = filled.indexOf(previewSlot!);
                  return `${idx + 1} of ${filled.length}`;
                })()}
              </span>
              <Button
                variant="ghost"
                onClick={() => {
                  const filled = slots.filter((s) => s.path).map((s) => s.slot);
                  const idx = filled.indexOf(previewSlot!);
                  const next = idx < filled.length - 1 ? filled[idx + 1] : filled[0];
                  setPreviewSlot(next);
                }}
              >
                Next →
              </Button>
            </div>
          </>
        )}
      </Modal>

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
