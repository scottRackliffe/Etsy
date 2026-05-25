# Etsy Business Console (EBC) — Vision & High-Level Architecture

Version: Draft  
Status: Active design (vision-level)  
Last Updated: 2026-02-16

Disclaimer: The term "Etsy" is a trademark of Etsy, Inc. This project references Etsy APIs and workflows but is not endorsed or certified by Etsy, Inc.

============================================================

1. # PURPOSE OF THE SYSTEM
   The Etsy Business Console (EBC) is a lightweight Python-based application
   designed to help manage all operational aspects of an Etsy business. This
   includes inventory, listing generation, pricing, shipping, customer catalogs,
   and accounting integrations. The system is intended for Trudy’s Classic
   Treasures but is architected so it can later become a commercial product
   offered to other Etsy sellers.

EBC follows a modular pipeline architecture and uses:

- Config-driven behavior
- Inbound/Outbound processing
- Modular action libraries
- Seller-centered workflows
- Clean separation of concerns

# ============================================================ 2. CORE CAPABILITIES (BIG-VISION SUMMARY)

---

## 2.1 Listing Creator (AI-Assisted)

Purpose:
Create complete, optimized Etsy listings using structured templates, rules,
and Etsy’s own search best practices.

Capabilities:

- Generate Etsy-optimized titles
- Generate full descriptions
- Generate complete set of 13 tags
- Auto-select Etsy categories using the full category hierarchy
- Suggest pricing based on comps
- Produce a full Etsy CSV for bulk uploads

Inputs:

- Item data (photos, measurements, condition, cost)
- Seller defaults
- Category maps
- Tag/keyword libraries

Outputs:

- Listing template
- Etsy CSV row
- Photograph recommendations

---

## 2.2 Inventory Manager

Purpose:
Track all items from acquisition through sale.

Stores:

- SKU / internal ID
- Title
- Category
- Description
- Tags
- Attributes
- Cost basis
- Expected sale price
- Quantity
- Condition notes
- Dimensions & weight
- Photos
- Storage location
- Dates listed/sold

Outputs:

- Inventory sheets
- Catalogs
- Listing CSVs
- Accounting exports

---

## 2.3 Seller Profile Manager

Purpose:
Centralize all seller-related information for automated use.

Stored fields:

- Seller name
- Address
- Email
- Etsy shop name
- Return address
- Shipping defaults
- Tax settings
- UPS/USPS integration details
- QuickBooks category mapping

Used for:

- Auto-populating Etsy listings
- Generating packing slips & invoices
- Creating catalogs
- Generating shipping exports
- Accounting outputs

---

## 2.4 Shipping Integration

Purpose:
Generate shipping labels, export files, and package data.

Capabilities:

- Export UPS WorldShip CSV
- Export USPS/PirateShip CSV
- Auto-populate buyer info
- Store weight/dimensions profiles
- Generate PDF labels (future)
- Integrate tracking updates (future)

---

## 2.5 Accounting Integration

Purpose:
Support bookkeeping, taxes, profitability tracking, and 1099 reporting.

Outputs:

- QuickBooks import CSV
- Cost of Goods Sold report
- Profit & Loss summary
- 1099-K preparation worksheet
- Inventory valuation
- Sales/tax summaries

Tracks:

- Cost basis
- Sold price
- Taxes
- Fees (future)
- Net profit

---

## 2.6 Catalog Generator

Purpose:
Create customer-facing catalogs for marketing & outreach.

Outputs:

- PDF catalogs
- HTML email catalogs
- Printable show sheets
- Wholesale catalogs

Inputs:

- Seller profile
- Inventory metadata
- Photos

# ============================================================ 3. HIGH-LEVEL ARCHITECTURE (BASED ON SCIS/ALS)

---

## 3.1 Inbound Pipeline

Handles:

- Item ingestion (photos, descriptions, measurements)
- Classification
- Metadata extraction
- Clean/dirty state tracking
- Action recommendations (title/tag generation)

---

## 3.2 Outbound Pipeline

Produces:

- Etsy listing CSV rows
- Shipping label exports
- Accounting CSV exports
- Customer catalogs

---

## 3.3 Action Library

A modular library of small, atomic functions for:

- Title generation
- Description templates
- Tag generation
- Category selection
- Price recommendation
- Shipping export formatting
- QuickBooks CSV formatting
- Catalog generation

Each action is:

- Modular
- Versioned
- Classified by stability (prod/test/experimental)
- Easily extended

---

## 3.4 Configuration Layer

Stores:

- Seller profile
- Item schema
- Category mapping
- Tag/keyword templates
- Accounting settings
- Shipping defaults
- UI settings (future)

# ============================================================ 4. FUTURE ROADMAP

- Web UI version (Flask/FastAPI)
- Photo analysis module (auto-recognize patterns/items)
- Etsy API integration (direct listing publishing)
- Shipping-rate comparison
- Multi-store support
- SaaS-style product for commercial use

# ============================================================ 5. CURRENT STATUS

This document is a vision-level design artifact. It is not a feature-complete implementation spec.

Use it to guide roadmap direction. For implementation-level behavior in the current app, use:

- `documents/adr/`
- `documents/ui-design.md`
- `documents/design-decisions-implementation.md`
