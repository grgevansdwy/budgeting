# Budgeting project

## WHY: purpose
A personal budget tracker for a single user (the repo owner): record income and spending, and track them against budgets.
Correctness of money amounts matters more than speed or polish. It handles the owner's real financial data, so privacy comes first.

## WHAT: codebase map

### Stack
- TypeScript 5.9 (strict), Next.js 16.4 (App Router, Turbopack), React 19.3, Tailwind CSS 4
- Node 24, npm 11 (`package-lock.json`); all dependency versions are pinned exactly
- State: zustand 5, persisted to browser `localStorage` under the key `budget.v1`
- Statement reading, all in the browser: pdfjs-dist 6.4 (PDF text), tesseract.js 7 (OCR for images)
- Export: exceljs 4.4 (`.xlsx`), chart.js 4.5 (bar chart, embedded as a PNG)
- Tests: vitest 5 (node environment). Formatting: prettier 3
- The app is local-only: no server routes, no database, no login, no LLM calls. Statements never leave the machine.
- Supabase (Postgres + auth) and Vercel are still the plan for a later hosted version; nothing uses them yet.
- This Next.js version has breaking changes from older ones: see `AGENTS.md` and `node_modules/next/dist/docs/`.

### Layout
```
.claude/            # harness: hooks, agents, skills, settings.json
templates/          # blank SPEC / DECISIONS / DESIGN templates; copy out, leave originals blank
docs/plans/         # plans written by /interview
src/app/            # pages: / (import, tables, chart, export) and /todo (money to collect)
src/components/     # client components, grouped by feature
src/lib/            # pure logic, no React: money, types, parse, ledger, split, todo, chart, export, store
src/lib/extract/    # browser-only PDF and OCR extraction into positioned text lines
src/test/fixtures/  # made-up statement lines for parser tests
fixtures/synthetic/ # fake statement HTML pages for manual print-to-PDF / screenshot testing
scripts/            # copy-vendor-assets.mjs: copies pdf.js and Tesseract workers into public/vendor/
public/vendor/      # generated at install time, gitignored
```

## HOW: working here

### Commands
- Install: `npm install` (also copies worker assets into `public/vendor/`)
- Dev: `npm run dev` (http://localhost:3000)
- Test (all): `npm test`
- Test (single file): `npx vitest run src/lib/money.test.ts`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Format: `npm run format`
- Build: `npm run build`, then `npm run start`
- Hook self-test: `bash .claude/hooks/selftest.sh`

### Conventions
- Store and compute money as integer cents. Never use floats for currency; convert to a decimal string only when displaying.
- `src/lib/money.ts` is the only place strings become cents or cents become strings.
- No network requests for user data: workers, WASM and OCR language data are served from `public/vendor/`, never a CDN.
- Ask the user before any database schema change or migration, including Supabase migrations and changes to the data model.

### Workflow
- Plan non-trivial work with `/interview`, review with `/review`, tidy up with `/cleanup`, and commit with `/recap`.
- Plans live in `docs/plans/`.

### Don't
- Don't put real financial data in git: no bank exports, statements or real transactions. Use made-up data for seeds, fixtures and tests.
