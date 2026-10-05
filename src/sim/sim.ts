import { buildPath, follow, lerpAngle } from './path'
import type { Mover, PathPoint, Waypoint } from './path'
import {
  BERTHS, SHIP_CLASSES, PORTS, LAND_Y, ENTRANCE_X, CHANNEL_Z, CRANE_Z, TRANSFER_Z, APRON_LANE_Z,
  YARD_ROWS, YARD_STACKS, BLOCKS, CORRIDORS, CONTAINER, rowZ, aisleZ, stackX, tierY,
  arrivalRoute, departureRoute, anchorRoute, anchorage, berthById, berthZ,
} from './world'
import type { Berth, ShipKind, ShipClass } from './world'
import {
  rnd, pick, range, irange, LINES, FLAGS, shipName, releaseName, claimName, imoNumber, mmsi, callSign, containerNumber,
  voyageFor, nmBetween, legPoint, fmtLatLon, CARGO_BY_REGION, regionOf, INLAND, SHIPPERS, CONSIGNEES,
  VEHICLE_BRANDS, BULK_CARGO,
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
  origin: string // port code where stuffed / loaded
  pod: string // port of discharge
  dest: string // final destination
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

export type ShipState = 'inbound' | 'anchored' | 'berthing' | 'working' | 'ready' | 'unberthing' | 'outbound'

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
  // containers
  slots: (string | null)[]
  toDischarge: Set<string>
  loadPlan: string[]
  plannedDischarge: number
  plannedLoad: number
  discharged: number
  loaded: number
  cargoVersion: number
  cranes: string[]
  // other cargo
  vehicles?: { brand: string; total: number; onboard: number; toDischarge: number; planned: number; acc: number }
  bulk?: { cargo: string; total: number; remaining: number }
  blades?: { total: number; onboard: number; acc: number }
  passengers?: { total: number; ashore: number }
  history: HistoryEvent[]
  routeIn: Waypoint[]
  callId: string
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
  reserved: boolean // a crane or handler is on its way to put/take
  incoming?: string
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

type HLoc = { kind: 'home' } | { kind: 'stack'; slot: number } | { kind: 'transfer'; craneId: string; idx: number }

type HStep =
  | { t: 'move'; to: HLoc; started?: boolean }
  | { t: 'wait'; d: number }
  | { t: 'do'; fn: () => void }

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
  offset: number // -1 stern, 1 bow
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
  handlers: [] as Handler[],
  tugs: [] as Tug[],
  cars: [] as MovingCar[],
  lot: { count: 0, cap: 2600 },
  laydown: 0, // wind blades on TAMT apron
  calls: [] as Call[],
  alerts: [] as Alert[],
  teuToday: 1184,
  version: 0,
  gateTimer: 0,
}

const SIM_MIN_PER_SEC = 0.25
export const shipById = (id?: string) => sim.ships.find((s) => s.id === id)
export const craneById = (id?: string) => sim.cranes.find((c) => c.id === id)
export const handlerById = (id?: string) => sim.handlers.find((h) => h.id === id)
export const containerById = (id?: string) => (id ? sim.containers.get(id) : undefined)

function alert(text: string, tone: Alert['tone'], ref?: Alert['ref']) {
  sim.alerts.unshift({ t: sim.time, text, tone, ref })
  sim.alerts.length = Math.min(sim.alerts.length, 12)
}

// ═════════════════════════════════════ geometry helpers

export function slotCount(cls: ShipClass) {
  return (cls.bays ?? 0) * (cls.rows ?? 0) * (cls.tiers ?? 0)
}

export function slotLocal(cls: ShipClass, slot: number) {
  const rows = cls.rows!
  const tiers = cls.tiers!
  const bay = Math.floor(slot / (rows * tiers))
  const row = Math.floor(slot / tiers) % rows
  const tier = slot % tiers
  return {
    bay,
    row,
    tier,
    x: (row - (rows - 1) / 2) * 1.32,
    y: cls.freeboard + 0.45 + 0.65 + tier * 1.3,
    z: -cls.length / 2 + 17 + bay * 6.6 + 3.05,
  }
}

export function toWorld(ship: { pos: { x: number; z: number }; heading: number }, lx: number, lz: number) {
  const c = Math.cos(ship.heading)
  const s = Math.sin(ship.heading)
  return { x: ship.pos.x + lx * c + lz * s, z: ship.pos.z - lx * s + lz * c }
}

export function slotWorld(ship: Ship, slot: number) {
  const l = slotLocal(ship.cls, slot)
  const w = toWorld(ship, l.x, l.z)
  return { x: w.x, y: l.y, z: w.z }
}

const slotIndex = (cls: ShipClass, bay: number, row: number, tier: number) => (bay * cls.rows! + row) * cls.tiers! + tier

export const YARD_LINES = 4 // line 0 faces the aisle; lines 1-3 are deep storage
export const FRONT_OFFSET = 2.04
export function yardSlotIndex(block: number, row: number, stack: number, line: number, tier: number) {
  return ((((block * YARD_ROWS + row) * YARD_STACKS + stack) * YARD_LINES + line) * 3) + tier
}
export function yardDecode(slot: number) {
  const tier = slot % 3
  const line = Math.floor(slot / 3) % YARD_LINES
  const stack = Math.floor(slot / (3 * YARD_LINES)) % YARD_STACKS
  const row = Math.floor(slot / (3 * YARD_LINES * YARD_STACKS)) % YARD_ROWS
  const block = Math.floor(slot / (3 * YARD_LINES * YARD_STACKS * YARD_ROWS))
  return { block, row, stack, line, tier }
}
export function yardWorld(slot: number) {
  const d = yardDecode(slot)
  return { x: stackX(d.block, d.stack), y: tierY(d.tier), z: rowZ(d.row) + FRONT_OFFSET - d.line * 1.36 }
}
export const yardLabel = (slot: number) => {
  const d = yardDecode(slot)
  return `Block ${BLOCKS[d.block].id} · Row ${d.row + 1} · Stack ${String(d.stack + 1).padStart(2, '0')} · Tier ${d.tier + 1}`
}
const YARD_SLOTS = BLOCKS.length * YARD_ROWS * YARD_STACKS * YARD_LINES * 3

