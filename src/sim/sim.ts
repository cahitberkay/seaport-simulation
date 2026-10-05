import { buildPath, follow, lerpAngle } from './path'
import type { Mover, PathPoint, Waypoint } from './path'
import {
  BERTHS, SHIP_CLASSES, PORTS, LAND_Y, CRANE_Z, TRANSFER_Z, APRON_LANE_Z, YARD_ROWS, YARD_STACKS, BLOCKS, CORRIDORS,
  HOME_CORRIDOR, HOME_X, CONTAINER, FRONT_OFFSET, YARD_LINES, CT_FRAME, RORO_FRAME, SEA_SPAWN, EXIT, ZONES, anchorage, anchorageIn, anchorageOut,
  rowZ, aisleZ, stackX, tierY, berthById, inboundLane, outboundLane, outboundEntry, toLocalF, toWorldF, PORT, HOME, isBoxShip, terminalById,
} from './world'
import { isLand } from './geo'
import type { Berth, ShipKind, ShipClass, TerminalId } from './world'
import {
  rnd, pick, range, irange, LINES, FLAGS, shipName, releaseName, claimName, imoNumber, mmsi, callSign, containerNumber,
  voyageFor, nmBetween, legPoint, fmtLatLon, CARGO_BY_REGION, regionOf, INLAND, SHIPPERS, CONSIGNEES, VEHICLE_BRANDS,
  BULK_CARGO, HULL_PREFIX, EXPORT_DESTS,
} from './data'
import type { Line, Voyage } from './data'

// ═════════════════════════════════════ types

export interface HistoryEvent {
  t: number
  event: string
  place: string
  planned?: boolean
}

export type ContainerLoc =
  | { kind: 'ship'; shipId: string; slot: number }
  | { kind: 'yard'; slot: number }
  | { kind: 'crane'; id: string }
  | { kind: 'handler'; id: string }
  | { kind: 'rtg'; id: string }
  | { kind: 'transfer'; craneId: string; idx: number }
  | { kind: 'gone'; where: string }

export interface Container {
  id: string
  line: Line
  size: string
  reefer: boolean
  cargo: string
  temp?: number
  fill: number
  weight: number
  tare: number
  origin: string
  pod: string
  dest: string
  shipper: string
  consignee: string
  seal: string
  flow: 'import' | 'export' | 'rob' | 'empty'
  vesselId?: string
  vesselName?: string
  loc: ContainerLoc
  status: string
  history: HistoryEvent[]
}

export type ShipState = 'inbound' | 'anchored' | 'waiting' | 'approach' | 'berthing' | 'working' | 'ready' | 'unberthing' | 'outbound'

export interface Ship extends Mover {
  id: string
  name: string
  kind: ShipKind
  cls: ShipClass
  line: Line
  imo: string
  mmsi: string
  flag: string
  callSign: string
  voyageNo: string
  voyage: Voyage
  gt: number
  dwt: number
  berthId: string
  state: ShipState
  anchorIdx?: number
  eta: number
  etd: number
  ataBerth?: number
  readyTimer: number
  stall: number
  lastProgress: number
  speedCap: number
  blockedBy?: string
  lockHold: number
  merging?: boolean
  static?: boolean
  slots: (string | null)[]
  toDischarge: Set<string>
  loadPlan: string[]
  plannedDischarge: number
  plannedLoad: number
  discharged: number
  loaded: number
  cargoVersion: number
  cranes: string[]
  vehicles?: { brand: string; total: number; onboard: number; toDischarge: number; planned: number; acc: number }
  bulk?: { cargo: string; total: number; remaining: number }
  blades?: { total: number; onboard: number; acc: number }
  passengers?: { total: number; ashore: number; line: string }
  navy?: { hull: string; crew: number; status: string; commissioned: number }
  history: HistoryEvent[]
  callId: string
  autoAcc?: number
}

export interface Call {
  id: string
  berthId: string
  name: string
  kind: ShipKind
  eta: number
  etd: number
  shipId?: string
  status: 'planned' | 'arriving' | 'working' | 'departed' | 'anchored'
}

type Target = { kind: 'ship'; shipId: string; slot: number } | { kind: 'transfer'; idx: number }

export interface TransferSlot {
  cid: string | null
  reserved: boolean
}

export interface Crane {
  id: string
  x: number
  targetX: number
  slew: number
  radius: number
  hookY: number
  carrying: string | null
  phase: 'idle' | 'travel' | 'up' | 'swing' | 'down' | 'latch' | 'up2' | 'swing2' | 'down2' | 'unlatch'
  timer: number
  job?: { from: Target; to: Target; cid: string; type: 'discharge' | 'load' }
  shipId?: string
  side: -1 | 0 | 1
  transfer: TransferSlot[]
  moveTimes: number[]
  status: string
}

/** rubber-tyred gantry crane doing yard housekeeping on the deep lines */
export interface Rtg {
  id: string
  block: number
  x: number
  trolleyZ: number
  hookY: number
  carrying: string | null
  job?: { from: number; to: number; cid: string }
  phase: 'idle' | 'drive' | 'trolley' | 'down' | 'latch' | 'up' | 'drive2' | 'down2' | 'unlatch'
  timer: number
  moves: number
  status: string
}

type HLoc = { kind: 'home' } | { kind: 'stack'; slot: number } | { kind: 'transfer'; craneId: string; idx: number }
type HStep = { t: 'move'; to: HLoc; started?: boolean } | { t: 'wait'; d: number } | { t: 'do'; fn: () => void }

export interface Handler extends Mover {
  id: string
  home: { x: number; z: number }
  loc: HLoc
  queue: HStep[]
  waitLeft: number
  lift: number
  liftTarget: number
  carrying: string | null
  fuel: number
  status: string
  phase: 'idle' | 'working'
  moves: number
  operator: string
}

export interface Tug extends Mover {
  id: string
  name: string
  home: { x: number; z: number }
  shipId?: string
  offset: number
}

export interface MovingCar {
  id: number
  shipId: string
  path: PathPoint[]
  pos: { x: number; z: number }
  heading: number
  speed: number
  color: number
}

export interface Alert {
  t: number
  text: string
  tone: 'amber' | 'blue' | 'green' | 'red'
  ref?: { type: 'ship' | 'container'; id: string }
}

// ═════════════════════════════════════ state

export const sim = {
  time: 9 * 60 + 40,
  speed: 1,
  ships: [] as Ship[],
  containers: new Map<string, Container>(),
  yard: [] as (string | null)[],
  yardVersion: 0,
  cranes: [] as Crane[],
  rtgs: [] as Rtg[],
  handlers: [] as Handler[],
  tugs: [] as Tug[],
  cars: [] as MovingCar[],
  laydown: 0,
  calls: [] as Call[],
  alerts: [] as Alert[],
  locks: {} as Partial<Record<TerminalId, string>>,
  teuToday: 1184,
  version: 0,
  gateTimer: 0,
  navyTimer: 30,
}

export const SIM_MIN_PER_SEC = 0.25
export const shipById = (id?: string) => sim.ships.find((s) => s.id === id)
export const craneById = (id?: string) => sim.cranes.find((c) => c.id === id)
export const rtgById = (id?: string) => sim.rtgs.find((c) => c.id === id)
export const handlerById = (id?: string) => sim.handlers.find((h) => h.id === id)
export const containerById = (id?: string) => (id ? sim.containers.get(id) : undefined)

function alert(text: string, tone: Alert['tone'], ref?: Alert['ref']) {
  sim.alerts.unshift({ t: sim.time, text, tone, ref })
  sim.alerts.length = Math.min(sim.alerts.length, 14)
}

// ═════════════════════════════════════ geometry

export const ctLocal = (x: number, z: number) => toLocalF(CT_FRAME, x, z)
export const ctWorld = (x: number, z: number) => toWorldF(CT_FRAME, x, z)
const CT = PORT.ct.code
/** berths share a manoeuvring lock (and basin zone) per terminal, or per basin when several terminals share one */
export const lockOf = (b: Berth) => b.lock ?? b.terminal

export const slotCount = (cls: ShipClass) => (cls.bays ?? 0) * (cls.rows ?? 0) * (cls.tiers ?? 0)

export function slotLocal(cls: ShipClass, slot: number) {
  const rows = cls.rows!
  const tiers = cls.tiers!
  const bay = Math.floor(slot / (rows * tiers))
  const row = Math.floor(slot / tiers) % rows
  const tier = slot % tiers
  return { bay, row, tier, x: (row - (rows - 1) / 2) * 1.32, y: cls.freeboard + 0.45 + 0.65 + tier * 1.3, z: -cls.length / 2 + 17 + bay * 6.6 + 3.05 }
}

export function toWorld(o: { pos: { x: number; z: number }; heading: number }, lx: number, lz: number) {
  const c = Math.cos(o.heading)
  const s = Math.sin(o.heading)
  return { x: o.pos.x + lx * c + lz * s, z: o.pos.z - lx * s + lz * c }
}

export function slotWorld(ship: Ship, slot: number) {
  const l = slotLocal(ship.cls, slot)
  const w = toWorld(ship, l.x, l.z)
  return { x: w.x, y: l.y, z: w.z }
}
/** ship slot in terminal-local coordinates (cranes work in the terminal frame) */
const slotTamt = (ship: Ship, slot: number) => {
  const w = slotWorld(ship, slot)
  const l = ctLocal(w.x, w.z)
  return { x: l.x, y: w.y, z: l.z }
}

const slotIndex = (cls: ShipClass, bay: number, row: number, tier: number) => (bay * cls.rows! + row) * cls.tiers! + tier

export const yardSlotIndex = (block: number, row: number, stack: number, line: number, tier: number) =>
  (((block * YARD_ROWS + row) * YARD_STACKS + stack) * YARD_LINES + line) * 3 + tier
export function yardDecode(slot: number) {
  const tier = slot % 3
  const line = Math.floor(slot / 3) % YARD_LINES
  const stack = Math.floor(slot / (3 * YARD_LINES)) % YARD_STACKS
  const row = Math.floor(slot / (3 * YARD_LINES * YARD_STACKS)) % YARD_ROWS
  const block = Math.floor(slot / (3 * YARD_LINES * YARD_STACKS * YARD_ROWS))
  return { block, row, stack, line, tier }
}
/** terminal-local position of a yard slot */
export function yardLocal(slot: number) {
  const d = yardDecode(slot)
  return { x: stackX(d.block, d.stack), y: tierY(d.tier), z: rowZ(d.row) + FRONT_OFFSET - d.line * 1.36 }
}
export const yardLabel = (slot: number) => {
  const d = yardDecode(slot)
  return `Block ${BLOCKS[d.block].id} · Row ${d.row + 1}${String.fromCharCode(65 + d.line)} · Stack ${String(d.stack + 1).padStart(2, '0')} · Tier ${d.tier + 1}`
}
const YARD_SLOTS = BLOCKS.length * YARD_ROWS * YARD_STACKS * YARD_LINES * 3

function stackHeight(block: number, row: number, stack: number, line = 0) {
  let h = 0
  while (h < 3 && sim.yard[yardSlotIndex(block, row, stack, line, h)]) h++
  return h
}
const stackKey = (b: number, r: number, s: number, line = 0) => ((b * YARD_ROWS + r) * YARD_STACKS + s) * YARD_LINES + line

// ═════════════════════════════════════ containers

