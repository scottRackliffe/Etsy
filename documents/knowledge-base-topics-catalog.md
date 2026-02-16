# Searchable Knowledge Base — Exhaustive Topic Catalog

This catalog defines the topic universe for the in-app searchable knowledge base.

Purpose:

- ensure complete user-facing coverage
- support search/index tagging
- make post-UI review updates easy

Scope:

- operations, usage, policy, troubleshooting, quality
- excludes "book project" deliverables

---

## 1) How to use this catalog

For each topic:

- create/maintain one article (or section)
- assign searchable tags/synonyms
- include step-by-step actions where possible
- include "what to do when it fails"

Recommended metadata fields per topic:

- Topic ID
- Title
- Category
- Audience (operator/admin/new user)
- Prerequisites
- Steps
- Troubleshooting
- Related topics
- Search aliases

---

## 2) Top-level taxonomy

1. System setup and access
2. Daily operations
3. Order and fulfillment workflows
4. Inventory and listing workflows
5. Customer workflows
6. Reporting and financial workflows
7. Shipping and carrier workflows
8. Compliance and policy workflows
9. Error handling and troubleshooting
10. Data, backup, and recovery
11. Configuration and preferences
12. UI navigation and productivity

---

## 3) Exhaustive topic list by category

## A. System setup and access

- A01 Install on macOS
- A02 Install on Windows 11
- A03 Clone vs ZIP setup
- A04 Environment variable setup
- A05 Etsy app registration
- A06 Redirect URI setup
- A07 First launch checklist
- A08 Connect Etsy (first-time)
- A09 Reconnect Etsy after failure
- A10 Disconnect Etsy safely
- A11 Multi-environment setup (dev/staging/prod)
- A12 Security basics (secrets, HTTPS, session handling)

Search aliases:

- install, setup, onboarding, connect, sign in, oauth, credentials

## B. Daily operations

- B01 Daily startup checklist
- B02 Shop selection workflow
- B03 Reading dashboard status quickly
- B04 Prioritizing orders by paid/shipped state
- B05 Daily exception triage
- B06 End-of-day wrap-up checklist
- B07 Weekly operations checklist
- B08 Monthly operations checklist

Search aliases:

- daily, checklist, start day, routine, operations, triage

## C. Order and fulfillment workflows

- C01 Order lifecycle (new -> paid -> shipped)
- C02 Order fields explained
- C03 Mark as paid workflow
- C04 Mark as shipped workflow
- C05 Ship-without-paid override policy
- C06 Order validation failures and fixes
- C07 Missing shipping data remediation
- C08 Order notes best practices
- C09 Handling canceled/void orders
- C10 Order-level audit trail basics

Search aliases:

- orders, paid, shipped, fulfill, fulfillment, mark paid, ship order

## D. Inventory and listing workflows

- D01 Inventory item record overview
- D02 Required fields for listing readiness
- D03 Listing readiness check workflow
- D04 Listing generation workflow (AI)
- D05 How pictures are passed to AI
- D06 How item context is passed to AI
- D07 Reviewing generated listing content
- D08 Editing generated listing content manually
- D09 When listing generation is blocked
- D10 Required listing fields before publish/list request
- D11 Listing title quality checklist
- D12 Listing description quality checklist
- D13 Tag quality checklist (13 tags, relevance, duplicates)
- D14 Category path selection guidance
- D15 Price validation for listing requests
- D16 Condition notes quality guidance
- D17 Inventory status meanings (Draft/In stock/Listed/Sold/etc.)
- D18 Handling incomplete inventory records
- D19 Linking inventory to orders
- D20 Placeholder inventory records from sync

Search aliases:

- inventory, listing, generate listing, readiness, tags, title, description, category

## E. Pictures and media workflows

- E01 Why photos affect conversion and trust
- E02 Main picture vs condition pictures
- E03 Photo capture standards (lighting/background/angles)
- E04 10-photo main set guidance
- E05 5-photo condition set guidance
- E06 Folder import workflow
- E07 Directory preview confirmation workflow
- E08 Replace/reorder/remove pictures
- E09 File type and size best practices
- E10 Common photo quality mistakes
- E11 Photo troubleshooting (blurry, dark, glare)
- E12 Preparing pictures for listing generation

Search aliases:

- photos, pictures, images, upload, import, preview, condition photos

## F. Customer workflows

- F01 Customer record overview
- F02 Add customer workflow
- F03 Edit customer workflow
- F04 Address completeness requirements
- F05 Fixing incomplete customer addresses
- F06 Customer purchase history view
- F07 Customer currency behavior (if applicable)
- F08 Inactive/duplicate customer handling

Search aliases:

- customers, buyer, address, customer data, shipping address

## G. Etsy sync workflows

