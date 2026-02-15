# System

This folder holds **system files**: configuration and env templates used by the app. The project root has symlinks to these files so Next.js and npm work as expected.

| File | Purpose |
|------|--------|
| `.env.example` | Environment variable template. Copy to project root as `.env.local` and fill in your Etsy app credentials. |
| `next.config.ts` | Next.js configuration. |
| `tsconfig.json` | TypeScript configuration. |
| `eslint.config.mjs` | ESLint configuration. |
| `postcss.config.mjs` | PostCSS configuration. |
| `package.json` | Dependencies and scripts. |
| `package-lock.json` | Locked dependency versions. |
