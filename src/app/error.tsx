"use client";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: AppErrorProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--ui-background)] px-4 text-[var(--ui-body)]">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--ui-red)]/40 bg-[var(--ui-card-bg)] p-6">
        <h2 className="text-xl font-semibold text-[var(--ui-title)]">Something went wrong</h2>
        <p className="mt-2 text-[var(--ui-muted)]">
          We hit an unexpected issue. You can retry now. If this keeps happening, reconnect Etsy and
          try again.
        </p>
        <p className="mt-3 rounded-md bg-[var(--ui-list-dark)] px-3 py-2 font-mono text-xs text-[var(--ui-muted)]">
          {error.message || "Unexpected application error"}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--ui-accent-hover)]"
          >
            Retry
          </button>
          <a
            href="/"
            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-neutral)] px-4 py-2 text-sm font-medium text-[var(--ui-body)] transition hover:bg-[var(--ui-neutral-hover)]"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
