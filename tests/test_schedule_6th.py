"""End-to-end checks for 6th-grade scheduling against the real workbook."""

from pathlib import Path

import pytest

from cjai.pipeline import run_grade

WORKBOOK = Path(__file__).resolve().parent.parent / "data" / "scheduling-26-27.xlsx"

pytestmark = pytest.mark.skipif(not WORKBOOK.exists(), reason="workbook not present")


@pytest.fixture(scope="module")
def run():
    return run_grade(str(WORKBOOK), 6)


def test_roster_categories(run):
    problem, _, anomalies, _ = run
    cats = {c: sum(1 for s in problem.students if s.category == c) for c in
            ("non_music", "music", "double_music")}
    assert cats["non_music"] == 87
    assert cats["double_music"] == 2
    assert cats["music"] == 179
    # the workbook was hand-cleaned, so a clean run reports no anomalies
    assert anomalies == []


def test_every_slot_filled(run):
    problem, result, _, _ = run
    assert result.unfilled == []
    for s in problem.students:
        assert set(s.assigned) == set(s.open_slots)


def test_no_student_repeats_a_course(run):
    problem, _, _, _ = run
    for s in problem.students:
        courses = list(s.assigned.values())
        assert len(courses) == len(set(courses)), f"{s.sid} has a repeated elective"
        # electives must also differ from the student's fixed (music) courses
        assert not (set(courses) & set(s.fixed.values()))


def test_capacity_respected(run):
    problem, result, _, _ = run
    for s in problem.sections:
        assert result.load.get(s.key, 0) <= 33, f"{s.course_name} over hard cap"
