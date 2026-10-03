import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ago, type EntryDetail, type Kind, type Lens, type Scores, type Status } from './api'
import { useApp } from './context'
import { DimSlider, KindMark, Radar, Sim, type Series } from './viz'

/** One entry: its text, its shape in every lens, other people's view of it, and how it has moved. */
export function Drawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { lenses, lens: active, refresh, open, emit } = useApp()
  const [confirming, setConfirming] = useState(false)
  const [detail, setDetail] = useState<EntryDetail | null>(null)
  const [lensId, setLensId] = useState(active?.id ?? lenses[0]?.id)
  const [scorer, setScorer] = useState('me')
  const [people, setPeople] = useState<string[]>([])
  const [mine, setMine] = useState<Scores>({})
  const [theirs, setTheirs] = useState<Record<string, Scores>>({})
  const [body, setBody] = useState('')
  const pending = useRef<{ scorer: string; values: Record<string, number | null> }>({ scorer: 'me', values: {} })
  const timer = useRef<number | undefined>(undefined)
  const dirty = useRef(false)

  useEffect(() => {
    api.detail(id).then(d => { setDetail(d); setMine(d.entry.scores); setTheirs(d.perspectives); setBody(d.entry.body) })
    api.scorers().then(setPeople).catch(() => {})
  }, [id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function close() {
    flush()
    if (dirty.current) refresh()
    onClose()
  }

  function flush() {
    window.clearTimeout(timer.current)
    const { scorer: who, values } = pending.current
    pending.current = { scorer, values: {} }
    if (Object.keys(values).length) {
      dirty.current = true
      if (who === 'me' && Object.values(values).some(v => v !== null)) emit('entry.scored')
      api.score(id, values, who).then(d => { setDetail(d); setTheirs(d.perspectives) })
    }
  }

  function setScore(dimId: string, v: number | null) {
    const apply = (s: Scores) => { const n = { ...s }; if (v === null) delete n[dimId]; else n[dimId] = v; return n }
    if (scorer === 'me') setMine(apply)
    else setTheirs(t => ({ ...t, [scorer]: apply(t[scorer] ?? {}) }))
    if (pending.current.scorer !== scorer) flush()
    pending.current.scorer = scorer
    pending.current.values[dimId] = v
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 350)
  }

  function switchScorer(who: string) {
    if (who === '+') {
      const name = window.prompt('Whose perspective? (a short name, e.g. aaron)')?.trim().toLowerCase()
      if (!name || !/^[a-z0-9_-]{1,32}$/.test(name) || name === 'me') return
      setPeople(p => p.includes(name) ? p : [...p, name])
      who = name
    }
    flush()
    setScorer(who)
  }

  async function patch(p: { body?: string; kind?: Kind; status?: Status; isTodo?: boolean }) {
    const e = await api.update(id, p)
    if (p.kind && p.kind !== 'note' && detail?.entry.kind === 'note') emit('note.promoted')
    dirty.current = true
    setDetail(d => d && { ...d, entry: { ...e } })
  }

  async function remove() {
    await api.remove(id)
    refresh(); onClose()
  }

  const lens: Lens | undefined = lenses.find(l => l.id === lensId)
  const landing = detail?.lenses.find(l => l.lensId === lensId)
  const e = detail?.entry

  // Your first recorded shape in this lens, and each dimension's path since.
  const { first, paths } = useMemo(() => {
    const first: Scores = {}
    const paths: Record<string, { value: number | null; at: string }[]> = {}
    for (const h of detail?.history ?? []) {
      if (h.scorer !== 'me' || !lens?.dimensions.some(d => d.id === h.dimensionId)) continue
      if (h.value !== null && !(h.dimensionId in first)) first[h.dimensionId] = h.value
      ;(paths[h.dimensionId] ??= []).push({ value: h.value, at: h.at })
    }
    return { first, paths }
  }, [detail, lens])
  const moved = lens?.dimensions.filter(d => (paths[d.id]?.length ?? 0) > 1) ?? []
  const shapeChanged = lens?.dimensions.some(d => (first[d.id] ?? 0) !== (mine[d.id] ?? 0)) ?? false

  const values = scorer === 'me' ? mine : theirs[scorer] ?? {}
  const others = Object.entries(theirs).filter(([who, s]) => who !== scorer && lens?.dimensions.some(d => d.id in s))
  const series: Series[] = [
    ...(shapeChanged && scorer === 'me' ? [{ scores: first, tone: 'past' as const }] : []),
    ...(landing?.gravity && scorer === 'me' ? [{ scores: landing.gravity.entry.scores, tone: 'other' as const }] : []),
    ...others.map(([, s]) => ({ scores: s, tone: 'peer' as const })),
    ...(scorer !== 'me' ? [{ scores: mine, tone: 'self' as const }] : []),
    { scores: values, tone: scorer !== 'me' ? 'peer' as const : e?.kind === 'pattern' ? 'pattern' as const : 'self' as const },
  ]

  return (
    <div className="drawer-backdrop" onClick={close}>
      <aside className="drawer" onClick={ev => ev.stopPropagation()} role="dialog" aria-label="Entry">
        {!e ? <p className="muted">Loading…</p> : (
          <>
            <header className="drawer-head">
              <KindMark kind={e.kind} />
              <select value={e.kind} onChange={ev => patch({ kind: ev.target.value as Kind })}>
                <option value="note">note</option><option value="thought">thought</option><option value="aspiration">aspiration</option><option value="pattern">pattern</option>
              </select>
              <select value={e.status} onChange={ev => patch({ status: ev.target.value as Status })}>
                <option value="active">active</option><option value="done">done</option><option value="released">released</option>
              </select>
              {e.kind === 'note' && (
                <label className="todo-toggle">
                  <input type="checkbox" checked={e.isTodo} onChange={ev => patch({ isTodo: ev.target.checked })} /> to-do
                </label>
              )}
              <span className="muted small grow">
                {ago(e.createdAt)} · salience {e.salience.toFixed(2)}{e.source !== 'app' && ` · via ${e.source}`}
              </span>
              <button className="link" onClick={close} aria-label="Close">close</button>
            </header>

            <textarea className="drawer-body" value={body} onChange={ev => setBody(ev.target.value)}
              onBlur={() => body.trim() && body !== e.body && patch({ body })} />

            {e.kind === 'note' ? (
              <p className="muted small note-hint">
                Notes aren't scored. To place this in a lens, make it a thought or an aspiration with the menu above.
              </p>
            ) : <>
            <nav className="lens-bar">
              {lenses.map(l => {
                const n = l.dimensions.filter(d => d.id in mine).length
                return (
                  <button key={l.id} className={`chip ${l.id === lensId ? 'on' : ''}`} onClick={() => { flush(); setLensId(l.id) }}>
                    {l.name} <span className="muted">{n}/{l.dimensions.length}</span>
                  </button>
                )
              })}
              <label className="picker grow-left">Scoring as
                <select value={scorer} onChange={ev => switchScorer(ev.target.value)}>
                  <option value="me">me</option>
                  {people.map(p => <option key={p} value={p}>{p}</option>)}
                  <option value="+">+ someone else…</option>
                </select>
              </label>
            </nav>

            {lens && (
              <div className="drawer-lens">
                <div className="drawer-radar">
                  <Radar dims={lens.dimensions} size={250} series={series} />
                  <p className="muted tiny center legend">
                    <span><span className="key self" />{scorer === 'me' ? 'now' : 'me'}</span>
                    {shapeChanged && scorer === 'me' && <span><span className="key past" />first</span>}
                    {landing?.gravity && scorer === 'me' && <span><span className="key other" />orbiting</span>}
                    {(others.length > 0 || scorer !== 'me') && <span><span className="key peer" />{[...(scorer !== 'me' ? [scorer] : []), ...others.map(([w]) => w)].join(', ')}</span>}
                  </p>
                </div>
                <div>
                  {scorer !== 'me' && <p className="peer-note">Scoring as <b>{scorer}</b>. This is compared with your view and never changes your vectors.</p>}
                  <div className="sliders" data-guide="drawer-sliders">
                    {lens.dimensions.map(d => <DimSlider key={d.id} dim={d} value={values[d.id]} onChange={v => setScore(d.id, v)} />)}
                  </div>
                </div>

                {moved.length > 0 && (
                  <div className="drawer-near">
                    <h4>How it has moved</h4>
                    <ul className="mini">
                      {moved.map(d => (
                        <li key={d.id}>
                          <b className="hist-dim">{d.name}</b>
                          <span className="hist-path">
                            {paths[d.id].map((p, i) => (
                              <span key={i} title={new Date(p.at).toLocaleString()}>
                                {i > 0 && ' → '}{p.value === null ? '–' : `${p.value > 0 ? '+' : ''}${p.value}`}
                              </span>
                            ))}
                          </span>
                          <span className="muted tiny">since {ago(paths[d.id][0].at)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {landing && scorer === 'me' && (
                  <div className="drawer-near">
                    {e.kind === 'thought' && (landing.gravity
                      ? <p>Orbits <b>{landing.gravity.entry.body}</b> <Sim v={landing.gravity.similarity} /></p>
                      : <p className="muted">Drifting in {lens.name}: no aspiration within {lens.gravity.toFixed(2)}.</p>)}
                    <h4>Nearest in {lens.name}</h4>
                    <ul className="mini">
                      {landing.near.map(n => (
                        <li key={n.entry.id}>
                          <KindMark kind={n.entry.kind} />
                          <button className="link plain" onClick={() => { close(); open(n.entry.id) }}>{n.entry.body}</button>
                          <Sim v={n.similarity} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            </>}

            <footer className="drawer-foot">
              {confirming ? (
                <span className="row-confirm" role="alert">
                  <span>Delete this entry and all its scores?</span>
                  <button className="danger-btn" onClick={remove}>Delete</button>
                  <button className="link" onClick={() => setConfirming(false)}>Cancel</button>
                </span>
              ) : <button className="link danger" onClick={() => setConfirming(true)}>delete entry</button>}
            </footer>
          </>
        )}
      </aside>
    </div>
  )
}
