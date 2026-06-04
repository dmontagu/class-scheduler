"""Parse the district's scheduling workbook into the clean model.

The workbook is a human-formatted spreadsheet, so parsing is necessarily a bit
defensive. Two things make it tractable:
  * The student roster sheets are regular (id + core + elective slots).
  * The offering grids reference classes by short name; we resolve those against
    the master course list (columns A/B) with a small alias table, and validate
    the result against the seat totals the staff already wrote into the sheet.
"""

from __future__ import annotations

import re

from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

from cjai.model import Section, Slot

# Short names used in the offering grid that don't normalize to the master name.
_ALIASES = {
    "GLOBAL": "GLOBAL AWARENESS",
    "GER": "GERMAN",
    "TD II": "THEATRE DRAMA II",
    "FCS I": "FCS",
    "COMP SCI": "COMPUTER SCIENCE",
    # 8th grade A/B grid short names
    "T/D": "THEATRE DRAMA",
    "ART 2": "ART II",
    "CERAM 1": "CERAMICS",
    "CERAM 2": "CERAMICS II",
    "MT": "MUSIC THEORY",
    "WM": "WORLD MUSIC",
    "DM": "DIGITAL MUSIC",
}

# Quarter -> (course-name column, capacity column) in the period grids.
_Q_COLS = {1: (6, 7), 2: (8, 9), 3: (11, 12), 4: (13, 14)}


def _to_int(v: object) -> int:
    """Coerce a numeric cell value to int (cells come back as float)."""
    assert isinstance(v, (int, float)), f"expected a number, got {v!r}"
    return int(v)


def _norm(name: str) -> str:
    """Normalize a course name: upper, drop the grade digit, collapse spaces."""
    s = str(name).upper().strip()
    s = re.sub(r"\b[678]\b", "", s)  # strip standalone grade numbers
    s = re.sub(r"\s+", " ", s).strip()
    return s


class CourseResolver:
    """Maps a grade's short grid names to course numbers via the master list."""

    def __init__(self) -> None:
        self.by_grade: dict[int, dict[str, int]] = {6: {}, 7: {}, 8: {}}
        self.name_by_no: dict[int, str] = {}

    def add_master(self, grade: int, name: str, course_no: int) -> None:
        self.by_grade[grade][_norm(name)] = course_no
        self.name_by_no[course_no] = str(name).strip()

    def resolve(self, grade: int, grid_name: str) -> int:
        table = self.by_grade[grade]
        key = _norm(grid_name)
        # try the raw normalized name and its alias, exact then prefix match
        candidates = [key]
        if key in _ALIASES:
            candidates.append(_norm(_ALIASES[key]))
        for cand in candidates:
            if cand in table:
                return table[cand]
        for cand in candidates:
            # prefix match either direction ("THEATRE DRAMA II" vs "THEATRE DRAMA")
            for master_key, no in table.items():
                if master_key.startswith(cand) or cand.startswith(master_key):
                    return no
        raise KeyError(f"grade {grade}: cannot resolve course name {grid_name!r} (norm={key!r})")


def load_master_courses(ws: Worksheet, fallback_grade: int | None = None) -> CourseResolver:
    """Read the COURSE / COURSE# columns (A/B).

    Grade is inferred from the name's grade digit; names without one (e.g.
    "MUSIC THEORY", "WORLD MUSIC" on the 8th sheet) fall back to `fallback_grade`.
    """
    resolver = CourseResolver()
    for r in range(1, ws.max_row + 1):
        name = ws.cell(r, 1).value
        no = ws.cell(r, 2).value
        if not isinstance(name, str) or not isinstance(no, (int, float)):
            continue
        m = re.search(r"\b([678])\b", name)
        grade = int(m.group(1)) if m else fallback_grade
        if grade is None:
            continue
        resolver.add_master(grade, name, int(no))
    return resolver


def parse_period_grids(ws: Worksheet, resolver: CourseResolver) -> list[Section]:
    """Parse the 6th/7th '3rd/4th/7th/8th Period' teacher grids into Sections."""
    block_grade = {"3rd": 6, "4th": 6, "7th": 7, "8th": 7}
    sections: list[Section] = []
    for r in range(1, ws.max_row + 1):
        header = ws.cell(r, 5).value  # column E
        if not isinstance(header, str) or "Period" not in header:
            continue
        block = header.split("Period")[0].strip()
        grade = block_grade[block]
        # teacher rows follow until the totals row (column E goes blank)
        rr = r + 1
        while rr <= ws.max_row:
            teacher = ws.cell(rr, 5).value
            first_course = ws.cell(rr, 6).value
            if teacher is None:
                break  # totals / blank row ends the block
            if isinstance(first_course, (int, float)) or first_course is None:
                rr += 1  # music capacity row (e.g. "<teacher> (Band)  32") — skip
                continue
            for q, (cc, capc) in _Q_COLS.items():
                cname = ws.cell(rr, cc).value
                cap = ws.cell(rr, capc).value
                if cname is None or cap is None:
                    continue
                course_no = resolver.resolve(grade, str(cname))
                cap_coord = f"{get_column_letter(capc)}{rr}"
                sections.append(
                    Section(
                        grade=grade,
                        slot=Slot(block=block, quarter=q, day=None),
                        course_no=course_no,
                        course_name=resolver.name_by_no[course_no],
                        teacher=str(teacher).strip(),
                        capacity=_to_int(cap),
                        cap_cell=(ws.title, cap_coord),
                    )
                )
            rr += 1
    return sections


