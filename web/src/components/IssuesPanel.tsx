import type { Issue } from '../domain/types'
import { AlertIcon, CheckIcon } from '../icons'

function IssueRow({ issue }: { issue: Issue }) {
  return (
    <div className="issue">
      <div className="t">
        {issue.title}
        {issue.sheet && (
          <span className="chip">
            {[issue.sheet, issue.row ? `row ${issue.row}` : ''].filter(Boolean).join(' ')}
          </span>
        )}
      </div>
      {issue.detail && <div className="d">{issue.detail}</div>}
      {issue.fix && <div className="f">Fix: {issue.fix}</div>}
    </div>
  )
}

export function IssuesPanel({
  issues,
  cleanLabel = 'No problems found — the data looks consistent.',
}: {
  issues: Issue[]
  cleanLabel?: string
}) {
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  if (issues.length === 0) {
    return (
      <div className="alert ok">
        <span className="ico">
          <CheckIcon size={18} />
        </span>
        <div>{cleanLabel}</div>
      </div>
    )
  }
  return (
    <div className="stack tight">
      {errors.length > 0 && (
        <div className="alert err">
          <span className="ico">
            <AlertIcon />
          </span>
          <div style={{ flex: 1 }}>
            <strong>
              {errors.length} {errors.length === 1 ? 'error' : 'errors'} to fix
            </strong>
            <div className="issues">
              {errors.map((it, i) => (
                <IssueRow key={i} issue={it} />
              ))}
            </div>
          </div>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="alert warn">
          <span className="ico">
            <AlertIcon />
          </span>
          <div style={{ flex: 1 }}>
            <strong>
              {warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'} — not blocking
            </strong>
            <div className="issues">
              {warnings.map((it, i) => (
                <IssueRow key={i} issue={it} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