let sealSeq = 482100
function makeContainer(origin: string, pod: string, flow: Container['flow'], loc: ContainerLoc, line?: Line): Container {
  const region = flow === 'export' || flow === 'empty' ? 'export' : regionOf(origin)
  const cargo = pick(CARGO_BY_REGION[region])
  const empty = flow === 'empty'
  const reefer = empty ? rnd() < 0.6 : cargo.reefer
  const ln = line ?? (reefer && rnd() < 0.5 ? LINES[5] : pick(LINES.slice(0, 5)))
  const fill = empty ? 0 : irange(58, 100)
  const tare = reefer ? 4.6 : 3.8
  const c: Container = {
    id: containerNumber(ln.code),
    line: ln,
    size: reefer ? "40' RF" : "40' HC",
    reefer,
    cargo: empty ? 'Empty' : cargo.name,
    temp: empty ? undefined : cargo.temp,
    fill,
    weight: empty ? tare : +(tare + (cargo.weight[0] + rnd() * (cargo.weight[1] - cargo.weight[0])) * (fill / 100)).toFixed(1),
    tare,
    origin,
    pod,
    dest: flow === 'import' ? pick(INLAND) : PORTS[pod]?.name ?? pod,
    shipper: empty ? '—' : pick(SHIPPERS[region]),
    consignee: flow === 'import' ? pick(CONSIGNEES) : empty ? '—' : `${pick(['Andes', 'Pacifico', 'Kanto', 'Seoul', 'Vancouver'])} Trading Co.`,
    seal: empty ? '—' : `SL${sealSeq++}`,
    flow,
    loc,
    status: '',
    history: [],
  }
  sim.containers.set(c.id, c)
  return c
}

function originHistory(c: Container, vesselName: string, departT: number, voyageNo: string) {
  const o = PORTS[c.origin]
  const where = o ? `${o.name}, ${o.country}` : c.origin
  if (c.flow !== 'empty') {
    c.history.push({ t: departT - range(4200, 7000), event: 'Empty released to shipper', place: `${o?.name ?? c.origin} depot` })
    c.history.push({ t: departT - range(2600, 4000), event: `Stuffed & sealed (${c.seal})`, place: c.shipper })
  }
  c.history.push({ t: departT - range(1400, 2400), event: 'Gate in · full', place: `${where} terminal` })
  c.history.push({ t: departT - range(180, 900), event: `Loaded on ${vesselName} · ${voyageNo}`, place: where })
  c.history.push({ t: departT, event: 'Vessel departed', place: where })
}

// ═════════════════════════════════════ ships

let shipSeq = 1
let callSeq = 1
export const berthPlace = (b: Berth) => {
  const t = terminalById(b.terminal)
  if (!t) return b.label
  if (t.labelOnly) return b.label
  return t.navy && b.terminal !== 'NASNI' ? `${t.name} · ${b.label}` : t.name
}

function buildVoyageHistory(ship: Ship, arriveT: number) {
  const a = PORTS[ship.voyage.prev]
  const nm = Math.max(40, nmBetween(a, HOME))
  const hours = nm / (ship.cls.speedKn * 0.85)
  const depart = arriveT - hours * 60
  if (ship.cls.navy) ship.history.push({ t: depart - 600, event: 'Underway · fleet exercise', place: PORT.text.exercise ?? 'Operating area' })
  else {
    ship.history.push({ t: depart - range(600, 1100), event: 'Cargo operations completed', place: `${a.name}, ${a.country}` })
    ship.history.push({ t: depart, event: `Departed ${a.name}`, place: `${a.name}, ${a.country}` })
  }
  const n = Math.max(1, Math.min(5, Math.round(hours / 40)))
  for (let i = 1; i <= n; i++) {
    const f = i / (n + 1)
    const p = legPoint(a, HOME, f)
    ship.history.push({ t: depart + (arriveT - depart) * f, event: `AIS position · ${(ship.cls.speedKn * range(0.7, 0.95)).toFixed(1)} kn`, place: fmtLatLon(p.lat, p.lon) })
  }
  ship.history.push({ t: arriveT - range(110, 170), event: 'Pilot boarded', place: PORT.text.pilot })
  return depart
}

function workMinutes(ship: Ship) {
  switch (ship.kind) {
    case 'container':
    case 'feeder':
    case 'neopanamax':
    case 'ulcv':
      // simulated quay cranes: two per ship; other terminals work a full gang of ship-to-shore cranes
      return berthById(ship.berthId).cranes ? ((ship.plannedDischarge + ship.plannedLoad) * 3.2) / 2 + 30 : (ship.plannedDischarge + ship.plannedLoad) / AUTO_RATE + 40
    case 'tanker':
    case 'carcarrier':
      return ship.vehicles!.toDischarge / 9 + 40
    case 'bulk':
      return ship.bulk!.total / 230 + 30
    case 'multipurpose':
      return ship.blades!.total * 12 + 30
    case 'cruise':
      return 420
    default:
      return 600 + rnd() * 900
  }
}


function createShip(kind: ShipKind, berth: Berth, eta: number, callId: string, name?: string): Ship {
  const cls = SHIP_CLASSES[kind]
  const flag = cls.navy ? { name: 'United States', mid: '369' } : pick(FLAGS)
  const line = kind === 'cruise' || cls.navy ? LINES[0] : pick(LINES.slice(0, 5))
  const voyage = voyageFor(kind)
  const gt = Math.round(range(cls.gt[0], cls.gt[1]) / 10) * 10
  const ship: Ship = {
    id: `V${shipSeq++}`,
    name: name ? claimName(name) : shipName(kind),
    kind,
    cls,
    line,
    imo: cls.navy ? '—' : imoNumber(),
    mmsi: mmsi(flag.mid),
    flag: flag.name,
    callSign: cls.navy ? `N${irange(100, 999)}` : callSign(),
    voyageNo: cls.navy ? '—' : `${irange(410, 489)}${pick(['N', 'E', 'S'])}`,
    voyage,
    gt,
    dwt: Math.round((gt * range(0.95, 1.35)) / 10) * 10,
    berthId: berth.id,
    state: 'inbound',
    eta,
    etd: eta,
    readyTimer: 0,
    stall: 0,
    lastProgress: 0,
    speedCap: 99,
    lockHold: 0,
    slots: [],
    toDischarge: new Set(),
    loadPlan: [],
    plannedDischarge: 0,
    plannedLoad: 0,
    discharged: 0,
    loaded: 0,
    cargoVersion: 0,
    cranes: [],
    history: [],
    callId,
    pos: { ...SEA_SPAWN },
    heading: 0,
    path: [],
    speed: 0,
  }
  const departPrev = buildVoyageHistory(ship, eta)

  if (isBoxShip(kind)) {
    const n = slotCount(cls)
    ship.slots = Array(n).fill(null)
    const fillPct = range(0.62, 0.9)
    // a big ship at the simulated terminal exchanges only part of its cargo here (two quay cranes work it)
    let dischargeLeft = berth.cranes && cls.bays! > 10 ? irange(40, 60) : Infinity
    for (let bay = 0; bay < cls.bays!; bay++)
      for (let row = 0; row < cls.rows!; row++) {
        const edge = Math.min(row, cls.rows! - 1 - row)
        const h = Math.min(cls.tiers!, Math.round(fillPct * cls.tiers! + range(-1, 0.8) - (edge === 0 ? 0.6 : 0)))
        const discharge = Math.min(dischargeLeft, irange(0, Math.max(0, h)))
        dischargeLeft -= discharge
        for (let tier = 0; tier < h; tier++) {
          const slot = slotIndex(cls, bay, row, tier)
          const isImport = tier >= h - discharge
          const c = makeContainer(voyage.prev, isImport ? HOME.code : voyage.next, isImport ? 'import' : 'rob', { kind: 'ship', shipId: ship.id, slot })
          c.vesselId = ship.id
          c.vesselName = ship.name
          originHistory(c, ship.name, departPrev, ship.voyageNo)
          c.status = isImport ? `On board · discharge at ${PORT.short}` : `On board · remains for ${PORTS[voyage.next].name}`
          if (isImport) ship.toDischarge.add(c.id)
          ship.slots[slot] = c.id
        }
      }
    ship.plannedDischarge = ship.toDischarge.size
    ship.plannedLoad = Math.min(berth.cranes ? irange(14, 30) : Math.round(ship.plannedDischarge * range(0.6, 1)), n - ship.slots.filter(Boolean).length + ship.plannedDischarge)
  } else if (kind === 'carcarrier') {
    const total = irange(3600, 5600)
    const planned = Math.round(total * range(0.55, 0.85))
    ship.vehicles = { brand: pick(VEHICLE_BRANDS), total, onboard: total, toDischarge: planned, planned, acc: 0 }
  } else if (kind === 'bulk') {
    const total = irange(24, 34) * 1000
    ship.bulk = { cargo: pick(BULK_CARGO), total, remaining: total }
  } else if (kind === 'tanker') {
    const total = irange(95, 120) * 1000
    ship.bulk = { cargo: 'Crude oil (Alaska North Slope)', total, remaining: total }
  } else if (kind === 'multipurpose') {
    const total = irange(9, 12)
    ship.blades = { total, onboard: total, acc: 0 }
  } else if (kind === 'cruise') {
    ship.passengers = { total: irange(2400, 4600), ashore: 0, line: pick(PORT.cruiseLines) }
  } else if (cls.navy) {
    const k = kind as 'destroyer' | 'cruiser' | 'amphib' | 'carrier'
    const no = { destroyer: irange(131, 139), cruiser: irange(74, 79), amphib: irange(9, 12), carrier: 82 }[k]
    ship.navy = {
      hull: `${HULL_PREFIX[kind]}-${no}`,
      crew: { destroyer: irange(300, 330), cruiser: irange(330, 360), amphib: irange(1100, 1200), carrier: irange(3000, 3200) }[k],
      status: pick(['In port · maintenance period', 'In port · pre-deployment workups', 'In port · liberty', 'In port · crew certification']),
      commissioned: irange(2014, 2025),
    }
  }
  ship.etd = eta + workMinutes(ship) + 25
  sim.ships.push(ship)
  sim.version++
  return ship
}

const ACTIVE: ShipState[] = ['approach', 'berthing', 'working', 'ready', 'unberthing']
const berthBusy = (b: Berth, except?: Ship) =>
  sim.ships.some((s) => s !== except && s.berthId === b.id && (ACTIVE.includes(s.state) || ((s.state === 'inbound' || s.state === 'waiting') && s.anchorIdx === undefined)))

function setCall(ship: Ship, status: Call['status']) {
  const c = sim.calls.find((x) => x.id === ship.callId)
  if (c) {
    c.status = status
    c.shipId = ship.id
    c.etd = ship.etd
  }
}

/** channel leg from wherever the ship is to the berth's junction node */
/** inbound lane up to the berth's junction, then aside to its waiting spot if it has one */
const laneToBerth = (b: Berth, fromNode: number) => [...inboundLane(fromNode, b.junction), ...(b.wait ? [b.wait] : [])]

function sendToBerth(ship: Ship, fromNode = 1) {
  const b = berthById(ship.berthId)
  ship.anchorIdx = undefined
  ship.state = 'inbound'
  ship.path = buildPath(ship.pos, laneToBerth(b, fromNode))
  ship.finalHeading = undefined
  setCall(ship, 'arriving')
}

function spawnInbound(call: Call, fromNode = 0) {
  const b = berthById(call.berthId)
  const ship = createShip(call.kind, b, call.eta, call.id, call.name)
  const start = fromNode > 0 ? inboundLane(fromNode, fromNode)[0] : SEA_SPAWN
  ship.pos = { x: start.x, z: start.z }
  ship.speed = 6
  call.shipId = ship.id
  ship.history.push({ t: sim.time, event: PORT.text.arrived, place: PORT.text.seaBuoy })
  if (berthBusy(b, ship)) {
    const taken = new Set(sim.ships.filter((s) => s !== ship && s.anchorIdx !== undefined).map((s) => s.anchorIdx))
    let idx = 0
    while (taken.has(idx)) idx++
    ship.anchorIdx = idx
    ship.path = buildPath(ship.pos, anchorageIn(idx, ship.pos))
    ship.finalHeading = -Math.PI / 4
    call.status = 'anchored'
    alert(`${ship.name} to anchorage — ${b.id} occupied`, 'amber', { type: 'ship', id: ship.id })
  } else sendToBerth(ship, Math.max(1, fromNode + 1))
  if (ship.path.length) ship.heading = Math.atan2(ship.path[0].x - ship.pos.x, ship.path[0].z - ship.pos.z)
  return ship
}

