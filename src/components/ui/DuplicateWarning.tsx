"use client";

import Link from "next/link";

export function DuplicateWarning({
  message,
  links,
  onDismiss,
}: {
  message: string;
  links?: Array<{ href: string; label: string }>;
  onDismiss?: () => void;
}) {
  return (
    <div className="mt-1 rounded-lg border border-[var(--ui-yellow)]/40 bg-[var(--ui-yellow)]/10 px-2 py-1.5 text-xs text-[var(--ui-body)]">
      <p>{message}</p>
      {links && links.length > 0 ? (
        <ul className="mt-1 list-none space-y-0.5">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="text-[var(--ui-accent)] hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-1 text-[var(--ui-muted)] hover:underline"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
