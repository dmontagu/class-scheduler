# ruff: noqa: E501  (long literal strings: mock data reads better unwrapped)
"""Generate an illustrative 'canonical data model' workbook for the PRD (§9.5).

ONE workbook PER GRADE. This is the GRADE-8 mock example (8th exercises the most
combinations: A/B days, semester Music Theory, year-long languages, single- and
double-music, SpEd, tracks). Mock data covers every combination the tool models.
Run: `uv run python scripts/make_example_workbook.py`
"""

from __future__ import annotations

import canonical_writer as cw

GRADE = 8
OUT = f"docs/canonical-data-model-example-grade{GRADE}.xlsx"

# source labels for the split enrollment sheets
M, L, S = "music_signup", "language_signup", "sped_override"


def build():
    wb = cw.new_workbook()
    cw.add_readme(wb, GRADE, real=False)

    cw.add(wb, "courses", [
        [3569, "Math 8", "Core-Math", "year_long", 8, "Standard 8th-grade math"],
        [6800, "Compacted Math 8", "Core-Math", "year_long", 8, "Advanced track (see track_members)"],
        [9789, "ELA/SS 8", "Core-ELA/SS", "year_long", 8, ""],
        [3655, "Science 8", "Core-Science", "year_long", 8, ""],
        [3661, "Health 8", "Core-Health", "quarter", 8, "Rotates with PE"],
        [3515, "Band 8", "Music", "year_long", 8, "B-day ensemble"],
        [3522, "Choir 8", "Music", "year_long", 8, "Meets BOTH A and B days (double-music)"],
        [3572, "Orchestra 8", "Music", "year_long", 8, "B-day ensemble"],
        [4967, "Music Theory 8", "Performing Arts", "semester", 8, "Q1/Q2 only — Q3/Q4 open for electives"],
        [3606, "World Music 8", "Performing Arts", "quarter", 8, "Stone A-day, Q3/Q4"],
        [3944, "Drama 8", "Performing Arts", "quarter", 8, ""],
        [3603, "Theatre/Drama 8", "Performing Arts", "quarter", 8, ""],
        [9800, "Digital Music 8", "Tech Ed", "quarter", 8, ""],
        [3600, "Tech Ed 8", "Tech Ed", "quarter", 8, ""],
        [3612, "Video Production 8", "Tech Ed", "quarter", 8, ""],
        [3511, "Art II 8", "Art", "quarter", 8, ""],
        [4004, "Ceramics 8", "Art", "quarter", 8, ""],
        [3806, "Ceramics II 8", "Art", "quarter", 8, ""],
        [3540, "FCS 8", "FCS", "quarter", 8, "Home Ec"],
        [3810, "FCS II 8", "FCS", "quarter", 8, ""],
        [3593, "Spanish 8", "Language", "year_long", 8, "Year-long language; pre-enrolled, not wheel"],
        [3547, "German 8", "Language", "year_long", 8, "Year-long language"],
    ])

    cw.add(wb, "sections", [
        ["SEC-3001", 4967, "Music Theory 8", "Stone", "A", "Q1-Q2", 30, 33],
        ["SEC-3002", 3606, "World Music 8", "Stone", "A", "Q3-Q4", 30, 33],
        ["SEC-3003", 9800, "Digital Music 8", "Bauer", "A", "Q1", 30, 33],
        ["SEC-3004", 3511, "Art II 8", "Rivera", "A", "Q1", 30, 33],
        ["SEC-3005", 4004, "Ceramics 8", "Avery", "A", "Q1", 30, 33],
        ["SEC-3006", 3540, "FCS 8", "Carter", "A", "Q1", 30, 33],
        ["SEC-3007", 3600, "Tech Ed 8", "Brooks", "A", "Q1", 30, 33],
        ["SEC-3011", 3944, "Drama 8", "Bishop", "B", "Q1", 30, 33],
        ["SEC-3012", 3603, "Theatre/Drama 8", "Bishop", "B", "Q2", 30, 33],
        ["SEC-3013", 3612, "Video Production 8", "Brooks", "B", "Q1", 30, 33],
        ["SEC-3014", 3810, "FCS II 8", "Carter", "B", "Q1", 30, 33],
        ["SEC-3015", 3806, "Ceramics II 8", "Avery", "B", "Q1", 30, 33],
        ["SEC-BAND8", 3515, "Band 8", "Stone", "B", "Q1-Q4", 38, 40],
        ["SEC-ORCH8", 3572, "Orchestra 8", "Bauer", "B", "Q1-Q4", 37, 39],
        ["SEC-CHOIR8-A", 3522, "Choir 8", "Pruitt", "A", "Q1-Q4", 35, 37],
        ["SEC-CHOIR8-B", 3522, "Choir 8", "Pruitt", "B", "Q1-Q4", 36, 38],
        ["SEC-SPAN8-A", 3593, "Spanish 8", "Reyes", "A", "Q1-Q4", 28, 30],
        ["SEC-SPAN8-B", 3593, "Spanish 8", "Reyes", "B", "Q1-Q4", 28, 30],
        ["SEC-GER8-A", 3547, "German 8", "Rivera", "A", "Q1-Q4", 20, 24],
        ["SEC-CORE-M8-SPED", 3569, "Math 8", "Nolan", "Core-P2", "Q1-Q4", 18, 22],
        ["SEC-CM8-A", 6800, "Compacted Math 8", "Adler", "Core-P2", "Q1-Q4", 28, 30],
        ["SEC-CM8-B", 6800, "Compacted Math 8", "Owens", "Core-P5", "Q1-Q4", 28, 30],
    ])

    cw.add(wb, "blocks", [
        [8, "A", "A-day elective (alternating A/B schedule)"],
        [8, "B", "B-day elective"],
        [8, "Core", "Core academic blocks (Math/ELA-SS/Science/Health) — placed via PowerSchool"],
    ])

    # students — IDs only (no names; see PRIVACY note in READ ME)
    cw.add(wb, "students", [[80000 + i, 8] for i in range(1, 11)])

    cw.add(wb, "enrollments_music", [
        [80001, 3515, "SEC-BAND8", "Q1-Q4", M, "yes", "Single-music: Band (B-day) all year"],
        [80001, 4967, "SEC-3001", "Q1-Q2", M, "yes", "...plus SEMESTER Music Theory (A-day Q1/Q2) -> A-day Q3/Q4 open"],
        [80003, 3522, "SEC-CHOIR8-A", "Q1-Q4", M, "yes", "DOUBLE-music: Choir A-days..."],
        [80003, 3522, "SEC-CHOIR8-B", "Q1-Q4", M, "yes", "...and B-days -> 0 electives"],
        [80005, 3572, "SEC-ORCH8", "Q1-Q4", M, "yes", "Single-music: Orchestra (B-day)"],
        [80006, 3515, "SEC-BAND8", "Q1-Q4", M, "yes", "Single-music: Band (B-day)"],
        [80007, 4967, "SEC-3001", "Q1-Q2", M, "yes", "Music-Theory-only (semester, no year-long) -> needs many electives"],
    ])
    cw.add(wb, "enrollments_language", [
        [80004, 3593, "SEC-SPAN8-A", "Q1-Q4", L, "yes", "DOUBLE: year-long Spanish A-day..."],
        [80004, 3593, "SEC-SPAN8-B", "Q1-Q4", L, "yes", "...and B-day -> 0 electives"],
        [80008, 3547, "SEC-GER8-A", "Q1-Q4", L, "yes", "Single: year-long German (A-day) -> needs B-day electives"],
    ])
    cw.add(wb, "enrollments_sped", [
        [80002, 3569, "SEC-CORE-M8-SPED", "Q1-Q4", S, "yes", "SpEd: Math 8 with Ms. Nolan, Period 2 — do not move"],
        [80002, 3540, "SEC-3006", "Q1", S, "yes", "SpEd: also hand-placed into FCS (A-day Q1) by case manager"],
    ])

    cw.add(wb, "track_members", [
        ["compacted_math_8", 80009, "Advanced math placement"],
        ["compacted_math_8", 80010, ""],
    ])
    cw.add(wb, "track_sections", [
        ["compacted_math_8", "SEC-CM8-A", "Allowed section A (Adler)"],
        ["compacted_math_8", "SEC-CM8-B", "Allowed section B (Owens)"],
    ])
    cw.add(wb, "incompatibilities", [
        [80001, 80002, "yes", "Counselor — must keep apart"],
        [80005, 80006, "no", "Teacher preference — avoid if possible (soft)"],
        [80003, 80008, "yes", "Administrator — keep apart"],
    ])
    cw.add(wb, "pairings", [
        [80009, 80010, 2, 4, "no", "Buddy pairing — share at least 2 classes, not all"],
        [80001, 80003, 2, "", "yes", "IEP — must share >=2 classes (max blank -> global 'not all' rule)"],
        [80005, 80007, 2, 3, "no", "New students — keep together but preserve some variety"],
    ])
    cw.add(wb, "preferences (optional)", [
        [80007, 3944, 1, "OPTIONAL — only if student elective choice is reintroduced"],
        [80007, 4004, 2, ""],
        [80005, 3540, 1, ""],
    ])
    cw.add(wb, "rules", cw.default_rules())

    wb.save(OUT)
    print(f"Wrote {OUT} with {len(wb.sheetnames)} sheets")


if __name__ == "__main__":
    build()
