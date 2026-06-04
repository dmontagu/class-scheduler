# ruff: noqa: E501
"""Generate per-grade canonical workbooks populated from THIS YEAR'S real data.

Uses the cjai engine to extract real courses, sections, student IDs, and music/
language year-long enrollments for grades 6/7/8 into the canonical tidy model
(PRD §9.5), leaving the human-supplied sheets (SpEd, tracks, incompatibilities,
pairings, preferences) blank for the scheduling team to fill in.

Privacy: only student IDs are emitted — never names.
Run: `uv run python scripts/make_real_workbooks.py`
"""

from __future__ import annotations

from collections import defaultdict

import canonical_writer as cw
from openpyxl import load_workbook

from cjai.parse import parse_ab_grid, parse_period_grids
from cjai.pipeline import GRADES as GRADE_CFG
from cjai.pipeline import load_grade_problem

WORKBOOK = "data/scheduling-26-27.xlsx"

# core courses per grade (course_no, name, category, term_type) — from the rosters
CORE = {
    6: [(3567, "Math 6", "Core-Math", "year_long"), (5462, "ELA/SS 6", "Core-ELA/SS", "year_long"),
        (3619, "Health 6", "Core-Health", "quarter"), (3623, "Science 6", "Core-Science", "year_long")],
    7: [(3568, "Math 7", "Core-Math", "year_long"), (6566, "ELA/SS 7", "Core-ELA/SS", "year_long"),
        (3660, "Health 7", "Core-Health", "quarter"), (3664, "Science 7", "Core-Science", "year_long")],
    8: [(3569, "Math 8", "Core-Math", "year_long"), (9789, "ELA/SS 8", "Core-ELA/SS", "year_long"),
        (3661, "Health 8", "Core-Health", "quarter"), (3655, "Science 8", "Core-Science", "year_long")],
}
BLOCKS = {
    6: [(6, "3rd", "First elective period"), (6, "4th", "Second elective period"),
        (6, "Core", "Core academic blocks — placed via PowerSchool")],
    7: [(7, "7th", "First elective period"), (7, "8th", "Second elective period"),
        (7, "Core", "Core academic blocks — placed via PowerSchool")],
    8: [(8, "A", "A-day elective (alternating)"), (8, "B", "B-day elective"),
        (8, "Core", "Core academic blocks — placed via PowerSchool")],
}


def categorize(name: str) -> str:
    n = name.upper()
    checks = [
        (("BAND", "CHOIR", "ORCHESTRA"), "Music"),
        (("SPANISH", "GERMAN", "FRENCH", "LATIN"), "Language"),
        (("TECH ED", "COMPUTER", "COMP SCI", "VIDEO", "DIGITAL"), "Tech Ed"),
        (("ART", "CERAMIC"), "Art"),
        (("FCS", "FAMILY", "HOME EC"), "FCS"),
        (("DRAMA", "THEATRE", "THEATER", "MUSIC THEORY", "WORLD MUSIC"), "Performing Arts"),
        (("GLOBAL",), "Global"),
    ]
    for keywords, cat in checks:
        if any(k in n for k in keywords):
            return cat
    return ""  # leave blank for the team to set


def fmt_quarters(quarters: set[int]) -> str:
    qs = sorted(quarters)
    if qs == [1, 2, 3, 4]:
        return "Q1-Q4"
    if len(qs) == 2 and qs[1] == qs[0] + 1:
        return f"Q{qs[0]}-Q{qs[1]}"
    return ",".join(f"Q{q}" for q in qs)


