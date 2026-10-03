import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { activeLens, api, type Dimension, type EntryDetail, type Kind, type Lens, type Pulse, type ScorePatch, type Scores } from './api'
import { DimSlider, KindMark, Radar, Sim } from './viz'
import { Drift, Orbits, Review, Stream } from './Views'
import { Shape } from './Shape'
import { MapView } from './MapView'
import { Lenses } from './Lenses'
import { Drawer } from './Drawer'

type Tab = 'orbits' | 'stream' | 'shape' | 'map' | 'drift' | 'review' | 'lenses'
const TABS: { id: Tab; label: string }[] = [
  { id: 'orbits', label: 'Orbits' },
  { id: 'map', label: 'Map' },
  { id: 'shape', label: 'Shape' },
  { id: 'stream', label: 'Stream' },
  { id: 'drift', label: 'Drift' },
  { id: 'review', label: 'Still true?' },
  { id: 'lenses', label: 'Lenses' },
]

interface Ctx {
  lenses: Lens[]        // archived dimensions removed
  allLenses: Lens[]     // everything, for the editor
  lens: Lens | null
  version: number
  refresh: () => void
  open: (entryId: string) => void
}
const AppCtx = createContext<Ctx>(null!)
export const useApp = () => useContext(AppCtx)

const LENS_KEY = 'insideout.lens'
const remembered = () => { try { return localStorage.getItem(LENS_KEY) } catch { return null } }

export default function App() {
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'orbits')
  const [lenses, setLenses] = useState<Lens[] | null>(null)
  const [lensId, setLensId] = useState<string | null>(remembered)
  const [pulse, setPulse] = useState<Pulse | null>(null)
  const [version, setVersion] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reviewCount, setReviewCount] = useState(0)

  const refresh = useCallback(() => setVersion(v => v + 1), [])

  useEffect(() => {
    api.lenses().then(setLenses).catch(e => setError(e.message))
    api.pulse().then(setPulse).catch(() => {})
    api.review().then(r => setReviewCount(r.length)).catch(() => {})
  }, [version])
  useEffect(() => { location.hash = tab }, [tab])
  useEffect(() => { try { if (lensId) localStorage.setItem(LENS_KEY, lensId) } catch { /* ignore */ } }, [lensId])
  useEffect(() => {
    const onError = (e: PromiseRejectionEvent) => setError(String(e.reason?.message ?? e.reason))
    window.addEventListener('unhandledrejection', onError)
    return () => window.removeEventListener('unhandledrejection', onError)
  }, [])

  const active = useMemo(() => (lenses ?? []).map(activeLens), [lenses])
  const lens = useMemo(() => active.find(l => l.id === lensId) ?? active[0] ?? null, [active, lensId])
  const ctx: Ctx = { lenses: active, allLenses: lenses ?? [], lens, version, refresh, open: setOpenId }

  if (!lenses) return <div className="shell"><p className="muted">{error ?? 'Loading…'}</p></div>

  return (
    <AppCtx.Provider value={ctx}>
      <div className="shell">
        <header className="top">
          <div className="brand">
            <span className="logo" aria-hidden>◉</span>
            <h1>InsideOut</h1>
          </div>
          {pulse && (
            <p className="pulse">
              <b>{pulse.aspirations}</b> aspirations · <b>{pulse.thoughts}</b> thoughts · <b>{pulse.patterns}</b> patterns
              {pulse.unscored > 0 && <> · <button className="link" onClick={() => setTab('drift')}><b>{pulse.unscored}</b> unscored</button></>}
            </p>
          )}
        </header>

        {lenses.length === 0 ? <FirstRun /> : (
          <>
            <nav className="lens-bar" aria-label="Lens">
              <span className="muted small">Lens</span>
              {lenses.map(l => (
                <button key={l.id} className={`chip ${l.id === lens?.id ? 'on' : ''}`} onClick={() => setLensId(l.id)}
                  title={l.description}>
                  {l.name} <span className="muted">{l.dimensions.length}d</span>
                </button>
              ))}
              <button className="chip ghost" onClick={() => setTab('lenses')}>+ lens</button>
            </nav>

            <Capture />

            {error && <p className="error" onClick={() => setError(null)}>{error} <span className="muted">(dismiss)</span></p>}

            <nav className="tabs" role="tablist">
              {TABS.map(t => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                  {t.label}{t.id === 'review' && reviewCount > 0 && <span className="badge">{reviewCount}</span>}
                </button>
              ))}
            </nav>

            <main>
              {lens && lens.dimensions.length === 0 && tab !== 'lenses' && tab !== 'stream' && tab !== 'review'
                ? <p className="empty">“{lens.name}” has no dimensions yet. <button className="link accent" onClick={() => setTab('lenses')}>Add some</button>.</p>
                : <>
                    {tab === 'orbits' && lens && <Orbits lens={lens} />}
                    {tab === 'map' && lens && <MapView lens={lens} />}
                    {tab === 'shape' && lens && <Shape lens={lens} />}
                    {tab === 'stream' && <Stream />}
                    {tab === 'drift' && lens && <Drift lens={lens} />}
                    {tab === 'review' && <Review />}
                    {tab === 'lenses' && <Lenses onSelect={setLensId} />}
                  </>}
            </main>
          </>
        )}

        {openId && <Drawer key={openId} id={openId} onClose={() => setOpenId(null)} />}
      </div>
    </AppCtx.Provider>
  )
}

