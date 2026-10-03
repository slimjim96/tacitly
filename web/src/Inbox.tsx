import { useEffect, useState } from 'react'
import { api, ago, type Entry, type Inbox as InboxData, type Kind } from './api'
import { useApp } from './context'
import { Composer } from './Composer'
import { Icon, Menu, type MenuItem } from './ui'

/** "Today", "Yesterday", or a short date: notes are grouped by the day they were written. */
function dayLabel(iso: string): string {
  const d = new Date(iso), today = new Date()
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(today) - start(d)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() && { year: 'numeric' }) })
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 5 ? 'Still up?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** The front door: the composer, open to-dos, then notes by day. Nothing here is scored. */
export function Inbox({ onTour }: { onTour: () => void }) {
  const { version } = useApp()
  const [data, setData] = useState<InboxData | null>(null)
  const [showDone, setShowDone] = useState(false)
  useEffect(() => { api.inbox().then(setData) }, [version])

  if (!data) return <p className="muted">Loading…</p>

  if (!data.todos.length && !data.notes.length && !data.doneRecently.length)
    return (
      <div className="inbox-empty">
        <h2 className="greeting"><Icon name="sparkle" size={22} className="ok" /> {greeting()}</h2>
        <p className="muted">What's on your mind? Write it down here. Sort it out later, or never.</p>
        <Composer hero />
        <div className="starter-cards">
          <button className="starter" onClick={() => document.getElementById('composer-input')?.focus()}>
            <Icon name="note" /><b>Jot a note</b><span>A thought, a number, a link. Type and press Enter.</span>
          </button>
          <button className="starter" onClick={() => (document.querySelector('[data-guide="composer-todo"]') as HTMLElement | null)?.click()}>
            <Icon name="todo" /><b>Add a to-do</b><span>Switch to To-do and it gets a checkbox.</span>
          </button>
          <button className="starter" onClick={onTour}>
            <Icon name="guide" /><b>Take the tour</b><span>Eleven short quests, one control at a time.</span>
          </button>
        </div>
      </div>
    )

  const days: { label: string; notes: Entry[] }[] = []
  for (const n of data.notes) {
    const label = dayLabel(n.createdAt)
    if (days.at(-1)?.label === label) days.at(-1)!.notes.push(n)
    else days.push({ label, notes: [n] })
  }

  return (
    <div className="inbox">
      <Composer />

      {data.todos.length > 0 && (
        <section>
          <h3 className="section">To do <span className="count">{data.todos.length}</span></h3>
          <ul className="list">{data.todos.map(e => <NoteRow key={e.id} entry={e} />)}</ul>
        </section>
      )}

      {days.map(d => (
        <section key={d.label}>
          <h3 className="section">{d.label}</h3>
          <ul className="list">{d.notes.map(e => <NoteRow key={e.id} entry={e} />)}</ul>
        </section>
      ))}

      {data.doneRecently.length > 0 && (
        <section>
          <button className="disclosure" onClick={() => setShowDone(s => !s)} aria-expanded={showDone}>
            <Icon name="down" size={16} className={showDone ? 'flip' : ''} /> Done in the last day <span className="count">{data.doneRecently.length}</span>
          </button>
          {showDone && <ul className="list">{data.doneRecently.map(e => <NoteRow key={e.id} entry={e} />)}</ul>}
        </section>
      )}
    </div>
  )
}

/** One note or to-do: a checkbox for to-dos, the text (click to open), and a labelled ⋯ menu. */
export function NoteRow({ entry, extra }: { entry: Entry; extra?: React.ReactNode }) {
  const { refresh, open, lenses, toast, emit, go } = useApp()
  const [ticked, setTicked] = useState<boolean | null>(null)   // shown at once; the list reloads after the save
  const [confirming, setConfirming] = useState(false)
  const done = ticked ?? entry.status === 'done'
  const short = entry.body.length > 40 ? entry.body.slice(0, 40) + '…' : entry.body

  const update = (p: Parameters<typeof api.update>[1]) => api.update(entry.id, p).then(refresh)

  async function tick() {
    const now = !done
    setTicked(now)
    try {
      await update({ status: now ? 'done' : 'active' })
      if (now) {
        emit('todo.done')
        toast({ text: `Done: ${short}`, action: { label: 'Undo', run: () => update({ status: 'active' }) } })
      }
    } catch { setTicked(null) }
  }

  async function release() {
    await update({ status: 'released' })
    emit('note.released')
    toast({ text: 'Released. It\'s out of the Inbox but still searchable.', action: { label: 'Undo', run: () => update({ status: 'active' }) } })
  }

  async function promote(kind: Kind, label: string) {
    const wasTodo = entry.isTodo
    await update({ kind })
    emit('note.promoted')
    toast({ text: `Moved to ${label}. Give it a shape when you're ready.`, action: { label: 'Undo', run: () => update({ kind: 'note', isTodo: wasTodo }) } })
    if (lenses.length) open(entry.id)
  }

  async function remove() {
    await api.remove(entry.id)
    refresh()
    toast({ text: 'Deleted.' })
  }

  const items: (MenuItem | 'sep')[] = [
    entry.isTodo
      ? { label: 'Make it a plain note', icon: 'note', run: () => update({ isTodo: false }) }
      : { label: 'Make it a to-do', icon: 'todo', run: () => update({ isTodo: true }) },
    { label: 'Open', icon: 'eye', hint: 'Edit the text, see details', run: () => open(entry.id) },
    'sep',
    ...(lenses.length
      ? [
          { label: 'Make thought', icon: 'thought' as const, hint: 'Move it to the lens views to score', run: () => promote('thought', 'thoughts') },
          { label: 'Make aspiration', icon: 'aspiration' as const, hint: 'Something to become or reach', run: () => promote('aspiration', 'aspirations') },
        ]
      : [{ label: 'Make thought…', icon: 'lenses' as const, hint: 'Set up a lens first', run: () => go('lenses') }]),
    'sep',
    { label: 'Release', icon: 'release', hint: 'Out of the way, not deleted', run: release },
    { label: 'Delete…', icon: 'trash', danger: true, run: () => setConfirming(true) },
  ]

  return (
    <li className={`row note-row ${done ? 'inactive' : ''}`}>
      <div className="row-main">
        {entry.isTodo
          ? <input type="checkbox" className="tick" checked={done} data-guide="todo-check"
              aria-label={done ? `Mark "${short}" not done` : `Mark "${short}" done`} onChange={tick} />
          : <span className="mark note" aria-hidden />}
        <button className="link plain body" onClick={() => open(entry.id)}>{entry.body}</button>
        {!extra && !done && (
          <Menu label={`Actions for "${short}"`} className="row-menu" guide="row-menu" items={items}>
            <Icon name="more" />
          </Menu>
        )}
      </div>
      {confirming ? (
        <div className="row-confirm" role="alert">
          <span>Delete this {entry.isTodo ? 'to-do' : 'note'} for good?</span>
          <button className="danger-btn" onClick={remove}>Delete</button>
          <button className="link" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      ) : (
        <div className="row-meta">
          <span title={new Date(entry.createdAt).toLocaleString()}>{ago(entry.createdAt)}</span>
          {entry.source !== 'app' && <span className="tag">via {entry.source}</span>}
          {extra}
        </div>
      )}
    </li>
  )
}
