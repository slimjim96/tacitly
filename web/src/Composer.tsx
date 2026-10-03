import { useEffect, useRef, useState } from 'react'
import { api, type Dimension, type EntryDetail, type Kind, type Lens, type Scores } from './api'
import { useApp } from './context'
import { Icon, Kbd, Menu, Segmented } from './ui'
import { DimSlider, KindMark, Radar, Sim } from './viz'

type Mode = 'note' | 'todo'
type Placed = Exclude<Kind, 'note'>
const TODO_MARKER = /^\s*\[\s?\]\s*/

const PLACEHOLDER: Record<Mode, string> = {
  note: 'Note something down…',
  todo: 'What needs doing?',
}

/**
 * The composer: write a line, pick Note or To-do with a visible switch, save. "More" opens the full capture
 * with a shape for a thought, aspiration or pattern. Typing "[]" still works: it flips the switch and disappears.
 */
export function Composer({ hero = false }: { hero?: boolean }) {
  const { refresh, emit, lenses, go } = useApp()
  const [mode, setMode] = useState<Mode>('note')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [shape, setShape] = useState<Placed | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2200)
    return () => clearTimeout(t)
  }, [flash])

  // Grow with the text, up to a point.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [body])

  function onChange(text: string) {
    if (TODO_MARKER.test(text) && mode === 'note') {
      setMode('todo')
      setFlash('Switched to To-do. (Typing [] at the start does that.)')
      text = text.replace(TODO_MARKER, '')
    }
    if (!body && !text.trim()) text = ''   // no leading blanks, e.g. the space typed after "[]"
    setBody(text)
  }

  async function save() {
    if (!body.trim() || busy) return
    setBusy(true)
    try {
      await api.note(body, mode === 'todo')
      emit(mode === 'todo' ? 'todo.created' : 'note.created')
      setFlash(mode === 'todo' ? 'To-do added' : 'Note saved')
      setBody('')
      refresh()
      ref.current?.focus()
    } finally { setBusy(false) }
  }

  const more = (kind: Placed, label: string, hint: string) => ({
    label, hint, icon: kind as 'thought' | 'aspiration' | 'pattern',
    run: () => (lenses.length ? setShape(kind) : go('lenses')),
  })

  return (
    <>
      <div className={`composer ${hero ? 'hero' : ''} ${mode}`} data-guide="composer">
        <textarea ref={ref} id="composer-input" value={body} rows={1} aria-label={mode === 'todo' ? 'New to-do' : 'New note'}
          placeholder={PLACEHOLDER[mode]} autoFocus={hero}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); save() }
          }} />
        <div className="composer-bar">
          <Segmented<Mode> label="Kind of entry" value={mode} onChange={m => { setMode(m); ref.current?.focus() }} options={[
            { value: 'note', label: 'Note', icon: 'note', title: 'Something to remember' },
            { value: 'todo', label: 'To-do', icon: 'todo', guide: 'composer-todo', title: 'Something to do, with a checkbox' },
          ]} />
          <Menu label="More ways to capture" className="composer-more" guide="composer-more" items={lenses.length ? [
            more('thought', 'Thought with a shape', 'Score it on a lens as you save'),
            more('aspiration', 'Aspiration', 'Something you want to become or reach'),
            more('pattern', 'Pattern', 'A shape you want to recognise, like "burnout"'),
          ] : [
            { label: 'Set up a lens first', hint: 'Thoughts, aspirations and patterns are scored on a lens', icon: 'lenses', run: () => go('lenses') },
          ]}>
            <Icon name="plus" size={16} /> More
          </Menu>
          <span className={`composer-hint ${flash ? "flash" : ""}`} aria-live="polite">
            {flash ?? <><Kbd>Enter</Kbd> to save · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line</>}
          </span>
          <button className="send" disabled={!body.trim() || busy} onClick={save}
            aria-label={mode === 'todo' ? 'Add to-do' : 'Save note'}>
            <span>{mode === 'todo' ? 'Add to-do' : 'Save'}</span><Icon name="send" size={16} />
          </button>
        </div>
      </div>
      {shape && <ShapeDialog kind={shape} body={body} onClose={saved => { setShape(null); if (saved) setBody('') }} />}
    </>
  )
}

// ---- capture with a shape: a dialog with the lens sliders ----------------------------------------------------

/** One dimension from the wild-card pool, outside the current lens, offered at random. */
function pickWild(lenses: Lens[], current: Lens | null, not?: string): (Dimension & { lensName: string }) | null {
  const pool = lenses.flatMap(l => l.id === current?.id ? [] : l.dimensions.filter(d => d.wildcard && d.id !== not).map(d => ({ ...d, lensName: l.name })))
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null
}

const KIND_COPY: Record<Placed, { title: string; placeholder: string }> = {
  thought: { title: 'New thought', placeholder: "What's on your mind?" },
  aspiration: { title: 'New aspiration', placeholder: 'What do you want to become, build or reach?' },
  pattern: { title: 'New pattern', placeholder: 'Name a shape you want to recognise, e.g. "burnout" or "flow"' },
}

