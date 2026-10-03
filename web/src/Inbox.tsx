import { useEffect, useState } from 'react'
import { api, ago, type Entry, type Inbox as InboxData, type Kind } from './api'
import { useApp } from './App'

/** "Today", "Yesterday", or a short date: notes are grouped by the day they were written. */
function dayLabel(iso: string): string {
  const d = new Date(iso), today = new Date()
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(today) - start(d)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() && { year: 'numeric' }) })
}

/** The front door: open to-dos first, then notes by day, newest first. Nothing here is scored. */
export function Inbox() {
  const { version } = useApp()
  const [data, setData] = useState<InboxData | null>(null)
  const [showDone, setShowDone] = useState(false)
  useEffect(() => { api.inbox().then(setData) }, [version])

  if (!data) return <p className="muted">Loading…</p>
  if (!data.todos.length && !data.notes.length && !data.doneRecently.length)
    return <p className="empty">Nothing yet. Type a line above and press Enter. Start it with <code>[]</code> to make it a to-do.</p>

  const days: { label: string; notes: Entry[] }[] = []
  for (const n of data.notes) {
    const label = dayLabel(n.createdAt)
    if (days.at(-1)?.label === label) days.at(-1)!.notes.push(n)
    else days.push({ label, notes: [n] })
  }

  return (
    <div className="inbox">
      {data.todos.length > 0 && (
        <>
          <h3 className="section">To do <span className="muted">{data.todos.length}</span></h3>
          <ul className="list">{data.todos.map(e => <NoteRow key={e.id} entry={e} />)}</ul>
        </>
      )}

      {days.map(d => (
        <section key={d.label}>
          <h3 className="section">{d.label}</h3>
          <ul className="list">{d.notes.map(e => <NoteRow key={e.id} entry={e} />)}</ul>
        </section>
      ))}

      {data.doneRecently.length > 0 && (
        <>
          <button className="link small done-toggle" onClick={() => setShowDone(s => !s)} aria-expanded={showDone}>
            {showDone ? 'Hide' : 'Show'} {data.doneRecently.length} done in the last day
          </button>
          {showDone && <ul className="list">{data.doneRecently.map(e => <NoteRow key={e.id} entry={e} />)}</ul>}
        </>
      )}
    </div>
  )
}

/** One note or to-do. "Make it more" promotes it into the lens views, then opens it for scoring. */
export function NoteRow({ entry, extra }: { entry: Entry; extra?: React.ReactNode }) {
  const { refresh, open, lenses } = useApp()
  const [ticked, setTicked] = useState<boolean | null>(null)   // shown at once; the list reloads after the save
  const done = ticked ?? entry.status === 'done'
  const patch = (p: Parameters<typeof api.update>[1]) => api.update(entry.id, p).then(refresh)
  const promote = async (kind: Kind) => {
    await api.update(entry.id, { kind })
    refresh()
    if (lenses.length) open(entry.id)
  }

  return (
    <li className={`row note-row ${done ? 'inactive' : ''}`}>
      <div className="row-main">
        {entry.isTodo
          ? <input type="checkbox" className="tick" checked={done} aria-label={done ? 'Mark not done' : 'Mark done'}
              onChange={() => { setTicked(!done); patch({ status: done ? 'active' : 'done' }).catch(() => setTicked(null)) }} />
          : <span className="mark note" aria-hidden />}
        <button className="link plain body" onClick={() => open(entry.id)}>{entry.body}</button>
      </div>
      <div className="row-meta">
        <span title={new Date(entry.createdAt).toLocaleString()}>{ago(entry.createdAt)}</span>
        {entry.source !== 'app' && <span className="tag">via {entry.source}</span>}
        {extra ?? (!done && (
          <span className="note-actions">
            <button className="link" onClick={() => patch({ isTodo: !entry.isTodo })}>{entry.isTodo ? 'not a to-do' : 'to-do'}</button>
            <button className="link" onClick={() => promote('thought')} title="Move it into the lens views, ready to score">make thought</button>
            <button className="link" onClick={() => promote('aspiration')} title="Move it into the lens views, ready to score">make aspiration</button>
            <button className="link" onClick={() => patch({ status: 'released' })}>release</button>
          </span>
        ))}
      </div>
    </li>
  )
}
