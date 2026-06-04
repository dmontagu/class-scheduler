"""Assemble a GradeProblem from the workbook and run the solve.

Grade-specific layout lives in GRADES; everything else is generic so adding a
grade is just a config entry (8th's A/B-day model will extend this).
"""

from __future__ import annotations

from dataclasses import dataclass

from openpyxl import load_workbook

from cjai.model import GradeProblem
from cjai.parse import (
    CourseResolver,
    load_master_courses,
    parse_ab_grid,
    parse_music_rows,
    parse_nonmusic_ids,
    parse_period_grids,
)
from cjai.roster import Anomaly, build_roster
from cjai.solve import SolveResult, solve


@dataclass
class GradeConfig:
    grade: int
    blocks: tuple[str, str]
    nonmusic_sheet: str
    music_sheet: str
    offerings_sheet: str
    nonmusic_col0: int = 6  # first elective column in the non-music roster sheet
    music_col0: int = 6  # first elective column in the music roster sheet
    ab_grid: bool = False  # 8th uses the A/B-day offering grid instead of period grids


_OFFERINGS = "electives  section number "
_OFFERINGS_8 = "8th grade elctive schedule and "

GRADES: dict[int, GradeConfig] = {
    6: GradeConfig(6, ("3rd", "4th"), "6h grade students", "6th music ", _OFFERINGS),
    7: GradeConfig(7, ("7th", "8th"), "7th grade students", "7th music ", _OFFERINGS,
                   nonmusic_col0=6, music_col0=12),
    8: GradeConfig(8, ("A", "B"), "8th grade students ", "8th music", _OFFERINGS_8,
                   nonmusic_col0=6, music_col0=6, ab_grid=True),
}


def load_grade_problem(
    path: str, grade: int
) -> tuple[GradeProblem, list[Anomaly], CourseResolver]:
    cfg = GRADES[grade]
    wb = load_workbook(path, data_only=True)
    fallback = grade if cfg.ab_grid else None
    resolver = load_master_courses(wb[cfg.offerings_sheet], fallback_grade=fallback)
    if cfg.ab_grid:
        grid = parse_ab_grid(wb[cfg.offerings_sheet], resolver, grade)
    else:
        grid = parse_period_grids(wb[cfg.offerings_sheet], resolver)
    sections = [s for s in grid if s.grade == grade]
    nonmusic_ids = parse_nonmusic_ids(wb[cfg.nonmusic_sheet])
    music_rows = parse_music_rows(wb[cfg.music_sheet], cfg.blocks, cfg.music_col0)
    students, anomalies = build_roster(grade, cfg.blocks, nonmusic_ids, music_rows)

    # A course students are enrolled in as a year-long (it shows up as a fixed
    # assignment) is NOT a rotating elective to fill — drop it from the wheel.
    # This is what removes 8th's year-long languages; a no-op for 6th/7th.
    yearlong = {c for st in students for c in st.fixed.values()}
    dropped = sorted({s.course_no for s in sections if s.course_no in yearlong})
    sections = [s for s in sections if s.course_no not in yearlong]
    for course in dropped:
        anomalies.append(Anomaly(
            0, "year_long_not_elective",
            f"{resolver.name_by_no.get(course, course)} ({course}) is a year-long course; "
            f"excluded from the elective wheel",
        ))

    return GradeProblem(grade=grade, sections=sections, students=students), anomalies, resolver


def run_grade(
    path: str, grade: int
) -> tuple[GradeProblem, SolveResult, list[Anomaly], CourseResolver]:
    problem, anomalies, resolver = load_grade_problem(path, grade)
    result = solve(problem)
    return problem, result, anomalies, resolver
