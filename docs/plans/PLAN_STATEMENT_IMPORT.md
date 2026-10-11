Status: Done — 2026-10-11

# Plan: Statement import, split tracking and monthly Excel export

Repo root: `/Users/georgeevansdaenuwy/Documents/budgeting_project`. All paths below are relative to it. Existing files this plan touches: `/Users/georgeevansdaenuwy/Documents/budgeting_project/CLAUDE.md` and `/Users/georgeevansdaenuwy/Documents/budgeting_project/.gitignore`. `george-setup/` is never touched.

## Context
The repo holds only the Claude harness; there is no application yet. This feature is the first app code: a local-only, single-user tool that reads credit card and bank statements (PDFs or screenshots) in the browser, lets the owner review one month of expenses and income, split shared expenses, track who owes money, and export the month to Excel. Money correctness and privacy outrank polish: amounts are integer cents everywhere and nothing leaves the machine.

Assumptions:
- Node 24.5.0 and npm 11.5.1 are installed; pnpm is not.
- The currency has two decimal places and is displayed with `$`.
- The app runs with `next dev` or `next start` on localhost in a recent Chrome or Safari.
- Library versions are npm `latest` on 2026-10-11. Pin exact versions at install.

## Requirements
- Upload several PDFs or images at once; all extraction happens in the browser (PDF text layer, OCR for images).
- One generic parser finds date, description and amount per line; no per-bank parsers.
- After parsing, list the detected months; the user picks exactly one; it replaces the working set.
- Flag cross-file duplicates (same date, amount, description) for manual deletion; highlight low-confidence rows.
- Expenses table on the left, income on the right, each with a running total; rows are deletable, with editable amount, description and category.
- Refunds count as income. Card payments and own-account transfers are auto-tagged "Transfer", excluded from totals, and can be untagged.
- Categories are guessed by keyword rules, editable per row, and the user can add categories.
- Split an expense between N people with cent-exact maths; each other person becomes a to-do item.
- A to-do page lists the collect items; export is disabled until the list is empty.
- One `.xlsx` per month: expenses sheet, income sheet, totals, totals by category, and the in-app bar chart embedded as a PNG.
- Unit tests for parsing, split maths and totals, using made-up data only.
- Non-goals: login, Supabase, any schema, deployment, LLM calls, multi-currency, history of past months, per-bank parsers, native Excel charts, learning category rules from edits, deleting or renaming categories.

## Approach
Build a Next.js App Router app where every feature component is a client component and all logic lives in pure, framework-free modules under `src/lib/`. Extraction (pdf.js, Tesseract.js) produces one common shape, positioned text lines, so the parser and its tests never touch a PDF or an image. State lives in a Zustand store persisted to `localStorage`. To-do items are derived from split data, not stored separately, so they cannot drift out of sync.

### Recommended libraries
| Need | Choice | Why |
|---|---|---|
| Package manager | npm 11 | Already installed, nothing extra to set up, and the `protect-files.sh` hook already covers `package-lock.json`. |
| Framework | Next.js 16.4 + React 19.3, TypeScript strict | Matches the planned stack. Use the TypeScript version `create-next-app` pins. |
| PDF text | `pdfjs-dist` 6.4 | Gives text items with x/y positions, which column detection needs. |
| OCR | `tesseract.js` 7 | Runs in a WASM worker and returns word boxes and confidences. |
| Excel | `exceljs` 4.4 | `workbook.addImage` with base64 PNG works in the browser. SheetJS community edition cannot embed images. |
| Chart | `chart.js` 4.5, no React wrapper | Canvas-based, so `toBase64Image()` yields the same PNG that is shown on screen. Recharts is SVG and would need a rasterising step. |
| State | `zustand` 5 with `persist` | Small, has versioned `localStorage` persistence with `migrate` and `partialize`. |
| Tests | `vitest` 5, node environment | Native TypeScript, fast, no DOM needed because the logic is pure. |
| Formatting | `prettier` + `.prettierrc` | Activates the existing `.claude/hooks/format.sh`, which only formats when the project opts in. |