function stackHeight(block: number, row: number, stack: number, line = 0) {
  let h = 0
  while (h < 3 && sim.yard[yardSlotIndex(block, row, stack, line, h)]) h++
  return h
}

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

function shipGt(cls: ShipClass) {
  return Math.round(range(cls.gt[0], cls.gt[1]) / 10) * 10
}

function buildVoyageHistory(ship: Ship, arriveT: number) {
  const a = PORTS[ship.voyage.prev]
  const b = PORTS.USSAN
  const nm = nmBetween(a, b)
  const hours = nm / (ship.cls.speedKn * 0.92)
  const depart = arriveT - hours * 60
  ship.history.push({ t: depart - range(600, 1100), event: 'Cargo operations completed', place: `${a.name}, ${a.country}` })
  ship.history.push({ t: depart, event: `Departed ${a.name}`, place: `${a.name}, ${a.country}` })
  const n = Math.max(2, Math.min(5, Math.round(hours / 40)))
  for (let i = 1; i <= n; i++) {
    const f = i / (n + 1)
    const p = legPoint(a, b, f)
    ship.history.push({ t: depart + (arriveT - depart) * f, event: `AIS position · ${(ship.cls.speedKn * range(0.85, 1)).toFixed(1)} kn`, place: fmtLatLon(p.lat, p.lon) })
  }
  ship.history.push({ t: arriveT - range(80, 150), event: 'Pilot boarded', place: 'San Diego pilot station · Point Loma' })
  return depart
}

function workMinutes(ship: Ship) {
  switch (ship.kind) {
    case 'container':
    case 'feeder':
      return ((ship.plannedDischarge + ship.plannedLoad) * 3.2) / 2 + 30
    case 'carcarrier':
      return ship.vehicles!.toDischarge / 9 + 40
    case 'bulk':
      return ship.bulk!.total / 230 + 30
    case 'multipurpose':
      return ship.blades!.total * 12 + 30
    default:
      return 160
  }
}

function createShip(kind: ShipKind, berth: Berth, eta: number, callId: string, name?: string): Ship {
  const cls = SHIP_CLASSES[kind]
  const flag = pick(FLAGS)
  const line = kind === 'cruise' ? LINES[0] : pick(LINES.slice(0, 5))
  const voyage = voyageFor(kind)
  const gt = shipGt(cls)
  const ship: Ship = {
    id: `V${shipSeq++}`,
    name: name ? claimName(name) : shipName(kind),
    kind,
    cls,
    line,
    imo: imoNumber(),
    mmsi: mmsi(flag.mid),
    flag: flag.name,
    callSign: callSign(),
    voyageNo: `${irange(410, 489)}${pick(['N', 'E', 'S'])}`,
    voyage,
    gt,
    dwt: Math.round(gt * range(0.95, 1.35) / 10) * 10,
    berthId: berth.id,
    state: 'inbound',
    eta,
    etd: eta,
    readyTimer: 0,
    stall: 0,
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
    routeIn: [],
    callId,
    pos: { x: ENTRANCE_X, z: CHANNEL_Z },
    heading: Math.PI / 2,
    path: [],
    speed: 0,
  }
  const departPrev = buildVoyageHistory(ship, eta)

  if (kind === 'container' || kind === 'feeder') {
    const n = slotCount(cls)
    ship.slots = Array(n).fill(null)
    const fillPct = range(0.62, 0.9)
    for (let bay = 0; bay < cls.bays!; bay++)
      for (let row = 0; row < cls.rows!; row++) {
        const edge = Math.min(row, cls.rows! - 1 - row) // outer rows a bit lower
        const h = Math.min(cls.tiers!, Math.round((fillPct * cls.tiers!) + range(-1, 0.8) - (edge === 0 ? 0.6 : 0)))
        const discharge = irange(0, Math.max(0, h))
        for (let tier = 0; tier < h; tier++) {
          const slot = slotIndex(cls, bay, row, tier)
          const isImport = tier >= h - discharge
          const c = makeContainer(voyage.prev, isImport ? 'USSAN' : voyage.next, isImport ? 'import' : 'rob', { kind: 'ship', shipId: ship.id, slot })
          c.vesselId = ship.id
          c.vesselName = ship.name
          originHistory(c, ship.name, departPrev, ship.voyageNo)
          c.status = isImport ? 'On board · discharge at San Diego' : `On board · remains for ${PORTS[voyage.next].name}`
          if (isImport) ship.toDischarge.add(c.id)
          ship.slots[slot] = c.id
        }
      }
    ship.plannedDischarge = ship.toDischarge.size
    ship.plannedLoad = Math.min(irange(14, 30), n - ship.slots.filter(Boolean).length + ship.plannedDischarge)
  } else if (kind === 'carcarrier') {
    const total = irange(3600, 5600)
    const planned = Math.round(total * range(0.55, 0.85))
    ship.vehicles = { brand: pick(VEHICLE_BRANDS), total, onboard: total, toDischarge: planned, planned, acc: 0 }
  } else if (kind === 'bulk') {
    const total = irange(24, 34) * 1000
    ship.bulk = { cargo: pick(BULK_CARGO), total, remaining: total }
  } else if (kind === 'multipurpose') {
    const total = irange(9, 12)
    ship.blades = { total, onboard: total, acc: 0 }
  } else if (kind === 'cruise') {
    const total = irange(2400, 4200)
    ship.passengers = { total, ashore: 0 }
  }
  ship.etd = eta + workMinutes(ship) + 25
  sim.ships.push(ship)
  sim.version++
  return ship
}

const berthBusy = (b: Berth, except?: Ship) =>
  sim.ships.some((s) => s !== except && s.berthId === b.id && ['berthing', 'working', 'ready', 'unberthing'].includes(s.state)) ||
  sim.ships.some((s) => s !== except && s.berthId === b.id && s.state === 'inbound' && s.anchorIdx === undefined)

