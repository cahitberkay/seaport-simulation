// Port of San Diego: San Diego Bay at true scale (1 unit = 2 m), projected from OpenStreetMap around downtown.
// +x = east, +z = south (north is -z).

import type { Waypoint } from '../sim/path'
import { GEO } from '../sim/geo'
import { frame, quayBerth, slipBerth, makeLanes } from './kit'
import type { Berth, PortDef, ShipKind } from './kit'

export function sanDiego(): PortDef {
  const TAMT_FRAME = frame(174, 235, 478, 482) // SW-facing quay, 783 m
  const NCMT_FRAME = frame(1990, 2662, 2052, 2964) // W-facing quay, 616 m

  // shipping channel: centreline fitted to the OSM coastline, two lanes either side
  const CHANNEL: [number, number][] = [
    [-3150, 5200], [-2900, 3200], [-2940, 1760], [-2970, 1540], [-2990, 1040], [-2980, 360], [-2970, -20], [-2500, -500],
    [-2130, -760], [-1200, -780], [-790, -780], [-700, -190], [-490, -40], [140, 430], [320, 700], [420, 800], [580, 840],
    [860, 1040], [1160, 1390], [1510, 1840], [1710, 2340], [1760, 2550],
  ]
  const lanes = makeLanes(CHANNEL, 34)
  const SEA_SPAWN = { x: -3150, z: 5400 }

  /** offshore anchorage field east of the approach lane (open water south of Coronado); aisles run west of each column */
  const anchorage = (i: number) => ({ x: -2350 + (i % 4) * 420, z: 3350 + Math.floor(i / 4) * 420 })
  const anchorageIn = (i: number, from: { x: number; z: number }): Waypoint[] => {
    const a = anchorage(i)
    const south = Math.max(from.z, a.z + 700)
    return [{ x: (from.x + a.x - 210) / 2, z: south }, { x: a.x - 210, z: south }, { x: a.x - 210, z: a.z + 60 }, a]
  }
  const anchorageOut = (i: number): Waypoint[] => {
    const a = anchorage(i)
    return [{ x: a.x - 210, z: a.z - 40 }, { x: a.x - 210, z: 3000 }, { x: -2700, z: 2500 }]
  }

  // Tenth Avenue: past the berth, swing round in the basin off Barrio Logan, come back bow-north-west, tugs push alongside
  const tamt = (i: number, kinds: ShipKind[], cranes: boolean) =>
    quayBerth({
      id: `B${i + 1}`,
      terminal: 'TAMT',
      label: `Berth ${i + 1}`,
      kinds,
      cranes,
      frame: TAMT_FRAME,
      at: [-147, -49, 49, 147][i],
      junction: 14,
      // aside from the lanes on the Coronado side, so traffic for National City and the naval base can pass
      wait: { x: 237, z: 763 },
      bow: -Math.PI / 2,
      arrival: (bx, off) => [[bx + 150, 250], [bx + 215, 170], [bx + 175, 75], [bx + 70, 36], [bx + 10, 32], [bx, off, { hold: true }]],
      departure: (bx, off) => [[bx, off + 30, { hold: true }], [bx - 90, 48], [bx - 170, 120]],
    })
  const ncmt = (i: number) =>
    quayBerth({
      id: `N${i + 1}`,
      terminal: 'NCMT',
      label: `Berth ${i + 1}`,
      kinds: ['carcarrier'],
      frame: NCMT_FRAME,
      at: i === 0 ? -77 : 77,
      junction: 21,
      bow: Math.PI / 2,
      arrival: (bx, off) => [[bx - 200, 70], [bx - 70, 34], [bx - 10, 32], [bx, off, { hold: true }]],
      departure: (bx, off) => [[bx, off + 32, { hold: true }], [bx + 120, 70], [bx + 190, 190], [bx + 110, 300], [bx - 70, 300], [bx - 260, 210]],
    })

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

  const BERTHS: Berth[] = [
    tamt(0, ['bulk', 'multipurpose'], false),
    tamt(1, ['container'], true),
    tamt(2, ['container', 'feeder'], true),
    tamt(3, ['feeder', 'container'], true),
    ncmt(0),
    ncmt(1),
    slipBerth('C1', 'CRUISE', 'B Street Pier · North', ['cruise'], [-396, -717.5], [-547, -717.5], 1, 0, 9, downtownTurn),
    slipBerth('C2', 'CRUISE', 'B Street Pier · South', ['cruise'], [-396, -657], [-547, -657], -1, 0, 9, downtownTurn),
    slipBerth('C3', 'CRUISE', 'Broadway Pier · South', ['cruise'], [-396, -582.5], [-549, -582.5], -1, 1, 9, downtownTurn, 30),
  ]

  // naval moorings at Naval Base San Diego (32nd Street)
  // (Pier 2 and the north face of Pier 7 run into charted obstructions in the coastline data)
  ;['Pier 3', 'Pier 4', 'Pier 5', 'Pier 6', 'Pier 7'].forEach((name, k) => {
    const p = navalPier(name)
    if (!p) return
    for (const side of [1, -1] as const) {
      if (name === 'Pier 7' && side === 1) continue
      const kinds: ShipKind[] = name === 'Pier 7' ? ['amphib'] : k % 2 ? ['cruiser', 'destroyer'] : ['destroyer']
      const no = name.split(' ')[1]
      BERTHS.push(slipBerth(`NB${no}${side > 0 ? 'N' : 'S'}`, 'NAVY', `${name} · ${side > 0 ? 'North' : 'South'}`, kinds, p.root, p.tip, side, 6, k < 2 ? 18 : 19, navyTurn))
    }
  })

  // carrier pier at Naval Air Station North Island (static)
  const CARRIER_POSE = (() => {
    const a = [-1239, -496]
    const b = [-1077, -380]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    const ux = (b[0] - a[0]) / L
    const uz = (b[1] - a[1]) / L
    const off = 10 + 4
    return { x: (a[0] + b[0]) / 2 + uz * off, z: (a[1] + b[1]) / 2 - ux * off, heading: Math.atan2(ux, uz) }
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

  return {
    id: 'san-diego',
    name: 'Port of San Diego',
    short: 'San Diego',
    region: 'San Diego Bay · California',
    unlocode: 'USSAN',
    bay: 'San Diego Bay',
    ct: {
      id: 'TAMT',
      code: 'TAMT',
      name: 'Tenth Avenue Marine Terminal',
      frame: TAMT_FRAME,
      crane: 'mhc',
      craneXs: [-60, -38, 49],
      boom: 34,
      // the terminal pavement follows the TAMT outline: the NW face tapers in towards the sheds
      apron: [[-196, 0], [196, 0], [214, 78], [-150, 78]],
      lights: [-150, -60, 30, 120, 190],
      gate: 'TAMT Gate',
    },
    roro: { id: 'NCMT', code: 'NCMT', frame: NCMT_FRAME },
    CHANNEL,
    lane: 34,
    SEA_SPAWN,
    EXIT: { x: SEA_SPAWN.x - 300, z: SEA_SPAWN.z + 400 },
    anchorJoin: 2,
    anchorage,
    anchorageIn,
    anchorageOut,
    ZONES: {
      CRUISE: { x: -690, z: -650, r: 250 },
      TAMT: { x: 348, z: 570, r: 270 },
      NAVY: { x: 1560, z: 1470, r: 320 },
      NCMT: { x: 1840, z: 2700, r: 260 },
    },
    BERTHS,
    TERMINALS: [
      { id: 'TAMT', code: 'TAMT', name: 'Tenth Avenue Marine Terminal', short: 'Tenth Avenue', kind: 'Multi-purpose · 8 berths · 96 acres', address: '1150 Cesar E Chavez Pkwy, San Diego' },
      { id: 'NCMT', code: 'NCMT', name: 'National City Marine Terminal', short: 'National City', kind: 'Ro-Ro · Vehicle imports · 135 acres', address: '1203 Bay Marina Dr, National City' },
      { id: 'CRUISE', code: 'BST', name: 'B Street & Broadway Cruise Terminals', short: 'Cruise piers', kind: 'Cruise · Passenger', address: '1140 N Harbor Dr, San Diego', labelOnly: true },
      { id: 'NAVY', code: 'NBSD', name: 'Naval Base San Diego', short: '32nd Street', kind: 'U.S. Navy · Pacific Fleet', address: '3455 Senn Rd, San Diego', navy: true },
      { id: 'NASNI', code: 'NASNI', name: 'Naval Air Station North Island', short: 'North Island', kind: 'U.S. Navy · Carrier homeport', address: 'Coronado, CA', navy: true },
    ],
    schedule: {
      B1: ['multipurpose', 'bulk'],
      B2: ['container'],
      B3: ['feeder', 'container'],
      B4: ['feeder', 'container'],
      N1: ['carcarrier'],
      N2: ['carcarrier'],
      C1: ['cruise'],
      C2: ['cruise'],
      C3: ['cruise'],
    },
    init: {
      // these three start out sailing in, so there is traffic in the channel from the first second
      inbound: [
        { berth: 'B4', node: 10 },
        { berth: 'N2', node: 14 },
        { berth: 'C3', node: 6 },
      ],
      anchoredFor: 'B2',
      departed: { berth: 'B3', node: 9, kind: 'container' },
      statics: [{ berth: 'NI1', kind: 'carrier' }],
    },
    tugs: ['Point Loma', 'Coronado', 'Ballast', 'Shelter', 'Cabrillo', 'Silver Strand'].map((name, i) => ({ name, home: { x: 560 + i * 9, z: 520 + i * 6 } })),
    services: {},
    text: {
      arrived: 'Arrived off San Diego',
      seaBuoy: 'Sea buoy · 2 nm SW of Point Loma',
      pilot: 'San Diego pilot station · off Point Loma',
      entered: 'Entered San Diego Bay',
      enteredPlace: 'Ballast Point · main channel',
      inside: 'Inside the bay · awaiting berthing window',
      anchorage: 'San Diego anchorage',
      navyHome: 'homeport San Diego',
      exercise: 'SOCAL operating area',
    },
    inland: ['San Diego, CA', 'Los Angeles, CA (truck)', 'Phoenix, AZ (rail)', 'Las Vegas, NV (truck)', 'Denver, CO (rail)', 'Tijuana, MX (truck)', 'Salt Lake City, UT (rail)'],
    cruiseLines: ['AnyMile Cruises', 'Coral Voyages', 'Pacific Star Line', 'Riviera Seas'],
    cameras: {
      overview: [100, 6200, 6300, -500, 0, 700],
      vessels: [-170, 340, -160, -530, 0, -610],
      logistics: [1650, 900, 1500, 900, 0, 650],
    },
    MIDWAY_POSE: { x: -479, z: -483.5, heading: -Math.PI / 2, length: 154 },
    CARRIER_POSE,
    ...lanes,
  }
}
