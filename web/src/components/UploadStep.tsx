import { DownloadIcon, LockIcon } from '../icons'
import { Dropzone } from './Dropzone'

const SHEETS = [
  ['courses', 'every class offered — id, name, category, term (year-long / semester / quarter)'],
  ['sections', 'each class offering — teacher, block, which quarters, capacity'],
  ['blocks', "the grade's periods (e.g. A/B days, or 3rd/4th)"],
  ['students', 'student IDs (no names)'],
  ['enrollments_*', 'pre-placed music / language / SpEd classes'],
]

export function UploadStep({
  onFile,
  busy,
  error,
}: {
  onFile: (file: File) => void
  busy: boolean
  error: string | null
}) {
  return (
    <div className="stack">
      <Dropzone
        title="Drop a grade's workbook here, or click to choose"
        hint="One .xlsx file per grade, in the canonical format described below."
        onFile={onFile}
      />
      {busy && <div className="spinner" />}
      {error && (
        <div className="alert err">
          <div>{error}</div>
        </div>
      )}

      <div className="card" style={{ animation: 'none', boxShadow: 'none', padding: 18 }}>
        <div className="between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="eyebrow">What's a grade workbook?</div>
            <h2 className="section" style={{ marginBottom: 8 }}>
              A few tidy sheets, one row per fact
            </h2>
          </div>
          <a className="btn ghost" href="example-grade8-workbook.xlsx" download>
            <DownloadIcon /> Download example
          </a>
        </div>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
          {SHEETS.map(([name, desc]) => (
            <li key={name}>
              <code>{name}</code> <span className="muted">— {desc}</span>
            </li>
          ))}
        </ul>
        <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          The tool fills the rotating <strong>electives</strong>; everything pre-placed
          (music/language/SpEd) is honored as-is. Grab the example to see the exact columns.
        </div>
      </div>

      <div className="alert info">
        <span className="ico">
          <LockIcon size={18} />
        </span>
        <div>
          Everything runs in your browser. Your file is never uploaded to a server — student data
          never leaves this computer.
        </div>
      </div>
    </div>
  )
}
