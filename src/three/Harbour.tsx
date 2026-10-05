// Port features beyond the simulated terminal: the other container terminals (stacks + ship-to-shore cranes),
// high bridges, and Long Beach landmarks (Queen Mary, the cruise dome, the THUMS oil islands).
import { useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GEO, isLand, pointInRing } from '../sim/geo'
import type { GeoBridge } from '../sim/geo'
import { LAND_Y, PORT, CONTAINER } from '../sim/world'
import { frame, toWorldF } from '../ports/kit'
import { PLACES } from '../sim/places'
import { useUI } from '../store'

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.75, ...p })

const clickable = (onClick: () => void) => ({
  onClick: (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onClick()
  },
  onPointerOver: (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    document.body.style.cursor = 'pointer'
  },
  onPointerOut: () => (document.body.style.cursor = ''),
})

function hash(n: number) {
  let h = n | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const BOX_COLORS = ['#2f6bed', '#13a39a', '#f08a0b', '#1e3a8a', '#e0533d', '#eef1f7', '#7a8296', '#c8463a', '#2a9d4b', '#f6b40e']
/** stacks in one yard block lean towards a couple of line colours, like a real terminal plan */
const blockColor = (block: number, seq: number) => {
  const r = hash(seq * 13)
  const main = Math.floor(hash(block * 7 + 3) * BOX_COLORS.length)
  const second = Math.floor(hash(block * 11 + 5) * BOX_COLORS.length)
  return r < 0.55 ? main : r < 0.8 ? second : Math.floor(hash(seq * 17) * BOX_COLORS.length)
}

// ───────── container stacks: one instance per stack, scaled by tier count

interface Stack {
  x: number
  z: number
  rot: number
  tiers: number
  color: number
}

/** building footprints near a point (to keep stacks off sheds and offices) */
function buildingGrid() {
  const cell = 200
  const grid = new Map<string, number[]>()
  GEO.buildings.forEach((b, i) => {
    let x0 = Infinity
    let x1 = -Infinity
    let z0 = Infinity
    let z1 = -Infinity
    for (const [x, z] of b.p) {
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      z0 = Math.min(z0, z)
      z1 = Math.max(z1, z)
    }
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++)
      for (let gz = Math.floor(z0 / cell); gz <= Math.floor(z1 / cell); gz++) {
        const k = `${gx},${gz}`
        if (!grid.has(k)) grid.set(k, [])
        grid.get(k)!.push(i)
      }
  })
  return (x: number, z: number) => (grid.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) ?? []).some((i) => pointInRing(x, z, GEO.buildings[i].p))
}

function buildStacks() {
  const out: Stack[] = []
  const cranes: { x: number; z: number; rot: number }[] = []
  const onBuilding = buildingGrid()
  let seq = 0
  const free = (x: number, z: number) => isLand(x, z) && !onBuilding(x, z)
  for (const q of PORT.decorQuays ?? []) {
    let f = frame(q.a[0], q.a[1], q.b[0], q.b[1])
    // the water must be on the +z side of the quay frame
    const probe = toWorldF(f, 0, 25)
    if (isLand(probe.x, probe.z)) f = frame(q.b[0], q.b[1], q.a[0], q.a[1])
    const half = Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]) / 2
    // ship-to-shore cranes along the quay edge
    for (let k = 0; k < q.cranes; k++) {
      const lx = -half + 30 + ((half * 2 - 60) * (k + 0.5)) / q.cranes
      const w = toWorldF(f, lx, 0)
      cranes.push({ x: w.x, z: w.z, rot: f.rot })
    }
    // yard blocks behind a 40-unit apron: 6 rows per block, aisles in between
    for (let lz = -42; lz > -q.depth; lz -= 1.45) {
      const row = Math.round((-42 - lz) / 1.45)
      if (row % 8 >= 6) continue
      for (let lx = -half + 8; lx < half - 8; lx += 6.6) {
        const col = Math.round((lx + half) / 6.6)
        if (col % 12 === 11) continue
        const w = toWorldF(f, lx, lz)
        if (!free(w.x, w.z)) continue
        const r = hash(seq++)
        if (r < 0.12) continue
        out.push({ x: w.x, z: w.z, rot: f.rot, tiers: 1 + Math.floor(hash(seq * 7) * 4), color: blockColor(Math.floor(col / 12) * 31 + Math.floor(row / 8), seq) })
      }
    }
  }
  // Port of Los Angeles terminals: fill the OSM outlines on an axis-aligned grid
  for (const y of GEO.yards ?? []) {
    let x0 = Infinity
    let x1 = -Infinity
    let z0 = Infinity
    let z1 = -Infinity
    for (const [x, z] of y.p) {
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      z0 = Math.min(z0, z)
      z1 = Math.max(z1, z)
    }
    for (let z = z0 + 10; z < z1 - 10; z += 1.45) {
      const row = Math.round((z - z0) / 1.45)
      if (row % 8 >= 6) continue
      for (let x = x0 + 10; x < x1 - 10; x += 6.6) {
        if (Math.round((x - x0) / 6.6) % 12 === 11) continue
        if (!pointInRing(x, z, y.p) || !free(x, z)) continue
        const r = hash(seq++)
        if (r < 0.2) continue
        out.push({ x, z, rot: 0, tiers: 1 + Math.floor(hash(seq * 7) * 4), color: blockColor(Math.floor((x - x0) / 79) * 31 + Math.floor((z - z0) / 11.6) + y.n.length * 977, seq) })
      }
    }
  }
  return { stacks: out, cranes }
}

