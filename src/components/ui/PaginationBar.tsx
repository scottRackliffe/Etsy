"use client";

import { Button } from "@/components/ui/Button";

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  dense = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  dense?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = total === 0 ? 0 : safePage * pageSize + 1;
  const end = Math.min((safePage + 1) * pageSize, total);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 text-[var(--ui-muted)] ${dense ? "mt-0 text-xs" : "mt-3 text-sm"}`}
    >
      <span>
        Showing {start}–{end} of {total} record{total === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={safePage <= 0}
          onClick={() => onPageChange(Math.max(0, safePage - 1))}
        >
          ← Previous
        </Button>
        <span>
          Page {safePage + 1} of {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={safePage >= totalPages - 1}
          onClick={() => onPageChange(Math.min(totalPages - 1, safePage + 1))}
        >
          Next →
        </Button>
      </div>
    </div>
  );
}
