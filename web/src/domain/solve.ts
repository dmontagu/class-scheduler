import type { Canonical } from './types'
import { QUARTERS, isCoreBlock, parseQuarters, slotKey } from './types'

const DEFAULT_TARGET = 30
const DEFAULT_MAX = 33

export interface Offering {
  key: string
  section_id: string
  course_id: number
  course_name: string
  teacher: string
  block: string
  quarter: number
  capTarget: number
  capMax: number
}

export interface OpenSlot {
  block: string
  quarter: number
  key: string
}

export interface ProblemStudent {
  id: number
  fixed: Map<string, number> // slotKey -> courseId (music/language/sped)
  open: OpenSlot[]
}

export interface Problem {
  grade: number
  electiveBlocks: string[]
  offerings: Offering[]
  students: ProblemStudent[]
  courseName: Map<number, string>
}

export function buildProblem(c: Canonical): Problem {
  const courseName = new Map<number, string>(c.courses.map((x) => [x.course_id, x.name]))
  const sectionById = new Map(c.sections.map((s) => [s.section_id, s]))
  const electiveBlocks = c.blocks
    .filter((b) => b.grade === c.grade && !isCoreBlock(b.block_label))
    .map((b) => b.block_label)

  // A course that appears in any enrollment is pre-placed (year-long/semester/SpEd)
  // and is NOT part of the rotating elective wheel.
  const enrolledCourses = new Set(c.enrollments.map((e) => e.course_id))

  const offerings: Offering[] = []
  for (const s of c.sections) {
    if (!electiveBlocks.includes(s.block)) continue
    if (enrolledCourses.has(s.course_id)) continue
    for (const q of parseQuarters(s.runs_quarters)) {
      offerings.push({
        key: `${s.section_id}|${q}`,
        section_id: s.section_id,
        course_id: s.course_id,
        course_name: s.course_name || courseName.get(s.course_id) || String(s.course_id),
        teacher: s.teacher,
        block: s.block,
        quarter: q,
        capTarget: s.capacity_target ?? DEFAULT_TARGET,
        capMax: s.capacity_max ?? DEFAULT_MAX,
      })
    }
  }

  // fixed placements per student (only those that sit in an elective block)
  const fixedByStudent = new Map<number, Map<string, number>>()
  for (const e of c.enrollments) {
    const sec = sectionById.get(e.section_id)
    if (!sec || !electiveBlocks.includes(sec.block)) continue
    const m = fixedByStudent.get(e.student_id) ?? new Map<string, number>()
    for (const q of parseQuarters(e.term)) m.set(slotKey(sec.block, q), e.course_id)
    fixedByStudent.set(e.student_id, m)
  }

  const students: ProblemStudent[] = c.students.map((s) => {
    const fixed = fixedByStudent.get(s.student_id) ?? new Map<string, number>()
    const open: OpenSlot[] = []
    for (const q of QUARTERS) {
      for (const block of electiveBlocks) {
        const key = slotKey(block, q)
        if (!fixed.has(key)) open.push({ block, quarter: q, key })
      }
    }
    return { id: s.student_id, fixed, open }
  })

  return { grade: c.grade, electiveBlocks, offerings, students, courseName }
}

// --- solver --------------------------------------------------------------

export interface Unfilled {
  student: number
  block: string
  quarter: number
}

export interface SolveResult {
  /** studentId -> slotKey -> courseId */
  assigned: Map<number, Map<string, number>>
  load: Map<string, number> // offering.key -> count
  unfilled: Unfilled[]
  repeats: { student: number; course: number }[]
}

function takenCourses(st: ProblemStudent, assigned: Map<string, number>): Set<number> {
  const taken = new Set<number>(st.fixed.values())
  for (const c of assigned.values()) taken.add(c)
  return taken
}

