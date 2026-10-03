export type Kind = 'note' | 'thought' | 'aspiration' | 'pattern'
export type Status = 'active' | 'done' | 'released'
export type Scores = Record<string, number>          // dimensionId -> -5..5 (absent = unscored)
export type ScorePatch = Record<string, number | null> // null clears

export interface Dimension { id: string; lensId: string; name: string; lowLabel: string; highLabel: string; weight: number; position: number; wildcard: boolean; archivedAt: string | null }
export interface Lens { id: string; name: string; description: string; gravity: number; createdAt: string; dimensions: Dimension[] }

export interface Entry {
  id: string; kind: Kind; body: string; status: Status
  createdAt: string; touchedAt: string; weight: number; salience: number; source: string
  scores: Scores
  isTodo: boolean
}
export interface Scored { entry: Entry; similarity: number }
export interface Landing { lensId: string; lensName: string; gravity: Scored | null; near: Scored[] }
export interface HistoryItem { dimensionId: string; scorer: string; value: number | null; at: string }
export interface EntryDetail { entry: Entry; lenses: Landing[]; perspectives: Record<string, Scores>; history: HistoryItem[] }
export interface Orbit {
  aspiration: Entry; orbitCount: number; last30Days: number; weekly: number[]; lastPull: string | null; thoughts: Scored[]
  revealed: Scores | null; statedVsRevealed: number | null; gapNote: string | null
}
export interface Drift { drifting: Scored[]; unscored: Entry[] }
export interface Theme { id: number; label: string; size: number; centroid: Scores; members: Entry[] }
export interface MapPoint {
  id: string; kind: Kind; status: Status; body: string; salience: number
  scores: Scores; pcx: number; pcy: number; theme: number | null; orbits: string | null; was: Scores | null
}
export interface LensMap { lens: Lens; points: MapPoint[]; themes: Theme[] }
export interface Inbox { todos: Entry[]; notes: Entry[]; doneRecently: Entry[] }
export interface Pulse { notes: number; todos: number; thoughts: number; aspirations: number; patterns: number; lenses: number; dimensions: number; scores: number; unscored: number }

const TOKEN_KEY = 'tacitly.token'
const token = () => { try { return localStorage.getItem(TOKEN_KEY) ?? '' } catch { return '' } }

async function call<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'X-Tacitly-Token': token() },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 401 && !retried) {
    const t = window.prompt('Access token')
    if (t) {
      try { localStorage.setItem(TOKEN_KEY, t) } catch { /* private mode */ }
      return call<T>(method, path, body, true)
    }
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try { msg = (await res.json()).error ?? msg } catch { /* not json */ }
    throw new Error(msg)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export const api = {
  pulse: () => call<Pulse>('GET', '/pulse'),

  lenses: () => call<Lens[]>('GET', '/lenses'),
  starter: () => call<Lens[]>('POST', '/lenses/starter'),
  shadow: () => call<Lens>('POST', '/lenses/starter/shadow'),
  createLens: (name: string, description = '') => call<Lens>('POST', '/lenses', { name, description }),
  updateLens: (id: string, patch: Partial<Pick<Lens, 'name' | 'description' | 'gravity'>>) => call<Lens>('PATCH', `/lenses/${id}`, patch),
  deleteLens: (id: string) => call<void>('DELETE', `/lenses/${id}`),
  addDimension: (lensId: string, d: Partial<Dimension>) => call<Dimension>('POST', `/lenses/${lensId}/dimensions`, d),
  updateDimension: (id: string, d: Partial<Dimension> & { archived?: boolean }) => call<Dimension>('PATCH', `/dimensions/${id}`, d),
  deleteDimension: (id: string) => call<void>('DELETE', `/dimensions/${id}`),
  reorder: (lensId: string, dimensionIds: string[]) => call<Lens>('PUT', `/lenses/${lensId}/order`, { dimensionIds }),

  // Quick capture: a note, or a to-do. A leading "[]" also makes a to-do.
  note: (body: string, todo = false) => call<EntryDetail>('POST', '/entries', { body, todo }),
  inbox: () => call<Inbox>('GET', '/inbox'),
  capture: (kind: Kind, body: string, scores: ScorePatch) => call<EntryDetail>('POST', '/entries', { kind, body, scores }),
  entries: (q: { kind?: Kind; q?: string; limit?: number } = {}) => {
    const p = new URLSearchParams({ limit: String(q.limit ?? 200) })
    if (q.kind) p.set('kind', q.kind)
    if (q.q) p.set('q', q.q)
    return call<Entry[]>('GET', `/entries?${p}`)
  },
  detail: (id: string) => call<EntryDetail>('GET', `/entries/${id}`),
  update: (id: string, patch: Partial<Pick<Entry, 'body' | 'status' | 'kind' | 'isTodo'>>) => call<Entry>('PATCH', `/entries/${id}`, patch),
  remove: (id: string) => call<void>('DELETE', `/entries/${id}`),
  score: (id: string, values: ScorePatch, scorer = 'me') =>
    call<EntryDetail>('PUT', `/entries/${id}/scores${scorer === 'me' ? '' : `?scorer=${encodeURIComponent(scorer)}`}`, values),
  scorers: () => call<string[]>('GET', '/scorers'),
  review: () => call<Entry[]>('GET', '/review'),
  affirm: (id: string) => call<void>('POST', `/entries/${id}/affirm`),

  match: (lensId: string, values: Scores, kind?: Kind, k = 12) => call<Scored[]>('POST', `/lenses/${lensId}/match`, { values, kind, k }),
  orbits: (lensId: string) => call<Orbit[]>('GET', `/lenses/${lensId}/orbits`),
  drift: (lensId: string) => call<Drift>('GET', `/lenses/${lensId}/drift`),
  map: (lensId: string) => call<LensMap>('GET', `/lenses/${lensId}/map`),
}

export function ago(iso: string | null): string {
  if (!iso) return 'never'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  const d = Math.floor(s / 86400)
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export const scoredIn = (e: { scores: Scores }, lens: Lens) => lens.dimensions.filter(d => d.id in e.scores).length

/** The lens as the rest of the UI sees it: archived dimensions removed. */
export const activeLens = (l: Lens): Lens => ({ ...l, dimensions: l.dimensions.filter(d => !d.archivedAt) })
