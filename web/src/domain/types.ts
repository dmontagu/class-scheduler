// Canonical scheduling data model (mirrors the tidy-table workbook, PRD §9.5).

export type TermType = 'year_long' | 'semester' | 'quarter'

export interface Course {
  course_id: number
  name: string
  category: string
  term_type: TermType | ''
  grade: number
}

export interface Section {
  section_id: string
  course_id: number
  course_name: string
  teacher: string
  block: string
  runs_quarters: string
  capacity_target: number | null
  capacity_max: number | null
}

export interface BlockRow {
  grade: number
  block_label: string
  description: string
}

export interface StudentRow {
  student_id: number
  grade: number
}

export interface Enrollment {
  student_id: number
  course_id: number
  section_id: string
  term: string
  source: string
  locked: string
}

export interface Pair {
  a: number
  b: number
  hard: boolean
  reason: string
}

export interface Pairing extends Pair {
  min_together: number | null
  max_together: number | null
}

/** Everything parsed from one grade's workbook. */
export interface Canonical {
  grade: number
  courses: Course[]
  sections: Section[]
  blocks: BlockRow[]
  students: StudentRow[]
  enrollments: Enrollment[] // music + language + sped, merged
  incompatibilities: Pair[]
  pairings: Pairing[]
}

export type Severity = 'error' | 'warning'

/** A user-facing validation / data finding. Errors block generation; warnings don't. */
export interface Issue {
  severity: Severity
  title: string
  detail: string
  sheet?: string
  row?: number
  fix?: string
}

export const QUARTERS = [1, 2, 3, 4] as const

/** Parse term strings like "Q1-Q4", "Q1-Q2", "Q1,Q3", "Q1" into quarter numbers. */
export function parseQuarters(value: string | number | null | undefined): number[] {
  if (value == null) return []
  const str = String(value).toUpperCase().replace(/\s+/g, '')
  const out = new Set<number>()
  for (const part of str.split(',')) {
    const range = part.match(/^Q?(\d)-Q?(\d)$/)
    if (range) {
      for (let q = Number(range[1]); q <= Number(range[2]); q++) out.add(q)
      continue
    }
    const single = part.match(/^Q?(\d)$/)
    if (single) out.add(Number(single[1]))
  }
  return [...out].filter((q) => q >= 1 && q <= 4).sort((x, y) => x - y)
}

export function formatQuarters(quarters: number[]): string {
  const qs = [...quarters].sort((a, b) => a - b)
  if (qs.length === 0) return ''
  if (qs.length === 4) return 'Q1-Q4'
  if (qs.length === 2 && qs[1] === qs[0] + 1) return `Q${qs[0]}-Q${qs[1]}`
  return qs.map((q) => `Q${q}`).join(',')
}

export function isCoreBlock(label: string): boolean {
  return /core/i.test(label)
}

export function slotKey(block: string, quarter: number): string {
  return `${block}|${quarter}`
}
