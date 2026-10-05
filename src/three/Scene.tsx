import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import {
  sim, stepSim, initSim, shipById, containerById, craneById, rtgById, handlerById, slotWorld, yardLocal, craneTip, transferPos, toWorld, tamtWorld,
} from '../sim/sim'
import { buildPath } from '../sim/path'
import { GEO } from '../sim/geo'
import { STALLS } from '../sim/parking'
import { YACHTS } from '../sim/marina'
import { PLACES, LOGISTICS, MARINA_PLACES, placeById, STATUE_ID } from '../sim/places'
import type { Place } from '../sim/places'
import { LAND_Y, CRANE_Z, TAMT_FRAME, MIDWAY_POSE, berthById, outboundLane, outboundEntry, rowZ, FRONT_OFFSET } from '../sim/world'
import { useUI } from '../store'
import type { Selection, Tab } from '../store'
import { Water } from './Water'
import { World } from './World'
import { Terminal } from './Terminal'
import { Ships, TugModel } from './Ships'
import { MovingCars, Wakes } from './Equipment'
import { LIGHT } from './light'

initSim()

// ───────── camera views per tab

const n = { x: -TAMT_FRAME.uz, z: TAMT_FRAME.ux } // TAMT water normal
const u = { x: TAMT_FRAME.ux, z: TAMT_FRAME.uz }
function tabPose(t: Tab): [number, number, number, number, number, number] {
  switch (t) {
    case 'overview':
      return [100, 6200, 6300, -500, 0, 700]
    case 'vessels':
      return [-170, 340, -160, -530, 0, -610]
    case 'yard': {
      const c = tamtWorld(10, -45)
      return [c.x + n.x * 200 + u.x * 120, 210, c.z + n.z * 200 + u.z * 120, c.x, 0, c.z]
    }
    case 'shipments': {
      const c = tamtWorld(-20, 8)
      return [c.x + n.x * 230 - u.x * 90, 170, c.z + n.z * 230 - u.z * 90, c.x, 0, c.z]
    }
    case 'logistics':
      return [1650, 900, 1500, 900, 0, 650]
  }
}

function SimDriver() {
  const bump = useUI((s) => s.bump)
  const acc = useRef(0)
  useFrame((_, dt) => {
    stepSim(dt)
    acc.current += dt
    if (acc.current > 0.25) {
      acc.current = 0
      bump()
    }
  })
  return null
}

// ───────── where is the selection? (world frame)

interface Pose {
  x: number
  y: number
  z: number
  rot: number
  size: [number, number, number]
  label: string
}

const fromTamt = (lx: number, y: number, lz: number, rot: number) => {
  const w = tamtWorld(lx, lz)
  return { x: w.x, y, z: w.z, rot: rot + TAMT_FRAME.rot }
}

