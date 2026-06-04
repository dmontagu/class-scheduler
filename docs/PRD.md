# Product Requirements Document — Middle School Scheduling Assistant

**Status:** Draft

> This document describes a tool that helps middle-school staff build student
> schedules — assigning students to elective and core classes — from the
> spreadsheets they already maintain. It covers what we have built so far and
> where we want to take it. It is written to be read by the scheduling team, not
> just engineers; the [Glossary](#2-glossary) defines terms as we use them.

---

## 1. Summary

### 1.1 The problem
Each year the scheduling team must place ~270 students per grade (6/7/8) into
their classes. Core classes are largely uniform, but **electives** must be
distributed so that:
- every student's required slots are filled,
- sections stay within capacity (target 30, hard max 33),
- no student takes the same class twice, and
- the load is spread evenly.

Historically this was done in PowerSchool's scheduler, which produced many
unresolved conflicts requiring slow manual cleanup. Last year the team got a far
better result by handing the problem to a general AI chat assistant with a
hand-written prompt. That worked but isn't repeatable, auditable, or owned by the
team — they'd like a dependable in-house tool they can run themselves each year.

### 1.2 What we want to build
A **web application** where staff:
1. **Upload** their scheduling spreadsheet (roughly the format they keep today).
2. Let the tool **extract the scheduling specification** — courses, slots,
   sections/capacities, special populations, incompatibilities, and other
   requirements — using AI to parse the human-formatted sheet.
3. **Review and confirm** that extracted spec in a browsable UI, correcting any
   ambiguities through a back-and-forth conversation with the assistant (e.g.
   "this course is a semester, not year-long").
4. **Generate** a schedule with the solver once the spec is confirmed.
5. **Review and export** the result: per-student schedules, capacity tallies,
   spot-checks, and PowerSchool-ready files — in both course-number and
   human-readable-name form.

### 1.3 What already exists
A working command-line engine (`cjai`) that schedules electives for all three
grades from the current workbook. See [Appendix A](#appendix-a-current-implementation)
for specifics. The PRD's job is to define the path from that engine to the full
product, and to nail down the modeling decisions the team cares about.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Block** | A recurring time container in a student's week that holds one class. 6th uses "3rd"/"4th" period; 7th "7th"/"8th"; 8th "A-day"/"B-day". |
| **Quarter** | One of four terms (Q1–Q4). |
| **Slot** | A specific (block, quarter) a student must fill — e.g. "4th period, Q2". |
| **Section** | A specific class offering: a (course, teacher, block, quarter) with a capacity. |
| **Core class** | Required academic class (Math, ELA/SS, Science, Health) — nearly uniform across a grade. |
| **Elective** | A rotating class that fills the non-core slots. |
| **Year-long** | A course a student keeps all 4 quarters (Band, Choir, Orchestra, world languages). |
| **Semester** | A course spanning 2 quarters (e.g. Music Theory = Q1/Q2). |
| **Quarter class** | A course lasting a single quarter — the normal elective. |
| **Category** | A grouping of similar courses (Art, Tech Ed, FCS/Home Ec, Language, Performing Arts…) used for variety rules. |
| **Hard constraint** | A rule the schedule must never violate. |
| **Soft constraint** | A preference the solver optimizes toward but may trade off; violations are reported, not fatal. |

---

## 3. Goals and non-goals

### 3.1 Goals
- **Repeatable & owned.** The team runs it themselves each year; same input → same output.
- **Fit the data they naturally collect — and make it sustainable.** The current wide spreadsheet was built *just for this process*; the team doesn't normally maintain anything like it. Rather than lock that format in, propose a low-effort, durable way to gather and keep this information as it arrives over time from parents/teachers/students, ingesting from the systems and forms they already use. (See [§9.5](#95-sustainable-data-collection--maintenance).) The tool should still ingest legacy/ad-hoc formats during the transition.
- **Human-in-the-loop.** The tool proposes; people confirm. Ambiguities are surfaced and resolved before solving, never guessed silently.
- **Correct & explainable.** Every assignment is traceable; capacity, distinctness, and overrides are verifiable from the output alone.
- **Good schedules, not just valid ones.** Optimize for variety (see [§7](#7-soft-constraints-variety--quality)).
- **Handle the messy reality.** Special-education hand placements, advanced/compacted tracks, student incompatibilities, and data-entry errors.

### 3.2 Non-goals (for now)
- Building the full master timetable / bell schedule (when each period physically meets). PowerSchool / the existing process still owns final period-level placement where applicable — see [§6.4](#64-relationship-to-powerschool).
- Teacher contracts, room assignments, or staffing decisions.
- Real-time / mid-year rescheduling. Initial scope is the annual build (with easy re-runs).
- Replacing PowerSchool as the system of record.

---

## 4. Users and personas

- **Scheduling lead (district office).** Owns the build, defines tracks and
  overrides, runs the solver, exports to PowerSchool. Comfortable with
  spreadsheets, not code.
- **Building staff / counselors.** Provide special-population lists (SpEd,
  compacted math), incompatibilities, and validate that real students' schedules
  look right.
- **Administrator.** Wants confidence the result is fair, within capacity, and
  defensible.

---

## 5. End-to-end workflow

```
┌─────────┐   ┌──────────────┐   ┌────────────────┐   ┌────────┐   ┌──────────────┐
│ Upload  │──▶│ AI extracts  │──▶│ Review &       │──▶│ Solve  │──▶│ Review,      │
│ sheet   │   │ the spec     │   │ confirm spec   │   │        │   │ spot-check,  │
│         │   │ (courses,    │   │ (chat to fix   │   │        │   │ export       │
│         │   │ sections,    │   │ ambiguities)   │   │        │   │ (IDs + names)│
│         │   │ rules,       │   │                │◀──┤ (loop  │   │              │
│         │   │ overrides)   │   │                │   │  if    │   │              │
└─────────┘   └──────────────┘   └────────────────┘   │ infeas)│   └──────────────┘
                                          ▲            └────────┘          │
                                          └───────────── re-solve after edits ─┘
```

The loop matters: confirming the spec, solving, and reviewing are iterative. A
rejected or surprising result sends the user back to adjust constraints and
re-solve — cheaply, because solving is fast and deterministic.

---

## 6. Functional requirements

### 6.1 Spreadsheet ingestion and AI extraction
> The wide, multi-grid workbook we've been working from was assembled **just for
> this exercise** — it is not something the team maintains year-round. The product
> should therefore support **two paths**: (a) ingest legacy/ad-hoc spreadsheets
> like today's during the transition, and (b) read the cleaner **canonical data
> model** proposed in [§9.5](#95-sustainable-data-collection--maintenance), which
> is what we want them to migrate toward. AI extraction is what makes path (a)
> tolerable and bridges the two.

- **Input:** either a legacy `.xlsx` workbook (offering grids, per-grade rosters,
  music/year-long rosters) **or** the canonical tidy tables (§9.5) — and in
  practice, a mix, since different facts arrive from different sources.
- The tool **parses** the workbook into a structured **scheduling spec**:
  - **Courses** (name, number, category).
  - **Sections / offerings** (which teacher teaches which course, in which
    block/quarter, with what capacity).
  - **Slots** each student must fill, derived from their roster row.
  - **Year-long / semester / quarter** nature of each course (inferred, then confirmed).
  - **Special populations** (music year-longs, advanced tracks, SpEd).
  - **Incompatibilities** and other stated restrictions.
- Where the layout is regular, parse deterministically; where it is free-form or
  ambiguous, use **AI assistance** to interpret, but **always** present the
  interpretation for confirmation (never act on a guess).
- **Data-quality checks run on every import** and are surfaced, not auto-fixed:
  duplicates across rosters, the same student in two classes in one slot,
  a course appearing in an unexpected quarter (the kind of export glitch we
  already caught with Music Theory), partially-filled year-longs, etc.
  *(This anomaly-detection behavior already exists in the engine and must be
  preserved.)*

### 6.2 Spec review and confirmation (human-in-the-loop)
- A **browsable view** of the extracted spec: courses by category, sections with
  capacities, per-population slot requirements, and any flagged issues.
- A **conversational panel** to resolve ambiguities ("Music Theory is a Q1/Q2
  semester, not year-long" → the tool updates the spec and shows the effect).
- **Nothing is solved until the user marks the spec confirmed.** The confirmed
  spec is saved and versioned so a run is reproducible and auditable.
- Common ambiguities the review must make easy to fix:
  - year-long vs semester vs quarter for a course,
  - which courses belong to the elective "wheel" vs are pre-assigned,
  - block/period structure per grade (incl. A/B-day),
  - course → category mapping,
  - capacities (target vs hard cap).

### 6.3 Constraint model
The heart of the system. See [§7](#7-soft-constraints-variety--quality) for the
soft-constraint scoring. Constraints are split into **hard** (never violated) and
**soft** (optimized, trade-off-able, reported).

**Hard constraints**
| # | Constraint |
|---|---|
| H1 | Every required slot for every student is filled. |
| H2 | A section never exceeds its hard cap (default 33). |
| H3 | A student never takes the same course twice (all-distinct electives). |
| H4 | Pre-assigned placements are honored exactly: music year-longs, SpEd hand-schedules, advanced-track placements. |
| H5 | Incompatible student pairs are never placed in the same section. |
| H6 | A student is never double-booked (one class per slot). |
| H7 | A student is only assigned courses valid for their grade/track and offered in that slot. |

**Soft constraints** (weighted; see §7)
| # | Constraint |
|---|---|
| S1 | Spread section sizes evenly toward the target (default 30). |
| S2 | Avoid giving a student the same **teacher** in back-to-back quarters (and minimize teacher repetition overall). |
| S3 | Maximize **category variety** across a student's electives. |
| S4 | Never give two electives of the same **category** in the same quarter; avoid same-category in consecutive quarters. |
| S5 | For 6th/7th specifically: never two **languages** in the same quarter. |
| S6 | Prioritize variety for **year-long music students** (only ~4 elective slots, so each should ideally span distinct categories). |
| S7 | Honor **pairings** (`keep-together`): paired students share at least `min_together` classes, but not more than `max_together`. |
| S8 | **No two students share every class** (global `no_pair_shares_all_classes` / `max_shared_classes_any_pair` rule) — applies to all students, not just listed pairs. |

> Notes: (a) S4/S5/S7 can be promoted to **hard** per the `hard` flag on the rule
> or pairing (e.g. "two languages in one quarter is never acceptable," or an IEP
> pairing that *must* hold). The review UI lets the team set each rule's strength.
> (b) Incompatibilities (H5) and pairings (S7) are mirror images — "keep apart" vs
> "keep together" — captured the same way; a `hard=yes` pairing becomes a hard
> constraint.

### 6.4 Relationship to PowerSchool
The current process: the team tells PowerSchool the **sections** and the
**students who need them**, and PowerSchool places students into specific
class periods. Our tool's role is to **decide the assignments and produce the
import** PowerSchool consumes (course requests and any required hard placements),
plus give staff a clear, verifiable view of the result.

- **Open question (needs team input):** the exact PowerSchool import format and
  the precise division of labor — what our tool fixes vs what PowerSchool's build
  step still resolves. We have an example submission format and will confirm the
  E-column → term/slot mapping against a known past year (see [§9.4](#94-exports)).

### 6.5 Core classes, tracks, and special populations
The current engine handles **electives** well. **Core** classes need first-class
support because they are *mostly* uniform but have important exceptions:

- **Standard core:** the vast majority of students take the same core courses
  (e.g. Math 6, ELA/SS, Science, Health). These are effectively pre-set per grade
  and need section-balancing more than choice.
- **Advanced / compacted math track:** a subset (~60 students) must be in
  **compacted math**, which is offered as a small number of specific sections
  (e.g. "one of these two classes, with one of these two teachers"). The tool must
  let the team declare such a track — "these N students must be placed in one of
  these specific sections" — and schedule those students differently from the rest
  while respecting capacity.
- **Special education (SpEd):** some students have **hand-built schedules** with
  specific classes, times, and teachers. The tool must accept these as **fixed
  overrides taken as input**, schedule everything else around them, and never move
  them. (The engine already supports fixed slots; this generalizes them to core
  and to staff-supplied overrides.)
- **Incompatibilities:** staff supply pairs/sets of students who must not share a
  section. Honored as hard constraint H5; if a set can't be satisfied, the tool
  reports it rather than silently violating.

**Design principle:** model all of the above as **constraints layered on a base
assignment** — start from the fixed/overridden placements, then fill the rest.
Changing an override and re-solving should be cheap and reproducible.

### 6.6 Solver
- Deterministic: identical confirmed spec → identical schedule.
- Fast enough for interactive re-runs (seconds, not minutes) at ~270 students/grade.
- Respects all hard constraints; optimizes the weighted soft objective.
- When a hard constraint set is **infeasible**, it must say so clearly and point
  at the conflict (e.g. "compacted-math capacity is 50 but 60 students require
  it"), rather than produce a silently-broken schedule.
- Produces, for every student, a complete assignment plus a record of any
  unfilled slots or soft-constraint violations for the report.

### 6.7 Outputs and exports
See [§9](#9-data-model-formats--collection) for formats. Required outputs:
1. **Filled student schedules** — the roster sheets with every slot populated.
2. **Two parallel exports:**
   - **By course number** (for PowerSchool import).
   - **By course name** (Drama, Art, Ceramics, FCS…) for human review — *"the
     numbers are really confusing."* These must be generated from the same
     underlying assignment so they always agree.
3. **Capacity tally** — per-section assigned-vs-capacity, live/derived so it stays
   correct even if a human edits an assignment afterward. *(Already implemented.)*
4. **Data Issues report** — all flagged anomalies and any soft-constraint
   violations or unfilled slots.
5. **PowerSchool submission file** — the request-pair format (confirm E→slot mapping).
6. **Per-student calendar / spot-check** (see §6.8).

### 6.8 Spot-checking
- Look up **any student by ID** and see their full schedule laid out as a
  calendar/grid (block × quarter), in human-readable names.
- **Random-sample mode:** show a handful of random students for a sanity sweep,
  so staff can eyeball that real, known students' schedules look reasonable.
- Surface per-student soft-constraint notes ("got two Art-category electives in
  Q3 — only option given capacity") so reviewers understand any compromises.

---

## 7. Soft constraints: variety & quality

This section details the "good schedule, not just valid" requirement. The intent,
in the team's words: a student should **not get the same type of class with the
same teacher back-to-back** (don't let one teacher dominate a kid's year), and
should get a **variety** of electives rather than the same type all year.

### 7.1 Approach: a weighted objective
Model schedule quality as a **penalty score** to minimize, subject to the hard
constraints. Each soft rule contributes a weighted penalty; the solver prefers
schedules with lower total penalty. This is the standard, well-understood way to
encode "preferences with trade-offs" in scheduling/assignment problems and keeps
behavior tunable and explainable.

Suggested penalty terms (weights configurable in the review UI):

| Term | Penalty when… | Default weight |
|---|---|---|
| Teacher repeat (consecutive) | same teacher in back-to-back quarters | high |
| Teacher repeat (any) | same teacher more than once across the year | low–medium |
| Category clash (same quarter) | two electives of one category in the same quarter | very high (≈ hard) |
| Category repeat (consecutive) | same category in back-to-back quarters | medium |
| Category diversity shortfall | fewer distinct categories than slots allow | medium |
| Section imbalance | section size deviates from target | low |

### 7.2 Prioritizing music students
Year-long music students have only ~4 elective slots, so variety is **more
important and harder** for them. The objective should **up-weight** their
diversity terms (and improve them first) so the ideal — e.g. one Art, one
Tech Ed, one FCS, and one Language/Drama — is reached when feasible. Non-music
students have 8 slots, so variety is easier; the same rules apply with standard
weights.

### 7.3 Categories
Variety rules operate on **course categories**, not individual courses. The team
defines the categories and the course→category map during spec review. A starting
taxonomy (to confirm):

- **Art** (Art, Art II, Ceramics, Ceramics II)
- **Tech Ed** (Tech Ed, Computer Science, Video Production, Digital Music)
- **FCS / Home Ec** (FCS, FCS II)
- **Language** (Spanish, German)
- **Performing Arts** (Drama, Theatre/Drama, World Music, Music Theory)
- **Global / Other** (Global Awareness)

> 6th/7th specific rule (S5): two **Language**-category electives in the same
> quarter are disallowed. The team can mark any category clash as hard per grade.

### 7.4 How it's optimized (engineering note)
Start from a valid all-distinct, capacity-respecting assignment (today's solver),
then run an **improvement pass** that applies capacity-neutral swaps which lower
the penalty score (we already do this for distinctness; it generalizes to the
weighted objective). For harder instances, escalate to a stronger optimizer
(e.g. min-cost flow or local search / simulated annealing). Soft constraints are
*never* allowed to break a hard constraint; unavoidable soft violations are
reported for the last-mile human pass.

---

## 8. Non-functional requirements

- **Determinism & reproducibility.** Same confirmed spec → same schedule, every
  run. Randomness, if any, is seeded and recorded.
- **Explainability.** For any assignment, the tool can say why (constraint,
  capacity, override). For any *non*-ideal outcome, it can say what it traded off.
- **Auditability.** The confirmed spec, the run, and the output are saved together
  and versioned.
- **Student-data privacy.** **Student names are sensitive and are kept out of the
  data model entirely — the canonical `students` sheet is IDs only (§9.5), and
  names must never be sent to an LLM** during AI extraction. Work in student IDs
  throughout; resolve an ID to a name only locally in PowerSchool when a human
  needs it. More broadly: keep uploads out of version control, restrict access,
  prefer on-device/structured parsing, and if cloud AI is used for free-form
  interpretation, disclose it and minimize what's sent. *(Local data is already
  git-ignored in the engine.)*
- **Resilience to messy input.** Tolerate format drift year-to-year; fail loudly
  and specifically, never silently mis-schedule.
- **Performance.** Interactive: a full 3-grade solve in seconds.
- **Accessibility & clarity.** UI usable by non-technical staff; names over numbers
  wherever a human reads output.

---

## 9. Data model, formats & collection

### 9.1 Core entities
- **Course**: number, name, category, term-type (year-long | semester | quarter).
- **Section**: course + teacher + block + quarter + capacity (+ source cell for traceability).
- **Student**: id, grade, track(s), fixed/overridden slots, required open slots, incompatibilities.
- **Assignment**: student → {slot → course/section}.
- **Spec**: the confirmed bundle of the above + soft-constraint weights + categories.

### 9.2 Term types
The tool must represent and respect, per course:
- **Year-long** — fills all 4 quarters of a block (Band, Choir, Orchestra, languages).
- **Semester** — fills 2 quarters (e.g. Music Theory = Q1/Q2); the other quarters are open electives.
- **Quarter** — single quarter; the normal elective.

It must infer these from the data where possible (a course held in all 4 quarters
is year-long; fewer is semester/quarter) **and** let the team correct them during
review — this is exactly the ambiguity class we want the confirmation loop to catch.

### 9.3 Overrides & tracks (staff-supplied inputs)
- **Fixed placements:** student → specific section(s) (SpEd hand-schedules).
- **Tracks:** named groups (e.g. "Compacted Math") with a member list and an
  allowed set of sections; the solver must place each member in one allowed section.
- **Incompatibilities:** pairs that may **not** share a section (`hard` flag).
- **Pairings:** pairs that **should** share classes — `min_together` / `max_together`
  (`hard` flag); the mirror of incompatibilities.
- **Global rules:** broad policies (e.g. no pair shares every class) — see `rules`.

### 9.4 Exports
- **Numbers export** and **names export** (same data, two renderings).
- **Tally** (live formulas).
- **Data Issues**.
- **PowerSchool submission** (request pairs; confirm the E-column → term mapping
  against a known past year before relying on positions).
- **Per-student calendar** (block × quarter grid, names).

### 9.5 Sustainable data collection & maintenance

> **This is a proposal for the team to react to, not a finished decision.** The
> goal is to replace the once-a-year bespoke spreadsheet with a small set of
> durable, low-effort sources the team can keep current as information arrives.
>
> **See it concretely:** the repo includes a worked **mock example**
> (`docs/canonical-data-model-example-grade8.xlsx`) and **real starter files
> populated from this year's data**, one per grade
> (`docs/canonical-data-grade{6,7,8}-REAL.xlsx`) — the team can open these and
> fill in the blanks.

**One workbook PER GRADE.** Mixing grades in a single file is too much; each grade
(6/7/8) gets its own identical-shaped workbook.

**PRIVACY — no student names in the data.** Student names are sensitive, so the
`students` sheet holds **student IDs only**. Names are deliberately kept out of
everything the tool handles — and must **never be sent to an LLM** during AI
extraction. Anyone reviewing resolves an ID to a name locally in PowerSchool.
(Course and teacher names are not student PII and are fine to keep.)

**The core idea: tidy tables, one fact per row.** The current workbook is a *wide,
visual grid* — great for a human to read once, painful to maintain, validate,
merge, or update incrementally. The sustainable alternative is **normalized
("tidy") tables**: each row records one simple fact (this student is in this
ensemble; this section has this capacity). Tidy tables are easy to append to as
data trickles in, easy to validate, easy to diff over time, and easy for the tool
to combine. They can live as Google Sheets, CSVs, or a small database — the shape
matters more than the storage.

**Separate slow-changing "catalog" from fast-changing "roster/overrides."** These
have different owners and update rhythms and should not live in one sheet:

*Reference / catalog (changes yearly, slowly — owned by the scheduling lead):*

| Table | One row = | Key fields |
|---|---|---|
| `courses` | a course offered | course_id, name, **category**, **term_type** (year_long / semester / quarter), grade |
| `sections` | a class offering | section_id, course_id, teacher, block, which quarter(s) it runs, capacity_target, capacity_max |
| `blocks` | a grade's period structure | grade, block_label, notes (defines the slots students must fill, incl. A/B-day) |

*Per-student data (changes continuously — multiple owners, multiple sources):*

| Table | One row = | Key fields | Typical source |
|---|---|---|---|
| `students` | an enrolled student | student_id, grade *(no name)* | **PowerSchool export** (system of record) |
| `enrollments_music` | a music year-long/semester placement | student_id, course_id, section_id, term, **locked** | music sign-up form |
| `enrollments_language` | a year-long language placement | student_id, course_id, section_id, term, **locked** | world-language sign-up |
| `enrollments_sped` | a SpEd hand-placement | student_id, course_id, section_id, term, **locked** | SpEd case managers |
| `track_members` | a student in a track | track_id, student_id | teacher/placement (e.g. compacted math) |
| `track_sections` | a section a track may use | track_id, section_id | scheduling lead |
| `incompatibilities` | a "keep **apart**" pair | student_id_a, student_id_b, **hard**, reason | counselors/teachers |
| `pairings` | a "keep **together**" pair | student_id_a, student_id_b, **min_together**, **max_together**, **hard**, reason | counselors/teachers |
| `preferences` *(optional)* | a ranked choice | student_id, course_id, rank | students/parents, *if choice returns* |

*Global policy:*

| Table | One row = | Key fields |
|---|---|---|
| `rules` | a broad policy that applies to everyone (not one student) | rule_id, scope, value, **hard**, description |

**Enrollments are split by source** (`_music` / `_language` / `_sped`) so different
people maintain different sheets; the tool reads them together. **What this buys
us:** the solver only *decides* electives; **everything else — core, music,
language, SpEd, tracks — is just collected as enrollments/overrides** and honored.
The wide grid conflates all of these into one sheet; separating them by source
lets each be maintained independently and merged automatically by stable IDs.

**Two relationship sheets, opposite meaning, same shape:**
- `incompatibilities` — students who must **not** share a section (`hard=yes` is
  never violated; `hard=no` is a strong preference).
- `pairings` — students who **should** share classes: `min_together` (e.g. "at
  least 2") and `max_together` (so they don't share *every* class). Captured the
  same way as incompatibilities.
- Broadly, **no two students should share *every* class** — that's a global `rules`
  entry (`no_pair_shares_all_classes`) applying to everyone, not just listed pairs.

**Collection mechanisms (meet people where they are):**
- **Pull from the system of record.** Rosters and core enrollments come from
  **PowerSchool exports** — don't re-key what PowerSchool already knows.
- **Structured forms for human-supplied data.** A **Google Form → Sheet** per
  collection task lands tidy rows directly: an ensemble sign-up form (→
  `enrollments`), a track-nomination form for teachers (→ `track_members`), an
  incompatibility-report form for counselors (→ `incompatibilities`). Dropdowns
  and required fields validate at the point of entry, before the tool ever sees it.
- **One maintained catalog workbook** for `courses`/`sections`/`blocks`, updated
  once a year by the scheduling lead from the prior year as a starting point.
- **AI-assisted intake for the messy bits.** Where data still arrives as free-form
  emails, PDFs, or legacy sheets, the extraction step maps it into the tidy tables
  **for confirmation** — so adoption isn't blocked on perfect hygiene.

**Principles (scheduling-data best practices):**
- **Stable IDs as join keys**, names as labels — so the same student/course lines
  up across every source.
- **One owner + one cadence per table** — clear accountability; no "who updated
  the master sheet?"
- **Append-friendly & as-of-dated** — data comes in over months; tidy rows can be
  added without reshaping, and timestamps let us see what was known when.
- **Validate at the edge and on import** — form constraints up front, plus the
  tool's existing anomaly checks (duplicates, conflicts, out-of-place terms).
- **Catalog ≠ roster** — keep the slow reference data apart from the live
  per-student data.

### 9.6 Migration & education plan
The team will need support to adopt this; it should be gradual, not a big-bang.

1. **Provide ready-made templates** — the tidy sheets above with headers,
   dropdowns, examples, and a short "how to maintain this" note per table.
2. **Wire up the forms** — pre-built Google Forms feeding each per-student table,
   so collection is fill-in-the-blank, not spreadsheet surgery.
3. **Start where data is collected fresh** — adopt the tidy model first for things
   they gather anyway (music sign-ups, track nominations, incompatibilities) while
   pulling roster/core straight from PowerSchool. The catalog can be seeded from
   this year's workbook.
4. **Keep ingesting the legacy format** in parallel during the first cycle, so the
   team is never blocked while learning the new flow (and we can cross-check the
   two).
5. **Offer a one-time conversion** of the existing workbook into the tidy tables to
   bootstrap the catalog and current enrollments.
6. **Short training + living documentation** owned with the templates.

---

## 10. Architecture sketch

```
            ┌──────────────────────────── Web UI ───────────────────────────┐
            │  upload · spec review/chat · solve · review · spot-check · export │
            └───────────────┬───────────────────────────────┬────────────────┘
                            │                                │
                ┌───────────▼───────────┐        ┌───────────▼───────────┐
                │  Ingestion + AI spec   │        │   Export / reporting   │
                │  extraction + checks   │        │  (numbers, names,      │
                └───────────┬───────────┘        │   tally, calendar)     │
                            │                     └───────────▲───────────┘
                   ┌────────▼────────┐    ┌──────────────┐    │
                   │  Confirmed Spec │───▶│    Solver    │────┘
                   │  (versioned)    │    │ (hard + soft)│
                   └─────────────────┘    └──────────────┘
```

The existing CLI engine (parse → roster → solve → report) is the kernel of the
"ingestion / solver / export" boxes; the product wraps it with the web UI, the
AI-assisted extraction, the confirmation loop, and override/track/category
support. Keeping the solver a deterministic, well-tested core (separate from the
UI and the AI extraction) is a deliberate best-practice choice: the part that must
be correct stays simple and verifiable.

---

## 11. Phased roadmap

**Phase 0 — Engine (done).** Deterministic elective scheduler for 6/7/8: parse the
workbook, build rosters, enforce hard constraints (fill, capacity, all-distinct,
fixed placements), even spread, live tally, data-issue flagging, by-number
export, and PowerSchool submission. Year-long / semester / quarter handling.

**Phase 1 — Quality (soft constraints).** Categories + variety scoring (S2–S6),
weighted objective, improvement pass, per-student violation reporting. Names
export and per-student calendar / spot-check.

**Phase 2 — Overrides & core.** First-class SpEd overrides, named tracks
(compacted math), incompatibilities, and core-section balancing. Infeasibility
diagnostics.

**Phase 3 — Web product.** Upload, AI-assisted spec extraction, browsable review +
conversational ambiguity resolution, versioned confirmed specs, in-browser solve
and review, exports. Auth and student-data handling.

**Phase 3.5 — Sustainable data foundation (§9.5–9.6).** Canonical tidy-table
templates, Google Forms for human-collected data, PowerSchool-export ingestion,
and a one-time conversion of the legacy workbook. Can run alongside Phase 3; the
team can begin adopting the collection workflow as soon as templates exist, even
before the full web UI lands.

**Phase 4 — Hardening.** Format-drift tolerance, audit trail, PowerSchool import
finalization, performance, polish.

> The team's real scheduling data isn't ready yet, which is intentional runway:
> Phases 1–3 can be built and validated on the current (placeholder) data while
> the team assembles the live constraints.

---

## 12. Open questions (need team input)

1. **PowerSchool boundary & import format.** Exact files/fields, and what
   PowerSchool resolves vs what we fix. Confirm the E-column → term/slot mapping
   with a past year's source + submission pair.
2. **Categories.** Confirm the category list and the course→category map (§7.3).
3. **Hard vs soft.** Which variety rules are *hard* (e.g. two languages/quarter)
   vs soft, and per grade?
4. **Compacted math (and other tracks).** Exact section list, teachers,
   capacities, and member lists; are there other tracked courses beyond math?
5. **SpEd overrides.** Format the team will supply them in.
6. **Incompatibilities.** Format and expected volume; behavior when a set is
   infeasible.
7. **Semester courses.** Confirm which courses are semester and their quarters
   (this is exactly the Music Theory ambiguity — good candidate for the review loop).
8. **Names.** Will rosters include student names, or only IDs? (Affects privacy and
   spot-check usefulness.)
9. **Core scheduling depth.** Does the tool need to assign core to specific
   sections/periods, or only flag tracks/overrides and leave the rest to PowerSchool?
10. **Data sources & ownership (§9.5).** For each tidy table, who owns it and how
    often does it update? Which data can come straight from a **PowerSchool
    export** (rosters, core), so we never re-key it?
11. **Collection appetite.** Is the team open to **Google Forms** for music
    sign-ups, track nominations, and incompatibility reports? What do they collect
    today, in what form, and from whom?
12. **Adoption pace.** How much change is realistic this cycle — adopt tidy tables
    for freshly-collected data only, or convert everything at once?

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Format drift year-to-year breaks parsing | AI-assisted extraction + confirmation loop; loud, specific failures; validate against known totals. |
| AI mis-reads an ambiguous sheet | Never act on a guess — always present for confirmation; deterministic parse where possible. |
| Infeasible hard constraints (e.g. track over capacity) | Detect and explain precisely; don't emit a broken schedule. |
| Soft-constraint over-tuning makes results worse | Weights are visible and adjustable; report trade-offs; let team mark rules hard/soft. |
| Student-data exposure | Keep data local/access-controlled; minimize/disclose any cloud AI use; data git-ignored. |
| Over-automation hides real edge cases | Spot-check tooling + the Data Issues report keep humans in the loop. |
| New data model is too much change for staff | Gradual migration (§9.6): templates + forms, adopt fresh-collected data first, keep ingesting the legacy format in parallel, offer a one-time conversion. |

---

## Appendix A: Current implementation

The `cjai` engine already implements much of Phase 0:

- **Parsing** of the multi-sheet workbook: master course lists, the 6th/7th period
  grids and 8th's A/B-day grid, and per-grade student/music rosters (including
  differing column layouts per sheet).
- **Roster building** with year-long / semester / quarter handling derived from the
  data (a course held in all 4 quarters of a block is year-long; fewer is
  semester/quarter), and **data-issue flagging** (cross-roster duplicates,
  same-slot conflicts, year-long/elective overlaps) — *flagged, never auto-fixed*.
- **Solver:** fills every slot, enforces capacity (target 30 / hard 33) and
  all-distinct electives, spreads evenly, honors fixed (music) placements, and runs
  a capacity-neutral repair pass so distinctness reaches 100% where feasible.
- **Reporting:** filled student sheets, a **live** capacity tally (Excel formulas
  reading the assignment cells and the offering grid, so hand-edits stay correct),
  a Data Issues sheet, and a PowerSchool-style submission sheet.
- **Verified** on the current workbook: 6th (268 students), 7th (201), 8th (206) —
  all slots filled, **zero repeated electives**, all sections within cap.

Current capabilities map to the PRD as: hard constraints H1–H4, H6–H7 (done);
H5 incompatibilities, all soft constraints (S1 partial; S2–S6 to do), tracks,
SpEd overrides, the names export, spot-check, and the web product are the work
ahead.

Code layout (for engineers): `parse.py` (workbook → courses/sections/rosters),
`roster.py` (per-student record + anomalies), `solve.py` (assignment + repair),
`report.py` (exports + tally), `pipeline.py` (per-grade config + orchestration),
`cli.py` (entry point). The solver core is deliberately UI- and AI-independent.