function sendToBerth(ship: Ship) {
  const b = berthById(ship.berthId)
  ship.anchorIdx = undefined
  ship.state = 'inbound'
  ship.routeIn = arrivalRoute(b, ship.cls.beam, ship.pos)
  ship.path = buildPath(ship.pos, ship.routeIn)
  ship.finalHeading = -Math.PI / 2
  setCall(ship, 'arriving')
}

function setCall(ship: Ship, status: Call['status']) {
  const c = sim.calls.find((x) => x.id === ship.callId)
  if (c) {
    c.status = status
    c.shipId = ship.id
    c.etd = ship.etd
  }
}

function spawnInbound(call: Call, startX = ENTRANCE_X) {
  const b = berthById(call.berthId)
  const ship = createShip(call.kind, b, call.eta, call.id, call.name)
  ship.pos = { x: startX, z: CHANNEL_Z }
  ship.heading = Math.PI / 2
  ship.speed = 8
  call.shipId = ship.id
  ship.history.push({ t: sim.time, event: 'Entered San Diego Bay channel', place: 'Point Loma · Ballast Point' })
  if (berthBusy(b, ship)) {
    const idx = sim.ships.filter((s) => s.anchorIdx !== undefined).length
    ship.anchorIdx = idx
    ship.routeIn = anchorRoute(idx)
    ship.path = buildPath(ship.pos, ship.routeIn)
    ship.finalHeading = Math.PI / 2
    call.status = 'anchored'
    alert(`${ship.name} heading to anchorage — ${b.id} occupied`, 'amber', { type: 'ship', id: ship.id })
  } else {
    sendToBerth(ship)
  }
  return ship
}

function spawnBerthed(call: Call, progress: number) {
  const b = berthById(call.berthId)
  const ship = createShip(call.kind, b, call.eta, call.id, call.name)
  ship.pos = { x: b.x, z: berthZ(ship.cls.beam) }
  ship.heading = -Math.PI / 2
  ship.finalHeading = -Math.PI / 2
  ship.state = 'working'
  ship.ataBerth = call.eta
  ship.history.push({ t: call.eta - 45, event: 'Entered San Diego Bay channel', place: 'Point Loma · Ballast Point' })
  ship.history.push({ t: call.eta, event: `All fast · ${b.terminal} ${b.id}`, place: terminalName(b) })
  ship.history.push({ t: call.eta + 20, event: 'Cargo operations started', place: terminalName(b) })
  // pre-advance cargo work
  if (ship.kind === 'container' || ship.kind === 'feeder') {
    const k = Math.floor(ship.toDischarge.size * progress)
    const ids = [...ship.toDischarge]
    let removed = 0
    // remove from the top down so stacks stay valid
    for (let tier = ship.cls.tiers! - 1; tier >= 0 && removed < k; tier--)
      for (const id of ids) {
        const c = sim.containers.get(id)!
        if (c.loc.kind !== 'ship') continue
        const l = slotLocal(ship.cls, c.loc.slot)
        if (l.tier !== tier || removed >= k) continue
        const above = slotIndex(ship.cls, l.bay, l.row, Math.min(ship.cls.tiers! - 1, l.tier + 1))
        if (l.tier < ship.cls.tiers! - 1 && ship.slots[above]) continue
        ship.slots[c.loc.slot] = null
        ship.toDischarge.delete(id)
        ship.discharged++
        removed++
        placeInYardRandom(c, ship)
      }
  } else if (ship.vehicles) {
    const d = Math.round(ship.vehicles.toDischarge * progress)
    ship.vehicles.onboard -= d
    ship.vehicles.toDischarge -= d
  } else if (ship.bulk) {
    ship.bulk.remaining = Math.round(ship.bulk.total * (1 - progress))
  } else if (ship.blades) {
    const d = Math.floor(ship.blades.total * progress)
    ship.blades.onboard -= d
    sim.laydown += d
  } else if (ship.passengers) {
    ship.passengers.ashore = Math.round(ship.passengers.total * progress)
  }
  call.shipId = ship.id
  call.status = 'working'
  return ship
}

function terminalName(b: Berth) {
  return b.terminal === 'TAMT' ? 'Tenth Avenue Marine Terminal' : b.terminal === 'NCMT' ? 'National City Marine Terminal' : 'B Street Cruise Terminal'
}

const shipSpeed = (p: PathPoint) => (p.hold ? 0.9 : p.z < 120 ? 3.2 : 9)

function stepShip(ship: Ship, dt: number) {
  const done = follow(ship, dt, shipSpeed, 1.0, 0.05)
  const b = berthById(ship.berthId)

  switch (ship.state) {
    case 'inbound': {
      if (ship.path.length && ship.path[0].hold && ship.anchorIdx === undefined) {
        ship.state = 'berthing'
        ship.history.push({ t: sim.time, event: 'Tugs fast · berthing', place: `${b.terminal} ${b.id}` })
      }
      if (done) {
        if (ship.anchorIdx !== undefined) {
          ship.state = 'anchored'
          ship.history.push({ t: sim.time, event: 'Anchored · awaiting berth', place: `San Diego anchorage A${ship.anchorIdx + 1}` })
        } else arriveBerth(ship, b)
      }
      break
    }
    case 'anchored': {
      if (!berthBusy(b, ship) && !sim.ships.some((s) => s !== ship && s.berthId === b.id && s.state === 'anchored' && (s.anchorIdx ?? 0) < (ship.anchorIdx ?? 0))) {
        ship.history.push({ t: sim.time, event: 'Anchor aweigh · proceeding to berth', place: `San Diego anchorage A${(ship.anchorIdx ?? 0) + 1}` })
        sendToBerth(ship)
      }
      break
    }
    case 'berthing':
      if (done) arriveBerth(ship, b)
      break
    case 'working':
      stepWork(ship, dt)
      break
    case 'ready':
      ship.readyTimer += dt
      if (ship.readyTimer > 6) {
        ship.state = 'unberthing'
        ship.path = buildPath(ship.pos, departureRoute(b, ship.cls.beam))
        ship.finalHeading = undefined
        ship.etd = sim.time
        ship.history.push({ t: sim.time, event: 'Unberthing · tugs fast', place: `${b.terminal} ${b.id}` })
        setCall(ship, 'departed')
        const call = sim.calls.find((c) => c.id === ship.callId)
        if (call) call.etd = sim.time
      }
      break
    case 'unberthing':
      if (!ship.path[0]?.hold) {
        ship.state = 'outbound'
        ship.history.push({ t: sim.time, event: `Departed for ${PORTS[ship.voyage.next].name}`, place: terminalName(b) })
        alert(`${ship.name} departed ${b.id} for ${PORTS[ship.voyage.next].name}`, 'blue', { type: 'ship', id: ship.id })
      }
      break
    case 'outbound':
      if (done) {
        sim.ships.splice(sim.ships.indexOf(ship), 1)
        releaseName(ship.name)
        sim.version++
      }
      break
  }
}

