"use client";

import { useEffect, useRef, useState } from "react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export type InlineEditType = "select" | "number" | "toggle";

type InlineEditableCellProps = {
  editType: InlineEditType;
  value: string | number | boolean;
  display: React.ReactNode;
  options?: { value: string; label: string }[];
  editing: boolean;
  busy: boolean;
  flash: boolean;
  onStartEdit: () => void;
  onCommit: (value: string | number | boolean) => void;
  onCancel: () => void;
  onTabNext: (shiftKey: boolean) => void;
  autoFocus?: boolean;
};

export function InlineEditableCell({
  editType,
  value,
  display,
  options = [],
  editing,
  busy,
  flash,
  onStartEdit,
  onCommit,
  onCancel,
  onTabNext,
  autoFocus,
}: InlineEditableCellProps) {
  const editSeed = editing ? `${String(value)}` : "";
  const [draft, setDraft] = useState<string | number | boolean>(value);
  const [draftSeed, setDraftSeed] = useState(editSeed);
  const skipBlurCommitRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  if (editSeed !== draftSeed) {
    setDraftSeed(editSeed);
    if (editing) setDraft(value);
  }

  useEffect(() => {
    if (editing && autoFocus) {
      inputRef.current?.focus();
      if (editType === "number" && inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [editing, autoFocus, editType]);

  const commit = () => {
    if (busy) return;
    if (draft === value || String(draft) === String(value)) {
      onCancel();
      return;
    }
    onCommit(draft);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      skipBlurCommitRef.current = true;
      onCancel();
      return;
    }
    if (event.key === "Enter" && editType !== "toggle") {
      event.preventDefault();
      event.stopPropagation();
      commit();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      if (draft !== value && String(draft) !== String(value)) {
        onCommit(draft);
      } else {
        onCancel();
      }
      onTabNext(event.shiftKey);
    }
  };

  const handleBlur = () => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    commit();
  };

  if (!editing) {
    return (
      <div
        className={`group relative flex min-h-[1.5rem] items-center justify-between gap-2 rounded px-1 -mx-1 ${
          flash ? "bg-[var(--ui-green)]/25 transition-colors duration-[400ms]" : ""
        }`}
        onClick={(event) => {
          event.stopPropagation();
          onStartEdit();
        }}
      >
        <span className="truncate">{display}</span>
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="h-2 w-2 shrink-0 opacity-0 transition-opacity group-hover:opacity-50 text-[var(--ui-muted)]"
        >
          <path
            fill="currentColor"
            d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5zm1.06 1.94L12.5 3.44 11.56 2.5l1-1zM3 13h1.44L12.06 5.38l-1.5-1.5L3 11.5V13z"
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      className="relative flex items-center gap-2"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      {editType === "select" ? (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={String(draft)}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={handleBlur}
          className="w-full min-w-[7rem] rounded border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-1 text-sm text-[var(--ui-title)]"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : null}
      {editType === "number" ? (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="number"
          step="0.01"
          value={typeof draft === "number" ? draft : Number(draft) || 0}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value === "" ? 0 : Number(event.target.value))}
          onBlur={handleBlur}
          className="w-full min-w-[5rem] rounded border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-1 text-sm text-[var(--ui-title)]"
        />
      ) : null}
      {editType === "toggle" ? (
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="checkbox"
            checked={Boolean(draft)}
            disabled={busy}
            onChange={(event) => {
              const next = event.target.checked;
              setDraft(next);
              onCommit(next);
            }}
            onBlur={handleBlur}
          />
          <span>{Boolean(draft) ? "Paid" : "Unpaid"}</span>
        </label>
      ) : null}
      {busy ? <LoadingSpinner size="sm" /> : null}
    </div>
  );
}