function FirstRun() {
  const { refresh } = useApp()
  const [name, setName] = useState('')
  return (
    <section className="first-run">
      <h2>Define how you want to see things</h2>
      <p>
        A <b>lens</b> is a vector space you design. Each <b>dimension</b> is an axis with a label at both ends
        (draining ↔ energising). You score thoughts and aspirations along those axes; that score <i>is</i> the vector.
        Nothing is inferred by a model.
      </p>
      <div className="row-gap">
        <button className="primary" onClick={() => api.starter().then(refresh)}>Start with Feel + Value</button>
        <span className="muted">or</span>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name your first lens" />
        <button className="chip" disabled={!name.trim()} onClick={() => api.createLens(name.trim()).then(refresh)}>Create</button>
      </div>
    </section>
  )
}

// ---- capture: write the text, then place it in the space -----------------------------------------------

/** One dimension from the wild-card pool, outside the current lens, offered at random. */
function pickWild(lenses: Lens[], current: Lens | null, not?: string): (Dimension & { lensName: string }) | null {
  const pool = lenses.flatMap(l => l.id === current?.id ? [] : l.dimensions.filter(d => d.wildcard && d.id !== not).map(d => ({ ...d, lensName: l.name })))
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null
}

function Capture() {
  const { lens, lenses, refresh, open } = useApp()
  const [kind, setKind] = useState<Kind>('thought')
  const [body, setBody] = useState('')
  const [scores, setScores] = useState<Scores>({})
  const [showScore, setShowScore] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<EntryDetail | null>(null)
  const [wild, setWild] = useState<(Dimension & { lensName: string }) | null>(null)
  useEffect(() => { setWild(pickWild(lenses, lens)) }, [lenses, lens])

  const dims = lens?.dimensions ?? []
  const setScore = (id: string, v: number | null) =>
    setScores(s => { const n = { ...s }; if (v === null) delete n[id]; else n[id] = v; return n })

  async function save() {
    if (!body.trim() || busy) return
    setBusy(true)
    try {
      const patch: ScorePatch = { ...scores }
      setResult(await api.capture(kind, body, patch))
      setBody(''); setScores({})
      setWild(pickWild(lenses, lens, wild?.id))
      refresh()
    } finally { setBusy(false) }
  }

  const placeholder = { thought: "What's on your mind?", aspiration: 'What do you want to become, build or reach?', pattern: 'Name a shape you want to recognise (e.g. "burnout", "flow")' }[kind]
  const landing = result?.lenses.find(l => l.lensId === lens?.id) ?? result?.lenses[0]

  return (
    <section className="capture">
      <div className="capture-top">
        <div className="seg" role="radiogroup" aria-label="Kind">
          {(['thought', 'aspiration', 'pattern'] as Kind[]).map(k => (
            <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? `on ${k}` : ''} onClick={() => setKind(k)}>
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
        {dims.length > 0 && (
          <button className="link small" onClick={() => setShowScore(s => !s)}>
            {showScore ? 'hide scoring' : `score in ${lens!.name}`}
          </button>
        )}
      </div>
      <textarea value={body} rows={2} placeholder={placeholder}
        onChange={e => setBody(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save() } }} />

      {showScore && dims.length > 0 && (
        <div className="score-panel">
          <div>
            <div className="sliders">
              {dims.map(d => <DimSlider key={d.id} dim={d} value={scores[d.id]} onChange={v => setScore(d.id, v)} />)}
            </div>
            {wild && (
              <div className="wild">
                <div className="wild-head">
                  <span className="wild-tag">Wild card · {wild.lensName}</span>
                  <button className="link tiny" onClick={() => { setScore(wild.id, null); setWild(pickWild(lenses, lens, wild.id)) }}>another</button>
                </div>
                <DimSlider dim={wild} value={scores[wild.id]} onChange={v => setScore(wild.id, v)} />
              </div>
            )}
          </div>
          <div className="preview">
            <Radar dims={dims} series={[{ scores, tone: kind === 'pattern' ? 'pattern' : 'self' }]} size={210} />
            <p className="muted tiny center">{dims.filter(d => d.id in scores).length}/{dims.length} scored · untouched = unscored</p>
          </div>
        </div>
      )}

      <div className="capture-row">
        <span className="hint">Ctrl/⌘+Enter to save</span>
        <button className="primary" disabled={busy || !body.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>

      {result && (
        <div className="landed">
          {!landing ? (
            <p className="muted">Saved without scores. It won't appear in any space until you score it. <button className="link accent" onClick={() => open(result.entry.id)}>Score it</button></p>
          ) : (
            <>
              {result.entry.kind === 'thought' && (landing.gravity
                ? <p>In <b>{landing.lensName}</b>, pulled toward <KindMark kind="aspiration" /> <b>{landing.gravity.entry.body}</b> <Sim v={landing.gravity.similarity} /></p>
                : <p className="muted">In {landing.lensName}: drifting. No aspiration has this shape.</p>)}
              {landing.near.length > 0 && (
                <ul className="mini">
                  {landing.near.slice(0, 3).map(n => (
                    <li key={n.entry.id}><KindMark kind={n.entry.kind} /><button className="link plain" onClick={() => open(n.entry.id)}>{n.entry.body}</button><Sim v={n.similarity} /></li>
                  ))}
                </ul>
              )}
            </>
          )}
          <button className="link small" onClick={() => setResult(null)}>dismiss</button>
        </div>
      )}
    </section>
  )
}
