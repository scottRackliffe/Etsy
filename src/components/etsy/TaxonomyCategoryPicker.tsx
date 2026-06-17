"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TaxonomyNode = {
  id: number;
  parent_id: number | null;
  name: string;
  full_path: string | null;
  level: number;
};

type Props = {
  value: number | null;
  valuePath?: string;
  onChange: (id: number | null, fullPath: string) => void;
  disabled?: boolean;
  className?: string;
};

export default function TaxonomyCategoryPicker({
  value,
  valuePath,
  onChange,
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TaxonomyNode[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<TaxonomyNode[]>([]);
  const [children, setChildren] = useState<TaxonomyNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState(valuePath ?? "");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setSelectedLabel(valuePath ?? "");
  }, [valuePath]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const fetchChildren = useCallback(async (parentId: number | null) => {
    setLoading(true);
    try {
      const url = parentId != null
        ? `/api/etsy-taxonomy/nodes?parent_id=${parentId}`
        : "/api/etsy-taxonomy/nodes";
      const res = await fetch(url);
      const data = (await res.json()) as { items?: TaxonomyNode[] };
      setChildren(data.items ?? []);
    } catch {
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const searchNodes = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/etsy-taxonomy/nodes?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { items?: TaxonomyNode[] };
      setResults(data.items ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setResults([]);
    setBreadcrumb([]);
    void fetchChildren(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleQueryChange = (q: string) => {
    setQuery(q);
    clearTimeout(debounceRef.current);
    if (q.trim().length >= 2) {
      debounceRef.current = setTimeout(() => void searchNodes(q), 250);
    } else {
      setResults([]);
    }
  };

  const drillInto = (node: TaxonomyNode) => {
    setBreadcrumb((prev) => [...prev, node]);
    setQuery("");
    setResults([]);
    void fetchChildren(node.id);
  };

  const selectNode = (node: TaxonomyNode) => {
    const path = node.full_path ?? node.name;
    setSelectedLabel(path);
    onChange(node.id, path);
    setOpen(false);
  };

  const navigateBreadcrumb = (index: number) => {
    if (index < 0) {
      setBreadcrumb([]);
      void fetchChildren(null);
    } else {
      const node = breadcrumb[index];
      setBreadcrumb(breadcrumb.slice(0, index + 1));
      void fetchChildren(node.id);
    }
    setQuery("");
    setResults([]);
  };

  const clearSelection = () => {
    setSelectedLabel("");
    onChange(null, "");
  };

  const showSearch = query.trim().length >= 2 && results.length > 0;

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div
        onClick={handleOpen}
        className={`flex w-full cursor-pointer items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm ${
          disabled ? "cursor-not-allowed opacity-50" : "hover:border-[var(--ui-accent)]"
        }`}
      >
        <span className={`flex-1 truncate ${selectedLabel ? "text-[var(--ui-body)]" : "text-[var(--ui-muted)]"}`}>
          {selectedLabel || "Select Etsy category..."}
        </span>
        {selectedLabel && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearSelection();
            }}
            className="shrink-0 text-xs text-[var(--ui-muted)] hover:text-[var(--ui-red)]"
          >
            &times;
          </button>
        )}
        <svg className="h-4 w-4 shrink-0 text-[var(--ui-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-hidden rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] shadow-lg">
          <div className="border-b border-[var(--ui-border)] p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search categories..."
              className="w-full rounded border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-1.5 text-sm text-[var(--ui-body)] placeholder-[var(--ui-muted)] focus:border-[var(--ui-accent)] focus:outline-none"
            />
          </div>

          {breadcrumb.length > 0 && !showSearch && (
            <div className="flex flex-wrap items-center gap-1 border-b border-[var(--ui-border)] px-2 py-1.5 text-xs">
              <button
                type="button"
                onClick={() => navigateBreadcrumb(-1)}
                className="text-[var(--ui-accent)] hover:underline"
              >
                All
              </button>
              {breadcrumb.map((node, i) => (
                <span key={node.id} className="flex items-center gap-1">
                  <span className="text-[var(--ui-muted)]">&rsaquo;</span>
                  <button
                    type="button"
                    onClick={() => navigateBreadcrumb(i)}
                    className={i === breadcrumb.length - 1
                      ? "font-medium text-[var(--ui-title)]"
                      : "text-[var(--ui-accent)] hover:underline"}
                  >
                    {node.name}
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="max-h-56 overflow-y-auto">
            {loading && (
              <p className="px-3 py-4 text-center text-xs text-[var(--ui-muted)]">Loading...</p>
            )}

            {!loading && showSearch && results.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => selectNode(node)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--ui-card-bg)]"
              >
                <span className="flex-1 text-[var(--ui-body)]">{node.full_path ?? node.name}</span>
                <span className="shrink-0 text-xs text-[var(--ui-muted)]">#{node.id}</span>
              </button>
            ))}

            {!loading && !showSearch && children.map((node) => (
              <div
                key={node.id}
                className="flex w-full items-center gap-1 px-3 py-2 text-sm hover:bg-[var(--ui-card-bg)]"
              >
                <button
                  type="button"
                  onClick={() => selectNode(node)}
                  className="flex-1 text-left text-[var(--ui-body)] hover:text-[var(--ui-title)]"
                >
                  {node.name}
                </button>
                <button
                  type="button"
                  onClick={() => drillInto(node)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-xs text-[var(--ui-accent)] hover:bg-[var(--ui-card-bg)]"
                  title="Browse subcategories"
                >
                  &rsaquo;
                </button>
              </div>
            ))}

            {!loading && !showSearch && children.length === 0 && breadcrumb.length > 0 && (
              <p className="px-3 py-3 text-center text-xs text-[var(--ui-muted)]">
                No subcategories. Select the current category above.
              </p>
            )}

            {!loading && !showSearch && children.length === 0 && breadcrumb.length === 0 && (
              <p className="px-3 py-3 text-center text-xs text-[var(--ui-yellow)]">
                No categories loaded. Sync Etsy categories from Config first.
              </p>
            )}

            {!loading && showSearch && results.length === 0 && (
              <p className="px-3 py-3 text-center text-xs text-[var(--ui-muted)]">
                No matching categories found.
              </p>
            )}
          </div>

          {breadcrumb.length > 0 && !showSearch && (
            <div className="border-t border-[var(--ui-border)] p-2">
              <button
                type="button"
                onClick={() => selectNode(breadcrumb[breadcrumb.length - 1])}
                className="w-full rounded bg-[var(--ui-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Use: {breadcrumb[breadcrumb.length - 1].name}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