function placeAtBerth(ship: Ship, b: Berth) {
  const p = b.pose(ship.cls.beam, ship.cls.length)
  ship.pos = { x: p.x, z: p.z }
  ship.heading = p.heading
  ship.finalHeading = p.heading
}

function spawnBerthed(call: Call, progress: number) {
  const b = berthById(call.berthId)
  const ship = createShip(call.kind, b, call.eta, call.id, call.name)
  placeAtBerth(ship, b)
  ship.state = 'working'
  ship.ataBerth = call.eta
  ship.history.push({ t: call.eta - 70, event: PORT.text.entered, place: PORT.text.enteredPlace })
  ship.history.push({ t: call.eta, event: `All fast · ${b.id}`, place: berthPlace(b) })
  if (!ship.cls.navy) ship.history.push({ t: call.eta + 20, event: ship.kind === 'cruise' ? 'Passenger disembarkation started' : 'Cargo operations started', place: berthPlace(b) })
  if (isBoxShip(ship.kind)) {
    const k = Math.floor(ship.toDischarge.size * progress)
    const ids = [...ship.toDischarge]
    let removed = 0
    for (let tier = ship.cls.tiers! - 1; tier >= 0 && removed < k; tier--)
      for (const id of ids) {
        const c = sim.containers.get(id)!
        if (c.loc.kind !== 'ship' || removed >= k) continue
        const l = slotLocal(ship.cls, c.loc.slot)
        if (l.tier !== tier) continue
        if (l.tier < ship.cls.tiers! - 1 && ship.slots[slotIndex(ship.cls, l.bay, l.row, l.tier + 1)]) continue
        ship.slots[c.loc.slot] = null
        ship.toDischarge.delete(id)
        ship.discharged++
        removed++
        if (b.cranes) placeInYardRandom(c, ship)
        else autoDischarged(c, ship, b)
      }
  } else if (ship.vehicles) {
    const d = Math.round(ship.vehicles.toDischarge * progress)
    ship.vehicles.onboard -= d
    ship.vehicles.toDischarge -= d
  } else if (ship.bulk) ship.bulk.remaining = Math.round(ship.bulk.total * (1 - progress))
  else if (ship.blades) {
    const d = Math.floor(ship.blades.total * progress)
    ship.blades.onboard -= d
    sim.laydown += d
  } else if (ship.passengers) ship.passengers.ashore = Math.round(ship.passengers.total * progress)
  call.shipId = ship.id
  call.status = 'working'
  return ship
}

// ───────── speed & collision avoidance

const SPEEDS = PORT.speeds ?? { approach: 3.4, rev: 1.6, manoeuvre: 4 }
const baseSpeed = (s: Ship) => (p: PathPoint) => {
  const v = p.hold ? 0.9 : p.rev ? SPEEDS.rev : s.state === 'approach' ? SPEEDS.approach : s.state === 'inbound' || s.state === 'outbound' ? 11 : SPEEDS.manoeuvre
  return Math.min(v, s.speedCap)
}

const PRIORITY: Partial<Record<ShipState, number>> = { unberthing: 4, approach: 3, berthing: 3, outbound: 2, inbound: 1, waiting: 0 }
const MOVING: ShipState[] = ['inbound', 'outbound', 'approach', 'unberthing']

function forwardOf(s: Ship) {
  const rev = s.path.length > 0 && s.path[0].rev
  return { fx: Math.sin(s.heading) * (rev ? -1 : 1), fz: Math.cos(s.heading) * (rev ? -1 : 1) }
}

/** is any part of `o`'s hull inside `s`'s look-ahead corridor? (samples along the hull so long ships crossing are caught) */
function ahead(s: Ship, o: Ship) {
  if (o.state === 'working' || o.state === 'ready' || o.state === 'anchored') return null // kept clear by route design
  const { fx, fz } = forwardOf(s)
  const ox = Math.sin(o.heading)
  const oz = Math.cos(o.heading)
  const safe = s.cls.length / 2 + 40 + s.speed * 8
  const half = s.cls.beam / 2 + o.cls.beam / 2 + 10
  let best: number | null = null
  for (const k of [-0.5, -0.25, 0, 0.25, 0.5]) {
    const px = o.pos.x + ox * o.cls.length * k - s.pos.x
    const pz = o.pos.z + oz * o.cls.length * k - s.pos.z
    const along = px * fx + pz * fz
    if (along <= s.cls.length / 2 - 4 && along <= 0) continue
    if (along < 0) continue
    const lateral = Math.abs(px * fz - pz * fx)
    if (along < safe && lateral < half && (best === null || along < best)) best = along
  }
  return best === null ? null : { along: best, safe }
}

/** keep a safe gap to any vessel ahead; on a mutual conflict the higher-priority vessel keeps going */
function avoidance(ship: Ship) {
  ship.speedCap = 99
  ship.blockedBy = undefined
  if (!MOVING.includes(ship.state) || !ship.path.length) return
  // a ship merging into the lane from the anchorage gives way to everyone already in it
  const mine = ship.merging ? -1 : PRIORITY[ship.state] ?? 0
  for (const o of sim.ships) {
    if (o === ship) continue
    const hit = ahead(ship, o)
    if (!hit) continue
    if (MOVING.includes(o.state) && o.path.length && ahead(o, ship)) {
      const theirs = o.merging ? -1 : PRIORITY[o.state] ?? 0
      if (mine > theirs || (mine === theirs && ship.id < o.id)) continue
    }
    const cap = hit.along < hit.safe * 0.55 ? 0 : Math.max(0, o.speed * 0.8)
    if (cap < ship.speedCap) {
      ship.speedCap = cap
      ship.blockedBy = o.id
    }
  }
}

const MANOEUVRING: ShipState[] = ['approach', 'berthing', 'unberthing']
const inZone = (x: number, z: number, t: string) => {
  const zn = ZONES[t]
  return !!zn && (Array.isArray(zn) ? zn : [zn]).some((c) => Math.hypot(x - c.x, z - c.z) < c.r)
}
/** a basin is busy for `ship` if anyone else is manoeuvring in it, or other traffic is passing through it */
function basinClear(ship: Ship, t: string) {
  const zn = ZONES[t]
  if (!zn) return true
  return !sim.ships.some(
    (o) =>
      o !== ship &&
      !o.static &&
      (MANOEUVRING.includes(o.state) || o.state === 'inbound' || o.state === 'outbound') &&
      inZone(o.pos.x, o.pos.z, t) &&
      !(o.state === 'inbound' && o.berthId === ship.berthId) &&
      // ships queued behind me in the lane are waiting for me, not the other way round
      !(o.blockedBy === ship.id && o.speed < 0.5),
  )
}
/** through traffic holds short of a basin where another vessel is manoeuvring */
function holdForBasins(ship: Ship) {
  if (ship.state !== 'inbound' && ship.state !== 'outbound') return
  const mine = lockOf(berthById(ship.berthId))
  for (const t of Object.keys(ZONES)) {
    const holder = shipById(sim.locks[t])
    if (!holder || holder === ship || !MANOEUVRING.includes(holder.state)) continue
    if (t === mine && ship.state === 'inbound') continue // handled by the junction hold
    if (inZone(ship.pos.x, ship.pos.z, t)) continue // already inside: keep going and clear out
    const look = Math.min(ship.path.length, 500)
    for (let i = 0; i < look; i += 10) {
      const p = ship.path[i]
      if (inZone(p.x, p.z, t)) {
        ship.speedCap = 0
        ship.blockedBy = holder.id
        return
      }
    }
  }
}

function stepShip(ship: Ship, dt: number) {
  if (ship.static) return
  const b = berthById(ship.berthId)
  avoidance(ship)
  holdForBasins(ship)
  if (ship.state === 'inbound' && ship.anchorIdx === undefined) {
    const holder = sim.locks[lockOf(b)]
    // hold short of the junction while another vessel manoeuvres in the basin (berths with a waiting spot wait there instead),
    // but never stop inside another basin where someone is manoeuvring – keep going and clear it
    const inBusyBasin = Object.keys(ZONES).some((t) => t !== lockOf(b) && inZone(ship.pos.x, ship.pos.z, t) && MANOEUVRING.includes(shipById(sim.locks[t])?.state ?? 'outbound'))
    if (holder && holder !== ship.id && !b.wait && !inBusyBasin && ship.path.length * 0.8 < 320) {
      ship.speedCap = 0
      ship.blockedBy = holder
    }
  }
  const done = follow(ship, dt, baseSpeed(ship), 2.2, 0.05)

  if (ship.merging) {
    const e = inboundLane(PORT.anchorJoin, PORT.anchorJoin)[0]
    if (Math.hypot(ship.pos.x - e.x, ship.pos.z - e.z) < 40) ship.merging = false
  }
  switch (ship.state) {
    case 'inbound':
      if (done) {
        if (ship.anchorIdx !== undefined) {
          ship.state = 'anchored'
          ship.history.push({ t: sim.time, event: 'Anchored · awaiting berth', place: `${PORT.text.anchorage} A${ship.anchorIdx + 1} (offshore)` })
        } else {
          ship.state = 'waiting'
          ship.history.push({ t: sim.time, event: PORT.text.inside, place: 'Main channel' })
        }
      }
      break
    case 'waiting': {
      const holder = sim.locks[lockOf(b)]
      if ((!holder || holder === ship.id) && basinClear(ship, lockOf(b))) {
        sim.locks[lockOf(b)] = ship.id
        ship.state = 'approach'
        ship.path = buildPath(ship.pos, b.arrival(ship.cls.beam, ship.cls.length))
        ship.finalHeading = b.pose(ship.cls.beam, ship.cls.length).heading
        ship.history.push({ t: sim.time, event: 'Tugs fast · approaching berth', place: berthPlace(b) })
      }
      break
    }
    case 'anchored': {
      const entry = inboundLane(PORT.anchorJoin, PORT.anchorJoin)[0]
      const laneClear = !sim.ships.some((o) => o !== ship && (o.state === 'inbound' || o.state === 'outbound') && Math.hypot(o.pos.x - entry.x, o.pos.z - entry.z) < 1100)
      // one ship at a time leaves the anchorage field
      const nobodyLeaving = !sim.ships.some((o) => o !== ship && o.merging)
      if (laneClear && nobodyLeaving && !berthBusy(b, ship) && !sim.ships.some((s) => s !== ship && s.berthId === b.id && s.state === 'anchored' && (s.anchorIdx ?? 0) < (ship.anchorIdx ?? 0))) {
        ship.history.push({ t: sim.time, event: 'Anchor aweigh · proceeding to berth', place: PORT.text.anchorage })
        const idx = ship.anchorIdx ?? 0
        sendToBerth(ship, 1)
        ship.path = buildPath(ship.pos, [...anchorageOut(idx), ...laneToBerth(b, PORT.anchorJoin)])
        ship.merging = true
      }
      break
    }
    case 'approach':
      if (ship.path.length && ship.path[0].hold) ship.state = 'berthing'
      if (done) arriveBerth(ship, b)
      break
    case 'berthing':
      if (done) arriveBerth(ship, b)
      break
    case 'working':
      stepWork(ship, dt)
      break
    case 'ready': {
      ship.readyTimer += dt
      const holder = sim.locks[lockOf(b)]
      if (ship.readyTimer > 6 && (!holder || holder === ship.id) && basinClear(ship, lockOf(b))) {
        sim.locks[lockOf(b)] = ship.id
        ship.state = 'unberthing'
        ship.path = buildPath(ship.pos, b.departure(ship.cls.beam, ship.cls.length))
        ship.finalHeading = undefined
        ship.etd = sim.time
        ship.history.push({ t: sim.time, event: 'Unberthing · tugs fast', place: berthPlace(b) })
        setCall(ship, 'departed')
      }
      break
    }
    case 'unberthing':
      // (re-checked every frame once the departure manoeuvre is complete, until the lane is clear)
      if (done || !ship.path.length) {
        // merge into the outbound lane only with a clear gap to traffic already in it,
        // and only cross the inbound lane when nobody is coming up it towards the crossing point
        const k = outboundEntry(ship.pos.x, ship.pos.z, b.junction)
        const entry = outboundLane(k, k)[0]
        const busy = sim.ships.some(
          (o) =>
            o !== ship &&
            ((o.state === 'outbound' && Math.hypot(o.pos.x - ship.pos.x, o.pos.z - ship.pos.z) < (o.cls.length + ship.cls.length) / 2 + 160) ||
              (o.state === 'inbound' && o.speed > 0.5 && Math.hypot(o.pos.x - entry.x, o.pos.z - entry.z) < 650)),
        )
        if (busy) break
        ship.lockHold = 360
        ship.state = 'outbound'
        ship.path = buildPath(ship.pos, [...outboundLane(k, 1), EXIT])
        ship.history.push({ t: sim.time, event: `Departed for ${PORTS[ship.voyage.next].name}`, place: berthPlace(b) })
        alert(`${ship.name} departed ${b.id} for ${PORTS[ship.voyage.next].name}`, 'blue', { type: 'ship', id: ship.id })
      }
      break
    case 'outbound':
      if (ship.lockHold > 0) {
        ship.lockHold -= ship.speed * dt
        // a departure held up by traffic outside its own basin no longer needs the basin
        const heldOutside = ship.speed < 0.3 && ZONES[lockOf(b)] && !inZone(ship.pos.x, ship.pos.z, lockOf(b))
        if ((ship.lockHold <= 0 || heldOutside) && sim.locks[lockOf(b)] === ship.id) {
          delete sim.locks[lockOf(b)]
          ship.lockHold = 0
        }
      }
      if (done) {
        if (sim.locks[lockOf(b)] === ship.id) delete sim.locks[lockOf(b)]
        sim.ships.splice(sim.ships.indexOf(ship), 1)
        releaseName(ship.name)
        sim.version++
      }
      break
  }
}

