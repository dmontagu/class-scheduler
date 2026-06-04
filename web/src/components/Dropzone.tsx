import { useRef, useState } from 'react'

import { UploadIcon } from '../icons'

export function Dropzone({
  title,
  hint,
  filename,
  onFile,
}: {
  title: string
  hint: string
  filename?: string | null
  onFile: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const pick = (files: FileList | null) => files && files[0] && onFile(files[0])

  return (
    <div
      className="drop"
      data-drag={drag}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        pick(e.dataTransfer.files)
      }}
    >
      <div className="ico">
        <UploadIcon size={26} />
      </div>
      <h3>{title}</h3>
      <div className="muted" style={{ fontSize: 13.5 }}>
        {hint}
      </div>
      {filename && (
        <div style={{ marginTop: 10 }}>
          <span className="chip">{filename}</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => pick(e.target.files)}
      />
    </div>
  )
}
