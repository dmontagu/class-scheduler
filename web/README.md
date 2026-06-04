# Class Scheduler — web app

A fully client-side React app that turns a grade's **canonical data workbook**
(see [`../docs/PRD.md`](../docs/PRD.md) §9.5) into an elective schedule. Two modes:

- **Generate schedule** — upload → validate/fix → generate → download.
- **Check an edited schedule** — upload the source workbook + a hand-edited
  schedule and re-verify every constraint (capacity, repeats, locked placements,
  keep-apart / keep-together rules).

**Everything runs in the browser — no server, no data leaves the machine, no LLM.**
Deploys free to GitHub Pages.

## Develop

```bash
pnpm install
pnpm dev          # local dev server
pnpm check        # prettier + eslint + tsc + vitest (what CI runs)
pnpm build        # typecheck + production build into dist/
pnpm preview      # serve the production build
```

## How it works

```
upload .xlsx ──▶ readWorkbook ──▶ validate ──▶ [Review & fix issues]
                                                      │
                                                      ▼
                              buildProblem ──▶ solve ──▶ writeOutput ──▶ download .xlsx
```

- **`src/domain/`** is framework-free and is the heart of the app:
  - `readWorkbook.ts` — ExcelJS reader → typed canonical data (+ structural issues).
  - `validate.ts` — referential integrity & data-quality checks → friendly `Issue`s
    (errors block generation; warnings don't).
  - `solve.ts` — builds the problem (year-long/enrolled courses are excluded from
    the elective wheel) and runs the assignment + capacity-neutral repair pass.
    This is a TypeScript port of the Python `cjai` engine and is verified against
    it on the real data (`src/domain/real.test.ts`).
  - `report.ts` — writes the output workbook (schedule by names + by numbers,
    capacity tally, issues) for download.
- **`src/components/`** + `App.tsx` — the MUI UI (Upload → Review → Results).

## Deploy (GitHub Pages)

`.github/workflows/deploy-web.yml` builds `web/` and publishes `web/dist` on every
push to `main` that touches `web/`. In repo **Settings → Pages**, set the source to
**GitHub Actions**. `vite.config.ts` uses `base: './'` so it works under a project
path with no repo-name coupling.

## Notes

- The Python engine in this repo is the reference implementation and test oracle;
  it is **not** part of this deployment.
- Initial bundle is ~390 KB gzipped (MUI + ExcelJS). Fine for an internal tool;
  ExcelJS could be lazy-loaded later to shrink first paint.
