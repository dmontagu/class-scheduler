"""Build a clean per-student roster from the raw sheet rows.

Policy (per the staff): *flag* data problems, never silently consolidate them.
A student involved in an unresolved conflict is reported and left out of the
automated run so it gets a human decision rather than a guessed schedule.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from cjai.model import Slot, Student


@dataclass
class Anomaly:
    sid: int
    kind: str
    detail: str


def _by_block(placed: dict[tuple[str, int], int]) -> dict[str, dict[int, int]]:
    grouped: dict[str, dict[int, int]] = defaultdict(dict)
    for (block, quarter), course in placed.items():
        grouped[block][quarter] = course
    return grouped


def _yearlong_courses(placements: dict[int, dict[tuple[str, int], int]]) -> set[int]:
    """Courses some student holds in all 4 quarters of a block (true year-longs)."""
    yearlong: set[int] = set()
    for placed in placements.values():
        for quarters in _by_block(placed).values():
            if len(quarters) == 4 and len(set(quarters.values())) == 1:
                yearlong.add(next(iter(quarters.values())))
    return yearlong


def _fixed_slots(placed: dict[tuple[str, int], int], yearlong: set[int]) -> dict[Slot, int]:
    """Year-long courses lock the whole block; everything else only its quarters."""
    fixed: dict[Slot, int] = {}
    for block, quarters in _by_block(placed).items():
        course = next((c for c in quarters.values() if c in yearlong), None)
        if course is not None:
            for q in range(1, 5):
                fixed[Slot(block, q)] = course
        else:
            for q, c in quarters.items():
                fixed[Slot(block, q)] = c
    return fixed


def build_roster(
    grade: int,
    blocks: tuple[str, str],
    nonmusic_ids: list[int],
    music_rows: list[tuple[int, dict[tuple[str, int], int]]],
) -> tuple[list[Student], list[Anomaly]]:
    anomalies: list[Anomaly] = []

    # merge all music rows per student; detect same-(block, quarter) conflicts
    placements: dict[int, dict[tuple[str, int], int]] = defaultdict(dict)
    conflicted: set[int] = set()
    for sid, placed in music_rows:
        for (block, quarter), course in placed.items():
            prev = placements[sid].get((block, quarter))
            if prev is not None and prev != course:
                conflicted.add(sid)
                anomalies.append(
                    Anomaly(sid, "same_slot_conflict",
                            f"two courses in {block} Q{quarter}: {prev} and {course}")
                )
            placements[sid][(block, quarter)] = course
    music_sids = set(placements)

    # A course is a true year-long if some student holds it in all 4 quarters of a
    # block. Year-longs fill the whole block (self-healing data gaps); anything else
    # (e.g. semester Music Theory) fixes only the quarters actually present.
    yearlong = _yearlong_courses(placements)

    students: list[Student] = []
    for sid, placed in placements.items():
        if sid in conflicted:
            continue  # unresolved — leave for a human, don't schedule
        fixed = _fixed_slots(placed, yearlong)
        open_slots = [Slot(b, q) for q in range(1, 5) for b in blocks if Slot(b, q) not in fixed]
        category = "double_music" if not open_slots else "music"
        students.append(Student(sid=sid, grade=grade, category=category,
                                fixed=fixed, open_slots=open_slots))

    seen_nonmusic: set[int] = set()
    for sid in nonmusic_ids:
        if sid in music_sids:
            anomalies.append(
                Anomaly(sid, "in_both_rosters",
                        "appears in the non-music roster and the music roster; "
                        "non-music entry ignored")
            )
            continue
        if sid in seen_nonmusic:
            anomalies.append(
                Anomaly(sid, "duplicate_nonmusic", "listed twice in the non-music roster")
            )
            continue
        seen_nonmusic.add(sid)
        open_slots = [Slot(b, q) for q in range(1, 5) for b in blocks]
        students.append(Student(sid=sid, grade=grade, category="non_music", open_slots=open_slots))

    return students, anomalies