export function solve(problem: Problem): SolveResult {
  const offeringsBySlot = new Map<string, Offering[]>()
  for (const o of problem.offerings) {
    const k = slotKey(o.block, o.quarter)
    const list = offeringsBySlot.get(k) ?? []
    list.push(o)
    offeringsBySlot.set(k, list)
  }

  const studentsBySlot = new Map<string, ProblemStudent[]>()
  for (const st of problem.students) {
    for (const o of st.open) {
      const list = studentsBySlot.get(o.key) ?? []
      list.push(st)
      studentsBySlot.set(o.key, list)
    }
  }

  const assigned = new Map<number, Map<string, number>>()
  for (const st of problem.students) assigned.set(st.id, new Map())
  const load = new Map<string, number>()
  const result: SolveResult = { assigned, load, unfilled: [], repeats: [] }

  const eligible = (st: ProblemStudent, secs: Offering[]): Offering[] => {
    const taken = takenCourses(st, assigned.get(st.id)!)
    return secs.filter((o) => !taken.has(o.course_id) && (load.get(o.key) ?? 0) < o.capMax)
  }

  // process slot groups in a stable order: quarter, then block
  const slots = [...studentsBySlot.keys()].sort((a, b) => {
    const [ba, qa] = a.split('|')
    const [bb, qb] = b.split('|')
    return Number(qa) - Number(qb) || ba.localeCompare(bb)
  })

  for (const slot of slots) {
    const secs = offeringsBySlot.get(slot) ?? []
    const studs = studentsBySlot.get(slot)!
    const order = [...studs].sort(
      (a, b) => eligible(a, secs).length - eligible(b, secs).length || a.id - b.id,
    )
    const [block, quarter] = slot.split('|')
    for (const st of order) {
      const taken = takenCourses(st, assigned.get(st.id)!)
      // Fill EVERY slot, degrading gracefully so output is never short-staffed:
      //   1. distinct course + under cap   (ideal)
      //   2. distinct course, over cap     (section overflows — flagged)
      //   3. repeat a course (last resort) (no distinct option exists)
      let pool = eligible(st, secs)
      if (pool.length === 0) pool = secs.filter((o) => !taken.has(o.course_id))
      if (pool.length === 0) pool = secs
      if (pool.length === 0) {
        // truly nothing offered in this slot
        result.unfilled.push({ student: st.id, block, quarter: Number(quarter) })
        continue
      }
      const best = pool.reduce((a, b) => {
        const la = load.get(a.key) ?? 0
        const lb = load.get(b.key) ?? 0
        return lb < la || (lb === la && b.course_id < a.course_id) ? b : a
      })
      if (taken.has(best.course_id)) result.repeats.push({ student: st.id, course: best.course_id })
      assigned.get(st.id)!.set(slot, best.course_id)
      load.set(best.key, (load.get(best.key) ?? 0) + 1)
    }
  }

  repairRepeats(problem, studentsBySlot, assigned, result)
  return result
}

function heldExcept(st: ProblemStudent, a: Map<string, number>, exceptSlot: string): Set<number> {
  const held = new Set<number>(st.fixed.values())
  for (const [k, c] of a) if (k !== exceptSlot) held.add(c)
  return held
}

function currentRepeats(problem: Problem, assigned: Map<number, Map<string, number>>) {
  const repeats: { student: number; course: number }[] = []
  for (const st of problem.students) {
    const seen = new Set<number>(st.fixed.values())
    for (const c of assigned.get(st.id)!.values()) {
      if (seen.has(c)) repeats.push({ student: st.id, course: c })
      seen.add(c)
    }
  }
  return repeats
}

/** Capacity-neutral same-slot swaps to remove repeated electives (iterated). */
function repairRepeats(
  problem: Problem,
  studentsBySlot: Map<string, ProblemStudent[]>,
  assigned: Map<number, Map<string, number>>,
  result: SolveResult,
) {
  const byId = new Map(problem.students.map((s) => [s.id, s]))
  for (let pass = 0; pass < 10; pass++) {
    result.repeats = currentRepeats(problem, assigned)
    if (result.repeats.length === 0) break
    const repeaters = new Set(result.repeats.map((r) => r.student))
    for (const st of problem.students) {
      if (!repeaters.has(st.id)) continue
      const aMap = assigned.get(st.id)!
      for (const [slot, course] of [...aMap]) {
        if (!heldExcept(st, aMap, slot).has(course)) continue // not a duplicate here
        for (const other of studentsBySlot.get(slot) ?? []) {
          if (other.id === st.id) continue
          const oMap = assigned.get(other.id)!
          const y = oMap.get(slot)
          if (y == null) continue
          if (
            !heldExcept(st, aMap, slot).has(y) &&
            !heldExcept(byId.get(other.id)!, oMap, slot).has(course)
          ) {
            aMap.set(slot, y)
            oMap.set(slot, course)
            break
          }
        }
      }
    }
    const after = currentRepeats(problem, assigned)
    if (after.length >= result.repeats.length) {
      result.repeats = after
      break
    }
    result.repeats = after
  }
}

