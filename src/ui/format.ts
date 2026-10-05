import type { Ship } from '../sim/sim'
import { shipProgress } from '../sim/sim'
import { PORTS, isBoxShip } from '../sim/world'

export type Tone = 'green' | 'amber' | 'blue' | 'grey' | 'red' | 'orange'

export function shipStatus(s: Ship): { label: string; tone: Tone; pct?: number } {
  const pct = Math.round(shipProgress(s) * 100)
  switch (s.state) {
    case 'inbound':
      if (s.anchorIdx !== undefined) return { label: 'To anchorage', tone: 'amber' }
      return s.speedCap === 0 ? { label: 'Holding · traffic', tone: 'amber' } : { label: 'Arriving', tone: 'blue' }
    case 'waiting':
      return { label: 'Holding · basin busy', tone: 'amber' }
    case 'anchored':
      return { label: 'At anchor', tone: 'amber' }
    case 'approach':
    case 'berthing':
      return { label: 'Berthing', tone: 'blue' }
    case 'working': {
      if (s.navy) return { label: 'In port', tone: 'grey' }
      if (isBoxShip(s.kind))
        return s.toDischarge.size ? { label: 'Discharging', tone: 'orange', pct } : { label: 'Loading', tone: 'green', pct }
      if (s.kind === 'carcarrier') return { label: 'Discharging vehicles', tone: 'orange', pct }
      if (s.kind === 'bulk') return { label: 'Discharging bulk', tone: 'orange', pct }
      if (s.kind === 'tanker') return { label: 'Discharging crude', tone: 'orange', pct }
      if (s.kind === 'multipurpose') return { label: 'Discharging blades', tone: 'orange', pct }
      return { label: 'Turnaround', tone: 'green', pct }
    }
    case 'ready':
      return s.navy ? { label: 'Preparing to sail', tone: 'blue' } : { label: 'Cargo complete', tone: 'green', pct: 100 }
    case 'unberthing':
      return { label: 'Unberthing', tone: 'blue' }
    default:
      return { label: `Outbound · ${PORTS[s.voyage.next]?.name ?? ''}`, tone: 'grey' }
  }
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
