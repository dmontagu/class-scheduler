"""Assign students to elective sections.

There is no student preference (choice was removed), so the objective is simply:
fill every open slot, keep each student's electives all-distinct, and spread
section sizes as evenly as possible under the hard cap.

Approach: process one (block, quarter) group at a time. Within a group, place the
most-constrained students first, each into the least-loaded section they're still
eligible for (course not already taken, under cap). This greedy balances sizes
toward the target and respects no-repeat; anything it can't satisfy is left
unassigned and surfaced in the report rather than forced.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field

from cjai.model import GradeProblem, Section, Slot


@dataclass
class SolveResult:
    load: dict[tuple, int]  # section.key -> assigned count
    # (sid, slot) with no eligible section:
    unfilled: list[tuple[int, Slot]] = field(default_factory=list)
    # (sid, course) assigned despite the student already holding it:
    repeats: list[tuple[int, int]] = field(default_factory=list)


def _eligible(st, sections: list[Section], load: Counter, hard_cap: int) -> list[Section]:
    return [
        s for s in sections
        if s.course_no not in st.taken_courses and load[s.key] < hard_cap
    ]


def _assign_group(
    slot: Slot,
    sections: list[Section],
    students: list,
    load: Counter,
    result: SolveResult,
    hard_cap: int,
) -> None:
    # most-constrained-first improves the chance everyone gets a distinct course
    order = sorted(students, key=lambda st: (len(_eligible(st, sections, load, hard_cap)), st.sid))
    for st in order:
        options = _eligible(st, sections, load, hard_cap)
        if not options:
            # relax cap first, then distinctness, before giving up
            options = [s for s in sections if load[s.key] < hard_cap]
            if not options:
                result.unfilled.append((st.sid, slot))
                continue
            if st.taken_courses & {s.course_no for s in options}:
                result.repeats.append((st.sid, min(s.course_no for s in options)))
        best = min(options, key=lambda s: (load[s.key], s.course_no))
        st.assigned[slot] = best.course_no
        load[best.key] += 1


def solve(problem: GradeProblem, *, hard_cap: int = 33) -> SolveResult:
    sections_by_slot: dict[Slot, list[Section]] = defaultdict(list)
    for s in problem.sections:
        sections_by_slot[s.slot].append(s)

    students_by_slot: dict[Slot, list] = defaultdict(list)
    for st in problem.students:
        for sl in st.open_slots:
            students_by_slot[sl].append(st)

    load: Counter = Counter()
    result = SolveResult(load=load)

    # process groups in a stable order: quarter, then block
    for slot in sorted(students_by_slot, key=lambda s: (s.quarter, s.block)):
        sections = sections_by_slot.get(slot, [])
        _assign_group(slot, sections, students_by_slot[slot], load, result, hard_cap)

    _repair_repeats(problem, students_by_slot, result)
    return result


def _held_courses(st, excluding_slot: Slot) -> set[int]:
    """Courses a student holds across fixed + assigned, ignoring one slot."""
    held = set(st.fixed.values())
    for slot, course in st.assigned.items():
        if slot != excluding_slot:
            held.add(course)
    return held


def _current_repeats(problem: GradeProblem) -> list[tuple[int, int]]:
    repeats: list[tuple[int, int]] = []
    for st in problem.students:
        seen: set[int] = set(st.fixed.values())
        for course in st.assigned.values():
            if course in seen:
                repeats.append((st.sid, course))
            seen.add(course)
    return repeats


def _repair_repeats(
    problem: GradeProblem, students_by_slot: dict[Slot, list], result: SolveResult
) -> None:
    """Capacity-neutral local repair: when a student holds the same course twice,
    swap one copy with another student in that slot who'd benefit (or not be hurt).

    A same-slot swap moves each student between two existing sections, so section
    loads are unchanged. Iterated (a swap can unblock another) until it stops helping."""
    for _ in range(10):
        repeaters = {sid for sid, _ in result.repeats}
        if not repeaters:
            break
        for st in problem.students:
            if st.sid not in repeaters:
                continue
            for slot in list(st.assigned):
                x = st.assigned[slot]
                if x in _held_courses(st, slot):  # x is the duplicate in this slot
                    for other in students_by_slot.get(slot, []):
                        if other is st:
                            continue
                        y = other.assigned[slot]
                        if y not in _held_courses(st, slot) and x not in _held_courses(other, slot):
                            st.assigned[slot], other.assigned[slot] = y, x
                            break
        new_repeats = _current_repeats(problem)
        if len(new_repeats) >= len(result.repeats):  # no progress
            result.repeats = new_repeats
            break
        result.repeats = new_repeats