function arriveBerth(ship: Ship, b: Berth) {
  ship.state = 'working'
  ship.ataBerth = sim.time
  ship.heading = -Math.PI / 2
  ship.etd = sim.time + workMinutes(ship) + 20
  ship.history.push({ t: sim.time, event: `All fast · ${b.terminal} ${b.id}`, place: terminalName(b) })
  ship.history.push({ t: sim.time + 0.1, event: 'Cargo operations started', place: terminalName(b) })
  setCall(ship, 'working')
  alert(`${ship.name} berthed at ${b.terminal} ${b.id}`, 'green', { type: 'ship', id: ship.id })
  sim.version++
}

function planLoad(ship: Ship) {
  if (ship.loadPlan.length || ship.loaded) return
  const cands: { c: Container; d: number }[] = []
  for (let blk = 0; blk < BLOCKS.length; blk++)
    for (let r = 0; r < YARD_ROWS; r++)
      for (let s = 0; s < YARD_STACKS; s++) {
        if (reservedStacks.has((blk * YARD_ROWS + r) * YARD_STACKS + s)) continue
        const h = stackHeight(blk, r, s)
        if (!h) continue
        const c = containerById(sim.yard[yardSlotIndex(blk, r, s, 0, h - 1)] ?? undefined)
        if (!c || c.vesselId || c.flow === 'import') continue
        cands.push({ c, d: Math.abs(stackX(blk, s) - ship.pos.x) + r * 18 + rnd() * 30 })
      }
  cands.sort((a, b) => a.d - b.d)
  const picks = cands.slice(0, ship.plannedLoad).map(({ c }) => {
    c.vesselId = ship.id
    c.vesselName = ship.name
    c.pod = ship.voyage.next
    c.dest = PORTS[ship.voyage.next].name
    c.status = `Planned load · ${ship.name}`
    c.history.push({ t: sim.time, event: `Booked on ${ship.name} · ${ship.voyageNo}`, place: 'TAMT planning' })
    return c.id
  })
  ship.loadPlan = picks
  ship.plannedLoad = picks.length
}

