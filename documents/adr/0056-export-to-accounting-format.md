# ADR-056: Export to Accounting Format

## Status

Accepted

## Date

2026-05-24 (updated 2026-06-17: full double-entry, GAAP account numbers, chart of accounts table, GL transaction rules)

## Context

Business owners need to feed sales and expense data to their accountant or import into accounting software (QuickBooks, Wave, Excel). Currently there is no structured export that maps transactions to standard accounting categories. Generating this manually from raw report data is time-consuming and error-prone.

The accounting export must use **proper double-entry bookkeeping** — every debit has a matching credit — and include **standard GAAP account numbers** so the export can be imported directly into any accounting system without manual mapping.

## Decision

### 1. Chart of Accounts (database table)

A `chart_of_accounts` table stores the GAAP account numbers and names used across all accounting exports. This is the single source of truth for account numbering.

#### Table: `chart_of_accounts`

| Column         | Type    | Constraints               | Notes                                          |
| -------------- | ------- | ------------------------- | ---------------------------------------------- |
| id             | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key                                  |
| acct_number    | TEXT    | NOT NULL, UNIQUE          | GAAP account number (e.g. `1000`)              |
| account_name   | TEXT    | NOT NULL                  | Human-readable name (e.g. `Cash`)              |
| account_type   | TEXT    | NOT NULL                  | One of: Asset, Liability, Equity, Revenue, Contra-Revenue, COGS, Expense |
| normal_balance | TEXT    | NOT NULL                  | `debit` or `credit`                            |
| description    | TEXT    |                           | Optional explanation                           |
| is_active      | INTEGER | NOT NULL DEFAULT 1        | 1 = active, 0 = inactive (soft-disable)        |
| created_at     | TEXT    | NOT NULL                  | ISO 8601 timestamp                             |
| updated_at     | TEXT    | NOT NULL                  | ISO 8601 timestamp                             |

#### Seed data (standard accounts)

| Acct # | Account Name               | Type           | Normal Balance | Description                                    |
| ------ | -------------------------- | -------------- | -------------- | ---------------------------------------------- |
| 1000   | Cash                       | Asset          | debit          | Cash on hand and in bank                       |
| 1100   | Accounts Receivable        | Asset          | debit          | Money owed by customers for sales              |
| 1300   | Inventory                  | Asset          | debit          | Merchandise held for resale                    |
| 2100   | Sales Tax Payable          | Liability      | credit         | Tax collected, owed to state/local authority   |
| 4000   | Sales Revenue              | Revenue        | credit         | Income from sale of merchandise                |
| 4100   | Shipping Income            | Revenue        | credit         | Shipping charges collected from customers      |
| 4800   | Sales Returns & Allowances | Contra-Revenue | debit          | Returns and allowances reducing gross revenue  |
| 4900   | Sales Discounts            | Contra-Revenue | debit          | Discounts given to customers (contra-income)   |
| 5000   | Cost of Goods Sold         | COGS           | debit          | Cost of merchandise sold                       |
| 6100   | Shipping Expense           | Expense        | debit          | Seller-paid shipping costs to carriers         |
| 6200   | Operating Expenses         | Expense        | debit          | Packaging, supplies, and other operating costs |

### 2. GL Transaction Rules (database table)

A `gl_transaction_rules` table defines the double-entry template for each transaction type. The accounting export uses these rules to generate journal entries.

#### Table: `gl_transaction_rules`

| Column           | Type    | Constraints               | Notes                                              |
| ---------------- | ------- | ------------------------- | -------------------------------------------------- |
| id               | INTEGER | PRIMARY KEY AUTOINCREMENT | Surrogate key                                      |
| transaction_type | TEXT    | NOT NULL                  | e.g. `Sale`, `Payment`, `COGS`, `Discount`         |
| description      | TEXT    |                           | Human-readable explanation of the entry             |
| debit_acct       | TEXT    | NOT NULL                  | FK reference to `chart_of_accounts.acct_number`     |
| credit_acct      | TEXT    | NOT NULL                  | FK reference to `chart_of_accounts.acct_number`     |
| source_table     | TEXT    |                           | Primary table the data comes from                   |
| source_column    | TEXT    |                           | Column containing the amount                        |
| is_active        | INTEGER | NOT NULL DEFAULT 1        | 1 = active, 0 = inactive                           |
| created_at       | TEXT    | NOT NULL                  | ISO 8601 timestamp                                  |
| updated_at       | TEXT    | NOT NULL                  | ISO 8601 timestamp                                  |

#### Seed data (transaction rules)

