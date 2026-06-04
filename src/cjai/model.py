"""Core data model for the scheduling problem.

The whole problem reduces to: fill each student's empty elective *slots* with an
offered *section*, where a slot and a section must agree on (block, quarter, day),
no student gets the same course twice, and sections stay within capacity.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True, order=True)
class Slot:
    """A point in a student's week that needs (or already has) an elective.

    `block` is the period label for the grade (e.g. "3rd"/"4th" for 6th grade).
    `day` is None for 6th/7th and "A"/"B" for 8th grade's alternating-day model.
    """

    block: str
    quarter: int
    day: str | None = None


@dataclass(frozen=True)
class Section:
    """One offered class: a (course) taught in a specific slot, with a capacity."""

    grade: int
    slot: Slot
    course_no: int
    course_name: str
    teacher: str
    capacity: int
    # where the capacity came from in the workbook: (sheet_name, cell), e.g.
    # ("electives  section number ", "G2") — lets the report cite it as a formula
    cap_cell: tuple[str, str] | None = None

    @property
    def key(self) -> tuple:
        return (self.grade, self.slot, self.course_no, self.teacher)


@dataclass
class Student:
    sid: int
    grade: int
    category: str  # "non_music" | "music" | "double_music"
    # slots already filled (music year-longs, SPED overrides) -> course_no
    fixed: dict[Slot, int] = field(default_factory=dict)
    # slots we must fill
    open_slots: list[Slot] = field(default_factory=list)
    # produced by the solver: slot -> course_no
    assigned: dict[Slot, int] = field(default_factory=dict)

    @property
    def taken_courses(self) -> set[int]:
        """Courses the student already holds (fixed + assigned) — for no-repeat."""
        return set(self.fixed.values()) | set(self.assigned.values())


@dataclass
class GradeProblem:
    """Everything needed to schedule one grade."""

    grade: int
    sections: list[Section]
    students: list[Student]

    def sections_for(self, slot: Slot) -> list[Section]:
        return [s for s in self.sections if s.slot == slot]
