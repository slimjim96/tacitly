import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Toast } from './context'

// ---- icons: inline SVG, stroke = currentColor, no dependency -----------------------------------------------

const P: Record<string, ReactNode> = {
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
  review: <><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" /><path d="M21 3v5h-5" /></>,
  stream: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  orbits: <><circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-25 12 12)" /></>,
  map: <><path d="M3 3v18h18" /><circle cx="9" cy="14" r="1.5" /><circle cx="14" cy="9" r="1.5" /><circle cx="18" cy="15" r="1.5" /></>,
  shape: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1.5 14h5M9.5 8h5M17.5 16h5" />,
  drift: <><path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2" /><path d="M9.6 4.6A2 2 0 1 1 11 8H2" /><path d="M12.6 19.4A2 2 0 1 0 14 16H2" /></>,
  lenses: <><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></>,
  connect: <><path d="M12 22v-5M9 8V2M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z" /></>,
  guide: <><path d="M4 22V4" /><path d="M4 4h13l-2.5 4L17 12H4" /></>,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  send: <path d="M12 19V5M5 12l7-7 7 7" />,
  check: <path d="M20 6 9 17l-5-5" />,
  note: <path d="M4 7h16M4 12h16M4 17h10" />,
  todo: <><path d="m9 11 3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  thought: <><circle cx="12" cy="12" r="4" /></>,
  aspiration: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
  pattern: <path d="m12 3 9 9-9 9-9-9z" />,
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  trash: <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>,
  release: <><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" /></>,
  down: <path d="m6 9 6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
}
export type IconName = keyof typeof P

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {P[name]}
    </svg>
  )
}

// ---- menu: a labelled button that opens a list of actions --------------------------------------------------

export interface MenuItem { label: string; icon?: IconName; run: () => void; danger?: boolean; hint?: string }

export function Menu({ label, children, items, className = '', guide }: {
  label: string; children: ReactNode; items: (MenuItem | 'sep')[]; className?: string; guide?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    root.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus()
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); root.current?.querySelector<HTMLButtonElement>('.menu-trigger')?.focus() }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const all = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? [])]
    const i = all.indexOf(document.activeElement as HTMLButtonElement)
    all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus()
  }

  return (
    <div className={`menu ${className}`} ref={root} onKeyDown={onKey}>
      <button className="menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label}
        data-guide={guide} onClick={() => setOpen(o => !o)}>
        {children}
      </button>
      {open && (
        <div className="menu-pop" role="menu" aria-label={label}>
          {items.map((it, i) => it === 'sep'
            ? <hr key={i} />
            : (
              <button key={it.label} role="menuitem" className={it.danger ? 'danger' : ''}
                onClick={() => { setOpen(false); it.run() }}>
                {it.icon && <Icon name={it.icon} size={16} />}
                <span className="menu-label">{it.label}{it.hint && <small>{it.hint}</small>}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

// ---- segmented switch ------------------------------------------------------------------------------------

export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; label: string
  options: { value: T; label: string; icon?: IconName; guide?: string; title?: string }[]
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''}
          data-guide={o.guide} title={o.title} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={16} />}{o.label}
        </button>
      ))}
    </div>
  )
}

// ---- toasts: what just happened, with undo ------------------------------------------------------------------

export interface LiveToast extends Toast { id: number }

export function Toasts({ items, dismiss }: { items: LiveToast[]; dismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.action && <button className="toast-action" onClick={() => { t.action!.run(); dismiss(t.id) }}>{t.action.label}</button>}
          <button className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}><Icon name="x" size={14} /></button>
        </div>
      ))}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) { return <kbd className="kbd">{children}</kbd> }

/** A delete link that asks once, inline: no browser dialog. */
export function ConfirmButton({ label, question, confirmLabel = 'Delete', onConfirm, className = 'link danger' }: {
  label: string; question: string; confirmLabel?: string; onConfirm: () => void; className?: string
}) {
  const [asking, setAsking] = useState(false)
  if (!asking) return <button className={className} onClick={() => setAsking(true)}>{label}</button>
  return (
    <span className="row-confirm" role="alert">
      <span>{question}</span>
      <button className="danger-btn" onClick={() => { setAsking(false); onConfirm() }}>{confirmLabel}</button>
      <button className="link" onClick={() => setAsking(false)}>Cancel</button>
    </span>
  )
}
