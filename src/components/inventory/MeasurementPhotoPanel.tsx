"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

type ItemShape = {
  picture_1?: string | null;
  item_dimensions_unit?: string | null;
  updated_at?: string | null;
};

type Props = {
  inventoryId: number | null;
  item: ItemShape | null;
  disabled?: boolean;
  onItemUpdated: (item: unknown) => void;
  onError: (title: string, message: string, err?: unknown) => void;
};

const UNITS = ["in", "ft", "mm", "cm", "m"] as const;
type Step = "upload" | "confirm";

function numOrEmpty(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

export function MeasurementPhotoPanel({ inventoryId, item, disabled, onItemUpdated, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [unit, setUnit] = useState<string>("in");
  const [writeBack, setWriteBack] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasHero = Boolean(item?.picture_1);

  const reset = useCallback(() => {
    setStep("upload");
    setBusy(false);
    setAiNote(null);
    setLength("");
    setWidth("");
    setHeight("");
    setUnit(item?.item_dimensions_unit || "in");
    setWriteBack(true);
  }, [item?.item_dimensions_unit]);

  const start = useCallback(() => {
    reset();
    setOpen(true);
  }, [reset]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const onRulerSelected = useCallback(
    async (file: File) => {
      if (!inventoryId) return;
      setBusy(true);
      setAiNote(null);
      try {
        const fd = new FormData();
        fd.append("ruler", file);
        const res = await fetch(`/api/inventory/${inventoryId}/measure`, {
          method: "POST",
          body: fd,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ai_available?: boolean;
          estimate?: {
            length: number | null;
            width: number | null;
            height: number | null;
            unit: string;
          } | null;
          error?: { user_message?: string; message?: string };
        };
        if (!res.ok) {
          onError(
            "Measurement failed",
            data.error?.user_message || data.error?.message || "We could not read the ruler photo.",
            data
          );
          return;
        }
        const est = data.estimate;
        if (est) {
          setLength(numOrEmpty(est.length));
          setWidth(numOrEmpty(est.width));
          setHeight(numOrEmpty(est.height));
          setUnit(est.unit || unit);
          setAiNote("AI estimated these from the ruler. Review and correct before saving.");
        } else {
          setAiNote(
            "AI estimate unavailable — enter the dimensions manually (measure against the ruler)."
          );
        }
        setStep("confirm");
      } catch (err) {
        onError("Measurement failed", "We could not process the ruler photo.", err);
      } finally {
        setBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [inventoryId, onError, unit]
  );

  const submitAnnotation = useCallback(async () => {
    if (!inventoryId) return;
    const l = length.trim() ? Number(length) : null;
    const w = width.trim() ? Number(width) : null;
    const h = height.trim() ? Number(height) : null;
    if (!l && !w && !h) {
      onError("Nothing to annotate", "Enter at least one dimension (height, width, or length).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/inventory/${inventoryId}/annotate-dimensions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          length: l,
          width: w,
          height: h,
          unit,
          write_back: writeBack,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        item?: unknown;
        error?: { user_message?: string; message?: string };
      };
      if (!res.ok) {
        onError(
          "Could not create measurement photo",
          data.error?.user_message || data.error?.message || "Rendering failed.",
          data
        );
        return;
      }
      if (data.item) onItemUpdated(data.item);
      setOpen(false);
    } catch (err) {
      onError("Could not create measurement photo", "Rendering failed.", err);
    } finally {
      setBusy(false);
    }
  }, [inventoryId, length, width, height, unit, writeBack, onItemUpdated, onError]);

  if (!inventoryId) return null;

  return (
    <section className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ui-title)]">Measurement photo</h3>
          <p className="text-xs text-[var(--ui-muted)]">
            Upload a photo with a ruler in frame; we estimate the size and draw clean dimension
            callouts on a copy of your hero photo.
          </p>
        </div>
        <Button variant="secondary" onClick={start} disabled={disabled || !hasHero}>
          Add measurement photo
        </Button>
      </div>
      {!hasHero ? (
        <p className="mt-2 text-xs text-[var(--ui-yellow)]">
          Add a primary photo first — the callouts are drawn on it.
        </p>
      ) : null}

      <Modal open={open} onClose={close} title="Add measurement photo" maxWidth="max-w-md">
        {step === "upload" ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--ui-body)]">
              Upload a photo of the item next to a ruler or tape measure. We use it only to estimate
              size; the callouts are drawn on your clean hero photo.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onRulerSelected(file);
              }}
              className="block w-full text-sm text-[var(--ui-body)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--ui-accent)] file:px-3 file:py-2 file:text-white"
            />
            {busy ? <p className="text-xs text-[var(--ui-muted)]">Estimating dimensions…</p> : null}
          </div>
        ) : (
          <div className="space-y-4">
            {aiNote ? <p className="text-xs text-[var(--ui-muted)]">{aiNote}</p> : null}
            <div className="grid grid-cols-3 gap-3">
              <DimField label="Height" value={height} onChange={setHeight} />
              <DimField label="Width" value={width} onChange={setWidth} />
              <DimField label="Length" value={length} onChange={setLength} />
            </div>
            <label className="block text-xs text-[var(--ui-muted)]">
              Units
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="mt-1 block w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1.5 text-sm text-[var(--ui-body)]"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--ui-body)]">
              <input
                type="checkbox"
                checked={writeBack}
                onChange={(e) => setWriteBack(e.target.checked)}
              />
              Also save these dimensions to the item
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setStep("upload")} disabled={busy}>
                Back
              </Button>
              <Button variant="primary" onClick={() => void submitAnnotation()} disabled={busy}>
                {busy ? "Rendering…" : "Create measurement photo"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

function DimField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs text-[var(--ui-muted)]">
      {label}
      <input
        type="number"
        min="0"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1.5 text-sm text-[var(--ui-body)]"
      />
    </label>
  );
}
