# ADR-034: Config completion — business profile, shipping info, date format, and full settings

## Status

Accepted

## Date

2026-05-24

## Context

The Config page currently has three sections: AI settings, Etsy publish defaults, and icon paths. Many settings required by other features are missing from the UI: business profile (needed for invoices and reports per ADR-013), shipping carrier defaults (needed for shipping labels and mark-shipped flow per ADR-031), date format preference, backup configuration (per ADR-027), and Etsy connection status. Users must set these values through the API directly or not at all.

## Decision

**Expand the Config page to include all application settings, organized into logical sections.** Each section is a card in a responsive grid layout.

---

### Config page layout

```
┌─────────────────────────────────────────────────────────┐
│ Configuration                                           │
├──────────────────────────┬──────────────────────────────┤
│ Business profile         │ Etsy connection              │
├──────────────────────────┼──────────────────────────────┤
│ Shipping defaults        │ Shipping API (EasyPost)      │
├──────────────────────────┼──────────────────────────────┤
│ AI settings (existing)   │ Publish defaults             │
├──────────────────────────┼──────────────────────────────┤
│ Tax settings             │ Item numbering               │
├──────────────────────────┼──────────────────────────────┤
│ Store categories         │ Display preferences          │
│                          │ (existing, expanded)         │
├──────────────────────────┼──────────────────────────────┤
│ Icons and branding       │ Backup and restore           │
│ (existing)               │                              │
└──────────────────────────┴──────────────────────────────┘
```

On screens < `lg`: single column, cards stack vertically.

Each section is a card with a heading, fields, and a "Save" button.

---

### Section 1: Business profile (NEW)

Settings keys and fields:

| Setting key               | Label            | Input type                | Notes                                                                                                   |
| ------------------------- | ---------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `business_name`           | Business name    | `TextInput`               | Used in invoice/report headers                                                                          |
| `business_address_line_1` | Address line 1   | `TextInput`               |                                                                                                         |
| `business_address_line_2` | Address line 2   | `TextInput`               | Optional                                                                                                |
| `business_city`           | City             | `TextInput`               |                                                                                                         |
| `business_state_province` | State / Province | `TextInput`               |                                                                                                         |
| `business_postal_code`    | Postal code      | `TextInput`               |                                                                                                         |
| `business_country`        | Country          | `TextInput`               | Default: "US"                                                                                           |
| `business_phone`          | Phone            | `TextInput` type="tel"    | Optional                                                                                                |
| `business_email`          | Email            | `TextInput` type="email"  | Optional                                                                                                |
| `business_logo_path`      | Business logo    | File upload or path input | Used on invoices, reports (per ADR-013). Max height 1.5 in on PDF. Stored in `uploads/branding/logo.*`. |

**Logo upload:**

- Small preview of current logo (if set).
- "Upload logo" button: opens file picker for image files.
- Uploaded file processed and stored at `uploads/branding/logo.{ext}`.
- Setting value stores the relative path.

**Save behavior:** Single "Save business profile" button. Toast on success.

---

### Section 2: Etsy connection (NEW)

Display-only section showing connection status:

| Field             | Source                            | Display                                                 |
| ----------------- | --------------------------------- | ------------------------------------------------------- |
| Connection status | Session cookie presence           | Badge: "Connected" (green) or "Not connected" (neutral) |
| Shop name         | `shops[0].shop_name` from context | Text                                                    |
| Shop ID           | `shops[0].shop_id`                | Text                                                    |
| Token expires     | `etsy_token_expires_at` setting   | Formatted date/time                                     |
| Last Etsy sync    | `last_etsy_sync_at` setting       | Formatted date/time or "Never"                          |
| Redirect URI      | `ETSY_REDIRECT_URI` env var       | Display for reference during Etsy app setup             |

Actions:

- "Reconnect" button: triggers OAuth flow (same as header Connect).
- "Disconnect" button: clears session (with confirmation per ADR-032).

---

### Section 2b: Tax settings (NEW — ADR-039)

