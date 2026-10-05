// San Diego Bay at true scale (1 unit = 2 m), projected from OpenStreetMap around downtown.
// +x = east, +z = south (north is -z). Land/coastline comes from geo.ts.

import type { Waypoint } from './path'
import { GEO } from './geo'

export const LAND_Y = 2

// ───────── ship classes

export type ShipKind =
  | 'container' | 'feeder' | 'carcarrier' | 'bulk' | 'multipurpose' | 'cruise'
  | 'destroyer' | 'cruiser' | 'amphib' | 'carrier'
export type TerminalId = 'TAMT' | 'NCMT' | 'CRUISE' | 'NAVY' | 'NASNI'

export interface ShipClass {
  kind: ShipKind
  label: string
  length: number
  beam: number
  draft: number
  freeboard: number
  speedKn: number
  bays?: number
  rows?: number
  tiers?: number
  gt: [number, number]
  navy?: boolean
}

export const SHIP_CLASSES: Record<ShipKind, ShipClass> = {
  container: { kind: 'container', label: 'Container ship', length: 92, beam: 15, draft: 11.2, freeboard: 4.5, speedKn: 18, bays: 9, rows: 11, tiers: 3, gt: [24000, 28500] },
  feeder: { kind: 'feeder', label: 'Reefer feeder', length: 70, beam: 11.5, draft: 8.6, freeboard: 3.8, speedKn: 16, bays: 6, rows: 8, tiers: 3, gt: [9800, 12500] },
  carcarrier: { kind: 'carcarrier', label: 'Car carrier (PCTC)', length: 100, beam: 16, draft: 9.5, freeboard: 15, speedKn: 19, gt: [58000, 71000] },
  bulk: { kind: 'bulk', label: 'Bulk carrier', length: 90, beam: 15, draft: 10.4, freeboard: 4, speedKn: 13, gt: [21000, 25000] },
  multipurpose: { kind: 'multipurpose', label: 'Multipurpose / heavy-lift', length: 74, beam: 12, draft: 8.1, freeboard: 4, speedKn: 14, gt: [9600, 13000] },
  cruise: { kind: 'cruise', label: 'Cruise ship', length: 145, beam: 18, draft: 8.3, freeboard: 6, speedKn: 20, gt: [90000, 140000] },
  destroyer: { kind: 'destroyer', label: 'Guided-missile destroyer', length: 77, beam: 10, draft: 9.4, freeboard: 4, speedKn: 30, gt: [9000, 9700], navy: true },
  cruiser: { kind: 'cruiser', label: 'Guided-missile cruiser', length: 86, beam: 8.5, draft: 10.2, freeboard: 4, speedKn: 32, gt: [9600, 9800], navy: true },
  amphib: { kind: 'amphib', label: 'Amphibious assault ship', length: 128, beam: 16, draft: 8.1, freeboard: 13, speedKn: 22, gt: [40000, 45000], navy: true },
  carrier: { kind: 'carrier', label: 'Nuclear aircraft carrier', length: 166, beam: 20, draft: 11.3, freeboard: 15, speedKn: 30, gt: [100000, 104000], navy: true },
}

// ───────── local frames (terminals laid out along a straight quay)

export interface Frame {
  ox: number
  oz: number
  ux: number
  uz: number
  rot: number // three.js rotation.y mapping local +x to (ux, uz)
}
function frame(ax: number, az: number, bx: number, bz: number): Frame {
  const len = Math.hypot(bx - ax, bz - az)
  const ux = (bx - ax) / len
  const uz = (bz - az) / len
  return { ox: (ax + bx) / 2, oz: (az + bz) / 2, ux, uz, rot: Math.atan2(-uz, ux) }
}
/** local +x along the quay, local +z towards the water */
export const toWorldF = (f: Frame, lx: number, lz: number) => ({
  x: f.ox + f.ux * lx - f.uz * lz,
  z: f.oz + f.uz * lx + f.ux * lz,
})
export const toLocalF = (f: Frame, x: number, z: number) => {
  const dx = x - f.ox
  const dz = z - f.oz
  return { x: dx * f.ux + dz * f.uz, z: -dx * f.uz + dz * f.ux }
}
export const headingF = (f: Frame, localHeading: number) => localHeading + f.rot

export const TAMT_FRAME = frame(174, 235, 478, 482) // SW-facing quay, 783 m
export const NCMT_FRAME = frame(1990, 2662, 2052, 2964) // W-facing quay, 616 m

