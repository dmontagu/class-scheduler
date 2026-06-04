# Class Scheduler

A small, **fully client-side** tool that builds middle-school **elective schedules** from a
tidy spreadsheet — fill every student's open elective slots evenly, keep each student's classes
distinct, respect capacities and pre-placed (music / language / SpEd) classes, and export a
PowerSchool-ready file plus human-readable views.

- **Web app** (`web/`) — a React app that runs **entirely in your browser**: upload a grade's
  workbook, fix anything it flags, generate, and download. No server, no uploads, **no student
  data ever leaves the machine**. Also has a *Check an edited schedule* mode that re-verifies a
  hand-edited schedule against the source constraints. Deploys free to GitHub Pages.
- **Python engine** (`src/cjai/`) — the original reference implementation and test oracle. The
  web app's solver is a TypeScript port verified to match it. The Python side is **not** part of
  the deployment.

## The input: a "grade workbook"

One `.xlsx` per grade, with a few **tidy tables** (one fact per row):

| Sheet | One row = |
|---|---|
| `courses` | a class offered — id, name, category, term type (year_long / semester / quarter) |
| `sections` | a class offering — teacher, block, which quarters, capacity target & max |
| `blocks` | the grade's periods (e.g. A/B days, or 3rd/4th) |
| `students` | a student ID (no names — student names are kept out of the data) |
| `enrollments_music` / `_language` / `_sped` | a pre-placed class the solver must honor |
| `incompatibilities` / `pairings` | keep-apart / keep-together rules (optional) |
| `rules` | global policies, e.g. "no two students share every class" (optional) |

A downloadable example is built into the app (and lives at
[`web/public/example-grade8-workbook.xlsx`](web/public/example-grade8-workbook.xlsx)).
The data model is described in detail in the [PRD](docs/PRD.md) §9.5.

## Run the web app

```bash
cd web
pnpm install
pnpm dev        # local dev server
pnpm check      # prettier + eslint + tsc + vitest
pnpm build      # production build into web/dist
```

Deploy: push to `main` and the GitHub Actions workflow publishes `web/dist` to GitHub Pages
(set **Settings → Pages → Source: GitHub Actions**).

## Run the Python engine

```bash
uv sync
uv run pytest
uv run cjai schedule path/to/workbook.xlsx -o schedule.xlsx
```

## Documents

- [`docs/PRD.md`](docs/PRD.md) — product requirements, the data model, constraints, and roadmap.
- [`docs/spec.md`](docs/spec.md) — early spec notes.

## Privacy

Real student data is **never** committed (the example workbook and all docs use fictional,
generated data). Local data files are git-ignored. The web app processes files locally and
sends nothing to any server or LLM.

## License

[MIT](LICENSE).
