"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TextInput } from "@/components/ui/FormField";

type TipFile = { filename: string; title: string };

type Article = { id: string; title: string; category: string; body: string };

const BUILTIN_ARTICLES: Article[] = [
  {
    id: "connect",
    category: "Getting started",
    title: "Connect Etsy and sync orders",
    body: "Connect your Etsy shop from Config, select your active shop, then sync receipts from Sales or Dashboard. Orders import as customers and line items automatically.",
  },
  {
    id: "inventory",
    category: "Getting started",
    title: "Add inventory with pictures",
    body: "Create items on the Inventory tab, upload pictures, set condition and costs in the detail panel, then open the listing workshop when you are ready to draft content.",
  },
  {
    id: "listing-coach",
    category: "Listing workshop",
    title: "Listing Coach — paste photos, get a listing",
    body: "Inventory → Add with Listing Coach. Paste item photos from Mac Photos (⌘V), optionally add a Google Visual Search screenshot, confirm a few short answers, and save a composed title, description, and tags. Requires AI configured in Config. See Listing_Coach_Guide in the tips list below.",
  },
  {
    id: "listing",
    category: "Listing workshop",
    title: "Approve before publishing",
    body: "Listing drafts must reach approved state before Publish to Etsy is enabled. Use manual, in-app AI, or import modes — configure AI and publish defaults in Config.",
  },
  {
    id: "shipping",
    category: "Fulfillment",
    title: "Print shipping labels locally",
    body: "Set Shipping Info per carrier in Config → Shipping Info. Print labels from the Sales order detail panel using order ship-to plus your stored return address — no carrier API.",
  },
  {
    id: "outstanding",
    category: "Daily workflow",
    title: "Check Outstanding daily",
    body: "The Outstanding tab lists unpaid orders, unshipped paid orders, and inventory that still needs listing work. Click any row to jump to the record.",
  },
  {
    id: "reports",
    category: "Reports",
    title: "Reports for operations and taxes",
    body: "Use Reports for sales, costs, profit-by-item, sales tax summary, and accounting export. Set date ranges on supported reports before previewing CSV or PDF.",
  },
];

export default function TutorialPage() {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<TipFile[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState<string>(BUILTIN_ARTICLES[0]?.id ?? "");
  const [selectedFile, setSelectedFile] = useState<{ title: string; content: string } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  useEffect(() => {
    void fetch("/api/tutorial/files", { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((data: { files?: TipFile[] }) => setFiles(data.files ?? []))
      .catch(() => setFiles([]));
  }, []);

  const filteredArticles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BUILTIN_ARTICLES;
    return BUILTIN_ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.body.toLowerCase().includes(q)
    );
  }, [query]);

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) => f.title.toLowerCase().includes(q) || f.filename.toLowerCase().includes(q)
    );
  }, [query, files]);

  const selectedArticle =
    BUILTIN_ARTICLES.find((a) => a.id === selectedArticleId) ?? filteredArticles[0] ?? null;

  const openTipFile = useCallback(async (filename: string) => {
    setLoadingFile(true);
    try {
      const response = await fetch(`/api/tutorial/files/${encodeURIComponent(filename)}`, {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        title?: string;
        content?: string;
      };
      if (response.ok && data.content) {
        setSelectedFile({ title: data.title ?? filename, content: data.content });
        setSelectedArticleId("");
      }
    } finally {
      setLoadingFile(false);
    }
  }, []);

  const categories = useMemo(() => {
    const set = new Set(BUILTIN_ARTICLES.map((a) => a.category));
    return [...set];
  }, []);

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <h3 className="mb-1 text-lg font-semibold text-[var(--ui-title)]">Tutorial and tips</h3>
      <p className="mb-4 text-sm text-[var(--ui-muted)]">
        Search built-in guidance or open markdown guides from{" "}
        <code className="text-xs">system/tips/</code>.
      </p>

      <TextInput
        value={query}
        onChange={setQuery}
        placeholder="Search tutorial and tips…"
        className="mb-4 w-full"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <aside className="space-y-4 lg:col-span-1">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
              Index
            </p>
            <ul className="space-y-3 text-sm">
              {categories.map((category) => (
                <li key={category}>
                  <p className="font-medium text-[var(--ui-title)]">{category}</p>
                  <ul className="mt-1 space-y-1 pl-2">
                    {BUILTIN_ARTICLES.filter((a) => a.category === category)
                      .filter((a) => filteredArticles.some((f) => f.id === a.id))
                      .map((article) => (
                        <li key={article.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedArticleId(article.id);
                              setSelectedFile(null);
                            }}
                            className={`text-left text-xs hover:text-[var(--ui-accent)] ${
                              selectedArticleId === article.id
                                ? "text-[var(--ui-accent)]"
                                : "text-[var(--ui-body)]"
                            }`}
                          >
                            {article.title}
                          </button>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>

          {filteredFiles.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                Tips folder
              </p>
              <ul className="space-y-1 text-sm">
                {filteredFiles.map((file) => (
                  <li key={file.filename}>
                    <button
                      type="button"
                      disabled={loadingFile}
                      onClick={() => void openTipFile(file.filename)}
                      className="text-left text-xs text-[var(--ui-body)] hover:text-[var(--ui-accent)] disabled:opacity-60"
                    >
                      {file.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

        <article className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 lg:col-span-2">
          {selectedFile ? (
            <>
              <h4 className="mb-2 text-base font-semibold text-[var(--ui-title)]">
                {selectedFile.title}
              </h4>
              <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap text-sm text-[var(--ui-body)]">
                {selectedFile.content}
              </pre>
            </>
          ) : selectedArticle ? (
            <>
              <p className="mb-1 text-xs uppercase tracking-wide text-[var(--ui-muted)]">
                {selectedArticle.category}
              </p>
              <h4 className="mb-3 text-base font-semibold text-[var(--ui-title)]">
                {selectedArticle.title}
              </h4>
              <p className="text-sm leading-relaxed text-[var(--ui-body)]">
                {selectedArticle.body}
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--ui-muted)]">No topics match your search.</p>
          )}
        </article>
      </div>
    </section>
  );
}
