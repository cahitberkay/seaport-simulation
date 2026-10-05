// Reference data and generators: operators, names, cargo catalogue, IDs with real check digits.
import { PORTS } from './world'
import type { ShipKind, Port } from './world'

let seed = 20261005
export const rnd = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}
export const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
export const range = (a: number, b: number) => a + rnd() * (b - a)
export const irange = (a: number, b: number) => Math.floor(range(a, b + 1))

// ───────── time (sim minutes since Oct 5 2026 00:00, port local time)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const BASE = Date.UTC(2026, 9, 5)
export function fmtTime(min: number) {
  const m = Math.floor(min)
  const d = new Date(BASE + m * 60000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
export function fmtClock(min: number) {
  const ms = Math.floor(min * 60000)
  const d = new Date(BASE + ms)
  const p = (v: number) => String(v).padStart(2, '0')
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}
export function fmtDate(min: number) {
  const d = new Date(BASE + Math.floor(min) * 60000)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} · ${fmtTime(min)}`
}
export function fmtDuration(min: number) {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} h ${m % 60} min`
  return `${Math.round(h / 24)} days`
}

// ───────── operators

export interface Line {
  name: string
  code: string // ISO 6346 owner code (without U)
  color: string
}

export const LINES: Line[] = [
  { name: 'AnyMile Lines', code: 'AML', color: '#2f6bed' },
  { name: 'Verdemar', code: 'VRD', color: '#13a39a' },
  { name: 'Coral Line', code: 'CRL', color: '#f08a0b' },
  { name: 'Bluepeak', code: 'BPK', color: '#1e3a8a' },
  { name: 'Rossa Maritime', code: 'RSS', color: '#e0533d' },
  { name: 'Solana Reefer', code: 'SOL', color: '#eef1f7' },
]

const NAME_PARTS: Record<ShipKind, [string[], string[]]> = {
  container: [['Pacific', 'Coral', 'Quetzal', 'Sierra', 'Azul', 'Baja', 'Cascadia', 'Solana', 'Tierra', 'Monterey'], ['Verde', 'Trader', 'Star', 'Horizon', 'Express', 'Bay', 'Bridge', 'Navigator', 'Pride', 'Venture']],
  feeder: [['Ensenada', 'Rio', 'Costa', 'Punta', 'Mar', 'Isla', 'Cabo'], ['Spirit', 'Lempa', 'Fresca', 'Brava', 'Azul', 'Norte', 'Clara']],
  carcarrier: [['Auto', 'Grand', 'Harbor', 'Sunrise', 'Cielo', 'Pacific', 'Seabright'], ['Meridian', 'Pasifico', 'Pioneer', 'Carrier', 'Drive', 'Motorway', 'Voyager']],
  bulk: [['Mesa', 'Iron', 'Golden', 'Torrey', 'Copper'], ['Verde', 'Pelican', 'Sierra', 'Pine', 'Canyon']],
  multipurpose: [['Tradewind', 'Nordic', 'Santa Ana', 'Pacific'], ['Lift', 'Breeze', 'Wind', 'Heavy']],
  cruise: [['Pacific', 'Riviera', 'Ocean', 'Coral', 'Sapphire', 'Emerald', 'Golden'], ['Serenade', 'Dawn', 'Aurora', 'Harmony', 'Odyssey', 'Voyager', 'Princess']],
  destroyer: [['USS Harbor', 'USS Pacific', 'USS Coronado', 'USS Cabrillo', 'USS Mesa', 'USS Point'], ['Sentinel', 'Resolve', 'Vigil', 'Guardian', 'Valor', 'Loma']],
  cruiser: [['USS Lake', 'USS Cape', 'USS Fort'], ['Rosecrans', 'Palomar', 'Laguna', 'Cuyamaca']],
  amphib: [['USS'], ['Silver Strand', 'Torrey Pines', 'Mission Bay']],
  carrier: [['USS'], ['Pacific Resolve']],
}
export const HULL_PREFIX: Partial<Record<ShipKind, string>> = { destroyer: 'DDG', cruiser: 'CG', amphib: 'LHD', carrier: 'CVN' }
const used = new Set<string>()
export function shipName(kind: ShipKind) {
  const [a, b] = NAME_PARTS[kind]
  for (let i = 0; i < 40; i++) {
    const n = `${pick(a)} ${pick(b)}`
    if (!used.has(n)) {
      used.add(n)
      return n
    }
  }
  const n = `${pick(a)} ${pick(b)} ${irange(2, 9)}`
  used.add(n)
  return n
}
export const releaseName = (n: string) => used.delete(n)
export const claimName = (n: string) => (used.add(n), n)

export const FLAGS = [
  { name: 'Liberia', mid: '636' },
  { name: 'Panama', mid: '352' },
  { name: 'Marshall Islands', mid: '538' },
  { name: 'Singapore', mid: '563' },
  { name: 'Malta', mid: '248' },
  { name: 'Bahamas', mid: '311' },
]

export function imoNumber() {
  const d = Array.from({ length: 6 }, (_, i) => (i === 0 ? irange(9, 9) : irange(0, 9)))
  const check = d.reduce((a, v, i) => a + v * (7 - i), 0) % 10
  return `${d.join('')}${check}`
}
export const mmsi = (mid: string) => `${mid}${String(irange(100000, 999999))}`
export const callSign = () => `${pick(['D5', 'H3', 'V7', '9V', '9H', 'C6'])}${String.fromCharCode(65 + irange(0, 25))}${String.fromCharCode(65 + irange(0, 25))}${irange(2, 9)}`

// ISO 6346 container number with check digit
const LETTER_VAL: Record<string, number> = {}
;(() => {
  let v = 10
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (v % 11 === 0) v++
    LETTER_VAL[ch] = v++
  }
})()
export function containerNumber(owner: string) {
  const serial = String(irange(0, 999999)).padStart(6, '0')
  const body = `${owner}U${serial}`
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const ch = body[i]
    const val = /[A-Z]/.test(ch) ? LETTER_VAL[ch] : Number(ch)
    sum += val * 2 ** i
  }
  const check = (sum % 11) % 10
  return `${owner}U ${serial} ${check}`
}

