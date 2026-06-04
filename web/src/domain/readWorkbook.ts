import ExcelJS from 'exceljs'

import type {
  BlockRow,
  Canonical,
  Course,
  Enrollment,
  Issue,
  Pair,
  Pairing,
  Section,
  StudentRow,
  TermType,
} from './types'

// --- cell coercion -------------------------------------------------------

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText
        .map((r) => r.text)
        .join('')
        .trim()
    }
    if ('text' in value && typeof value.text === 'string') return value.text.trim()
    if ('result' in value) return cellToString(value.result as ExcelJS.CellValue)
  }
  return ''
}

function cellToNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === 'number') return value
  const s = cellToString(value)
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function cellToBool(value: ExcelJS.CellValue): boolean {
  return /^(yes|true|y|1)$/i.test(cellToString(value))
}

// --- generic sheet reader ------------------------------------------------

interface RawRow {
  excelRow: number
  get: (header: string) => ExcelJS.CellValue
}

interface SheetRead {
  rows: RawRow[]
  issues: Issue[]
  present: boolean
}

function readSheet(
  wb: ExcelJS.Workbook,
  name: string,
  requiredColumns: string[],
  { required }: { required: boolean },
): SheetRead {
  const ws = wb.getWorksheet(name)
  const issues: Issue[] = []
  if (!ws) {
    if (required) {
      issues.push({
        severity: 'error',
        title: `Missing sheet "${name}"`,
        detail: `The workbook needs a sheet named "${name}".`,
        fix: `Add a "${name}" tab with columns: ${requiredColumns.join(', ')}.`,
      })
    }
    return { rows: [], issues, present: false }
  }

  const header = ws.getRow(1)
  const colByHeader = new Map<string, number>()
  header.eachCell((cell, col) => {
    const h = cellToString(cell.value)
    if (h) colByHeader.set(h, col)
  })

  for (const col of requiredColumns) {
    if (!colByHeader.has(col)) {
      issues.push({
        severity: 'error',
        title: `Sheet "${name}" is missing the "${col}" column`,
        detail: `Found columns: ${[...colByHeader.keys()].join(', ') || '(none)'}.`,
        sheet: name,
        row: 1,
        fix: `Add a "${col}" header in row 1.`,
      })
    }
  }

  const rows: RawRow[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const get = (h: string): ExcelJS.CellValue => {
      const col = colByHeader.get(h)
      return col ? row.getCell(col).value : null
    }
    // skip fully-empty rows
    const anyValue = requiredColumns.some((h) => cellToString(get(h)) !== '')
    if (anyValue) rows.push({ excelRow: r, get })
  }
  return { rows, issues, present: true }
}

// --- canonical reader ----------------------------------------------------

const TERM_TYPES = new Set<TermType>(['year_long', 'semester', 'quarter'])

export interface ReadResult {
  canonical: Canonical
  issues: Issue[]
}

