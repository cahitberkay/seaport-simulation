import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import {
  sim, stepSim, initSim, shipById, containerById, craneById, handlerById, slotWorld, yardWorld, craneTip, transferPos, toWorld,
} from '../sim/sim'
import { buildPath } from '../sim/path'
import { TERMINALS, LAND_Y, CRANE_Z, berthById, departureRoute, berthZ } from '../sim/world'
import { useUI } from '../store'
import type { Selection, View } from '../store'
import { Water } from './Water'
import { Land } from './Land'
import { Ships, TugModel } from './Ships'
import { CraneModel, HandlerModel, LooseContainers, YardContainers, CarLot, MovingCars, Laydown, Traffic, Wakes } from './Equipment'

initSim()

function viewPose(v: View): [number, number, number, number, number, number] {
  if (v === 'BAY') return [700, 1500, 2300, -500, 0, 150]
  const t = TERMINALS.find((x) => x.id === v)!
  const [fx, fz] = t.focus
  const [ox, oy, oz] = t.offset
  return [fx + ox, oy, fz + oz, fx, 0, fz]
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

interface Pose {
  x: number
  y: number
  z: number
  rot: number
  size: [number, number, number]
  label: string
}

function selectionPose(sel: Selection): Pose | null {
  if (!sel) return null
  if (sel.type === 'ship') {
    const s = shipById(sel.id)
    if (!s) return null
    const h = s.kind === 'cruise' ? 26 : s.kind === 'carcarrier' ? 20 : 17
    return { x: s.pos.x, y: h / 2 - 1, z: s.pos.z, rot: s.heading, size: [s.cls.beam + 3, h, s.cls.length + 6], label: s.name }
  }
  if (sel.type === 'container') {
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
      const p = yardWorld(loc.slot)
      return { x: p.x, y: p.y, z: p.z, rot: Math.PI / 2, size, label: c.id }
    }
    if (loc.kind === 'crane') {
      const cr = craneById(loc.id)!
      const t = craneTip(cr)
      return { x: t.x, y: cr.hookY, z: t.z, rot: Math.PI / 2, size, label: c.id }
    }
    if (loc.kind === 'handler') {
      const h = handlerById(loc.id)!
      const w = toWorld(h, 0, 3.4)
      return { x: w.x, y: h.lift, z: w.z, rot: h.heading + Math.PI / 2, size, label: c.id }
    }
    if (loc.kind === 'transfer') {
      const p = transferPos(craneById(loc.craneId)!, loc.idx)
      return { x: p.x, y: p.y, z: p.z, rot: Math.PI / 2, size, label: c.id }
    }
    return null
  }
  if (sel.type === 'crane') {
    const c = craneById(sel.id)
    return c ? { x: c.x, y: LAND_Y + 11, z: CRANE_Z, rot: 0, size: [16, 24, 15], label: c.id } : null
  }
  if (sel.type === 'handler') {
    const h = handlerById(sel.id)
    return h ? { x: h.pos.x, y: LAND_Y + 5, z: h.pos.z, rot: h.heading, size: [4, 10.5, 9], label: h.id } : null
  }
  const t = sim.tugs.find((x) => x.id === sel.id)
  return t ? { x: t.pos.x, y: 3, z: t.pos.z, rot: t.heading, size: [5.5, 7, 12], label: t.name } : null
}