def build_grade(grade: int):
    cfg = GRADE_CFG[grade]
    problem, _anoms, resolver = load_grade_problem(WORKBOOK, grade)
    ws = load_workbook(WORKBOOK, data_only=True)[cfg.offerings_sheet]

    # per-student year-long/semester placements -> (course, block) -> {quarters}
    fixed_map: dict[int, dict[tuple[int, str], set[int]]] = defaultdict(lambda: defaultdict(set))
    for s in problem.students:
        for slot, course in s.fixed.items():
            fixed_map[s.sid][(course, slot.block)].add(slot.quarter)
    qmax: dict[int, int] = defaultdict(int)
    for blocks in fixed_map.values():
        for (course, _b), qs in blocks.items():
            qmax[course] = max(qmax[course], len(qs))
    yearlong = {c for c, n in qmax.items() if n == 4}
    semester = {c for c, n in qmax.items() if n in (2, 3)}

    def term_type(course: int) -> str:
        if course in yearlong:
            return "year_long"
        if course in semester:
            return "semester"
        return "quarter"

    # ----- sections (real grid; collapse per course/teacher/block) -----
    if cfg.ab_grid:
        grid = parse_ab_grid(ws, resolver, grade)  # includes music sections
    else:
        grid = [s for s in parse_period_grids(ws, resolver) if s.grade == grade]
    grouped: dict[tuple, dict] = {}
    for sec in grid:
        key = (sec.course_no, sec.teacher, sec.slot.block)
        g = grouped.setdefault(key, {"name": sec.course_name, "cap": sec.capacity, "quarters": set()})
        g["quarters"].add(sec.slot.quarter)
        g["cap"] = max(g["cap"], sec.capacity)

    section_rows: list[list] = []
    sec_by_course_block: dict[tuple[int, str], str] = {}
    n = 0
    for (course, teacher, block), g in sorted(grouped.items(), key=lambda kv: (kv[0][2], kv[0][1], kv[0][0])):
        n += 1
        sid = f"S{grade}-{n:03d}"
        # capacity_target = the grid number (ideal); capacity_max = hard cap with
        # headroom (>=33) so demand over target can still be placed.
        section_rows.append(
            [sid, course, g["name"], teacher, block, fmt_quarters(g["quarters"]), g["cap"], max(g["cap"], 33)]
        )
        sec_by_course_block[(course, block)] = sid

    # synthesize music/year-long sections that aren't in the grid (6th/7th music rows)
    for blocks in fixed_map.values():
        for (course, block), qs in blocks.items():
            if (course, block) not in sec_by_course_block:
                n += 1
                sid = f"S{grade}-{n:03d}"
                name = resolver.name_by_no.get(course, str(course))
                section_rows.append([sid, course, name, "(confirm)", block, fmt_quarters(qs), "", ""])
                sec_by_course_block[(course, block)] = sid

    # ----- courses (electives/music/lang from the resolver + core) -----
    seen: set[int] = set()
    course_rows: list[list] = []
    for course in sorted(set(resolver.by_grade[grade].values())):
        name = resolver.name_by_no.get(course, str(course))
        course_rows.append([course, name, categorize(name), term_type(course), grade, ""])
        seen.add(course)
    for course, name, cat, tt in CORE[grade]:
        if course not in seen:
            course_rows.append([course, name, cat, tt, grade, "core (from roster)"])
            seen.add(course)

    # ----- students (IDs only) -----
    student_rows = [[s.sid, grade] for s in sorted(problem.students, key=lambda s: s.sid)]

    # ----- enrollments split music vs language (from fixed placements) -----
    music_rows, lang_rows = [], []
    cat_by_course = {row[0]: row[2] for row in course_rows}
    for sid, blocks in sorted(fixed_map.items()):
        for (course, block), qs in sorted(blocks.items(), key=lambda kv: (kv[0][1], kv[0][0])):
            sec_id = sec_by_course_block.get((course, block), "")
            row = [sid, course, sec_id, fmt_quarters(qs),
                   "language_signup" if cat_by_course.get(course) == "Language" else "music_signup",
                   "yes", ""]
            (lang_rows if cat_by_course.get(course) == "Language" else music_rows).append(row)

    # ----- write the workbook -----
    wb = cw.new_workbook()
    cw.add_readme(wb, grade, real=True)
    cw.add(wb, "courses", course_rows)
    cw.add(wb, "sections", section_rows)
    cw.add(wb, "blocks", [list(b) for b in BLOCKS[grade]])
    cw.add(wb, "students", student_rows)
    cw.add(wb, "enrollments_music", music_rows)
    cw.add(wb, "enrollments_language", lang_rows)
    cw.add(wb, "enrollments_sped", [])  # team fills
    cw.add(wb, "track_members", [])
    cw.add(wb, "track_sections", [])
    cw.add(wb, "incompatibilities", [])
    cw.add(wb, "pairings", [])
    cw.add(wb, "preferences (optional)", [])
    cw.add(wb, "rules", cw.default_rules())

    out = f"docs/canonical-data-grade{grade}-REAL.xlsx"
    wb.save(out)
    print(f"  grade {grade}: {len(course_rows)} courses, {len(section_rows)} sections, "
          f"{len(student_rows)} students, {len(music_rows)} music + {len(lang_rows)} language enrollments -> {out}")


def main():
    print("Generating real per-grade canonical workbooks from", WORKBOOK)
    for grade in (6, 7, 8):
        build_grade(grade)


if __name__ == "__main__":
    main()
