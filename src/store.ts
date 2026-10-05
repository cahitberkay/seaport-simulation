import { create } from 'zustand'
import type { TerminalId } from './sim/world'

export type Selection =
  | { type: 'ship'; id: string }
  | { type: 'container'; id: string }
  | { type: 'crane'; id: string }
  | { type: 'handler'; id: string }
  | { type: 'tug'; id: string }
  | null

export type View = TerminalId | 'BAY'

export type CamCommand =
  | { kind: 'view'; view: View }
  | { kind: 'zoom'; dir: 1 | -1 }
  | { kind: 'rotate'; dir: 1 | -1 }
  | { kind: 'focus'; x: number; z: number; dist?: number }

interface UIState {
  view: View
  selected: Selection
  follow: boolean
  showRoutes: boolean
  tick: number
  camCmd: { cmd: CamCommand; n: number } | null
  bottomTab: 'berths' | 'vessels' | 'equipment'
  panelTab: string
  setView: (v: View) => void
  select: (s: Selection, follow?: boolean) => void
  setFollow: (f: boolean) => void
  setShowRoutes: (v: boolean) => void
  setBottomTab: (t: UIState['bottomTab']) => void
  setPanelTab: (t: string) => void
  bump: () => void
  cam: (cmd: CamCommand) => void
}

let n = 0

export const useUI = create<UIState>((set) => ({
  view: 'TAMT',
  selected: null,
  follow: false,
  showRoutes: true,
  tick: 0,
  camCmd: null,
  bottomTab: 'berths',
  panelTab: 'overview',
  setView: (v) => set({ view: v, selected: null, follow: false, camCmd: { cmd: { kind: 'view', view: v }, n: ++n } }),
  select: (s, follow = false) => set({ selected: s, follow: s ? follow : false, panelTab: 'overview' }),
  setFollow: (f) => set({ follow: f }),
  setShowRoutes: (v) => set({ showRoutes: v }),
  setBottomTab: (t) => set({ bottomTab: t }),
  setPanelTab: (t) => set({ panelTab: t }),
  bump: () => set((s) => ({ tick: s.tick + 1 })),
  cam: (cmd) => set({ camCmd: { cmd, n: ++n } }),
}))