export interface TallyRow {
  section_id: string
  course_id: number
  course_name: string
  teacher: string
  block: string
  quarter: number
  assigned: number
  capacity_target: number
  capacity_max: number
}

export function buildTally(problem: Problem, result: SolveResult): TallyRow[] {
  return problem.offerings
    .map((o) => ({
      section_id: o.section_id,
      course_id: o.course_id,
      course_name: o.course_name,
      teacher: o.teacher,
      block: o.block,
      quarter: o.quarter,
      assigned: result.load.get(o.key) ?? 0,
      capacity_target: o.capTarget,
      capacity_max: o.capMax,
    }))
    .sort(
      (a, b) =>
        a.quarter - b.quarter ||
        a.block.localeCompare(b.block) ||
        a.course_name.localeCompare(b.course_name),
    )
}

export interface Summary {
  students: number
  openSlots: number
  filled: number
  unfilled: number
  unfilledSlots: string[] // distinct "block Qx" with no section offered at all
  repeats: number
  overTarget: number // sections above their target size
  overCap: number // sections above their hard cap
  minSection: number
  maxSection: number
  incompatViolations: number
}

export function summarize(c: Canonical, problem: Problem, result: SolveResult): Summary {
  const openSlots = problem.students.reduce((n, s) => n + s.open.length, 0)
  const sizes = problem.offerings.map((o) => result.load.get(o.key) ?? 0).filter((n) => n > 0)
  const overTarget = problem.offerings.filter(
    (o) => (result.load.get(o.key) ?? 0) > o.capTarget,
  ).length
  const overCap = problem.offerings.filter((o) => (result.load.get(o.key) ?? 0) > o.capMax).length

  // post-hoc incompatibility check: any "keep apart" pair sharing a course in a quarter?
  let incompatViolations = 0
  const slotCourse = (id: number, slot: string) => {
    const st = problem.students.find((s) => s.id === id)
    if (!st) return undefined
    return st.fixed.get(slot) ?? result.assigned.get(id)?.get(slot)
  }
  const allSlots = problem.electiveBlocks.flatMap((b) => QUARTERS.map((q) => slotKey(b, q)))
  for (const p of c.incompatibilities) {
    for (const slot of allSlots) {
      const ca = slotCourse(p.a, slot)
      const cb = slotCourse(p.b, slot)
      if (ca != null && ca === cb) {
        incompatViolations++
        break
      }
    }
  }

  const unfilledSlots = [...new Set(result.unfilled.map((u) => `${u.block} Q${u.quarter}`))].sort()

  return {
    students: problem.students.length,
    openSlots,
    filled: openSlots - result.unfilled.length,
    unfilled: result.unfilled.length,
    unfilledSlots,
    repeats: result.repeats.length,
    overTarget,
    overCap,
    minSection: sizes.length ? Math.min(...sizes) : 0,
    maxSection: sizes.length ? Math.max(...sizes) : 0,
    incompatViolations,
  }
}

/** A student's assigned electives in submission order (block-major, then quarter). */
export function orderedElectives(
  problem: Problem,
  st: ProblemStudent,
  result: SolveResult,
): number[] {
  const a = result.assigned.get(st.id)!
  return [...st.open]
    .sort(
      (x, y) =>
        problem.electiveBlocks.indexOf(x.block) - problem.electiveBlocks.indexOf(y.block) ||
        x.quarter - y.quarter,
    )
    .map((s) => a.get(s.key))
    .filter((c): c is number => c != null)
}
