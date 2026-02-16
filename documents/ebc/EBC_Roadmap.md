# Etsy Business Console (EBC) — Roadmap

Version: Draft  
Status: High-level development plan  
Last Updated: 2026-02-16
Current Phase: Planning

Disclaimer: The term "Etsy" is a trademark of Etsy, Inc. This project references Etsy APIs and workflows but is not endorsed or certified by Etsy, Inc.

============================================================
PHASE 0 — BOOTSTRAP FOUNDATIONS
============================================================
Goals:

- Establish base folder structure.
- Define item schema (SKU, title, category, etc.).
- Define seller profile schema.
- Define configuration files (.json).

Outputs:

- EBC root folder + submodules
- seller_profile.json
- item_schema.json
- config.json (global)

============================================================
PHASE 1 — SELLER PROFILE MODULE
============================================================
Purpose:
Provide a single source of truth for name, address, email, tax settings,
shipping defaults, UPS/USPS credentials, QuickBooks category mapping.

Outputs:

- seller_profile.py (load, save, validate)
- seller_profile.json (user-edited)

============================================================
PHASE 2 — INVENTORY MANAGER
============================================================
Purpose:
Store every item and its metadata.

Features:

- Add item
- Edit item
- Delete item
- Load/save items to SQLite or CSV
- Track SKU, cost, price, weight, dimensions, category, tags

Outputs:

- inventory_manager.py
- items.db or items.csv

============================================================
PHASE 3 — LISTING CREATOR ENGINE
============================================================
Purpose:
Build optimized Etsy listings automatically.

Features:

- Title generation
- Tag generation (13)
- Description templates
- Category selection
- Listing quality checker
- Export to Etsy CSV

Outputs:

- listing_engine.py
- listing_templates/

============================================================
PHASE 4 — SHIPPING INTEGRATION
============================================================
Purpose:
Generate shipping files for UPS WorldShip and USPS/PirateShip.

Features:

- Export shipping CSV from item + buyer info
- Store package profiles
- Generate label PDFs (future)

Outputs:

- shipping_export.py
- shipping_profiles.json

============================================================
PHASE 5 — ACCOUNTING MODULE
============================================================
Purpose:
Support taxes, profit tracking, inventory value, QuickBooks/Quicken exports.

Features:

- Cost basis tracking
- Profit calculations
- 1099-K prep sheet
- QuickBooks CSV export

Outputs:

- accounting.py

============================================================
PHASE 6 — CATALOG GENERATOR
============================================================
Purpose:
Generate printable or email catalogs for customer use.

Outputs:

- catalog_generator.py
- catalog_templates/

============================================================
PHASE 7 — OPTIONAL UI LAYER
============================================================
Purpose:
Provide a desktop UI (Tkinter/PySide6) or web UI (Flask/FastAPI).

============================================================
PHASE 8 — COMMERCIALIZATION
============================================================
Purpose:
Package EBC as a product for Etsy sellers.

Outputs:

- Documentation
- Installer
- Licensing model
