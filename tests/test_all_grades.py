"""Cross-grade invariants for 6th, 7th, and 8th."""

from pathlib import Path

import pytest

from cjai.pipeline import run_grade

WORKBOOK = Path(__file__).resolve().parent.parent / "data" / "scheduling-26-27.xlsx"

pytestmark = pytest.mark.skipif(not WORKBOOK.exists(), reason="workbook not present")


@pytest.fixture(scope="module", params=[6, 7, 8])
def graded(request):
    return request.param, run_grade(str(WORKBOOK), request.param)


def test_every_open_slot_filled(graded):
    _, (problem, result, _, _) = graded
    assert result.unfilled == []
    for s in problem.students:
        assert set(s.assigned) == set(s.open_slots)


def test_no_section_over_hard_cap(graded):
    _, (problem, result, _, _) = graded
    for s in problem.sections:
        assert result.load.get(s.key, 0) <= 33, f"{s.course_name} {s.slot} over hard cap"


def test_no_student_repeats_a_course(graded):
    # every grade must end with all-distinct electives (no class taken twice)
    _, (problem, _, _, _) = graded
    for s in problem.students:
        courses = list(s.assigned.values())
        assert len(courses) == len(set(courses)), f"{s.sid} has a repeated elective"
        assert not (set(courses) & set(s.fixed.values()))


def test_8th_year_long_vs_elective_split():
    problem, _, anomalies, _ = run_grade(str(WORKBOOK), 8)
    elective_courses = {s.course_no for s in problem.sections}
    # year-longs (incl. languages + Music Theory) are excluded from the wheel
    for course in (3593, 3547, 4967):  # Spanish, German, Music Theory
        assert course not in elective_courses
    # World Music / Digital Music ARE elective sections
    assert 3606 in elective_courses
    assert 9800 in elective_courses
    assert any(a.kind == "year_long_not_elective" for a in anomalies)


def test_8th_music_theory_is_semester():
    # MT students keep MT as a fixed (counted) slot but get an elective in the gap
    problem, _, _, _ = run_grade(str(WORKBOOK), 8)
    mt_students = [s for s in problem.students if 4967 in s.fixed.values()]
    assert mt_students
    for s in mt_students:
        assert 4967 not in s.assigned.values()  # never auto-assigned
        assert s.open_slots  # the semester gap is an open elective slot
        assert set(s.assigned) == set(s.open_slots)  # and it gets filled
