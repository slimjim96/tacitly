import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Pulse } from './api'
import type { GuideEvent, Page, Toast } from './context'
import { Icon } from './ui'

// ---- the quest log ---------------------------------------------------------------------------------------

export interface Quest {
  id: string
  chapter: number
  title: string
  hint: string
  page: Page | null            // where "Show me" takes you
  target: string               // data-guide="..." of the control to spotlight
  events: GuideEvent[]         // any of these completes it
  check?: (p: Pulse) => boolean // credit from data that already exists
}

export const CHAPTERS = ['Capture', 'Place it', 'Bring in Claude', 'Keep it true']

export const QUESTS: Quest[] = [
  { id: 'note', chapter: 0, title: 'Write your first note', page: 'inbox', target: 'composer',
    hint: 'Type anything that\'s on your mind and press Enter or Save. No setup, nothing to score.',
    events: ['note.created'], check: p => p.notes > 0 },
  { id: 'todo', chapter: 0, title: 'Add a to-do', page: 'inbox', target: 'composer-todo',
    hint: 'Flip the switch to To-do, type what needs doing, and save it.',
    events: ['todo.created'], check: p => p.todos > 0 },
  { id: 'tick', chapter: 0, title: 'Tick a to-do done', page: 'inbox', target: 'todo-check',
    hint: 'Click the box next to a to-do. Changed your mind? Undo appears at the top of the screen.',
    events: ['todo.done'] },
  { id: 'tidy', chapter: 0, title: 'Release a note you don\'t need', page: 'inbox', target: 'row-menu',
    hint: 'Open the ⋯ menu on a note and choose Release. It isn\'t deleted, just out of the way.',
    events: ['note.released'] },

  { id: 'lens', chapter: 1, title: 'Set up a lens', page: 'lenses', target: 'starter-lens',
    hint: 'A lens is a set of scales you score things on. Start with Feel + Value; you can change all of it later.',
    events: ['lens.created'], check: p => p.lenses > 0 },
  { id: 'promote', chapter: 1, title: 'Turn a note into a thought', page: 'inbox', target: 'row-menu',
    hint: 'Open the ⋯ menu on a note and choose Make thought. It keeps its words and date.',
    events: ['note.promoted'], check: p => p.thoughts > 0 },
  { id: 'score', chapter: 1, title: 'Give it a shape', page: 'stream', target: 'drawer-sliders',
    hint: 'Open a thought and drag a slider. Each slider sits between two words you chose; where you put it is the vector.',
    events: ['entry.scored'], check: p => p.scores > 0 },
  { id: 'aspiration', chapter: 1, title: 'Name an aspiration', page: 'inbox', target: 'composer-more',
    hint: 'Choose More, then Aspiration, for something you want to become or reach. Score it, and thoughts with a similar shape will orbit it.',
    events: ['aspiration.created'], check: p => p.aspirations > 0 },
  { id: 'map', chapter: 1, title: 'Look at the map', page: null, target: 'nav-map',
    hint: 'The map puts everything you\'ve scored in one picture, on your own scales.',
    events: ['view.map'] },

  { id: 'claude', chapter: 2, title: 'Connect Claude', page: 'connect', target: 'copy-mcp',
    hint: 'Copy the command into Claude Code, or add the address as a connector in Claude Desktop. Then ask Claude to add a note.',
    events: ['claude.marked'], check: p => p.claude > 0 },

  { id: 'review', chapter: 3, title: 'Check what\'s still true', page: null, target: 'nav-review',
    hint: 'Old entries and forgotten to-dos come back here. Keep, finish or release each one.',
    events: ['view.review'] },
]

// ---- progress ---------------------------------------------------------------------------------------------

interface Saved { done: string[]; skipped: string[]; tips: boolean; panel: boolean }
interface Win { text: string; big: boolean; at: number }
const KEY = 'tacitly.guide'
const load = (): Saved | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { return null } }

export interface Guide {
  done: Set<string>
  skipped: Set<string>
  tips: boolean
  panel: boolean
  focus: string | null               // the quest "Show me" was pressed for
  current: Quest | null              // first quest not done or skipped
  celebrate: number                  // bumps when a chapter is finished
  win: Win | null                    // the latest quest win, shown in the tip card for a moment
  emit: (e: GuideEvent) => void
  showMe: (q: Quest) => void
  skip: (id: string) => void
  setTips: (on: boolean) => void
  setPanel: (open: boolean) => void
  reset: () => void
  clearFocus: () => void
}

