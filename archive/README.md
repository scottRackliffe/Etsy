# Archive — interim and historical material

This folder holds **non-canonical** documents moved out of the active tree so new developers
are not confused about what to read or implement.

**Do not implement from files here.** Canonical specs live in `documents/adr/`, active work in
`documents/tickets/`, and onboarding in `documents/START_HERE.md`.

---

## Layout

| Folder | Contents |
|--------|----------|
| [`audits/`](audits/) | Completed audit logs (2026-05–06): ADR audit, code↔doc conformance, compliance, deep audit, program plan |
| [`interim/`](interim/) | Superseded planning notes: EBC scaffold, EasyPost task list, recovery instructions (pre-AiCE), shop story |
| [`root-clutter/`](root-clutter/) | Loose notes and duplicate assets removed from repo root |
| [`static-docs/`](static-docs/) | Old static HTML/docs snapshot (not used by the app) |

A portable copy of this folder (except this README’s zip note) is also kept as:

**`interim-docs-2026-06-29.zip`** — regenerate with:

```bash
cd archive && zip -r interim-docs-2026-06-29.zip audits interim root-clutter static-docs -x "*.DS_Store"
```

---

## Where the live docs went

| Need | Go to |
|------|--------|
| First-time developer map | [`documents/START_HERE.md`](../documents/START_HERE.md) |
| ADR index (spec SSOT) | [`documents/adr/README.md`](../documents/adr/README.md) |
| Open / completed tickets | [`documents/tickets/`](../documents/tickets/) |
| Retired Listing Coach docs | [`documents/archive/`](../documents/archive/) |
| User-facing tutorial content | [`documents/tutorial.md`](../documents/tutorial.md), [`system/tips/`](../system/tips/) |
