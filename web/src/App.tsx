import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { activeLens, api, type Lens, type Pulse } from './api'
import { AppCtx, LENS_PAGES, PAGES, useApp, type Ctx, type Page, type Toast } from './context'
import { Drift, Orbits, Review, Stream } from './Views'
import { Shape } from './Shape'
import { MapView } from './MapView'
import { Lenses } from './Lenses'
import { Drawer } from './Drawer'
import { Inbox } from './Inbox'
import { Connect } from './Connect'
import { Celebration, GuidePanel, QUESTS, Spotlight, useGuide } from './guide'
import { Icon, Kbd, Toasts, type IconName, type LiveToast } from './ui'

export { useApp }

const META: Record<Page, { title: string; icon: IconName; desc: string }> = {
  inbox: { title: 'Inbox', icon: 'inbox', desc: 'Notes and to-dos. Nothing to set up, nothing to score.' },
  review: { title: 'Still true?', icon: 'review', desc: 'Things that have faded. Keep, finish or let go of each one.' },
  stream: { title: 'Everything', icon: 'stream', desc: 'Every entry, newest first. Search and filter by kind.' },
  orbits: { title: 'Orbits', icon: 'orbits', desc: 'Your aspirations, and the thoughts each one pulls in.' },
  map: { title: 'Map', icon: 'map', desc: 'Everything you\'ve scored, laid out on your own scales.' },
  shape: { title: 'Shape', icon: 'shape', desc: 'Dial in a shape with sliders and see what matches it.' },
  drift: { title: 'Drift', icon: 'drift', desc: 'Scored thoughts nothing is pulling on, and entries not placed yet.' },
  lenses: { title: 'Lenses', icon: 'lenses', desc: 'The scales you score things on. Each lens is its own space.' },
  connect: { title: 'Connect Claude', icon: 'connect', desc: 'Let Claude add notes and to-dos, and read your lenses.' },
}

const LENS_KEY = 'tacitly.lens'
const remembered = () => { try { return localStorage.getItem(LENS_KEY) } catch { return null } }
const fromHash = (): Page => { const h = location.hash.slice(1) as Page; return PAGES.includes(h) ? h : 'inbox' }
const typing = (el: Element | null) => !!el && el.matches('input, textarea, select, [contenteditable]')

