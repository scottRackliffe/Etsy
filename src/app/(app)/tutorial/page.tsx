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
    body: "Start by opening Settings and connecting your Etsy shop. Click the Connect button to begin the OAuth flow — you will be redirected to Etsy to authorize access, then sent back to the app. Once connected, choose your active shop from the shop selector in the header. The first-run setup wizard walks you through this step-by-step if you are starting fresh.\n\nAfter your shop is connected, sync your recent orders by clicking Sync on the Dashboard or from the Orders tab. The sync process pulls Etsy receipts and automatically creates customer records, shipping addresses, and order line items in your local database. Each receipt is imported exactly once, so running sync multiple times is safe and will never create duplicate orders.\n\nYou can also configure automatic syncing from Settings. Set an interval (for example, every 30 minutes) and the app will pull new orders in the background while you work. If the sync encounters a problem — such as an expired token — the app refreshes your credentials automatically and retries. Check the activity log on the Dashboard for a record of every sync.",
  },
  {
    id: "inventory",
    category: "Getting started",
    title: "Add inventory with pictures",
    body: "To add a new item, open the Inventory tab and click Add New Item. Fill in the basics: item number, description, purchase cost, and condition. The detail panel on the right lets you upload up to 20 main pictures and 5 condition pictures using drag-and-drop or the file picker. The first picture automatically becomes the thumbnail shown in the inventory list, so choose your best hero shot for that slot.\n\nOnce your pictures and details are in place, you can draft your Etsy listing content right in the inventory detail panel. The listing fields — title, description, tags, product story, condition notes, and more — are all inline. You can write them manually, or click Regenerate with AI to have the app analyze all your uploaded photos and generate a complete listing draft. There is also a separate Listing Coach tab for a fully guided new-listing flow that walks you through photo classification, research, and AI composition step by step.\n\nBefore an item is ready to list, make sure the condition code, at least one picture, and a sale price are set. The listing quality score badge on each item gives you a quick read on completeness — hover over it for specific tips on what to improve. Items move through statuses from Draft to In Stock to Listed as you work through the process.",
  },
  {
    id: "add-new-item",
    category: "Inventory",
    title: "Add New Item — photos in, listing out",
    body: "The Add New Item flow is designed to get you from a pile of newly purchased vintage items to a polished Etsy listing as quickly as possible. Start on the Inventory tab and click Add New Item. Enter where you bought the item, what you paid, and a brief description. Then paste or drag your item photos directly into the picture grid — the app accepts JPEG, PNG, WebP, and GIF files up to 15 MB each.\n\nWith your photos uploaded, use the AI compose feature to generate a full listing draft. The app sends every uploaded picture — main shots and condition photos alike — to your configured AI provider, which returns a structured draft including title, description, tags, product story, and condition clarity notes. Review the generated content carefully. You can edit any field, re-score the listing quality, and regenerate individual sections until everything reads well. The quality score updates in real time as you make changes.\n\nWhen you are satisfied, approve the draft to unlock the Publish to Etsy button. You will also need to set the Etsy category (taxonomy), the when-made era, and confirm that a shipping profile and return policy are in place — either on the item or as defaults in Settings. This workflow requires AI to be configured under Settings → AI Settings, where you can also test the connection before relying on it.",
  },
  {
    id: "listing",
    category: "Listing content",
    title: "The listing lifecycle",
    body: "Every inventory item moves through a single listing lifecycle driven by one context-aware button in the inventory detail panel. The button's label tells you the next step: Evaluate Data when the item still needs basic information or a photo, Generate Listing once it has enough to author content, and Evaluate Listing Quality after content exists. You never juggle separate modes or approval states — the same flow works for every item.\n\nGenerate Listing sends all of the item's photos and context to your AI provider and returns a complete, editable draft: title, description, tags, product story, condition clarity, pricing notes, and a recommended sale price based on research. You can paste images directly from your clipboard into the photo grid, and you can open the Google research panel to paste comparable-item screenshots or text that feed into the AI. After generating, refine any single field with its Fix button or rewrite everything at once with the global refine box, and edit any text manually. Citations and a compliance check are shown so you can see the evidence behind the content.\n\nEvaluate Listing Quality scores the listing against the quality rubric and lists exactly what to improve. When the listing reaches the quality-ready phase, the Publish to Etsy button becomes active (it also checks that the Etsy category, when-made era, return policy, and shipping profile are set). Once published, the item's status moves to Listed and its Etsy listing ID is stored. If you later edit listing content, the item drops out of the ready phase and must pass quality again before re-publishing — and if it is already on Etsy, the app asks whether to update the existing listing or create a new one. Configure your AI provider and publish defaults (default category, who-made, when-made era) in Settings so they carry over to every new item.",
  },
  {
    id: "remediation-cycle",
    category: "Listing content",
    title: "Improving a listing with the remediation cycle",
    body: "Once a listing has been generated, run Evaluate Listing Quality to score it on a 0–100 scale against a 85-point quality gate. The score tells you how close the listing is to what Etsy search rewards, and it breaks the gap into a list of specific items to fix — some the AI can handle, some only you can.\n\nThe AI-fixable items (title, description, and tags) are addressed one pass at a time through the remediation cycle. After the quality score appears you will see two action buttons:\n\n• Start cycle (or Cycle again after the first pass) — runs one improvement pass: the AI rewrites only the flagged listing text using the scoring engine's own guidance, then re-scores and shows you the change in points so you can judge whether progress is real.\n• Advance AI — brings in a more capable AI model for a tougher pass. Use this if the standard cycle has stalled or you want to push the score higher. You can choose this at any point.\n\nYou can stop at any time by simply not tapping either button. There is no automatic loop — every pass requires your go-ahead.\n\nFor individual fields, each AI-fixable row also has a Fix button so you can target just that one item. The global refine box (below the score) lets you type your own freeform feedback — for example, 'Emphasize the hand-painted details' — and the AI incorporates it on the next pass.\n\nSome items are yours to supply, not the AI's. The quality score will call out things like missing required photos, an unset Etsy category, shipping profile, or item attributes. For photos, tap Download PDF to get a printable shot list that tells you exactly which photos to take and what each one should show. Once you have added the photos and filled in the structured fields, run Evaluate Listing Quality again — those items will clear from the list. When the score reaches 85 the Publish to Etsy button becomes active.\n\nWhat the AI needs to start: before Generate Listing is available, the item must have an item number, a description, a condition, and at least one photo. Everything else — price, category, shipping — is either generated as a recommendation or flagged by the quality score for you to complete.",
  },
  {
    id: "shipping",
    category: "Fulfillment",
    title: "Print shipping labels locally",
    body: "Shipping labels are generated locally using information you provide — there is no automated connection to USPS, UPS, FedEx, or any other carrier API. Before you can print a label, go to Settings → Shipping Info and fill in your return address and account details for each carrier you use. The app stores this information per carrier, so you can have different return addresses or account numbers for different services.\n\nTo print a label, open an order in the Orders tab detail panel and click the Print Label button. The label pulls the ship-to address from the order (which was either entered manually or imported from an Etsy sync) and combines it with your stored return address for the selected carrier. If the carrier's Shipping Info section is incomplete, the app blocks label generation and tells you exactly which fields to fill in under Settings.\n\nYou can also add orders to the print queue for batch printing. Open the print queue from the header menu, add orders from their detail panels, and print them all at once as a combined PDF. This is especially useful when you have a batch of orders to ship after a busy sales day. The app tracks whether each order has been shipped via the order status and the Outstanding tab flags any paid orders that still need to go out.",
  },
  {
    id: "outstanding",
    category: "Daily workflow",
    title: "Check Outstanding daily",
    body: "The Outstanding tab is your daily action list. It automatically surfaces everything that needs your attention: unpaid orders, paid orders that have not shipped yet, inventory items that are missing listing content, and items that are ready to list but have not been published. This list is entirely data-driven — you do not add tasks manually, the app builds it from the current state of your orders and inventory.\n\nEach row in the Outstanding list is clickable and deep-links you to the exact record that needs work. Clicking an unpaid order takes you to the Sales tab with that order selected and highlighted. Clicking an unlisted inventory item opens the Inventory tab with the item's detail panel visible. Clicking a customer issue navigates to the Customers tab. After you take action — mark an order as paid, ship a package, approve a listing — the item automatically disappears from Outstanding on the next refresh.\n\nYou can filter the Outstanding list by type to focus on one category at a time, such as only unshipped orders or only unlisted items. The list refreshes automatically, so you can leave it open throughout the day as a live to-do board. Checking Outstanding first thing in the morning is one of the best habits you can build — it ensures nothing slips through the cracks.",
  },
  {
    id: "reports",
    category: "Reports",
    title: "Reports for operations and taxes",
    body: "The Reports tab gives you access to a full suite of business reports. Operational reports include Sales, Costs, Profit by Item, and Inventory Aging — each one can be generated as a PDF for printing or exported as a CSV for spreadsheets. Financial reports include Sales Tax Summary (for tracking tax collected), Income MTD and YTD summaries, and per-order documents like invoices and thank-you notes that you can print and include with shipments.\n\nMost reports support date range filtering. Use the date picker at the top of the Reports page to set a start and end date, or choose from presets like This Month, Last Quarter, or Year to Date. The app only includes active orders in revenue and purchase reports — voided and cancelled orders are automatically excluded so your numbers stay accurate. After generating a report, you get four actions: Print, Export PDF, Export CSV, or Cancel.\n\nFor tax time, the Sales Tax Summary report breaks down tax collected by period, and you can cross-reference it with the tax payments you have recorded. The Accounting Export generates a journal-style CSV suitable for importing into QuickBooks or other accounting software, using your chart of accounts and GL transaction rules. See the separate articles on Balance Sheet, Income Statement, and accounting export for more detail on those features.",
  },
  {
    id: "vendors",
    category: "Vendors & sourcing",
    title: "Managing vendors",
    body: "The Vendors tab lets you keep a directory of every supplier, estate sale company, antique dealer, and auction house you buy from. Each vendor record stores contact information, address, payment terms, account numbers, and notes. You can flag preferred vendors and organize them by category to quickly find the right source when you are planning a buying trip.\n\nVendors link directly to your purchase records and receipts. When you log a purchase on an inventory item or create a receipt on the Receipts tab, use the VendorPicker dropdown to associate it with a vendor. The VendorPicker supports fuzzy matching — start typing a name and it suggests matches from your vendor list. If OCR has extracted a vendor name from a scanned receipt, the picker uses that as a hint to pre-select the right vendor. When you update a vendor's name, the change cascades to all linked purchase and receipt records automatically.\n\nVendor records use soft-delete, meaning you can deactivate a vendor you no longer buy from without losing the historical purchase data tied to them. You can search, sort, and paginate the vendor list just like any other tab. The vendor detail panel shows full contact info, notes, and a summary of linked purchases so you can quickly see your buying history with each source.",
  },
  {
    id: "receipt-scanning",
    category: "Vendors & sourcing",
    title: "Receipt scanning and OCR",
    body: "The Receipts tab is where you track your buying-trip paperwork. Each receipt represents a purchase from a vendor — it stores the vendor name, purchase date, shipping cost, a reference number, and an image of the physical receipt. You can upload a photo or scan of the receipt, and the app extracts key details using OCR to save you manual entry time.\n\nOnce a receipt is created, add individual line items to it — each line has a description and a cost. You can then link each line item to an existing inventory item or create a new inventory item directly from the receipt. This linkage is bidirectional: unlinking an item from a receipt removes the association on both sides without deleting either record. Linking items to receipts is one of the best ways to keep your cost basis accurate for profit calculations and tax reporting.\n\nReceipts work hand-in-hand with the Vendors tab. If you select a vendor from the VendorPicker when creating a receipt, the vendor name auto-fills and the receipt becomes part of that vendor's purchase history. You can expand any receipt in the list to see its line items, edit details, or upload a replacement image. The receipt image is stored locally and viewable directly in the app, so you always have the original paperwork on hand if questions come up at tax time.",
  },
  {
    id: "ap-lite",
    category: "Financial",
    title: "Expenses and bill tracking",
    body: "The Expenses feature lets you track business expenses and overhead costs that are not tied to a specific inventory item. Think of it as a lightweight accounts-payable system: you can record expenses like shipping supplies, booth rental fees, software subscriptions, advertising costs, and any other overhead that goes into running your shop. Each expense record captures the date, amount, payment method, vendor, category, and whether it is tax-deductible.\n\nFor recurring expenses — monthly subscriptions, quarterly booth rent, annual domain renewals — you can mark an expense as recurring and set the frequency and next due date. The app tracks when the next payment is expected so you can plan your cash flow. You can also attach a receipt image or invoice scan to any expense, and OCR will attempt to extract the amount and vendor name to speed up data entry.\n\nExpenses integrate with the rest of your financial picture. Tax-deductible expenses feed into your tax reporting. Expenses marked as cost of goods sold (COGS) factor into your profit calculations. If you have set up a chart of accounts and GL transaction rules, expenses can be mapped to the appropriate GL accounts for your accounting export. The expense detail panel shows all of these details at a glance and supports full editing, so you can correct or reclassify expenses as your bookkeeping needs evolve.",
  },
  {
    id: "reports-accountant",
    category: "Financial",
    title: "Reports for your accountant",
    body: "When it is time to hand numbers to your accountant or file your own taxes, the app provides three key tools: the Balance Sheet, the Income Statement (also called a Profit and Loss or P&L), and the Accounting Export. The Balance Sheet shows your assets, liabilities, and equity at a point in time — including inventory on hand valued at cost. The Income Statement summarizes revenue, cost of goods sold, and operating expenses over a date range so you can see net profit or loss for any period.\n\nBoth reports pull their data from your chart of accounts, which you can customize in Settings → Accounting. The app seeds a starter chart of accounts with standard categories like Sales Revenue, COGS — Product, Shipping Revenue, and common expense accounts. You can add, rename, or deactivate accounts to match how your accountant categorizes things. GL transaction rules map your sales, purchases, and expenses to the correct debit and credit accounts automatically.\n\nThe Accounting Export generates a journal-style CSV that most accounting software (QuickBooks, Wave, Xero) can import directly. It includes one row per transaction with date, account, debit, credit, and a description. Use the date range filter to export exactly the period you need — a month, a quarter, or a full year. Between the Balance Sheet for a snapshot, the Income Statement for period performance, and the CSV export for your accountant's software, you have a complete financial reporting toolkit without leaving the app.",
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
