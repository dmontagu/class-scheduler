import ExcelJS from 'exceljs'

import { buildProblem } from './solve'
import type { Canonical, Issue } from './types'

/** studentId -> slotKey -> courseId, parsed from a (possibly hand-edited) schedule. */
export type EditedAssignments = Map<number, Map<string, number>>

export interface EditedRead {
  assignments: EditedAssignments
  issues: Issue[]
}

/** Read the "By Student" sheet of a schedule the tool exported (and the user may have edited). */
export async function readEditedSchedule(
  buffer: ArrayBuffer,
  canonical: Canonical,
): Promise<EditedRead> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.getWorksheet('By Student') ?? wb.worksheets[0]
  const issues: Issue[] = []
  if (!ws) {
    issues.push({
      severity: 'error',
      title: 'No schedule sheet found',
      detail: 'Expected a "By Student" sheet (as exported by this tool).',
      fix: 'Upload a schedule that was downloaded from the Generate step.',
    })
    return { assignments: new Map(), issues }
  }

  const idByName = new Map<string, number>()
  for (const c of canonical.courses) idByName.set(c.name.trim().toLowerCase(), c.course_id)
  const idSet = new Set(canonical.courses.map((c) => c.course_id))

  const slotByCol = new Map<number, string>()
  let sidCol = 1
  ws.getRow(1).eachCell((cell, col) => {
    const h = String(cell.value ?? '').trim()
    if (/^student_id$/i.test(h)) sidCol = col
    const m = h.match(/^(.+?)\s+Q([1-4])$/)
    if (m) slotByCol.set(col, `${m[1]}|${m[2]}`)
  })

  const assignments: EditedAssignments = new Map()
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const sidVal = row.getCell(sidCol).value
    const sid = typeof sidVal === 'number' ? sidVal : Number(String(sidVal ?? ''))
    if (!Number.isFinite(sid) || sid <= 0) continue
    const m = new Map<string, number>()
    for (const [col, slot] of slotByCol) {
      const v = row.getCell(col).value
      const s = String(v ?? '').trim()
      if (!s) continue
      let id: number | undefined
      if (typeof v === 'number') id = v
      else if (idSet.has(Number(s))) id = Number(s)
      else id = idByName.get(s.toLowerCase())
      if (id == null) {
        const [b, q] = slot.split('|')
        issues.push({
          severity: 'warning',
          title: `Unrecognized class "${s}"`,
          detail: `Row ${r} (${b} Q${q}): "${s}" isn't a course in the source data.`,
          fix: 'Use a course name or number from the source workbook.',
        })
        continue
      }
      m.set(slot, id)
    }
    assignments.set(sid, m)
  }
  return { assignments, issues }
}