function arriveBerth(ship: Ship, b: Berth) {
  if (sim.locks[lockOf(b)] === ship.id) delete sim.locks[lockOf(b)]
  ship.state = 'working'
  ship.ataBerth = sim.time
  ship.heading = b.pose(ship.cls.beam, ship.cls.length).heading
  ship.etd = sim.time + workMinutes(ship) + 20
  ship.history.push({ t: sim.time, event: `All fast · ${b.id}`, place: berthPlace(b) })
  if (!ship.cls.navy) ship.history.push({ t: sim.time + 0.1, event: ship.kind === 'cruise' ? 'Passenger disembarkation started' : 'Cargo operations started', place: berthPlace(b) })
  if (ship.navy) ship.navy.status = 'In port · liberty'
  setCall(ship, 'working')
  alert(`${ship.name} berthed at ${b.label}`, 'green', { type: 'ship', id: ship.id })
  sim.version++
}

function planLoad(ship: Ship) {
  if (ship.loadPlan.length || ship.loaded) return
  const sx = ctLocal(ship.pos.x, ship.pos.z).x
  const cands: { c: Container; d: number }[] = []
  for (let blk = 0; blk < BLOCKS.length; blk++)
    for (let r = 0; r < YARD_ROWS; r++)
      for (let s = 0; s < YARD_STACKS; s++) {
        if (reservedStacks.has(stackKey(blk, r, s))) continue
        const h = stackHeight(blk, r, s)
        if (!h) continue
        const c = containerById(sim.yard[yardSlotIndex(blk, r, s, 0, h - 1)] ?? undefined)
        if (!c || c.vesselId || c.flow === 'import') continue
        cands.push({ c, d: Math.abs(stackX(blk, s) - sx) + r * 18 + rnd() * 30 })
      }
  cands.sort((a, b) => a.d - b.d)
  ship.loadPlan = cands.slice(0, ship.plannedLoad).map(({ c }) => {
    c.vesselId = ship.id
    c.vesselName = ship.name
    c.pod = ship.voyage.next
    c.dest = PORTS[ship.voyage.next].name
    c.status = `Planned load · ${ship.name}`
    c.history.push({ t: sim.time, event: `Booked on ${ship.name} · ${ship.voyageNo}`, place: `${CT} planning` })
    return c.id
  })
  ship.plannedLoad = ship.loadPlan.length
}

function stepWork(ship: Ship, dt: number) {
  const mins = dt * SIM_MIN_PER_SEC
  const b = berthById(ship.berthId)
  let finished = false
  if (isBoxShip(ship.kind) && !b.cranes) finished = stepAutoWork(ship, b, mins)
  else if (isBoxShip(ship.kind)) {
    if (!ship.toDischarge.size) planLoad(ship)
    const progress = ship.discharged + ship.loaded
    ship.stall = progress === ship.lastProgress ? ship.stall + mins : 0
    ship.lastProgress = progress
    if (ship.stall > 45 && !ship.toDischarge.size) {
      for (const id of ship.loadPlan) {
        const c = containerById(id)
        if (c && c.loc.kind === 'yard') {
          c.vesselId = undefined
          c.status = 'In yard · rolled to next vessel'
          c.history.push({ t: sim.time, event: `Rolled · not loaded on ${ship.name}`, place: `${CT} planning` })
        }
      }
      ship.loadPlan = ship.loadPlan.filter((id) => containerById(id)?.loc.kind !== 'yard')
      ship.plannedLoad = ship.loaded + ship.loadPlan.length
      ship.stall = 0
    }
    finished = !ship.toDischarge.size && ship.loaded >= ship.plannedLoad && !sim.cranes.some((c) => c.shipId === ship.id && (c.job || c.carrying))
    if (finished) for (const c of sim.cranes) if (c.shipId === ship.id) releaseCrane(c)
  } else if (ship.vehicles) {
    const v = ship.vehicles
    v.acc += mins * 9
    while (v.acc >= 12 && v.toDischarge > 0) {
      v.acc -= 12
      const n = Math.min(12, v.toDischarge)
      v.toDischarge -= n
      v.onboard -= n
      spawnCar(ship)
    }
    finished = v.toDischarge <= 0 && !sim.cars.some((c) => c.shipId === ship.id)
  } else if (ship.bulk) {
    ship.bulk.remaining = Math.max(0, ship.bulk.remaining - mins * 230)
    finished = ship.bulk.remaining <= 0
  } else if (ship.blades) {
    ship.blades.acc += mins
    if (ship.blades.acc >= 12 && ship.blades.onboard > 0) {
      ship.blades.acc = 0
      ship.blades.onboard--
      sim.laydown++
      ship.cargoVersion++
    }
    finished = ship.blades.onboard <= 0
  } else if (ship.passengers) {
    ship.passengers.ashore = Math.min(ship.passengers.total, ship.passengers.ashore + mins * 18)
    finished = ship.passengers.ashore >= ship.passengers.total && sim.time > (ship.ataBerth ?? 0) + 300
  }
  if (finished) {
    ship.state = 'ready'
    ship.readyTimer = 0
    ship.history.push({ t: sim.time, event: ship.kind === 'cruise' ? 'All aboard · gangways secured' : 'Cargo operations completed', place: berthPlace(b) })
  }
}

export function shipProgress(ship: Ship) {
  if (isBoxShip(ship.kind)) {
    const total = ship.plannedDischarge + ship.plannedLoad
    return total ? (ship.discharged + ship.loaded) / total : 1
  }
  if (ship.vehicles) return 1 - ship.vehicles.toDischarge / ship.vehicles.planned
  if (ship.bulk) return 1 - ship.bulk.remaining / ship.bulk.total
  if (ship.blades) return 1 - ship.blades.onboard / ship.blades.total
  if (ship.passengers) return ship.passengers.ashore / ship.passengers.total
  return 0
}
export const shipOnboard = (ship: Ship) => ship.slots.filter(Boolean).length

// ───────── container ships at the other terminals (a full gang of quay cranes, worked at a steady rate)

/** box moves per sim minute across a terminal's crane gang */
const AUTO_RATE = 3
export const CRANE_NAME = PORT.ct.crane === 'sts' ? 'STS' : 'MHC'
const IMPORT_ORIGINS = PORT.id === 'long-beach' ? ['CNSHA', 'CNYTN', 'CNNGB', 'KRPUS', 'TWKHH', 'VNCMT', 'JPYOK'] : ['GTPRQ', 'CRCAL', 'ECGYE', 'MXZLO', 'CNSHA', 'KRPUS']

function autoDischarged(c: Container, ship: Ship, b: Berth, t = sim.time) {
  const term = terminalById(b.terminal)
  c.loc = { kind: 'gone', where: `${term?.code ?? b.terminal} yard` }
  c.vesselId = undefined
  c.history.push({ t, event: `Discharged · ${ship.name}`, place: `${term?.code ?? b.terminal} ${b.id} · quay crane` })
  c.history.push({ t: t + 3, event: 'Stacked in yard', place: `${term?.name ?? b.terminal}` })
  c.status = `In ${term?.code ?? 'terminal'} yard · awaiting pickup`
}

/** discharge from the top of each stack, then load exports bottom-up into the free slots */
function stepAutoWork(ship: Ship, b: Berth, mins: number) {
  ship.autoAcc = (ship.autoAcc ?? 0) + mins * AUTO_RATE
  const cls = ship.cls
  while (ship.autoAcc >= 1) {
    ship.autoAcc -= 1
    if (ship.toDischarge.size) {
      let done = false
      for (let tier = cls.tiers! - 1; tier >= 0 && !done; tier--)
        for (let bay = 0; bay < cls.bays! && !done; bay++)
          for (let row = 0; row < cls.rows! && !done; row++) {
            const slot = slotIndex(cls, bay, row, tier)
            const id = ship.slots[slot]
            if (!id || !ship.toDischarge.has(id)) continue
            if (tier < cls.tiers! - 1 && ship.slots[slotIndex(cls, bay, row, tier + 1)]) continue
            ship.slots[slot] = null
            ship.toDischarge.delete(id)
            ship.discharged++
            autoDischarged(containerById(id)!, ship, b)
            done = true
          }
      if (!done) ship.toDischarge.clear()
    } else if (ship.loaded < ship.plannedLoad) {
      let slot = -1
      for (let tier = 0; tier < cls.tiers! && slot < 0; tier++)
        for (let bay = 0; bay < cls.bays! && slot < 0; bay++)
          for (let row = 0; row < cls.rows! && slot < 0; row++) {
            const k = slotIndex(cls, bay, row, tier)
            if (!ship.slots[k] && (tier === 0 || ship.slots[slotIndex(cls, bay, row, tier - 1)])) slot = k
          }
      if (slot < 0) {
        ship.plannedLoad = ship.loaded
        break
      }
      const flow: Container['flow'] = rnd() < 0.7 ? 'export' : 'empty'
      const c = makeContainer(HOME.code, ship.voyage.next, flow, { kind: 'ship', shipId: ship.id, slot })
      const term = terminalById(b.terminal)
      c.vesselId = ship.id
      c.vesselName = ship.name
      c.history.push({ t: sim.time - range(600, 3000), event: flow === 'empty' ? 'Gate in · empty return' : 'Gate in · full export', place: `${term?.code ?? b.terminal} gate · truck` })
      c.history.push({ t: sim.time, event: `Loaded on ${ship.name} · ${ship.voyageNo}`, place: `${term?.code ?? b.terminal} ${b.id} · quay crane` })
      c.status = `On board ${ship.name} · to ${PORTS[ship.voyage.next].name}`
      ship.slots[slot] = c.id
      ship.loaded++
    } else break
    ship.cargoVersion++
    sim.teuToday += 2
  }
  return !ship.toDischarge.size && ship.loaded >= ship.plannedLoad
}

// ═════════════════════════════════════ yard

const reservedStacks = new Set<number>()

