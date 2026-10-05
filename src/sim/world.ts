// Stylised, compressed layout of San Diego Bay. 1 unit ≈ 2 m.
// Frame: +x runs along the east-shore waterfront (downtown → TAMT → Coronado Bridge → NCMT),
// land is north (z < 0), the bay is south (z > 0), Coronado / North Island lie across the bay,
// and the Pacific entrance (past Point Loma) is far to the west.

import type { Waypoint } from './path'

export const LAND_Y = 2 // quay deck height above water
export const ENTRANCE_X = -3400
export const CHANNEL_Z = 320
export const CORONADO_Z = 700

export type ShipKind = 'container' | 'feeder' | 'carcarrier' | 'bulk' | 'multipurpose' | 'cruise'
export type TerminalId = 'TAMT' | 'NCMT' | 'CRUISE'

export interface ShipClass {
  kind: ShipKind
  label: string
  length: number // units
  beam: number
  draft: number // metres (display)
  freeboard: number // hull height above water, units
  speedKn: number
  bays?: number
  rows?: number
  tiers?: number
  gt: [number, number]
}

export const SHIP_CLASSES: Record<ShipKind, ShipClass> = {
  container: { kind: 'container', label: 'Container ship', length: 92, beam: 15, draft: 11.2, freeboard: 4.5, speedKn: 18, bays: 9, rows: 11, tiers: 3, gt: [24000, 28500] },
  feeder: { kind: 'feeder', label: 'Reefer feeder', length: 70, beam: 11.5, draft: 8.6, freeboard: 3.8, speedKn: 16, bays: 6, rows: 8, tiers: 3, gt: [9800, 12500] },
  carcarrier: { kind: 'carcarrier', label: 'Car carrier (PCTC)', length: 100, beam: 16, draft: 9.5, freeboard: 15, speedKn: 19, gt: [58000, 71000] },
  bulk: { kind: 'bulk', label: 'Bulk carrier', length: 90, beam: 15, draft: 10.4, freeboard: 4, speedKn: 13, gt: [21000, 25000] },
  multipurpose: { kind: 'multipurpose', label: 'Multipurpose / heavy-lift', length: 74, beam: 12, draft: 8.1, freeboard: 4, speedKn: 14, gt: [9600, 13000] },
  cruise: { kind: 'cruise', label: 'Cruise ship', length: 145, beam: 18, draft: 8.3, freeboard: 6, speedKn: 20, gt: [90000, 140000] },
}

export interface Berth {
  id: string
  terminal: TerminalId
  x: number
  kinds: ShipKind[]
  cranes: boolean
}

export const BERTHS: Berth[] = [
  { id: 'B1', terminal: 'TAMT', x: -250, kinds: ['bulk', 'multipurpose'], cranes: false },
  { id: 'B2', terminal: 'TAMT', x: -85, kinds: ['container'], cranes: true },
  { id: 'B3', terminal: 'TAMT', x: 85, kinds: ['container', 'feeder'], cranes: true },
  { id: 'B4', terminal: 'TAMT', x: 250, kinds: ['feeder', 'container'], cranes: true },
  { id: 'N1', terminal: 'NCMT', x: 1010, kinds: ['carcarrier'], cranes: false },
  { id: 'N2', terminal: 'NCMT', x: 1290, kinds: ['carcarrier'], cranes: false },
  { id: 'C1', terminal: 'CRUISE', x: -1250, kinds: ['cruise'], cranes: false },
]

export interface TerminalDef {
  id: TerminalId
  code: string
  name: string
  short: string
  kind: string
  address: string
  focus: [number, number]
  offset: [number, number, number]
}

export const TERMINALS: TerminalDef[] = [
  { id: 'TAMT', code: 'TAMT', name: 'Tenth Avenue Marine Terminal', short: 'Tenth Avenue', kind: 'Multi-purpose · 8 berths', address: '1150 Cesar E Chavez Pkwy, San Diego', focus: [-10, 18], offset: [120, 175, 235] },
  { id: 'NCMT', code: 'NCMT', name: 'National City Marine Terminal', short: 'National City', kind: 'Ro-Ro · Vehicle imports', address: '1203 Bay Marina Dr, National City', focus: [1150, 10], offset: [130, 185, 245] },
  { id: 'CRUISE', code: 'BST', name: 'B Street Cruise Terminal', short: 'B Street Pier', kind: 'Cruise · Passenger', address: '1140 N Harbor Dr, San Diego', focus: [-1250, 20], offset: [130, 160, 230] },
]

export const berthById = (id: string) => BERTHS.find((b) => b.id === id)!
export const berthZ = (beam: number) => 2.5 + beam / 2

// ───────── TAMT apron + yard

export const APRON_LANE_Z = -31
export const TRANSFER_Z = -24
export const CRANE_Z = -13
export const YARD_ROWS = 5
export const YARD_STACKS = 28
export const STACK_PITCH = 6.5
export const BLOCKS = [
  { id: 'A', cx: -205 },
  { id: 'B', cx: 0 },
  { id: 'C', cx: 205 },
]
export const CORRIDORS = [-305, -102.5, 102.5, 305]
export const rowZ = (r: number) => -46 - r * 13
export const aisleZ = (r: number) => (r === 0 ? APRON_LANE_Z : rowZ(r) + 6.5)
export const stackX = (block: number, s: number) => BLOCKS[block].cx + (s - (YARD_STACKS - 1) / 2) * STACK_PITCH
export const tierY = (t: number) => LAND_Y + 0.65 + t * 1.3

export const CONTAINER = { len: 6.1, wid: 1.22, hgt: 1.3 }

// ───────── routes

const ANCHORAGES = [
  { x: -1500, z: 520 },
  { x: -1750, z: 560 },
  { x: -1250, z: 590 },
  { x: -2000, z: 520 },
]
export const anchorage = (i: number) => ANCHORAGES[i % ANCHORAGES.length]

/** Inbound: east along the channel, swing round in the turning basin, finish bow-west, tugs push alongside. */
export function arrivalRoute(berth: Berth, beam: number, from?: { x: number; z: number }): Waypoint[] {
  const bx = berth.x
  const bz = berthZ(beam)
  const pre: Waypoint[] = from && from.z > CHANNEL_Z + 60 ? [{ x: from.x + 160, z: CHANNEL_Z + 60 }] : []
  return [
    ...pre,
    { x: bx - 240, z: CHANNEL_Z },
    { x: bx + 60, z: CHANNEL_Z },
    { x: bx + 170, z: CHANNEL_Z - 50 },
    { x: bx + 195, z: 170 },
    { x: bx + 125, z: bz + 36 },
    { x: bx + 40, z: bz + 30 },
    { x: bx, z: bz + 30 },
    { x: bx, z: bz, hold: true },
  ]
}

export function departureRoute(berth: Berth, beam: number): Waypoint[] {
  const bx = berth.x
  const bz = berthZ(beam)
  return [
    { x: bx, z: bz + 30, hold: true },
    { x: bx - 90, z: bz + 36 },
    { x: bx - 220, z: 210 },
    { x: bx - 360, z: CHANNEL_Z },
    { x: ENTRANCE_X - 200, z: CHANNEL_Z },
  ]
}

export function anchorRoute(i: number): Waypoint[] {
  const a = anchorage(i)
  return [
    { x: a.x - 240, z: CHANNEL_Z },
    { x: a.x - 90, z: (CHANNEL_Z + a.z) / 2 },
    { x: a.x, z: a.z },
  ]
}

// ───────── world ports (for voyage plans and the route map)

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
}
