"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  createCoachPhoto,
  revokeCoachPhotos,
  type CoachPhoto,
} from "@/components/listing-coach/types";

const FILE_PICKER_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/tiff,image/heic,image/heif";
const MAX_BYTES = 15 * 1024 * 1024;

export type SlotGuidance = {
  label: string;
  description: string;
};

type PhotoPasteZoneProps = {
  photos: CoachPhoto[];
  onChange: (photos: CoachPhoto[]) => void;
  maxPhotos: number;
  title: string;
  pasteHint: string;
  emptyHint?: string;
  slotGuidance?: SlotGuidance[];
};

function validateFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "File must be an image.";
  }
  if (file.size > MAX_BYTES) {
    return "Each image must be 15 MB or smaller.";
  }
  return null;
}

export function PhotoPasteZone({
  photos,
  onChange,
  maxPhotos,
  title,
  pasteHint,
  emptyHint,
  slotGuidance,
}: PhotoPasteZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const [rejectMessage, setRejectMessage] = useState<string | null>(null);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = Array.from(files);
      if (incoming.length === 0) return;
      const room = maxPhotos - photos.length;
      if (room <= 0) {
        setRejectMessage(`Maximum ${maxPhotos} photos reached.`);
        return;
      }

      const next = [...photos];
      let skipped = 0;
      for (const file of incoming.slice(0, room)) {
        const err = validateFile(file);
        if (err) {
          skipped++;
          continue;
        }
        next.push(createCoachPhoto(file));
      }
      if (skipped > 0) {
        setRejectMessage(
          `${skipped} file${skipped === 1 ? " was" : "s were"} skipped (must be JPEG, PNG, WebP, or GIF, max 15 MB).`
        );
      } else {
        setRejectMessage(null);
      }
      if (next.length !== photos.length) {
        onChange(next);
      }
    },
    [maxPhotos, onChange, photos]
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        addFiles(files);
      }
    },
    [addFiles]
  );

  const removePhoto = (id: string) => {
    const removed = photos.find((p) => p.id === id);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    onChange(photos.filter((p) => p.id !== id));
  };

  const movePhoto = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const clearAll = () => {
    revokeCoachPhotos(photos);
    onChange([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[var(--ui-title)]">{title}</h4>
        {photos.length > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-[var(--ui-muted)] hover:text-[var(--ui-body)]"
          >
            Clear all
          </button>
        ) : null}
      </div>

      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        ref={zoneRef}
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, input")) return;
          zoneRef.current?.focus();
        }}
        onPaste={handlePaste}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className="min-h-[200px] cursor-pointer rounded-xl border-2 border-dashed border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-6 text-center outline-none focus:border-[var(--ui-accent)]"
      >
        <p className="text-sm font-medium text-[var(--ui-title)]">{pasteHint}</p>
        <p className="mt-1 text-xs text-[var(--ui-muted)]">
          {emptyHint ?? `Up to ${maxPhotos} images · max 15 MB each`}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
            Choose files…
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_PICKER_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {rejectMessage ? (
        <p className="text-xs text-[var(--ui-yellow)]">{rejectMessage}</p>
      ) : null}

      {slotGuidance && photos.length === 0 ? (
        <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-accent)]">
            10-Shot Recipe — recommended photo order
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {slotGuidance.map((guide, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 shrink-0 rounded bg-[var(--ui-accent)]/20 px-1.5 py-0.5 font-semibold text-[var(--ui-accent)]">
                  {i + 1}
                </span>
                <div>
                  <span className="font-semibold text-[var(--ui-title)]">{guide.label}</span>
                  <span className="ml-1 text-[var(--ui-muted)]">— {guide.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo, index) => {
            const guide = slotGuidance?.[index];
            return (
              <div
                key={photo.id}
                className="relative overflow-hidden rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.previewUrl}
                  alt={`Photo ${index + 1}`}
                  className="aspect-square w-full object-cover"
                />
                {guide ? (
                  <span
                    className="absolute left-1 top-1 flex items-center gap-1 rounded bg-[var(--ui-accent)] px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    title={guide.description}
                  >
                    {guide.label}
                    <svg viewBox="0 0 16 16" className="inline-block h-3 w-3 opacity-70" fill="currentColor">
                      <circle cx="8" cy="8" r="7.5" fill="none" stroke="currentColor" strokeWidth="1" />
                      <text x="8" y="12" textAnchor="middle" fontSize="10" fontWeight="bold">?</text>
                    </svg>
                  </span>
                ) : null}
                <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-black/50 p-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => movePhoto(index, -1)}
                    className="rounded px-1 text-[10px] text-white disabled:opacity-40"
                    aria-label="Move left"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    className="rounded px-1 text-[10px] text-[var(--ui-red)]"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    disabled={index === photos.length - 1}
                    onClick={() => movePhoto(index, 1)}
                    className="rounded px-1 text-[10px] text-white disabled:opacity-40"
                    aria-label="Move right"
                  >
                    →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