function freeStack(nearX: number) {
  let best: { blk: number; r: number; s: number; h: number; d: number } | null = null
  for (let blk = 0; blk < BLOCKS.length; blk++)
    for (let r = 0; r < YARD_ROWS; r++)
      for (let s = 0; s < YARD_STACKS; s++) {
        if (reservedStacks.has(stackKey(blk, r, s))) continue
        const h = stackHeight(blk, r, s)
        if (h >= 3) continue
        if (h > 0) {
          const top = containerById(sim.yard[yardSlotIndex(blk, r, s, 0, h - 1)] ?? undefined)
          if (top?.vesselId && top.flow !== 'import') continue
        }
        const d = Math.abs(stackX(blk, s) - nearX) + r * 22 + h * 6 + rnd() * 25
        if (!best || d < best.d) best = { blk, r, s, h, d }
      }
  return best
}

function placeInYardRandom(c: Container, ship: Ship) {
  const st = freeStack(ctLocal(ship.pos.x, ship.pos.z).x)
  if (!st) {
    c.loc = { kind: 'gone', where: 'Off-dock' }
    return
  }
  const slot = yardSlotIndex(st.blk, st.r, st.s, 0, st.h)
  sim.yard[slot] = c.id
  c.loc = { kind: 'yard', slot }
  const t = (ship.ataBerth ?? sim.time) + range(25, Math.max(30, sim.time - (ship.ataBerth ?? sim.time)))
  c.history.push({ t: Math.min(t, sim.time - 1), event: `Discharged · ${ship.name}`, place: `${CT} · ${CRANE_NAME}` })
  c.history.push({ t: Math.min(t + 4, sim.time), event: 'Stacked in yard', place: yardLabel(slot) })
  c.status = c.reefer ? 'In yard · reefer plugged in' : 'In yard · awaiting customs release'
  c.vesselId = undefined
}

function initYard() {
  sim.yard = Array(YARD_SLOTS).fill(null)
  for (let blk = 0; blk < BLOCKS.length; blk++)
    for (let r = 0; r < YARD_ROWS; r++)
      for (let s = 0; s < YARD_STACKS; s++)
        for (let line = 0; line < YARD_LINES; line++) {
          const h = line > 0 ? irange(1, 3) : irange(0, 3)
          for (let t = 0; t < h; t++) {
            if (rnd() < 0.08) break
            const slot = yardSlotIndex(blk, r, s, line, t)
            const kind = rnd()
            const flow: Container['flow'] = kind < 0.45 ? 'import' : kind < 0.8 ? 'export' : 'empty'
            const reeferBlock = blk === 1 && r === 0
            const origin = flow === 'import' ? pick(IMPORT_ORIGINS) : HOME.code
            const c = makeContainer(origin, flow === 'import' ? HOME.code : pick(EXPORT_DESTS()), flow, { kind: 'yard', slot }, reeferBlock ? LINES[5] : undefined)
            if (reeferBlock && !c.reefer) {
              c.reefer = true
              c.size = "40' RF"
              c.temp = c.cargo === 'Empty' ? undefined : -18
            }
            const age = range(200, 4800)
            if (flow === 'import') {
              originHistory(c, pick(['Azul Horizon', 'Rio Lempa', 'Coral Trader']), sim.time - age - range(4000, 9000), `${irange(400, 409)}N`)
              c.history.push({ t: sim.time - age, event: 'Discharged', place: `${CT} · ${CRANE_NAME}` })
              c.history.push({ t: sim.time - age + 6, event: 'Stacked in yard', place: yardLabel(slot) })
              const released = rnd() < 0.6
              if (released) c.history.push({ t: sim.time - age + range(60, 180), event: 'Customs released (CBP)', place: CT })
              c.status = released ? 'In yard · awaiting truck pickup' : 'In yard · customs hold'
            } else {
              c.history.push({ t: sim.time - age, event: flow === 'empty' ? 'Gate in · empty return' : 'Gate in · full export', place: `${PORT.ct.gate} 1 · truck` })
              c.history.push({ t: sim.time - age + 8, event: 'Stacked in yard', place: yardLabel(slot) })
              c.status = flow === 'empty' ? 'In yard · empty, available' : 'In yard · awaiting vessel'
            }
            sim.yard[slot] = c.id
          }
        }
}

function stepGate(dt: number) {
  sim.gateTimer -= dt * SIM_MIN_PER_SEC
  if (sim.gateTimer > 0) return
  sim.gateTimer = range(1.4, 3)
  const util = sim.yard.filter(Boolean).length / sim.yard.length
  if (util > 0.42 || rnd() < 0.5) {
    for (let tries = 0; tries < 40; tries++) {
      const blk = irange(0, BLOCKS.length - 1)
      const r = irange(0, YARD_ROWS - 1)
      const s = irange(0, YARD_STACKS - 1)
      if (reservedStacks.has(stackKey(blk, r, s))) continue
      const h = stackHeight(blk, r, s)
      if (!h) continue
      const slot = yardSlotIndex(blk, r, s, 0, h - 1)
      const c = containerById(sim.yard[slot] ?? undefined)
      if (!c || c.flow !== 'import' || c.status.includes('hold') || c.loc.kind !== 'yard') continue
      sim.yard[slot] = null
      c.loc = { kind: 'gone', where: c.dest }
      c.history.push({ t: sim.time, event: 'Gate out · full', place: `${PORT.ct.gate} 2 · truck to ${c.dest}` })
      c.status = `Out-gated · en route to ${c.dest}`
      sim.yardVersion++
      sim.teuToday += 2
      return
    }
  }
  if (util < 0.62) {
    const st = freeStack(range(-150, 160))
    if (!st) return
    const slot = yardSlotIndex(st.blk, st.r, st.s, 0, st.h)
    const flow: Container['flow'] = rnd() < 0.6 ? 'export' : 'empty'
    const c = makeContainer(HOME.code, pick(EXPORT_DESTS()), flow, { kind: 'yard', slot })
    c.history.push({ t: sim.time, event: flow === 'empty' ? 'Gate in · empty return' : 'Gate in · full export', place: `${PORT.ct.gate} 1 · truck` })
    c.history.push({ t: sim.time + 0.1, event: 'Stacked in yard', place: yardLabel(slot) })
    c.status = flow === 'empty' ? 'In yard · empty, available' : 'In yard · awaiting vessel'
    sim.yard[slot] = c.id
    sim.yardVersion++
    sim.teuToday += 2
  }
}

// ═════════════════════════════════════ quay cranes (terminal-local frame)

const SAFE_Y = 24
export const BOOM = PORT.ct.boom

export const craneTip = (c: Crane) => ({ x: c.x + Math.sin(c.slew) * c.radius, z: CRANE_Z + Math.cos(c.slew) * c.radius })
export const transferPos = (c: Crane, idx: number) => ({ x: c.x + (idx === 0 ? -8 : 8), y: LAND_Y + 0.65, z: TRANSFER_Z })

const targetPos = (c: Crane, t: Target) => (t.kind === 'transfer' ? transferPos(c, t.idx) : slotTamt(shipById(t.shipId)!, t.slot))

function releaseCrane(c: Crane) {
  const ship = shipById(c.shipId)
  if (ship) ship.cranes = ship.cranes.filter((x) => x !== c.id)
  c.shipId = undefined
  c.side = 0
  c.status = 'Idle'
}

function assignCranes() {
  const working = sim.ships.filter((s) => isBoxShip(s.kind) && berthById(s.berthId).cranes && s.state === 'working' && (s.toDischarge.size || s.loaded < s.plannedLoad))
  const starving = working.find((s) => s.cranes.length === 0)
  if (starving) {
    const rich = working.find((s) => s.cranes.length > 1)
    const spare = rich && rich.cranes.map((id) => craneById(id)!).find((c) => !c.job && !c.carrying && !c.transfer.some((t) => t.cid || t.reserved))
    if (rich && spare) {
      releaseCrane(spare)
      const keep = craneById(rich.cranes[0])
      if (keep) {
        keep.side = 0
        keep.targetX = ctLocal(rich.pos.x, rich.pos.z).x
      }
    }
  }
  for (const c of sim.cranes) {
    if (c.shipId || c.job || c.carrying || c.transfer.some((t) => t.cid || t.reserved)) continue
    const target = working
      .filter((s) => s.cranes.length < (starving && s !== starving ? 1 : 2))
      .sort((a, b) => a.cranes.length - b.cranes.length || Math.abs(ctLocal(a.pos.x, a.pos.z).x - c.x) - Math.abs(ctLocal(b.pos.x, b.pos.z).x - c.x))[0]
    if (!target) continue
    target.cranes.push(c.id)
    c.shipId = target.id
    const bx = ctLocal(target.pos.x, target.pos.z).x
    if (target.cranes.length === 1) {
      c.side = 0
      c.targetX = bx
    } else {
      const other = craneById(target.cranes[0])!
      const otherLeft = other.x < c.x
      other.side = otherLeft ? -1 : 1
      c.side = otherLeft ? 1 : -1
      other.targetX = bx + other.side * 20
      c.targetX = bx + c.side * 20
    }
    c.status = `Assigned to ${target.name}`
  }
}

function stackTop(ship: Ship, bay: number, row: number) {
  let h = 0
  while (h < ship.cls.tiers! && ship.slots[slotIndex(ship.cls, bay, row, h)]) h++
  return h
}

function bayInReach(c: Crane, ship: Ship, slot: number) {
  const w = slotTamt(ship, slot)
  const d = Math.hypot(w.x - c.x, w.z - CRANE_Z)
  if (d > BOOM - 1 || d < 9) return false
  const cx = ctLocal(ship.pos.x, ship.pos.z).x
  if (c.side !== 0 && Math.sign(w.x - cx) !== c.side && Math.abs(w.x - cx) > 4) return false
  return true
}

const reservedShipSlots = new Set<string>()

/** ship-to-shore cranes gantry along the quay to the next bay they can work (a slewing harbour crane stays put) */
function gantryToNearest(c: Crane, ship: Ship, type: 'discharge' | 'load') {
  if (PORT.ct.crane !== 'sts' || c.transfer.some((t) => t.cid && type === 'discharge')) return
  const cls = ship.cls
  let bestX: number | null = null
  for (let bay = 0; bay < cls.bays!; bay++)
    for (let row = 0; row < cls.rows!; row++) {
      const h = stackTop(ship, bay, row)
      const slot = type === 'discharge' ? (h ? slotIndex(cls, bay, row, h - 1) : -1) : h < cls.tiers! ? slotIndex(cls, bay, row, h) : -1
      if (slot < 0 || reservedShipSlots.has(`${ship.id}:${slot}`)) continue
      if (type === 'discharge' && !ship.toDischarge.has(ship.slots[slot]!)) continue
      const x = slotTamt(ship, slot).x
      // keep clear of the other crane working this ship
      if (sim.cranes.some((o) => o !== c && o.shipId === ship.id && Math.abs(o.x - x) < 16)) continue
      if (bestX === null || Math.abs(x - c.x) < Math.abs(bestX - c.x)) bestX = x
    }
  if (bestX !== null && Math.abs(bestX - c.x) > 1) {
    c.targetX = bestX
    c.status = `Gantry to bay · ${ship.name}`
  }
}