function selectionPose(sel: Selection): Pose | null {
  if (!sel) return null
  switch (sel.type) {
    case 'ship': {
      const s = shipById(sel.id)
      if (!s) return null
      const h = s.kind === 'cruise' || s.kind === 'carrier' || s.kind === 'amphib' ? 26 : s.kind === 'carcarrier' ? 20 : 17
      return { x: s.pos.x, y: h / 2 - 1, z: s.pos.z, rot: s.heading, size: [s.cls.beam + 3, h, s.cls.length + 6], label: s.name }
    }
    case 'container': {
      const c = containerById(sel.id)
      if (!c) return null
      const size: [number, number, number] = [1.7, 1.75, 6.5]
      const loc = c.loc
      if (loc.kind === 'ship') {
        const s = shipById(loc.shipId)
        if (!s) return null
        const p = slotWorld(s, loc.slot)
        return { x: p.x, y: p.y, z: p.z, rot: s.heading, size, label: c.id }
      }
      if (loc.kind === 'yard') {
        const p = yardLocal(loc.slot)
        return { ...fromTamt(p.x, p.y, p.z, Math.PI / 2), size, label: c.id }
      }
      if (loc.kind === 'crane') {
        const cr = craneById(loc.id)!
        const t = craneTip(cr)
        return { ...fromTamt(t.x, cr.hookY, t.z, Math.PI / 2), size, label: c.id }
      }
      if (loc.kind === 'handler') {
        const h = handlerById(loc.id)!
        const w = toWorld(h, 0, 3.4)
        return { ...fromTamt(w.x, h.lift, w.z, h.heading + Math.PI / 2), size, label: c.id }
      }
      if (loc.kind === 'rtg') {
        const g = rtgById(loc.id)!
        return { ...fromTamt(g.x, g.hookY, g.trolleyZ, Math.PI / 2), size, label: c.id }
      }
      if (loc.kind === 'transfer') {
        const p = transferPos(craneById(loc.craneId)!, loc.idx)
        return { ...fromTamt(p.x, p.y, p.z, Math.PI / 2), size, label: c.id }
      }
      return null
    }
    case 'crane': {
      const c = craneById(sel.id)
      return c ? { ...fromTamt(c.x, LAND_Y + 11, CRANE_Z, 0), size: [16, 24, 15], label: c.id } : null
    }
    case 'rtg': {
      const g = rtgById(sel.id)
      if (!g) return null
      const z0 = rowZ(2) - FRONT_OFFSET - 5
      const z1 = rowZ(1) + FRONT_OFFSET + 1
      return { ...fromTamt(g.x, LAND_Y + 5.5, (z0 + z1) / 2, 0), size: [9, 11.5, z1 - z0 + 2], label: g.id }
    }
    case 'handler': {
      const h = handlerById(sel.id)
      return h ? { ...fromTamt(h.pos.x, LAND_Y + 5, h.pos.z, h.heading), size: [4, 10.5, 9], label: h.id } : null
    }
    case 'tug': {
      const t = sim.tugs.find((x) => x.id === sel.id)
      return t ? { x: t.pos.x, y: 3, z: t.pos.z, rot: t.heading, size: [5.5, 7, 12], label: t.name } : null
    }
    case 'building': {
      const b = GEO.buildings[Number(sel.id)]
      if (!b) return null
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
      const h = Math.max(1.5, b.h)
      return { x: (x0 + x1) / 2, y: LAND_Y + h / 2, z: (z0 + z1) / 2, rot: 0, size: [x1 - x0 + 1, h + 1, z1 - z0 + 1], label: b.n ?? 'Building' }
    }
    case 'car': {
      const s = STALLS[Number(sel.id)]
      return s ? { x: s.x, y: LAND_Y + 0.8, z: s.z, rot: s.rot, size: [1.6, 1.7, 2.9], label: 'Parked car' } : null
    }
    case 'yacht': {
      const y = YACHTS[Number(sel.id)]
      return y ? { x: y.x, y: 1.4, z: y.z, rot: y.heading, size: [y.beam + 1, y.kind === 'super' ? 6 : 3.2, y.length + 1], label: 'Yacht' } : null
    }
    case 'place': {
      if (sel.id === 'midway') return { x: MIDWAY_POSE.x, y: 8, z: MIDWAY_POSE.z, rot: MIDWAY_POSE.heading, size: [32, 18, 160], label: 'USS Midway Museum' }
      const p = placeById(sel.id)
      if (!p) return null
      if (sel.id === STATUE_ID) return { x: p.x, y: LAND_Y + 4, z: p.z, rot: 0, size: [6, 8.5, 6], label: p.name }
      return { x: p.x, y: LAND_Y + 5, z: p.z, rot: 0, size: [12, 10, 12], label: p.name }
    }
  }
}

function CameraRig({ light }: { light: React.RefObject<THREE.DirectionalLight | null> }) {
  const ref = useRef<CameraControls>(null)
  const camCmd = useUI((s) => s.camCmd)
  const tmp = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.setLookAt(...tabPose('overview'), false)
    const stop = () => useUI.getState().setFollow(false)
    c.addEventListener('controlstart', stop)
    return () => c.removeEventListener('controlstart', stop)
  }, [])

  useEffect(() => {
    const c = ref.current
    if (!c || !camCmd) return
    const { cmd } = camCmd
    if (cmd.kind === 'tab') c.setLookAt(...tabPose(cmd.tab), true)
    else if (cmd.kind === 'zoom') c.dolly(cmd.dir * c.distance * 0.28, true)
    else if (cmd.kind === 'rotate') c.rotate((cmd.dir * Math.PI) / 6, 0, true)
    else if (cmd.kind === 'focus') {
      c.moveTo(cmd.x, 0, cmd.z, true)
      if (cmd.dist) c.dollyTo(cmd.dist, true)
    }
  }, [camCmd])

  useFrame(() => {
    const c = ref.current
    if (!c) return
    const { follow, selected } = useUI.getState()
    if (follow) {
      const p = selectionPose(selected)
      if (p) c.moveTo(p.x, 0, p.z, true)
    }
    const l = light.current
    if (l) {
      c.getTarget(tmp)
      l.position.set(tmp.x - 260, 420, tmp.z - 120)
      l.target.position.copy(tmp)
      l.target.updateMatrixWorld()
      const d = Math.min(700, Math.max(140, c.distance * 0.55))
      const cam = l.shadow.camera
      if (Math.abs(cam.right - d) > 2) {
        cam.left = -d
        cam.right = d
        cam.top = d
        cam.bottom = -d
        cam.updateProjectionMatrix()
      }
    }
  })

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={20}
      maxDistance={11000}
      minPolarAngle={0.12}
      maxPolarAngle={1.25}
      dollyToCursor
      smoothTime={0.55}
      draggingSmoothTime={0.12}
      mouseButtons={{ left: 4, middle: 16, right: 1, wheel: 16 }}
      touches={{ one: 256, two: 4096, three: 64 }}
    />
  )
}

