# ADR-002: Inventory data model and fields

## Status

Accepted

## Date

2025-02-15

## Context

The application must track sellable items with full financial and operational detail: identification, description, costs, revenue, dates, pictures, and optional categorization. “Other costs” can be multiple line items per item (each with a description), so they need a flexible structure.

## Decision

**Primary table: Inventory (one row per item)**

Store the following in the database:

- **Identity:** item number — **required** and **unique** across inventory (used for display and for matching in bulk import).
- **Description:** description (text)
- **Financial:** purchase cost, shipping cost, sale revenue
- **Dates:** date purchased (when you acquired the item), date listed (when you listed it for sale, e.g. on Etsy), date of sale, shipping date
- **Media:** picture 1 through picture 10 (stored as paths or URLs in the database; files stored on disk or object storage). **Picture icon (thumbnail):** Create and store a small thumbnail when the item is created or when its first picture is added (e.g. a `thumbnail_path` column or a thumbnails store keyed by inventory id); used by pick lists (ADR-015). Size/format at implementation discretion (e.g. small JPEG). If the item has no picture yet, pick lists show a placeholder.
- **Condition (Etsy-aligned, antique/vintage terms):**
  - **condition_code** — Item condition using **commonly used antique condition terms on Etsy**:
    - **Mint/Near Mint** — Item appears unused, pristine, and without flaws.
    - **Excellent** — Very minor signs of use, consistent with age, but no damage.
    - **Very Good** — Light wear, minor surface scratches, or patina, but structurally sound.
    - **Good** — Typical vintage/antique wear, minor flaws (e.g., small chip, light stains) noted in description.
    - **Fair/As-Is** — Visible damage, significant wear, or requiring restoration.
    Store the chosen code; align with Etsy API if it exposes a condition field. (Etsy classifies 20+ years as vintage; antiques are generally 100+ years.)
  - **has_condition_issue** — Boolean: true if the item has a blemish, flaw, or issue that should be documented (and shown to buyers). When true, condition_notes and up to 5 condition pictures are relevant.
  - **condition_notes** — Optional text: accurate description of flaws. Use specific terminology where appropriate (e.g. “patina”, “crazing” for ceramics, “foxing” for paper). Sellers must accurately describe flaws; this field supports that.
  - **Condition pictures:** condition_picture_1 through condition_picture_5 — Up to 5 pictures that **substantiate the condition grade**: all sides, marks, and defects. Photos are crucial for the chosen condition. Paths or URLs in the database; files on disk or object storage. Empty slots are null.
- **Status:** e.g. Draft, In stock, Listed, Sold, Reserved, Retired. We support **Draft** for items being prepared. When **date listed** is entered, the item is treated as **In stock** and **Listed** (the app may set status to Listed automatically or the user may set it via “Mark as listed”); status is stored in the database so filters and outstanding lists can use it.
- **Optional:** Etsy listing ID (for linking to Etsy), quantity (default 1), category/tags, notes
- **Audit:** created_at, updated_at

**Other costs**

- Use a **separate table** (e.g. `inventory_other_costs`) for “other costs” so each item can have multiple cost lines.
- Each row: reference to inventory item, **amount**, **description** (text), and optional created_at.
- This supports multiple entries such as “Repair $5”, “Cleaning $2”, etc., all stored in the database.

## Consequences

- **Positive**
  - All requested inventory fields are in the database.
  - Other costs are flexible and queryable (e.g. total “other” costs per item or across items).
  - Pictures are referenced in the DB; actual files can be stored in a consistent location (e.g. by item id).
  - Condition section supports Etsy-aligned condition codes and up to 5 blemish/issue photos for buyer transparency.
- **Negative**
  - Ten main picture columns plus five condition picture columns (or normalized picture tables) add schema size; we accepted this for clarity.
  - Etsy condition code values must be checked against the current Etsy API (listing condition field) when implementing; fallback set if the API does not define an enum.

## Notes

- Shipper is not on inventory; it is on the purchase/shipment record (see ADR-004).
- Sale revenue and dates may be filled when an item is sold and linked to a customer purchase.
- How pictures are imported (upload, import from folder, replace, reorder, remove) is defined in ADR-010; the same mechanisms apply to condition_picture_1–5 (upload/replace/remove; typically no “import from folder” for condition pics).
- **Etsy condition codes:** We use the **commonly used antique condition terms** on Etsy (Mint/Near Mint, Excellent, Very Good, Good, Fair/As-Is). Map to Etsy Listing API condition field if/when it exposes an enum. Documentation and photos (condition_notes, condition_picture_1–5) are required for accurate selling; specific terms (patina, crazing, foxing) are standard.
