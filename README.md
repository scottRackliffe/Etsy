# AiCE — The AI-Powered eCommerce Engine

**AiCE** is a local, single-user e-commerce operations engine: inventory, AI listing lifecycle,
orders, shipping, communications, expenses, and reports. **Etsy Open API v3** is the first
marketplace integration. The pilot deployment is **Trudy's Classic Treasures** (vintage/antique).

**Stack:** Next.js 16 · TypeScript · Tailwind · SQLite · Etsy Open API v3

---

## New developer — start here

1. **[documents/START_HERE.md](documents/START_HERE.md)** — map of specs, code layout, and open work  
2. **[documents/adr/README.md](documents/adr/README.md)** — architecture decision records (SSOT)  
3. **[CONTRIBUTING.md](CONTRIBUTING.md)** — setup commands and PR gates  
4. **[`.cursorrules`](.cursorrules)** — Cursor agent rules (read before coding)

Historical audits and interim notes: **[archive/](archive/README.md)**

---

## Quick start

```bash
npm ci
cp system/.env.example .env.local   # Etsy credentials required; OpenAI optional
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Full install: [documents/installation.md](documents/installation.md)

---

## Repository layout

| Path | What it is |
|------|------------|
| `src/` | Application source (App Router + API routes) |
| `documents/` | Specs, ADRs, tickets, ops docs |
| `migrations/` | Database schema (SSOT — ADR-087) |
| `system/` | Config templates (symlinked at root) + Tutorial tip files |
| `scripts/` | `db:migrate`, `db:seed`, env check |
| `tests/` | Unit + e2e tests |
| `fixtures/` | Seed / sample SQL |
| `archive/` | Retired interim docs (see README + zip) |
| `data/`, `uploads/` | Local DB and files (**gitignored**) |

---

## Key commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run db:migrate` | Apply pending migrations |
| `npm run test` | Unit + e2e smoke tests |
| `npm run lint` / `type-check` | Quality gates |

---

## Operations

- [documents/operating-the-system.md](documents/operating-the-system.md) — daily workflows  
- [documents/operations/BACKUP.md](documents/operations/BACKUP.md) — backup / restore  
- [documents/release/RELEASE_PROCESS.md](documents/release/RELEASE_PROCESS.md) — releases  

---

## License / Etsy marketplace

Etsy is a trademark of Etsy, Inc. AiCE uses the official Etsy API and is not endorsed by Etsy.
See [documents/etsy-compliance.md](documents/etsy-compliance.md).
