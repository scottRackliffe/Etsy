# ADR-070: Product scope and non-goals — Etsy store owner capabilities

## Status

Accepted

## Date

2026-05-24

## Context

The application serves a **single-user, local** vintage/antique Etsy shop (Trudy's Classic Treasures). Store owners have many possible needs; without an explicit scope matrix, implementers infer features from silence or duplicate Etsy.com. Phase 1b requires every reasonable capability to be classified: **v1 in app**, **post-v1**, **Etsy-only (no app feature)**, or **never**.

**Companion docs:** Feature detail remains in ADR-001–069, [ui-design.md](../ui-design.md), [DOC_FUNCTIONAL_UX_COVERAGE_AUDIT.md](../DOC_FUNCTIONAL_UX_COVERAGE_AUDIT.md).

## Decision

### Scope classes

| Class         | Meaning                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **v1**        | Specified in an ADR; must be implemented per [no-developer-questions-build.md](../no-developer-questions-build.md) §5 priorities |
| **post-v1**   | Documented intent; not required for first complete UI pass                                                                       |
| **etsy-only** | User uses Etsy shop manager or buyer/seller messages on Etsy; app may link or display read-only Etsy data only                   |
| **never**     | Out of product scope for this codebase                                                                                           |

### Capability matrix (Etsy vintage/antique store owner)

#### Core loop — v1

| Capability                                                     | Class | Spec                                             |
| -------------------------------------------------------------- | ----- | ------------------------------------------------ |
| Connect Etsy (OAuth), shop selector                            | v1    | ADR-007, 016, 034                                |
| Sync orders → customers, addresses, orders, line items         | v1    | ADR-019                                          |
| Manual orders + multi-line items                               | v1    | ADR-003, 015, 031                                |
| Mark paid / mark shipped (ship-until-paid + override)          | v1    | ADR-021, 031                                     |
| Void / cancel order (no row delete)                            | v1    | ADR-022, design-decisions §4                     |
| Inventory CRUD, statuses, condition, pictures                  | v1    | ADR-002, 010, 026, 030, 033                      |
| Listing workshop (manual / AI / portable) + approve + publish  | v1    | ADR-023, 011                                     |
| **AI listing generation** (research, price, full fields, photo paste, Google comps) in the inventory lifecycle | v1 | ADR-085, 081, 082 (supersedes the standalone Listing Coach, ADR-072) |
| Customers, addresses, ship-to on orders                        | v1    | ADR-003, 017                                     |
| Outstanding to-do list + deep-link to record                   | v1    | ADR-020, 035, 009                                |
| Reports (13 types) PDF/CSV, date range                         | v1    | ADR-006, 013, 036, 038, 039, 054, 056            |
| Shipping labels (local print, no carrier API)                  | v1    | shipping-label-carrier-templates, ui-design §5.9 |
| Config (business, shipping info, AI, backup, tax, sample data) | v1    | ADR-034, 027, 039, 069                           |
| Profit/margin, tax report, aging, accounting export            | v1    | ADR-038, 039, 054, 056                           |
| Backup / restore                                               | v1    | ADR-027                                          |
| Activity audit log                                             | v1    | ADR-037                                          |
| Global search, notifications, print queue, recent items        | v1    | ADR-041, 051, 055, 063                           |
| First-run wizard + sample data                                 | v1    | ADR-044, 069                                     |
| UI consistency (colors, navigation, feedback)                  | v1    | ADR-071, System_Colors.md                        |

#### Operations — post-v1

| Capability                                        | Class   | Spec / notes                                  |
| ------------------------------------------------- | ------- | --------------------------------------------- |
| Side commands panel                               | post-v1 | ADR-009; v1 uses inline actions (ADR-028)     |
| Side outstanding panel (persistent)               | post-v1 | ADR-009; v1 uses Outstanding tab + deep links |
| Panel layout flip                                 | post-v1 | ADR-009                                       |
| Outstanding type: Etsy not synced at query time   | post-v1 | ADR-020 type 3                                |
| Outstanding type: validation_issue runtime checks | post-v1 | ADR-020 type 7                                |
| Export inventory to CSV                           | post-v1 | ADR-047 Notes; import is v1                   |
| Bulk merge duplicate groups (3+)                  | post-v1 | ADR-053                                       |
| VIP repeat badge (5+ orders)                      | post-v1 | ADR-066                                       |
| Per-state tax rates                               | post-v1 | ADR-039                                       |
| Off-site backup (S3, Drive)                       | post-v1 | ADR-027                                       |
| Custom keyboard shortcuts                         | post-v1 | ADR-049                                       |
| Undo persisted across refresh                     | post-v1 | ADR-067                                       |
| Service Worker / true offline reads               | post-v1 | ADR-050                                       |
| Full-text search (FTS5)                           | post-v1 | ADR-041                                       |
| Light theme / theme switcher                      | post-v1 | ADR-071 (dark only v1)                        |
| Reorder from customer history                     | post-v1 | ADR-052                                       |

#### Etsy platform — etsy-only (no dedicated app workflow)

| Capability                                      | Class     | Rationale                                                             |
| ----------------------------------------------- | --------- | --------------------------------------------------------------------- |
| Buyer/seller **messages** (Conversations)       | etsy-only | Etsy inbox; app may show link “Open on Etsy” from order detail        |
| **Shop policies** editor (returns, privacy)     | etsy-only | Managed in Etsy shop settings                                         |
| **Reviews** — read/respond                      | etsy-only | Etsy Reviews UI                                                       |
| **Etsy Ads** / offsite ads                      | etsy-only | Etsy Ads manager                                                      |
| **Promotions / sales** (Etsy coupons)           | etsy-only | Etsy marketing tools                                                  |
| **Case/dispute** resolution                     | etsy-only | Etsy resolution center                                                |
| **Payment account / payouts**                   | etsy-only | Etsy Payments dashboard                                               |
| Listing **variations** editor (size/color SKUs) | etsy-only | Complex Etsy listing UI; app tracks single inventory row + `quantity` |
| **Shop analytics** (traffic, conversion)        | etsy-only | Etsy Stats; optional future dashboard link                            |

#### Explicit never

| Capability                                      | Class | Rationale                                 |
| ----------------------------------------------- | ----- | ----------------------------------------- |
| Live **carrier API** rate shop / label purchase | never | ADR-011, shipping-label-carrier-templates |
| **Scrape** Etsy or bypass official API          | never | etsy-compliance.md                        |
| **Multi-marketplace** (eBay, Amazon, Shopify)   | never | Single Etsy shop app                      |
| **Multi-user** roles / permissions              | never | Single-user local app                     |
| **SaaS multi-tenant** hosting                   | never | Local SQLite app                          |
| Native **iOS/Android** apps                     | never | Responsive web (ADR-061)                  |

### Seller workflows — v1 decisions (previously undocumented)

#### Refunds and returns

- **Class:** **etsy-only** for processing refunds through Etsy Payments.
- **v1 in app:** Optional fields on order detail (ADR-031 Notes): `payment_status` may be set to `refunded` manually for record-keeping; display badge `Refunded` (ADR-071). No Etsy refund API automation in v1.
- **UI copy:** “Process refunds on Etsy. You can mark this order as refunded here for your records.”

#### Buyer gift message / order note from Etsy

- **Class:** **v1 read-only display** when present in synced `etsy_receipts.receipt_json` or mapped order `notes`.
- **UI:** Order detail section “Buyer message” (read-only) if Etsy receipt contains gift message or buyer note fields per ADR-019 mapping.

#### Partial shipments / split fulfillment

- **Class:** **post-v1** for multiple shipments per order.
- **v1:** One shipment per order (`shipping_date`, `shipper`, `tracking_number` on order header). Multi-quantity line items supported; not multi-parcel.

#### Export inventory CSV

- **Class:** **post-v1** (symmetry with ADR-047 import).

### v1 navigation model (summary)

- **Tabs:** Dashboard | Sales | Inventory | Customers | Reports | Tutorial & Tips | Outstanding | Config (ADR-009, ui-design §2).
- **Header:** Global chrome per ui-design §1b and ADR-071 §3.
- **Context in place:** Outstanding or global search → deep link `?orderId=`, `?itemId=`, `?customerId=` (ADR-035).
- **No** persistent side commands/outstanding panels in v1.

## Consequences

- **Positive:** Implementers never guess whether to build Etsy Messages; product owner expectations are explicit; post-v1 backlog is named.
- **Negative:** Matrix must be updated when scope changes; “etsy-only” features may tempt one-off links without ADR updates.

## Notes

- Cross-ref: ADR-071 (visual consistency), DOC_FUNCTIONAL_UX_COVERAGE_AUDIT.md, no-developer-questions-build.md §4.8.
- When adding a feature, update this matrix **and** the feature ADR in the same PR.
