"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type ConfirmCardProps = {
  question: string;
  suggestedAnswer: string;
  optional?: boolean;
  answer: string;
  onAnswerChange: (answer: string) => void;
};

export function ConfirmCard({
  question,
  suggestedAnswer,
  optional,
  answer,
  onAnswerChange,
}: ConfirmCardProps) {
  const [editing, setEditing] = useState(false);
  const displayAnswer = answer.trim() || suggestedAnswer;

  return (
    <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
      <p className="text-sm font-medium text-[var(--ui-title)]">
        {question}
        {optional ? <span className="ml-1 text-[var(--ui-muted)]">(optional)</span> : null}
      </p>

      {editing ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={answer || suggestedAnswer}
            onChange={(e) => onAnswerChange(e.target.value)}
            rows={3}
            spellCheck
            className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)]"
          />
          <Button variant="primary" size="sm" onClick={() => setEditing(false)}>
            Done editing
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-[var(--ui-body)]">{displayAnswer || "—"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => onAnswerChange(displayAnswer)}>
              Yes, use this
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