function stepWork(ship: Ship, dt: number) {
  const mins = dt * SIM_MIN_PER_SEC
  const b = berthById(ship.berthId)
  let finished = false
  if (ship.kind === 'container' || ship.kind === 'feeder') {
    if (!ship.toDischarge.size) planLoad(ship)
    const before = ship.discharged + ship.loaded
    ship.stall = before === (ship as Ship & { _last?: number })._last ? ship.stall + mins : 0
    ;(ship as Ship & { _last?: number })._last = before
    if (ship.stall > 45 && !ship.toDischarge.size) {
      // give up on export boxes that can't be reached; they roll to the next call
      for (const id of ship.loadPlan) {
        const c = containerById(id)
        if (c && c.loc.kind === 'yard') {
          c.vesselId = undefined
          c.status = 'In yard · rolled to next vessel'
          c.history.push({ t: sim.time, event: `Rolled · not loaded on ${ship.name}`, place: 'TAMT planning' })
        }
      }
      ship.loadPlan = ship.loadPlan.filter((id) => containerById(id)?.loc.kind !== 'yard')
      ship.plannedLoad = ship.loaded + ship.loadPlan.length
      ship.stall = 0
    }
    finished = !ship.toDischarge.size && ship.loaded >= ship.plannedLoad && !sim.cranes.some((c) => c.shipId === ship.id && (c.job || c.carrying))
    if (finished) {
      for (const c of sim.cranes) if (c.shipId === ship.id) releaseCrane(c)
    }
  } else if (ship.vehicles) {
    const v = ship.vehicles
    v.acc += mins * 9
    while (v.acc >= 12 && v.toDischarge > 0) {
      v.acc -= 12
      const n = Math.min(12, v.toDischarge)
      v.toDischarge -= n
      v.onboard -= n
      spawnCar(ship, b)
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
    ship.passengers.ashore = Math.min(ship.passengers.total, ship.passengers.ashore + mins * 25)
    finished = ship.passengers.ashore >= ship.passengers.total && sim.time > (ship.ataBerth ?? 0) + 150
  }
  if (finished) {
    ship.state = 'ready'
    ship.readyTimer = 0
    ship.history.push({ t: sim.time, event: 'Cargo operations completed', place: terminalName(b) })
  }
}

export function shipProgress(ship: Ship) {
  if (ship.kind === 'container' || ship.kind === 'feeder') {
    const total = ship.plannedDischarge + ship.plannedLoad
    return total ? (ship.discharged + ship.loaded) / total : 1
  }
  if (ship.vehicles) return 1 - ship.vehicles.toDischarge / ship.vehicles.planned
  if (ship.bulk) return 1 - ship.bulk.remaining / ship.bulk.total
  if (ship.blades) return 1 - ship.blades.onboard / ship.blades.total
  if (ship.passengers) return ship.passengers.ashore / ship.passengers.total
  return 0
}

export function shipOnboard(ship: Ship) {
  return ship.slots.filter(Boolean).length
}

// ═════════════════════════════════════ yard

function freeStack(nearX: number, avoid = new Set<number>()) {
  let best: { blk: number; r: number; s: number; h: number; d: number } | null = null
  for (let blk = 0; blk < BLOCKS.length; blk++)
    for (let r = 0; r < YARD_ROWS; r++)
      for (let s = 0; s < YARD_STACKS; s++) {
        const key = (blk * YARD_ROWS + r) * YARD_STACKS + s
        if (avoid.has(key) || reservedStacks.has(key)) continue
        const h = stackHeight(blk, r, s)
        if (h >= 3) continue
        if (h > 0) {
          const top = containerById(sim.yard[yardSlotIndex(blk, r, s, 0, h - 1)] ?? undefined)
          if (top?.vesselId && top.flow !== 'import') continue // don't bury planned exports
        }
        const d = Math.abs(stackX(blk, s) - nearX) + r * 22 + h * 6 + rnd() * 25
        if (!best || d < best.d) best = { blk, r, s, h, d }
      }
  return best
}
const reservedStacks = new Set<number>()

function placeInYardRandom(c: Container, ship: Ship) {
  const st = freeStack(ship.pos.x)
  if (!st) {
    c.loc = { kind: 'gone', where: 'Off-dock' }
    return
  }
  const slot = yardSlotIndex(st.blk, st.r, st.s, 0, st.h)
  sim.yard[slot] = c.id
  c.loc = { kind: 'yard', slot }
  const t = (ship.ataBerth ?? sim.time) + range(25, Math.max(30, sim.time - (ship.ataBerth ?? sim.time)))
  c.history.push({ t: Math.min(t, sim.time - 1), event: `Discharged · ${ship.name}`, place: 'TAMT · MHC' })
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
            const reeferBlock = blk === 2 && r < 2
            const origin = flow === 'import' ? pick(['GTPRQ', 'CRCAL', 'ECGYE', 'MXZLO', 'CNSHA', 'KRPUS']) : 'USSAN'
            const c = makeContainer(origin, flow === 'import' ? 'USSAN' : pick(['GTPRQ', 'CRCAL', 'USOAK', 'KRPUS']), flow, { kind: 'yard', slot }, reeferBlock ? LINES[5] : undefined)
            if (reeferBlock && !c.reefer) {
              c.reefer = true
              c.size = "40' RF"
              c.temp = c.cargo === 'Empty' ? undefined : -18
            }
            const age = range(200, 4800)
            if (flow === 'import') {
              originHistory(c, `${pick(['Azul Horizon', 'Rio Lempa', 'Coral Trader'])}`, sim.time - age - range(4000, 9000), `${irange(400, 409)}N`)
              c.history.push({ t: sim.time - age, event: 'Discharged', place: 'TAMT · MHC' })
              c.history.push({ t: sim.time - age + 6, event: 'Stacked in yard', place: yardLabel(slot) })
              const released = rnd() < 0.6
              if (released) c.history.push({ t: sim.time - age + range(60, 180), event: 'Customs released (CBP)', place: 'TAMT' })
              c.status = released ? 'In yard · awaiting truck pickup' : 'In yard · customs hold'
            } else {
              c.history.push({ t: sim.time - age, event: flow === 'empty' ? 'Gate in · empty return' : 'Gate in · full export', place: 'TAMT Gate 1 · truck' })
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
  sim.gateTimer = range(1.2, 2.6)
  const util = sim.yard.filter(Boolean).length / sim.yard.length
  if (util > 0.42 || rnd() < 0.5) {
    // truck picks up a released import from the top of a front stack
    for (let tries = 0; tries < 40; tries++) {
      const blk = irange(0, 2)
      const r = irange(0, YARD_ROWS - 1)
      const s = irange(0, YARD_STACKS - 1)
      const key = (blk * YARD_ROWS + r) * YARD_STACKS + s
      if (reservedStacks.has(key)) continue
      const h = stackHeight(blk, r, s)
      if (!h) continue
      const slot = yardSlotIndex(blk, r, s, 0, h - 1)
      const c = containerById(sim.yard[slot] ?? undefined)
      if (!c || c.flow !== 'import' || c.status.includes('hold') || c.loc.kind !== 'yard') continue
      sim.yard[slot] = null
      c.loc = { kind: 'gone', where: c.dest }
      c.history.push({ t: sim.time, event: 'Gate out · full', place: `TAMT Gate 2 · truck to ${c.dest}` })
      c.status = `Out-gated · en route to ${c.dest}`
      sim.yardVersion++
      sim.teuToday += 2
      return
    }
  }
  if (util < 0.62) {
    const st = freeStack(range(-300, 300))
    if (!st) return
    const slot = yardSlotIndex(st.blk, st.r, st.s, 0, st.h)
    const flow: Container['flow'] = rnd() < 0.6 ? 'export' : 'empty'
    const c = makeContainer('USSAN', pick(['GTPRQ', 'CRCAL', 'USOAK', 'KRPUS']), flow, { kind: 'yard', slot })
    c.history.push({ t: sim.time, event: flow === 'empty' ? 'Gate in · empty return' : 'Gate in · full export', place: 'TAMT Gate 1 · truck' })
    c.history.push({ t: sim.time + 0.1, event: 'Stacked in yard', place: yardLabel(slot) })
    c.status = flow === 'empty' ? 'In yard · empty, available' : 'In yard · awaiting vessel'
    sim.yard[slot] = c.id
    sim.yardVersion++
    sim.teuToday += 2
  }
}

// ═════════════════════════════════════ cranes

const SAFE_Y = 24
export const PIVOT_Y = 17
export const BOOM = 34

export function craneTip(c: Crane) {
  return { x: c.x + Math.sin(c.slew) * c.radius, z: CRANE_Z + Math.cos(c.slew) * c.radius }
}
export const transferPos = (c: Crane, idx: number) => ({ x: c.x + (idx === 0 ? -8 : 8), y: LAND_Y + 0.65, z: TRANSFER_Z })

function targetPos(c: Crane, t: Target) {
  if (t.kind === 'transfer') return transferPos(c, t.idx)
  const ship = shipById(t.shipId)!
  return slotWorld(ship, t.slot)
}

function releaseCrane(c: Crane) {
  const ship = shipById(c.shipId)
  if (ship) ship.cranes = ship.cranes.filter((x) => x !== c.id)
  c.shipId = undefined
  c.side = 0
  c.status = 'Idle'
}

function assignCranes() {
  const working = sim.ships.filter(
    (s) => (s.kind === 'container' || s.kind === 'feeder') && s.state === 'working' && (s.toDischarge.size || s.loaded < s.plannedLoad),
  )
  // a berthed ship with no crane takes one from a ship that has two
  const starving = working.find((s) => s.cranes.length === 0)
  if (starving) {
    const rich = working.find((s) => s.cranes.length > 1)
    const spare = rich && rich.cranes.map((id) => craneById(id)!).find((c) => !c.job && !c.carrying && !c.transfer.some((t) => t.cid || t.reserved))
    if (rich && spare) {
      releaseCrane(spare)
      const keep = craneById(rich.cranes[0])
      if (keep) {
        keep.side = 0
        keep.targetX = rich.pos.x
      }
    }
  }
  for (const c of sim.cranes) {
    if (c.shipId || c.job || c.carrying || c.transfer.some((t) => t.cid || t.reserved)) continue
    const target = working.filter((s) => s.cranes.length < (starving && s !== starving ? 1 : 2)).sort((a, b) => a.cranes.length - b.cranes.length || Math.abs(a.pos.x - c.x) - Math.abs(b.pos.x - c.x))[0]
    if (!target) continue
    target.cranes.push(c.id)
    c.shipId = target.id
    const bx = target.pos.x
    if (target.cranes.length === 1) {
      c.side = 0
      c.targetX = bx
    } else {
      // split the ship between two cranes
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
  const w = slotWorld(ship, slot)
  const d = Math.hypot(w.x - c.x, w.z - CRANE_Z)
  if (d > BOOM - 1 || d < 9) return false
  if (c.side !== 0 && Math.sign(w.x - ship.pos.x) !== c.side && Math.abs(w.x - ship.pos.x) > 4) return false
  return true
}

const reservedShipSlots = new Set<string>()

function nextCraneJob(c: Crane) {
  const ship = shipById(c.shipId)
  if (!ship || ship.state !== 'working') return
  const atTarget = Math.abs(c.x - c.targetX) <= 0.5
  const cls = ship.cls
  // discharge first
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
        if (!ship.toDischarge.has(id) || reservedShipSlots.has(`${ship.id}:${slot}`)) continue
        if (!bayInReach(c, ship, slot)) continue
        const w = slotWorld(ship, slot)
        const d = Math.abs(w.x - c.x) + row * 0.3
        if (!best || d < best.d) best = { slot, d }
      }
    if (!best) {
      if (c.side !== 0 && ship.cranes.length > 1) {
        // my half is done: help elsewhere by dropping the split
        c.side = 0
      }
      return
    }
    reservedShipSlots.add(`${ship.id}:${best.slot}`)
    c.transfer[ti].reserved = true
    c.job = { from: { kind: 'ship', shipId: ship.id, slot: best.slot }, to: { kind: 'transfer', idx: ti }, cid: ship.slots[best.slot]!, type: 'discharge' }
    c.phase = 'up'
    c.status = `Discharging ${ship.name}`
    return
  }
  // load
  const ti = c.transfer.findIndex((t) => t.cid && !t.reserved && containerById(t.cid)?.vesselId === ship.id)
  if (ti < 0) {
    c.status = ship.loaded < ship.plannedLoad ? `Waiting for export box · ${ship.name}` : c.status
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
      const w = slotWorld(ship, slot)
      const d = Math.abs(w.x - c.x) + h * 2 + row * 0.2
      if (!best || d < best.d) best = { slot, d }
    }
  if (!best) {
    c.side = 0
    return
  }
  reservedShipSlots.add(`${ship.id}:${best.slot}`)
  c.transfer[ti].reserved = true
  c.job = { from: { kind: 'transfer', idx: ti }, to: { kind: 'ship', shipId: ship.id, slot: best.slot }, cid: c.transfer[ti].cid!, type: 'load' }
  c.phase = 'up'
  c.status = `Loading ${ship.name}`
}

function approach(v: number, target: number, rate: number) {
  const d = target - v
  if (Math.abs(d) <= rate) return target
  return v + Math.sign(d) * rate
}

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
  // travel along the quay when re-assigned and empty-handed
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
    cont.history.push({ t: sim.time, event: `Discharged · ${ship.name}`, place: `TAMT ${ship.berthId} · ${c.id}` })
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
    cont.history.push({ t: sim.time, event: `Loaded on ${ship.name} · ${ship.voyageNo}`, place: `TAMT ${ship.berthId} · Bay ${String(l.bay * 2 + 1).padStart(2, '0')} Row ${String(l.row).padStart(2, '0')} Tier ${82 + l.tier * 2}` })
    cont.status = `On board ${ship.name} · to ${PORTS[ship.voyage.next].name}`
  }
}