export default function App() {
  const [page, setPage] = useState<Page>(fromHash)
  const [lenses, setLenses] = useState<Lens[] | null>(null)
  const [lensId, setLensId] = useState<string | null>(remembered)
  const [pulse, setPulse] = useState<Pulse | null>(null)
  const [version, setVersion] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reviewCount, setReviewCount] = useState(0)
  const [navOpen, setNavOpen] = useState(false)
  const [toasts, setToasts] = useState<LiveToast[]>([])
  const toastId = useRef(0)

  const refresh = useCallback(() => setVersion(v => v + 1), [])
  const go = useCallback((p: Page) => { setPage(p); setNavOpen(false) }, [])
  const dismiss = useCallback((id: number) => setToasts(ts => ts.filter(t => t.id !== id)), [])
  const toast = useCallback((t: Toast) => {
    const id = ++toastId.current
    setToasts(ts => [...ts.slice(-2), { ...t, id }])
    setTimeout(() => dismiss(id), t.action ? 6000 : 3500)
  }, [dismiss])

  const guide = useGuide(pulse, toast, go)
  const { emit, clearFocus } = guide

  useEffect(() => {
    api.lenses().then(setLenses).catch(e => setError(e.message))
    api.pulse().then(setPulse).catch(() => {})
    api.review().then(r => setReviewCount(r.length)).catch(() => {})
  }, [version])

  // The address bar follows the page, and Back/Forward follow the address bar.
  useEffect(() => { if (location.hash.slice(1) !== page) location.hash = page }, [page])
  useEffect(() => {
    const onHash = () => setPage(fromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    if (page === 'map') emit('view.map')
    if (page === 'review') emit('view.review')
  }, [page, emit])
  useEffect(() => { try { if (lensId) localStorage.setItem(LENS_KEY, lensId) } catch { /* ignore */ } }, [lensId])
  useEffect(() => {
    const onError = (e: PromiseRejectionEvent) => setError(String(e.reason?.message ?? e.reason))
    window.addEventListener('unhandledrejection', onError)
    return () => window.removeEventListener('unhandledrejection', onError)
  }, [])

  // Keyboard: "/" or "n" jumps to the composer; Esc closes the menu and any "Show me" tip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === '/' || e.key === 'n') && !typing(document.activeElement) && !e.metaKey && !e.ctrlKey && !e.altKey && !openId) {
        e.preventDefault()
        setPage('inbox')
        setTimeout(() => document.getElementById('composer-input')?.focus(), 0)
      }
      if (e.key === 'Escape' && !openId) { setNavOpen(false); clearFocus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, clearFocus])

  const active = useMemo(() => (lenses ?? []).map(activeLens), [lenses])
  const lens = useMemo(() => active.find(l => l.id === lensId) ?? active[0] ?? null, [active, lensId])

  if (!lenses) return <div className="boot"><p className="muted">{error ?? 'Loading…'}</p></div>

  const ctx: Ctx = {
    lenses: active, allLenses: lenses, lens, setLensId, pulse, reviewCount, version, refresh,
    open: setOpenId, page, go, toast, emit,
  }
  const meta = META[page]
  const isLensPage = LENS_PAGES.includes(page)

  return (
    <AppCtx.Provider value={ctx}>
      <div className={`app ${navOpen ? 'nav-open' : ''} ${guide.panel ? 'with-guide' : ''}`}>
        <Sidebar guideDone={guide.done.size} guideOpen={guide.panel} onGuide={() => guide.setPanel(!guide.panel)} />
        {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} />}

        <div className="main">
          <header className="page-head">
            <button className="icon-btn hamburger" aria-label="Open menu" onClick={() => setNavOpen(true)}><Icon name="menu" /></button>
            <div className="page-title">
              <h1><Icon name={meta.icon} size={22} /> {meta.title}</h1>
              <p className="muted">{meta.desc}</p>
            </div>
            {isLensPage && active.length > 0 && (
              <label className="lens-picker">
                <span className="muted small">Lens</span>
                <select value={lens?.id ?? ''} onChange={e => setLensId(e.target.value)}>
                  {active.map(l => <option key={l.id} value={l.id}>{l.name} ({l.dimensions.length})</option>)}
                </select>
              </label>
            )}
          </header>

          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button className="icon-btn" aria-label="Dismiss" onClick={() => setError(null)}><Icon name="x" size={16} /></button>
            </div>
          )}

          <main className="page">
            {page === 'inbox' && <Inbox onTour={() => { guide.setPanel(true); guide.setTips(true) }} />}
            {page === 'stream' && <Stream />}
            {page === 'review' && <Review />}
            {page === 'connect' && <Connect />}
            {page === 'lenses' && (lenses.length === 0 ? <FirstRun /> : <Lenses onSelect={setLensId} />)}
            {isLensPage && (
              !lens ? <FirstRun />
              : lens.dimensions.length === 0
                ? <p className="empty">“{lens.name}” has no dimensions yet. <button className="link accent" onClick={() => go('lenses')}>Add some</button>.</p>
                : <>
                    {page === 'orbits' && <Orbits lens={lens} />}
                    {page === 'map' && <MapView lens={lens} />}
                    {page === 'shape' && <Shape lens={lens} />}
                    {page === 'drift' && <Drift lens={lens} />}
                  </>
            )}
          </main>
        </div>

        {guide.panel && <GuidePanel guide={guide} onClose={() => guide.setPanel(false)} />}
        <Spotlight guide={guide} drawerOpen={!!openId} />
        <Celebration n={guide.celebrate} />
        <Toasts items={toasts} dismiss={dismiss} />
        {openId && <Drawer key={openId} id={openId} onClose={() => setOpenId(null)} />}
      </div>
    </AppCtx.Provider>
  )
}