function nextCraneJob(c: Crane) {
  const ship = shipById(c.shipId)
  if (!ship || ship.state !== 'working') return
  const atTarget = Math.abs(c.x - c.targetX) <= 0.5
  const cls = ship.cls
  if (ship.toDischarge.size) {
    if (!atTarget) return
    const ti = c.transfer.findIndex((t) => !t.cid && !t.reserved)
    if (ti < 0) return
    let best: { slot: number; d: number } | null = null
    for (let bay = 0; bay < cls.bays!; bay++)
      for (let row = 0; row < cls.rows!; row++) {
        const h = stackTop(ship, bay, row)
        if (!h) continue
        const slot = slotIndex(cls, bay, row, h - 1)
        const id = ship.slots[slot]!
        if (!ship.toDischarge.has(id) || reservedShipSlots.has(`${ship.id}:${slot}`) || !bayInReach(c, ship, slot)) continue
        const d = Math.abs(slotTamt(ship, slot).x - c.x) + row * 0.3
        if (!best || d < best.d) best = { slot, d }
      }
    if (!best) {
      if (c.side !== 0 && ship.cranes.length > 1) c.side = 0
      else gantryToNearest(c, ship, 'discharge')
      return
    }
    reservedShipSlots.add(`${ship.id}:${best.slot}`)
    c.transfer[ti].reserved = true
    c.job = { from: { kind: 'ship', shipId: ship.id, slot: best.slot }, to: { kind: 'transfer', idx: ti }, cid: ship.slots[best.slot]!, type: 'discharge' }
    c.phase = 'up'
    c.status = `Discharging ${ship.name}`
    return
  }
  const ti = c.transfer.findIndex((t) => t.cid && !t.reserved && containerById(t.cid)?.vesselId === ship.id)
  if (ti < 0) {
    if (ship.loaded < ship.plannedLoad) c.status = `Waiting for export box · ${ship.name}`
    return
  }
  let best: { slot: number; d: number } | null = null
  for (let bay = 0; bay < cls.bays!; bay++)
    for (let row = 0; row < cls.rows!; row++) {
      const h = stackTop(ship, bay, row)
      if (h >= cls.tiers!) continue
      const slot = slotIndex(cls, bay, row, h)
      if (reservedShipSlots.has(`${ship.id}:${slot}`)) continue
      if (h > 0 && reservedShipSlots.has(`${ship.id}:${slotIndex(cls, bay, row, h - 1)}`)) continue
      if (!bayInReach(c, ship, slot)) continue
      const d = Math.abs(slotTamt(ship, slot).x - c.x) + h * 2 + row * 0.2
      if (!best || d < best.d) best = { slot, d }
    }
  if (!best) {
    if (c.side !== 0) c.side = 0
    else gantryToNearest(c, ship, 'load')
    return
  }
  reservedShipSlots.add(`${ship.id}:${best.slot}`)
  c.transfer[ti].reserved = true
  c.job = { from: { kind: 'transfer', idx: ti }, to: { kind: 'ship', shipId: ship.id, slot: best.slot }, cid: c.transfer[ti].cid!, type: 'load' }
  c.phase = 'up'
  c.status = `Loading ${ship.name}`
}

const approach = (v: number, target: number, rate: number) => (Math.abs(target - v) <= rate ? target : v + Math.sign(target - v) * rate)

