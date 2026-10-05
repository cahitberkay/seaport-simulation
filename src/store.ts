import { create } from 'zustand'

export type Selection =
  | { type: 'ship'; id: string }
  | { type: 'container'; id: string }
  | { type: 'crane'; id: string }
  | { type: 'rtg'; id: string }
  | { type: 'handler'; id: string }
  | { type: 'tug'; id: string }
  | { type: 'building'; id: string }
  | { type: 'car'; id: string }
  | { type: 'yacht'; id: string }
  | { type: 'place'; id: string }
  | null

export type Tab = 'overview' | 'vessels' | 'yard' | 'shipments' | 'logistics'

export type CamCommand =
  | { kind: 'tab'; tab: Tab }
  | { kind: 'zoom'; dir: 1 | -1 }
  | { kind: 'rotate'; dir: 1 | -1 }
  | { kind: 'focus'; x: number; z: number; dist?: number }

interface UIState {
  tab: Tab
  selected: Selection
  follow: boolean
  showRoutes: boolean
  showLabels: boolean
  showPanels: boolean
  dockOpen: boolean
  night: boolean
  tick: number
  camCmd: { cmd: CamCommand; n: number } | null
  bottomTab: 'berths' | 'vessels' | 'equipment'
  panelTab: string
  setTab: (t: Tab) => void
  select: (s: Selection, follow?: boolean) => void
  setFollow: (f: boolean) => void
  toggle: (k: 'showRoutes' | 'showLabels' | 'showPanels' | 'dockOpen' | 'night') => void
  setBottomTab: (t: UIState['bottomTab']) => void
  setPanelTab: (t: string) => void
  bump: () => void
  cam: (cmd: CamCommand) => void
}

let n = 0

export const useUI = create<UIState>((set) => ({
  tab: 'overview',
  selected: null,
  follow: false,
  showRoutes: true,
  showLabels: true,
  showPanels: true,
  dockOpen: true,
  night: false,
  tick: 0,
  camCmd: null,
  bottomTab: 'berths',
  panelTab: 'overview',
  setTab: (t) => set({ tab: t, selected: null, follow: false, camCmd: { cmd: { kind: 'tab', tab: t }, n: ++n } }),
  select: (s, follow = false) => set({ selected: s, follow: s ? follow : false, panelTab: 'overview' }),
  setFollow: (f) => set({ follow: f }),
  toggle: (k) => set((st) => ({ [k]: !st[k] }) as Partial<UIState>),
  setBottomTab: (t) => set({ bottomTab: t }),
  setPanelTab: (t) => set({ panelTab: t }),
  bump: () => set((s) => ({ tick: s.tick + 1 })),
  cam: (cmd) => set({ camCmd: { cmd, n: ++n } }),
}))
