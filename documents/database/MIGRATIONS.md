# Database Migrations and Seed

This project now includes a migration and seed baseline for SQLite.

## Files

- `migrations/001_initial_schema.sql` - initial schema for inventory, customers, purchases, orders, receipts, reports, settings.
- `fixtures/seed-data.sql` - safe starter records.
- `scripts/migrate.mjs` - applies pending migrations in order.
- `scripts/seed.mjs` - loads seed SQL after migration.

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
