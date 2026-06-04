import { useState } from 'react'

import type { Canonical } from '../domain/types'

const LIMIT = 50

export function DataPreview({ canonical }: { canonical: Canonical }) {
  const [tab, setTab] = useState(0)
  const tabs: { label: string; columns: string[]; rows: (string | number)[][] }[] = [
    {
      label: `Courses ${canonical.courses.length}`,
      columns: ['course_id', 'name', 'category', 'term_type'],
      rows: canonical.courses.map((c) => [c.course_id, c.name, c.category, c.term_type]),
    },
    {
      label: `Sections ${canonical.sections.length}`,
      columns: ['section_id', 'course', 'teacher', 'block', 'quarters', 'cap'],
      rows: canonical.sections.map((s) => [
        s.section_id,
        s.course_name || s.course_id,
        s.teacher,
        s.block,
        s.runs_quarters,
        s.capacity_max ?? '',
      ]),
    },
    {
      label: `Students ${canonical.students.length}`,
      columns: ['student_id', 'grade'],
      rows: canonical.students.map((s) => [s.student_id, s.grade]),
    },
    {
      label: `Enrollments ${canonical.enrollments.length}`,
      columns: ['student_id', 'course_id', 'section_id', 'term', 'source'],
      rows: canonical.enrollments.map((e) => [
        e.student_id,
        e.course_id,
        e.section_id,
        e.term,
        e.source,
      ]),
    },
  ]
  const active = tabs[tab]
  const shown = active.rows.slice(0, LIMIT)
  return (
    <div>
      <div className="tabbar">
        {tabs.map((t, i) => (
          <button key={t.label} data-active={i === tab} onClick={() => setTab(i)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="tablewrap" style={{ marginTop: 12, maxHeight: 320 }}>
        <table className="grid">
          <thead>
            <tr>
              {active.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className={j === 0 ? 'id' : ''}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {active.rows.length > LIMIT && (
        <div className="cap-note">
          Showing {LIMIT} of {active.rows.length} rows.
        </div>
      )}
    </div>
  )
}