def parse_ab_grid(ws: Worksheet, resolver: CourseResolver, grade: int = 8) -> list[Section]:
    """Parse the 8th-grade A/B-day offering grid.

    Each teacher row offers, per quarter, an A-day class and a B-day class, laid
    out as [A-course, capA, capB, B-course] repeating every 4 columns starting at
    column E. We emit a separate Section per day for every teacher row, including
    the music-teacher rows (which contribute World Music / Digital Music as A-day
    electives). Year-long courses (Band/Choir/Orchestra/languages/Music Theory)
    are filtered out downstream by the pipeline's year-long rule.
    """
    header = None
    for r in range(1, ws.max_row + 1):
        d = ws.cell(r, 4).value
        if isinstance(d, str) and "A/B" in d:
            header = r
            break
    if header is None:
        return []
    sections: list[Section] = []
    for rr in range(header + 1, ws.max_row + 1):
        teacher = ws.cell(rr, 4).value
        if not isinstance(teacher, str) or not isinstance(ws.cell(rr, 5).value, str):
            continue  # master-list / totals / header rows — skip, keep scanning
        for q in range(1, 5):
            base = 4 * (q - 1)
            entries = [
                ("A", ws.cell(rr, 5 + base).value, ws.cell(rr, 6 + base).value, 6 + base),
                ("B", ws.cell(rr, 8 + base).value, ws.cell(rr, 7 + base).value, 7 + base),
            ]
            for block, name, cap, cap_col in entries:
                if not isinstance(name, str) or not isinstance(cap, (int, float)):
                    continue
                course_no = resolver.resolve(grade, name)
                sections.append(
                    Section(
                        grade=grade,
                        slot=Slot(block=block, quarter=q, day=None),
                        course_no=course_no,
                        course_name=resolver.name_by_no[course_no],
                        teacher=teacher.strip(),
                        capacity=_to_int(cap),
                        cap_cell=(ws.title, f"{get_column_letter(cap_col)}{rr}"),
                    )
                )
    return sections


# --- student rosters -------------------------------------------------------


def _is_id(v) -> bool:
    return isinstance(v, (int, float)) and v > 1000


def parse_nonmusic_ids(ws: Worksheet) -> list[int]:
    """Just the student IDs from a non-music roster sheet (id in column A)."""
    return [
        _to_int(ws.cell(r, 1).value)
        for r in range(1, ws.max_row + 1)
        if _is_id(ws.cell(r, 1).value)
    ]


def elective_qcols(col0: int) -> dict[int, tuple[int, int]]:
    """Quarter -> (block0 col, block1 col), given the first elective column.

    Slots are laid out two-wide per quarter (block0, block1) with no gaps, so
    quarter q lives at col0 + 2*(q-1) and the next column.
    """
    return {q: (col0 + 2 * (q - 1), col0 + 2 * (q - 1) + 1) for q in range(1, 5)}


def parse_music_rows(
    ws: Worksheet, blocks: tuple[str, str], col0: int = 6
) -> list[tuple[int, dict[tuple[str, int], int]]]:
    """Raw music rows as (student_id, {(block, quarter): music_course_no}).

    Per-(block, quarter) so a course filling only some quarters (e.g. 8th-grade
    semester Music Theory) leaves the others open. `col0` is the sheet's first
    elective column (6th uses F=6; 7th music uses L=12).
    """
    qcols = elective_qcols(col0)
    rows: list[tuple[int, dict[tuple[str, int], int]]] = []
    for r in range(1, ws.max_row + 1):
        sid = ws.cell(r, 1).value
        if not _is_id(sid):
            continue
        placement: dict[tuple[str, int], int] = {}
        for q in range(1, 5):
            for bi, block in enumerate(blocks):
                v = ws.cell(r, qcols[q][bi]).value
                if isinstance(v, (int, float)):
                    placement[(block, q)] = _to_int(v)
        if placement:
            rows.append((_to_int(sid), placement))
    return rows