// ───────── shipping channel (centreline fitted to the OSM coastline) and two lanes

export const CHANNEL: [number, number][] = [
  [-3150, 5200], [-2900, 3200], [-2940, 1760], [-2970, 1540], [-2990, 1040], [-2980, 360], [-2970, -20], [-2500, -500],
  [-2130, -760], [-1200, -780], [-790, -780], [-700, -190], [-490, -40], [140, 430], [320, 700], [420, 800], [580, 840],
  [860, 1040], [1160, 1390], [1510, 1840], [1710, 2340], [1760, 2550],
]
const LANE = 34

function laneAt(i: number, side: 1 | -1): { x: number; z: number } {
  const a = CHANNEL[Math.max(0, i - 1)]
  const b = CHANNEL[Math.min(CHANNEL.length - 1, i + 1)]
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l = Math.hypot(dx, dz) || 1
  // right-hand side when travelling inbound (sea → head of bay)
  return { x: CHANNEL[i][0] + (-dz / l) * LANE * side, z: CHANNEL[i][1] + (dx / l) * LANE * side }
}
export const inboundLane = (from: number, to: number): Waypoint[] => {
  const out: Waypoint[] = []
  for (let i = from; i <= to; i++) out.push(laneAt(i, 1))
  return out
}
export const outboundLane = (from: number, to: number): Waypoint[] => {
  const out: Waypoint[] = []
  for (let i = from; i >= to; i--) out.push(laneAt(i, -1))
  return out
}
export const SEA_SPAWN = { x: -3150, z: 5400 }

/** channel node to join when heading out from (x, z): the nearest one that lies ahead in the outbound direction */
export function outboundEntry(x: number, z: number, maxIdx: number) {
  let k = 1
  let best = Infinity
  for (let i = 1; i <= maxIdx; i++) {
    const d = Math.hypot(CHANNEL[i][0] - x, CHANNEL[i][1] - z)
    if (d < best) {
      best = d
      k = i
    }
  }
  if (k > 1) {
    const dx = CHANNEL[k - 1][0] - CHANNEL[k][0]
    const dz = CHANNEL[k - 1][1] - CHANNEL[k][1]
    if ((CHANNEL[k][0] - x) * dx + (CHANNEL[k][1] - z) * dz < 0) k--
  }
  return k
}

/** offshore anchorage field east of the approach lane (open water south of Coronado); aisles run west of each column */
export const anchorage = (i: number) => ({ x: -2350 + (i % 4) * 420, z: 3350 + Math.floor(i / 4) * 420 })
export const ANCHORAGES = [anchorage(0), anchorage(1), anchorage(2), anchorage(3)]
export const anchorageIn = (i: number, from: { x: number; z: number }): Waypoint[] => {
  const a = anchorage(i)
  const south = Math.max(from.z, a.z + 700)
  return [{ x: (from.x + a.x - 210) / 2, z: south }, { x: a.x - 210, z: south }, { x: a.x - 210, z: a.z + 60 }, a]
}
export const anchorageOut = (i: number): Waypoint[] => {
  const a = anchorage(i)
  return [{ x: a.x - 210, z: a.z - 40 }, { x: a.x - 210, z: 3000 }, { x: -2700, z: 2500 }]
}

/** manoeuvring basins: while a ship berths or unberths here, through traffic holds outside */
export const ZONES: Partial<Record<TerminalId, { x: number; z: number; r: number }>> = {
  CRUISE: { x: -690, z: -650, r: 250 },
  TAMT: { x: 348, z: 570, r: 270 },
  NAVY: { x: 1560, z: 1470, r: 320 },
  NCMT: { x: 1840, z: 2700, r: 260 },
}

// ───────── berths

export interface Berth {
  id: string
  terminal: TerminalId
  label: string
  kinds: ShipKind[]
  cranes: boolean
  junction: number // channel node where the ship leaves / rejoins the lanes
  /** where the hull sits for a given beam, and its heading */
  pose: (beam: number, length: number) => { x: number; z: number; heading: number }
  arrival: (beam: number, length: number) => Waypoint[]
  departure: (beam: number, length: number) => Waypoint[]
}

