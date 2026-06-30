# Pre-AiCE recovery instructions (archived)

> **Archived 2026-06-29.** Pre-AiCE / EBC recovery notes only. For live backup/restore see
> [`documents/operations/BACKUP.md`](../../documents/operations/BACKUP.md) and
> [`documents/START_HERE.md`](../../documents/START_HERE.md).

Version 1.1  
Status: Archived (historical)  
Last Updated: 2026-02-16

## Purpose

This document defines how to recover the Etsy project documentation and working context after data loss, app reset, or machine migration.

Use it as a practical checklist for restoring project files and restarting work with minimal ambiguity.

## Required Files

Restore these project paths first:

### 1) Knowledge Base (scannable tips)

- `system/tips/How_to_Win_on_Etsy.md`
- `system/tips/Book_Outline.md`
- `system/tips/Etsy_Photo_Guide.md`

### 2) EBC Design and Architecture

- `documents/ebc/Etsy_Business_Console_DCard.md`
- `documents/ebc/EBC_Roadmap.md`
- `documents/ebc/EBC_Module_Structure.md`

### 3) Item Catalog Examples

- `documents/ebc/items/item_0001_currier_ives.md`
- `documents/ebc/items/item_0001_currier_ives.json`

### 4) Optional Supporting Folders

- `/ItemPics/`
- `/Screenshots/`
- `/templates/`
- `/images/`

## Recovery Process

1. Restore the repository folder from backup or clone source.
2. Confirm required files listed above exist and open correctly.
3. Validate folder structure:
   - `documents/`
   - `documents/ebc/`
   - `documents/ebc/items/`
   - `system/tips/`
4. Re-open the project in your IDE.
5. Resume work using the implementation docs:
   - `documents/implementation-guide.md`
   - `documents/development-plan.md`
   - `documents/design-decisions-implementation.md`

## Validation Checklist

- [ ] Knowledge base files are present and readable.
- [ ] EBC architecture files are present and readable.
- [ ] Item catalog examples are present and readable.
- [ ] Core documentation in `documents/` is present.
- [ ] Project opens in the IDE and docs can be navigated.

## Notes

- Keep this file at `documents/Recovery_Instructions.md`.
- Keep at least one external backup copy of the repository.
- Review this document after major structure changes and update paths as needed.