const stackGeo = new THREE.BoxGeometry(CONTAINER.len, CONTAINER.hgt, CONTAINER.wid).translate(0, CONTAINER.hgt / 2, 0)

function Stacks({ stacks }: { stacks: Stack[] }) {
  const mat = useMemo(() => std({ color: '#ffffff', roughness: 0.6 }), [])
  const setup = (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const c = new THREE.Color()
    stacks.forEach((s, i) => {
      q.setFromEuler(e.set(0, s.rot, 0))
      m.compose(new THREE.Vector3(s.x, LAND_Y, s.z), q, new THREE.Vector3(1, s.tiers * 1.04, 1))
      mesh.setMatrixAt(i, m)
      mesh.setColorAt(i, c.set(BOX_COLORS[s.color]))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }
  if (!stacks.length) return null
  return <instancedMesh ref={setup} args={[stackGeo, mat, stacks.length]} castShadow receiveShadow />
}

// ───────── static ship-to-shore cranes (one merged frame, instanced)

function stsFrameGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d)
    if (rx) g.rotateX(rx)
    g.translate(x, y, z)
    parts.push(g.toNonIndexed())
  }
  const G = 28
  for (const z of [-2, -17]) {
    for (const x of [-6.5, 6.5]) box(1.1, G, 1.1, x, G / 2, z)
    box(14, 0.9, 1, 0, 1.6, z)
  }
  for (const x of [-6.5, 6.5]) box(0.8, 0.8, 15, x, G * 0.55, -9.5)
  for (const x of [-2.2, 2.2]) box(1, 1.6, 74, x, G, 3)
  box(14, 1.2, 2, 0, G + 0.4, -9.5)
  for (const x of [-2.4, 2.4]) box(0.8, 14, 0.8, x, G + 7, -16)
  box(6.5, 3, 9, 0, G + 2.2, -28)
  box(5.2, 1.4, 3.4, 0, G - 0.8, 18)
  return mergeGeometries(parts)
}