Alternatives considered:
- pnpm: faster installs, but needs installing and gives no benefit for a single app.
- Recharts: nicer React API, but image export is fragile.
- `write-excel-file`: smaller, but image support is less established than ExcelJS.
- Stored to-do entities: need sync logic on every split edit; a derived list has none.
- Per-file `new URL(..., import.meta.url)` workers: less predictable under Turbopack than serving worker files from `public/`.

### Folder layout
```
src/
  app/
    layout.tsx            # shell, nav (Month / To-do), system fonts only
    page.tsx              # import panel + tables + chart
    todo/page.tsx
  components/
    import/   UploadPanel, FileResultList, MonthPicker
    ledger/   LedgerTable, LedgerRow, AmountCell, CategorySelect, TotalsBar, AddCategoryDialog
    split/    SplitDialog
    todo/     TodoList
    chart/    CategoryChart
    export/   ExportButton
    HydrationGate.tsx
  lib/
    money.ts              # parse/format cents, string-based
    types.ts
    extract/  types.ts, pdf.ts, ocr.ts, lines.ts (group positioned items into lines), index.ts
    parse/    dates.ts, amounts.ts, columns.ts, polarity.ts, yearInference.ts,
              lineParser.ts, confidence.ts, stopPhrases.ts
    ledger/   categorize.ts, defaultRules.ts, transfers.ts, duplicates.ts, months.ts, totals.ts
    split/    split.ts
    todo/     todos.ts        # derived selector
    chart/    chartConfig.ts, renderChartPng.ts
    export/   workbook.ts, download.ts
    store/    store.ts, storage.ts
  test/fixtures/            # made-up statement lines as TS data
scripts/copy-vendor-assets.mjs   # pdf.js worker + cMaps, Tesseract worker/core/eng data -> public/vendor/
fixtures/synthetic/              # fake statement HTML pages for manual print-to-PDF / screenshot tests
```

