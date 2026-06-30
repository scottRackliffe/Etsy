# Documentation index

**New developer?** Start at **[START_HERE.md](START_HERE.md)** — not this full table.

All canonical specs are **ADRs** in [`adr/`](adr/). User-facing copy is in [`tutorial.md`](tutorial.md) and
[`system/tips/`](../system/tips/). Historical material is in [`../archive/`](../archive/README.md) and
[`archive/`](archive/) (retired Listing Coach).

---

## Canonical specs (implement from these)

| Doc | Purpose |
|-----|---------|
| [adr/README.md](adr/README.md) | ADR index (89 ADRs) — **primary SSOT** |
| [adr/0017-database-schema.md](adr/0017-database-schema.md) | Database DDL |
| [adr/0018-api-surface-endpoints.md](adr/0018-api-surface-endpoints.md) | REST API catalog |
| [ui-design.md](ui-design.md) | Tabs, screens, commands, outstanding |
| [adr/0021-validation-and-business-rules.md](adr/0021-validation-and-business-rules.md) | Validation rules |
| [etsy-listing-template-and-requirements.md](etsy-listing-template-and-requirements.md) | Listing fields + AI inputs |
| [etsy-compliance.md](etsy-compliance.md) | Etsy API / seller compliance |
| [System_Colors.md](System_Colors.md) | UI palette (see ADR-071) |
| [shipping-label-carrier-templates.md](shipping-label-carrier-templates.md) | Local label generation (no carrier API) |
| [design-decisions-implementation.md](design-decisions-implementation.md) | Cross-cutting decision index → ADRs |

---

## Implementation & workflow

| Doc | Purpose |
|-----|---------|
| [implementation-guide.md](implementation-guide.md) | Build phases → which ADRs apply |
| [development-plan.md](development-plan.md) | Sequencing, dependencies, exit criteria |
| [no-developer-questions-build.md](no-developer-questions-build.md) | Gap-closure checklist |
| [IMPLEMENTATION_PLAYBOOK.md](IMPLEMENTATION_PLAYBOOK.md) | Ticket-driven AI implementation loop |
| [tickets/README.md](tickets/README.md) | Open / completed work tickets |
| [frontend-architecture.md](frontend-architecture.md) | Component tree + routing map |
| [state-management.md](state-management.md) | Client state patterns |

---

## Setup, test, release, ops

| Doc | Purpose |
|-----|---------|
| [installation.md](installation.md) | macOS / Windows install |
| [setup/DEVELOPMENT.md](setup/DEVELOPMENT.md) | Contributor workflow |
| [setup/ENV_MATRIX.md](setup/ENV_MATRIX.md) | Environment variables |
| [database/MIGRATIONS.md](database/MIGRATIONS.md) | Migrations + seed commands |
| [database/SCHEMA_RECONCILIATION.md](database/SCHEMA_RECONCILIATION.md) | Schema drift notes (ADR-017 is SSOT) |
| [testing/TEST_PLAN.md](testing/TEST_PLAN.md) | Test scope |
| [testing/MANUAL_TEST_SCENARIOS.md](testing/MANUAL_TEST_SCENARIOS.md) | Release verification scripts |
| [ci/CI_EXPECTATIONS.md](ci/CI_EXPECTATIONS.md) | CI gates |
| [release/RELEASE_PROCESS.md](release/RELEASE_PROCESS.md) | Release checklist |
| [release/DEPLOYMENT.md](release/DEPLOYMENT.md) | Deploy runbook |
| [operations/BACKUP.md](operations/BACKUP.md) | Backup / restore |
| [operations/ROLLBACK.md](operations/ROLLBACK.md) | Rollback |
| [operations/OBSERVABILITY.md](operations/OBSERVABILITY.md) | Health / logs |
| [operating-the-system.md](operating-the-system.md) | Day-to-day operator manual |

---

## User-facing content (in-app / Tutorial tab)

| Doc | Purpose |
|-----|---------|
| [tutorial.md](tutorial.md) | Built-in tutorial articles |
| [pictures-and-sales.md](pictures-and-sales.md) | Why pictures matter (linked from picture UI) |
| [knowledge-base-design.md](knowledge-base-design.md) | Tutorial tab design |
| [knowledge-base-topics-catalog.md](knowledge-base-topics-catalog.md) | Help topic taxonomy |
| [privacy-policy.md](privacy-policy.md) | Privacy policy text |
| [system/tips/](../system/tips/) | Scannable tip files |

---

## Research & retired

| Doc | Purpose |
|-----|---------|
| [research/](research/) | Etsy listing best-practices research (feeds ADR-082) |
| [archive/](archive/) | Retired Listing Coach / workshop docs (ADR-085) |
| [../archive/](../archive/README.md) | Historical audits + interim notes (zip available) |

---

Project README (quick setup): [`../README.md`](../README.md)
