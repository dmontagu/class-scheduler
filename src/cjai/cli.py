"""Command-line entry point for cjai."""

from __future__ import annotations

import argparse

from cjai import __version__
from cjai.pipeline import GRADES, run_grade
from cjai.report import GradeRun, write_output


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="cjai", description="Class assignment helper")
    parser.add_argument("--version", action="version", version=f"cjai {__version__}")
    sub = parser.add_subparsers(dest="command")

    sched = sub.add_parser("schedule", help="generate elective schedules from a workbook")
    sched.add_argument("input", help="path to the scheduling workbook (.xlsx)")
    sched.add_argument("-o", "--output", default="scheduled.xlsx", help="output workbook path")
    sched.add_argument("-g", "--grades", default="6,7,8", help="comma-separated grades to run")

    args = parser.parse_args(argv)

    if args.command == "schedule":
        _schedule(args.input, args.output, [int(g) for g in args.grades.split(",")])
    else:
        parser.print_help()


def _schedule(input_path: str, output_path: str, grades: list[int]) -> None:
    runs: list[GradeRun] = []
    for grade in grades:
        if grade not in GRADES:
            print(f"  grade {grade}: not configured yet, skipping")
            continue
        problem, result, anomalies, _ = run_grade(input_path, grade)
        runs.append(GradeRun(GRADES[grade], problem, result, anomalies))
        sizes = [result.load[s.key] for s in problem.sections]
        print(
            f"  grade {grade}: {len(problem.students)} students, "
            f"{sum(len(s.open_slots) for s in problem.students)} slots filled | "
            f"section sizes {min(sizes)}–{max(sizes)} | "
            f"{len(result.unfilled)} unfilled, {len(anomalies)} data issues"
        )
    write_output(input_path, output_path, runs)
    print(f"\nWrote {output_path} (filled sheets + Tally + Data Issues)")


if __name__ == "__main__":
    main()