// ---- sidebar ------------------------------------------------------------------------------------------------

function Sidebar({ guideDone, guideOpen, onGuide }: { guideDone: number; guideOpen: boolean; onGuide: () => void }) {
  const { page, go, pulse, reviewCount, lenses } = useApp()
  const item = (p: Page, count?: number, attention = false) => (
    <li key={p}>
      <button className={`nav-item ${page === p ? 'on' : ''}`} aria-current={page === p ? 'page' : undefined}
        data-guide={`nav-${p}`} onClick={() => go(p)}>
        <Icon name={META[p].icon} />
        <span className="nav-label">{META[p].title}</span>
        {!!count && <span className={`nav-count ${attention ? 'attention' : ''}`}>{count}</span>}
      </button>
    </li>
  )
  const total = QUESTS.length
  const pct = Math.round((guideDone / total) * 100)

  return (
    <aside className="sidebar" aria-label="Navigation">
      <div className="brand">
        <span className="logo" aria-hidden>◉</span>
        <span>Tacitly</span>
      </div>

      <nav>
        <ul className="nav-group">
          {item('inbox', pulse?.todos)}
          {item('review', reviewCount, true)}
          {item('stream')}
        </ul>

        <p className="nav-heading">Lens views</p>
        <ul className="nav-group">
          {item('orbits')}
          {item('map')}
          {item('shape')}
          {item('drift', lenses.length ? pulse?.unscored : undefined)}
        </ul>

        <p className="nav-heading">Set up</p>
        <ul className="nav-group">
          {item('lenses', lenses.length || undefined)}
          <li>
            <button className={`nav-item ${page === 'connect' ? 'on' : ''}`} aria-current={page === 'connect' ? 'page' : undefined}
              data-guide="nav-connect" onClick={() => go('connect')}>
              <Icon name="connect" />
              <span className="nav-label">Connect Claude</span>
              <span className={`dot ${pulse?.claude ? 'ok' : ''}`} title={pulse?.claude ? 'Connected' : 'Not connected yet'} />
            </button>
          </li>
        </ul>
      </nav>

      <button className={`guide-button ${guideOpen ? 'on' : ''}`} onClick={onGuide} aria-expanded={guideOpen}>
        <span className="ring" style={{ '--p': `${pct}%` } as React.CSSProperties} aria-hidden><Icon name="guide" size={14} /></span>
        <span className="nav-label">Guide<small>{guideDone === total ? 'All quests done' : `${guideDone} of ${total} quests`}</small></span>
      </button>
      <p className="shortcut-hint muted tiny"><Kbd>/</Kbd> new note</p>
    </aside>
  )
}

function FirstRun() {
  const { refresh, emit } = useApp()
  const [name, setName] = useState('')
  const make = (p: Promise<unknown>) => p.then(() => { emit('lens.created'); refresh() })
  return (
    <section className="first-run">
      <h2>Lenses are optional</h2>
      <p className="muted">Notes and to-dos need nothing set up. A lens is for the few things you want to place and compare.</p>
      <p>
        A <b>lens</b> is a set of scales you design. Each <b>dimension</b> is a scale with a word at each end,
        like draining ↔ energising. Where you put something on those scales <i>is</i> its vector. Nothing is guessed by a model.
      </p>
      <div className="row-gap">
        <button className="primary" data-guide="starter-lens" onClick={() => make(api.starter())}>Start with Feel + Value</button>
        <span className="muted">or</span>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name your own lens" aria-label="Lens name"
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) make(api.createLens(name.trim())) }} />
        <button className="chip" disabled={!name.trim()} onClick={() => make(api.createLens(name.trim()))}>Create</button>
      </div>
    </section>
  )
}