/** Guide state: persisted per browser, credited from real actions and from the data that already exists. */
export function useGuide(pulse: Pulse | null, toast: (t: Toast) => void, go: (p: Page) => void): Guide {
  const [saved, setSaved] = useState<Saved | null>(load)
  const [focus, setFocus] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState(0)
  const [win, setWin] = useState<Win | null>(null)

  // First visit: open the guide with tips on for a fresh install, stay out of the way otherwise.
  useEffect(() => {
    if (saved || !pulse) return
    const fresh = pulse.notes + pulse.todos + pulse.thoughts + pulse.aspirations + pulse.patterns === 0
    setSaved({ done: [], skipped: [], tips: fresh, panel: fresh })
  }, [pulse, saved])

  useEffect(() => { try { if (saved) localStorage.setItem(KEY, JSON.stringify(saved)) } catch { /* private mode */ } }, [saved])

  const latest = useRef(saved)
  latest.current = saved

  const complete = useCallback((ids: string[]) => {
    const s = latest.current
    if (!s) return
    const fresh = ids.filter(id => !s.done.includes(id))
    if (!fresh.length) return
    const done = [...s.done, ...fresh]
    const next = { ...s, done, skipped: s.skipped.filter(id => !fresh.includes(id)) }
    latest.current = next
    setSaved(next)
    setFocus(f => (f && ids.includes(f) ? null : f))
    // With tips on, the win shows in the tip card, like a game's tutorial box; otherwise as a toast.
    const coachShowing = s.tips && !document.querySelector('.modal-backdrop')
      && QUESTS.some(q => !done.includes(q.id) && !next.skipped.includes(q.id))
    for (const id of fresh) {
      const q = QUESTS.find(x => x.id === id)!
      const chapterDone = QUESTS.filter(x => x.chapter === q.chapter).every(x => done.includes(x.id))
      const after = CHAPTERS[q.chapter + 1]
      const text = chapterDone
        ? `Chapter complete: ${CHAPTERS[q.chapter]}!${after ? ` Next up: ${after}.` : ' You\'ve finished the guide.'}`
        : `Quest complete: ${q.title}`
      if (coachShowing) setWin({ text, big: chapterDone, at: Date.now() })
      else toast({ text })
      if (chapterDone) setCelebrate(c => c + 1)
    }
  }, [toast])

  // Credit anything the data already shows. Quietly on load (a second device, or work done before the
  // guide existed); with a cheer after that (e.g. Claude's first note arriving while you watch).
  const primed = useRef(false)
  useEffect(() => {
    if (!pulse || !saved) return
    const ids = QUESTS.filter(q => q.check?.(pulse) && !saved.done.includes(q.id)).map(q => q.id)
    if (!primed.current) {
      primed.current = true
      if (ids.length) setSaved(s => s && { ...s, done: [...s.done, ...ids] })
    } else if (ids.length) complete(ids)
  }, [pulse, saved, complete])

  useEffect(() => {
    if (!win) return
    const t = setTimeout(() => setWin(null), win.big ? 4500 : 3000)
    return () => clearTimeout(t)
  }, [win])

  const emit = useCallback((e: GuideEvent) => complete(QUESTS.filter(q => q.events.includes(e)).map(q => q.id)), [complete])

  const s = saved ?? { done: [], skipped: [], tips: false, panel: false }
  const done = new Set(s.done), skipped = new Set(s.skipped)
  const current = QUESTS.find(q => !done.has(q.id) && !skipped.has(q.id)) ?? null

  return {
    done, skipped, tips: s.tips, panel: s.panel, focus, current, celebrate, win, emit,
    showMe: q => { if (q.page) go(q.page); setFocus(q.id) },
    skip: id => { setSaved(x => x && { ...x, skipped: [...x.skipped, id] }); setFocus(null) },
    setTips: tips => setSaved(x => x && { ...x, tips }),
    setPanel: panel => setSaved(x => x && { ...x, panel }),
    reset: () => { setSaved({ done: [], skipped: [], tips: true, panel: true }); setFocus(null) },
    clearFocus: () => setFocus(null),
  }
}

// ---- the panel: chapters, quests, progress -----------------------------------------------------------------

