# ADR-074: Shipping API integration (EasyPost)

## Status

Accepted

> **WS-F update (2026-06-21, ADR-080):** The EasyPost rate-shopping modal and all label UI now
> live in the **Shipping module** (`/shipping`, `src/components/shipping/ShippingPanel.tsx`),
> not in the Sales order-detail panel. No API endpoints changed.

## Date

2026-06-11

## Context

The app currently generates local HTML address labels from order ship-to data and stored Shipping Info (return address). These labels contain no postage, no tracking number, and no carrier rate — the user must separately purchase postage through a carrier website or third-party service (e.g., Pirate Ship, post office counter).

This creates a fragmented workflow: manage the order in one app, buy postage in another, copy/paste tracking numbers back. For a vintage shop shipping 20–200 packages per month, this friction adds up.

EasyPost provides a shipping API that enables rate shopping, label purchase, address validation, and automatic tracking — all through a single integration. Their Free Access plan (Wallet Carriers) includes 3,000 labels/month at no cost, with $0.08/label after that. No monthly fee. No carrier accounts required. Official Node.js SDK available.

**This ADR integrates EasyPost as an optional shipping provider while keeping the existing local label generation as a fallback for one-off or non-standard situations.**

---

## Decision

### 1. Provider and plan

| Item | Value |
|---|---|
| Provider | EasyPost (https://www.easypost.com) |
| Plan | Free Access (Wallet Carriers) |
| Monthly fee | $0 |
| Per-label cost | Free for first 3,000/month; $0.08/label after |
| Carriers included | USPS, UPS, FedEx, DHL, and 100+ others |
| Node.js SDK | `@easypost/api` (npm) |
| API base URL | `https://api.easypost.com/v2/` |
| Auth | API key in header (`Authorization: Bearer <key>`) |
| Test mode | Sandbox keys (prefix `EZAK...test_`) — no real charges |

### 2. Credential management

| Item | Detail |
|---|---|
| Env var | `EASYPOST_API_KEY` (primary — production or test key) |
| Settings storage | `easypost.api_key_encrypted` — encrypted at rest with AES-256-GCM (same mechanism as Etsy tokens per ADR-025) |
| Precedence | Env var overrides stored setting (allows easy test/prod switching) |
| Client exposure | Never. All EasyPost calls are server-side only. |
| Sensitive key filter | Added to settings API denylist (ADR-073 compliance) |

The user enters their EasyPost API key in **Settings → Shipping API**. The app encrypts and stores it. The key is never returned to the browser.

### 3. Two-mode shipping (integrated + legacy)

The app supports two shipping label modes. The user can always choose either:

| Mode | When to use | What happens |
|---|---|---|
| **Buy & Print Label** (EasyPost) | Normal shipping — postage-paid label with tracking | Rate shop → select rate → buy label → print PDF → tracking auto-saved |
| **Print address label** (legacy) | One-off situations, pre-paid postage, manual carrier drop-off | Generate HTML label from ship-to + return address — no postage, no tracking |

Both buttons appear in the Order Detail Panel. If EasyPost is not configured, only the legacy button appears.

---

### 4. API flow — step by step

#### 4a. Create shipment and get rates

```
User clicks "Buy & Print Label" on an order
  → App validates: shipper set, ship-to complete, ship-from (business address) complete
  → POST /api/orders/[id]/shipping-rates
    → Server builds EasyPost Shipment:
        from_address: business address from settings
        to_address: order ship-to snapshot
        parcel: order-level overrides or default parcel from settings
    → EasyPost returns rates from all enabled carriers
    → Server returns rates to client
  → Client displays Rate Shopping Modal
```

#### 4b. Rate shopping modal (UI)

The modal displays available shipping options:

```
┌─────────────────────────────────────────────────────┐
│  Ship Order #1042 — Jane Smith, Austin TX           │
│                                                     │
│  Package: 12 oz, 8×5×5 in   [Edit dimensions]      │
│                                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │ Carrier        Service           Est.    Price  ││
│  ├─────────────────────────────────────────────────┤│
│  │ ● USPS         Ground Advantage  3-5d   $4.15  ││
│  │ ○ USPS         Priority Mail     2-3d   $8.70  ││
│  │ ○ UPS          Ground            3-5d   $9.22  ││
│  │ ○ USPS         Priority Express  1-2d   $28.75 ││
│  │ ○ UPS          Next Day Air      1d     $45.10 ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  Selected: USPS Ground Advantage — $4.15            │
│                                                     │
│  [Cancel]                    [Buy this label $4.15] │
└─────────────────────────────────────────────────────┘
```

- Rates sorted by price (lowest first) by default
- User can sort by delivery estimate
- Cheapest rate pre-selected
- Radio button selection
- "Edit dimensions" opens inline fields to adjust weight/dimensions and re-fetch rates
- Estimated delivery days shown when available from carrier

#### 4c. Buy label

```
User clicks "Buy this label $4.15"
  → POST /api/orders/[id]/shipping-buy  { rateId: "rate_..." }
    → Server calls EasyPost: client.Shipment.buy(shipmentId, rateId)
    → EasyPost returns:
        - label_url (PDF)
        - tracking_code
        - selected_rate details
    → Server downloads label PDF, saves to local storage
    → Server updates order:
        - tracking_number = tracking_code
        - easypost_shipment_id = shipment.id
        - label_url = local path to saved PDF
        - label_format = "pdf"
        - shipping_rate_cents = rate in cents
        - shipping_carrier_service = "USPS Ground Advantage"
        - shipping_date = today (if not already set)
    → Server logs activity: "shipping.label_purchased"
    → Returns label path + tracking to client
  → Client shows Label Confirmation:
      - Label thumbnail/preview
      - "Print Label" button
      - Tracking number (copyable)
      - "Track package" link
      - Cost paid
```

#### 4d. Print label

The purchased label PDF is served via `GET /api/orders/[id]/shipping-label`:
- If `label_url` exists (EasyPost label): serve the PDF file
- If no `label_url`: fall back to legacy HTML label generation
- Query param `?format=pdf` or `?format=html` to force a specific format

The browser opens the PDF in a new tab for printing. Standard browser print dialog.

Label formats:
- **4×6 thermal** (default for shipping labels)
- **8.5×11 letter** (for standard printers — label centered on page)
- Configurable via `easypost.label_format` setting: `"pdf"` (default), `"png"`

#### 4e. Automatic tracking

When a label is purchased:
1. EasyPost automatically creates a tracker for the shipment
2. The tracking code is saved to `orders.tracking_number`
3. The tracking URL is constructed: carrier-specific (e.g., `https://tools.usps.com/go/TrackConfirmAction?tLabels=<code>`)
4. The order detail panel shows:
   - Tracking number (clickable — opens carrier tracking page)
   - Copy-to-clipboard button
   - Last known status (if polled)

**Tracking status polling** (optional enhancement):
- When viewing an order with a tracking number and `easypost_shipment_id`, the app can call `GET /api/orders/[id]/tracking-status` to fetch current status from EasyPost
- Status displayed as a badge: "Pre-Transit", "In Transit", "Out for Delivery", "Delivered", "Returned", "Failure"
- Not polled automatically in v1 — on-demand when viewing the order

---

### 5. Address validation

EasyPost provides address verification. The app uses it as an optional pre-check:

**When:** Before fetching rates (during "Buy & Print Label" flow), if `easypost.address_validation` setting is `"on"`.

**Flow:**
1. Server sends ship-to address to EasyPost Address Verification API
2. EasyPost returns: verified address (normalized), any corrections, or errors
3. If corrections found: show the user both original and suggested addresses
4. User confirms: "Use suggested address" or "Keep original"
5. If verified address differs, update the order's ship-to snapshot
6. If address is invalid (e.g., non-existent ZIP): show error, block label purchase

**UI:**

```
┌────────────────────────────────────────────┐
│  Address Verification                      │
│                                            │
│  We found a correction for this address:   │
│                                            │
│  Original:          Suggested:             │
│  123 Main St        123 Main Street        │
│  Austen, TX 78701   Austin, TX 78701-1234  │
│                                            │
│  [Keep original]   [Use suggested address] │
└────────────────────────────────────────────┘
```

**Settings:**
- `easypost.address_validation`: `"on"` | `"off"` (default: `"off"`)
- When off, skip validation and go straight to rates

---

### 6. Batch label purchase

For shipping multiple orders at once (leverages ADR-040 bulk operations):

**Flow:**
1. User selects multiple orders in the Sales list (checkboxes)
2. Clicks "Batch buy labels"
3. App validates all selected orders have complete ship-to addresses
4. For each order: create shipment, auto-select cheapest rate
5. Progress modal (ADR-043) shows progress: "Buying label 3 of 8..."
6. On completion: summary showing success/failure per order
7. Failed orders listed with reason — user can retry individually

**API:** `POST /api/shipping/batch-buy`
- Body: `{ orderIds: [1, 2, 3], ratePreference: "cheapest" | "fastest" }`
- Returns: `{ results: [{ orderId, success, trackingNumber, error? }] }`

**Rate preference options:**
- `"cheapest"` — auto-select lowest price rate (default)
- `"fastest"` — auto-select shortest delivery estimate
- User can also set a preferred carrier in settings: `easypost.preferred_carrier`

---

### 7. Label refund / void

Unused labels can be refunded within the carrier's refund window (typically 30 days for USPS, varies by carrier).

**Flow:**
1. Order detail panel shows "Void label" button when a purchased label exists and order is not yet shipped
2. User clicks "Void label" → ConfirmDialog (ADR-032): "Void this shipping label? The postage will be refunded to your EasyPost wallet."
3. `POST /api/orders/[id]/shipping-refund`
   - Server calls EasyPost: `client.Shipment.refund(shipmentId)`
   - Clears `label_url`, `easypost_shipment_id`, `shipping_rate_cents`, `shipping_carrier_service` on the order
   - Keeps `tracking_number` for audit trail (appends "(voided)" to notes)
   - Logs activity: "shipping.label_voided"
4. Client removes label preview, re-enables "Buy & Print Label" button

**Refund status:** EasyPost refunds are not instant. The API returns a refund status:
- `"submitted"` — refund request sent to carrier
- `"refunded"` — carrier confirmed refund
- `"rejected"` — carrier denied refund (e.g., label was scanned/used)

The app stores the refund status and shows it to the user. If rejected, the label cost stands.

---

### 8. Thank-you note and invoice integration

**Thank-you note (ADR-013):** When a tracking number exists on the order, the thank-you note includes:

- After the item list, before the closing:
  - **"Your package is on its way!"** (or "Your order has been shipped!")
  - **Tracking number:** `<tracking_number>`
  - **Carrier:** `<shipping_carrier_service>` (e.g., "USPS Ground Advantage")
  - **Track your package:** `<tracking_url>` (clickable link in PDF)

If no tracking number exists, this section is omitted (backward compatible).

**Invoice (ADR-013):** The invoice includes:

- In the shipping section:
  - **Shipping method:** `<shipping_carrier_service>` when available
  - **Tracking:** `<tracking_number>` when available
  - Shipping charge remains `orders.shipping_total` (buyer-facing)

**Shipping label packing slip:** When printing a label, offer an optional packing slip that includes:
- Order number
- Item list (descriptions + quantities)
- "Thank you for your purchase!"
- Business name and logo

---

### 9. Error handling — complete catalog

Every error the user might encounter, with exact messages and recovery actions:

#### 9a. Configuration errors

| Error | Cause | User message | Actions |
|---|---|---|---|
| No API key | `EASYPOST_API_KEY` not set and no stored key | "Shipping API is not configured. Add your EasyPost API key in Settings → Shipping API." | Navigate to Config |
| Invalid API key | Key format wrong or revoked | "Your EasyPost API key is invalid. Check your key at easypost.com/account and update it in Settings → Shipping API." | Check EasyPost dashboard, update key |
| Test key in production | Using test key (`EZAK...test_`) when not in developer mode | "You are using an EasyPost test key. Labels will be simulated, not real. Switch to a production key for real shipments." | Warning only — allow to proceed |

#### 9b. Pre-flight validation errors

| Error | Cause | User message | Actions |
|---|---|---|---|
| Missing ship-to | Incomplete address on order | "Complete the ship-to address before buying a label. Missing: {fields}." | Edit order |
| Missing ship-from | Business address not set | "Complete your business address in Settings → Business Info before buying labels." | Navigate to Config |
| Missing shipper | No carrier set on order | "Select a carrier (USPS, UPS, etc.) on this order before buying a label." | Edit order |
| No parcel info | No weight/dimensions set | "Package weight is required. Set it on the order or in Settings → Shipping API defaults." | Edit dimensions in modal or Config |

#### 9c. EasyPost API errors

| Error | HTTP | User message | Actions |
|---|---|---|---|
| Rate limit exceeded | 429 | "EasyPost rate limit reached. Please wait a moment and try again." | Auto-retry with backoff (3 attempts) |
| Authentication failed | 401 | "EasyPost authentication failed. Your API key may be expired or revoked." | Check key in Config |
| Address not found | 422 | "The ship-to address could not be verified. Check the address and try again." | Edit address |
| No rates available | 200 (empty rates) | "No shipping rates available for this address and package size. Check dimensions and destination." | Edit parcel or address |
| Carrier error | 422 | "The carrier returned an error: {carrier_message}. Try a different service or carrier." | Select different rate |
| Insufficient funds | 402 | "Your EasyPost wallet balance is insufficient. Add funds at easypost.com/account/wallet." | Add funds to wallet |
| Shipment already purchased | 409 | "A label was already purchased for this shipment. Void the existing label first if you need a new one." | Void existing label |
| Label generation failed | 500 | "EasyPost could not generate the label. This is usually temporary — try again in a moment." | Retry |
| Network error | — | "Could not reach EasyPost. Check your internet connection and try again." | Retry |
| Timeout | — | "The request to EasyPost timed out. This is usually temporary — try again." | Retry |

#### 9d. Refund errors

| Error | User message | Actions |
|---|---|---|
| Label already scanned | "This label has been scanned by the carrier and cannot be voided." | Contact carrier directly |
| Refund window expired | "The refund window for this label has expired." | N/A |
| Refund already submitted | "A refund was already submitted for this label." | Check refund status |

#### 9e. Batch errors

| Error | User message | Actions |
|---|---|---|
| Some orders failed | "Labels purchased for {n} of {total} orders. {failed} orders failed — see details below." | Show per-order errors, retry individually |
| All orders failed | "No labels could be purchased. Check addresses and package info on the listed orders." | Fix issues, retry |

---

### 10. Troubleshooting guide

Displayed in Settings → Shipping API as a collapsible "Troubleshooting" section, and also in Tutorial → Shipping:

**Problem: "No shipping rates returned"**
- Ensure package weight is set (even 1 oz)
- Verify ship-to ZIP code is valid
- Check that ship-from (business) address is complete
- Try removing dimensions and using weight only
- Some carriers don't serve all ZIP codes (e.g., DHL may not serve rural areas)

**Problem: "Address could not be verified"**
- Double-check street number, city, state, and ZIP
- Try the USPS ZIP lookup tool: https://tools.usps.com/zip-code-lookup.htm
- Turn off address validation in Config if the address is known-good but unusual

**Problem: "Authentication failed"**
- Go to https://www.easypost.com/account/api-keys
- Confirm your API key is active (not revoked)
- If using a test key, it starts with "EZAK" and contains "test"
- Copy the key again and re-enter it in Settings → Shipping API

**Problem: "Insufficient funds"**
- EasyPost Wallet Carriers require a funded wallet
- Go to https://www.easypost.com/account/wallet
- Add funds via credit card (minimum $25)
- Unused wallet balance is refundable

**Problem: "Label prints blank or garbled"**
- Try switching label format between PDF and PNG in Settings → Shipping API
- Ensure your printer supports the label size (4×6 or letter)
- Try downloading the label file and opening it directly

**Problem: "Tracking number not updating"**
- Tracking updates can take 24–48 hours after first carrier scan
- Click "Refresh tracking" on the order to poll EasyPost for the latest status
- Pre-transit status is normal until the carrier picks up the package

---

### 11. Settings (complete list)

| Key | Type | Default | Description |
|---|---|---|---|
| `easypost.api_key_encrypted` | string | — | Encrypted API key (AES-256-GCM) |
| `easypost.address_validation` | "on" \| "off" | "off" | Validate addresses before rate shopping |
| `easypost.label_format` | "pdf" \| "png" | "pdf" | Label file format |
| `easypost.label_size` | "4x6" \| "letter" | "4x6" | Label paper size |
| `easypost.default_weight_oz` | number | — | Default parcel weight in ounces |
| `easypost.default_length_in` | number | — | Default parcel length in inches |
| `easypost.default_width_in` | number | — | Default parcel width in inches |
| `easypost.default_height_in` | number | — | Default parcel height in inches |
| `easypost.preferred_carrier` | string | — | Preferred carrier for batch operations (e.g., "USPS") |
| `easypost.preferred_service` | string | — | Preferred service level (e.g., "GroundAdvantage") |

---

### 12. Database changes (ADR-017 addendum)

New columns on `orders` table:

```sql
ALTER TABLE orders ADD COLUMN easypost_shipment_id TEXT;
ALTER TABLE orders ADD COLUMN label_url TEXT;
ALTER TABLE orders ADD COLUMN label_format TEXT;
ALTER TABLE orders ADD COLUMN shipping_rate_cents INTEGER;
ALTER TABLE orders ADD COLUMN shipping_carrier_service TEXT;
```

- `easypost_shipment_id`: EasyPost's shipment ID (e.g., "shp_abc123") — used for refund/tracking lookups
- `label_url`: Local file path to the downloaded label PDF/PNG
- `label_format`: "pdf", "png", or "html" (legacy)
- `shipping_rate_cents`: Postage cost in cents (e.g., 415 = $4.15) — used in profit/cost reports
- `shipping_carrier_service`: Human-readable carrier + service (e.g., "USPS Ground Advantage")

Note: `orders.tracking_number` already exists (ADR-017/031). `orders.shipper` already exists. No changes needed for those.

---

### 13. API endpoints (ADR-018 addendum)

#### POST /api/orders/[id]/shipping-rates

**Purpose:** Create an EasyPost shipment and return available rates.

**Request body:**
```json
{
  "weight_oz": 12,
  "length_in": 8,
  "width_in": 5,
  "height_in": 5
}
```

All fields optional — falls back to order-level values, then settings defaults.

**Success response (200):**
```json
{
  "ok": true,
  "shipment_id": "shp_abc123",
  "rates": [
    {
      "id": "rate_xyz789",
      "carrier": "USPS",
      "service": "Ground Advantage",
      "rate": "4.15",
      "currency": "USD",
      "delivery_days": 4,
      "delivery_date": "2026-06-15"
    }
  ],
  "address_verified": true,
  "address_corrections": null
}
```

**Error responses:** 400 (validation), 401 (auth), 422 (address/parcel), 429 (rate limit), 500 (server)

#### POST /api/orders/[id]/shipping-buy

**Request body:**
```json
{
  "shipment_id": "shp_abc123",
  "rate_id": "rate_xyz789"
}
```

**Success response (200):**
```json
{
  "ok": true,
  "tracking_number": "9400111899563824449661",
  "tracking_url": "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899563824449661",
  "label_url": "/api/orders/42/shipping-label",
  "carrier": "USPS",
  "service": "Ground Advantage",
  "rate_cents": 415
}
```

#### POST /api/orders/[id]/shipping-refund

**Request body:** none (uses stored `easypost_shipment_id`)

**Success response (200):**
```json
{
  "ok": true,
  "refund_status": "submitted"
}
```

#### GET /api/orders/[id]/shipping-label

Updated from current behavior. Now serves:
- Purchased label PDF (if `label_url` exists) — `Content-Type: application/pdf`
- Legacy HTML label (if no `label_url`) — `Content-Type: text/html`
- Query param `?format=html` forces legacy HTML regardless

#### POST /api/shipping/validate-address

**Request body:**
```json
{
  "name": "Jane Smith",
  "street1": "123 Main St",
  "city": "Austin",
  "state": "TX",
  "zip": "78701",
  "country": "US"
}
```

**Success response (200):**
```json
{
  "ok": true,
  "valid": true,
  "original": { ... },
  "verified": { ... },
  "corrections": ["city spelling corrected", "ZIP+4 added"]
}
```

#### POST /api/shipping/batch-buy

**Request body:**
```json
{
  "order_ids": [1, 2, 3],
  "rate_preference": "cheapest",
  "weight_oz": 12,
  "length_in": 8,
  "width_in": 5,
  "height_in": 5
}
```

**Success response (200):**
```json
{
  "ok": true,
  "total": 3,
  "succeeded": 2,
  "failed": 1,
  "results": [
    { "order_id": 1, "success": true, "tracking_number": "940...", "rate_cents": 415 },
    { "order_id": 2, "success": true, "tracking_number": "940...", "rate_cents": 870 },
    { "order_id": 3, "success": false, "error": "Ship-to address incomplete" }
  ]
}
```

---

### 14. Config UI — Shipping API section

Added to Settings page (ADR-034) as a new section between "Shipping defaults" and "Tax settings":

```
┌────────────────────────────────────────────────────────┐
│ Shipping API (EasyPost)                                │
│                                                        │
│ API Key: [••••••••••••yznu]  [Test connection]          │
│ Status: ● Connected (Free Access — Wallet Carriers)    │
│                                                        │
│ Default package:                                       │
│   Weight (oz): [12]   Length (in): [8]                  │
│   Width (in):  [5]    Height (in): [5]                 │
│                                                        │
│ Label format:  [PDF ▾]    Label size: [4×6 ▾]          │
│ Address validation: [☐ Validate addresses before rates]│
│                                                        │
│ Preferred carrier: [Any ▾]                             │
│ Preferred service: [Any ▾]                             │
│                                                        │
│ [Save shipping API settings]                           │
│                                                        │
│ ▸ Troubleshooting                                      │
└────────────────────────────────────────────────────────┘
```

**Test connection** button: calls EasyPost with a no-op address verification to confirm the key works. Shows "Connected" or error message.

---

### 15. Activity log entries (ADR-037)

| Action | Entity type | Detail |
|---|---|---|
| `shipping.label_purchased` | order | `{ carrier, service, rate_cents, tracking_number }` |
| `shipping.label_voided` | order | `{ shipment_id, refund_status }` |
| `shipping.address_validated` | order | `{ corrections_count }` |
| `shipping.batch_completed` | system | `{ total, succeeded, failed }` |

---

### 16. Reports impact

- **Profit by Item (ADR-038):** `shipping_rate_cents` provides actual postage cost data (more accurate than manual `seller_shipping_cost` entries)
- **Costs report (ADR-013):** Postage costs from `shipping_rate_cents` can be included as a shipping cost line item
- **Thank-you note:** Tracking info included (see §8)
- **Invoice:** Carrier and tracking info included (see §8)

---

### 17. File storage

Purchased labels are stored locally:

```
data/labels/<order_id>/label.<format>
```

Example: `data/labels/42/label.pdf`

The `label_url` column stores this relative path. The `GET /api/orders/[id]/shipping-label` endpoint serves the file.

Labels are included in backups (ADR-027) when `backup_include_pictures` is enabled (same flag covers all generated files).

---

### 18. Security considerations

- API key encrypted at rest (AES-256-GCM) — same as Etsy tokens
- API key never sent to the browser — all EasyPost calls are server-side
- API key filtered from `GET /api/settings` denylist
- Test keys produce simulated labels (no real postage purchased)
- Wallet funds are managed at easypost.com — not through our app
- No credit card data stored in the app

---

### 19. Env vars

| Variable | Purpose | Required |
|---|---|---|
| `EASYPOST_API_KEY` | EasyPost API key (production or test) | No (can use stored encrypted key instead) |

---

## Consequences

- **Positive:** One-click shipping labels with real postage and tracking. Rate shopping saves money. Tracking numbers auto-populate on orders, invoices, and thank-you notes. Address validation catches errors before shipping. Batch operations speed up multi-order fulfillment.
- **Negative:** Adds a third-party dependency (EasyPost). Requires an EasyPost account and funded wallet. Per-label cost after free tier ($0.08/label). Network required for label purchase.
- **Mitigated:** Legacy local labels remain as fallback. EasyPost is optional — app fully functional without it.

## Cross-references

- ADR-013: Report output (thank-you note and invoice tracking integration)
- ADR-017: Database schema (new orders columns)
- ADR-018: API surface (new shipping endpoints)
- ADR-025: Token encryption (same AES-256-GCM for EasyPost key)
- ADR-027: Backup (labels included in backup)
- ADR-031: Order detail view (rate shopping modal, label purchase UI)
- ADR-032: Confirmation dialogs (void label)
- ADR-034: Settings page (Shipping API section)
- ADR-037: Activity log (shipping events)
- ADR-038: Profit/margin (postage cost data)
- ADR-040: Bulk operations (batch label purchase)
- ADR-043: Progress indicators (batch progress)
- `documents/shipping-label-carrier-templates.md`: Dual-mode behavior

---

_Sources: EasyPost API documentation (https://docs.easypost.com), @easypost/api npm package, EasyPost pricing (2026-06-11)._
