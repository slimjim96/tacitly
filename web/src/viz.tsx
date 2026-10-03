import type { Dimension, Kind, Scores } from './api'

/** Diverging colour for a -5..5 score: low pole cool, high pole warm, neutral grey. */
export function scoreColour(v: number | undefined): string {
  if (v === undefined) return 'transparent'
  const t = Math.round(Math.min(Math.abs(v) / 5, 1) * 100)
  return v >= 0 ? `color-mix(in oklab, var(--hi) ${t}%, var(--mid))` : `color-mix(in oklab, var(--lo) ${t}%, var(--mid))`
}

export const THEME_COLOURS = ['#7aa2f7', '#e0af68', '#9ece6a', '#f7768e', '#bb9af7', '#2ac3de', '#ff9e64', '#73daca']
export const themeColour = (id: number | null) => (id == null ? 'var(--muted)' : THEME_COLOURS[(id - 1) % THEME_COLOURS.length])

// ---- fingerprint: the vector as a strip of cells ---------------------------------------------

export function Fingerprint({ dims, scores, size = 'sm' }: { dims: Dimension[]; scores: Scores; size?: 'sm' | 'md' }) {
  if (dims.length === 0) return null
  return (
    <span className={`fp fp-${size}`} role="img" aria-label="Score fingerprint">
      {dims.map(d => {
        const v = scores[d.id]
        return (
          <i key={d.id} className={v === undefined ? 'unscored' : ''} style={{ background: scoreColour(v) }}
            title={`${d.name}: ${v === undefined ? 'unscored' : `${v > 0 ? '+' : ''}${v} (${v < 0 ? d.lowLabel : v > 0 ? d.highLabel : 'neutral'})`}`} />
        )
      })}
    </span>
  )
}

// ---- radar: the vector as a shape ---------------------------------------------------------------

export interface Series { scores: Scores; tone: 'self' | 'other' | 'pattern' | 'past' | 'peer'; label?: string }

export function Radar({ dims, series, size = 220, labels = true }: { dims: Dimension[]; series: Series[]; size?: number; labels?: boolean }) {
  if (dims.length < 3) return <Bars dims={dims} series={series} />
  const pad = labels ? 46 : 8
  const R = size / 2 - pad, cx = size / 2, cy = size / 2
  const n = dims.length
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n
  const rad = (v: number) => (R * (v + 5)) / 10
  const pt = (i: number, v: number) => [cx + rad(v) * Math.cos(angle(i)), cy + rad(v) * Math.sin(angle(i))] as const
  const ring = (v: number) => dims.map((_, i) => pt(i, v).join(',')).join(' ')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="radar" role="img"
      aria-label={`Radar of ${dims.map(d => d.name).join(', ')}`}>
      {[-2.5, 2.5, 5].map(v => <polygon key={v} points={ring(v)} className="ring" />)}
      <polygon points={ring(0)} className="ring zero" />
      {dims.map((d, i) => {
        const [x, y] = pt(i, 5)
        return <line key={d.id} x1={cx} y1={cy} x2={x} y2={y} className="spoke" />
      })}
      {series.map((s, si) => (
        <g key={si} className={`series ${s.tone}`}>
          <polygon points={dims.map((d, i) => pt(i, s.scores[d.id] ?? 0).join(',')).join(' ')} />
          {dims.map((d, i) => {
            const [x, y] = pt(i, s.scores[d.id] ?? 0)
            return <circle key={d.id} cx={x} cy={y} r={2.6} className={d.id in s.scores ? '' : 'hollow'} />
          })}
        </g>
      ))}
      {labels && dims.map((d, i) => {
        const [x, y] = pt(i, 6.4)
        const a = angle(i)
        const anchor = Math.abs(Math.cos(a)) < 0.3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end'
        return (
          <text key={d.id} x={x} y={y + 4} textAnchor={anchor} className="radar-label">
            <title>{`${d.lowLabel || 'low'} ← ${d.name} → ${d.highLabel || 'high'}`}</title>
            {d.name}
          </text>
        )
      })}
    </svg>
  )
}

/** Fallback for lenses with fewer than three dimensions, where a radar has no area. */
function Bars({ dims, series }: { dims: Dimension[]; series: Series[] }) {
  return (
    <div className="bars">
      {dims.map(d => (
        <div key={d.id} className="bar-row">
          <span className="bar-name">{d.name}</span>
          <span className="bar-track">
            <i className="bar-zero" />
            {series.map((s, si) => {
              const v = s.scores[d.id]
              return v === undefined ? null : <b key={si} className={`bar-mark ${s.tone}`} style={{ left: `${((v + 5) / 10) * 100}%` }} />
            })}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---- slider: how a human writes one component of a vector ---------------------------------------------

export function DimSlider({ dim, value, onChange }: { dim: Dimension; value: number | undefined; onChange: (v: number | null) => void }) {
  const set = value !== undefined
  return (
    <div className={`dim-slider ${set ? 'set' : ''}`}>
      <div className="dim-head">
        <span className="dim-name">
          {dim.name}
          {dim.weight === 0 ? <em className="observed" title="Weight 0: scored and shown, not counted in distance"> observed</em>
            : dim.weight !== 1 && <em title="Weight"> ×{dim.weight}</em>}
        </span>
        <span className="dim-val" style={{ color: set && value !== 0 ? scoreColour(value! > 0 ? 5 : -5) : undefined }}>
          {set ? `${value! > 0 ? '+' : ''}${value}` : '–'}
        </span>
        {set && <button className="link tiny" onClick={() => onChange(null)} title="Clear (unscored)">clear</button>}
      </div>
      <input type="range" min={-5} max={5} step={1} value={value ?? 0}
        aria-label={`${dim.name}: ${dim.lowLabel} to ${dim.highLabel}`}
        onChange={e => onChange(Number(e.target.value))}
        onClick={e => { if (!set) onChange(Number((e.target as HTMLInputElement).value)) }} />
      <div className="poles"><span>{dim.lowLabel}</span><span>{dim.highLabel}</span></div>
    </div>
  )
}

// ---- small bits -------------------------------------------------------------------------------------------

export function KindMark({ kind }: { kind: Kind }) {
  return <span className={`mark ${kind}`} title={kind} aria-label={kind} />
}

export function Sim({ v }: { v: number }) {
  return (
    <span className="sim" title="Similarity in this lens (1 = identical shape)">
      <span className="sim-track"><i style={{ width: `${Math.round(v * 100)}%` }} /></span>
      <b>{v.toFixed(2)}</b>
    </span>
  )
}

export function Spark({ weekly }: { weekly: number[] }) {
  const max = Math.max(3, ...weekly)
  return (
    <div className="spark" title="Thoughts pulled in per week, last 8 weeks">
      {weekly.map((n, i) => <i key={i} style={{ height: `${3 + (n / max) * 26}px` }} className={n ? 'hit' : ''} />)}
    </div>
  )
}
