# Knowledge base: Tutorial and tips — design

The app includes a **Tutorial and tips** knowledge base: one place for the tutorial (how Etsy works, how this app helps), tips to improve sales, pricing guidance, and links to your own files. It is presented as its own tab with **search**, **index**, and **links to files outside the program but in the system folder**.

---

## 1. Name and purpose

- **Name:** **Tutorial and tips** (shown in the tab bar and in the UI). Tutorial and tips are merged in this single section.
- **Purpose:** Help users understand Etsy, use the app, and improve sales. Content is read-only (tutorial + tips, suggestions); no commands that change data.

---

## 2. Search

- **Search box** at the top of the Tutorial and tips view. User types a query (e.g. “pricing”, “photos”, “condition”).
- **Scope:** Search runs over the **in-app knowledge base content** (titles, section headings, and body text of built-in articles) and, if desired, over **metadata for system-folder files** (e.g. file name, title, or description if we store it). We do not require full-text search inside external PDFs unless we add it later.
- **Results:** List of matching **articles or sections** (with snippet or breadcrumb) and matching **system-folder files** (by name/description). Clicking a result opens that article or opens the file (see below).
- **Intuitive:** Placeholder text like “Search tutorial and tips…” so it’s clear what is being searched.

---

## 3. Index

- **Index** is a browsable list of topics so users can navigate without searching.
- **Structure:** Hierarchical or flat list of topics, e.g.:
  - How Etsy works (marketplace, listings, orders, fees, policies)
  - How this app helps (dashboard, sales, inventory, customers, reports, config)
  - Tips to improve sales (photos, titles, descriptions, policies, shipping)
  - How to set prices (costs, cost-based and market-based pricing, psychology)
  - Pictures and condition (why pictures matter, condition grades, directory picker)
  - Etsy rules we follow (compliance, links to policies)
  - **System folder files** (see below): listed as a category or section in the index; each entry is a link to a file.
- **Display:** Sidebar or top section in Tutorial and tips. Clicking an index entry scrolls to that section in the main content area or opens the linked article/file.
- **Intuitive:** Clear labels; index entries match the way the content is organized (same headings as in [tutorial.md](tutorial.md) and related docs).

---

## 4. Links to files outside the program but in the system folder

- **System folder:** A folder **on the user’s system** that holds files (PDFs, docs, etc.) that are **outside the application code** but that the app can **link to**. Two options:
  - **Option A — App’s `system` folder:** A folder named `system` (or similar) inside the application directory (e.g. `etsy/system/` or `etsy/system/knowledge-base/`). User (or installer) places files there; app lists them and shows links.
  - **Option B — User-configured path:** In Config, user sets a path to a folder on their machine (e.g. `~/Documents/TrudysEtsyGuides`). App lists files in that folder and shows links.
  - We can support both: default `system` subfolder plus an optional override path in Config.
- **What the app does:**
  - **List** files in the system folder (e.g. by name; optional: filter by extension like `.pdf`, `.md`).
  - **Show** each file as a **link** in the Tutorial and tips view (e.g. in the Index under “Guides in system folder” or “Your documents”).
  - **Open** when the user clicks: open the file with the **system default application** (e.g. PDF with default PDF viewer, doc with default app). So the file stays on disk and is not embedded in the app; the app only provides the link.
- **Links to files outside of the program but in the system folder** = the app displays links that point to these files; clicking opens them in the OS. No requirement to copy files into the app bundle.
- **Optional:** In Config, user can add a **custom title or description** for a system-folder file so it appears with a friendly name in the index and search (e.g. “Tips for Getting Featured on Etsy” for `Tips for Getting Featured on Etsy.pdf`).

---

## 5. Built-in content

- The knowledge base **merges tutorial and tips** in one place. Main built-in content is [tutorial.md](tutorial.md): **Part 1** How Etsy works, **Part 2** How this app helps, **Part 3** Tips to improve sales, **Part 4** How to set prices. Additional articles:
  - **Why pictures matter** — from [pictures-and-sales.md](pictures-and-sales.md).
  - **Etsy compliance** — short summary and link to [etsy-compliance.md](etsy-compliance.md) or in-app view.
- All appear in the **Index** and are **searchable**. They can be shown in-app (rendered from markdown or HTML) or as links that open the doc in the app’s documents viewer.

---

## 6. Summary: Tutorial and tips tab

| Element | Behavior |
|--------|----------|
| **Search** | Search box; search over in-app content and system-folder file names (and optional metadata). Results open the article or the file. |
| **Index** | Browsable list of topics (How Etsy works, How this app helps, Sales tips, Pricing, Pictures, Etsy rules, System folder files). Click to go to section or open file. |
| **Links to system folder** | App lists files in the designated system folder; each is a link. Click opens file in the system default app (outside the program). Path set in app’s system folder and/or Config. |

---

## 7. Config

- **System folder path (optional):** Config can expose “Tutorial and tips folder” so the user can set a custom path for “files outside the program but in the system folder.” If unset, use default (e.g. `system/knowledge-base` or `system/tips` inside the app directory).
- **“Why pictures matter” link** can point to the built-in doc or to a file in the system folder (existing Config option).

---

*This design replaces the earlier “Tutorial” tab description with “Tips and suggestions” and adds search, index, and system-folder links. Tutorial and tips are merged in one tab: search, index, system-folder links; built-in content is the tutorial (tutorial.md) plus Why pictures matter and Etsy compliance. Implementation can follow this when building the tab.*
