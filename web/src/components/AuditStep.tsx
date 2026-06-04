import { useState } from 'react'

import { auditSchedule, readEditedSchedule } from '../domain/audit'
import { readCanonical } from '../domain/readWorkbook'
import type { Issue } from '../domain/types'
import { validate } from '../domain/validate'
import { CheckIcon } from '../icons'
import { Dropzone } from './Dropzone'
import { IssuesPanel } from './IssuesPanel'

interface Loaded {
  file: File
  buffer: ArrayBuffer
}

export function AuditStep() {
  const [source, setSource] = useState<Loaded | null>(null)
  const [edited, setEdited] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [findings, setFindings] = useState<Issue[] | null>(null)

  async function run(src: Loaded, edt: Loaded) {
    setBusy(true)
    setError(null)
    setFindings(null)
    try {
      const { canonical, issues: readIssues } = await readCanonical(src.buffer)
      const sourceErrors = [...readIssues, ...validate(canonical)].filter(
        (i) => i.severity === 'error',
      )
      if (sourceErrors.length > 0) {
        setError('The source data workbook has errors — fix those in Generate mode first.')
        setBusy(false)
        return
      }
      const { assignments, issues: parseIssues } = await readEditedSchedule(edt.buffer, canonical)
      const violations = auditSchedule(canonical, assignments)
      setFindings([...parseIssues, ...violations])
    } catch (e) {
      setError(`Couldn't check that schedule: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  async function load(which: 'source' | 'edited', file: File) {
    const buffer = await file.arrayBuffer()
    const loaded = { file, buffer }
    const src = which === 'source' ? loaded : source
    const edt = which === 'edited' ? loaded : edited
    if (which === 'source') setSource(loaded)
    else setEdited(loaded)
    if (src && edt) run(src, edt)
  }

  const errors = findings?.filter((i) => i.severity === 'error').length ?? 0
  const warnings = findings?.filter((i) => i.severity === 'warning').length ?? 0

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Audit</div>
        <h2 className="section">Check an edited schedule</h2>
        <div className="muted" style={{ fontSize: 13.5 }}>
          Generated a schedule, tweaked it in Excel, and want to be sure you didn't break anything?
          Drop the source data workbook and your edited schedule — it re-checks capacity, repeats,
          locked placements, and keep-apart / keep-together rules.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Dropzone
          title="Source data workbook"
          hint="The canonical .xlsx you generated from."
          filename={source?.file.name}
          onFile={(f) => load('source', f)}
        />
        <Dropzone
          title="Edited schedule"
          hint="The schedule .xlsx you exported and edited."
          filename={edited?.file.name}
          onFile={(f) => load('edited', f)}
        />
      </div>

      {busy && <div className="spinner" />}
      {error && (
        <div className="alert err">
          <div>{error}</div>
        </div>
      )}

      {findings && !error && (
        <div className="stack tight">
          <div className={`alert ${findings.length === 0 ? 'ok' : errors > 0 ? 'err' : 'warn'}`}>
            <span className="ico">{findings.length === 0 ? <CheckIcon size={18} /> : null}</span>
            <div>
              {findings.length === 0 ? (
                'No problems — the edited schedule respects every constraint in the source data.'
              ) : (
                <>
                  <strong>
                    {errors} hard {errors === 1 ? 'violation' : 'violations'}
                  </strong>{' '}
                  and {warnings} soft {warnings === 1 ? 'note' : 'notes'} found in your edits.
                </>
              )}
            </div>
          </div>
          {findings.length > 0 && <IssuesPanel issues={findings} />}
        </div>
      )}
    </div>
  )
}
