import { createContext, useContext } from 'react'
import type { Lens, Pulse } from './api'

export type Page = 'inbox' | 'review' | 'stream' | 'orbits' | 'map' | 'shape' | 'drift' | 'lenses' | 'connect'
export const PAGES: Page[] = ['inbox', 'review', 'stream', 'orbits', 'map', 'shape', 'drift', 'lenses', 'connect']
/** Pages that look at one lens; with no lens yet they offer to create one. */
export const LENS_PAGES: Page[] = ['orbits', 'map', 'shape', 'drift']

/** Things the guide listens for. Components report what the user just did; quests tick themselves off. */
export type GuideEvent =
  | 'note.created' | 'todo.created' | 'todo.done' | 'note.released' | 'note.promoted'
  | 'entry.scored' | 'aspiration.created' | 'lens.created'
  | 'view.map' | 'view.review' | 'view.connect' | 'claude.marked'

export interface Toast { text: string; action?: { label: string; run: () => void } }

export interface Ctx {
  lenses: Lens[]        // archived dimensions removed
  allLenses: Lens[]     // everything, for the editor
  lens: Lens | null
  setLensId: (id: string) => void
  pulse: Pulse | null
  reviewCount: number
  version: number
  refresh: () => void
  open: (entryId: string) => void
  page: Page
  go: (page: Page) => void
  toast: (t: Toast) => void
  emit: (e: GuideEvent) => void
}

export const AppCtx = createContext<Ctx>(null!)
export const useApp = () => useContext(AppCtx)