export function craneRate(c: Crane) {
  const recent = c.moveTimes.filter((t) => t > sim.time - 60)
  return recent.length
}

// ═════════════════════════════════════ handlers (container forklifts)

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
    const c = craneById(to.craneId)!
    const tp = transferPos(c, to.idx)
    const side = fromX < tp.x ? -1 : 1
    return [{ x: tp.x + side * 8, z: APRON_LANE_Z }, { x: tp.x + side * 2, z: APRON_LANE_Z + 2 }, { x: tp.x, z: TRANSFER_Z - STACK_APPROACH }]
  }
  return [{ x: 305, z: h.home.z }, { x: h.home.x, z: h.home.z }]
}

function hExit(h: Handler): { wps: Waypoint[]; aisle: number | 'corridor'; x: number } {
  const loc = h.loc
  if (loc.kind === 'stack') {
    const d = yardDecode(loc.slot)
    const sx = stackX(d.block, d.stack)
    return { wps: [{ x: sx, z: aisleZ(d.row), rev: true }], aisle: d.row, x: sx }
  }
  if (loc.kind === 'transfer') {
    const x = h.pos.x
    return { wps: [{ x, z: APRON_LANE_Z, rev: true }], aisle: 0, x }
  }
  return { wps: [{ x: 305, z: h.home.z, rev: true }], aisle: 'corridor', x: 305 }
}