function CameraRig({ light }: { light: React.RefObject<THREE.DirectionalLight | null> }) {
  const ref = useRef<CameraControls>(null)
  const camCmd = useUI((s) => s.camCmd)
  const tmp = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.setLookAt(...viewPose('TAMT'), false)
    const stop = () => useUI.getState().setFollow(false)
    c.addEventListener('controlstart', stop)
    return () => c.removeEventListener('controlstart', stop)
  }, [])

  useEffect(() => {
    const c = ref.current
    if (!c || !camCmd) return
    const { cmd } = camCmd
    if (cmd.kind === 'view') c.setLookAt(...viewPose(cmd.view), true)
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
      l.position.set(tmp.x - 160, 260, tmp.z - 60)
      l.target.position.copy(tmp)
      l.target.updateMatrixWorld()
      const d = Math.min(420, Math.max(110, c.distance * 0.7))
      const cam = l.shadow.camera
      if (Math.abs(cam.right - d) > 1) {
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
      minDistance={25}
      maxDistance={3600}
      minPolarAngle={0.2}
      maxPolarAngle={1.2}
      dollyToCursor
      smoothTime={0.5}
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
      ring.current.position.y = -p.y + (sel?.type === 'ship' || sel?.type === 'tug' ? 0.25 : LAND_Y + 0.08)
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
      {sel?.type !== 'ship' && (
        <Html position={[0, pose.size[1] / 2 + 1.2, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="tag tag-selected">{pose.label}</div>
        </Html>
      )}
    </group>
  )
}

const sample = (pts: { x: number; z: number }[], step: number): [number, number, number][] =>
  pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p) => [p.x, 0.6, p.z])

function RouteLines() {
  const sel = useUI((s) => s.selected)
  const show = useUI((s) => s.showRoutes)
  useUI((s) => s.tick)
  if (!show || sel?.type !== 'ship') return null
  const s = shipById(sel.id)
  if (!s) return null
  const b = berthById(s.berthId)
  const inbound = s.state === 'inbound' || s.state === 'berthing'
  const outbound = s.state === 'unberthing' || s.state === 'outbound'
  const remaining = s.path.length > 1 ? sample([s.pos, ...s.path], 6) : null
  const dep = !outbound ? sample(buildPath({ x: b.x, z: berthZ(s.cls.beam) }, departureRoute(b, s.cls.beam)), 8) : null
  return (
    <group>
      {remaining && (inbound || s.state === 'anchored') && <Line points={remaining} color="#2f6bed" lineWidth={3} dashed dashSize={6} gapSize={4} />}
      {remaining && outbound && <Line points={remaining} color="#f08a0b" lineWidth={3} dashed dashSize={6} gapSize={4} />}
      {dep && <Line points={dep} color="#f08a0b" lineWidth={2} dashed dashSize={5} gapSize={6} transparent opacity={0.7} />}
    </group>
  )
}

function Entities() {
  useUI((s) => s.tick)
  return (
    <>
      <Ships />
      {sim.tugs.map((t) => (
        <TugModel key={t.id} tug={t} />
      ))}
      {sim.cranes.map((c) => (
        <CraneModel key={c.id} crane={c} />
      ))}
      {sim.handlers.map((h) => (
        <HandlerModel key={h.id} h={h} />
      ))}
      <LooseContainers />
    </>
  )
}

function Lights() {
  const light = useRef<THREE.DirectionalLight>(null)
  return (
    <>
      <hemisphereLight args={['#ffffff', '#cfdcec', 1.1]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        ref={light}
        intensity={2.7}
        color="#fff8ec"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.08}
        shadow-camera-near={10}
        shadow-camera-far={900}
      />
      <CameraRig light={light} />
    </>
  )
}

function Background() {
  const { scene } = useThree()
  useEffect(() => {
    scene.background = new THREE.Color('#e3edf7')
    scene.fog = new THREE.Fog('#dce8f4', 1800, 6500)
  }, [scene])
  return null
}

export default function Scene() {
  const select = useUI((s) => s.select)
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 30, near: 2, far: 12000, position: [300, 300, 300] }} onPointerMissed={() => select(null)} gl={{ antialias: true }}>
      <Background />
      <SimDriver />
      <Lights />
      <Water />
      <Land />
      <YardContainers />
      <CarLot />
      <MovingCars />
      <Laydown />
      <Traffic />
      <Entities />
      <Wakes />
      <RouteLines />
      <SelectionMarker />
    </Canvas>
  )
}
