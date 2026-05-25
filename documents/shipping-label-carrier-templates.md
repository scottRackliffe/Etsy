# Shipping label (no ambiguity)

This document is the **single source of truth** for the **Print shipping label** command and for **Shipping Info**.

**No automated connection to any shipping service.** There is no connection—no APIs, no opening carrier websites—to USPS, UPS, FedEx, DHL, or any other carrier. The app generates and prints the label using only data stored in the system (order ship-to + Shipping Info). **Automated connections to shippers** (e.g. carrier APIs) are a **future consideration**; not in current scope.

**References:** design-decisions-implementation.md §1; ui-design (Sales commands, Config); ADR-018 (Notes). Storage: ADR-017 (Shipping Info).

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
2. **Precondition — order:** The order must have (a) **Shipper** set (USPS, UPS, FedEx, DHL, or Other), and (b) **Full ship-to address**: ship_to_first_name, ship_to_last_name, ship_to_address_line_1, ship_to_city, ship_to_state_province, ship_to_country, ship_to_postal_code (ship_to_address_line_2 optional). If the order is missing any of this, show a message in user terms (e.g. "Please set the shipper and ship-to address for this order first") and stop.
3. **Precondition — Shipping Info:** The system must know what Shipping Info is required for the selected shipper to produce a complete label. If that Shipping Info is not stored or is incomplete, **do not** generate or print the label. Show a message that Shipping Info is needed and how to navigate to it (e.g. "Shipping Info is needed for [Shipper] labels. Go to Config → Shipping Info to add it."). Stop.
4. **Generate and print:** Using the order’s ship-to data and the stored Shipping Info for that shipper, the app generates the label and prints it. No connection to any carrier. The user gets a printed label from the app.

---

## Data used for the label

- **From the order (ship-to snapshot on `orders`):** `ship_to_first_name`, `ship_to_last_name`, `ship_to_address_line_1`, `ship_to_address_line_2` (optional), `ship_to_city`, `ship_to_state_province`, `ship_to_country`, `ship_to_postal_code` for the selected `orders.id`.
- **From Shipping Info (stored):** Whatever is required for the chosen shipper to complete the label (e.g. return address, account number). Stored per carrier; user enters it in Config → Shipping Info.

---

## Summary

| Item                                        | Decision                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Automated connection to carriers?           | **None.** No APIs, no carrier websites.                                                                  |
| Who generates the label?                    | The app, using order data + Shipping Info.                                                               |
| Where is label data from?                   | Order (ship-to) + Shipping Info (stored in system).                                                      |
| If Shipping Info is missing when needed?    | Do not print. Tell user Shipping Info is needed and how to navigate to it (e.g. Config → Shipping Info). |
| Where does user add Shipping Info?          | Config → Shipping Info.                                                                                  |
| Automated connections to shippers (future)? | Future consideration; not in current scope.                                                              |

_End of shipping-label-carrier-templates.md._
