// The active port's geography plus everything that is the same for every port (ship classes, yard layout, world ports).
// 1 unit = 2 m, +x = east, +z = south (north is -z). Coastlines come from geo.ts, port layouts from src/ports/*.

import { PORT_ID } from '../ports/registry'
import { sanDiego } from '../ports/sanDiego'
import { longBeach } from '../ports/longBeach'
import type { PortDef, ShipKind } from '../ports/kit'

export type { ShipKind, TerminalId, Berth, Frame, TerminalDef, PortDef } from '../ports/kit'
export { toWorldF, toLocalF, headingF } from '../ports/kit'

export const LAND_Y = 2

// ───────── ship classes

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
  neopanamax: { kind: 'neopanamax', label: 'Neo-Panamax container ship', length: 150, beam: 21, draft: 14.5, freeboard: 5.5, speedKn: 21, bays: 15, rows: 15, tiers: 3, gt: [112000, 132000] },
  ulcv: { kind: 'ulcv', label: 'Ultra-large container ship', length: 180, beam: 25, draft: 16, freeboard: 6, speedKn: 20, bays: 19, rows: 18, tiers: 3, gt: [187000, 236000] },
  carcarrier: { kind: 'carcarrier', label: 'Car carrier (PCTC)', length: 100, beam: 16, draft: 9.5, freeboard: 15, speedKn: 19, gt: [58000, 71000] },
  bulk: { kind: 'bulk', label: 'Bulk carrier', length: 90, beam: 15, draft: 10.4, freeboard: 4, speedKn: 13, gt: [21000, 25000] },
  tanker: { kind: 'tanker', label: 'Crude oil tanker', length: 122, beam: 22, draft: 14.8, freeboard: 4.5, speedKn: 14, gt: [58000, 63000] },
  multipurpose: { kind: 'multipurpose', label: 'Multipurpose / heavy-lift', length: 74, beam: 12, draft: 8.1, freeboard: 4, speedKn: 14, gt: [9600, 13000] },
  cruise: { kind: 'cruise', label: 'Cruise ship', length: 145, beam: 18, draft: 8.3, freeboard: 6, speedKn: 20, gt: [90000, 140000] },
  destroyer: { kind: 'destroyer', label: 'Guided-missile destroyer', length: 77, beam: 10, draft: 9.4, freeboard: 4, speedKn: 30, gt: [9000, 9700], navy: true },
  cruiser: { kind: 'cruiser', label: 'Guided-missile cruiser', length: 86, beam: 8.5, draft: 10.2, freeboard: 4, speedKn: 32, gt: [9600, 9800], navy: true },
  amphib: { kind: 'amphib', label: 'Amphibious assault ship', length: 128, beam: 16, draft: 8.1, freeboard: 13, speedKn: 22, gt: [40000, 45000], navy: true },
  carrier: { kind: 'carrier', label: 'Nuclear aircraft carrier', length: 166, beam: 20, draft: 11.3, freeboard: 15, speedKn: 30, gt: [100000, 104000], navy: true },
}
/** ships whose cargo is modelled box by box */
export const isBoxShip = (k: ShipKind) => k === 'container' || k === 'feeder' || k === 'neopanamax' || k === 'ulcv'

// ───────── the active port

export const PORT: PortDef = PORT_ID === 'long-beach' ? longBeach() : sanDiego()

export const CT_FRAME = PORT.ct.frame
export const RORO_FRAME = PORT.roro.frame
export const {
  CHANNEL, SEA_SPAWN, EXIT, ZONES, BERTHS, TERMINALS, MIDWAY_POSE, CARRIER_POSE,
  anchorage, anchorageIn, anchorageOut, inboundLane, outboundLane, outboundEntry,
} = PORT

export const berthById = (id: string) => BERTHS.find((b) => b.id === id)!
export const terminalById = (id: string) => TERMINALS.find((t) => t.id === id)

// ───────── main terminal apron + yard (terminal-local coordinates: quay along x, water +z)

export const APRON_LANE_Z = -31
export const TRANSFER_Z = -24
export const CRANE_Z = -13
export const YARD_ROWS = 3
export const YARD_STACKS = 20
export const STACK_PITCH = 6.5
export const BLOCKS = PORT.ct.blocks ?? [
  { id: 'A', cx: -75 },
  { id: 'B', cx: 95 },
]
// aisles are reached from the gaps between blocks and from the far end, where the handlers park
export const CORRIDORS = PORT.ct.corridors ?? [0, 188]
export const HOME_CORRIDOR = PORT.ct.homeCorridor ?? 188
export const HOME_X = HOME_CORRIDOR + 14
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
  GUAPR: { code: 'GUAPR', name: 'Apra Harbor (Guam)', country: 'GU', lat: 13.44, lon: 144.66 },
  JPYOK: { code: 'JPYOK', name: 'Yokohama', country: 'JP', lat: 35.44, lon: 139.64 },
  JPNGO: { code: 'JPNGO', name: 'Nagoya', country: 'JP', lat: 35.08, lon: 136.88 },
  KRPUS: { code: 'KRPUS', name: 'Busan', country: 'KR', lat: 35.1, lon: 129.04 },
  KRPTK: { code: 'KRPTK', name: 'Pyeongtaek', country: 'KR', lat: 36.97, lon: 126.83 },
  CNSHA: { code: 'CNSHA', name: 'Shanghai', country: 'CN', lat: 31.23, lon: 121.47 },
  CNNGB: { code: 'CNNGB', name: 'Ningbo', country: 'CN', lat: 29.87, lon: 121.55 },
  CNYTN: { code: 'CNYTN', name: 'Yantian', country: 'CN', lat: 22.57, lon: 114.27 },
  CNXMN: { code: 'CNXMN', name: 'Xiamen', country: 'CN', lat: 24.48, lon: 118.07 },
  HKHKG: { code: 'HKHKG', name: 'Hong Kong', country: 'HK', lat: 22.3, lon: 114.17 },
  TWKHH: { code: 'TWKHH', name: 'Kaohsiung', country: 'TW', lat: 22.61, lon: 120.29 },
  VNCMT: { code: 'VNCMT', name: 'Cai Mep', country: 'VN', lat: 10.5, lon: 107.03 },
  SGSIN: { code: 'SGSIN', name: 'Singapore', country: 'SG', lat: 1.26, lon: 103.84 },
  MXCSL: { code: 'MXCSL', name: 'Cabo San Lucas', country: 'MX', lat: 22.88, lon: -109.91 },
  MXPVR: { code: 'MXPVR', name: 'Puerto Vallarta', country: 'MX', lat: 20.65, lon: -105.24 },
  MXMZT: { code: 'MXMZT', name: 'Mazatlán', country: 'MX', lat: 23.2, lon: -106.42 },
  USAVX: { code: 'USAVX', name: 'Avalon (Catalina Island)', country: 'US', lat: 33.34, lon: -118.33 },
  USSFO: { code: 'USSFO', name: 'San Francisco', country: 'US', lat: 37.8, lon: -122.4 },
  CAVIC: { code: 'CAVIC', name: 'Victoria', country: 'CA', lat: 48.42, lon: -123.37 },
  USVDZ: { code: 'USVDZ', name: 'Valdez', country: 'US', lat: 61.12, lon: -146.35 },
}
/** this port, as a world port (voyage legs start and end here) */
export const HOME = PORTS[PORT.unlocode]