const TAMT_SLOTS = [-147, -49, 49, 147]
function tamtBerth(i: number, kinds: ShipKind[], cranes: boolean): Berth {
  const bx = TAMT_SLOTS[i]
  const W = (lx: number, lz: number, extra: Partial<Waypoint> = {}) => ({ ...toWorldF(TAMT_FRAME, lx, lz), ...extra })
  return {
    id: `B${i + 1}`,
    terminal: 'TAMT',
    label: `Berth ${i + 1}`,
    kinds,
    cranes,
    junction: 14,
    pose: (beam) => ({ ...toWorldF(TAMT_FRAME, bx, 2.5 + beam / 2), heading: headingF(TAMT_FRAME, -Math.PI / 2) }),
    // past the berth, swing round in the basin off Barrio Logan, come back bow-north-west, tugs push alongside
    arrival: (beam) => [W(bx + 150, 250), W(bx + 215, 170), W(bx + 175, 75), W(bx + 70, 36), W(bx + 10, 32), W(bx, 2.5 + beam / 2, { hold: true })],
    departure: (beam) => [W(bx, 2.5 + beam / 2 + 30, { hold: true }), W(bx - 90, 48), W(bx - 170, 120)],
  }
}

function ncmtBerth(i: number): Berth {
  const bx = i === 0 ? -77 : 77
  const W = (lx: number, lz: number, extra: Partial<Waypoint> = {}) => ({ ...toWorldF(NCMT_FRAME, lx, lz), ...extra })
  return {
    id: `N${i + 1}`,
    terminal: 'NCMT',
    label: `Berth ${i + 1}`,
    kinds: ['carcarrier'],
    cranes: false,
    junction: 21,
    pose: (beam) => ({ ...toWorldF(NCMT_FRAME, bx, 2.5 + beam / 2), heading: headingF(NCMT_FRAME, Math.PI / 2) }),
    arrival: (beam) => [W(bx - 200, 70), W(bx - 70, 34), W(bx - 10, 32), W(bx, 2.5 + beam / 2, { hold: true })],
    departure: (beam) => [W(bx, 2.5 + beam / 2 + 32, { hold: true }), W(bx + 120, 70), W(bx + 190, 190), W(bx + 110, 300), W(bx - 70, 300), W(bx - 260, 210)],
  }
}

/** a ship moored along a finger pier (cruise piers, naval piers): bow in, backs out with tugs */
function slipBerth(
  id: string,
  terminal: TerminalId,
  label: string,
  kinds: ShipKind[],
  root: [number, number],
  tip: [number, number],
  side: 1 | -1,
  halfWidth: number,
  junction: number,
  turn: (sx: number, sz: number) => Waypoint[],
  overhang = 0,
): Berth {
  const L = Math.hypot(tip[0] - root[0], tip[1] - root[1])
  const sx = (tip[0] - root[0]) / L // towards the sea
  const sz = (tip[1] - root[1]) / L
  const px = -sz * side
  const pz = sx * side
  const heading = Math.atan2(-sx, -sz) // bow towards the shore
  const centre = (beam: number, length: number) => {
    const along = Math.max(length / 2 + 4, L - length / 2 - 2) + overhang
    const off = halfWidth + beam / 2 + 1.5
    return { x: root[0] + sx * along + px * off, z: root[1] + sz * along + pz * off }
  }
  return {
    id,
    terminal,
    label,
    kinds,
    cranes: false,
    junction,
    pose: (beam, length) => ({ ...centre(beam, length), heading }),
    arrival: (beam, length) => {
      const c = centre(beam, length)
      return [{ x: c.x + sx * (length + 120), z: c.z + sz * (length + 120) }, { x: c.x + sx * (length * 0.6), z: c.z + sz * (length * 0.6) }, c]
    },
    departure: (beam, length) => {
      const c = centre(beam, length)
      const out = { x: c.x + sx * (length + 70), z: c.z + sz * (length + 70), rev: true }
      return [out, ...turn(out.x, out.z)]
    },
  }
}

const pierByName = (n: string) => GEO.piers.find((p) => p.n === n)

/** naval finger piers come from OSM lines – normalise to shore → sea */
function navalPier(name: string): { root: [number, number]; tip: [number, number] } | null {
  const p = pierByName(name)
  if (!p) return null
  const a = p.c[0]
  const b = p.c[p.c.length - 1]
  // the base sits along the east shore, so the shore end is the eastern one
  return a[0] > b[0] ? { root: a, tip: b } : { root: b, tip: a }
}

// cruise ships back out to the east side of the channel and turn north into the outbound lane
const downtownTurn = (x: number, z: number): Waypoint[] => [{ x: x - 25, z: z - 55 }, { x: -712, z: Math.min(z - 120, -760) }]
const navyTurn = (x: number, z: number): Waypoint[] => [{ x: x - 80, z: z + 40 }]

