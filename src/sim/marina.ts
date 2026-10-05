// Yachts moored along the floating docks of San Diego Bay's marinas (docks and marina areas from OpenStreetMap).
import { GEO, pointInRing } from './geo'
import { PORT_ID } from '../ports/registry'

export interface Yacht {
  x: number
  z: number
  heading: number
  length: number // units (1 unit = 2 m)
  beam: number
  kind: 'sail' | 'motor' | 'cat' | 'super'
  marina: number
  dock: string
}

export interface MarinaInfo {
  name: string
  cx: number
  cz: number
  slips: number
  occupied: number
}

function hash(n: number) {
  let h = n | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const MAX_YACHTS = 4200

export const YACHTS: Yacht[] = []
export const MARINAS: MarinaInfo[] = GEO.marinas.map((m) => {
  let cx = 0
  let cz = 0
  for (const [x, z] of m.p) {
    cx += x
    cz += z
  }
  return { name: m.n, cx: cx / m.p.length, cz: cz / m.p.length, slips: 0, occupied: 0 }
})

// marinas OSM tags only through their docks (no basin outline)
const NAMED_BASINS = PORT_ID === 'san-diego' ? [{ name: 'Marriott Marquis San Diego Marina', x: -60, z: -140 }] : []

/** docks are the OSM pier lines inside a marina basin, or explicitly named "… Dock" */
export const DOCKS: { c: [number, number][]; marina: number; name: string }[] = []
;(() => {
  GEO.piers.forEach((p) => {
    if (p.closed || p.c.length < 2) return
    const mid = p.c[Math.floor(p.c.length / 2)]
    let m = GEO.marinas.findIndex((mm) => pointInRing(mid[0], mid[1], mm.p))
    if (m < 0 && /\bdock\b/i.test(p.n ?? '')) {
      const basin = NAMED_BASINS.find((b) => Math.hypot(b.x - mid[0], b.z - mid[1]) < 400)
      if (basin) {
        m = MARINAS.findIndex((x) => x.name === basin.name)
        if (m < 0) {
          MARINAS.push({ name: basin.name, cx: basin.x, cz: basin.z, slips: 0, occupied: 0 })
          m = MARINAS.length - 1
        }
      } else {
        let best = -1
        let bd = 900
        MARINAS.forEach((x, i) => {
          const d = Math.hypot(x.cx - mid[0], x.cz - mid[1])
          if (d < bd) {
            bd = d
            best = i
          }
        })
        m = best
      }
    }
    if (m < 0) return
    DOCKS.push({ c: p.c, marina: m, name: p.n ?? '' })
  })
  let seq = 0
  for (const d of DOCKS) {
    const dockLetter = d.name.match(/^([A-Z])\s/)?.[1] ?? String.fromCharCode(65 + (seq % 12))
    let slip = 1
    for (let i = 0; i < d.c.length - 1; i++) {
      const [ax, az] = d.c[i]
      const [bx, bz] = d.c[i + 1]
      const len = Math.hypot(bx - ax, bz - az)
      if (len < 4) continue
      const ux = (bx - ax) / len
      const uz = (bz - az) / len
      const heading = Math.atan2(ux, uz)
      for (const side of [-1, 1]) {
        let t = 2
        while (t < len - 2 && YACHTS.length < MAX_YACHTS) {
          const r = hash(seq++)
          const big = len > 60 && r > 0.94
          const kind: Yacht['kind'] = big ? 'super' : r < 0.42 ? 'sail' : r < 0.86 ? 'motor' : 'cat'
          const length = big ? 15 + hash(seq * 3) * 14 : kind === 'cat' ? 6 + hash(seq * 5) * 3 : 4.5 + hash(seq * 7) * 6
          const beam = kind === 'cat' ? length * 0.48 : length * (kind === 'super' ? 0.19 : 0.3)
          const occupied = hash(seq * 11) < 0.82
          MARINAS[d.marina].slips++
          if (occupied) {
            const off = 1.1 + beam / 2
            YACHTS.push({
              x: ax + ux * (t + length / 2) - uz * off * side,
              z: az + uz * (t + length / 2) + ux * off * side,
              heading: heading + (hash(seq * 13) < 0.5 ? 0 : Math.PI),
              length,
              beam,
              kind,
              marina: d.marina,
              dock: `${dockLetter}-${String(slip).padStart(2, '0')}`,
            })
            MARINAS[d.marina].occupied++
          }
          slip++
          t += length + 1.4
        }
      }
    }
  }
})()

// ───────── per-yacht details (deterministic)

const N1 = ['Sea', 'Blue', 'Wind', 'Salt', 'Star', 'Coral', 'Pacific', 'Silver', 'Golden', 'Island', 'Ocean', 'Harbor', 'Sunset', 'Moon', 'Kelp', 'Point', 'Wave', 'Lucky']
const N2 = ['Dancer', 'Spirit', 'Whisper', 'Breeze', 'Runner', 'Dream', 'Seeker', 'Horizon', 'Escape', 'Lady', 'Song', 'Chaser', 'Tide', 'Wanderer', 'Grace', 'Time', 'Haven']
const FIRST = ['Michael', 'Jennifer', 'David', 'Sarah', 'Robert', 'Lisa', 'Daniel', 'Maria', 'James', 'Elena', 'Kevin', 'Grace', 'Thomas', 'Nina', 'Carlos', 'Hannah']
const LAST = ['Carter', 'Nguyen', 'Alvarez', 'Brooks', 'Kim', 'Patel', 'Morales', 'Bennett', 'Okafor', 'Larsen', 'Ramirez', 'Fischer', 'Hughes', 'Tanaka', 'Silva', 'Walsh']
const FLAGS = ['United States', 'United States', 'United States', 'Cayman Islands', 'Marshall Islands', 'Mexico', 'Canada', 'British Virgin Islands']
const HOMEPORTS = ['San Diego, CA', 'Newport Beach, CA', 'Marina del Rey, CA', 'Ensenada, MX', 'Cabo San Lucas, MX', 'Seattle, WA', 'Honolulu, HI']

export interface YachtInfo {
  name: string
  type: string
  lengthM: number
  beamM: number
  flag: string
  imo: string
  mmsi: string
  owner: string
  captain: string
  homeport: string
  marina: string
  slip: string
  daysInMarina: number
  arrivedMinAgo: number
  status: string
  builder: string
  year: number
}

export function yachtInfo(i: number): YachtInfo {
  const y = YACHTS[i]
  const r = (k: number) => hash(i * 131 + k)
  const lengthM = Math.round(y.length * 2 * 10) / 10
  const big = lengthM >= 24
  const flag = big ? FLAGS[3 + Math.floor(r(1) * 5)] : FLAGS[Math.floor(r(1) * 4)]
  const ownerName = `${FIRST[Math.floor(r(2) * FIRST.length)]} ${LAST[Math.floor(r(3) * LAST.length)]}`
  const owner = big ? `${LAST[Math.floor(r(3) * LAST.length)]} Marine Holdings LLC` : ownerName
  const captain = big || r(4) < 0.25 ? `Capt. ${FIRST[Math.floor(r(5) * FIRST.length)]} ${LAST[Math.floor(r(6) * LAST.length)]}` : `${ownerName} (owner-operator)`
  const days = Math.floor(r(7) ** 2 * 420) + 1
  const builders = y.kind === 'sail' ? ['Beneteau', 'Jeanneau', 'Catalina', 'Hallberg-Rassy', 'J/Boats'] : y.kind === 'cat' ? ['Lagoon', 'Leopard', 'Fountaine Pajot'] : y.kind === 'super' ? ['Feadship', 'Benetti', 'Lürssen', 'Heesen'] : ['Sea Ray', 'Grand Banks', 'Princess', 'Hatteras', 'Viking']
  return {
    name: `${N1[Math.floor(r(8) * N1.length)]} ${N2[Math.floor(r(9) * N2.length)]}`,
    type: { sail: 'Sailing yacht', motor: 'Motor yacht', cat: 'Catamaran', super: 'Superyacht' }[y.kind],
    lengthM,
    beamM: Math.round(y.beam * 2 * 10) / 10,
    flag,
    // pleasure craft under 24 m generally have no IMO number
    imo: big ? `IMO 10${String(Math.floor(r(10) * 89999) + 10000)}` : 'Not assigned (under 24 m)',
    mmsi: `${flag === 'United States' ? '338' : flag === 'Mexico' ? '345' : flag === 'Canada' ? '316' : '319'}${String(Math.floor(r(11) * 899999) + 100000)}`,
    owner,
    captain,
    homeport: big ? HOMEPORTS[2 + Math.floor(r(12) * 5)] : HOMEPORTS[Math.floor(r(12) * 3)],
    marina: MARINAS[y.marina]?.name ?? 'Marina',
    slip: y.dock,
    daysInMarina: days,
    arrivedMinAgo: days * 1440 - Math.floor(r(13) * 1440),
    status: days > 200 ? 'Annual slip holder' : big ? 'Transient · superyacht berth' : r(14) < 0.3 ? 'Liveaboard' : 'Transient guest',
    builder: builders[Math.floor(r(15) * builders.length)],
    year: 1988 + Math.floor(r(16) * 37),
  }
}