// ───────── voyages

export interface Voyage {
  prev: string
  next: string
  service: string
}

const SERVICES: Record<ShipKind, { service: string; prev: string[]; next: string[] }[]> = {
  container: [
    { service: 'Central America Reefer Express', prev: ['GTPRQ', 'CRCAL', 'ECGYE', 'PABLB'], next: ['USLGB', 'USOAK'] },
    { service: 'Transpacific South Loop', prev: ['CNSHA', 'KRPUS', 'TWKHH', 'JPYOK'], next: ['USOAK', 'USSEA', 'CAVAN'] },
  ],
  feeder: [{ service: 'Baja–Pacific Feeder', prev: ['MXZLO', 'MXENS', 'MXLZC'], next: ['MXZLO', 'GTPRQ'] }],
  carcarrier: [
    { service: 'Asia–West Coast Auto', prev: ['JPNGO', 'JPYOK', 'KRPTK'], next: ['USHNL', 'USLGB'] },
    { service: 'Mexico Auto Shuttle', prev: ['MXLZC', 'MXZLO'], next: ['USHNL', 'USLGB'] },
  ],
  bulk: [{ service: 'Tramp · Bulk', prev: ['PECLL', 'MXLZC', 'CNSHA'], next: ['ECGYE', 'PECLL'] }],
  multipurpose: [{ service: 'Project Cargo · Wind', prev: ['CNSHA', 'KRPUS'], next: ['USLGB', 'MXZLO'] }],
  cruise: [
    { service: 'Mexican Riviera', prev: ['MXCSL', 'MXPVR', 'MXENS'], next: ['MXCSL', 'MXPVR', 'MXENS'] },
    { service: 'Pacific Coastal', prev: ['USSFO', 'CAVIC', 'CAVAN'], next: ['MXENS', 'MXCSL', 'USHNL'] },
  ],
  destroyer: [{ service: 'Pacific Fleet · underway training', prev: ['USHNL', 'USSAN'], next: ['USHNL', 'USSAN'] }],
  cruiser: [{ service: 'Pacific Fleet · underway training', prev: ['USHNL'], next: ['USHNL'] }],
  amphib: [{ service: 'Expeditionary strike group', prev: ['USHNL'], next: ['USHNL'] }],
  carrier: [{ service: 'Carrier strike group', prev: ['USHNL'], next: ['USHNL'] }],
}