export async function readCanonical(buffer: ArrayBuffer): Promise<ReadResult> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const issues: Issue[] = []

  const coursesR = readSheet(
    wb,
    'courses',
    ['course_id', 'name', 'category', 'term_type', 'grade'],
    {
      required: true,
    },
  )
  const sectionsR = readSheet(
    wb,
    'sections',
    [
      'section_id',
      'course_id',
      'teacher',
      'block',
      'runs_quarters',
      'capacity_target',
      'capacity_max',
    ],
    { required: true },
  )
  const blocksR = readSheet(wb, 'blocks', ['grade', 'block_label', 'description'], {
    required: true,
  })
  const studentsR = readSheet(wb, 'students', ['student_id', 'grade'], { required: true })
  issues.push(...coursesR.issues, ...sectionsR.issues, ...blocksR.issues, ...studentsR.issues)

  const courses: Course[] = coursesR.rows.map((row) => {
    const tt = cellToString(row.get('term_type')) as TermType
    if (tt && !TERM_TYPES.has(tt)) {
      issues.push({
        severity: 'warning',
        title: `Unknown term_type "${tt}"`,
        detail: `Expected year_long, semester, or quarter.`,
        sheet: 'courses',
        row: row.excelRow,
        fix: 'Pick one of: year_long, semester, quarter.',
      })
    }
    return {
      course_id: cellToNumber(row.get('course_id')) ?? 0,
      name: cellToString(row.get('name')),
      category: cellToString(row.get('category')),
      term_type: TERM_TYPES.has(tt) ? tt : '',
      grade: cellToNumber(row.get('grade')) ?? 0,
    }
  })

  const sections: Section[] = sectionsR.rows.map((row) => ({
    section_id: cellToString(row.get('section_id')),
    course_id: cellToNumber(row.get('course_id')) ?? 0,
    course_name: cellToString(row.get('course_name')),
    teacher: cellToString(row.get('teacher')),
    block: cellToString(row.get('block')),
    runs_quarters: cellToString(row.get('runs_quarters')),
    capacity_target: cellToNumber(row.get('capacity_target')),
    capacity_max: cellToNumber(row.get('capacity_max')),
  }))

  const blocks: BlockRow[] = blocksR.rows.map((row) => ({
    grade: cellToNumber(row.get('grade')) ?? 0,
    block_label: cellToString(row.get('block_label')),
    description: cellToString(row.get('description')),
  }))

  const students: StudentRow[] = studentsR.rows.map((row) => ({
    student_id: cellToNumber(row.get('student_id')) ?? 0,
    grade: cellToNumber(row.get('grade')) ?? 0,
  }))

  const enrollments: Enrollment[] = []
  for (const name of ['enrollments_music', 'enrollments_language', 'enrollments_sped']) {
    const r = readSheet(wb, name, ['student_id', 'course_id', 'section_id', 'term'], {
      required: false,
    })
    issues.push(...r.issues)
    for (const row of r.rows) {
      enrollments.push({
        student_id: cellToNumber(row.get('student_id')) ?? 0,
        course_id: cellToNumber(row.get('course_id')) ?? 0,
        section_id: cellToString(row.get('section_id')),
        term: cellToString(row.get('term')),
        source: cellToString(row.get('source')) || name.replace('enrollments_', ''),
        locked: cellToString(row.get('locked')),
      })
    }
  }

  const incompatibilities: Pair[] = []
  const incR = readSheet(wb, 'incompatibilities', ['student_id_a', 'student_id_b'], {
    required: false,
  })
  issues.push(...incR.issues)
  for (const row of incR.rows) {
    incompatibilities.push({
      a: cellToNumber(row.get('student_id_a')) ?? 0,
      b: cellToNumber(row.get('student_id_b')) ?? 0,
      hard: cellToBool(row.get('hard')),
      reason: cellToString(row.get('reason')),
    })
  }

  const pairings: Pairing[] = []
  const pairR = readSheet(wb, 'pairings', ['student_id_a', 'student_id_b'], { required: false })
  issues.push(...pairR.issues)
  for (const row of pairR.rows) {
    pairings.push({
      a: cellToNumber(row.get('student_id_a')) ?? 0,
      b: cellToNumber(row.get('student_id_b')) ?? 0,
      hard: cellToBool(row.get('hard')),
      reason: cellToString(row.get('reason')),
      min_together: cellToNumber(row.get('min_together')),
      max_together: cellToNumber(row.get('max_together')),
    })
  }

  // grade = the most common grade among students (one file per grade)
  const gradeCounts = new Map<number, number>()
  for (const s of students) gradeCounts.set(s.grade, (gradeCounts.get(s.grade) ?? 0) + 1)
  let grade = 0
  let best = -1
  for (const [g, n] of gradeCounts) {
    if (n > best) {
      best = n
      grade = g
    }
  }

  return {
    canonical: {
      grade,
      courses,
      sections,
      blocks,
      students,
      enrollments,
      incompatibilities,
      pairings,
    },
    issues,
  }
}
