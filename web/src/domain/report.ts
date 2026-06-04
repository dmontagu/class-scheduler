import ExcelJS from 'exceljs'

import type { Offering, Problem, SolveResult } from './solve'
import { orderedElectives } from './solve'
import type { Issue } from './types'
import { QUARTERS, slotKey } from './types'

const BLUE = 'FFDDE7F5'
const FIXED = 'FFEAF2E9' // soft green for pre-placed (music/language/SpEd) cells
const YELLOW = 'FFFFF2CC' // over target
const RED = 'FFF4CCCC' // over hard cap
const BAND_A = 'FFF7F9FC' // zebra shade

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function styleHeader(ws: ExcelJS.Worksheet, argb = BLUE) {
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true }
    cell.fill = fill(argb)
  })
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

// students placed in each offering (incl. empty offerings)
function studentsByOffering(problem: Problem, result: SolveResult): Map<string, number[]> {
  const offeringFor = new Map<string, Offering>()
  for (const o of problem.offerings) offeringFor.set(`${o.block}|${o.quarter}|${o.course_id}`, o)
  const map = new Map<string, number[]>()
  for (const o of problem.offerings) map.set(o.key, [])
  for (const st of problem.students) {
    for (const [key, course] of result.assigned.get(st.id)!) {
      const [block, q] = key.split('|')
      const o = offeringFor.get(`${block}|${q}|${course}`)
      if (o) map.get(o.key)!.push(st.id)
    }
  }
  return map
}

// --- sheets --------------------------------------------------------------

function byStudentSheet(wb: ExcelJS.Workbook, problem: Problem, result: SolveResult) {
  const ws = wb.addWorksheet('By Student')
  const slotCols = problem.electiveBlocks.flatMap((b) => QUARTERS.map((q) => ({ b, q })))
  ws.columns = [
    { header: 'student_id', key: 'sid', width: 12 },
    ...slotCols.map(({ b, q }) => ({ header: `${b} Q${q}`, key: slotKey(b, q), width: 16 })),
  ]
  for (const st of [...problem.students].sort((a, b) => a.id - b.id)) {
    const row = ws.addRow({ sid: st.id })
    for (const { b, q } of slotCols) {
      const key = slotKey(b, q)
      const isFixed = st.fixed.has(key)
      const courseId = st.fixed.get(key) ?? result.assigned.get(st.id)?.get(key)
      const cell = row.getCell(key)
      cell.value = courseId == null ? '' : (problem.courseName.get(courseId) ?? courseId)
      if (isFixed && courseId != null) cell.fill = fill(FIXED)
    }
  }
  styleHeader(ws)
  ws.autoFilter = { from: 'A1', to: { row: 1, column: ws.columnCount } }
}

function byClassSheet(wb: ExcelJS.Workbook, problem: Problem, result: SolveResult) {
  const ws = wb.addWorksheet('By Class')
  ws.columns = [
    { header: 'block', key: 'block', width: 7 },
    { header: 'quarter', key: 'quarter', width: 8 },
    { header: 'course', key: 'course', width: 22 },
    { header: 'teacher', key: 'teacher', width: 14 },
    { header: 'students', key: 'count', width: 9 },
    { header: 'target', key: 'target', width: 8 },
    { header: 'max', key: 'max', width: 7 },
    { header: 'roster (student ids)', key: 'roster', width: 90 },
  ]
  const rosters = studentsByOffering(problem, result)
  const rows = [...problem.offerings].sort(
    (a, b) =>
      a.quarter - b.quarter ||
      a.block.localeCompare(b.block) ||
      a.course_name.localeCompare(b.course_name),
  )
  for (const o of rows) {
    const ids = (rosters.get(o.key) ?? []).sort((x, y) => x - y)
    const row = ws.addRow({
      block: o.block,
      quarter: o.quarter,
      course: o.course_name,
      teacher: o.teacher,
      count: ids.length,
      target: o.capTarget,
      max: o.capMax,
      roster: ids.join(', '),
    })
    if (o.quarter % 2 === 0) row.eachCell((c) => (c.fill ??= fill(BAND_A)))
    const countCell = row.getCell('count')
    if (ids.length > o.capMax) countCell.fill = fill(RED)
    else if (ids.length > o.capTarget) countCell.fill = fill(YELLOW)
    countCell.font = { bold: ids.length > o.capTarget }
  }
  styleHeader(ws)
  ws.autoFilter = { from: 'A1', to: { row: 1, column: 7 } }
}

