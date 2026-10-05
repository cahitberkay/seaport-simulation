// Parked cars generated inside OpenStreetMap surface car parks around the waterfront.
import { GEO, pointInRing } from './geo'
import type { GeoParking } from './geo'

export interface Stall {
  x: number
  z: number
  rot: number
  lot: number
  occupied: boolean
  color: number
}

export interface LotInfo {
  idx: number
  name: string
  stalls: number
  occupied: number
  op?: string
  fee?: string
  cx: number
  cz: number
}

// waterfront window: downtown, Barrio Logan, the terminals, the naval base and the Coronado side near the bridge
const inWindow = (x: number, z: number) => x > -1800 && x < 3100 && z > -1500 && z < 3300

function hash(n: number) {
  let h = n | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const MAX_STALLS = 16000

function stallsFor(lot: GeoParking, lotIdx: number, out: Stall[]) {
  const ring = lot.p
  let cx = 0
  let cz = 0
  for (const [x, z] of ring) {
    cx += x
    cz += z
  }
  cx /= ring.length
  cz /= ring.length
  const ca = Math.cos(lot.a)
  const sa = Math.sin(lot.a)
  // extent in the lot's own axes
  let u0 = Infinity
  let u1 = -Infinity
  let v0 = Infinity
  let v1 = -Infinity
  for (const [x, z] of ring) {
    const dx = x - cx
    const dz = z - cz
    const u = dx * ca + dz * sa
    const v = -dx * sa + dz * ca
    u0 = Math.min(u0, u)
    u1 = Math.max(u1, u)
    v0 = Math.min(v0, v)
    v1 = Math.max(v1, v)
  }
  const occ = 0.55 + hash(lotIdx * 7 + 3) * 0.38
  const STALL_W = 1.35
  const ROW = 2.75
  const AISLE = 3.2
  let count = 0
  let v = v0 + 1.6
  let rowInPair = 0
  while (v < v1 - 1.4) {
    for (let u = u0 + 1; u < u1 - 0.8; u += STALL_W) {
      const x = cx + u * ca - v * sa
      const z = cz + u * sa + v * ca
      if (!pointInRing(x, z, ring)) continue
      // keep a little margin from the edge
      if (!pointInRing(x + ca * 0.9, z + sa * 0.9, ring) || !pointInRing(x - ca * 0.9, z - sa * 0.9, ring)) continue
      const id = out.length
      out.push({ x, z, rot: lot.a + Math.PI / 2 + (rowInPair ? Math.PI : 0), lot: lotIdx, occupied: hash(id * 13 + 1) < occ, color: Math.floor(hash(id * 31 + 7) * 8) })
      count++
    }
    v += rowInPair ? ROW + AISLE : ROW
    rowInPair = 1 - rowInPair
  }
  return { count, cx, cz }
}

export const STALLS: Stall[] = []
export const LOTS: LotInfo[] = []
;(() => {
  const lots = GEO.parking
    .map((p, i) => ({ p, i, d: Math.hypot(p.p[0][0] + 200, p.p[0][1] + 300) }))
    .filter(({ p }) => inWindow(p.p[0][0], p.p[0][1]))
    .sort((a, b) => a.d - b.d)
  for (const { p, i } of lots) {
    if (STALLS.length > MAX_STALLS) break
    const before = STALLS.length
    const r = stallsFor(p, LOTS.length, STALLS)
    if (!r.count) continue
    LOTS.push({
      idx: i,
      name: p.n || `Surface lot ${LOTS.length + 1}`,
      stalls: r.count,
      occupied: STALLS.slice(before).filter((s) => s.occupied).length,
      op: p.op,
      fee: p.fee,
      cx: r.cx,
      cz: r.cz,
    })
  }
})()

// ───────── per-car details (deterministic from the stall index)

const MAKES: [string, string[]][] = [
  ['Toyota', ['Camry', 'RAV4', 'Corolla', 'Tacoma', 'Prius', 'Highlander']],
  ['Honda', ['Civic', 'Accord', 'CR-V', 'Pilot']],
  ['Tesla', ['Model 3', 'Model Y', 'Model S']],
  ['Ford', ['F-150', 'Mustang Mach-E', 'Explorer', 'Bronco']],
  ['Chevrolet', ['Silverado', 'Equinox', 'Bolt EV', 'Malibu']],
  ['Hyundai', ['Elantra', 'Tucson', 'Ioniq 5']],
  ['Kia', ['Sportage', 'Telluride', 'EV6']],
  ['BMW', ['3 Series', 'X5', 'i4']],
  ['Mercedes-Benz', ['C-Class', 'GLE', 'EQE']],
  ['Subaru', ['Outback', 'Forester', 'Crosstrek']],
  ['Nissan', ['Altima', 'Rogue', 'Leaf']],
  ['Jeep', ['Wrangler', 'Grand Cherokee']],
  ['Volkswagen', ['Jetta', 'ID.4', 'Tiguan']],
  ['Lexus', ['RX', 'ES']],
]
export const CAR_COLORS = ['#f4f5f8', '#c9ced8', '#2d3343', '#d94a3d', '#2f6bed', '#8b93a7', '#1e3a8a', '#e8e1d0']
export const CAR_COLOR_NAMES = ['White', 'Silver', 'Black', 'Red', 'Blue', 'Gray', 'Navy', 'Beige']
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ'

export interface CarInfo {
  plate: string
  state: string
  make: string
  model: string
  year: number
  color: string
  ev: boolean
  lot: string
  stall: string
  enteredMin: number // sim minutes relative to midnight
  rate: number
  paid: string
}

export function carInfo(index: number, now: number): CarInfo {
  const s = STALLS[index]
  const r = (k: number) => hash(index * 97 + k)
  const [make, models] = MAKES[Math.floor(r(1) * MAKES.length)]
  const model = models[Math.floor(r(2) * models.length)]
  const oos = r(3) < 0.12
  const plate = oos
    ? `${LETTERS[Math.floor(r(4) * 23)]}${LETTERS[Math.floor(r(5) * 23)]}${LETTERS[Math.floor(r(6) * 23)]}-${Math.floor(r(7) * 9000 + 1000)}`
    : `${Math.floor(r(4) * 9) + 1}${LETTERS[Math.floor(r(5) * 23)]}${LETTERS[Math.floor(r(6) * 23)]}${LETTERS[Math.floor(r(7) * 23)]}${String(Math.floor(r(8) * 1000)).padStart(3, '0')}`
  const lot = LOTS[s.lot]
  const hoursAgo = 0.3 + r(9) ** 1.6 * 30
  const ev = ['Tesla'].includes(make) || /EV|Leaf|Ioniq|ID\.4|i4|EQE|Mach-E/.test(model)
  return {
    plate,
    state: oos ? (['Arizona', 'Nevada', 'Baja California'] as const)[Math.floor(r(10) * 3)] : 'California',
    make,
    model,
    year: 2014 + Math.floor(r(11) * 12),
    color: CAR_COLOR_NAMES[s.color],
    ev,
    lot: lot?.name ?? 'Surface lot',
    stall: `${String.fromCharCode(65 + Math.floor(r(12) * 8))}-${String(Math.floor(r(13) * 180) + 1).padStart(3, '0')}`,
    enteredMin: now - hoursAgo * 60,
    rate: lot?.fee === 'no' ? 0 : [3, 4, 5, 6][Math.floor(r(14) * 4)],
    paid: r(15) < 0.7 ? 'Paid · ParkMobile' : r(15) < 0.9 ? 'Pay on exit' : 'Monthly permit',
  }
}