function Brackets({ size }: { size: readonly number[] }) {
  const pts = useMemo(() => {
    const [w, h, d] = size.map((v) => v / 2)
    const k = Math.min(w, h, d) * 0.6
    const out: [number, number, number][] = []
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          const c: [number, number, number] = [sx * w, sy * h, sz * d]
          out.push(c, [c[0] - sx * k, c[1], c[2]], c, [c[0], c[1] - sy * k, c[2]], c, [c[0], c[1], c[2] - sz * k])
        }
    return out
  }, [size])
  return <Line points={pts} segments color="#2f6bed" lineWidth={2.4} />
}

function SelectionMarker() {
  const sel = useUI((s) => s.selected)
  useUI((s) => s.tick)
  const g = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const p = selectionPose(sel)
    if (!g.current || !p) return
    g.current.position.set(p.x, p.y, p.z)
    g.current.rotation.y = p.rot
    if (ring.current) {
      const k = 1 + ((clock.elapsedTime * 0.7) % 1) * 0.35
      ring.current.scale.set(k, k, k)
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - ((clock.elapsedTime * 0.7) % 1))
      const onWater = sel?.type === 'ship' || sel?.type === 'tug' || sel?.type === 'yacht'
      ring.current.position.y = -p.y + (onWater ? 0.25 : LAND_Y + 0.08)
    }
  })
  const pose = selectionPose(sel)
  if (!pose) return null
  const r = Math.max(pose.size[0], pose.size[2]) * 0.6
  return (
    <group ref={g}>
      <Brackets size={pose.size} />
      <mesh>
        <boxGeometry args={pose.size} />
        <meshBasicMaterial color="#2f6bed" transparent opacity={0.07} depthWrite={false} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.94, r, 64]} />
        <meshBasicMaterial color="#2f6bed" transparent opacity={0.45} depthWrite={false} />
      </mesh>
      {sel?.type !== 'ship' && sel?.type !== 'place' && (
        <Html position={[0, pose.size[1] / 2 + 1.2, 0]} center zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
          <div className="tag tag-selected">{pose.label}</div>
        </Html>
      )}
    </group>
  )
}

// ───────── planned tracks for the selected ship

const sample = (pts: { x: number; z: number }[], step: number): [number, number, number][] =>
  pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p) => [p.x, 0.7, p.z])