function ShapeDialog({ kind: initialKind, body: initialBody, onClose }: { kind: Placed; body: string; onClose: (saved: boolean) => void }) {
  const { lens: active, lenses, refresh, open, emit } = useApp()
  const [kind, setKind] = useState<Placed>(initialKind)
  const [body, setBody] = useState(initialBody)
  const [lensId, setLensId] = useState(active?.id ?? lenses[0]?.id)
  const [scores, setScores] = useState<Scores>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<EntryDetail | null>(null)
  const lens = lenses.find(l => l.id === lensId) ?? null
  const [wild, setWild] = useState(() => pickWild(lenses, lens))
  const dims = lens?.dimensions ?? []

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(!!result) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const setScore = (id: string, v: number | null) =>
    setScores(s => { const n = { ...s }; if (v === null) delete n[id]; else n[id] = v; return n })

  async function save() {
    if (!body.trim() || busy) return
    setBusy(true)
    try {
      const d = await api.capture(kind, body, { ...scores })
      setResult(d)
      if (kind === 'aspiration') emit('aspiration.created')
      if (Object.keys(scores).length) emit('entry.scored')
      refresh()
    } finally { setBusy(false) }
  }

  const landing = result?.lenses.find(l => l.lensId === lensId) ?? result?.lenses[0]
  const scored = dims.filter(d => d.id in scores).length

  return (
    <div className="modal-backdrop" onClick={() => onClose(!!result)}>
      <div className="modal shape-dialog" role="dialog" aria-modal="true" aria-label={KIND_COPY[kind].title} onClick={e => e.stopPropagation()}>
        <header className="modal-head">
          <h2><KindMark kind={kind} /> {result ? 'Saved' : KIND_COPY[kind].title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={() => onClose(!!result)}><Icon name="x" /></button>
        </header>

        {!result ? (
          <>
            <Segmented<Placed> label="Kind" value={kind} onChange={setKind} options={[
              { value: 'thought', label: 'Thought', icon: 'thought' },
              { value: 'aspiration', label: 'Aspiration', icon: 'aspiration' },
              { value: 'pattern', label: 'Pattern', icon: 'pattern' },
            ]} />
            <textarea className="shape-body" value={body} rows={2} placeholder={KIND_COPY[kind].placeholder} autoFocus
              onChange={e => setBody(e.target.value)} aria-label="Text" />

            <div className="step-label">
              <span>Score it in</span>
              <div className="chips">
                {lenses.map(l => (
                  <button key={l.id} className={`chip ${l.id === lensId ? 'on' : ''}`} onClick={() => { setLensId(l.id); setWild(pickWild(lenses, l)) }}>{l.name}</button>
                ))}
              </div>
            </div>
            <p className="muted small">Drag the sliders that matter and leave the rest. Untouched means unscored, not zero. You can score it later too.</p>

            {dims.length === 0 ? <p className="empty">This lens has no dimensions yet.</p> : (
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
                  <Radar dims={dims} series={[{ scores, tone: kind === 'pattern' ? 'pattern' : 'self' }]} size={200} />
                  <p className="muted tiny center">{scored}/{dims.length} scored</p>
                </div>
              </div>
            )}

            <footer className="modal-foot">
              <button className="link" onClick={() => onClose(false)}>Cancel</button>
              <button className="primary" disabled={!body.trim() || busy} onClick={save}>
                {busy ? 'Saving…' : scored ? `Save with ${scored} score${scored > 1 ? 's' : ''}` : 'Save unscored'}
              </button>
            </footer>
          </>
        ) : (
          <>
            <p className="saved-body">{result.entry.body}</p>
            {!landing ? (
              <p className="muted">Saved without scores. It shows under Drift as unscored until you give it a shape.</p>
            ) : (
              <>
                {result.entry.kind === 'thought' && (landing.gravity
                  ? <p>In <b>{landing.lensName}</b> it's pulled toward <KindMark kind="aspiration" /> <b>{landing.gravity.entry.body}</b> <Sim v={landing.gravity.similarity} /></p>
                  : <p className="muted">In {landing.lensName} it's drifting: no aspiration has this shape yet.</p>)}
                {landing.near.length > 0 && <>
                  <h4>Closest in {landing.lensName}</h4>
                  <ul className="mini">
                    {landing.near.slice(0, 4).map(n => (
                      <li key={n.entry.id}><KindMark kind={n.entry.kind} /><span className="grow">{n.entry.body}</span><Sim v={n.similarity} /></li>
                    ))}
                  </ul>
                </>}
              </>
            )}
            <footer className="modal-foot">
              <button className="link" onClick={() => { onClose(true); open(result.entry.id) }}>Open it</button>
              <button className="primary" onClick={() => onClose(true)}>Done</button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
