import type { Summary, TallyRow } from '../domain/solve'
import { CheckIcon, DownloadIcon, RestartIcon } from '../icons'

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: 'bad' | 'good'
}) {
  return (
    <div className="stat" data-tone={tone}>
      <div className="v">{value}</div>
      <div className="k">{label}</div>
    </div>
  )
}

export function ResultsStep({
  summary,
  tally,
  grade,
  onDownload,
  onRestart,
}: {
  summary: Summary
  tally: TallyRow[]
  grade: number
  onDownload: () => void
  onRestart: () => void
}) {
  const compromises = summary.unfilled + summary.repeats + summary.overTarget
  const clean = compromises === 0
  return (
    <div className="stack">
      <div className={`alert ${clean ? 'ok' : 'info'}`}>
        <span className="ico">{clean ? <CheckIcon size={18} /> : null}</span>
        <div>
          {clean ? (
            `Schedule generated for grade ${grade}: every slot filled within target capacity, no repeats.`
          ) : (
            <>
              <strong>Every slot is filled for grade {grade}.</strong> To do that a few soft
              preferences had to bend — explained below and on the <em>Notes</em> sheet of the
              download. Nothing hard was violated.
            </>
          )}
        </div>
      </div>

      {!clean && (
        <div className="stack tight">
          {summary.overTarget > 0 && (
            <div className="alert line warn">
              <div>
                <strong>{summary.overTarget}</strong> section
                {summary.overTarget === 1 ? '' : 's'} run over the target size
                {summary.overCap > 0 ? ` (${summary.overCap} over the hard cap)` : ''} because
                demand exceeded capacity — everyone is still placed. Raise <code>capacity_max</code>
                , add a section, or accept the larger class. The tally below highlights them.
              </div>
            </div>
          )}
          {summary.repeats > 0 && (
            <div className="alert line warn">
              <div>
                <strong>{summary.repeats}</strong> student
                {summary.repeats === 1 ? '' : 's'} got a repeated class — not enough distinct
                electives were offered for full variety. Add another elective for this grade.
              </div>
            </div>
          )}
          {summary.unfilled > 0 && (
            <div className="alert line err">
              <div>
                <strong>{summary.unfilled}</strong> slot
                {summary.unfilled === 1 ? '' : 's'} stayed empty because{' '}
                <strong>no section at all is offered</strong> for {summary.unfilledSlots.join(', ')}{' '}
                (not a capacity issue — over-capacity is handled by overflowing). Add a section for{' '}
                {summary.unfilledSlots.length === 1 ? 'that slot' : 'those slots'}.
              </div>
            </div>
          )}
        </div>
      )}

      <div className="stats">
        <Stat label="students" value={summary.students} />
        <Stat label="slots filled" value={`${summary.filled} / ${summary.openSlots}`} />
        <Stat
          label="over target"
          value={summary.overTarget}
          tone={summary.overTarget ? 'bad' : 'good'}
        />
        <Stat
          label="repeated electives"
          value={summary.repeats}
          tone={summary.repeats ? 'bad' : 'good'}
        />
        {summary.unfilled > 0 && <Stat label="unfilled" value={summary.unfilled} tone="bad" />}
        <Stat label="section sizes" value={`${summary.minSection}–${summary.maxSection}`} />
      </div>

      <div className="btn-row">
        <button className="btn primary" onClick={onDownload}>
          <DownloadIcon /> Download schedule (.xlsx)
        </button>
        <button className="btn ghost" onClick={onRestart}>
          <RestartIcon /> Start over
        </button>
      </div>

      <div>
        <h2 className="section">Section capacity tally</h2>
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          Highlighted cells are over target (amber) or over the hard cap (red).
        </div>
        <div className="tablewrap">
          <table className="grid">
            <thead>
              <tr>
                {['Block', 'Qtr', 'Course', 'Teacher', 'Assigned', 'Target', 'Max'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tally.map((t) => {
                const over = t.assigned > t.capacity_max
                const warn = !over && t.assigned > t.capacity_target
                return (
                  <tr key={`${t.section_id}-${t.quarter}`}>
                    <td>{t.block}</td>
                    <td>Q{t.quarter}</td>
                    <td>{t.course_name}</td>
                    <td>{t.teacher}</td>
                    <td className={`num ${over ? 'overmax' : warn ? 'over' : ''}`}>{t.assigned}</td>
                    <td className="num">{t.capacity_target}</td>
                    <td className="num">{t.capacity_max}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