function StaticCranes({ cranes }: { cranes: { x: number; z: number; rot: number }[] }) {
  const geo = useMemo(() => stsFrameGeometry(), [])
  const mat = useMemo(() => std({ color: '#d9483b', roughness: 0.5 }), [])
  const setup = (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    cranes.forEach((c, i) => {
      q.setFromEuler(e.set(0, c.rot, 0))
      m.compose(new THREE.Vector3(c.x, LAND_Y, c.z), q, new THREE.Vector3(1, 1, 1))
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }
  if (!cranes.length) return null
  return <instancedMesh ref={setup} args={[geo, mat, cranes.length]} castShadow />
}

export function OtherTerminals() {
  const { stacks, cranes } = useMemo(() => buildStacks(), [])
  return (
    <group>
      <Stacks stacks={stacks} />
      <StaticCranes cranes={cranes} />
    </group>
  )
}

// ───────── high bridges: deck rises from both banks to its clearance over the main channel

function deckProfile(b: GeoBridge) {
  const pts = b.c.map(([x, z]) => new THREE.Vector2(x, z))
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
  const total = cum[cum.length - 1]
  const at = (s: number) => {
    let i = 1
    while (i < cum.length - 1 && cum[i] < s) i++
    const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)
    return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, z: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }
  }
  let h: (s: number) => number
  let centre = total / 2
  if (b.n.startsWith('San Diego')) {
    // the high span is over the main channel; the Coronado end curves down onto 4th Street
    const peak = cum[pts.findIndex((p) => p.y > 650) || 0]
    h = (s: number) => {
      const up = Math.min(1, s / peak)
      const down = Math.max(0, 1 - (s - peak) / (total * 0.62 - peak + 1))
      return LAND_Y + 1.5 + b.peak * Math.sin((Math.PI / 2) * Math.min(up, s > peak ? down : 1)) ** 1.1
    }
    centre = peak
  } else {
    // centre of the longest stretch over water is the navigation span
    let best = [0, 0]
    let run = -1
    for (let s = 0; s <= total; s += 4) {
      const p = at(s)
      if (!isLand(p.x, p.z)) {
        if (run < 0) run = s
        if (s - run > best[1] - best[0]) best = [run, s]
      } else run = -1
    }
    centre = (best[0] + best[1]) / 2
    const flat = Math.min(60, (best[1] - best[0]) / 2)
    h = (s: number) => {
      const d = Math.abs(s - centre)
      const reach = s < centre ? centre : total - centre
      const t = d < flat ? 1 : Math.max(0, 1 - (d - flat) / Math.max(1, reach - flat))
      return LAND_Y + 1.5 + b.peak * Math.sin((Math.PI / 2) * t) ** 1.2
    }
  }
  return { at, h, total, centre }
}

function Bridge({ b }: { b: GeoBridge }) {
  const { segs, towers, cables } = useMemo(() => {
    const { at, h, total, centre } = deckProfile(b)
    const segs: { x: number; y: number; z: number; len: number; heading: number; pitch: number; pier: boolean }[] = []
    const step = 18
    for (let s = 0; s < total - 0.01; s += step) {
      const s1 = Math.min(total, s + step)
      const a = at(s)
      const c = at(s1)
      const y0 = h(s)
      const y1 = h(s1)
      const l = Math.hypot(c.x - a.x, c.z - a.z)
      segs.push({ x: (a.x + c.x) / 2, y: (y0 + y1) / 2, z: (a.z + c.z) / 2, len: l, heading: Math.atan2(c.x - a.x, c.z - a.z), pitch: Math.atan2(y1 - y0, l), pier: segs.length % 3 === 0 })
    }
    // cable-stayed (Gateway) and suspension (Vincent Thomas) towers either side of the navigation span
    const towers: { x: number; z: number; y: number; h: number; heading: number }[] = []
    const cables: { a: THREE.Vector3; b: THREE.Vector3 }[] = []
    const span = b.n.includes('Gateway') ? 76 : b.n.includes('Vincent') ? 114 : 0
    if (span) {
      const tall = b.n.includes('Gateway') ? 78 : 56
      for (const k of [-1, 1]) {
        const s = centre + k * span
        const p = at(s)
        const q = at(s + 1)
        const heading = Math.atan2(q.x - p.x, q.z - p.z)
        towers.push({ x: p.x, z: p.z, y: 0, h: tall, heading })
        if (b.n.includes('Gateway'))
          for (let j = 1; j <= 7; j++)
            for (const dir of [-1, 1]) {
              const d = at(s + dir * j * 17)
              cables.push({ a: new THREE.Vector3(p.x, tall - j * 2.5, p.z), b: new THREE.Vector3(d.x, h(s + dir * j * 17) + 1, d.z) })
            }
      }
      if (b.n.includes('Vincent')) {
        // main cable sagging between the towers
        for (let j = 0; j < 16; j++) {
          const s0 = centre - span + (2 * span * j) / 16
          const s1 = centre - span + (2 * span * (j + 1)) / 16
          const sag = (s: number) => tall - 36 * (1 - ((s - centre) / span) ** 2)
          const p0 = at(s0)
          const p1 = at(s1)
          cables.push({ a: new THREE.Vector3(p0.x, sag(s0), p0.z), b: new THREE.Vector3(p1.x, sag(s1), p1.z) })
        }
      }
    }
    return { segs, towers, cables }
  }, [b])
  const mats = useMemo(
    () => ({ deck: std({ color: b.color, roughness: 0.5 }), top: std({ color: '#f2f4f9' }), pier: std({ color: '#b9c0d1' }), tower: std({ color: b.n.includes('Gateway') ? '#f6f7fb' : b.color }), cable: std({ color: '#d7dbe4' }) }),
    [b],
  )
  return (
    <group>
      {segs.map((s, i) => (
        <group key={i} position={[s.x, s.y, s.z]} rotation={[0, s.heading, 0]}>
          <mesh material={mats.deck} rotation={[-s.pitch, 0, 0]} castShadow>
            <boxGeometry args={[9, 2.4, s.len + 0.4]} />
          </mesh>
          <mesh material={mats.top} rotation={[-s.pitch, 0, 0]} position={[0, 1.35, 0]}>
            <boxGeometry args={[9.4, 0.3, s.len + 0.4]} />
          </mesh>
          {s.pier && s.y > 5 && (
            <mesh material={mats.pier} position={[0, -s.y / 2 - 0.6, 0]} castShadow>
              <boxGeometry args={[6, s.y, 2.2]} />
            </mesh>
          )}
        </group>
      ))}
      {towers.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} rotation={[0, t.heading, 0]}>
          {[-4.8, 4.8].map((x) => (
            <mesh key={x} material={mats.tower} position={[x, t.h / 2, 0]} castShadow>
              <boxGeometry args={[1.8, t.h, 2.6]} />
            </mesh>
          ))}
          <mesh material={mats.tower} position={[0, t.h - 3, 0]}>
            <boxGeometry args={[11, 1.6, 2.2]} />
          </mesh>
        </group>
      ))}
      {cables.map((c, i) => {
        const mid = c.a.clone().add(c.b).multiplyScalar(0.5)
        const len = c.a.distanceTo(c.b)
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.b.clone().sub(c.a).normalize())
        return (
          <mesh key={i} material={mats.cable} position={mid} quaternion={q}>
            <cylinderGeometry args={[0.18, 0.18, len, 4]} />
          </mesh>
        )
      })}
    </group>
  )
}

