# Start here — developer onboarding (AiCE)

**AiCE** (*The AI-Powered eCommerce Engine*) is a Next.js 16 + TypeScript + SQLite app for managing
an Etsy vintage shop. This page is the **single map** for a new developer — read it once, then use
the links below instead of searching the tree.

---

## 1. Run the app (5 minutes)

```bash
npm ci
cp system/.env.example .env.local   # fill Etsy + optional OpenAI keys
npm run db:migrate
npm run db:seed                    # optional sample data
npm run dev                        # http://localhost:3000
```

Full install (macOS / Windows): [`installation.md`](installation.md) · Env vars: [`setup/ENV_MATRIX.md`](setup/ENV_MATRIX.md)

Quality gates: [`../CONTRIBUTING.md`](../CONTRIBUTING.md) · CI: [`ci/CI_EXPECTATIONS.md`](ci/CI_EXPECTATIONS.md)

---

## 2. Where specs live (read these, not random MD files)

| Question | Canonical source |
|----------|------------------|
| **Database schema** | [ADR-017](adr/0017-database-schema.md) §8 DDL |
| **API routes & JSON shapes** | [ADR-018](adr/0018-api-surface-endpoints.md) |
| **UI layout, tabs, flows** | [ui-design.md](ui-design.md) + [ADR-024](adr/0024-frontend-component-architecture.md) |
| **Business / validation rules** | [ADR-021](adr/0021-validation-and-business-rules.md) |
| **Listing lifecycle (Generate → Quality → Publish)** | [ADR-085](adr/0085-unified-listing-lifecycle.md), [ADR-081](adr/0081-listing-lifecycle-and-phases.md), [ADR-082](adr/0082-listing-quality-rubric.md) |
| **Colors & components** | [System_Colors.md](System_Colors.md), [ADR-071](adr/0071-visual-design-system-and-ui-consistency.md), [ADR-028](adr/0028-shared-component-adoption.md) |
| **Full ADR index** | [adr/README.md](adr/README.md) |
| **Cursor / agent rules** | [`.cursorrules`](../.cursorrules) at repo root |

Implementation order (phases only): [implementation-guide.md](implementation-guide.md) ·
Gap-closure checklist: [no-developer-questions-build.md](no-developer-questions-build.md)

---

## 3. Code layout

| Path | Purpose |
|------|---------|
| [`src/app/`](../src/app/) | Next.js App Router pages + `api/` routes |
| [`src/components/`](../src/components/) | UI (shared + domain panels) |
| [`src/lib/`](../src/lib/) | Business logic, DB, Etsy, AI, reports |
| [`migrations/`](../migrations/) | **Schema SSOT** (applied on boot — ADR-087) |
| [`system/`](../system/) | Config symlinks target + [`system/tips/`](../system/tips/) (Tutorial tab content) |
| [`fixtures/`](../fixtures/) | Seed + sample SQL |
| [`tests/`](../tests/) | Unit + e2e smoke tests |

Local data (gitignored): `data/app.sqlite`, `uploads/`

---

## 4. Work remaining

Open tickets: [`tickets/README.md`](tickets/README.md) (3 open: mobile layout, auto-cycle, AI photos — rest in [`tickets/completed/`](tickets/completed/))

Implementation playbook (how to run tickets with AI): [`IMPLEMENTATION_PLAYBOOK.md`](IMPLEMENTATION_PLAYBOOK.md)

---

## 5. Operations (not day-one coding)

| Topic | Doc |
|-------|-----|
| Day-to-day use | [operating-the-system.md](operating-the-system.md) |
| Migrations | [database/MIGRATIONS.md](database/MIGRATIONS.md) |
| Backup / restore | [operations/BACKUP.md](operations/BACKUP.md) |
| Release / deploy | [release/RELEASE_PROCESS.md](release/RELEASE_PROCESS.md) |

---

## 6. Do **not** read first (archived)

Historical audits, interim notes, and retired Listing Coach docs were moved to [`../archive/`](../archive/README.md) and [`archive/`](archive/) under `documents/`. They are kept for history only.

---

## 7. Document index

Full catalog (with descriptions): [`README.md`](README.md)
