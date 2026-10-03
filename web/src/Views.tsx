import { useEffect, useState } from 'react'
import { api, ago, scoredIn, type Drift as DriftData, type Entry, type Kind, type Lens, type Orbit } from './api'
import { useApp } from './context'
import { Fingerprint, KindMark, Radar, Sim, Spark } from './viz'

// ---- a single entry as a row -------------------------------------------------------------------

export function EntryRow({ entry, lens, similarity, extra, onHover }: {
  entry: Entry; lens: Lens | null; similarity?: number; extra?: React.ReactNode; onHover?: (on: boolean) => void
}) {
  const { open } = useApp()
  const opacity = Math.max(0.5, Math.min(1, 0.5 + entry.salience * 0.5))
  return (
    <li className={`row ${entry.status !== 'active' ? 'inactive' : ''}`} style={{ opacity }}
      onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}>
      <button className="row-main" onClick={() => open(entry.id)}>
        <KindMark kind={entry.kind} />
        <span className="body">{entry.body}</span>
        {lens && entry.kind !== 'note' && <Fingerprint dims={lens.dimensions} scores={entry.scores} />}
        {similarity !== undefined && <Sim v={similarity} />}
      </button>
      <div className="row-meta">
        <span>{ago(entry.createdAt)}</span>
        {entry.status !== 'active' && <span className="tag">{entry.status}</span>}
        {entry.source !== 'app' && <span className="tag">via {entry.source}</span>}
        {entry.isTodo && <span className="tag">to-do</span>}
        {lens && entry.kind !== 'note' && <span>{scoredIn(entry, lens)}/{lens.dimensions.length} scored</span>}
        {extra}
      </div>
    </li>
  )
}

// ---- orbits ---------------------------------------------------------------------------------------

export function Orbits({ lens }: { lens: Lens }) {
  const { version, open } = useApp()
  const [orbits, setOrbits] = useState<Orbit[] | null>(null)
  useEffect(() => { api.orbits(lens.id).then(setOrbits) }, [lens.id, version])

  if (!orbits) return <p className="muted">Loading…</p>
  if (orbits.length === 0)
    return <p className="empty">No aspirations scored in {lens.name} yet. Capture one and give it a shape; thoughts with a similar shape will start orbiting it.</p>

  return (
    <>
      <p className="muted small">
        A thought orbits the aspiration whose shape it's closest to in <b>{lens.name}</b>, if the similarity is at least {lens.gravity.toFixed(2)}.
      </p>
      <div className="grid">
        {orbits.map(o => (
          <article key={o.aspiration.id} className={`card orbit ${o.last30Days === 0 ? 'cold' : ''}`}>
            <div className="orbit-head">
              <Radar dims={lens.dimensions} size={112} labels={false} series={[
                ...(o.revealed ? [{ scores: o.revealed, tone: 'other' as const }] : []),
                { scores: o.aspiration.scores, tone: 'self' as const },
              ]} />
              <div>
                <h3><button className="link plain" onClick={() => open(o.aspiration.id)}>{o.aspiration.body}</button></h3>
                <div className="stats">
                  <span><b>{o.orbitCount}</b> in orbit</span>
                  <span><b>{o.last30Days}</b> last 30d</span>
                  <span>last pull {ago(o.lastPull)}</span>
                </div>
                <Spark weekly={o.weekly} />
              </div>
            </div>
            {o.statedVsRevealed !== null && (
              <p className={`revealed ${o.gapNote ? 'gap' : ''}`}>
                <span className="key self" />stated <span className="key other" />revealed · match {o.statedVsRevealed.toFixed(2)}
                {o.gapNote && <><br />{o.gapNote}</>}
              </p>
            )}
            {o.thoughts.length > 0
              ? <ul className="mini">{o.thoughts.map(t => (
                  <li key={t.entry.id}>
                    <button className="link plain" onClick={() => open(t.entry.id)}>{t.entry.body}</button>
                    <Fingerprint dims={lens.dimensions} scores={t.entry.scores} />
                    <Sim v={t.similarity} />
                  </li>))}
                </ul>
              : <p className="muted small">Nothing orbiting. Neglected, or not really this shape?</p>}
          </article>
        ))}
      </div>
    </>
  )
}

// ---- stream -----------------------------------------------------------------------------------------