export function Bridges() {
  return (
    <group>
      {GEO.bridges.map((b) => (
        <Bridge key={b.n} b={b} />
      ))}
    </group>
  )
}

// ───────── RMS Queen Mary (Pier H)

export function QueenMary() {
  const select = useUI((s) => s.select)
  const qm = PORT.QUEEN_MARY
  const m = useMemo(
    () => ({ hull: std({ color: '#15171d', roughness: 0.6 }), red: std({ color: '#b5302a' }), white: std({ color: '#f5f3ec' }), funnel: std({ color: '#d4482c' }), black: std({ color: '#1b1b1f' }), deck: std({ color: '#b08d64' }) }),
    [],
  )
  if (!qm) return null
  const L = qm.length
  // OpenStreetMap draws the coastline round the outside of her protected basin, so open a patch of water under her
  return (
    <group position={[qm.x, LAND_Y - 0.4, qm.z]} rotation={[0, qm.heading, 0]} {...clickable(() => select({ type: 'place', id: 'queen-mary' }))}>
      <mesh position={[0, 0.43, 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[34, L + 26]} />
        <meshStandardMaterial color="#2c73c2" roughness={0.25} metalness={0.05} />
      </mesh>
      <mesh material={m.red} position={[0, -0.6, 0]}>
        <boxGeometry args={[17.6, 2.4, L - 6]} />
      </mesh>
      <mesh material={m.hull} position={[0, 3.6, 0]} castShadow>
        <boxGeometry args={[18, 6.6, L]} />
      </mesh>
      {/* tapered bow */}
      <mesh material={m.hull} position={[0, 3.6, L / 2 + 4]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <boxGeometry args={[12.7, 6.6, 12.7]} />
      </mesh>
      <mesh material={m.deck} position={[0, 7, 0]} receiveShadow>
        <boxGeometry args={[17.4, 0.3, L - 4]} />
      </mesh>
      {[
        [0, 9, 0, 15, 4, L * 0.62],
        [0, 12.6, -2, 12, 3.2, L * 0.45],
        [0, 15.4, 8, 9, 2.4, L * 0.16],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} material={m.white} position={[x, y, z]} castShadow>
          <boxGeometry args={[w, h, d]} />
        </mesh>
      ))}
      {[22, 2, -18].map((z) => (
        <group key={z} position={[0, 14, z]}>
          <mesh material={m.funnel} position={[0, 5, 0]} castShadow>
            <cylinderGeometry args={[2.6, 3, 10, 14]} />
          </mesh>
          <mesh material={m.black} position={[0, 10.6, 0]}>
            <cylinderGeometry args={[2.62, 2.62, 1.4, 14]} />
          </mesh>
        </group>
      ))}
      {[L * 0.36, -L * 0.36].map((z) => (
        <mesh key={z} material={m.black} position={[0, 16, z]}>
          <cylinderGeometry args={[0.25, 0.35, 18, 6]} />
        </mesh>
      ))}
    </group>
  )
}

