import { useMemo, useState } from 'react'

import { AuditStep } from './components/AuditStep'
import { DataPreview } from './components/DataPreview'
import { IssuesPanel } from './components/IssuesPanel'
import { ResultsStep } from './components/ResultsStep'
import { UploadStep } from './components/UploadStep'
import { readCanonical } from './domain/readWorkbook'
import { writeOutput } from './domain/report'
import { buildProblem, buildTally, solve, summarize } from './domain/solve'
import type { Summary, TallyRow } from './domain/solve'
import type { Canonical, Issue } from './domain/types'
import { validate } from './domain/validate'
import { LockIcon } from './icons'

type Mode = 'generate' | 'audit'
type Phase = 'upload' | 'review' | 'results'

interface Generated {
  summary: Summary
  tally: TallyRow[]
  blob: Blob
}

const STEPS = ['Upload', 'Review & fix', 'Generate & export']

function Stepper({ active }: { active: number }) {
  return (
    <div className="steps">
      {STEPS.map((label, i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="step" data-state={i < active ? 'done' : i === active ? 'active' : 'todo'}>
            <span className="dot">{i < active ? '✓' : i + 1}</span>
            {label}
          </div>
          {i < STEPS.length - 1 && <span className="bar" />}
        </div>
      ))}
    </div>
  )
}

export function App() {
  const [mode, setMode] = useState<Mode>('generate')
  const [phase, setPhase] = useState<Phase>('upload')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canonical, setCanonical] = useState<Canonical | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])
  const [generated, setGenerated] = useState<Generated | null>(null)

  const errorCount = useMemo(() => issues.filter((i) => i.severity === 'error').length, [issues])
  const activeStep = phase === 'upload' ? 0 : phase === 'review' ? 1 : 2

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const { canonical: c, issues: readIssues } = await readCanonical(buffer)
      setCanonical(c)
      setIssues([...readIssues, ...validate(c)])
      setGenerated(null)
      setPhase('review')
    } catch (e) {
      setError(`Couldn't read that file: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleGenerate() {
    if (!canonical) return
    setBusy(true)
    setError(null)
    try {
      const problem = buildProblem(canonical)
      const result = solve(problem)
      setGenerated({
        summary: summarize(canonical, problem, result),
        tally: buildTally(problem, result),
        blob: await writeOutput(problem, result, issues),
      })
      setPhase('results')
    } catch (e) {
      setError(`Generation failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  function restart() {
    setPhase('upload')
    setCanonical(null)
    setIssues([])
    setGenerated(null)
    setError(null)
  }

  function download() {
    if (!generated || !canonical) return
    const url = URL.createObjectURL(generated.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `schedule-grade${canonical.grade}.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  return (
    <div className="shell">
      <header className="head">
        <div className="brand">
          <div className="mark" aria-hidden>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
              <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3M8 13h2m4 0h2M8 16.5h2m4 0h2" />
            </svg>
          </div>
          <div>
            <h1>Class Scheduler</h1>
            <p className="sub">Electives, sorted — one grade at a time.</p>
          </div>
        </div>
        <div className="privacy">
          <LockIcon size={14} /> Runs entirely in your browser
        </div>
      </header>

      <div className="modes" role="tablist">
        <button data-active={mode === 'generate'} onClick={() => setMode('generate')}>
          Generate schedule
        </button>
        <button data-active={mode === 'audit'} onClick={() => setMode('audit')}>
          Check an edited schedule
        </button>
      </div>

      {mode === 'generate' ? (
        <>
          <Stepper active={activeStep} />
          <div className="card">
            {phase === 'upload' && <UploadStep onFile={handleFile} busy={busy} error={error} />}

            {phase === 'review' && canonical && (
              <div className="stack">
                <div className="between">
                  <div>
                    <div className="eyebrow">Grade {canonical.grade}</div>
                    <h2 className="section">
                      {canonical.students.length} students · {canonical.sections.length} sections ·{' '}
                      {canonical.enrollments.length} enrollments
                    </h2>
                  </div>
                  <div className="btn-row">
                    <button className="btn ghost" onClick={restart}>
                      Choose a different file
                    </button>
                    <button
                      className="btn primary"
                      disabled={busy || errorCount > 0}
                      onClick={handleGenerate}
                    >
                      {errorCount > 0 ? `Fix ${errorCount} error(s) first` : 'Generate schedule'}
                    </button>
                  </div>
                </div>
                <IssuesPanel issues={issues} />
                <div>
                  <h2 className="section" style={{ marginBottom: 10 }}>
                    Data preview
                  </h2>
                  <DataPreview canonical={canonical} />
                </div>
              </div>
            )}

            {phase === 'results' && generated && canonical && (
              <ResultsStep
                summary={generated.summary}
                tally={generated.tally}
                grade={canonical.grade}
                onDownload={download}
                onRestart={restart}
              />
            )}
          </div>
        </>
      ) : (
        <div className="card">
          <AuditStep />
        </div>
      )}

      <footer className="footer">
        <span>Client-side only</span>
        <span className="dot-sep">no data leaves your browser</span>
        <span className="dot-sep">open source</span>
      </footer>
    </div>
  )
}