export function voyageFor(kind: ShipKind): Voyage {
  const s = pick(SERVICES[kind])
  let next = pick(s.next)
  const prev = pick(s.prev)
  if (next === prev) next = s.next.find((n) => n !== prev) ?? next
  return { prev, next, service: s.service }
}

export function nmBetween(a: Port, b: Port) {
  const R = 3440.1
  const toR = Math.PI / 180
  const dLat = (b.lat - a.lat) * toR
  const dLon = (b.lon - a.lon) * toR
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Interpolate along the (equirectangular) leg, handling the dateline. */
export function legPoint(a: Port, b: Port, t: number) {
  let dLon = b.lon - a.lon
  if (dLon > 180) dLon -= 360
  if (dLon < -180) dLon += 360
  let lon = a.lon + dLon * t
  if (lon < -180) lon += 360
  if (lon > 180) lon -= 360
  return { lat: a.lat + (b.lat - a.lat) * t, lon }
}

export const fmtLatLon = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`

// ───────── cargo catalogue

export interface Cargo {
  name: string
  reefer: boolean
  temp?: number
  weight: [number, number] // tonnes when full
}

const C = (name: string, weight: [number, number], temp?: number): Cargo => ({ name, reefer: temp !== undefined, temp, weight })

export const CARGO_BY_REGION: Record<string, Cargo[]> = {
  latam: [C('Bananas', [18, 22], 13.3), C('Pineapples', [17, 21], 7.2), C('Melons', [16, 20], 10), C('Green coffee', [19, 21]), C('Bagged sugar', [24, 26]), C('Frozen shrimp', [20, 24], -20)],
  mexico: [C('Avocados', [17, 20], 5), C('Limes', [18, 21], 9), C('Berries', [10, 14], 0.5), C('Beverages', [21, 24]), C('Auto parts', [12, 18])],
  asia: [C('Consumer electronics', [6, 12]), C('Furniture', [8, 14]), C('Apparel', [5, 9]), C('Solar modules', [14, 18]), C('Machinery parts', [16, 24]), C('Toys', [5, 8]), C('Auto parts', [12, 18])],
  export: [C('Recycled paper', [20, 24]), C('Almonds', [18, 21]), C('California wine', [16, 19]), C('Frozen beef', [20, 23], -18), C('Hay bales', [14, 17]), C('Machinery', [14, 22])],
}

export const regionOf = (code: string) => {
  const c = PORTS[code]?.country
  if (c === 'MX') return 'mexico'
  if (['GT', 'CR', 'EC', 'PE', 'PA'].includes(c ?? '')) return 'latam'
  if (['CN', 'KR', 'JP', 'TW'].includes(c ?? '')) return 'asia'
  return 'export'
}

export const INLAND = ['San Diego, CA', 'Los Angeles, CA (truck)', 'Phoenix, AZ (rail)', 'Las Vegas, NV (truck)', 'Denver, CO (rail)', 'Tijuana, MX (truck)', 'Salt Lake City, UT (rail)']
export const SHIPPERS: Record<string, string[]> = {
  latam: ['Finca Las Brisas · Escuintla', 'Cooperativa Tarrazú', 'Agroexport del Pacífico', 'Bananera Costa Sur'],
  mexico: ['Agrícola Michoacán', 'Huertas de Jalisco', 'Bebidas del Norte', 'Autopartes Bajío'],
  asia: ['Shenzhen Bright Electronics', 'Busan Motor Components', 'Ningbo Home Living', 'Kaohsiung Solar Works'],
  export: ['Imperial Valley Hay Co.', 'Central Valley Almond Growers', 'Temecula Cellars', 'SoCal Fiber Recovery'],
}
export const CONSIGNEES = ['Pacific Fresh Distributors', 'Sunbelt Retail DC', 'Mesa Home Furnishings', 'Desert Grocers Co-op', 'Harbor Auto Supply', 'Rocky Mountain Foods']

export const VEHICLE_BRANDS = ['Toyota', 'Honda', 'Hyundai', 'Volkswagen', 'Audi', 'Porsche', 'Mitsubishi Fuso', 'Isuzu', 'Ford']
export const BULK_CARGO = ['Sodium carbonate', 'Bagged sugar', 'Cement clinker', 'Steel plate']