export function Stream() {
  const { version, lens } = useApp()
  const [kind, setKind] = useState<Kind | undefined>()
  const [q, setQ] = useState('')
  const [entries, setEntries] = useState<Entry[] | null>(null)
  useEffect(() => {
    const t = setTimeout(() => api.entries({ kind, q }).then(setEntries), 150)
    return () => clearTimeout(t)
  }, [version, kind, q])

  return (
    <>
      <div className="filters">
        {[undefined, 'note', 'thought', 'aspiration', 'pattern'].map(k => (
          <button key={k ?? 'all'} className={kind === k ? 'chip on' : 'chip'} onClick={() => setKind(k as Kind | undefined)}>
            {k ? `${k}s` : 'all'}
          </button>
        ))}
        <input className="grow search-inline" value={q} onChange={e => setQ(e.target.value)} placeholder="Search text…" />
      </div>
      {!entries ? <p className="muted">Loading…</p> : entries.length === 0 ? <p className="empty">Nothing here.</p> :
        <ul className="list">{entries.map(e => <EntryRow key={e.id} entry={e} lens={lens} />)}</ul>}
    </>
  )
}

// ---- drift --------------------------------------------------------------------------------------------

export function Drift({ lens }: { lens: Lens }) {
  const { version, refresh } = useApp()
  const [data, setData] = useState<DriftData | null>(null)
  useEffect(() => { api.drift(lens.id).then(setData) }, [lens.id, version])
  const promote = (id: string) => api.update(id, { kind: 'aspiration' }).then(refresh)

  if (!data) return <p className="muted">Loading…</p>
  return (
    <>
      <h3 className="section">Drifting in {lens.name} <span className="muted">{data.drifting.length}</span></h3>
      <p className="muted small">Scored thoughts no aspiration is pulling on. Release them, or promote one to the aspiration you haven't named yet.</p>
      {data.drifting.length === 0 ? <p className="empty">Nothing drifting.</p> :
        <ul className="list">
          {data.drifting.map(s => (
            <EntryRow key={s.entry.id} entry={s.entry} lens={lens}
              extra={<>
                <span title="Closest any aspiration gets">nearest pull {s.similarity.toFixed(2)}</span>
                <button className="link accent" onClick={() => promote(s.entry.id)}>make aspiration</button>
              </>} />
          ))}
        </ul>}

      <h3 className="section">Unscored in {lens.name} <span className="muted">{data.unscored.length}</span></h3>
      <p className="muted small">Not yet placed in this space. Open one to score it.</p>
      {data.unscored.length === 0 ? <p className="empty">Everything has a shape here.</p> :
        <ul className="list">{data.unscored.map(e => <EntryRow key={e.id} entry={e} lens={lens} />)}</ul>}
    </>
  )
}

// ---- review: the "still true?" queue ------------------------------------------------------------

export function Review() {
  const { version, refresh, open, lens } = useApp()
  const [items, setItems] = useState<Entry[] | null>(null)
  useEffect(() => { api.review().then(setItems) }, [version])

  const done = (id: string) => setItems(xs => xs?.filter(x => x.id !== id) ?? null)
  const affirm = (id: string) => api.affirm(id).then(() => { done(id); refresh() })
  const release = (id: string) => api.update(id, { status: 'released' }).then(() => { done(id); refresh() })
  const tick = (id: string) => api.update(id, { status: 'done' }).then(() => { done(id); refresh() })

  if (!items) return <p className="muted">Loading…</p>
  return (
    <>
      <p className="muted small">
        Entries that have faded (salience under half). Say whether each is still true: affirming resets its clock,
        rescoring records the new shape in its history, releasing lets it go. To-dos left open for two weeks come back here too.
      </p>
      {items.length === 0 ? <p className="empty">Nothing has faded yet. Come back in a few weeks.</p> :
        <ul className="list">
          {items.map(e => (
            <EntryRow key={e.id} entry={e} lens={lens}
              extra={<>
                <span>salience {e.salience.toFixed(2)} · last touched {ago(e.touchedAt)}</span>
                <button className="link accent" onClick={() => affirm(e.id)}>still true</button>
                {e.isTodo
                  ? <button className="link" onClick={() => tick(e.id)}>done</button>
                  : <button className="link" onClick={() => open(e.id)}>rescore</button>}
                <button className="link" onClick={() => release(e.id)}>release</button>
              </>} />
          ))}
        </ul>}
    </>
  )
}