function slewTo(c: Crane, x: number, z: number, dt: number) {
  const want = Math.atan2(x - c.x, z - CRANE_Z)
  let d = ((want - c.slew + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  const step = 0.55 * dt
  if (Math.abs(d) <= step) c.slew = want
  else c.slew += Math.sign(d) * step
  d = ((want - c.slew + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  const r = Math.min(BOOM - 0.5, Math.max(8, Math.hypot(x - c.x, z - CRANE_Z)))
  c.radius = approach(c.radius, r, 7 * dt)
  return Math.abs(d) < 1e-3 && Math.abs(c.radius - r) < 1e-3
}

function stepCrane(c: Crane, dt: number) {
  if (!c.job && Math.abs(c.x - c.targetX) > 0.01 && !c.transfer.some((t) => t.cid || t.reserved)) {
    c.hookY = approach(c.hookY, SAFE_Y, 8 * dt)
    c.slew = lerpAngle(c.slew, 0, 1 - Math.exp(-2 * dt))
    c.radius = approach(c.radius, 16, 5 * dt)
    if (c.hookY >= SAFE_Y - 0.1) c.x = approach(c.x, c.targetX, 3.2 * dt)
    c.phase = 'travel'
    c.status = c.shipId ? `Travelling to ${shipById(c.shipId)?.name ?? 'berth'}` : 'Travelling'
    return
  }
  if (!c.job) {
    c.phase = 'idle'
    nextCraneJob(c)
    if (!c.job) {
      c.hookY = approach(c.hookY, SAFE_Y - 6, 4 * dt)
      return
    }
  }
  const job = c.job!
  const from = targetPos(c, job.from)
  const to = targetPos(c, job.to)
  switch (c.phase) {
    case 'up':
      c.hookY = approach(c.hookY, SAFE_Y, 9 * dt)
      if (c.hookY === SAFE_Y) c.phase = 'swing'
      break
    case 'swing':
      if (slewTo(c, from.x, from.z, dt)) c.phase = 'down'
      break
    case 'down':
      slewTo(c, from.x, from.z, dt)
      c.hookY = approach(c.hookY, from.y, 8 * dt)
      if (c.hookY === from.y) {
        c.phase = 'latch'
        c.timer = 0.6
      }
      break
    case 'latch':
      c.timer -= dt
      if (c.timer <= 0) {
        pickUp(c, job)
        c.phase = 'up2'
      }
      break
    case 'up2':
      c.hookY = approach(c.hookY, SAFE_Y, 9 * dt)
      if (c.hookY === SAFE_Y) c.phase = 'swing2'
      break
    case 'swing2':
      if (slewTo(c, to.x, to.z, dt)) c.phase = 'down2'
      break
    case 'down2':
      slewTo(c, to.x, to.z, dt)
      c.hookY = approach(c.hookY, to.y, 8 * dt)
      if (c.hookY === to.y) {
        c.phase = 'unlatch'
        c.timer = 0.5
      }
      break
    case 'unlatch':
      c.timer -= dt
      if (c.timer <= 0) {
        drop(c, job)
        c.job = undefined
        c.phase = 'idle'
      }
      break
  }
}

function pickUp(c: Crane, job: NonNullable<Crane['job']>) {
  const cont = containerById(job.cid)!
  if (job.from.kind === 'ship') {
    const ship = shipById(job.from.shipId)!
    ship.slots[job.from.slot] = null
    ship.cargoVersion++
    reservedShipSlots.delete(`${ship.id}:${job.from.slot}`)
  } else {
    const t = c.transfer[job.from.idx]
    t.cid = null
    t.reserved = false
  }
  cont.loc = { kind: 'crane', id: c.id }
  c.carrying = cont.id
}

function drop(c: Crane, job: NonNullable<Crane['job']>) {
  const cont = containerById(job.cid)!
  c.carrying = null
  c.moveTimes.push(sim.time)
  if (c.moveTimes.length > 40) c.moveTimes.shift()
  sim.teuToday += 2
  if (job.to.kind === 'transfer') {
    const ship = shipById((job.from as { shipId: string }).shipId)!
    const t = c.transfer[job.to.idx]
    t.cid = cont.id
    t.reserved = false
    cont.loc = { kind: 'transfer', craneId: c.id, idx: job.to.idx }
    ship.toDischarge.delete(cont.id)
    ship.discharged++
    cont.vesselId = undefined
    cont.history.push({ t: sim.time, event: `Discharged · ${ship.name}`, place: `${CT} ${ship.berthId} · ${c.id}` })
    cont.status = 'On apron · awaiting yard move'
  } else {
    const ship = shipById(job.to.shipId)!
    ship.slots[job.to.slot] = cont.id
    ship.cargoVersion++
    reservedShipSlots.delete(`${ship.id}:${job.to.slot}`)
    ship.loaded++
    ship.loadPlan = ship.loadPlan.filter((x) => x !== cont.id)
    cont.loc = { kind: 'ship', shipId: ship.id, slot: job.to.slot }
    const l = slotLocal(ship.cls, job.to.slot)
    cont.flow = cont.flow === 'empty' ? 'empty' : 'export'
    cont.history.push({ t: sim.time, event: `Loaded on ${ship.name} · ${ship.voyageNo}`, place: `${CT} ${ship.berthId} · Bay ${String(l.bay * 2 + 1).padStart(2, '0')} Row ${String(l.row).padStart(2, '0')} Tier ${82 + l.tier * 2}` })
    cont.status = `On board ${ship.name} · to ${PORTS[ship.voyage.next].name}`
  }
}

export const craneRate = (c: Crane) => c.moveTimes.filter((t) => t > sim.time - 60).length

// ═════════════════════════════════════ RTGs (yard housekeeping on the deep lines)

export const RTG_SAFE = LAND_Y + 6.4

function nextRtgJob(g: Rtg) {
  for (let tries = 0; tries < 30; tries++) {
    const r = irange(1, 2)
    const s = irange(0, YARD_STACKS - 1)
    const line = irange(1, YARD_LINES - 1)
    const h = stackHeight(g.block, r, s, line)
    if (h < 2 || reservedStacks.has(stackKey(g.block, r, s, line))) continue
    const ds = Math.max(0, Math.min(YARD_STACKS - 1, s + irange(-3, 3)))
    const dline = irange(1, YARD_LINES - 1)
    const dr = irange(1, 2)
    if (ds === s && dline === line && dr === r) continue
    const dh = stackHeight(g.block, dr, ds, dline)
    if (dh >= 2 || reservedStacks.has(stackKey(g.block, dr, ds, dline))) continue
    const from = yardSlotIndex(g.block, r, s, line, h - 1)
    const to = yardSlotIndex(g.block, dr, ds, dline, dh)
    const cid = sim.yard[from]
    if (!cid) continue
    reservedStacks.add(stackKey(g.block, r, s, line))
    reservedStacks.add(stackKey(g.block, dr, ds, dline))
    g.job = { from, to, cid }
    g.phase = 'drive'
    g.status = `Re-handling ${cid.slice(0, 4)}…${cid.slice(-3)}`
    return
  }
}

function stepRtg(g: Rtg, dt: number) {
  if (!g.job) {
    g.timer -= dt
    g.hookY = approach(g.hookY, RTG_SAFE, 3 * dt)
    if (g.timer <= 0) {
      g.timer = range(4, 9)
      nextRtgJob(g)
      if (!g.job) g.status = 'Standing by'
    }
    return
  }
  const from = yardLocal(g.job.from)
  const to = yardLocal(g.job.to)
  switch (g.phase) {
    case 'drive':
      g.hookY = approach(g.hookY, RTG_SAFE, 3 * dt)
      g.x = approach(g.x, from.x, 2.6 * dt)
      if (g.x === from.x) g.phase = 'trolley'
      break
    case 'trolley':
      g.trolleyZ = approach(g.trolleyZ, from.z, 1.6 * dt)
      if (g.trolleyZ === from.z) g.phase = 'down'
      break
    case 'down':
      g.hookY = approach(g.hookY, from.y, 2.2 * dt)
      if (g.hookY === from.y) {
        g.phase = 'latch'
        g.timer = 0.6
      }
      break
    case 'latch':
      g.timer -= dt
      if (g.timer <= 0) {
        const c = containerById(g.job.cid)
        sim.yard[g.job.from] = null
        sim.yardVersion++
        if (c) c.loc = { kind: 'rtg', id: g.id }
        g.carrying = g.job.cid
        g.phase = 'up'
      }
      break
    case 'up':
      g.hookY = approach(g.hookY, RTG_SAFE, 2.4 * dt)
      if (g.hookY === RTG_SAFE) g.phase = 'drive2'
      break
    case 'drive2':
      g.x = approach(g.x, to.x, 2.2 * dt)
      g.trolleyZ = approach(g.trolleyZ, to.z, 1.6 * dt)
      if (g.x === to.x && g.trolleyZ === to.z) g.phase = 'down2'
      break
    case 'down2':
      g.hookY = approach(g.hookY, to.y, 2.2 * dt)
      if (g.hookY === to.y) {
        g.phase = 'unlatch'
        g.timer = 0.5
      }
      break
    case 'unlatch':
      g.timer -= dt
      if (g.timer <= 0) {
        const c = containerById(g.job.cid)
        sim.yard[g.job.to] = g.job.cid
        sim.yardVersion++
        if (c) {
          c.loc = { kind: 'yard', slot: g.job.to }
          c.history.push({ t: sim.time, event: `Yard shift · ${g.id}`, place: yardLabel(g.job.to) })
        }
        const a = yardDecode(g.job.from)
        const b = yardDecode(g.job.to)
        reservedStacks.delete(stackKey(a.block, a.row, a.stack, a.line))
        reservedStacks.delete(stackKey(b.block, b.row, b.stack, b.line))
        g.carrying = null
        g.moves++
        g.job = undefined
        g.phase = 'idle'
        g.timer = range(3, 7)
      }
      break
  }
}

// ═════════════════════════════════════ handlers (container forklifts / shuttle carriers, terminal-local)

const handlerSpeed = (p: PathPoint) => (p.rev ? 2.4 : 7)
const STACK_APPROACH = 3.4

function hEntry(to: HLoc, fromX: number, h: Handler): Waypoint[] {
  if (to.kind === 'stack') {
    const d = yardDecode(to.slot)
    const sx = stackX(d.block, d.stack)
    const side = fromX < sx ? -1 : 1
    const fz = rowZ(d.row) + FRONT_OFFSET
    return [{ x: sx + side * 8, z: aisleZ(d.row) }, { x: sx + side * 2, z: (aisleZ(d.row) + fz + STACK_APPROACH) / 2 }, { x: sx, z: fz + STACK_APPROACH }]
  }
  if (to.kind === 'transfer') {
    const tp = transferPos(craneById(to.craneId)!, to.idx)
    const side = fromX < tp.x ? -1 : 1
    return [{ x: tp.x + side * 8, z: APRON_LANE_Z }, { x: tp.x + side * 2, z: APRON_LANE_Z + 2 }, { x: tp.x, z: TRANSFER_Z - STACK_APPROACH }]
  }
  return [{ x: HOME_CORRIDOR, z: h.home.z }, { x: h.home.x, z: h.home.z }]
}

function hExit(h: Handler): { wps: Waypoint[]; aisle: number | 'corridor'; x: number } {
  const loc = h.loc
  if (loc.kind === 'stack') {
    const d = yardDecode(loc.slot)
    const sx = stackX(d.block, d.stack)
    return { wps: [{ x: sx, z: aisleZ(d.row), rev: true }], aisle: d.row, x: sx }
  }
  if (loc.kind === 'transfer') return { wps: [{ x: h.pos.x, z: APRON_LANE_Z, rev: true }], aisle: 0, x: h.pos.x }
  return { wps: [{ x: HOME_CORRIDOR, z: h.home.z, rev: true }], aisle: 'corridor', x: HOME_CORRIDOR }
}

const aisleOf = (to: HLoc): number | 'corridor' => (to.kind === 'stack' ? yardDecode(to.slot).row : to.kind === 'transfer' ? 0 : 'corridor')
function entryX(to: HLoc, h: Handler) {
  if (to.kind === 'stack') {
    const d = yardDecode(to.slot)
    return stackX(d.block, d.stack)
  }
  if (to.kind === 'transfer') return transferPos(craneById(to.craneId)!, to.idx).x
  return h.home.x
}

function handlerRoute(h: Handler, to: HLoc): Waypoint[] {
  const ex = hExit(h)
  const tAisle = aisleOf(to)
  const tx = entryX(to, h)
  const wps = [...ex.wps]
  const zOf = (a: number | 'corridor') => (a === 'corridor' ? null : aisleZ(a))
  if (ex.aisle === 'corridor') wps.push({ x: HOME_CORRIDOR, z: zOf(tAisle) ?? h.home.z })
  else if (tAisle === 'corridor') wps.push({ x: HOME_CORRIDOR, z: zOf(ex.aisle)! })
  else if (ex.aisle !== tAisle) {
    const c = CORRIDORS.reduce((best, cx) => (Math.abs(ex.x - cx) + Math.abs(tx - cx) < Math.abs(ex.x - best) + Math.abs(tx - best) ? cx : best), CORRIDORS[0])
    wps.push({ x: c, z: zOf(ex.aisle)! }, { x: c, z: zOf(tAisle)! })
  }
  const lastX = wps.length ? wps[wps.length - 1].x : h.pos.x
  wps.push(...hEntry(to, lastX, h))
  return wps
}

function handlerTask(h: Handler) {
  for (const c of sim.cranes)
    for (let i = 0; i < 2; i++) {
      const t = c.transfer[i]
      const cont = containerById(t.cid ?? undefined)
      if (!cont || t.reserved || cont.vesselId) continue
      const st = freeStack(c.x)
      if (!st) return
      const key = stackKey(st.blk, st.r, st.s)
      reservedStacks.add(key)
      t.reserved = true
      const crane = c
      const idx = i
      h.phase = 'working'
      h.status = `Apron → yard · ${cont.id.slice(0, 4)}…${cont.id.slice(-3)}`
      h.queue.push(
        { t: 'do', fn: () => (h.liftTarget = LAND_Y + 0.65) },
        { t: 'move', to: { kind: 'transfer', craneId: crane.id, idx } },
        { t: 'wait', d: 0.5 },
        {
          t: 'do',
          fn: () => {
            crane.transfer[idx].cid = null
            crane.transfer[idx].reserved = false
            cont.loc = { kind: 'handler', id: h.id }
            h.carrying = cont.id
            h.liftTarget = LAND_Y + 1.4
          },
        },
        { t: 'wait', d: 0.3 },
        { t: 'do', fn: () => (h.liftTarget = tierY(stackHeight(st.blk, st.r, st.s)) + 0.2) },
        { t: 'move', to: { kind: 'stack', slot: yardSlotIndex(st.blk, st.r, st.s, 0, 0) } },
        { t: 'do', fn: () => (h.liftTarget = tierY(stackHeight(st.blk, st.r, st.s))) },
        { t: 'wait', d: 0.6 },
        {
          t: 'do',
          fn: () => {
            const tier = stackHeight(st.blk, st.r, st.s)
            const slot = yardSlotIndex(st.blk, st.r, st.s, 0, Math.min(2, tier))
            sim.yard[slot] = cont.id
            cont.loc = { kind: 'yard', slot }
            cont.history.push({ t: sim.time, event: 'Stacked in yard', place: `${yardLabel(slot)} · ${h.id}` })
            cont.status = cont.reefer ? 'In yard · reefer plugged in' : 'In yard · awaiting customs release'
            h.carrying = null
            h.moves++
            reservedStacks.delete(key)
            sim.yardVersion++
          },
        },
        { t: 'wait', d: 0.3 },
        { t: 'do', fn: () => (h.liftTarget = LAND_Y + 1.4) },
      )
      return
    }
  for (const c of sim.cranes) {
    const ship = shipById(c.shipId)
    if (!ship || ship.toDischarge.size || ship.state !== 'working' || Math.abs(c.x - c.targetX) > 0.5) continue
    const ti = c.transfer.findIndex((t) => !t.cid && !t.reserved)
    if (ti < 0) continue
    const inFlight = sim.handlers.filter((x) => x.status.includes(ship.name)).length
    const pending = ship.loadPlan.filter((id) => containerById(id)?.loc.kind === 'yard')
    if (inFlight >= pending.length) continue
    for (const id of pending) {
      const cont = containerById(id)!
      if (cont.loc.kind !== 'yard') continue
      const d = yardDecode(cont.loc.slot)
      if (d.line !== 0 || stackHeight(d.block, d.row, d.stack) !== d.tier + 1) continue
      const key = stackKey(d.block, d.row, d.stack)
      if (reservedStacks.has(key)) continue
      reservedStacks.add(key)
      c.transfer[ti].reserved = true
      const crane = c
      const fromSlot = cont.loc.slot
      h.phase = 'working'
      h.status = `Yard → ${crane.id} · for ${ship.name}`
      h.queue.push(
        { t: 'do', fn: () => (h.liftTarget = tierY(d.tier) + 0.2) },
        { t: 'move', to: { kind: 'stack', slot: fromSlot } },
        { t: 'do', fn: () => (h.liftTarget = tierY(d.tier)) },
        { t: 'wait', d: 0.5 },
        {
          t: 'do',
          fn: () => {
            sim.yard[fromSlot] = null
            cont.loc = { kind: 'handler', id: h.id }
            h.carrying = cont.id
            h.liftTarget = tierY(d.tier) + 0.6
            reservedStacks.delete(key)
            sim.yardVersion++
            cont.history.push({ t: sim.time, event: 'Picked from yard', place: `${yardLabel(fromSlot)} · ${h.id}` })
          },
        },
        { t: 'wait', d: 0.3 },
        { t: 'do', fn: () => (h.liftTarget = LAND_Y + 1.4) },
        { t: 'move', to: { kind: 'transfer', craneId: crane.id, idx: ti } },
        { t: 'do', fn: () => (h.liftTarget = LAND_Y + 0.65) },
        { t: 'wait', d: 0.5 },
        {
          t: 'do',
          fn: () => {
            crane.transfer[ti].cid = cont.id
            crane.transfer[ti].reserved = false
            cont.loc = { kind: 'transfer', craneId: crane.id, idx: ti }
            cont.status = `On apron · loading ${ship.name}`
            cont.history.push({ t: sim.time, event: 'Delivered to quay crane', place: `${CT} ${ship.berthId} · ${crane.id}` })
            h.carrying = null
            h.moves++
          },
        },
        { t: 'wait', d: 0.3 },
        { t: 'do', fn: () => (h.liftTarget = LAND_Y + 1.4) },
      )
      return
    }
  }
  if (h.loc.kind !== 'home') {
    h.queue.push({ t: 'move', to: { kind: 'home' } })
    h.status = 'Returning to park'
    h.phase = 'working'
  } else {
    h.status = 'Parked'
    h.phase = 'idle'
    h.queue.push({ t: 'wait', d: 1 })
  }
}

function stepHandler(h: Handler, dt: number) {
  h.lift += (h.liftTarget - h.lift) * (1 - Math.exp(-4 * dt))
  let guard = 0
  while (h.queue.length && guard++ < 8) {
    const step = h.queue[0]
    if (step.t === 'do') {
      step.fn()
      h.queue.shift()
      continue
    }
    if (step.t === 'wait') {
      if (h.waitLeft <= 0) h.waitLeft = step.d
      h.waitLeft -= dt
      if (h.waitLeft <= 0) h.queue.shift()
      break
    }
    if (!step.started) {
      step.started = true
      h.path = buildPath(h.pos, handlerRoute(h, step.to))
      h.finalHeading = undefined
    }
    const before = { ...h.pos }
    const done = follow(h, dt, handlerSpeed, 6, 0.9)
    h.fuel = Math.max(8, h.fuel - Math.hypot(h.pos.x - before.x, h.pos.z - before.z) * 0.004)
    if (done || !h.path.length) {
      h.loc = step.to
      if (step.to.kind === 'home') h.finalHeading = Math.PI / 2
      h.queue.shift()
    }
    break
  }
  if (!h.queue.length) handlerTask(h)
}

// ═════════════════════════════════════ tugs (world frame)

function stepTugs(dt: number) {
  const needing = sim.ships.filter((s) => s.state === 'approach' || s.state === 'berthing' || s.state === 'unberthing')
  for (const s of needing) {
    const have = sim.tugs.filter((t) => t.shipId === s.id).length
    for (let k = have; k < 2; k++) {
      const free = sim.tugs.filter((t) => !t.shipId).sort((a, b) => Math.hypot(a.pos.x - s.pos.x, a.pos.z - s.pos.z) - Math.hypot(b.pos.x - s.pos.x, b.pos.z - s.pos.z))[0]
      if (!free) break
      free.shipId = s.id
      free.offset = sim.tugs.some((t) => t.shipId === s.id && t !== free && t.offset === 1) ? -1 : 1
    }
  }
  for (const t of sim.tugs) {
    const s = shipById(t.shipId)
    if (s && !needing.includes(s)) t.shipId = undefined
    let tx: number
    let tz: number
    let th: number
    if (t.shipId && s) {
      // quay-side berths: push from the water side (ship's +x); finger piers: escort bow/stern
      const lateral = (s.state === 'berthing' || (s.state === 'unberthing' && s.path[0]?.hold)) && !['cruise', 'destroyer', 'cruiser', 'amphib'].includes(s.kind)
      // push from whichever side is open water
      const side = lateral && isLand(toWorld(s, s.cls.beam / 2 + 6, 0).x, toWorld(s, s.cls.beam / 2 + 6, 0).z) ? -1 : 1
      const w = toWorld(s, lateral ? side * (s.cls.beam / 2 + 3.2) : 0, lateral ? t.offset * s.cls.length * 0.28 : t.offset * (s.cls.length / 2 + 9))
      tx = w.x
      tz = w.z
      th = lateral ? s.heading - (side * Math.PI) / 2 : s.heading
    } else {
      tx = t.home.x
      tz = t.home.z
      th = Math.PI / 2
    }
    const dx = tx - t.pos.x
    const dz = tz - t.pos.z
    const d = Math.hypot(dx, dz)
    const sp = Math.min(16, d * 1.2)
    t.speed = sp
    if (d > 0.05) {
      const step = Math.min(d, sp * dt)
      t.pos.x += (dx / d) * step
      t.pos.z += (dz / d) * step
    }
    t.heading = lerpAngle(t.heading, d > 4 ? Math.atan2(dx, dz) : th, 1 - Math.exp(-3 * dt))
  }
}

// ═════════════════════════════════════ ro-ro vehicles

let carSeq = 0
function spawnCar(ship: Ship) {
  const stern = toWorld(ship, -ship.cls.beam / 2 + 2, -ship.cls.length / 2 + 3)
  const l = toLocalF(RORO_FRAME, stern.x, stern.z)
  const P = (lx: number, lz: number) => toWorldF(RORO_FRAME, lx, lz)
  const pts: Waypoint[] = [P(l.x - 6, 0), P(l.x - 10, -10), P(l.x - 18, -24), P(l.x + range(-120, 120), range(-150, -40))]
  sim.cars.push({ id: carSeq++, shipId: ship.id, path: buildPath(stern, pts), pos: { ...stern }, heading: ship.heading, speed: 0, color: irange(0, 5) })
}

function stepCars(dt: number) {
  for (const car of [...sim.cars]) {
    const done = follow(car as unknown as Mover, dt, () => 7, 8, 0.8)
    if (done || !car.path.length) sim.cars.splice(sim.cars.indexOf(car), 1)
  }
}

// ═════════════════════════════════════ schedule

const SCHEDULED: Record<string, ShipKind[]> = PORT.schedule

function scheduleCalls() {
  for (const b of BERTHS) {
    const kinds = SCHEDULED[b.id]
    if (!kinds) continue
    let t = sim.time - range(500, 900)
    for (let i = 0; i < 6; i++) {
      const kind = pick(kinds)
      const dur = kind === 'cruise' ? range(420, 560) : kind === 'carcarrier' ? range(420, 600) : kind === 'ulcv' ? range(560, 760) : kind === 'neopanamax' ? range(420, 640) : range(300, 520)
      sim.calls.push({ id: `C${callSeq++}`, berthId: b.id, name: shipName(kind), kind, eta: t, etd: t + dur, status: 'planned' })
      t += dur + range(80, 240)
    }
  }
}

function stepSchedule() {
  for (const call of sim.calls) {
    if (call.status !== 'planned') continue
    if (sim.time < call.eta - 150) continue
    // one arrival at a time at the sea buoy
    if (sim.ships.some((s) => Math.hypot(s.pos.x - SEA_SPAWN.x, s.pos.z - SEA_SPAWN.z) < 420)) continue
    call.name = spawnInbound(call).name
    return
  }
}

const NAVY_BERTHS = BERTHS.filter((b) => terminalById(b.terminal)?.navy && b.arrival(10, 80).length)

/** naval traffic: now and then a warship sails, and later another one comes home */
function stepNavy(dt: number) {
  if (!NAVY_BERTHS.length) return
  sim.navyTimer -= dt * SIM_MIN_PER_SEC
  if (sim.navyTimer > 0) return
  sim.navyTimer = range(90, 180)
  const inPort = sim.ships.filter((s) => s.cls.navy && !s.static && s.state === 'working')
  if (inPort.length > 6 && rnd() < 0.6) {
    const s = pick(inPort)
    s.state = 'ready'
    s.readyTimer = 0
    s.navy!.status = 'Getting underway'
    s.history.push({ t: sim.time, event: 'Set special sea and anchor detail', place: berthPlace(berthById(s.berthId)) })
    return
  }
  const free = NAVY_BERTHS.filter((b) => !b.kinds.includes('amphib') && !berthBusy(b))
  if (!free.length || sim.ships.some((s) => Math.hypot(s.pos.x - SEA_SPAWN.x, s.pos.z - SEA_SPAWN.z) < 420)) return
  const b = pick(free)
  const call: Call = { id: `C${callSeq++}`, berthId: b.id, name: shipName(b.kinds[0]), kind: b.kinds[0], eta: sim.time + 150, etd: sim.time + 1500, status: 'planned' }
  sim.calls.push(call)
  const s = spawnInbound(call)
  s.navy!.status = 'Returning from sea'
  call.name = s.name
}

// ═════════════════════════════════════ main loop

export function stepSim(dtRaw: number) {
  let remaining = Math.min(dtRaw, 0.1) * sim.speed
  while (remaining > 0) {
    const dt = Math.min(remaining, 0.05)
    remaining -= dt
    sim.time += dt * SIM_MIN_PER_SEC
    stepSchedule()
    stepNavy(dt)
    for (const s of [...sim.ships]) stepShip(s, dt)
    assignCranes()
    for (const c of sim.cranes) stepCrane(c, dt)
    for (const g of sim.rtgs) stepRtg(g, dt)
    for (const h of sim.handlers) stepHandler(h, dt)
    stepTugs(dt)
    stepCars(dt)
    stepGate(dt)
  }
}

// ═════════════════════════════════════ init

export function initSim() {
  if (sim.ships.length) return
  initYard()
  sim.cranes = PORT.ct.craneXs.map((x, i) => ({
    id: `${CRANE_NAME}-${i + 1}`,
    x,
    targetX: x,
    slew: 0.2,
    radius: 18,
    hookY: SAFE_Y,
    carrying: null,
    phase: 'idle' as const,
    timer: 0,
    side: 0 as const,
    transfer: [
      { cid: null, reserved: false },
      { cid: null, reserved: false },
    ],
    moveTimes: Array.from({ length: irange(20, 28) }, (_, k) => sim.time - 60 + k * 2.2),
    status: 'Idle',
  }))
  sim.rtgs = BLOCKS.map((b, i) => ({
    id: `${PORT.ct.crane === 'sts' ? 'ASC' : 'RTG'}-${i + 1}`,
    block: i,
    x: b.cx,
    trolleyZ: rowZ(1),
    hookY: RTG_SAFE,
    carrying: null,
    phase: 'idle' as const,
    timer: range(1, 4),
    moves: irange(30, 60),
    status: 'Standing by',
  }))
  const ops = ['M. Reyes', 'J. Tran', 'A. Okoro', 'S. Patel', 'L. Kim', 'D. Alvarez', 'R. Chen', 'T. Nguyen', 'E. Garcia', 'K. Brooks']
  sim.handlers = Array.from({ length: PORT.ct.handlers ?? 6 }, (_, i) => {
    const home = { x: HOME_X + (i >= 6 ? 12 : 0), z: -36 - (i % 6) * 7 }
    return {
      id: `${PORT.ct.crane === 'sts' ? 'SC' : 'TL'}-${String(i + 1).padStart(2, '0')}`,
      home,
      loc: { kind: 'home' as const },
      pos: { ...home },
      heading: Math.PI / 2,
      finalHeading: Math.PI / 2,
      path: [],
      speed: 0,
      queue: [],
      waitLeft: 0,
      lift: LAND_Y + 1.4,
      liftTarget: LAND_Y + 1.4,
      carrying: null,
      fuel: irange(45, 95),
      status: 'Parked',
      phase: 'idle' as const,
      moves: irange(12, 30),
      operator: ops[i],
    }
  })
  sim.tugs = PORT.tugs.map((t, i) => ({ id: `TUG-${i + 1}`, name: `Tug ${t.name}`, home: { ...t.home }, pos: { ...t.home }, heading: Math.PI / 2, path: [], speed: 0, offset: 1 }))
  sim.laydown = PORT.id === 'san-diego' ? 4 : 0

  scheduleCalls()
  const starts = new Map(PORT.init.inbound.map((x) => [x.berth, x.node]))
  for (const b of BERTHS) {
    const calls = sim.calls.filter((c) => c.berthId === b.id).sort((a, c) => a.eta - c.eta)
    for (const call of calls) {
      if (call.etd < sim.time) call.status = 'departed'
      else if (call.eta <= sim.time && call.etd > sim.time) {
        if (starts.has(b.id)) {
          // these start out sailing in, so there is traffic in the channel from the first second
          call.eta = sim.time + 60
          call.etd = call.eta + 400
          const s = spawnInbound(call, starts.get(b.id)!)
          call.name = s.name
          s.eta = call.eta
        } else {
          const prog = (sim.time - call.eta) / (call.etd - call.eta)
          const s = spawnBerthed(call, Math.min(0.75, prog))
          call.name = s.name
          s.etd = Math.max(sim.time + 60, s.etd)
          call.etd = s.etd
        }
      }
    }
  }
  for (const b of NAVY_BERTHS) {
    if (rnd() < 0.2) continue
    const kind = pick(b.kinds)
    const call: Call = { id: `C${callSeq++}`, berthId: b.id, name: shipName(kind), kind, eta: sim.time - range(600, 6000), etd: sim.time + range(600, 3000), status: 'working' }
    sim.calls.push(call)
    const s = spawnBerthed(call, 0)
    if (s.kind === 'amphib') s.static = true
    call.name = s.name
  }
  for (const st of PORT.init.statics ?? []) {
    const call: Call = { id: `C${callSeq++}`, berthId: st.berth, name: st.name ?? shipName(st.kind), kind: st.kind, eta: sim.time - 9000, etd: sim.time + 20000, status: 'working' }
    sim.calls.push(call)
    const s = spawnBerthed(call, 0)
    s.static = true
    call.name = s.name
  }
  const waitFor = PORT.init.anchoredFor
  const anchoredNext = waitFor ? sim.calls.find((c) => c.berthId === waitFor && c.status === 'planned') : undefined
  if (anchoredNext) {
    anchoredNext.eta = sim.time + 40
    const s = spawnInbound(anchoredNext)
    anchoredNext.name = s.name
    s.pos = { ...anchorage(0) }
    s.path = []
    s.state = 'anchored'
    s.anchorIdx = 0
    s.heading = -Math.PI / 4
    s.finalHeading = -Math.PI / 4
    s.history.push({ t: sim.time - 50, event: 'Anchored · awaiting berth', place: `${PORT.text.anchorage} A1 (offshore)` })
  }
  const d = PORT.init.departed
  if (d) {
    const db = berthById(d.berth)
    const dep = createShip(d.kind, db, sim.time - 420, `C${callSeq++}`)
    dep.state = 'outbound'
    const st = outboundLane(d.node, d.node)[0]
    dep.pos = { x: st.x, z: st.z }
    dep.path = buildPath(dep.pos, [...outboundLane(d.node - 1, 1), EXIT])
    dep.heading = Math.atan2(dep.path[0].x - dep.pos.x, dep.path[0].z - dep.pos.z)
    dep.speed = 8
    dep.etd = sim.time - 30
    dep.ataBerth = sim.time - 420
    dep.history.push({ t: sim.time - 420, event: `All fast · ${db.id}`, place: berthPlace(db) })
    dep.history.push({ t: sim.time - 30, event: `Departed for ${PORTS[dep.voyage.next].name}`, place: berthPlace(db) })
    sim.calls.push({ id: dep.callId, berthId: db.id, name: dep.name, kind: d.kind, eta: sim.time - 420, etd: sim.time - 30, shipId: dep.id, status: 'departed' })
  }
  alert(`Reefer block B row 1 · pre-trip inspection due`, 'amber')
  if (anchoredNext?.shipId) alert(`${anchoredNext.name} waiting at anchorage A1 — ${waitFor} occupied`, 'amber', { type: 'ship', id: anchoredNext.shipId })
}

export { CONTAINER }