function RouteLines() {
  const sel = useUI((s) => s.selected)
  const show = useUI((s) => s.showRoutes)
  useUI((s) => s.tick)
  const shipId = sel?.type === 'ship' ? sel.id : null
  const ship = shipById(shipId ?? undefined)
  const planned = useMemo(() => {
    if (!ship || ship.static) return null
    const b = berthById(ship.berthId)
    const pose = b.pose(ship.cls.beam, ship.cls.length)
    const dep = b.departure(ship.cls.beam, ship.cls.length)
    const end = dep[dep.length - 1] ?? pose
    const entry = outboundEntry(end.x, end.z, b.junction)
    const depPath = buildPath(pose, [...dep, ...outboundLane(entry, 1)])
    const arrival = buildPath(b.arrival(ship.cls.beam, ship.cls.length)[0] ?? pose, b.arrival(ship.cls.beam, ship.cls.length))
    return { dep: sample(depPath, 10), arrival: sample(arrival, 6) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipId, ship?.state])
  if (!show || !ship || !planned) return null
  const inbound = ['inbound', 'waiting', 'approach', 'berthing', 'anchored'].includes(ship.state)
  const outbound = ship.state === 'unberthing' || ship.state === 'outbound'
  const remaining = ship.path.length > 1 ? sample([ship.pos, ...ship.path], 8) : null
  return (
    <group>
      {remaining && inbound && <Line points={remaining} color="#2f6bed" lineWidth={3} dashed dashSize={8} gapSize={5} />}
      {inbound && ship.state !== 'approach' && ship.state !== 'berthing' && <Line points={planned.arrival} color="#2f6bed" lineWidth={2} dashed dashSize={6} gapSize={6} transparent opacity={0.6} />}
      {remaining && outbound && <Line points={remaining} color="#f08a0b" lineWidth={3} dashed dashSize={8} gapSize={5} />}
      {!outbound && <Line points={planned.dep} color="#f08a0b" lineWidth={2} dashed dashSize={6} gapSize={8} transparent opacity={0.7} />}
    </group>
  )
}

// ───────── map pins for landmarks and logistics sites

const PIN_TONE: Record<Place['kind'], string> = {
  museum: '#2f6bed',
  landmark: '#e0533d',
  park: '#2fb36b',
  terminal: '#1e3a8a',
  navy: '#5a6788',
  industry: '#f08a0b',
  leisure: '#13a39a',
  transport: '#8b5cf6',
  logistics: '#f08a0b',
}

function Pins() {
  const tab = useUI((s) => s.tab)
  const show = useUI((s) => s.showLabels)
  const select = useUI((s) => s.select)
  const sel = useUI((s) => s.selected)
  if (!show) return null
  const list = tab === 'logistics' ? [...LOGISTICS, ...PLACES.filter((p) => p.kind === 'industry' || p.kind === 'terminal')] : [...PLACES, ...MARINA_PLACES]
  return (
    <>
      {list
        .filter((p) => p.pin)
        .map((p) => (
          <Html key={p.id} position={[p.x, LAND_Y + (p.kind === 'navy' ? 30 : 16), p.z]} center zIndexRange={[9, 0]}>
            <button className={`pin ${p.id.startsWith('marina-') ? 'pin-marina' : ''} ${sel?.type === 'place' && sel.id === p.id ? 'on' : ''}`} onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                // keep the canvas from reading this as a click on empty water
                e.stopPropagation()
                select({ type: 'place', id: p.id })
              }}>
              <span className="pin-dot" style={{ background: PIN_TONE[p.kind] }} />
              {p.id.startsWith('marina-') && <span className="pin-badge">⚓ Marina</span>}
              {p.name}
            </button>
          </Html>
        ))}
    </>
  )
}

function Tugs() {
  useUI((s) => s.tick)
  return (
    <>
      {sim.tugs.map((t) => (
        <TugModel key={t.id} tug={t} />
      ))}
    </>
  )
}

// ───────── day / night

const DAY = { bg: new THREE.Color('#e3edf7'), fog: new THREE.Color('#dce8f4'), hemi: 1.1, sun: 2.7, amb: 0.25 }
const NIGHT = { bg: new THREE.Color('#0b1222'), fog: new THREE.Color('#0d1528'), hemi: 0.28, sun: 0.35, amb: 0.1 }

function Lights() {
  const light = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const amb = useRef<THREE.AmbientLight>(null)
  const { scene } = useThree()
  const night = useUI((s) => s.night)
  useEffect(() => {
    scene.background = DAY.bg.clone()
    scene.fog = new THREE.Fog(DAY.fog.clone(), 14000, 42000)
  }, [scene])
  useFrame((_, dt) => {
    const t = LIGHT.night.value + ((night ? 1 : 0) - LIGHT.night.value) * Math.min(1, dt * 2)
    LIGHT.night.value = t
    ;(scene.background as THREE.Color).copy(DAY.bg).lerp(NIGHT.bg, t)
    ;(scene.fog as THREE.Fog).color.copy(DAY.fog).lerp(NIGHT.fog, t)
    if (hemi.current) hemi.current.intensity = DAY.hemi + (NIGHT.hemi - DAY.hemi) * t
    if (amb.current) amb.current.intensity = DAY.amb + (NIGHT.amb - DAY.amb) * t
    if (light.current) {
      light.current.intensity = DAY.sun + (NIGHT.sun - DAY.sun) * t
      light.current.color.set(t > 0.5 ? '#b8c8ff' : '#fff8ec')
    }
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#ffffff', '#cfdcec', DAY.hemi]} />
      <ambientLight ref={amb} intensity={DAY.amb} />
      <directionalLight
        ref={light}
        intensity={DAY.sun}
        color="#fff8ec"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.08}
        shadow-camera-near={10}
        shadow-camera-far={1600}
      />
      <CameraRig light={light} />
    </>
  )
}

export default function Scene() {
  const select = useUI((s) => s.select)
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 30, near: 2, far: 60000, position: [1000, 3000, 3000] }} onPointerMissed={() => select(null)} gl={{ antialias: true, logarithmicDepthBuffer: true }}>
      <SimDriver />
      <Lights />
      <Water />
      <World />
      <Terminal />
      <Ships />
      <Tugs />
      <MovingCars />
      <Wakes />
      <RouteLines />
      <SelectionMarker />
      <Pins />
    </Canvas>
  )
}
