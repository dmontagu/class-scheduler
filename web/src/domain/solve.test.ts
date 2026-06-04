import { describe, expect, it } from 'vitest'

import { buildProblem, solve } from './solve'
import type { Canonical, Course, Section } from './types'

function course(id: number, name: string, category: string): Course {
  return { course_id: id, name, category, term_type: 'quarter', grade: 6 }
}

function section(
  id: string,
  courseId: number,
  name: string,
  teacher: string,
  block: string,
  q: string,
): Section {
  return {
    section_id: id,
    course_id: courseId,
    course_name: name,
    teacher,
    block,
    runs_quarters: q,
    capacity_target: 30,
    capacity_max: 33,
  }
}

function makeCanonical(): Canonical {
  // 10 quarter electives offered in both 3rd and 4th period, all quarters
  // (>8 so a non-music student's 8 slots can all be distinct)
  const names = [
    [101, 'Art', 'Art'],
    [102, 'Tech', 'Tech Ed'],
    [103, 'Drama', 'Performing Arts'],
    [104, 'FCS', 'FCS'],
    [105, 'Ceramics', 'Art'],
    [106, 'Spanish', 'Language'],
    [107, 'German', 'Language'],
    [108, 'Video', 'Tech Ed'],
    [109, 'Global', 'Global'],
    [110, 'Theatre', 'Performing Arts'],
  ] as const
  const courses: Course[] = [
    ...names.map(([id, n, cat]) => course(id, n, cat)),
    { course_id: 900, name: 'Band', category: 'Music', term_type: 'year_long', grade: 6 },
  ]
  const sections: Section[] = []
  for (const block of ['3rd', '4th']) {
    for (const [id, n] of names)
      sections.push(section(`S-${block}-${id}`, id, n, n, block, 'Q1-Q4'))
  }
  sections.push(section('S-BAND', 900, 'Band', 'Stone', '3rd', 'Q1-Q4'))

  const students = Array.from({ length: 20 }, (_, i) => ({ student_id: 1000 + i, grade: 6 }))
  // first 5 are band kids (3rd period fixed) -> need 4th-period electives only
  const enrollments = students.slice(0, 5).map((s) => ({
    student_id: s.student_id,
    course_id: 900,
    section_id: 'S-BAND',
    term: 'Q1-Q4',
    source: 'music',
    locked: 'yes',
  }))

  return {
    grade: 6,
    courses,
    sections,
    blocks: [
      { grade: 6, block_label: '3rd', description: '' },
      { grade: 6, block_label: '4th', description: '' },
      { grade: 6, block_label: 'Core', description: '' },
    ],
    students,
    enrollments,
    incompatibilities: [],
    pairings: [],
  }
}

describe('solve', () => {
  const problem = buildProblem(makeCanonical())
  const result = solve(problem)

  it('excludes enrolled (year-long) courses from the wheel', () => {
    expect(problem.offerings.some((o) => o.course_id === 900)).toBe(false)
  })

  it('gives band kids 4 open slots, others 8', () => {
    const band = problem.students.find((s) => s.id === 1000)!
    const other = problem.students.find((s) => s.id === 1010)!
    expect(band.open.length).toBe(4)
    expect(other.open.length).toBe(8)
  })

  it('fills every open slot', () => {
    expect(result.unfilled).toEqual([])
    for (const st of problem.students) {
      expect(result.assigned.get(st.id)!.size).toBe(st.open.length)
    }
  })

  it('never repeats a course for a student', () => {
    expect(result.repeats).toEqual([])
    for (const st of problem.students) {
      const courses = [...result.assigned.get(st.id)!.values()]
      expect(new Set(courses).size).toBe(courses.length)
    }
  })

  it('respects the hard cap', () => {
    for (const count of result.load.values()) expect(count).toBeLessThanOrEqual(33)
  })
})