| Transaction Type   | Debit Acct | Credit Acct | Description                                         | Source                              |
| ------------------ | ---------- | ----------- | --------------------------------------------------- | ----------------------------------- |
| Sale               | 1100       | 4000        | Sale recorded — AR increases, revenue recognized    | `order_items.line_total`            |
| COGS               | 5000       | 1300        | Cost of sale — COGS recognized, inventory reduced   | `inventory.purchase_cost + shipping_cost` |
| Payment            | 1000       | 1100        | Payment received — cash in, AR cleared              | `orders.grand_total` (paid orders)  |
| Discount           | 4900       | 1100        | Discount given — contra-income, AR reduced          | `orders.discount_total`             |
| Shipping Revenue   | 1100       | 4100        | Shipping charged to customer                        | `orders.shipping_total`             |
| Shipping Expense   | 6100       | 1000        | Seller pays carrier for shipping                    | `orders.seller_shipping_cost`       |
| Tax Collected      | 1100       | 2100        | Tax collected from customer — AR up, liability up   | `orders.tax_total`                  |
| Tax Remittance     | 2100       | 1000        | Tax paid to state — liability cleared, cash out     | `tax_payments.amount`               |
| Refund — Revenue   | 4800       | 1000        | Refund issued — contra-revenue, cash returned       | `orders.subtotal` (refunded orders) |
| Refund — Tax       | 2100       | 1000        | Refund tax portion — liability reversed, cash out   | `orders.tax_total` (refunded orders)|
| Refund — Inventory | 1300       | 5000        | Item returned to stock — inventory up, COGS reversed| `inventory.purchase_cost + shipping_cost` |
| Purchase           | 1300       | 1000        | Buy inventory item for resale                       | `purchases.purchase_price`          |
| Purchase Shipping  | 1300       | 1000        | Shipping cost to acquire inventory                  | `purchases.shipping_price`          |
| Other Cost         | 6200       | 1000        | Operating expense (packaging, supplies, etc.)       | `other_costs.amount`                |

### 3. Accounting export format

#### CSV columns

| Column             | Description                                                                           | Example                         |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------- |
| `Date`             | Transaction date (`YYYY-MM-DD`)                                                       | `2026-05-15`                    |
| `Transaction Type` | From GL transaction rules (e.g. `Sale`, `Payment`, `COGS`)                            | `Sale`                          |
| `Reference`        | `order_number` for order rows; `item_number` for purchase/cost rows                   | `ORD-0042`                      |
| `Description`      | Human-readable line description                                                       | `Sale: Vintage Lamp (INV-0012)` |
| `Debit`            | Amount debited (blank if credit)                                                      | `45.00`                         |
| `Credit`           | Amount credited (blank if debit)                                                      | `45.00`                         |
| `Acct #`           | GAAP account number from `chart_of_accounts`                                          | `4000`                          |
| `Account`          | Account name from `chart_of_accounts`                                                 | `Sales Revenue`                 |

#### Double-entry structure

Every transaction produces **two rows** — one debit, one credit — for the same amount. The debit total always equals the credit total across the entire export.

#### Description field format

| Transaction Type    | Description format                                                          |
| ------------------- | --------------------------------------------------------------------------- |
| Sale                | `"Sale: {inventory.description} ({inventory.item_number})"`                 |
| COGS                | `"Cost of sale: {inventory.description} ({inventory.item_number})"`         |
| Payment             | `"Payment received: Order {orders.order_number}"`                           |
| Discount            | `"Discount: Order {orders.order_number}"`                                   |
| Shipping Revenue    | `"Shipping revenue: Order {orders.order_number}"`                           |
| Shipping Expense    | `"Shipping cost: Order {orders.order_number}"`                              |
| Tax Collected       | `"Tax collected: Order {orders.order_number}"`                              |
| Tax Remittance      | `"Tax payment to {tax_payments.payee}"`                                     |
| Refund — Revenue    | `"Refund — reverse revenue: Order {orders.order_number}"`                   |
| Refund — Tax        | `"Refund — reverse tax: Order {orders.order_number}"`                       |
| Refund — Inventory  | `"Refund — return to inventory: {inventory.description} ({item_number})"`   |
| Purchase            | `"Purchase: {inventory.description} ({inventory.item_number})"`             |
| Purchase Shipping   | `"Purchase shipping: {inventory.description} ({inventory.item_number})"`    |
| Other Cost          | `"Other cost: {other_costs.cost_type} - {inventory.item_number}"`           |

### 4. Data rules

- Only orders with `order_status = 'active'` are included (void/cancelled excluded per global report rule)
- Date range filter via `from_date` and `to_date` query parameters (per ADR-036)
- For Sale/COGS/Payment/Discount/Shipping/Tax rows: `Date` = `orders.order_date`
- For Purchase rows: `Date` = `purchases.purchase_date`
- For Other Cost rows: `Date` = `other_costs.created_at` (date portion)
- For Tax Remittance rows: `Date` = `tax_payments.payment_date`
- Rows sorted by `Date` ascending, then by `Transaction Type` alphabetical
- Amounts formatted to 2 decimal places, no currency symbol
- Empty date range = all time

### 5. Accounting flow summary

