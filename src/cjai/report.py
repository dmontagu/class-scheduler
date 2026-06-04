"""Write results back out: filled student sheets + a capacity tally + data issues.

The source workbook is never modified — we open it (preserving the staff's
formatting/formulas), fill the empty elective cells, append two summary sheets,
and save to a new file.
"""

from __future__ import annotations

from dataclasses import dataclass

from openpyxl import load_workbook
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

from cjai.model import GradeProblem, Slot
from cjai.pipeline import GradeConfig
from cjai.roster import Anomaly
from cjai.solve import SolveResult


def _slot_col(cfg: GradeConfig, slot: Slot, col0: int) -> int:
    """Column of a slot in a student sheet whose elective grid starts at col0.

    Slots are two-wide per quarter (block0, block1) with no gaps.
    """
    return col0 + 2 * (slot.quarter - 1) + cfg.blocks.index(slot.block)


@dataclass
class GradeRun:
    cfg: GradeConfig
    problem: GradeProblem
    result: SolveResult
    anomalies: list[Anomaly]


def _fill_student_sheets(wb, run: GradeRun) -> None:
    by_id = {s.sid: s for s in run.problem.students}
    for sheet_name, col0 in (
        (run.cfg.nonmusic_sheet, run.cfg.nonmusic_col0),
        (run.cfg.music_sheet, run.cfg.music_col0),
    ):
        ws = wb[sheet_name]
        for r in range(1, ws.max_row + 1):
            v = ws.cell(r, 1).value
            if not isinstance(v, (int, float)) or v <= 1000:
                continue
            student = by_id.get(int(v))
            if student is None:
                continue
            for slot, course_no in student.assigned.items():
                ws.cell(r, _slot_col(run.cfg, slot, col0)).value = course_no


def _sheet_ref(name: str) -> str:
    """Quote a sheet name for use in a formula (Excel doubles embedded quotes)."""
    return "'" + name.replace("'", "''") + "'"


def _count_formula(cfg: GradeConfig, slot: Slot, course_no: int) -> str:
    """Live COUNTIF of a section's enrollment, read straight from the student
    sheets, so hand-edits after generation flow through to the tally. The two
    sheets may place a slot in different columns, so each gets its own column."""
    nm_col = get_column_letter(_slot_col(cfg, slot, cfg.nonmusic_col0))
    mu_col = get_column_letter(_slot_col(cfg, slot, cfg.music_col0))
    nm, mu = _sheet_ref(cfg.nonmusic_sheet), _sheet_ref(cfg.music_sheet)
    return (
        f"=COUNTIF({nm}!{nm_col}:{nm_col},{course_no})"
        f"+COUNTIF({mu}!{mu_col}:{mu_col},{course_no})"
    )


def _write_tally(wb, runs: list[GradeRun]) -> None:
    ws = wb.create_sheet("Tally")
    bold = Font(bold=True)
    over = PatternFill("solid", fgColor="FFF2CC")  # soft yellow for 31-33
    hard = PatternFill("solid", fgColor="F4CCCC")  # red for >33
    headers = ["Grade", "Block", "Quarter", "Course", "Course #", "Teacher", "Assigned", "Capacity"]
    for c, h in enumerate(headers, 1):
        ws.cell(1, c, h).font = bold
    row = 2
    for run in runs:
        secs = sorted(
            run.problem.sections, key=lambda s: (s.slot.quarter, s.slot.block, s.course_name)
        )
        for s in secs:
            capacity = f"={_sheet_ref(s.cap_cell[0])}!{s.cap_cell[1]}" if s.cap_cell else s.capacity
            vals = [run.problem.grade, s.slot.block, s.slot.quarter, s.course_name, s.course_no,
                    s.teacher, _count_formula(run.cfg, s.slot, s.course_no), capacity]
            for c, val in enumerate(vals, 1):
                ws.cell(row, c, val)
            row += 1
    # live highlighting: yellow over target (31-33), red over hard cap (>33)
    if row > 2:
        rng = f"G2:G{row - 1}"
        ws.conditional_formatting.add(
            rng, CellIsRule(operator="greaterThan", formula=["33"], fill=hard)
        )
        ws.conditional_formatting.add(
            rng, CellIsRule(operator="between", formula=["31", "33"], fill=over)
        )
    for col, width in zip("ABCDEFGH", (6, 7, 8, 22, 9, 14, 9, 9), strict=False):
        ws.column_dimensions[col].width = width


def _write_issues(wb, runs: list[GradeRun]) -> None:
    ws = wb.create_sheet("Data Issues")
    bold = Font(bold=True)
    for c, h in enumerate(["Grade", "Student ID", "Issue", "Detail"], 1):
        ws.cell(1, c, h).font = bold
    row = 2
    for run in runs:
        for a in run.anomalies:
            for c, val in enumerate([run.problem.grade, a.sid, a.kind, a.detail], 1):
                ws.cell(row, c, val)
            row += 1
        for sid, slot in run.result.unfilled:
            for c, val in enumerate([run.problem.grade, sid, "unfilled_slot",
                                     f"{slot.block} Q{slot.quarter} (no eligible section)"], 1):
                ws.cell(row, c, val)
            row += 1
        for sid, course in run.result.repeats:
            detail = f"could not keep all electives distinct (repeated course {course})"
            for c, val in enumerate([run.problem.grade, sid, "repeated_elective", detail], 1):
                ws.cell(row, c, val)
            row += 1
    if row == 2:
        ws.cell(2, 1, "No data issues found.")
    for col, width in zip("ABCD", (6, 12, 22, 60), strict=False):
        ws.column_dimensions[col].width = width


def _ordered_electives(cfg: GradeConfig, student) -> list[int]:
    """A student's assigned electives, period-major then quarter (E1, E2, ...).

    Period-major means block0's four quarters come first (E1-E4), then block1's
    (E5-E8). For a music student with one open block this is just their 4
    quarters -> E1-E4, matching the example submission's left-packed layout.
    """
    slots = sorted(student.assigned, key=lambda sl: (cfg.blocks.index(sl.block), sl.quarter))
    return [student.assigned[sl] for sl in slots]


def _write_submission(wb, runs: list[GradeRun]) -> None:
    """A PowerSchool-style sheet: repeated (Student Numbers, En) request pairs.

    NOTE: the E-column -> term/slot mapping depends on the district's PowerSchool
    import config. We left-pack each student's electives in period-major order;
    confirm against a known past year before relying on the exact positions.
    """
    ws = wb.create_sheet("PowerSchool Submission")
    bold = Font(bold=True)

    rows = []  # list of (sid, [course_no, ...])
    max_e = 0
    for run in runs:
        for s in sorted(run.problem.students, key=lambda s: s.sid):
            electives = _ordered_electives(run.cfg, s)
            if not electives:
                continue  # double-music: no elective requests
            rows.append((s.sid, electives))
            max_e = max(max_e, len(electives))

    for e in range(max_e):
        ws.cell(1, 2 * e + 1, "Student Numbers").font = bold
        ws.cell(1, 2 * e + 2, f"E{e + 1}").font = bold

    for r, (sid, electives) in enumerate(rows, start=2):
        for e, course in enumerate(electives):
            ws.cell(r, 2 * e + 1, sid)
            ws.cell(r, 2 * e + 2, course)


def write_output(in_path: str, out_path: str, runs: list[GradeRun]) -> None:
    wb = load_workbook(in_path)  # preserve formatting/formulas
    for run in runs:
        _fill_student_sheets(wb, run)
    _write_tally(wb, runs)
    _write_issues(wb, runs)
    _write_submission(wb, runs)
    wb.save(out_path)