| Setting key        | Label                  | Input type                            | Notes                                                                                                                                                      |
| ------------------ | ---------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tax.default_rate` | Default sales tax rate | `TextInput` type="number" step="0.01" | Percentage value (e.g. `8.25` = 8.25%). Enter as percentage, e.g. 8.25 for 8.25%. Used when creating manual orders; Etsy-synced orders use `orders.tax_total` from receipt. |

> **Reconciliation note (2026-06-09):** Tax rate stored as percentage number (e.g., `8.25`), not decimal fraction (`0.0825`). Step changed from `0.0001` to `0.01`. Auto-calculation: `tax_total = subtotal × (rate / 100)`. Matches ADR-039 §2.

Save: "Save tax settings" button. See ADR-039 for report `sales-tax-summary`.

Also in this section (ADR-069): **Sample data** — "Load sample data" / "Remove sample data" buttons calling `POST` / `DELETE /api/seed/sample-data` with ConfirmDialog (ADR-032).

---

### Section 3: Shipping defaults (NEW)

| Setting key                   | Label                       | Input type                | Notes                                                                                              |
| ----------------------------- | --------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `shipping.default_carrier`    | Default carrier             | `SelectInput`             | Options: `USPS`, `UPS`, `FedEx`, `DHL`, `Other`. Default: `USPS`. Pre-filled in mark-shipped flow. |
| `shipping.default_origin_zip` | Origin postal code          | `TextInput`               | Seller's zip code for rate estimation                                                              |
| `shipping.default_weight_oz`  | Default package weight (oz) | `TextInput` type="number" | Default weight for shipping cost estimation                                                        |
| `shipping.usps_account`       | USPS account #              | `TextInput`               | Optional                                                                                           |
| `shipping.ups_account`        | UPS account #               | `TextInput`               | Optional                                                                                           |
| `shipping.fedex_account`      | FedEx account #             | `TextInput`               | Optional                                                                                           |

Save: "Save shipping defaults" button.

---

### Section 3b: Shipping API — EasyPost (NEW, ADR-074)

Integrated shipping label purchase via EasyPost. Appears below Shipping defaults when EasyPost API key is configured (or always shown with setup prompt).

| Setting key                    | Label                       | Input type                | Notes                                                                                         |
| ------------------------------ | --------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `easypost.api_key_encrypted`   | EasyPost API key            | `TextInput` type="password" | Encrypted at rest (AES-256-GCM). Masked display. Never returned to browser.                  |
| `easypost.address_validation`  | Validate addresses          | `Checkbox`                | "Validate ship-to addresses before rate shopping." Default: off.                              |
| `easypost.label_format`        | Label format                | `SelectInput`             | Options: `PDF` (default), `PNG`.                                                              |
| `easypost.label_size`          | Label size                  | `SelectInput`             | Options: `4x6` (thermal, default), `Letter` (8.5x11).                                        |
| `easypost.default_weight_oz`   | Default weight (oz)         | `TextInput` type="number" | Default parcel weight for rate shopping when not set on order.                                 |
| `easypost.default_length_in`   | Default length (in)         | `TextInput` type="number" | Default parcel length.                                                                        |
| `easypost.default_width_in`    | Default width (in)          | `TextInput` type="number" | Default parcel width.                                                                         |
| `easypost.default_height_in`   | Default height (in)         | `TextInput` type="number" | Default parcel height.                                                                        |
| `easypost.preferred_carrier`   | Preferred carrier           | `SelectInput`             | Options: `Any` (default), `USPS`, `UPS`, `FedEx`, `DHL`. Used for batch label auto-selection. |
| `easypost.preferred_service`   | Preferred service           | `TextInput`               | Optional. Service name for batch (e.g., "GroundAdvantage").                                   |

**Test connection** button: calls EasyPost address verification API with a dummy address to validate the API key. Shows:
- Success: "Connected (Free Access — Wallet Carriers)" in green.
- Failure: error message in red with troubleshooting link.

**Collapsible troubleshooting section** at bottom: common problems and solutions per ADR-074 §10.

Save: "Save shipping API settings" button.

---

### Section 4: AI settings (EXISTING — minor enhancement)

Existing card with model, API key, base URL, timeout. Already implemented.

- API key input should use `type="password"`.
- **Listing Coach (ADR-072)** requires a configured AI key. When missing, coach routes return **503** `AI_NOT_CONFIGURED`; Config should show helper text: "Required for Listing Coach and Generate in app."
- **Test connection** must succeed before coach is offered as primary Inventory CTA (optional UI gate; API enforces regardless).

---

### Section 5: Publish defaults (EXISTING — relocated and expanded)

The existing Etsy publish defaults section. Moved here from the Inventory page (per ADR-030, eliminates duplication). Setting keys renamed to `default_*` to clarify these are defaults that can be overridden per-item on the inventory record.

| Setting key                          | Label                  | Input type    | Notes                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ---------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `etsy.publish.default_who_made`      | Who made               | `SelectInput` | Options: `i_did`, `someone_else`, `collective`. Default: `someone_else` (appropriate for vintage/antique shops). |
| `etsy.publish.default_when_made`     | When made (era)        | `SelectInput` | Options per ADR-017 §1a: `made_to_order`, `2020_2026`, `2010_2019`, `2004_2009`, `2000_2003`, `1990s`, `1980s`, `1970s`, `1960s`, `1950s`, `1940s`, `1930s`, `1920s`, `1910s`, `1900s`, `1800s`, `1700s`, `before_1700`. Default: `2004_2009` (vintage items are 20+ years old). |
| `etsy.publish.default_taxonomy_id`   | Default category       | `SelectInput` | Etsy taxonomy ID. Used when no per-item `etsy_taxonomy_id` is set. |
| `etsy.publish.return_policy_id`      | Return policy ID       | `TextInput` type="number" | **Required.** Etsy return policy ID. Must be set before any listing can be published. Obtain from Etsy Shop Manager → Policies. |

> **Note:** Per-item overrides on the inventory record take precedence over these global defaults at publish time. See ADR-017 §1c.

Save: "Save publish defaults" button.

---

### Section 6: Display preferences (NEW)

| Setting key        | Label            | Input type    | Notes                                                                                                          |
| ------------------ | ---------------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| `ui.date_format`   | Date format      | `SelectInput` | Options: `MM/DD/YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`. Default: `MM/DD/YYYY`. Used by all date displays in the UI. |
| `ui.currency_code` | Currency         | `SelectInput` | Options: `USD`, `CAD`, `GBP`, `EUR`, `AUD`. Default: `USD`. Display-only for v1.                               |
| `ui.page_size`     | Records per page | `SelectInput` | Options: `10`, `25`, `50`, `100`. Default: `25`. Used by all paginated lists.                                  |
| `ui.timezone`      | Timezone         | `SelectInput` | Browser-detected default. Used for date display (all stored dates are UTC).                                    |

Save: "Save display preferences" button.

---

### Section 7: Icons and branding (EXISTING — no changes)

Existing card with screen header path, report header path, and sizes.

---

### Section 8: Backup and restore (NEW — per ADR-027)

| Element             | Type                      | Notes                                                              |
| ------------------- | ------------------------- | ------------------------------------------------------------------ |
| Last backup         | Display                   | Date/time of last successful backup, or "No backups yet"           |
| Backup schedule     | `SelectInput`             | Options: `Manual only`, `Daily`, `Weekly`. Default: `Manual only`. |
| Backup retention    | Display                   | "Rolling FIFO: keeps last {n} backups" (per ADR-027)               |
| "Backup now" button | `Button variant="accent"` | Triggers immediate backup. Toast on success with file size.        |
| Backup history      | Small table               | Last 5 backups: date, size, actions (Restore, Download)            |
| Restore             | `Button variant="danger"` | Confirmation per ADR-032. Creates safety-net backup first.         |

---

### Settings persistence

All settings use the existing `settings` table and `/api/settings/[key]` endpoint. The Config page saves each section's settings as a batch (multiple PUT calls in sequence, same as current pattern).

Add helper: `saveSettingsBatch(updates: Array<{key: string, value: string}>)` in a shared utility to avoid the per-field sequential loop in every save handler.

---

### Remove duplicated settings from Inventory page

Per ADR-030, the AI settings and Etsy publish defaults sections currently duplicated on the Inventory page are removed. The Inventory page shows a link: "Configure AI and publish settings →" that navigates to `/config`.

## Consequences

- **Positive**
  - All application settings accessible from one page.
  - Business profile enables complete invoices and professional reports.
  - Shipping defaults streamline the mark-shipped workflow.
  - Display preferences let users control date/currency formatting.
  - Backup UI implements ADR-027 frontend requirements.
  - No more duplicated settings sections.
- **Negative**
  - Config page becomes the largest settings page — card layout must remain scannable.
  - Business logo upload requires the image serving infrastructure from ADR-033.