```
Sale occurs:
  DR 1100 Accounts Receivable    CR 4000 Sales Revenue        (revenue recognized)
  DR 5000 Cost of Goods Sold     CR 1300 Inventory            (cost recognized)

Shipping charged:
  DR 1100 Accounts Receivable    CR 4100 Shipping Income      (shipping revenue)

Tax collected:
  DR 1100 Accounts Receivable    CR 2100 Sales Tax Payable    (liability created)

Discount given:
  DR 4900 Sales Discounts        CR 1100 Accounts Receivable  (AR reduced, contra-income)

Payment received:
  DR 1000 Cash                   CR 1100 Accounts Receivable  (AR cleared, cash in)

Refund issued:
  DR 4800 Sales Returns & Allow. CR 1000 Cash                 (contra-revenue, cash out)
  DR 2100 Sales Tax Payable      CR 1000 Cash                 (tax reversed)
  DR 1300 Inventory              CR 5000 Cost of Goods Sold   (item returned to stock)

Shipping paid:
  DR 6100 Shipping Expense       CR 1000 Cash                 (carrier paid)

Tax remitted:
  DR 2100 Sales Tax Payable      CR 1000 Cash                 (liability cleared)

Inventory purchased:
  DR 1300 Inventory              CR 1000 Cash                 (item acquired)

Other cost paid:
  DR 6200 Operating Expenses     CR 1000 Cash                 (expense recorded)
```

### 6. API

#### Accounting export

```
GET /api/reports/accounting-export?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&format=csv
```

- `format` parameter must be `csv` (only supported value; return 400 if other value provided)
- Response: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="accounting-export-YYYY-MM-DD.csv"`
- Standard error envelope on failure (ADR-018)
- Empty result: return CSV with header row only (no data rows), not an error

#### Chart of Accounts API

```
GET  /api/chart-of-accounts              → list all accounts (sorted by acct_number)
POST /api/chart-of-accounts              → create new account
GET  /api/chart-of-accounts/:id          → get single account
PUT  /api/chart-of-accounts/:id          → update account
DELETE /api/chart-of-accounts/:id        → soft-delete (set is_active = 0)
```

#### GL Transaction Rules API

```
GET  /api/gl-transaction-rules           → list all rules (sorted by transaction_type)
POST /api/gl-transaction-rules           → create new rule
GET  /api/gl-transaction-rules/:id       → get single rule
PUT  /api/gl-transaction-rules/:id       → update rule
DELETE /api/gl-transaction-rules/:id     → soft-delete (set is_active = 0)
```

### 7. Config UI

The Config page includes a **Chart of Accounts** section (under a new "Accounting" group) that displays:

1. **Chart of Accounts table** — read-only list of all accounts with acct #, name, type, normal balance, and active status. Add/edit/deactivate capability.
2. **GL Transaction Rules table** — read-only list of all transaction rules showing transaction type, debit account, credit account, and description. Add/edit/deactivate capability.

This lets the business owner (or their accountant) review and customize the account mapping without touching code.

## Consequences

- **Positive:** Proper double-entry export that any accountant or accounting software can import without manual adjustment. GAAP account numbers enable direct chart-of-accounts mapping in QuickBooks, Xero, Wave, etc. Database-stored rules allow customization without code changes.
- **Negative:** More complex than a simple single-entry export, but this is the accepted standard. Additional database tables add modest schema overhead.

## Notes

- Cross-references: ADR-006 (reports scope), ADR-013 (report format — CSV column conventions), ADR-017 (database schema — orders, order_items, purchases, other_costs, tax_payments tables), ADR-034 (Config UI — new Accounting section), ADR-036 (date range filter), ADR-038 (profit/loss — uses similar data but different aggregation), ADR-039 (tax tracking — tax_payments table)
- The `format=csv` parameter is included for forward-compatibility in case other formats (e.g., QBO, OFX) are added later
- No PDF variant is intentional — accounting exports are machine-readable by design
- Post-generation actions: **Export CSV | Cancel** (no Print or Export PDF actions since this report is CSV-only)
- The GAAP account numbers follow the standard 4-digit convention (1000s = Assets, 2000s = Liabilities, 3000s = Equity, 4000s = Revenue, 5000s = COGS, 6000s = Expenses). US GAAP does not mandate specific numbers but this convention is universally recognized.
- Account numbers use gaps (1000, 1100, 1300 etc.) to allow future additions without renumbering.

### Known omissions

Etsy marketplace fees (listing fees, transaction fees, payment processing fees) are not tracked in the local database and are excluded from the accounting export. Sellers should reconcile with Etsy's payment account CSV for a complete picture of marketplace-related expenses.

> Updated 2026-06-09: Added shipping revenue, discount, and refund transaction types; added known omissions section.
> Updated 2026-06-17: Full double-entry bookkeeping; GAAP account numbers; chart_of_accounts and gl_transaction_rules database tables; GL transaction rules; Config UI section; accounting flow summary.