### Data model (all amounts integer cents)
- `Cents`: a number that must pass `Number.isSafeInteger`.
- `Category`: `id`, `name`, `builtIn`.
- `CategoryRule`: `id`, `categoryId`, `keywords: string[]`. Matched on word boundaries against the normalised description; the first matching rule wins; fallback is Other.
- `SplitShare`: `id`, `name`, `isUser`, `amountCents`, `manual`, `requested`. `requested` is true once the to-do has been deleted. The user's share is never `manual`.
- `Split`: `totalCents` (the original row amount) and `shares` (user first). Invariant: the shares sum to `totalCents`.
- `Transaction`:
  - identity and source: `id`, `sourceFileId`, `sourceFileName`, `page`, `rawText`
  - content: `date` (ISO `YYYY-MM-DD`), `description`, `amountCents` (always positive; the user's share when split), `kind: 'expense' | 'income'`, `categoryId`
  - tags: `isTransfer`, `transferReason`, `duplicateDismissed`
  - review: `confidence` (0 to 1), `flags: ReviewFlag[]`, `reviewed`
  - `split: Split | null`
- `ReviewFlag`: `ocr-low`, `year-inferred`, `date-order-ambiguous`, `sign-guessed`, `columns-ambiguous`, `multiline-merged`, `ocr-corrected`, `outside-period`, `weak-description`.
- `TodoItem` (derived, never stored): `transactionId`, `shareId`, `name`, `amountCents`, `description`.
- `WorkingSet`: `month` (`YYYY-MM`), `transactions`, `sourceFiles: {id, name, kind}[]`, `loadedAt`.
- `Settings`: `categories`, `rules`, `dateOrder: 'MDY' | 'DMY' | 'auto'`. Settings survive month replacement.
- Persistence: two keys, `budget.settings.v1` and `budget.workingSet.v1`. Raw files, images and rows from unchosen months are never persisted.

### Generic line parser design
Input is `TextLine[]` per file: `text`, `tokens: {text, x0, x1, conf?}[]`, `y`, `height`, `page`, `source: 'pdf' | 'ocr'`. Output is candidate transactions with confidence and flags.

1. **Line building** (`extract/lines.ts`)
   - Group positioned items whose baselines are within half a line height, sort by x, and join with spaces based on gaps.
   - pdf.js items and Tesseract words go through the same code.
2. **Dates** (`parse/dates.ts`), recognised in the first tokens of a line
   - Numeric with `/`, `-` or `.`: `MM/DD/YYYY`, `MM/DD/YY`, `MM/DD`, and the day-first equivalents.
   - ISO `YYYY-MM-DD`.
   - Month names, short or full, with optional dot and comma: `12 Mar`, `12 Mar 2026`, `Mar 12`, `Mar 12, 2026`.
   - Two leading dates (transaction and posting): use the first, drop the second from the description.
   - Day/month order is inferred per file: any first part above 12 means DMY, any second part above 12 means MDY. With no evidence, use `Settings.dateOrder` and add `date-order-ambiguous`.
3. **Year inference** (`parse/yearInference.ts`)
   - Anchor is the statement closing date: look for "Statement period", "Closing date" or "Statement date"; otherwise take the latest full date in the document.
   - A yearless date takes the anchor's year, or the previous year if that would put it more than a few days after the anchor. This handles a December to January statement.
   - With no anchor, use the earlier of the file's `lastModified` and today, and add `year-inferred`.
4. **Amounts** (`parse/amounts.ts`), recognised from the right end of a line
   - Exactly two decimals are required, which rejects reference and phone numbers.
   - Forms: `1,234.56`, `1234.56`, `$1,234.56`, `-12.34`, `-$12.34`, `$-12.34`, `12.34-`, `+12.34`, `(12.34)`, `12.34 CR`, `12.34CR`, `12.34 DR`, and Unicode minus or en dash as minus.
   - Comma-decimal (`1.234,56`) is used when that pattern dominates the file.
   - Conversion to cents is by string manipulation only, never `parseFloat`.
   - For OCR lines, confusable characters inside amount and date tokens are corrected (`O` to `0`, `l`/`I`/`|` to `1`, `S` to `5`, `B` to `8`) and flagged `ocr-corrected`.
5. **Columns** (`parse/columns.ts`), for lines with more than one amount
   - If a header line names the columns (Debit, Withdrawals, Charges, Paid out / Credit, Deposits, Paid in / Balance / Amount), record each column's right edge and assign amounts by right-edge alignment.
   - Without a header, cluster the amount right edges. Test whether the rightmost cluster is a running balance: consecutive balance differences equal the row amount. If so, ignore the balance column and use the sign of the difference as the direction.
   - Otherwise take the leftmost amount and add `columns-ambiguous`.
6. **Direction: expense or income** (`parse/polarity.ts`), first rule that applies wins
   1. Separate debit and credit columns.
   2. Running-balance difference.
   3. Section headings such as "Payments and credits", "Purchases", "Deposits", "Withdrawals", "Fees".
   4. `CR` means income, `DR` or unmarked beside CR rows means expense.
   5. Account type from document keywords. Card ("credit limit", "minimum payment", "payment due"): positive is expense, negative is income. Bank ("checking", "savings", "available balance"): negative is expense, positive is income.
   6. Fallback: the majority sign is expense; add `sign-guessed`.
   - The import screen offers a per-file "flip income/expense" override.
7. **Multi-line descriptions and skipped lines** (`parse/lineParser.ts`, `parse/stopPhrases.ts`)
   - A line with no date that follows a transaction line within about 1.5 line heights, starts near the description column, and matches no stop phrase is appended to the description (at most two such lines); add `multiline-merged`.
   - A line with a date but no amount, followed by a line with an amount but no date, is merged into one row.
   - Lines matching "opening balance", "closing balance", "previous balance", "balance forward", "total", "subtotal", "new balance", "minimum payment", "page x of y" or "continued" are skipped even when they contain a date and an amount.
8. **Confidence** (`parse/confidence.ts`, all constants in one place)
   - Start at 1.0. OCR rows are multiplied by mean word confidence, with the amount token weighted most.
   - Deductions: `year-inferred` 0.2, `date-order-ambiguous` 0.2, `sign-guessed` 0.25, `columns-ambiguous` 0.2, `multiline-merged` 0.05, `ocr-corrected` 0.15, `outside-period` 0.3, `weak-description` 0.2.
   - Rows below 0.75 are highlighted; the flags are shown as the reason. Any edit or "mark OK" sets `reviewed` and clears the highlight.
9. **Transfer and payment detection** (`ledger/transfers.ts`)
   - Keyword pass on the normalised description: "payment thank you", "payment received", "autopay", "online payment", "epayment", "credit card payment", "crcardpmt", "transfer to", "transfer from", "online transfer", "xfer", "to savings", "from checking". Zelle and Venmo are not treated as transfers.
   - Pairing pass across files in the chosen month: an expense and an income with the same amount, dates within three days, and "payment" or "transfer" on at least one side are both tagged.
   - `transferReason` records why. A negative card row that is not a transfer is a refund and becomes income.
10. **Duplicates** (`ledger/duplicates.ts`)
    - Key is date, amount, kind and normalised description (lowercase, alphanumerics only).
    - A group is flagged only when its rows come from at least two different files, so two identical coffees in one statement are not flagged.
    - Derived on every render, minus rows with `duplicateDismissed`; deleting down to one row clears the flag.

### Split rules (`lib/split/split.ts`)
- **Create**: people count N is an integer from 2 to 20 and includes the user; other names are required and trimmed. Each share is `floor(total / N)` and the remainder cents go to the user.
- **Edit one person's amount**: that share becomes `manual`. The remainder (total minus all manual shares) is spread equally over non-manual shares, user included, with leftover cents to the user.
- **User's share**: always computed and read-only in the dialog, so it can always absorb the remainder.
- **All others manually edited**: the user's share is the whole remainder.
- **Amount exceeding the total**: an entry above `total - sum of other manual shares` is rejected with an inline message showing the maximum; nothing changes.
- **Negative results**: negative or non-numeric entries, or more than two decimals, are rejected. Zero is allowed, and a zero share produces no to-do. With validation in place no share can go negative.
- **Reset**: "Reset to equal" clears all manual flags.
- **Re-splitting**: the Split button on a split row opens the same dialog in edit mode. Adding a person adds a non-manual share and rebalances; removing a person rebalances the rest; existing manual amounts are kept if they still fit, otherwise the change is rejected.
- **Un-splitting**: restores `amountCents` to `split.totalCents` and removes the split; asks for confirmation if any share was already requested.
- **Editing a split row**:
  - The amount cell is read-only and shows "your share of $X".
  - The original total is editable inside the dialog; manual shares are kept and the rest rebalanced, and a total below the manual sum is rejected.
  - Description edits flow into the to-do text automatically.
- **Deleting a split row**: asks for confirmation when it has outstanding to-dos, then removes the row and its to-dos.
- **Requested shares that change**: if a share's amount changes after its to-do was deleted, `requested` resets to false and the to-do reappears with the new amount.
- **Transfers and income**: Split is disabled on transfer rows and does not exist on income rows. Tagging a split row as Transfer requires un-splitting first.
- **Totals**: expense and category totals use `amountCents`, the user's share.

## Steps
One commit per step, each reviewed with `/review` and committed with `/recap`.

1. **Scaffold the app** — files: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.prettierrc`, `.nvmrc`, `src/app/*`, `.gitignore`, `CLAUDE.md`
   - Run `create-next-app` (TypeScript, App Router, `src/`, ESLint, Tailwind, npm) in a temporary folder and move the result in. It refuses to run in a folder that already holds `CLAUDE.md`, `.claude/` and `templates/`.
   - Merge its ignore rules into the existing `.gitignore`, keeping the two current entries. Add `public/vendor/`, `*.pdf`, `*.xlsx` and `/statements/` so real statements cannot be committed by accident.
   - Exclude `george-setup/` in `tsconfig.json`, ESLint and later Vitest.
   - Replace the Google font from the template with system fonts, and set `NEXT_TELEMETRY_DISABLED=1` in the npm scripts. The `.env` files are blocked by `protect-files.sh`, so the flag goes in the scripts.
   - Add Prettier and pin exact versions with `engines.node`.
   - Update `CLAUDE.md`: Stack with exact versions and "local only, no Supabase or Vercel for this feature"; Commands for install, dev, lint, typecheck, build; Layout.
   - Verify: `npm run dev` serves a blank page, `npm run lint`, `npm run typecheck` and `npm run build` pass, and `bash .claude/hooks/selftest.sh` still passes.

2. **Test runner and money module** — files: `vitest.config.ts`, `src/lib/money.ts`, `src/lib/money.test.ts`, `package.json`, `CLAUDE.md`
   - `parseAmountToCents` and `formatCents`, string-based, with safe-integer checks.
   - Update `CLAUDE.md` with the all-tests and single-file test commands.
   - Verify: tests cover `0.1 + 0.2`-style cases, thousands separators, negative forms, and rejection of three decimals and empty input.

3. **Types and persisted store** — files: `src/lib/types.ts`, `src/lib/store/store.ts`, `src/lib/store/storage.ts`, `src/lib/store/store.test.ts`, `src/components/HydrationGate.tsx`, `src/lib/ledger/defaultRules.ts`
   - Zustand store with settings and working-set slices, `persist` with version 1, and a storage wrapper that catches quota errors.
   - Actions: replace working set, edit row, delete row, set category, toggle transfer, add category, dismiss duplicate, mark reviewed.
   - Seed the nine starting categories and the default keyword rules.
   - Verify: store tests with an in-memory storage stub cover the round trip, replace-on-month-change, and settings surviving a replace.

4. **Parser tokens: dates and amounts** — files: `src/lib/parse/dates.ts`, `src/lib/parse/amounts.ts`, tests beside each
   - Verify: table-driven tests for every format listed in the parser design, including rejects (phone numbers, reference numbers, amounts without decimals).

5. **Parser assembly** — files: `src/lib/extract/types.ts`, `src/lib/parse/columns.ts`, `polarity.ts`, `yearInference.ts`, `stopPhrases.ts`, `confidence.ts`, `lineParser.ts`, tests, `src/test/fixtures/*.ts`
   - Fixtures are hand-written `TextLine[]` arrays with obviously fake merchants. Cover: a card statement with signed amounts, a bank statement with debit/credit/balance columns, a `CR`-suffix statement, a yearless December to January statement, wrapped descriptions, and a noisy OCR-style sample.
   - Verify: each fixture produces the expected rows, kinds, cents, years and flags; skipped lines never appear.

6. **Ledger logic** — files: `src/lib/ledger/categorize.ts`, `transfers.ts`, `duplicates.ts`, `months.ts`, `totals.ts`, tests
   - Month grouping with per-file counts; category guessing; both transfer passes; duplicate groups; totals for expenses, income and per category, excluding transfers.
   - Verify: tests for the totals (transfer exclusion, split rows counting the user's share once the split module exists), same-file identical rows not flagged, and the pairing pass.

7. **PDF extraction** — files: `scripts/copy-vendor-assets.mjs`, `package.json` (`postinstall`, `predev`, `prebuild`), `src/lib/extract/pdf.ts`, `src/lib/extract/lines.ts`, `lines.test.ts`, `fixtures/synthetic/fake-card-statement.html`, `fixtures/synthetic/fake-bank-statement.html`
   - The script copies the pdf.js worker, cMaps and standard fonts into `public/vendor/pdfjs/`. `pdfjs-dist` is loaded with a dynamic import in the browser only, with `workerSrc` pointing at the copied file.
   - Verify: unit test for line grouping; manually print a synthetic HTML statement to PDF, load it on a temporary debug view, and confirm the lines and positions.

8. **OCR extraction** — files: `scripts/copy-vendor-assets.mjs`, `src/lib/extract/ocr.ts`, `src/lib/extract/index.ts`
   - Self-host the Tesseract worker, WASM core and English data under `public/vendor/tesseract/` and pass `workerPath`, `corePath` and `langPath`. By default Tesseract.js fetches these from a CDN.
   - Request word boxes and confidences; set page segmentation for tabular text and keep inter-word spaces.
   - Preprocess on a canvas: upscale small screenshots, convert to greyscale, invert dark-mode images.
   - PDF pages with no text layer are rendered to a canvas and sent through OCR.
   - Reuse one worker across files and terminate it when the batch finishes.
   - Verify: screenshot a synthetic statement, import it, and confirm rows appear with OCR flags; the Network tab shows only localhost requests.

9. **Import screen** — files: `src/components/import/*`, `src/app/page.tsx`
   - Multi-file picker and drop zone for PDF, PNG, JPEG and WebP.
   - Per-file progress, row count, errors (password-protected PDF, unreadable image, no rows found) and the flip and date-order overrides.
   - Month list with counts; choosing one runs step 6 and replaces the working set, with a confirmation when the current set has rows or outstanding to-dos.
   - Verify: import two synthetic files covering two months, pick one, and confirm only that month loads and a reload keeps it.

10. **Tables** — files: `src/components/ledger/*`, `src/app/page.tsx`
    - Expenses left, income right, sorted by date, with a running total column and a table total.
    - Inline edit of description and amount (through `parseAmountToCents`; zero and negative rejected), category dropdown, add-category dialog, delete, Transfer badge with untag, a "move to income/expenses" action, review highlight with reasons and "mark OK", and duplicate badge with "delete" and "keep".
    - Verify: manual checklist for each action; totals match a hand sum of the synthetic data; transfer rows are greyed and excluded.

11. **Split maths** — files: `src/lib/split/split.ts`, `split.test.ts`, `src/lib/todo/todos.ts`, `todos.test.ts`
    - Pure functions: `createEqualSplit`, `setShareAmount`, `setTotal`, `addPerson`, `removePerson`, `resetToEqual`, `unsplit`, `selectTodos`.
    - Verify: tests for every rule in "Split rules", plus a loop over many totals and people counts asserting the sum invariant, integer shares and no negative share.

12. **Split dialog** — files: `src/components/split/SplitDialog.tsx`, `src/components/ledger/LedgerRow.tsx`, `src/lib/store/store.ts`
    - Two-stage dialog: people count, then names and amounts with live validation.
    - Verify: split $100.00 three ways and see $33.34 / $33.33 / $33.33 with the row showing $33.34; edit one share and watch the others rebalance; un-split restores $100.00.

13. **To-do page and export gate** — files: `src/app/todo/page.tsx`, `src/components/todo/TodoList.tsx`, `src/app/layout.tsx`, `src/components/export/ExportButton.tsx`
    - Lists "Collect $X from Name — description" with delete; the nav shows the outstanding count.
    - The export button is disabled with an explanation and a link while the list is non-empty.
    - Verify: deleting the last item enables export; editing a requested share brings its item back.

14. **Category chart** — files: `src/lib/chart/chartConfig.ts`, `src/lib/chart/renderChartPng.ts`, `src/components/chart/CategoryChart.tsx`, `src/app/page.tsx`
    - One config builder feeds both the on-screen chart and an off-screen canvas render with animation off, so the export does not depend on which page is open.
    - Verify: the chart matches the category totals; the PNG function returns a non-empty data URL.

15. **Excel export** — files: `src/lib/export/workbook.ts`, `workbook.test.ts`, `src/lib/export/download.ts`, `src/components/export/ExportButton.tsx`
    - `buildWorkbook(workingSet, settings, chartPng)` is pure; ExcelJS is loaded on click.
    - Sheets: Expenses and Income (date, description, category, amount, and for split rows the original total and who it was shared with), and Summary (total spending, total income, totals by category, chart image).
    - Amount cells are numbers with a two-decimal format; totals are written as values computed from integer cents, not Excel formulas.
    - File name `budget-YYYY-MM.xlsx`.
    - Verify: the test writes a buffer, reads it back with ExcelJS and checks the cells, totals and one embedded image; manually open the file in Excel or Numbers.

16. **Hardening and docs** — files: `next.config.ts`, `CLAUDE.md`, assorted components
    - Content Security Policy for production runs limiting connections to self and allowing local workers and WASM.
    - Storage-full message, empty states, and removal of the debug view from step 7.
    - Final `CLAUDE.md` pass on Stack, Layout and Commands.
    - Verify: a full run with synthetic files under `npm run build && npm run start` shows no non-localhost requests in the Network tab; all tests, lint and typecheck pass.

## Files to change
- `CLAUDE.md` — Stack, Layout and Commands updated in steps 1, 2 and 16.
- `.gitignore` — Next.js entries, `public/vendor/`, `*.pdf`, `*.xlsx`, `/statements/`.
- New config: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.prettierrc`, `.nvmrc`, `vitest.config.ts`.
- New code: everything under `src/`, `scripts/copy-vendor-assets.mjs`, `fixtures/synthetic/`.
- Not changed: `.claude/`, `templates/`, `george-setup/`.

## Reuse
There is no application code to reuse. The harness pieces that apply:
- `.claude/hooks/format.sh` — formats edited files once Prettier is a dependency (step 1).
- `.claude/hooks/protect-files.sh` — blocks hand edits to `package-lock.json` and `.env*`; dependencies change only through npm, and no step needs an `.env` file.
- `.claude/hooks/selftest.sh` — run after step 1 to confirm the harness still works.
- `.claude/agents/test-writer.md` — can write the table-driven tests in steps 4, 5 and 11.
- `src/lib/money.ts` (step 2) — the only place strings become cents or cents become strings; the parser, the table cells, the split dialog and the export all call it.

## Risks / open questions
Risks:
- **OCR accuracy**: screenshots can misread digits and decimal points. Mitigations are preprocessing, confusable-character correction, per-row confidence and mandatory visual review; expect manual fixes on low-resolution images.
- **Generic parser coverage**: unusual layouts (amount before description, dates mid-line, statements without decimals) will parse badly. The per-file flip and date-order overrides and the review flags are the safety net.
- **Workers under Next.js**: pdf.js needs the worker file to match the library version exactly, and both libraries must load only in the browser. The copy script should fail loudly on a version mismatch. The exact Tesseract.js 7 asset file names and output options need confirming at step 8.
- **Third-party requests**: Tesseract.js and the Next.js template (fonts, telemetry) make network calls by default. Steps 1, 8 and 16 remove them; the Network-tab check is the proof.
- **ExcelJS maintenance**: the last release was in 2023. It works in browsers, but if bundling fails under Turbopack the fallback is its prebuilt browser bundle.
- **TypeScript 7**: npm `latest` is 7.0.2; if Next.js 16.4 or ESLint tooling is not ready for it, pin the last 5.x or 6.x release.
- **Local storage**: one month is well under the 5 MB limit, but clearing browser data wipes the working set and custom categories, and data is per browser and per port.
- **Fixture privacy**: fixtures must be invented by hand, never redacted copies of real statements. The `.gitignore` additions are a backstop only.
- **Excel amounts**: cells hold cents divided by 100 as numbers so Excel can sum them. This is the one float conversion, at the display boundary.

Open questions for the user (defaults in the plan are marked):
1. Is the currency always two-decimal dollars? Default: yes.
2. Should income rows use the same category list? Default: yes, defaulting to Other, with the chart and category totals covering expenses only.
3. Should Transfer rows appear in the Excel file? Default: omitted.
4. Is the "move to income/expenses" action in step 10 wanted? It was not in the requirements; it is included because the parser can guess direction wrongly.
5. Is a read-only user share in the split dialog acceptable? Default: yes; the alternative is letting the user lock their own share.
6. Should `CLAUDE.md` keep Supabase and Vercel as the planned stack? Default: keep, marked unused by this feature.
7. Which default date order when a file gives no evidence? Default: month first.

## Verification
- Automated: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `bash .claude/hooks/selftest.sh`.
- Parser: every fixture in `src/test/fixtures/` yields the expected rows, cents, direction, year and flags.
- Split: property-style loop confirms shares are integers, non-negative and sum to the total for many totals and people counts.
- Export: the round-trip test reads the generated workbook back and checks sheets, totals and the embedded image.
- Manual end-to-end with synthetic files only:
  1. Print `fixtures/synthetic/*.html` to PDF and screenshot one of them.
  2. Upload all at once, pick a month, and confirm duplicates, transfers and low-confidence rows are marked.
  3. Edit, delete and recategorise rows and check both totals.
  4. Split an expense, confirm the to-do items appear and export is disabled.
  5. Delete the to-dos, export, and open the `.xlsx` to check both sheets, the summary and the chart image.
  6. Reload the page and confirm the working set persists.
  7. Keep the Network tab open throughout and confirm only localhost requests.
- Privacy check before each commit: `git status` shows no `.pdf`, `.xlsx` or image files outside `fixtures/synthetic/`.