// ───────── Long Beach Cruise Terminal: the former Spruce Goose dome

export function CruiseDome() {
  const select = useUI((s) => s.select)
  const mats = useMemo(() => ({ dome: std({ color: '#f4f6fa', roughness: 0.35, metalness: 0.1 }), lines: new THREE.MeshBasicMaterial({ color: '#c3cad8', wireframe: true }) }), [])
  const p = PLACES.find((x) => x.id === 'cruise-dome')
  if (!p) return null
  return (
    <group position={[p.x, LAND_Y, p.z]} scale={[1, 0.62, 1]} {...clickable(() => select({ type: 'place', id: 'cruise-dome' }))}>
      <mesh material={mats.dome} castShadow receiveShadow>
        <sphereGeometry args={[32, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh material={mats.lines}>
        <icosahedronGeometry args={[32.15, 3]} />
      </mesh>
    </group>
  )
}

// ───────── THUMS islands: drilling towers dressed as resort architecture, with palms

export function ThumsIslands() {
  const select = useUI((s) => s.select)
  const islands = PLACES.filter((p) => p.id.startsWith('thums-'))
  const mats = useMemo(
    () => ({
      tower: ['#f2d5b0', '#c9e2e8', '#f4c7b8', '#e8e3c6'].map((c) => std({ color: c })),
      cap: std({ color: '#e0533d' }),
      wall: std({ color: '#e9e4d8' }),
      trunk: std({ color: '#8a6a4a' }),
      palm: std({ color: '#3f9d5a' }),
    }),
    [],
  )
  return (
    <group>
      {islands.map((p, n) => (
        <group key={p.id} position={[p.x, LAND_Y, p.z]} {...clickable(() => select({ type: 'place', id: p.id }))}>
          {[0, 1, 2, 3].map((k) => {
            const a = (k / 4) * Math.PI * 2 + n
            const h = 14 + hash(n * 10 + k) * 10
            return (
              <group key={k} position={[Math.cos(a) * 16, 0, Math.sin(a) * 12]}>
                <mesh material={mats.tower[(k + n) % 4]} position={[0, h / 2, 0]} castShadow>
                  <boxGeometry args={[6, h, 6]} />
                </mesh>
                <mesh material={mats.cap} position={[0, h + 1.4, 0]}>
                  <coneGeometry args={[4.6, 2.8, 4]} />
                </mesh>
              </group>
            )
          })}
          <mesh material={mats.wall} position={[0, 3, 0]}>
            <cylinderGeometry args={[30, 32, 6, 20, 1, true]} />
          </mesh>
          {Array.from({ length: 9 }, (_, k) => {
            const a = (k / 9) * Math.PI * 2
            return (
              <group key={`p${k}`} position={[Math.cos(a) * 34, 0, Math.sin(a) * 30]}>
                <mesh material={mats.trunk} position={[0, 4, 0]}>
                  <cylinderGeometry args={[0.25, 0.35, 8, 5]} />
                </mesh>
                <mesh material={mats.palm} position={[0, 8.4, 0]}>
                  <sphereGeometry args={[1.8, 8, 6]} />
                </mesh>
              </group>
            )
          })}
        </group>
      ))}
    </group>
  )
}
