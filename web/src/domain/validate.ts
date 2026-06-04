import type { Canonical, Issue } from './types'
import { isCoreBlock, parseQuarters, slotKey } from './types'

/** Referential-integrity and data-quality checks. Errors block generation. */
export function validate(c: Canonical): Issue[] {
  const issues: Issue[] = []
  const courseIds = new Set(c.courses.map((x) => x.course_id))
  const sectionById = new Map(c.sections.map((s) => [s.section_id, s]))
  const studentIds = new Set(c.students.map((s) => s.student_id))

  // duplicate ids
  seenTwice(c.students.map((s) => s.student_id)).forEach((id) =>
    issues.push({
      severity: 'error',
      title: `Duplicate student ${id}`,
      detail: `Student ${id} is listed more than once in "students".`,
      sheet: 'students',
      fix: 'Remove the duplicate row.',
    }),
  )
  seenTwice(c.courses.map((x) => x.course_id)).forEach((id) =>
    issues.push({
      severity: 'error',
      title: `Duplicate course ${id}`,
      detail: `Course ${id} appears more than once in "courses".`,
      sheet: 'courses',
      fix: 'Remove the duplicate row.',
    }),
  )

  // sections reference real courses
  for (const s of c.sections) {
    if (!courseIds.has(s.course_id)) {
      issues.push({
        severity: 'error',
        title: `Section "${s.section_id}" points at unknown course ${s.course_id}`,
        detail: `No course with id ${s.course_id} exists in "courses".`,
        sheet: 'sections',
        fix: `Add course ${s.course_id} to "courses", or fix the course_id.`,
      })
    }
    if (parseQuarters(s.runs_quarters).length === 0) {
      issues.push({
        severity: 'error',
        title: `Section "${s.section_id}" has no valid quarters`,
        detail: `Couldn't read runs_quarters "${s.runs_quarters}".`,
        sheet: 'sections',
        fix: 'Use a form like Q1-Q4, Q1-Q2, Q1,Q3, or Q1.',
      })
    }
    if (s.capacity_max == null) {
      issues.push({
        severity: 'warning',
        title: `Section "${s.section_id}" has no capacity_max`,
        detail: 'Without a hard cap, the default of 33 is assumed.',
        sheet: 'sections',
        fix: 'Set capacity_max (the most students allowed).',
      })
    }
  }

  // at least one elective (non-core) block for the grade
  const electiveBlocks = c.blocks.filter((b) => b.grade === c.grade && !isCoreBlock(b.block_label))
  if (electiveBlocks.length === 0) {
    issues.push({
      severity: 'error',
      title: `No elective blocks defined for grade ${c.grade}`,
      detail: 'The "blocks" sheet needs at least one non-core block (e.g. A/B or 3rd/4th).',
      sheet: 'blocks',
      fix: 'Add the elective period(s) for this grade.',
    })
  }

  // enrollments: real students/courses/sections, and a section that matches the course
  for (const e of c.enrollments) {
    if (!studentIds.has(e.student_id)) {
      issues.push({
        severity: 'error',
        title: `Enrollment for unknown student ${e.student_id}`,
        detail: `Student ${e.student_id} isn't in "students".`,
        fix: 'Add the student, or fix the student_id.',
      })
    }
    if (!courseIds.has(e.course_id)) {
      issues.push({
        severity: 'error',
        title: `Enrollment references unknown course ${e.course_id}`,
        detail: `Course ${e.course_id} isn't in "courses".`,
        fix: 'Add the course, or fix the course_id.',
      })
    }
    if (e.section_id) {
      const sec = sectionById.get(e.section_id)
      if (!sec) {
        issues.push({
          severity: 'error',
          title: `Enrollment references unknown section "${e.section_id}"`,
          detail: `No section "${e.section_id}" exists in "sections".`,
          fix: 'Add the section, or fix the section_id.',
        })
      } else if (sec.course_id !== e.course_id) {
        issues.push({
          severity: 'warning',
          title: `Enrollment course/section mismatch for student ${e.student_id}`,
          detail: `Section "${e.section_id}" teaches course ${sec.course_id}, but the enrollment says ${e.course_id}.`,
          fix: 'Make the course_id and section_id agree.',
        })
      }
    }
  }

  // same student, two different courses in one (block, quarter)
  const byStudentSlot = new Map<string, number>()
  for (const e of c.enrollments) {
    const sec = sectionById.get(e.section_id)
    if (!sec) continue
    for (const q of parseQuarters(e.term)) {
      const key = `${e.student_id}::${slotKey(sec.block, q)}`
      const prev = byStudentSlot.get(key)
      if (prev != null && prev !== e.course_id) {
        issues.push({
          severity: 'error',
          title: `Student ${e.student_id} is double-booked in ${sec.block} Q${q}`,
          detail: `Enrolled in both course ${prev} and ${e.course_id} at the same time.`,
          fix: 'Remove one of the conflicting enrollments.',
        })
      }
      byStudentSlot.set(key, e.course_id)
    }
  }

  // relationship sheets reference real students
  const checkPair = (sheet: string, a: number, b: number) => {
    for (const id of [a, b]) {
      if (!studentIds.has(id)) {
        issues.push({
          severity: 'warning',
          title: `"${sheet}" references unknown student ${id}`,
          detail: `Student ${id} isn't in "students".`,
          sheet,
          fix: 'Fix the student id, or add the student.',
        })
      }
    }
    if (a === b) {
      issues.push({
        severity: 'warning',
        title: `"${sheet}" pairs a student with themselves (${a})`,
        detail: 'student_id_a and student_id_b are the same.',
        sheet,
      })
    }
  }
  c.incompatibilities.forEach((p) => checkPair('incompatibilities', p.a, p.b))
  c.pairings.forEach((p) => checkPair('pairings', p.a, p.b))

  return issues
}

function seenTwice(values: number[]): number[] {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].filter(([, n]) => n > 1).map(([v]) => v)
}
