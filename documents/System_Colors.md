# Etsy Sales Manager — System Colors

UI color palette aligned to **Cursor blue UI** (deep navy surfaces, cool blue accents). Same scheme as NSLS for consistency. Semantic colors used for status (paid/shipped, errors, warnings).

## Screen & typography

| Role                 | Hex       | Use                                   |
| -------------------- | --------- | ------------------------------------- |
| **Background**       | `#081a34` | All screens                           |
| **Panel background** | `#0b2346` | Header, panels, selects               |
| **Card background**  | `#0f2b55` | Cards, sections, dialog interiors     |
| **Border/Outline**   | `#1a3a66` | Section, card, table, list borders    |
| **Title**            | `#eef4ff` | Section headings, card titles         |
| **Body text**        | `#c7d6f2` | Body copy, labels, status, table text |
| **Muted text**       | `#9bb0d1` | Secondary captions                    |

## Semantic (status & actions)

| Role       | Hex       | Use                           |
| ---------- | --------- | ----------------------------- |
| **Green**  | `#00CC66` | Success, OK, paid, shipped    |
| **Yellow** | `#FFCC00` | Warning, not paid, alert band |
| **Red**    | `#FF4444` | Error, danger                 |
| **Orange** | `#f5a65b` | Warning band (optional)       |

## Lists / tables

| Role                | Hex       | Use              |
| ------------------- | --------- | ---------------- |
| **List item dark**  | `#0c2342` | Table row (base) |
| **List item light** | `#102a4f` | Alternate row    |
| **List hover**      | `#14315c` | Row hover        |
| **List text**       | `#c7d6f2` | Cell text        |

## Buttons / accents

| Role                 | Hex                   | Use                             |
| -------------------- | --------------------- | ------------------------------- |
| **Accent (primary)** | `#2f80ed` / `#1f6fd6` | Connect Etsy, primary actions   |
| **Neutral**          | `#233553` / `#2b4168` | Disconnect, secondary buttons   |
| **Disabled**         | `#2a3b59`             | Disabled button                 |
| **Primary hover**    | `#2ea043`             | Primary button hover (optional) |
| **Danger hover**     | `#e11d48`             | Danger button hover (optional)  |

## Implementation

- **CSS variables:** `src/app/globals.css` — all `--ui-*` variables in `:root`.
- **Tailwind:** `@theme inline` maps `--color-ui-*` for use with Tailwind if needed.
- **Components:** Use `var(--ui-background)`, `var(--ui-title)`, etc., or Tailwind arbitrary values `bg-[var(--ui-panel-bg)]`, `text-[var(--ui-body)]`.

Example:

- Page background: `bg-[var(--ui-background)]`
- Panel/card: `bg-[var(--ui-card-bg)] border border-[var(--ui-border)]`
- Title: `text-[var(--ui-title)]`
- Success: `text-[var(--ui-green)]`; warning: `text-[var(--ui-yellow)]`; error: `text-[var(--ui-red)]`
- Primary button: `bg-[var(--ui-accent)] hover:bg-[var(--ui-accent-hover)]`

## Reference

- Source: NSLS `documents/System_Colors.md` (Cursor blue UI).
- Etsy app: `src/app/globals.css`, `src/app/page.tsx`.
