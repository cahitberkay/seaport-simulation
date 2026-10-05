// Building blocks shared by every modelled port: quay frames, berth builders, channel lanes and the port definition type.
// Port files (sanDiego.ts, longBeach.ts) only describe geography; the simulation reads the active one through sim/world.ts.

import type { Waypoint } from '../sim/path'
import type { PortId } from './registry'

export type ShipKind =
  | 'container' | 'feeder' | 'neopanamax' | 'ulcv' | 'carcarrier' | 'bulk' | 'tanker' | 'multipurpose' | 'cruise'
  | 'destroyer' | 'cruiser' | 'amphib' | 'carrier'

/** terminal ids are per port; 'CT' style roles are expressed through TerminalDef.role */
export type TerminalId = string

export type XZ = { x: number; z: number }
export type Zone = { x: number; z: number; r: number }

// ───────── local frames (terminals laid out along a straight quay)

export interface Frame {
  ox: number
  oz: number
  ux: number
  uz: number
  rot: number // three.js rotation.y mapping local +x to (ux, uz)
}
export function frame(ax: number, az: number, bx: number, bz: number): Frame {
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

// ───────── berths

export interface Berth {
  id: string
  terminal: TerminalId
  label: string
  kinds: ShipKind[]
  /** container work is done by the simulated quay cranes of the main terminal */
  cranes: boolean
  junction: number // channel node where the ship leaves / rejoins the lanes
  /** berths sharing a basin share one manoeuvring lock / zone (defaults to the terminal) */
  lock?: string
  /** where an arriving ship waits for its berthing window, clear of the through lanes (default: at the junction) */
  wait?: XZ
  /** where the hull sits for a given beam, and its heading */
  pose: (beam: number, length: number) => { x: number; z: number; heading: number }
  arrival: (beam: number, length: number) => Waypoint[]
  departure: (beam: number, length: number) => Waypoint[]
}

/** a berth along a straight quay described by a frame; arrival/departure are given in quay-local coordinates */
export function quayBerth(o: {
  id: string
  terminal: TerminalId
  label: string
  kinds: ShipKind[]
  cranes?: boolean
  lock?: string
  wait?: XZ
  frame: Frame
  at: number
  junction: number
  /** local heading of the moored ship: -π/2 bow towards local -x, +π/2 towards +x */
  bow: number
  arrival: (bx: number, off: number) => [number, number, Partial<Waypoint>?][]
  departure: (bx: number, off: number) => [number, number, Partial<Waypoint>?][]
  fender?: number
}): Berth {
  const f = o.frame
  const fender = o.fender ?? 2.5
  const W = (pts: [number, number, Partial<Waypoint>?][]) => pts.map(([lx, lz, extra]) => ({ ...toWorldF(f, lx, lz), ...(extra ?? {}) }))
  return {
    id: o.id,
    terminal: o.terminal,
    label: o.label,
    kinds: o.kinds,
    cranes: !!o.cranes,
    lock: o.lock,
    wait: o.wait,
    junction: o.junction,
    pose: (beam) => ({ ...toWorldF(f, o.at, fender + beam / 2), heading: headingF(f, o.bow) }),
    arrival: (beam) => W(o.arrival(o.at, fender + beam / 2)),
    departure: (beam) => W(o.departure(o.at, fender + beam / 2)),
  }
}

/** a ship moored along a finger pier (cruise piers, naval piers): bow in, backs out with tugs */
export function slipBerth(
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

// ───────── channel lanes (right-hand traffic either side of a fitted centreline)

export function makeLanes(channel: [number, number][], lane: number) {
  const laneAt = (i: number, side: 1 | -1): XZ => {
    const a = channel[Math.max(0, i - 1)]
    const b = channel[Math.min(channel.length - 1, i + 1)]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const l = Math.hypot(dx, dz) || 1
    // right-hand side when travelling inbound (sea → head of the harbour)
    return { x: channel[i][0] + (-dz / l) * lane * side, z: channel[i][1] + (dx / l) * lane * side }
  }
  const inboundLane = (from: number, to: number): Waypoint[] => {
    const out: Waypoint[] = []
    for (let i = from; i <= to; i++) out.push(laneAt(i, 1))
    return out
  }
  const outboundLane = (from: number, to: number): Waypoint[] => {
    const out: Waypoint[] = []
    for (let i = from; i >= to; i--) out.push(laneAt(i, -1))
    return out
  }
  /** channel node to join when heading out from (x, z): the nearest one that lies ahead in the outbound direction */
  const outboundEntry = (x: number, z: number, maxIdx: number) => {
    let k = 1
    let best = Infinity
    for (let i = 1; i <= maxIdx; i++) {
      const d = Math.hypot(channel[i][0] - x, channel[i][1] - z)
      if (d < best) {
        best = d
        k = i
      }
    }
    if (k > 1) {
      const dx = channel[k - 1][0] - channel[k][0]
      const dz = channel[k - 1][1] - channel[k][1]
      if ((channel[k][0] - x) * dx + (channel[k][1] - z) * dz < 0) k--
    }
    return k
  }
  return { inboundLane, outboundLane, outboundEntry }
}

// ───────── port definition

export interface TerminalDef {
  id: TerminalId
  code: string
  name: string
  short: string
  kind: string
  address: string
  /** berth places read "<berth label>" instead of the terminal name (cruise piers) */
  labelOnly?: boolean
  navy?: boolean
}

export interface Service {
  service: string
  prev: string[]
  next: string[]
}

export type CamPose = [number, number, number, number, number, number]

export interface PortDef {
  id: PortId
  name: string
  short: string
  region: string
  unlocode: string
  bay: string
  /** the terminal whose quay cranes, yard and handlers are fully simulated */
  ct: {
    id: TerminalId
    code: string
    name: string
    frame: Frame
    crane: 'mhc' | 'sts'
    craneXs: number[]
    boom: number
    /** apron outline in quay-local coordinates (x along the quay, z negative inland) */
    apron: [number, number][]
    lights: number[]
    gate: string
    /** yard blocks along the quay (centre x), the cross aisles between them and the handler park */
    blocks?: { id: string; cx: number }[]
    corridors?: number[]
    homeCorridor?: number
    handlers?: number
  }
  /** ro-ro terminal: vehicles drive off car carriers into this frame */
  roro: { id: TerminalId; code: string; frame: Frame }
  CHANNEL: [number, number][]
  lane: number
  inboundLane: (from: number, to: number) => Waypoint[]
  outboundLane: (from: number, to: number) => Waypoint[]
  outboundEntry: (x: number, z: number, maxIdx: number) => number
  SEA_SPAWN: XZ
  /** where outbound ships leave the model */
  EXIT: XZ
  /** channel node where ships from the anchorage join the inbound lane */
  anchorJoin: number
  anchorage: (i: number) => XZ
  anchorageIn: (i: number, from: XZ) => Waypoint[]
  anchorageOut: (i: number) => Waypoint[]
  /** manoeuvring basins per lock: one circle, or several when a basin is irregular */
  ZONES: Record<string, Zone | Zone[]>
  /** manoeuvring speeds (units / s): approach, going astern, departures */
  speeds?: { approach: number; rev: number; manoeuvre: number }
  BERTHS: Berth[]
  TERMINALS: TerminalDef[]
  schedule: Record<string, ShipKind[]>
  init: {
    inbound: { berth: string; node: number }[]
    anchoredFor?: string
    departed?: { berth: string; node: number; kind: ShipKind }
    statics?: { berth: string; kind: ShipKind; name?: string }[]
  }
  tugs: { name: string; home: XZ }[]
  services: Partial<Record<ShipKind, Service[]>>
  text: {
    arrived: string
    seaBuoy: string
    pilot: string
    entered: string
    enteredPlace: string
    inside: string
    anchorage: string
    navyHome?: string
    exercise?: string
  }
  inland: string[]
  cruiseLines: string[]
  cameras: { overview: CamPose; vessels: CamPose; logistics: CamPose }
  MIDWAY_POSE?: { x: number; z: number; heading: number; length: number }
  CARRIER_POSE?: { x: number; z: number; heading: number }
  QUEEN_MARY?: { x: number; z: number; heading: number; length: number }
  /** other container terminals: quay line (water on the left looking a→b, flipped automatically), yard depth and crane count */
  decorQuays?: { name: string; a: [number, number]; b: [number, number]; depth: number; cranes: number }[]
}