function aisleOf(to: HLoc): number | 'corridor' {
  if (to.kind === 'stack') return yardDecode(to.slot).row
  if (to.kind === 'transfer') return 0
  return 'corridor'
}

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
  if (ex.aisle === 'corridor') {
    const z = zOf(tAisle) ?? h.home.z
    wps.push({ x: 305, z })
  } else if (tAisle === 'corridor') {
    wps.push({ x: 305, z: zOf(ex.aisle)! })
  } else if (ex.aisle !== tAisle) {
    const c = CORRIDORS.reduce((best, cx) => (Math.abs(ex.x - cx) + Math.abs(tx - cx) < Math.abs(ex.x - best) + Math.abs(tx - best) ? cx : best), CORRIDORS[0])
    wps.push({ x: c, z: zOf(ex.aisle)! }, { x: c, z: zOf(tAisle)! })
  }
  const lastX = wps.length ? wps[wps.length - 1].x : h.pos.x
  wps.push(...hEntry(to, lastX, h))
  return wps
}

function handlerTask(h: Handler) {
  // 1) clear discharged boxes from the apron
  for (const c of sim.cranes)
    for (let i = 0; i < 2; i++) {
      const t = c.transfer[i]
      const cont = containerById(t.cid ?? undefined)
      if (!cont || t.reserved || cont.vesselId) continue
      const st = freeStack(c.x)
      if (!st) return
      const key = (st.blk * YARD_ROWS + st.r) * YARD_STACKS + st.s
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
  // 2) bring export boxes to cranes that are loading
  for (const c of sim.cranes) {
    const ship = shipById(c.shipId)
    if (!ship || ship.toDischarge.size || ship.state !== 'working' || Math.abs(c.x - c.targetX) > 0.5) continue
    const ti = c.transfer.findIndex((t) => !t.cid && !t.reserved)
    if (ti < 0) continue
    const inFlight = sim.handlers.filter((x) => x.status.includes(ship.name)).length
    const pending = ship.loadPlan.filter((id) => {
      const cc = containerById(id)
      return cc?.loc.kind === 'yard'
    })
    if (inFlight >= pending.length) continue
    for (const id of pending) {
      const cont = containerById(id)!
      if (cont.loc.kind !== 'yard') continue
      const d = yardDecode(cont.loc.slot)
      if (d.line !== 0 || stackHeight(d.block, d.row, d.stack) !== d.tier + 1) continue
      const key = (d.block * YARD_ROWS + d.row) * YARD_STACKS + d.stack
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
            cont.history.push({ t: sim.time, event: 'Delivered to quay crane', place: `TAMT ${ship.berthId} · ${crane.id}` })
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
  // 3) idle → home
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
      if (step.to.kind === 'home') h.finalHeading = -Math.PI / 2
      h.queue.shift()
    }
    break
  }
  if (!h.queue.length) handlerTask(h)
}

// ═════════════════════════════════════ tugs

function stepTugs(dt: number) {
  const needing = sim.ships.filter((s) => s.state === 'berthing' || s.state === 'unberthing' || (s.state === 'inbound' && s.anchorIdx === undefined && s.path.length && s.path.length < 260))
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
    let th: number | null = null
    if (t.shipId && s) {
      const lateral = s.state === 'berthing' || s.state === 'unberthing'
      const lx = lateral ? s.cls.beam / 2 + 3.2 : t.offset > 0 ? 0 : 0
      const lz = lateral ? t.offset * s.cls.length * 0.28 : t.offset * (s.cls.length / 2 + 9)
      const w = toWorld(s, lx, lz)
      tx = w.x
      tz = w.z
      if (lateral) {
        const fx = -Math.cos(s.heading)
        const fz = Math.sin(s.heading)
        th = Math.atan2(fx, fz)
      } else th = s.heading
    } else {
      tx = t.home.x
      tz = t.home.z
      th = Math.PI / 2
    }
    const dx = tx - t.pos.x
    const dz = tz - t.pos.z
    const d = Math.hypot(dx, dz)
    const sp = Math.min(14, d * 1.2)
    t.speed = sp
    if (d > 0.05) {
      const step = Math.min(d, sp * dt)
      t.pos.x += (dx / d) * step
      t.pos.z += (dz / d) * step
    }
    const want = d > 4 ? Math.atan2(dx, dz) : th ?? t.heading
    t.heading = lerpAngle(t.heading, want, 1 - Math.exp(-3 * dt))
  }
}

// ═════════════════════════════════════ ro-ro vehicles

let carSeq = 0
export const LOT_ORIGIN = { x: 1100, z: -70 }
function spawnCar(ship: Ship, b: Berth) {
  const sternX = ship.pos.x + ship.cls.length / 2
  const bz = ship.pos.z
  const lotX = b.x + range(-120, 120)
  const pts: Waypoint[] = [
    { x: sternX + 4, z: bz - 2 },
    { x: sternX + 8, z: -6 },
    { x: sternX + 12, z: -16 },
    { x: lotX, z: -28 },
    { x: lotX, z: -48 },
  ]
  const start = { x: sternX - 2, z: bz }
  sim.cars.push({ id: carSeq++, shipId: ship.id, path: buildPath(start, pts), pos: start, heading: Math.PI / 2, speed: 0, color: irange(0, 5) })
}

