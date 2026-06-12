# Shipping label (no ambiguity)

This document is the **single source of truth** for the **Print shipping label** command and for **Shipping Info**.

**Dual-mode shipping (updated 2026-06-11 per ADR-074):** The app supports two shipping label modes:

1. **EasyPost integrated (ADR-074):** Rate shop across carriers, purchase postage-paid labels with tracking, address validation. Requires an EasyPost API key (configured in Config → Shipping API). This is the recommended mode for regular shipments.
2. **Legacy local labels:** Generates an HTML address label from order ship-to + stored Shipping Info (return address). No postage, no tracking, no carrier API connection. This mode remains available as a fallback for one-off situations, pre-paid postage, or manual carrier drop-off.

Both modes are always available when EasyPost is configured. If EasyPost is not configured, only the legacy mode appears.

**References:** ADR-074 (EasyPost integration); design-decisions-implementation.md §1; ui-design (Sales commands, Config); ADR-018 (Notes, §30). Storage: ADR-017 (Shipping Info, EasyPost columns on orders).

---

## Shipping Info

**What it is:** Data that must be present for a shipping label to be complete and accurate (e.g. account numbers, return/sender address, or other data required by the label for a given carrier). If a label cannot be completed accurately without such data, that data is collected under the name **Shipping Info** and stored in the system.

**Where it lives:** The user enters and edits Shipping Info in the app. Navigation: **Config** (or **Settings**) → **Shipping Info**. The UI must make it clear how to get there (e.g. a "Shipping Info" item in Config).

**What is stored:** Per carrier (USPS, UPS, FedEx, DHL, Other): whatever is needed for the label to be complete. That may include account number, return/sender name and address, or other fields. Storage is in the system (schema/settings per ADR-017).

**Minimum carrier templates (baseline):**

- **USPS:** return/sender name, return address line 1, city, state/province, postal code, country.
- **UPS:** return/sender name, return address fields above, account number (if required by selected label format/workflow).
- **FedEx:** return/sender name, return address fields above, account number (if required by selected label format/workflow).
- **DHL:** return/sender name, return address fields above, account number (if required by selected label format/workflow).
- **Other:** configurable key/value fields plus return/sender address.

If a carrier workflow needs additional fields (for example phone, service class, or billing reference), add them to Shipping Info before allowing label generation.

**When it is missing:** If the user runs **Print shipping label** for an order and the **Shipping Info required for that order’s shipper is missing or incomplete**, the app **must not** generate or print the label. The app **must** tell the user that Shipping Info is needed and how to navigate to it. Example message: _"Shipping Info is needed for [USPS] labels. Go to Config → Shipping Info to add it."_ (Use the actual shipper name and the actual navigation path in your app.)

---

## Print shipping label — behavior

1. User selects an order and chooses **Print shipping label** (Sales tab / commands).
2. **Precondition — order:** The selected `orders` row must have (a) **`shipper`** set (USPS, UPS, FedEx, DHL, or Other), and (b) **full ship-to snapshot**: `ship_to_first_name`, `ship_to_last_name`, `ship_to_address_line_1`, `ship_to_city`, `ship_to_state_province`, `ship_to_country`, `ship_to_postal_code` (`ship_to_address_line_2` optional). If missing, show a message in user terms (e.g. "Please set the shipper and ship-to address for this order first") and stop.
3. **Precondition — Shipping Info:** The system must know what Shipping Info is required for the selected shipper to produce a complete label. If that Shipping Info is not stored or is incomplete, **do not** generate or print the label. Show a message that Shipping Info is needed and how to navigate to it (e.g. "Shipping Info is needed for [Shipper] labels. Go to Config → Shipping Info to add it."). Stop.
4. **Generate and print:** Using the order’s ship-to data and the stored Shipping Info for that shipper, the app generates the label and prints it. No connection to any carrier. The user gets a printed label from the app.

---

## Data used for the label

- **From the order (ship-to snapshot on `orders`):** `ship_to_first_name`, `ship_to_last_name`, `ship_to_address_line_1`, `ship_to_address_line_2` (optional), `ship_to_city`, `ship_to_state_province`, `ship_to_country`, `ship_to_postal_code` for the selected `orders.id`.
- **From Shipping Info (stored):** Whatever is required for the chosen shipper to complete the label (e.g. return address, account number). Stored per carrier; user enters it in Config → Shipping Info.

### Ship-from address (added 2026-06-09)

Ship-from address is populated from business settings: `business_name`, `business_address_line_1`, `business_address_line_2`, `business_address_city`, `business_address_state`, `business_address_postal_code`, `business_address_country`.

If any required ship-from field is missing, the label generation is blocked with message: "Complete your business address in Config → Business Info before printing labels."

---

## Summary

| Item                                        | Decision                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Automated connection to carriers?           | **EasyPost (optional, ADR-074).** Rate shopping, label purchase, tracking, address validation via EasyPost API. |
| Legacy (no-API) label?                      | **Always available.** HTML label from order data + Shipping Info. No postage, no tracking.                |
| Who generates the label?                    | EasyPost mode: EasyPost API generates postage-paid label. Legacy mode: the app generates HTML label.     |
| Where is label data from?                   | EasyPost: ship-to + business address → EasyPost API. Legacy: order (ship-to) + Shipping Info (stored).   |
| If Shipping Info is missing when needed?    | Legacy mode: do not print, tell user to go to Config → Shipping Info. EasyPost: uses business address.   |
| Where does user add Shipping Info?          | Config → Shipping Info (legacy). Config → Shipping API (EasyPost API key and defaults).                  |
| EasyPost configuration?                     | Config → Shipping API: API key, default parcel, label format, address validation, preferred carrier.     |

_End of shipping-label-carrier-templates.md._
