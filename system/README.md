# System

This folder holds **system files**: configuration and env templates used by the app. The project root has symlinks to these files so Next.js and npm work as expected.

| File                 | Purpose                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `.env.example`       | Environment variable template. Copy to project root as `.env.local` and fill in your Etsy app credentials. |
| `next.config.ts`     | Next.js configuration.                                                                                     |
| `tsconfig.json`      | TypeScript configuration.                                                                                  |
| `eslint.config.mjs`  | ESLint configuration.                                                                                      |
| `postcss.config.mjs` | PostCSS configuration.                                                                                     |
| `package.json`       | Dependencies and scripts.                                                                                  |
| `package-lock.json`  | Locked dependency versions.                                                                                |

**Scannable / lookup tips (`tips/`)** — Default document set for the Tutorial and tips tab. The app can scan and look up these files (Index, search).

Maintenance note: keep tip documents current and add a "Last Updated" line in each tip file when content changes.

| File                         | Purpose                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `tips/How_to_Win_on_Etsy.md` | User guide: how to be successful on Etsy (search, titles, categories, tags, photos, pricing, structured listing method). |
| `tips/Book_Outline.md`       | Table of contents and section summaries for the book.                                                                    |
| `tips/Etsy_Photo_Guide.md`   | How to take photos that help items sell (setup, lighting, first photo, condition).                                       |