export const BERTHS: Berth[] = [
  tamtBerth(0, ['bulk', 'multipurpose'], false),
  tamtBerth(1, ['container'], true),
  tamtBerth(2, ['container', 'feeder'], true),
  tamtBerth(3, ['feeder', 'container'], true),
  ncmtBerth(0),
  ncmtBerth(1),
  slipBerth('C1', 'CRUISE', 'B Street Pier · North', ['cruise'], [-396, -717.5], [-547, -717.5], 1, 0, 9, downtownTurn),
  slipBerth('C2', 'CRUISE', 'B Street Pier · South', ['cruise'], [-396, -657], [-547, -657], -1, 0, 9, downtownTurn),
  slipBerth('C3', 'CRUISE', 'Broadway Pier · South', ['cruise'], [-396, -582.5], [-549, -582.5], -1, 1, 9, downtownTurn, 30),
]

// naval moorings at Naval Base San Diego (32nd Street)
// (Pier 2 and the north face of Pier 7 run into charted obstructions in the coastline data)
const NAVY_PIERS = ['Pier 3', 'Pier 4', 'Pier 5', 'Pier 6', 'Pier 7']
NAVY_PIERS.forEach((name, k) => {
  const p = navalPier(name)
  if (!p) return
  for (const side of [1, -1] as const) {
    if (name === 'Pier 7' && side === 1) continue
    const kinds: ShipKind[] = name === 'Pier 7' ? ['amphib'] : k % 2 ? ['cruiser', 'destroyer'] : ['destroyer']
    const no = name.split(' ')[1]
    BERTHS.push(slipBerth(`NB${no}${side > 0 ? 'N' : 'S'}`, 'NAVY', `${name} · ${side > 0 ? 'North' : 'South'}`, kinds, p.root, p.tip, side, 6, k < 2 ? 18 : 19, navyTurn))
  }
})

export const berthById = (id: string) => BERTHS.find((b) => b.id === id)!

// carrier pier at Naval Air Station North Island (static)
export const CARRIER_POSE = (() => {
  const a = [-1239, -496]
  const b = [-1077, -380]
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  const ux = (b[0] - a[0]) / L
  const uz = (b[1] - a[1]) / L
  const nx = uz
  const nz = -ux
  const off = 10 + 4
  return { x: (a[0] + b[0]) / 2 + nx * off, z: (a[1] + b[1]) / 2 + nz * off, heading: Math.atan2(ux, uz) }
})()

BERTHS.push({
  id: 'NI1',
  terminal: 'NASNI',
  label: 'Carrier Pier',
  kinds: ['carrier'],
  cranes: false,
  junction: 9,
  pose: () => CARRIER_POSE,
  arrival: () => [],
  departure: () => [],
})

export const MIDWAY_POSE = { x: -479, z: -483.5, heading: -Math.PI / 2, length: 154 }

// ───────── terminals / views

export interface TerminalDef {
  id: TerminalId
  code: string
  name: string
  short: string
  kind: string
  address: string
}

export const TERMINALS: TerminalDef[] = [
  { id: 'TAMT', code: 'TAMT', name: 'Tenth Avenue Marine Terminal', short: 'Tenth Avenue', kind: 'Multi-purpose · 8 berths · 96 acres', address: '1150 Cesar E Chavez Pkwy, San Diego' },
  { id: 'NCMT', code: 'NCMT', name: 'National City Marine Terminal', short: 'National City', kind: 'Ro-Ro · Vehicle imports · 135 acres', address: '1203 Bay Marina Dr, National City' },
  { id: 'CRUISE', code: 'BST', name: 'B Street & Broadway Cruise Terminals', short: 'Cruise piers', kind: 'Cruise · Passenger', address: '1140 N Harbor Dr, San Diego' },
  { id: 'NAVY', code: 'NBSD', name: 'Naval Base San Diego', short: '32nd Street', kind: 'U.S. Navy · Pacific Fleet', address: '3455 Senn Rd, San Diego' },
  { id: 'NASNI', code: 'NASNI', name: 'Naval Air Station North Island', short: 'North Island', kind: 'U.S. Navy · Carrier homeport', address: 'Coronado, CA' },
]

// ───────── TAMT apron + yard (terminal-local coordinates: quay along x, water +z)