function submissionSheet(wb: ExcelJS.Workbook, problem: Problem, result: SolveResult) {
  const ws = wb.addWorksheet('PowerSchool Submission')
  const rows: { sid: number; electives: number[] }[] = []
  let maxE = 0
  for (const st of [...problem.students].sort((a, b) => a.id - b.id)) {
    const electives = orderedElectives(problem, st, result)
    if (electives.length === 0) continue
    rows.push({ sid: st.id, electives })
    maxE = Math.max(maxE, electives.length)
  }
  const header: string[] = []
  for (let e = 0; e < maxE; e++) header.push('Student Numbers', `E${e + 1}`)
  ws.addRow(header)
  for (const { sid, electives } of rows) {
    const cells: (number | string)[] = []
    electives.forEach((c) => cells.push(sid, c))
    ws.addRow(cells)
  }
  styleHeader(ws)
}

function notesSheet(wb: ExcelJS.Workbook, problem: Problem, result: SolveResult) {
  const ws = wb.addWorksheet('Notes')
  ws.columns = [
    { header: 'category', key: 'category', width: 18 },
    { header: 'where', key: 'where', width: 26 },
    { header: 'what happened', key: 'what', width: 60 },
    { header: 'suggested fix', key: 'fix', width: 52 },
  ]
  const rosters = studentsByOffering(problem, result)
  const name = (id: number) => problem.courseName.get(id) ?? String(id)
  let any = false

  // over-capacity sections
  for (const o of problem.offerings) {
    const n = (rosters.get(o.key) ?? []).length
    if (n <= o.capTarget) continue
    any = true
    const overCap = n > o.capMax
    ws
      .addRow({
        category: overCap ? 'over hard cap' : 'over target',
        where: `${o.block} Q${o.quarter} · ${o.course_name} (${o.teacher})`,
        what: `${n} students — ${overCap ? `${n - o.capMax} over the hard cap of ${o.capMax}` : `${n - o.capTarget} over the target of ${o.capTarget} (cap ${o.capMax})`}. Everyone is still placed.`,
        fix: 'Raise capacity_max, add another section for this slot, or accept the larger class.',
      })
      .getCell('category').fill = fill(overCap ? RED : YELLOW)
  }

  // repeated electives
  for (const r of result.repeats) {
    any = true
    ws
      .addRow({
        category: 'repeated class',
        where: `student ${r.student}`,
        what: `Given ${name(r.course)} more than once — not enough distinct electives were available in their open quarters.`,
        fix: 'Offer another distinct elective for this grade so every student can get variety.',
      })
      .getCell('category').fill = fill(YELLOW)
  }

  // truly unfilled (no offering at all in a slot)
  for (const u of result.unfilled) {
    any = true
    ws
      .addRow({
        category: 'no class offered',
        where: `student ${u.student} · ${u.block} Q${u.quarter}`,
        what: 'No elective is offered in this slot, so it was left blank.',
        fix: 'Add at least one section for this block/quarter in the sections sheet.',
      })
      .getCell('category').fill = fill(RED)
  }

  if (!any) {
    ws.addRow({
      category: 'all clear',
      what: 'Every slot was filled within target capacity, with all electives distinct. No compromises were needed.',
    })
  }
  styleHeader(ws)
}

export async function writeOutput(
  problem: Problem,
  result: SolveResult,
  issues: Issue[],
): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Class Scheduler'

  byStudentSheet(wb, problem, result)
  byClassSheet(wb, problem, result)
  submissionSheet(wb, problem, result)
  notesSheet(wb, problem, result)

  // Validation issues from the input (if any) for the record
  if (issues.length > 0) {
    const ws = wb.addWorksheet('Input Issues')
    ws.columns = [
      { header: 'severity', key: 'severity', width: 10 },
      { header: 'where', key: 'where', width: 22 },
      { header: 'title', key: 'title', width: 44 },
      { header: 'detail', key: 'detail', width: 60 },
      { header: 'suggested fix', key: 'fix', width: 48 },
    ]
    for (const i of issues) {
      ws.addRow({
        severity: i.severity,
        where: [i.sheet, i.row ? `row ${i.row}` : ''].filter(Boolean).join(' '),
        title: i.title,
        detail: i.detail,
        fix: i.fix ?? '',
      })
    }
    styleHeader(ws)
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
