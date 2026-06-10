"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { ApiErrorShape } from "@/types";

type PreviewRow = {
  row: number;
  valid: boolean;
  data: Record<string, unknown>;
  errors: Array<{ field: string; message: string }>;
};

type PreviewResponse = {
  columns: string[];
  rows: PreviewRow[];
  total_rows: number;
  valid_count?: number;
  error_count?: number;
};

type ImportResponse = {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; field: string; message: string }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  onError: (title: string, message: string, err?: unknown) => void;
  onSuccess: (title: string, message: string) => void;
};

export function InventoryImportModal({ open, onClose, onImported, onError, onSuccess }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setImportResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const loadPreview = async (selected: File) => {
    setBusy(true);
    setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", selected);
      const response = await fetch("/api/inventory/import/preview", {
        method: "POST",
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as PreviewResponse & ApiErrorShape;
      if (!response.ok) throw data;
      setPreview({
        columns: data.columns ?? [],
        rows: data.rows ?? [],
        total_rows: data.total_rows ?? 0,
        valid_count: data.valid_count ?? undefined,
        error_count: data.error_count ?? undefined,
      });
    } catch (err) {
      setPreview(null);
      onError("Could not preview CSV", "We could not read the CSV file.", err);
    } finally {
      setBusy(false);
    }
  };

  const onFileSelected = (selected: File | null) => {
    setFile(selected);
    setPreview(null);
    setImportResult(null);
    if (selected) void loadPreview(selected);
  };

  const runImport = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/inventory/import", {
        method: "POST",
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as ImportResponse & ApiErrorShape;
      if (!response.ok) throw data;
      setImportResult(data);
      onSuccess(
        "Import complete",
        `${data.imported ?? 0} item(s) imported.${(data.skipped ?? 0) > 0 ? ` ${data.skipped} row(s) skipped.` : ""}`
      );
      onImported();
    } catch (err) {
      onError("Import failed", "We could not import the CSV file.", err);
    } finally {
      setBusy(false);
    }
  };

  const validCount = preview?.valid_count ?? preview?.rows.filter((r) => r.valid).length ?? 0;

  return (
    <Modal open={open} onClose={handleClose} title="Import inventory from CSV" maxWidth="max-w-3xl">
      <div className="space-y-4">
        <div
          className="rounded-lg border border-dashed border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-6 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files[0];
            if (dropped?.name.toLowerCase().endsWith(".csv")) onFileSelected(dropped);
          }}
        >
          <p className="mb-2 text-sm text-[var(--ui-body)]">Drop a .csv file here or choose one</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
          />
          <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
            Choose CSV file
          </Button>
          {file ? <p className="mt-2 text-xs text-[var(--ui-muted)]">{file.name}</p> : null}
        </div>

        {preview ? (
          <>
            <p className="text-sm text-[var(--ui-body)]">
              {preview.total_rows} total row{preview.total_rows === 1 ? "" : "s"} — {validCount}{" "}
              valid, {preview.error_count ?? 0} with errors (preview shows first{" "}
              {preview.rows.length}).
            </p>
            <div className="max-h-64 overflow-auto rounded-lg border border-[var(--ui-border)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--ui-panel-bg)]">
                  <tr>
                    <th className="px-2 py-1">Row</th>
                    <th className="px-2 py-1">Item #</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr
                      key={row.row}
                      className={`border-t border-[var(--ui-border)]/60 ${row.valid ? "" : "bg-[var(--ui-red)]/10"}`}
                    >
                      <td className="px-2 py-1">{row.row}</td>
                      <td className="px-2 py-1">{String(row.data.item_number ?? "—")}</td>
                      <td className="px-2 py-1">{String(row.data.status ?? "Draft")}</td>
                      <td className="px-2 py-1">
                        {row.valid ? "Valid" : row.errors.map((e) => e.message).join("; ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {importResult && importResult.errors.length > 0 ? (
          <details className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-xs">
            <summary className="cursor-pointer text-[var(--ui-muted)]">
              {importResult.errors.length} skipped row(s)
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {importResult.errors.slice(0, 20).map((err) => (
                <li key={`${err.row}-${err.field}`}>
                  Row {err.row}: {err.message}
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const header = "row,field,message\n";
                  const rows = importResult.errors
                    .map(
                      (err) =>
                        `${err.row},"${err.field.replace(/"/g, '""')}","${err.message.replace(/"/g, '""')}"`
                    )
                    .join("\n");
                  const blob = new Blob([header + rows], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "skipped-rows.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download skipped rows
              </Button>
            </div>
          </details>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose} disabled={busy}>
            {importResult ? "Close" : "Cancel"}
          </Button>
          {!importResult ? (
            <Button
              variant="accent"
              busy={busy}
              disabled={!file || !preview || validCount === 0}
              onClick={() => void runImport()}
            >
              Import valid rows
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
