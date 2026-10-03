import { useEffect, useState } from 'react'
import { api, type Entry, type Kind, type Lens, type Scored, type Scores } from './api'
import { useApp } from './App'
import { DimSlider, KindMark, Radar } from './viz'
import { EntryRow } from './Views'

/**
 * Query by shape. Dial in a vector; pgvector returns the nearest entries as you move the sliders.
 * Save a shape you keep coming back to as a pattern.
 */
export function Shape({ lens }: { lens: Lens }) {
  const { version, refresh } = useApp()
  const [values, setValues] = useState<Scores>({})
  const [kind, setKind] = useState<Kind | undefined>()
  const [hits, setHits] = useState<Scored[]>([])
  const [patterns, setPatterns] = useState<Entry[]>([])
  const [name, setName] = useState('')
  const [hover, setHover] = useState<Scored | null>(null)

  useEffect(() => { setValues({}) }, [lens.id])
  useEffect(() => {
    api.entries({ kind: 'pattern' }).then(p => setPatterns(p.filter(e => lens.dimensions.some(d => d.id in e.scores))))
  }, [lens.id, version])
  useEffect(() => {
    const t = setTimeout(() => {
      if (Object.keys(values).length === 0) { setHits([]); return }
      api.match(lens.id, values, kind, 15).then(setHits)
    }, 120)
    return () => clearTimeout(t)
  }, [lens.id, values, kind, version])

  const set = (id: string, v: number | null) => setValues(s => { const n = { ...s }; if (v === null) delete n[id]; else n[id] = v; return n })

  async function savePattern() {
    if (!name.trim()) return
    await api.capture('pattern', name.trim(), values)
    setName('')
    refresh()
  }

  return (
    <div className="shape">
      <section className="shape-controls card">
        <div className="shape-head">
          <h3>Dial a shape in {lens.name}</h3>
          <button className="link small" onClick={() => setValues({})}>reset</button>
        </div>
        {patterns.length > 0 && (
          <div className="filters">
            <span className="muted small">Load pattern</span>
            {patterns.map(p => (
              <button key={p.id} className="chip" onClick={() => setValues(Object.fromEntries(Object.entries(p.scores).filter(([k]) => lens.dimensions.some(d => d.id === k))))}>
                <KindMark kind="pattern" /> {p.body}
              </button>
            ))}
          </div>
        )}
        <div className="sliders">
          {lens.dimensions.map(d => <DimSlider key={d.id} dim={d} value={values[d.id]} onChange={v => set(d.id, v)} />)}
        </div>
        <div className="row-gap">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name this shape…" />
          <button className="chip" disabled={!name.trim() || Object.keys(values).length === 0} onClick={savePattern}>Save as pattern</button>
        </div>
      </section>

      <section className="shape-view">
        <Radar dims={lens.dimensions}
          series={[
            ...(hover ? [{ scores: hover.entry.scores, tone: 'other' as const }] : []),
            { scores: values, tone: 'pattern' as const },
          ]}
          size={300} />
        <p className="muted tiny center">
          <span className="key pattern" /> your shape {hover && <><span className="key other" /> {hover.entry.body.slice(0, 40)}</>}
        </p>
      </section>

      <section className="shape-results">
        <div className="filters">
          <span className="muted small">Closest</span>
          {[undefined, 'thought', 'aspiration', 'pattern'].map(k => (
            <button key={k ?? 'all'} className={kind === k ? 'chip on' : 'chip'} onClick={() => setKind(k as Kind | undefined)}>{k ? `${k}s` : 'all'}</button>
          ))}
        </div>
        {Object.keys(values).length === 0
          ? <p className="empty">Move a slider. Unmoved dimensions count as neutral (0).</p>
          : hits.length === 0 ? <p className="empty">Nothing scored in this lens yet.</p>
          : <ul className="list">
              {hits.map(h => (
                <EntryRow key={h.entry.id} entry={h.entry} lens={lens} similarity={h.similarity}
                  onHover={on => setHover(on ? h : null)} />
              ))}
            </ul>}
      </section>
    </div>
  )
}
