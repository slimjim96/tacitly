import { useEffect, useMemo, useState } from 'react'
import { api, type Dimension, type Lens, type LensMap, type MapPoint } from './api'
import { useApp } from './App'
import { Fingerprint, Radar, scoreColour, themeColour } from './viz'

const W = 1000, H = 600, M = { l: 70, r: 40, t: 30, b: 60 }
type Axis = 'pc1' | 'pc2' | string // or a dimension id

/** Stable small offset so points with identical integer scores don't sit on top of each other. */
function jitter(id: string, salt: number) {
  let h = 2166136261 ^ salt
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) / 4294967295 - 0.5) * 0.45
}

export function MapView({ lens }: { lens: Lens }) {
  const { version, open } = useApp()
  const [data, setData] = useState<LensMap | null>(null)
  const dims = lens.dimensions
  const [x, setX] = useState<Axis>('pc1')
  const [y, setY] = useState<Axis>('pc2')
  const [colourBy, setColourBy] = useState<'theme' | string>('theme')
  const [hover, setHover] = useState<MapPoint | null>(null)
  const [focusTheme, setFocusTheme] = useState<number | null>(null)
  const [trails, setTrails] = useState(true)

  useEffect(() => { api.map(lens.id).then(setData) }, [lens.id, version])
  useEffect(() => {
    // Sensible defaults per lens: your own axes when there are only two, PCA otherwise.
    if (dims.length === 2) { setX(dims[0].id); setY(dims[1].id) } else { setX('pc1'); setY('pc2') }
    setColourBy('theme')
  }, [lens.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const coord = useMemo(() => (p: MapPoint, axis: Axis, salt: number) => {
    if (axis === 'pc1') return p.pcx
    if (axis === 'pc2') return p.pcy
    return ((p.scores[axis] ?? 0) + jitter(p.id, salt)) / 5
  }, [])

  if (!data) return <p className="muted">Loading…</p>
  if (data.points.length === 0) return <p className="empty">Nothing scored in {lens.name} yet.</p>

  const px = (v: number) => M.l + ((v + 1.1) / 2.2) * (W - M.l - M.r)
  const py = (v: number) => H - M.b - ((v + 1.1) / 2.2) * (H - M.t - M.b)
  const pos = new Map(data.points.map(p => [p.id, { x: px(coord(p, x, 1)), y: py(coord(p, y, 2)) }]))
  const fill = (p: MapPoint) => colourBy === 'theme' ? themeColour(p.theme) : scoreColour(p.scores[colourBy] ?? 0)
  const dim = (id: Axis) => dims.find(d => d.id === id)
  const dimmed = (p: MapPoint) => focusTheme !== null && p.theme !== focusTheme

  return (
    <div className="map-view">
      <div className="filters">
        <AxisPicker label="X" value={x} dims={dims} onChange={setX} />
        <AxisPicker label="Y" value={y} dims={dims} onChange={setY} />
        <label className="picker check" title="Where each entry started, when you've rescored it. Needs your own dimensions on both axes.">
          <input type="checkbox" checked={trails} onChange={e => setTrails(e.target.checked)} /> trails
        </label>
        <label className="picker">Colour
          <select value={colourBy} onChange={e => setColourBy(e.target.value)}>
            <option value="theme">theme</option>
            {dims.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      </div>

      <div className="map-wrap">
        <div className="map-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="map" role="img" aria-label={`Map of ${lens.name}`}>
          {/* axes through neutral */}
          <line x1={px(-1.1)} x2={px(1.1)} y1={py(0)} y2={py(0)} className="axis" />
          <line x1={px(0)} x2={px(0)} y1={py(-1.1)} y2={py(1.1)} className="axis" />
          {x !== 'pc1' && x !== 'pc2' && [-1, -0.5, 0.5, 1].map(v => <line key={v} x1={px(v)} x2={px(v)} y1={py(-1.1)} y2={py(1.1)} className="grid-line" />)}
          {y !== 'pc1' && y !== 'pc2' && [-1, -0.5, 0.5, 1].map(v => <line key={v} x1={px(-1.1)} x2={px(1.1)} y1={py(v)} y2={py(v)} className="grid-line" />)}
          <AxisLabels axis={x} d={dim(x)} horizontal />
          <AxisLabels axis={y} d={dim(y)} />

          {trails && dim(x) && dim(y) && data.points.filter(p => p.was).map(p => {
            const from = { x: px(((p.was![x] ?? 0) + jitter(p.id, 1)) / 5), y: py(((p.was![y] ?? 0) + jitter(p.id, 2)) / 5) }
            const to = pos.get(p.id)!
            if (Math.hypot(from.x - to.x, from.y - to.y) < 2) return null
            return (
              <g key={`tr-${p.id}`} className="trail" opacity={dimmed(p) ? 0.15 : 1}>
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
                <circle cx={from.x} cy={from.y} r={3} />
              </g>
            )
          })}
          {data.points.filter(p => p.orbits).map(p => {
            const a = pos.get(p.orbits!), t = pos.get(p.id)!
            return a ? <line key={`t-${p.id}`} x1={a.x} y1={a.y} x2={t.x} y2={t.y} className="tether" opacity={dimmed(p) ? 0.1 : 1} /> : null
          })}

          {data.points.map(p => {
            const c = pos.get(p.id)!
            const common = {
              onMouseEnter: () => setHover(p), onMouseLeave: () => setHover(null), onClick: () => open(p.id),
              className: `pt ${p.kind}`, opacity: dimmed(p) ? 0.15 : 1,
            }
            if (p.kind === 'aspiration')
              return (
                <g key={p.id} {...common}>
                  <circle cx={c.x} cy={c.y} r={15} className="asp-ring" />
                  <circle cx={c.x} cy={c.y} r={5} style={{ fill: fill(p) }} className="asp-core" />
                  <text x={c.x} y={c.y - 21} className="asp-label" textAnchor={c.x > W * 0.8 ? 'end' : c.x < W * 0.2 ? 'start' : 'middle'}>
                    {p.body.length > 32 ? p.body.slice(0, 31) + '…' : p.body}
                  </text>
                </g>
              )
            if (p.kind === 'pattern')
              return (
                <g key={p.id} {...common}>
                  <rect x={c.x - 7} y={c.y - 7} width={14} height={14} transform={`rotate(45 ${c.x} ${c.y})`} className="pattern-mark" />
                  <text x={c.x > W * 0.75 ? c.x - 12 : c.x + 12} y={c.y + 4} textAnchor={c.x > W * 0.75 ? 'end' : 'start'} className="pattern-label">{p.body}</text>
                </g>
              )
            return <circle key={p.id} {...common} cx={c.x} cy={c.y} r={4 + Math.min(p.salience, 3) * 2.5} style={{ fill: fill(p) }} />
          })}
        </svg>
        </div>

        <div className="map-tip" aria-live="polite">
          {hover ? (
            <div className="tip-body">
              <Radar dims={dims} series={[{ scores: hover.scores, tone: hover.kind === 'pattern' ? 'pattern' : 'self' }]} size={96} labels={false} />
              <div>
                <b className="cap">{hover.kind}</b> · click to open<br />
                {hover.body}<br />
                <Fingerprint dims={dims} scores={hover.scores} size="md" />
              </div>
            </div>
          ) : <span className="muted">Rings are aspirations, diamonds are patterns, dots are thoughts. Lines show which aspiration a thought orbits. Hover for its shape.</span>}
        </div>
      </div>

      {data.themes.length > 0 && (
        <section>
          <h3 className="section">Themes <span className="muted small">clusters found in your scores, named by their strongest poles</span></h3>
          <div className="theme-list">
            {data.themes.map(t => (
              <button key={t.id} className={`theme-chip ${focusTheme === t.id ? 'on' : ''}`}
                onMouseEnter={() => setFocusTheme(t.id)} onMouseLeave={() => setFocusTheme(null)}>
                <span className="swatch" style={{ background: themeColour(t.id) }} />
                <span><b>{t.label}</b> <span className="muted">{t.size}</span></span>
                <Fingerprint dims={dims} scores={t.centroid} />
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="section">Distribution <span className="muted small">where everything sits on each of your axes</span></h3>
        <div className="strips">
          {dims.map(d => <Strip key={d.id} d={d} points={data.points} onHover={setHover} />)}
        </div>
      </section>
    </div>
  )
}

function AxisPicker({ label, value, dims, onChange }: { label: string; value: Axis; dims: Dimension[]; onChange: (a: Axis) => void }) {
  return (
    <label className="picker">{label}
      <select value={value} onChange={e => onChange(e.target.value)}>
        <optgroup label="Your dimensions">{dims.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
        <optgroup label="Projection"><option value="pc1">PC1 (most variation)</option><option value="pc2">PC2</option></optgroup>
      </select>
    </label>
  )
}

function AxisLabels({ axis, d, horizontal }: { axis: Axis; d?: Dimension; horizontal?: boolean }) {
  const lo = d ? `← ${d.lowLabel || 'low'}` : '', hi = d ? `${d.highLabel || 'high'} →` : ''
  const name = d ? d.name : axis === 'pc1' ? 'PC1' : 'PC2'
  if (horizontal)
    return (
      <g className="axis-label">
        <text x={M.l} y={H - 18}>{lo}</text>
        <text x={(M.l + W - M.r) / 2} y={H - 18} textAnchor="middle" className="axis-name">{name}</text>
        <text x={W - M.r} y={H - 18} textAnchor="end">{hi}</text>
      </g>
    )
  return (
    <g className="axis-label">
      <text x={18} y={H - M.b} transform={`rotate(-90 18 ${H - M.b})`}>{lo}</text>
      <text x={18} y={(M.t + H - M.b) / 2} transform={`rotate(-90 18 ${(M.t + H - M.b) / 2})`} textAnchor="middle" className="axis-name">{name}</text>
      <text x={18} y={M.t} transform={`rotate(-90 18 ${M.t})`} textAnchor="end">{hi}</text>
    </g>
  )
}

function Strip({ d, points, onHover }: { d: Dimension; points: MapPoint[]; onHover: (p: MapPoint | null) => void }) {
  const scored = points.filter(p => d.id in p.scores)
  return (
    <div className="strip">
      <div className="strip-head"><b>{d.name}</b><span className="muted small">{scored.length} scored</span></div>
      <div className="strip-track">
        <span className="pole">{d.lowLabel}</span>
        <div className="strip-line">
          <i className="strip-zero" />
          {scored.map(p => (
            <span key={p.id} className={`strip-dot ${p.kind}`}
              style={{
                left: `calc(${((p.scores[d.id] + 5) / 10) * 100}% )`,
                top: `${50 + jitter(p.id, 3) * 90}%`,
                background: p.kind === 'thought' ? scoreColour(p.scores[d.id]) : undefined,
              }}
              onMouseEnter={() => onHover(p)} onMouseLeave={() => onHover(null)} />
          ))}
        </div>
        <span className="pole">{d.highLabel}</span>
      </div>
    </div>
  )
}
