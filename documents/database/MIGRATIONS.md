# Database Migrations and Seed

This project now includes a migration and seed baseline for SQLite.

## Files

- `migrations/001_initial_schema.sql` — initial schema for inventory, customers, purchases, orders, order_items, addresses, etsy_receipts, other_costs, report_artifacts, listing workflow tables, settings, core indexes.
- `migrations/002_schema_reconciliation.sql` — adds order ship-to snapshot columns, `was_paid`, `shipper`, `seller_shipping_cost`, `etsy_receipt_id`, customer `default_address_id`/`currency_code`/`is_active`, backfills, and `schema_migrations` table.
- `migrations/003_compliance_wave1.sql` — adds `orders.tracking_number`, backfills `order_status`/`payment_status`/`inventory.status` enums to canonical values, adds `idx_orders_shipper`.
- `migrations/004_activity_log_customer_notes.sql` — creates `activity_log` table (3 indexes) and `customer_notes` table (1 index) per ADR-037 and ADR-065.
- `fixtures/seed-data.sql` — safe starter records.
- `fixtures/sample-data.sql` — demo data for new users (ADR-069).
- `scripts/migrate.mjs` — applies pending migrations in order by filename.
- `scripts/seed.mjs` — loads seed SQL after migration.

## Commands

- `npm run db:migrate` - apply pending migrations.
- `npm run db:seed` - apply seed data.
- `npm run db:reset` - remove DB file, rerun migrations + seed.

## Environment

- `SQLITE_PATH` controls DB location.
- If unset, default is `data/app.sqlite`.

## Safety Notes

- Run `db:reset` only for local development unless you are intentionally rebuilding an environment.
- Keep each migration immutable once shared with team members.
- Add new schema updates as a new numbered migration file.
