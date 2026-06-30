# Etsy Business Console (EBC) — Module Structure (Initial Scaffold)

Version: Draft
Status: Planned scaffold
Last Updated: 2026-02-16

Disclaimer: The term "Etsy" is a trademark of Etsy, Inc. This project references Etsy APIs and workflows but is not endorsed or certified by Etsy, Inc.

/ebc
/core
seller_profile.py
config_manager.py
utils.py

/inventory
inventory_manager.py
item_schema.json
inventory.db or inventory.csv

/listing
listing_engine.py
title_actions.py
tag_actions.py
description_templates/
category_map.json

/shipping
shipping_export.py
package_profiles.json

/accounting
accounting.py
quickbooks_export.py

/catalog
catalog_generator.py
catalog_templates/

/config
seller_profile.json
global_config.json

main.py

============================================================
NOTES
============================================================

- Every folder maps to a subsystem.
- All logic is modular and action-based.
- Config drives behavior (no hardcoding).
- This structure is a planning scaffold and may diverge from the current implementation.