function stepCars(dt: number) {
  for (const car of [...sim.cars]) {
    const done = follow(car as unknown as Mover, dt, () => 7, 8, 0.8)
    if (done || !car.path.length) {
      sim.cars.splice(sim.cars.indexOf(car), 1)
      sim.lot.count = Math.min(sim.lot.cap, sim.lot.count + 12)
    }
  }
  // car haulers clear the lot slowly
  if (rnd() < dt * 0.15 * sim.lot.count / sim.lot.cap) sim.lot.count = Math.max(0, sim.lot.count - 12)
}

// ═════════════════════════════════════ schedule

function scheduleCalls() {
  // each berth gets a rolling sequence of calls around "now"
  const kinds: Record<string, ShipKind[]> = {
    B1: ['multipurpose', 'bulk'],
    B2: ['container'],
    B3: ['feeder', 'container'],
    B4: ['feeder', 'container'],
    N1: ['carcarrier'],
    N2: ['carcarrier'],
    C1: ['cruise'],
  }
  for (const b of BERTHS) {
    let t = sim.time - range(500, 900)
    for (let i = 0; i < 6; i++) {
      const kind = pick(kinds[b.id])
      const dur = kind === 'cruise' ? 300 : kind === 'carcarrier' ? range(420, 600) : range(300, 520)
      sim.calls.push({ id: `C${callSeq++}`, berthId: b.id, name: shipName(kind), kind, eta: t, etd: t + dur, status: 'planned' })
      t += dur + range(80, 240)
    }
  }
}

function stepSchedule() {
  for (const call of sim.calls) {
    if (call.status !== 'planned') continue
    const lead = 95 // minutes of bay transit before berthing
    if (sim.time >= call.eta - lead) {
      const ship = spawnInbound(call)
      call.name = ship.name
    }
  }
}

// ═════════════════════════════════════ main loop

export function stepSim(dtRaw: number) {
  let remaining = Math.min(dtRaw, 0.1) * sim.speed
  while (remaining > 0) {
    const dt = Math.min(remaining, 0.05)
    remaining -= dt
    sim.time += dt * SIM_MIN_PER_SEC
    stepSchedule()
    for (const s of [...sim.ships]) stepShip(s, dt)
    assignCranes()
    for (const c of sim.cranes) stepCrane(c, dt)
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
  // cranes
  sim.cranes = [-105, -65, 85].map((x, i) => ({
    id: `MHC-${i + 1}`,
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
  // handlers
  const ops = ['M. Reyes', 'J. Tran', 'A. Okoro', 'S. Patel', 'L. Kim', 'D. Alvarez']
  sim.handlers = Array.from({ length: 6 }, (_, i) => {
    const home = { x: 318, z: -40 - i * 9 }
    return {
      id: `TL-${String(i + 1).padStart(2, '0')}`,
      home,
      loc: { kind: 'home' as const },
      pos: { ...home },
      heading: -Math.PI / 2,
      finalHeading: -Math.PI / 2,
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
  sim.tugs = ['Point Loma', 'Coronado', 'Ballast', 'Shelter'].map((n, i) => ({
    id: `TUG-${i + 1}`,
    name: `Tug ${n}`,
    home: { x: 400 + i * 12, z: 40 },
    pos: { x: 400 + i * 12, z: 40 },
    heading: Math.PI / 2,
    path: [],
    speed: 0,
    offset: 1,
  }))
  sim.lot.count = Math.round(sim.lot.cap * 0.62)
  sim.laydown = 4

  scheduleCalls()
  // bring the "current" calls to life
  for (const b of BERTHS) {
    const calls = sim.calls.filter((c) => c.berthId === b.id).sort((a, c) => a.eta - c.eta)
    for (const call of calls) {
      if (call.etd < sim.time) call.status = 'departed'
      else if (call.eta <= sim.time && call.etd > sim.time) {
        // currently at berth (except B4 and N2, which get an inbound ship for motion)
        if (b.id === 'B4' || b.id === 'N2') {
          call.eta = sim.time + 40
          call.etd = call.eta + 360
          const s = spawnInbound(call, b.id === 'N2' ? -300 : -1200)
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
  // one ship waiting at anchor for B2 and one just departing
  const b2next = sim.calls.find((c) => c.berthId === 'B2' && c.status === 'planned')
  if (b2next) {
    b2next.eta = sim.time + 30
    const s = spawnInbound(b2next, -2300)
    b2next.name = s.name
    s.pos = { ...anchorage(0) }
    s.path = []
    s.state = 'anchored'
    s.anchorIdx = 0
    s.heading = Math.PI / 2
    s.finalHeading = Math.PI / 2
    s.history.push({ t: sim.time - 50, event: 'Anchored · awaiting berth', place: 'San Diego anchorage A1' })
  }
  const dep = createShip('container', berthById('B3'), sim.time - 420, `C${callSeq++}`)
  dep.state = 'outbound'
  dep.pos = { x: -700, z: CHANNEL_Z }
  dep.heading = -Math.PI / 2
  dep.speed = 8
  dep.etd = sim.time - 30
  dep.ataBerth = sim.time - 420
  dep.history.push({ t: sim.time - 420, event: 'All fast · TAMT B3', place: 'Tenth Avenue Marine Terminal' })
  dep.history.push({ t: sim.time - 30, event: `Departed for ${PORTS[dep.voyage.next].name}`, place: 'Tenth Avenue Marine Terminal' })
  dep.path = buildPath(dep.pos, [{ x: ENTRANCE_X - 200, z: CHANNEL_Z }])
  sim.calls.push({ id: dep.callId, berthId: 'B3', name: dep.name, kind: 'container', eta: sim.time - 420, etd: sim.time - 30, shipId: dep.id, status: 'departed' })
  alert('Reefer AML block C pre-trip inspection due', 'amber')
  alert(`${b2next?.name ?? 'Vessel'} waiting at anchorage A1 — B2 occupied`, 'amber', b2next?.shipId ? { type: 'ship', id: b2next.shipId } : undefined)
}

export { CONTAINER }
