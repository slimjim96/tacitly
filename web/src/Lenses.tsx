import { useState } from 'react'
import { api, type Dimension, type Lens } from './api'
import { useApp } from './context'
import { ConfirmButton } from './ui'

/** Design your vector spaces: lenses, their dimensions, poles, weights and order. */
export function Lenses({ onSelect }: { onSelect: (id: string) => void }) {
  const { allLenses: lenses, refresh, emit } = useApp()
  const [name, setName] = useState('')

  async function create() {
    const l = await api.createLens(name.trim())
    emit('lens.created')
    setName('')
    onSelect(l.id)
    refresh()
  }

  return (
    <div className="lenses">
      <p className="muted small">
        Each lens is its own vector space. Dimensions are bipolar axes scored −5 to +5, with 0 as neutral.
        Weight makes an axis count for more when measuring distance; weight 0 means observed only (scored and shown, never measured).
        Wild-card dimensions are offered at random when you capture. Archiving keeps scores but takes the axis out of the vector.
        Every change rebuilds the lens's vectors automatically.
      </p>
      {lenses.map(l => <LensEditor key={l.id} lens={l} />)}
      <div className="card row-gap">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="New lens name (e.g. Body, Craft, Money)"
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) create() }} />
        <button className="primary" disabled={!name.trim()} onClick={create}>Add lens</button>
        {!lenses.some(l => l.name === 'Shadow') && (
          <button className="chip" onClick={() => api.shadow().then(l => { emit('lens.created'); onSelect(l.id); refresh() })}
            title="Avoidance, Residue, Ego, Source, Regret, Reversibility, Decay, Drag: all wild cards, Source and Drag counted">
            + Shadow lens
          </button>
        )}
      </div>
    </div>
  )
}

function LensEditor({ lens }: { lens: Lens }) {
  const { refresh } = useApp()
  const [draft, setDraft] = useState({ name: '', lowLabel: '', highLabel: '', weight: 1 })
  const dims = lens.dimensions.filter(d => !d.archivedAt)
  const archived = lens.dimensions.filter(d => d.archivedAt)

  const save = (patch: Partial<Lens>) => api.updateLens(lens.id, patch).then(refresh)
  async function move(i: number, delta: number) {
    const ids = dims.map(d => d.id)
    const j = i + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    await api.reorder(lens.id, ids)
    refresh()
  }
  async function add() {
    if (!draft.name.trim()) return
    await api.addDimension(lens.id, draft)
    setDraft({ name: '', lowLabel: '', highLabel: '', weight: 1 })
    refresh()
  }
  const remove = () => api.deleteLens(lens.id).then(refresh)

  return (
    <article className="card lens-editor">
      <header className="lens-head">
        <input className="lens-name" defaultValue={lens.name} onBlur={e => e.target.value.trim() && e.target.value !== lens.name && save({ name: e.target.value })} />
        <input className="grow" defaultValue={lens.description} placeholder="What is this lens for?"
          onBlur={e => e.target.value !== lens.description && save({ description: e.target.value })} />
        <ConfirmButton className="link danger small" label="delete lens" question={`Delete “${lens.name}” and every score in it? Entries stay.`} onConfirm={remove} />
      </header>

      <label className="gravity">
        <span>Gravity threshold <b>{lens.gravity.toFixed(2)}</b></span>
        <input type="range" min={0.5} max={0.95} step={0.01} defaultValue={lens.gravity}
          onMouseUp={e => save({ gravity: Number((e.target as HTMLInputElement).value) })}
          onKeyUp={e => save({ gravity: Number((e.target as HTMLInputElement).value) })}
          onTouchEnd={e => save({ gravity: Number((e.target as HTMLInputElement).value) })} />
        <span className="muted tiny">How similar a thought's shape must be to an aspiration's to orbit it. Lower pulls more in.</span>
      </label>

      <table className="dims">
        <thead><tr><th /><th>Dimension</th><th>Low pole (−5)</th><th>High pole (+5)</th><th title="0 = observed only">Weight</th><th title="Offered at random on capture">Wild</th><th /></tr></thead>
        <tbody>
          {dims.map((d, i) => <DimRow key={d.id} d={d} first={i === 0} last={i === dims.length - 1} onMove={delta => move(i, delta)} />)}
          <tr className="new-dim">
            <td />
            <td><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="New dimension" /></td>
            <td><input value={draft.lowLabel} onChange={e => setDraft({ ...draft, lowLabel: e.target.value })} placeholder="e.g. draining" /></td>
            <td><input value={draft.highLabel} onChange={e => setDraft({ ...draft, highLabel: e.target.value })} placeholder="e.g. energising"
              onKeyDown={e => { if (e.key === 'Enter') add() }} /></td>
            <td><input type="number" min={0} max={5} step={0.25} value={draft.weight} onChange={e => setDraft({ ...draft, weight: Number(e.target.value) })} /></td>
            <td />
            <td><button className="chip" disabled={!draft.name.trim()} onClick={add}>Add</button></td>
          </tr>
        </tbody>
      </table>
      {archived.length > 0 && (
        <p className="muted small archived">
          Archived (scores kept, not in the vector):{' '}
          {archived.map(d => (
            <button key={d.id} className="chip" title="Restore" onClick={() => api.updateDimension(d.id, { archived: false }).then(refresh)}>
              {d.name} ↺
            </button>
          ))}
        </p>
      )}
    </article>
  )
}

function DimRow({ d, first, last, onMove }: { d: Dimension; first: boolean; last: boolean; onMove: (delta: number) => void }) {
  const { refresh } = useApp()
  const save = (patch: Partial<Dimension>) => api.updateDimension(d.id, patch).then(refresh)
  const del = () => api.deleteDimension(d.id).then(refresh)
  return (
    <tr>
      <td className="order">
        <button className="link" disabled={first} onClick={() => onMove(-1)} aria-label="Move up">↑</button>
        <button className="link" disabled={last} onClick={() => onMove(1)} aria-label="Move down">↓</button>
      </td>
      <td><input defaultValue={d.name} onBlur={e => e.target.value.trim() && e.target.value !== d.name && save({ name: e.target.value })} /></td>
      <td><input defaultValue={d.lowLabel} onBlur={e => e.target.value !== d.lowLabel && save({ lowLabel: e.target.value })} /></td>
      <td><input defaultValue={d.highLabel} onBlur={e => e.target.value !== d.highLabel && save({ highLabel: e.target.value })} /></td>
      <td><input type="number" min={0} max={5} step={0.25} defaultValue={d.weight}
        onBlur={e => e.target.value !== '' && Number(e.target.value) !== d.weight && Number(e.target.value) >= 0 && save({ weight: Number(e.target.value) })} /></td>
      <td><input type="checkbox" checked={d.wildcard} aria-label="Wild card" onChange={e => save({ wildcard: e.target.checked })} /></td>
      <td className="dim-actions">
        <button className="link" onClick={() => api.updateDimension(d.id, { archived: true }).then(refresh)} title="Keep scores, drop from the vector">archive</button>
        <ConfirmButton label="delete" question={`Delete “${d.name}” and its scores?`} onConfirm={del} />
      </td>
    </tr>
  )
}