- G01 Manual sync workflow
- G02 Startup sync behavior
- G03 Last sync timestamp meaning
- G04 Idempotent sync behavior explained
- G05 Duplicate protection behavior
- G06 How new Etsy orders become local data
- G07 Sync failures and operator actions
- G08 Rate-limit-related sync delays
- G09 Re-sync strategy after outages

Search aliases:

- sync, import, receipts, etsy orders, last synced

## H. Reporting and finance workflows

- H01 Report catalog overview
- H02 Thank-you note report workflow
- H03 Invoice report workflow
- H04 Sales report workflow
- H05 Costs report workflow
- H06 Income MTD workflow
- H07 Income YTD workflow
- H08 Postal-by-vendor report workflow
- H09 Outstanding items report workflow
- H10 AR aging report workflow
- H11 PDF output behavior
- H12 CSV output behavior
- H13 Print/export/cancel actions
- H14 Date-range filtering rules
- H15 Empty report results handling

Search aliases:

- reports, invoice, sales report, costs, income, mtd, ytd, csv, pdf

## I. Shipping and carrier workflows

- I01 Shipping info overview
- I02 Carrier templates (USPS/UPS/FedEx/DHL/Other)
- I03 Required shipping info fields
- I04 Missing shipping info errors
- I05 Print shipping label workflow
- I06 Preconditions before printing label
- I07 Shipping data quality checklist
- I08 Shipping cost tracking and reporting impact
- I09 No-carrier-api limitation explained

Search aliases:

- shipping, label, carrier, usps, ups, fedex, dhl, shipping info

## J. Compliance and policy workflows

- J01 Etsy API terms overview
- J02 OAuth and private data use rules
- J03 Trademark/disclaimer usage
- J04 Listing image requirements summary
- J05 Vintage policy summary
- J06 Prohibited items awareness
- J07 Data/privacy expectations
- J08 Operational compliance checklist
- J09 Policy update cadence and responsibilities

Search aliases:

- compliance, policy, etsy rules, trademark, privacy, prohibited items

## K. Error handling and troubleshooting

- K01 Global error model explained
- K02 How to read an error (title/message/actions)
- K03 Retry vs non-retry decisions
- K04 Validation errors (field-level) workflow
- K05 Unauthorized/not connected errors
- K06 OAuth callback errors
- K07 Etsy API failures
- K08 Listing generation failures
- K09 Missing required item data errors
- K10 Shop/receipt loading failures
- K11 Environment/config mismatch troubleshooting
- K12 Escalation checklist (what to capture)

Search aliases:

- error, failed, troubleshooting, cannot, blocked, validation, unauthorized

## L. Data, backup, and recovery

- L01 SQLite system-of-record basics
- L02 Data ownership boundaries
- L03 Backup strategy overview
- L04 Restore strategy overview
- L05 Recovery instructions workflow
- L06 Incident recovery playbook
- L07 Data integrity checks after recovery
- L08 Audit/checkpoint checklist post-restore

Search aliases:

- sqlite, backup, restore, recovery, data loss, incident

## M. Configuration and preferences

- M01 Settings overview
- M02 Business profile setup
- M03 Default shipper setup
- M04 Panel layout preference
- M05 Tutorial/tips folder path configuration
- M06 Why-pictures-matter link configuration
- M07 Date format/locale preferences (if enabled)
- M08 Outstanding sort preferences (if enabled)

Search aliases:

- settings, config, preferences, defaults, panel layout

## N. UI navigation and productivity

- N01 Dashboard navigation
- N02 Header status indicators
- N03 Shop selector best practices
- N04 Fast scanning the orders table
- N05 Interpreting KPI cards
- N06 Handling loading/empty/error states
- N07 Operator keyboard/mouse efficiency tips
- N08 UI review checklist after feature releases

Search aliases:

- ui, navigation, dashboard, table, status, workflow, usability

---

## 4) Priority content rollout order

Priority 1 (must-have for current build):

- A, B, D, E, G, K, N

Priority 2 (must-have before full operations):

- C, F, H, I, M

Priority 3 (governance and resilience):

- J, L

---

## 5) Search synonym starter set

Use these to improve keyword matching:

- connect, sign in, oauth, auth, login
- order, receipt, sale, transaction
- ship, shipped, label, carrier, fulfillment
- inventory, item, sku, listing
- tags, keywords, title, description
- picture, photo, image, media
- sync, import, refresh
- report, csv, pdf, export
- error, failed, blocked, validation, fix
- settings, config, preferences
- backup, restore, recovery

---

## 6) Maintenance rule after UI releases

After each UI release:

1. compare implemented UI against this catalog;
2. mark changed/added topics;
3. update affected "how to operate" articles;
4. add missing aliases for new labels/buttons;
5. re-run spot search tests for top operator intents.

This is the mandatory step to keep help/search accurate as UI evolves.