export const APRON_LANE_Z = -31
export const TRANSFER_Z = -24
export const CRANE_Z = -13
export const YARD_ROWS = 3
export const YARD_STACKS = 20
export const STACK_PITCH = 6.5
export const BLOCKS = [
  { id: 'A', cx: -75 },
  { id: 'B', cx: 95 },
]
// the west end of TAMT tapers (its NW face), so aisles are reached from the middle and the east end
export const CORRIDORS = [0, 188]
export const HOME_CORRIDOR = 188
export const HOME_X = 202
export const rowZ = (r: number) => -44 - r * 12
export const aisleZ = (r: number) => (r === 0 ? APRON_LANE_Z : rowZ(r) + 6)
export const FRONT_OFFSET = 2.04
export const YARD_LINES = 4
export const stackX = (block: number, s: number) => BLOCKS[block].cx + (s - (YARD_STACKS - 1) / 2) * STACK_PITCH
export const tierY = (t: number) => LAND_Y + 0.65 + t * 1.3

export const CONTAINER = { len: 6.1, wid: 1.22, hgt: 1.3 }

// ───────── world ports (voyage plans and the route map)

export interface Port {
  code: string
  name: string
  country: string
  lat: number
  lon: number
}

export const PORTS: Record<string, Port> = {
  USSAN: { code: 'USSAN', name: 'San Diego', country: 'US', lat: 32.71, lon: -117.17 },
  GTPRQ: { code: 'GTPRQ', name: 'Puerto Quetzal', country: 'GT', lat: 13.92, lon: -90.78 },
  CRCAL: { code: 'CRCAL', name: 'Caldera', country: 'CR', lat: 9.91, lon: -84.72 },
  MXZLO: { code: 'MXZLO', name: 'Manzanillo', country: 'MX', lat: 19.05, lon: -104.31 },
  MXENS: { code: 'MXENS', name: 'Ensenada', country: 'MX', lat: 31.85, lon: -116.62 },
  MXLZC: { code: 'MXLZC', name: 'Lázaro Cárdenas', country: 'MX', lat: 17.94, lon: -102.18 },
  ECGYE: { code: 'ECGYE', name: 'Guayaquil', country: 'EC', lat: -2.19, lon: -79.88 },
  PECLL: { code: 'PECLL', name: 'Callao', country: 'PE', lat: -12.05, lon: -77.15 },
  PABLB: { code: 'PABLB', name: 'Balboa', country: 'PA', lat: 8.95, lon: -79.57 },
  USLGB: { code: 'USLGB', name: 'Long Beach', country: 'US', lat: 33.75, lon: -118.2 },
  USOAK: { code: 'USOAK', name: 'Oakland', country: 'US', lat: 37.8, lon: -122.27 },
  USSEA: { code: 'USSEA', name: 'Seattle', country: 'US', lat: 47.6, lon: -122.33 },
  CAVAN: { code: 'CAVAN', name: 'Vancouver', country: 'CA', lat: 49.29, lon: -123.11 },
  USHNL: { code: 'USHNL', name: 'Honolulu', country: 'US', lat: 21.31, lon: -157.86 },
  JPYOK: { code: 'JPYOK', name: 'Yokohama', country: 'JP', lat: 35.44, lon: 139.64 },
  JPNGO: { code: 'JPNGO', name: 'Nagoya', country: 'JP', lat: 35.08, lon: 136.88 },
  KRPUS: { code: 'KRPUS', name: 'Busan', country: 'KR', lat: 35.1, lon: 129.04 },
  KRPTK: { code: 'KRPTK', name: 'Pyeongtaek', country: 'KR', lat: 36.97, lon: 126.83 },
  CNSHA: { code: 'CNSHA', name: 'Shanghai', country: 'CN', lat: 31.23, lon: 121.47 },
  TWKHH: { code: 'TWKHH', name: 'Kaohsiung', country: 'TW', lat: 22.61, lon: 120.29 },
  MXCSL: { code: 'MXCSL', name: 'Cabo San Lucas', country: 'MX', lat: 22.88, lon: -109.91 },
  MXPVR: { code: 'MXPVR', name: 'Puerto Vallarta', country: 'MX', lat: 20.65, lon: -105.24 },
  USSFO: { code: 'USSFO', name: 'San Francisco', country: 'US', lat: 37.8, lon: -122.4 },
  CAVIC: { code: 'CAVIC', name: 'Victoria', country: 'CA', lat: 48.42, lon: -123.37 },
}