export function GuidePanel({ guide, onClose }: { guide: Guide; onClose: () => void }) {
  const total = QUESTS.length, n = guide.done.size
  const level = Math.min(CHAPTERS.length, (guide.current?.chapter ?? CHAPTERS.length - 1) + 1)
  return (
    <aside className="guide-panel" aria-label="Guide">
      <header className="guide-head">
        <div>
          <p className="eyebrow">Level {level} · {CHAPTERS[level - 1]}</p>
          <h2>Guide</h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close guide"><Icon name="x" /></button>
      </header>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={n} aria-label="Quests done">
        <i style={{ width: `${(n / total) * 100}%` }} />
      </div>
      <p className="muted small">{n} of {total} quests done. Each one ticks itself off when you do it for real.</p>

      {CHAPTERS.map((c, ci) => {
        const qs = QUESTS.filter(q => q.chapter === ci)
        const cleared = qs.every(q => guide.done.has(q.id))
        return (
          <section key={c} className={`chapter ${cleared ? 'cleared' : ''}`}>
            <h3><span className="chapter-n">{ci + 1}</span>{c}{cleared && <Icon name="check" size={16} className="ok" />}</h3>
            <ol className="quests">
              {qs.map(q => {
                const isDone = guide.done.has(q.id), isCurrent = guide.current?.id === q.id
                return (
                  <li key={q.id} className={`quest ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''} ${guide.skipped.has(q.id) ? 'skipped' : ''}`}>
                    <span className="quest-box" aria-hidden>{isDone && <Icon name="check" size={13} />}</span>
                    <div className="quest-text">
                      <span className="quest-title">{q.title}{isDone && <span className="sr-only"> (done)</span>}</span>
                      {isCurrent && <span className="quest-hint">{q.hint}</span>}
                      {!isDone && (
                        <span className="quest-actions">
                          <button className="link accent" onClick={() => guide.showMe(q)}><Icon name="eye" size={14} /> Show me</button>
                          {!guide.skipped.has(q.id) && <button className="link" onClick={() => guide.skip(q.id)}>skip</button>}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}

      <footer className="guide-foot">
        <label className="switch">
          <input type="checkbox" checked={guide.tips} onChange={e => guide.setTips(e.target.checked)} />
          <span>Show tips on the page</span>
        </label>
        <button className="link small" onClick={guide.reset}>Start over</button>
      </footer>
    </aside>
  )
}

// ---- spotlight: a ring around the control to use, with a coach mark ------------------------------------------

export function Spotlight({ guide, drawerOpen = false }: { guide: Guide; drawerOpen?: boolean }) {
  const quest = guide.focus ? QUESTS.find(q => q.id === guide.focus) ?? null : guide.tips ? guide.current : null
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [found, setFound] = useState(false)     // the control exists somewhere on the page
  const [blocked, setBlocked] = useState(false) // a dialog is open: stand aside
  const scrolled = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!quest) { setRect(null); return }
    let raf = 0, last = ''
    const tick = () => {
      const el = [...document.querySelectorAll<HTMLElement>(`[data-guide="${quest.target}"]`)].find(e => e.offsetParent !== null)
      let r = el?.getBoundingClientRect() ?? null
      // Only ring what you can actually click: not something under a dialog, or scrolled out of view.
      if (r && el) {
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        if (!top || !el.contains(top)) r = null
      }
      const modal = !!document.querySelector('.modal-backdrop')
      const sig = `${modal}|${!!el}|` + (r ? `${r.x|0},${r.y|0},${r.width|0},${r.height|0}` : '')
      if (sig !== last) { last = sig; setRect(r); setFound(!!el); setBlocked(modal) }
      if (el && guide.focus === quest.id && scrolled.current !== quest.id) {
        scrolled.current = quest.id
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [quest, guide.focus])

  if (!quest || blocked) return null
  const pad = 6
  // The ring marks the control; the tip card stays docked in a corner so it never covers the rows next to it.
  return (
    <>
      {rect && <div className={`spot-ring ${guide.focus ? "dim" : ""}`} style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />}
      <div className={`coach ${drawerOpen ? 'beside-drawer' : guide.panel ? 'beside-guide' : ''}`} role="dialog" aria-label={`Tip: ${quest.title}`}>
        {guide.win && (
          <p key={guide.win.at} className={`coach-win ${guide.win.big ? 'big' : ''}`} role="status">
            <Icon name="check" size={15} /> {guide.win.text}
          </p>
        )}
        <p className="eyebrow">{CHAPTERS[quest.chapter]} · quest {QUESTS.indexOf(quest) + 1} of {QUESTS.length}</p>
        <h4>{quest.title}</h4>
        <p>{quest.hint}</p>
        {!found && <p className="muted small">{missingTarget(quest)}</p>}
        <div className="coach-actions">
          <button className="link" onClick={() => guide.skip(quest.id)}>Skip</button>
          <button className="link" onClick={() => { guide.clearFocus(); guide.setTips(false) }}>Hide tips</button>
          {guide.focus && <button className="chip" onClick={guide.clearFocus}>Got it</button>}
        </div>
      </div>
    </>
  )
}

function missingTarget(q: Quest): string {
  switch (q.target) {
    case 'todo-check': return 'You need an open to-do first. Add one from the composer.'
    case 'row-menu': return 'You need a note in the Inbox first.'
    case 'drawer-sliders': return 'Open any thought or aspiration (click its text) to see its sliders. You need a lens first.'
    case 'composer-more': return 'The More menu appears in the composer once you have a lens.'
    default: return 'Go to the page in the sidebar to find it.'
  }
}

/** A short burst when a chapter is finished. Skipped for people who prefer reduced motion (CSS). */
export function Celebration({ n }: { n: number }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!n) return
    setShow(true)
    const t = setTimeout(() => setShow(false), 1600)
    return () => clearTimeout(t)
  }, [n])
  if (!show) return null
  return (
    <div className="burst" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--a': `${i * 20}deg`, '--d': `${90 + (i % 3) * 40}px` } as React.CSSProperties} />)}
    </div>
  )
}