/** Re-check an edited schedule against the source constraints. Returns findings. */
export function auditSchedule(canonical: Canonical, edited: EditedAssignments): Issue[] {
  const problem = buildProblem(canonical)
  const name = (id: number) => problem.courseName.get(id) ?? String(id)
  const issues: Issue[] = []

  const offeringSet = new Set(
    problem.offerings.map((o) => `${o.block}|${o.quarter}|${o.course_id}`),
  )
  const caps = new Map<string, { teacher: string; target: number; max: number }>()
  for (const o of problem.offerings) {
    caps.set(`${o.block}|${o.quarter}|${o.course_id}`, {
      teacher: o.teacher,
      target: o.capTarget,
      max: o.capMax,
    })
  }

  // capacity: count students per elective section
  const load = new Map<string, number>()
  for (const slots of edited.values()) {
    for (const [slot, course] of slots) {
      const key = `${slot}|${course}`
      if (offeringSet.has(key)) load.set(key, (load.get(key) ?? 0) + 1)
    }
  }
  for (const [key, n] of load) {
    const cap = caps.get(key)!
    const [block, q, course] = key.split('|')
    if (n > cap.max) {
      issues.push({
        severity: 'error',
        title: `Over hard cap: ${name(Number(course))} (${block} Q${q})`,
        detail: `${n} students — ${n - cap.max} over the cap of ${cap.max}.`,
        fix: 'Move students out, raise capacity_max, or add a section.',
      })
    } else if (n > cap.target) {
      issues.push({
        severity: 'warning',
        title: `Over target: ${name(Number(course))} (${block} Q${q})`,
        detail: `${n} students — ${n - cap.target} over the target of ${cap.target} (cap ${cap.max}).`,
        fix: 'Acceptable up to the cap; rebalance if you prefer.',
      })
    }
  }

  // per-student: locked classes preserved, distinctness, valid placement
  for (const st of problem.students) {
    const ed = edited.get(st.id)
    if (!ed) continue
    for (const [slot, course] of st.fixed) {
      const e = ed.get(slot)
      const [block, q] = slot.split('|')
      if (e != null && e !== course) {
        issues.push({
          severity: 'error',
          title: `Locked class changed for student ${st.id}`,
          detail: `${block} Q${q} should stay ${name(course)} (pre-placed) but is now ${name(e)}.`,
          fix: 'Restore the year-long / SpEd placement.',
        })
      }
    }
    // Distinctness applies to ELECTIVES only: each must differ from the others and
    // from the student's year-long courses. A year-long legitimately spans quarters,
    // so its cells (where edited == fixed) are skipped, not counted as repeats.
    const seen = new Set<number>(st.fixed.values())
    for (const [slot, course] of ed) {
      if (st.fixed.get(slot) === course) continue // a pre-placed (year-long/SpEd) cell
      if (seen.has(course)) {
        issues.push({
          severity: 'warning',
          title: `Repeated class for student ${st.id}`,
          detail: `${name(course)} is assigned more than once (or duplicates a year-long).`,
          fix: 'Give a different elective in one of the slots.',
        })
      } else {
        seen.add(course)
      }
      if (!offeringSet.has(`${slot}|${course}`)) {
        const [block, q] = slot.split('|')
        issues.push({
          severity: 'warning',
          title: `Class not offered in this slot (student ${st.id})`,
          detail: `${name(course)} isn't offered in ${block} Q${q}.`,
          fix: 'Pick a class that runs in that block/quarter, or add the section.',
        })
      }
    }
  }

  // incompatibilities: a keep-apart pair sharing a class
  for (const p of canonical.incompatibilities) {
    const a = edited.get(p.a)
    const b = edited.get(p.b)
    if (!a || !b) continue
    for (const [slot, ca] of a) {
      if (b.get(slot) === ca) {
        const [block, q] = slot.split('|')
        issues.push({
          severity: p.hard ? 'error' : 'warning',
          title: `${p.hard ? 'Conflict' : 'Soft conflict'}: students ${p.a} & ${p.b} share a class`,
          detail: `Both are in ${name(ca)} (${block} Q${q})${p.reason ? ` — ${p.reason}` : ''}.`,
          fix: 'Move one of them to a different section.',
        })
      }
    }
  }

  // pairings: keep-together min/max
  for (const p of canonical.pairings) {
    const a = edited.get(p.a)
    const b = edited.get(p.b)
    if (!a || !b) continue
    let shared = 0
    for (const [slot, ca] of a) if (b.get(slot) === ca) shared++
    if (p.min_together != null && shared < p.min_together) {
      issues.push({
        severity: p.hard ? 'error' : 'warning',
        title: `Pairing ${p.a} & ${p.b}: only ${shared} class together`,
        detail: `They should share at least ${p.min_together}${p.reason ? ` — ${p.reason}` : ''}.`,
        fix: 'Put them in more of the same sections.',
      })
    }
    if (p.max_together != null && shared > p.max_together) {
      issues.push({
        severity: 'warning',
        title: `Pairing ${p.a} & ${p.b}: ${shared} classes together`,
        detail: `That's over their max of ${p.max_together} — they shouldn't share too many.`,
        fix: 'Move one of them out of a shared section.',
      })
    }
  }

  return issues
}
