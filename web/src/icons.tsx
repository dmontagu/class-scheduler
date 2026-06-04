// Minimal stroke icons (1.6px) so we don't depend on an icon library.
type P = { size?: number }
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const UploadIcon = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <path d="M12 16V4m0 0L8 8m4-4 4 4" />
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
)
export const LockIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
)
export const DownloadIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
    <path d="M5 19h14" />
  </svg>
)
export const RestartIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 4v4h4" />
  </svg>
)
export const CheckIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="m5 12 5 5 9-11" />
  </svg>
)
export const AlertIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M12 8v5m0 3h.01" />
    <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </svg>
)
export const InfoIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5m0-8h.01" />
  </svg>
)
export const SparkIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    <path d="M7.5 7.5 9 9M15 15l1.5 1.5M16.5 7.5 15 9M9 15l-1.5 1.5" />
  </svg>
)
