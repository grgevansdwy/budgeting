# Budgeting project

## WHY: purpose
A personal budget tracker for a single user (the repo owner): record income and spending, and track them against budgets.
Correctness of money amounts matters more than speed or polish. It handles the owner's real financial data, so privacy comes first.

## WHAT: codebase map

### Stack
Planned, not scaffolded yet. Update this section with exact versions once the app exists.
- TypeScript, Next.js, deployed on Vercel
- Supabase (Postgres + auth)
- Package manager: not chosen yet

### Layout
```
.claude/      # harness: hooks, agents, skills, settings.json
templates/    # blank SPEC / DECISIONS / DESIGN templates; copy out, leave originals blank
docs/plans/   # plans written by /interview (created on first use)
```
No application code yet.

## HOW: working here

### Commands
- Install: none configured
- Dev: none configured
- Test (all): none configured
- Test (single file): none configured
- Lint / typecheck: none configured
- Build: none configured
- Hook self-test: `bash .claude/hooks/selftest.sh`

Replace each `none configured` with the real script as soon as `package.json` exists.

### Conventions
- Store and compute money as integer cents. Never use floats for currency; convert to a decimal string only when displaying.
- Ask the user before any database schema change or migration, including Supabase migrations and changes to the data model.

### Workflow
- Plan non-trivial work with `/interview`, review with `/review`, tidy up with `/cleanup`, and commit with `/recap`.
- Plans live in `docs/plans/`.

### Don't
- Don't put real financial data in git: no bank exports, statements or real transactions. Use made-up data for seeds, fixtures and tests.
