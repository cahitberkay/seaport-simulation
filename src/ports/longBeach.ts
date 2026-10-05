// Port of Long Beach: San Pedro Bay at true scale (1 unit = 2 m), projected from OpenStreetMap around Pier E.
// +x = east, +z = south (north is -z). Quay lines were read off the OSM coastline and crane positions.

import type { Waypoint } from '../sim/path'
import { frame, quayBerth, makeLanes, toLocalF } from './kit'
import type { Berth, Frame, PortDef } from './kit'

type Pt = [number, number, Partial<Waypoint>?]
/** world points expressed in a quay frame (berth paths are local) */
const local = (f: Frame, pts: Pt[]): Pt[] => pts.map(([x, z, e]) => {
  const l = toLocalF(f, x, z)
  return [l.x, l.z, e]
})

export function longBeach(): PortDef {
  // Long Beach Container Terminal (Middle Harbor): the west-facing wharf along the Pier E slip, 1,300 m
  const LBCT = frame(-178, -706, -178, -57)
  // Total Terminals International: the north shore of the West Basin (Pier T)
  const TTI = frame(-1555.5, -67.3, -755.5, -349.3)
  // International Transportation Service (Pier G, south face) and Pacific Container Terminal (Pier J, north face) share a slip
  const ITS = frame(300, 344, 720, 344)
  const PCT = frame(690, 517, 340, 517)
  // Pier F: SSA Marine breakbulk / ro-ro along the south-west face
  const PIERF = frame(-219.8, 234.1, 110.2, 502.5)
  // Long Beach Cruise Terminal (Carnival) beside the Queen Mary, Pier H east face
  const PIERH = frame(1062, 30, 1062, -170)

  // Queen's Gate (between the Middle and Long Beach breakwaters) → Long Beach Channel → Middle Harbor
  const CHANNEL: [number, number][] = [
    [1215, 4800], [1215, 3000], [1215, 1950], [1215, 1480], [1170, 1260], [820, 1110], [330, 900],
    [-110, 640], [-235, 430], [-285, 290], [-330, 180], [-345, 50],
  ]
  const lanes = makeLanes(CHANNEL, 28)
  const SEA_SPAWN = { x: 1215, z: 5000 }

  /** anchorage east of the approach lane, outside the Long Beach breakwater; aisles run west of each column */
  const anchorage = (i: number) => ({ x: 1760 + (i % 4) * 420, z: 2350 + Math.floor(i / 4) * 420 })
  const anchorageIn = (i: number, from: { x: number; z: number }): Waypoint[] => {
    const a = anchorage(i)
    const south = Math.max(from.z, a.z + 700)
    return [{ x: (from.x + a.x - 210) / 2, z: south }, { x: a.x - 210, z: south }, { x: a.x - 210, z: a.z + 60 }, a]
  }
  const anchorageOut = (i: number): Waypoint[] => {
    const a = anchorage(i)
    return [{ x: a.x - 210, z: a.z - 40 }, { x: a.x - 210, z: 2160 }, { x: 1420, z: 2060 }]
  }

  // LBCT: in bow-first up the slip; out stern-first to the Middle Harbor turning area, then swing round for the channel
  const lbct = (id: string, at: number): Berth =>
    quayBerth({
      id,
      terminal: 'LBCT',
      label: `Berth ${id}`,
      kinds: ['neopanamax'],
      cranes: true,
      // LBCT and TTI share the Middle Harbor entrance and turning area: one manoeuvre there at a time
      lock: 'MH',
      frame: LBCT,
      at,
      junction: 11,
      bow: -Math.PI / 2,
      // moored ships take lz 2.5–23.5 of the 93-wide slip, so through traffic keeps to lz 45
      arrival: (bx, off) => [[390, 118], [335, 104], [285, 70], [230, 48], [bx + 60, 45], [bx + 12, 44], [bx, off, { hold: true }]],
      departure: (bx) => [
        [bx, 45, { hold: true }],
        [Math.max(bx + 80, 230), 46, { rev: true }],
        [330, 100, { rev: true }],
        [400, 125, { rev: true }],
        [455, 150, { rev: true }],
        ...local(LBCT, [[-410, -30], [-510, -10], [-530, 90], [-450, 190]]),
      ],
    })

  // TTI: in from the east along the basin, bow west; out with a U-turn in the open West Basin
  const tti = (id: string, at: number): Berth =>
    quayBerth({
      id,
      terminal: 'TTI',
      label: `Berth ${id}`,
      kinds: ['ulcv', 'neopanamax'],
      lock: 'MH',
      frame: TTI,
      at,
      junction: 10,
      bow: -Math.PI / 2,
      // round the south end of the Pier T jut, then along the quay at lz 55 (clear of a moored neighbour)
      arrival: (bx, off) => [...local(TTI, [[-340, 90], [-420, 0], [-560, -20], [-760, -50]]), [bx + 170, 60], [bx + 60, 55], [bx + 12, 54], [bx, off, { hold: true }]],
      departure: (bx) => [
        [bx, 55, { hold: true }],
        [bx - 110, 70],
        [bx - 200, 170],
        [bx - 90, 290],
        [bx + 140, 320],
        ...local(TTI, [[-560, 180], [-420, 220]]),
      ],
    })

  // ITS / PCT slip: in bow-first heading east; out stern-first, swinging the stern into the basin north of the slip mouth
  const slipIn: Pt[] = [[140, 690], [210, 560], [265, 455]]
  // stern swings into the pocket north-west of the slip mouth, then ahead down the south-west passage
  const slipOut: Pt[] = [[225, 375, { rev: true }], [275, 455], [250, 545], [195, 630]]
  const its = quayBerth({
    id: 'G232',
    terminal: 'ITS',
    label: 'Berth G232',
    kinds: ['neopanamax'],
    lock: 'GJ',
    frame: ITS,
    at: -100,
    junction: 6,
    bow: Math.PI / 2,
    arrival: (bx, off) => [...local(ITS, slipIn), [bx - 60, 50], [bx - 12, 49], [bx, off, { hold: true }]],
    departure: (bx) => [[bx, 49, { hold: true }], [bx - 150, 60, { rev: true }], ...local(ITS, slipOut)],
  })
  const pct = quayBerth({
    id: 'J266',
    terminal: 'PCT',
    label: 'Berth J266',
    kinds: ['neopanamax'],
    lock: 'GJ',
    frame: PCT,
    at: -45,
    junction: 6,
    bow: -Math.PI / 2,
    arrival: (bx, off) => [...local(PCT, slipIn), ...local(PCT, [[330, 445]]), [bx + 150, 60], [bx + 60, 50], [bx + 12, 49], [bx, off, { hold: true }]],
    departure: (bx) => [[bx, 49, { hold: true }], [bx + 170, 60, { rev: true }], ...local(PCT, [[300, 440, { rev: true }]]), ...local(PCT, slipOut)],
  })

  // Pier F ro-ro: straight in heading north-west; out with a U-turn in the outer harbour
  const pierF = (id: string, at: number, turn: Pt[]): Berth =>
    quayBerth({
      id,
      terminal: 'PIERF',
      label: `Berth ${id}`,
      kinds: ['carcarrier', 'multipurpose'],
      frame: PIERF,
      at,
      junction: 7,
      bow: -Math.PI / 2,
      arrival: (bx, off) => [[bx + 150, 110], [bx + 90, 55], [bx + 60, 45], [bx + 12, 44], [bx, off, { hold: true }]],
      departure: (bx) => [[bx, 45, { hold: true }], [bx - 80, 60], ...local(PIERF, turn)],
    })

  // cruise: up the east side of Pier J, alongside heading north; out round the north end and back down the east side
  const cruise = quayBerth({
    id: 'H1',
    terminal: 'CRUISE',
    label: 'Long Beach Cruise Terminal',
    kinds: ['cruise'],
    frame: PIERH,
    at: 0,
    junction: 4,
    // waits east of the lanes inside Queen's Gate, out of the way of cargo traffic
    wait: { x: 1260, z: 1200 },
    bow: Math.PI / 2,
    arrival: (bx, off) => [...local(PIERH, [[1300, 1150], [1350, 700], [1280, 300], [1107, 80]]), [bx - 60, 30], [bx - 15, 29], [bx, off, { hold: true }]],
    departure: (bx) => [[bx, 40, { hold: true }], ...local(PIERH, [[1122, -250], [1260, -255], [1390, -100], [1420, 400], [1385, 900], [1300, 1200]])],
  })

  const BERTHS: Berth[] = [
    // the southern 150 m of the wharf is kept clear: ships swing in from the slip mouth there
    lbct('E24', -230),
    lbct('E25', -60),
    lbct('E26', 110),
    tti('T132', -150),
    tti('T136', 100),
    its,
    pct,
    // out with a U-turn to port into the open outer harbour, ending on the outbound side of the channel
    pierF('F209', 60, [[-230, 470], [-300, 620], [-220, 740], [-60, 770]]),
    cruise,
  ]

  return {
    id: 'long-beach',
    name: 'Port of Long Beach',
    short: 'Long Beach',
    region: 'San Pedro Bay · California',
    unlocode: 'USLGB',
    bay: 'San Pedro Bay',
    ct: {
      id: 'LBCT',
      code: 'LBCT',
      name: 'Long Beach Container Terminal',
      frame: LBCT,
      crane: 'sts',
      craneXs: [-215, -135, -40, 40, 135, 215],
      boom: 46,
      apron: [[-322, 0], [322, 0], [322, 120], [-322, 120]],
      lights: [-280, -190, -100, -10, 80, 170, 260],
      gate: 'LBCT Gate',
      // three stacking blocks along the 1,300 m wharf so every berth has a block behind it
      blocks: [
        { id: 'A', cx: -205 },
        { id: 'B', cx: -40 },
        { id: 'C', cx: 125 },
      ],
      corridors: [-122, 42, 205],
      homeCorridor: 205,
      handlers: 10,
    },
    roro: { id: 'PIERF', code: 'PIER F', frame: PIERF },
    CHANNEL,
    lane: 28,
    SEA_SPAWN,
    EXIT: { x: 900, z: 5400 },
    anchorJoin: 2,
    // tug-assisted turns and sternway in the narrow slips are quicker than in San Diego's wide basins
    speeds: { approach: 5, rev: 3.2, manoeuvre: 6 },
    anchorage,
    anchorageIn,
    anchorageOut,
    ZONES: {
      MH: [
        { x: -430, z: -10, r: 185 },
        { x: -1050, z: -60, r: 330 },
        { x: -700, z: 60, r: 200 },
      ],
      GJ: { x: 250, z: 470, r: 200 },
      PIERF: { x: -160, z: 585, r: 230 },
      CRUISE: { x: 1200, z: -60, r: 260 },
    },
    BERTHS,
    TERMINALS: [
      { id: 'LBCT', code: 'LBCT', name: 'Long Beach Container Terminal', short: 'Middle Harbor', kind: 'Automated container terminal · Piers E & F · 311 acres', address: '1171 Pier F Ave, Long Beach' },
      { id: 'TTI', code: 'TTI', name: 'Total Terminals International', short: 'Pier T', kind: 'Container terminal · Pier T · 385 acres', address: '301 Mitchell Ave, Long Beach' },
      { id: 'ITS', code: 'ITS', name: 'International Transportation Service', short: 'Pier G', kind: 'Container terminal · Pier G · 246 acres', address: '1281 Pier G Way, Long Beach' },
      { id: 'PCT', code: 'PCT', name: 'Pacific Container Terminal', short: 'Pier J', kind: 'Container terminal · Pier J · 256 acres', address: '1521 Pier J Ave, Long Beach' },
      { id: 'PIERF', code: 'PIER F', name: 'Pier F · SSA Marine', short: 'Pier F', kind: 'Breakbulk · Ro-Ro · Project cargo', address: 'Pier F, Long Beach' },
      { id: 'CRUISE', code: 'LBCRT', name: 'Long Beach Cruise Terminal', short: 'Pier H', kind: 'Cruise · Carnival Cruise Line', address: '231 Windsor Way, Long Beach', labelOnly: true },
    ],
    schedule: {
      E24: ['neopanamax'],
      E25: ['neopanamax'],
      E26: ['neopanamax'],
      T132: ['ulcv', 'neopanamax'],
      T136: ['ulcv'],
      G232: ['neopanamax'],
      J266: ['neopanamax'],
      F209: ['carcarrier', 'carcarrier', 'multipurpose'],
      H1: ['cruise'],
    },
    init: {
      inbound: [
        { berth: 'E26', node: 6 },
        { berth: 'F209', node: 3 },
        { berth: 'H1', node: 1 },
      ],
      anchoredFor: 'E25',
      departed: { berth: 'T136', node: 8, kind: 'ulcv' },
    },
    tugs: [
      { name: 'Middle Harbor', home: { x: -640, z: 40 } },
      { name: 'Pier T', home: { x: -660, z: 60 } },
      { name: 'Queens Gate', home: { x: 190, z: 640 } },
      { name: 'Angels Gate', home: { x: 205, z: 655 } },
      { name: 'Signal Hill', home: { x: 1250, z: 250 } },
      { name: 'Belmont', home: { x: 1265, z: 265 } },
    ],
    services: {
      neopanamax: [
        { service: 'Transpacific · Central China Loop', prev: ['CNSHA', 'CNNGB', 'KRPUS'], next: ['CNSHA', 'CNNGB', 'JPYOK', 'USOAK'] },
        { service: 'Transpacific · South China Express', prev: ['CNYTN', 'HKHKG', 'CNXMN', 'TWKHH'], next: ['CNYTN', 'TWKHH', 'USOAK'] },
      ],
      ulcv: [
        { service: 'Asia–USWC Mainline', prev: ['CNYTN', 'CNSHA', 'VNCMT', 'SGSIN'], next: ['CNYTN', 'CNNGB', 'KRPUS'] },
      ],
      carcarrier: [
        { service: 'Japan–USWC Auto', prev: ['JPNGO', 'JPYOK'], next: ['JPYOK', 'USHNL'] },
        { service: 'Korea–USWC Auto', prev: ['KRPTK'], next: ['KRPTK', 'MXLZC'] },
      ],
      multipurpose: [{ service: 'Project Cargo · Steel & Wind', prev: ['CNSHA', 'KRPUS'], next: ['MXZLO', 'KRPUS'] }],
      cruise: [
        { service: 'Baja Mexico · 4 nights', prev: ['MXENS', 'USAVX'], next: ['USAVX', 'MXENS'] },
        { service: 'Mexican Riviera · 7 nights', prev: ['MXCSL', 'MXPVR', 'MXMZT'], next: ['MXCSL', 'MXPVR', 'MXMZT'] },
      ],
    },
    text: {
      arrived: 'Arrived off Long Beach',
      seaBuoy: 'Precautionary area · 3 nm S of Queen’s Gate',
      pilot: 'Jacobsen Pilot Service · Long Beach pilot station',
      entered: 'Entered Long Beach Harbor',
      enteredPlace: 'Queen’s Gate · Long Beach Channel',
      inside: 'Inside the breakwater · awaiting berthing window',
      anchorage: 'San Pedro Bay anchorage',
    },
    inland: ['Los Angeles, CA (truck)', 'Inland Empire DC, CA (truck)', 'Phoenix, AZ (rail)', 'Chicago, IL (rail)', 'Dallas, TX (rail)', 'Memphis, TN (rail)', 'Las Vegas, NV (truck)'],
    cruiseLines: ['Carnival Cruise Line'],
    cameras: {
      overview: [400, 5200, 5600, -200, 0, 400],
      vessels: [1420, 380, 420, 980, 0, -40],
      logistics: [300, 1400, 1700, -200, 0, 100],
    },
    QUEEN_MARY: { x: 935, z: -159, heading: Math.atan2(-0.928, -0.371), length: 155 },
    decorQuays: [
      { name: 'TTI', a: [-1555.5, -67.3], b: [-755.5, -349.3], depth: 230, cranes: 10 },
      { name: 'ITS', a: [300, 344], b: [720, 344], depth: 210, cranes: 6 },
      { name: 'PCT north', a: [690, 517], b: [340, 517], depth: 200, cranes: 5 },
      { name: 'PCT south', a: [1060, 752], b: [720, 752], depth: 200, cranes: 6 },
      { name: 'SSA Pier A', a: [-1240, -989], b: [-793, -1114], depth: 260, cranes: 7 },
      { name: 'Matson Pier C', a: [-420, -1075], b: [-250, -1145], depth: 150, cranes: 3 },
    ],
    ...lanes,
  }
}
