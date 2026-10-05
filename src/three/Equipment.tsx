import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { sim, craneTip, transferPos, yardLocal, containerById, handlerById, craneById, rtgById, toWorld, BOOM, RTG_SAFE } from '../sim/sim'
import type { Crane, Handler, Container, Rtg } from '../sim/sim'
import { LAND_Y, CRANE_Z, CONTAINER, rowZ, FRONT_OFFSET } from '../sim/world'
import { useUI } from '../store'
import { containerMat } from './Ships'
import { foamDot } from './textures'

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.6, ...p })
const MAT = {
  blue: std({ color: '#2f6bed', roughness: 0.5 }),
  white: std({ color: '#f6f7fb' }),
  dark: std({ color: '#2d3343' }),
  steel: std({ color: '#8b93a7', metalness: 0.35, roughness: 0.45 }),
  glass: std({ color: '#26386a', roughness: 0.25, metalness: 0.3 }),
  yellow: std({ color: '#f6b40e' }),
  tire: std({ color: '#262a36', roughness: 0.9 }),
  rope: new THREE.MeshBasicMaterial({ color: '#3a4256' }),
  blade: std({ color: '#f4f6fa', roughness: 0.45 }),
  support: std({ color: '#c9a272' }),
}

const PIVOT = LAND_Y + 16.5
export const yardGeo = new THREE.BoxGeometry(CONTAINER.len, CONTAINER.hgt, CONTAINER.wid)

const hover = {
  onPointerOver: (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    document.body.style.cursor = 'pointer'
  },
  onPointerOut: () => (document.body.style.cursor = ''),
}

// everything in this file except MovingCars and Wakes lives in the main terminal's local frame

export function CraneModel({ crane }: { crane: Crane }) {
  const base = useRef<THREE.Group>(null)
  const upper = useRef<THREE.Group>(null)
  const boom = useRef<THREE.Group>(null)
  const rope = useRef<THREE.Mesh>(null)
  const spreader = useRef<THREE.Group>(null)
  const select = useUI((s) => s.select)
  useFrame(() => {
    if (!base.current || !upper.current || !boom.current || !rope.current || !spreader.current) return
    base.current.position.set(crane.x, LAND_Y, CRANE_Z)
    upper.current.rotation.y = crane.slew
    const elev = Math.acos(Math.min(BOOM - 0.01, crane.radius) / BOOM)
    boom.current.rotation.x = -elev
    const tip = craneTip(crane)
    const tipY = PIVOT + Math.sin(elev) * BOOM
    const top = crane.hookY + 0.95
    const len = Math.max(0.1, tipY - top)
    rope.current.position.set(tip.x, top + len / 2, tip.z)
    rope.current.scale.set(1, len, 1)
    spreader.current.position.set(tip.x, crane.hookY + 0.85, tip.z)
  })
  return (
    <group>
      <group
        ref={base}
        onClick={(e) => {
          e.stopPropagation()
          select({ type: 'crane', id: crane.id })
        }}
        {...hover}
      >
        <RoundedBox args={[10, 2.4, 7]} radius={0.3} smoothness={2} position={[0, 1.9, 0]} material={MAT.white} castShadow />
        <mesh material={MAT.blue} position={[0, 1.2, 3.52]}>
          <boxGeometry args={[10, 0.5, 0.05]} />
        </mesh>
        {[-3.6, -1.2, 1.2, 3.6].map((x) =>
          [-2.6, 2.6].map((z) => (
            <mesh key={`${x}${z}`} material={MAT.tire} position={[x, 0.55, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.55, 0.55, 0.7, 12]} />
            </mesh>
          )),
        )}
        {[
          [-1, -1], [1, -1], [-1, 1], [1, 1],
        ].map(([sx, sz], i) => (
          <group key={i}>
            <mesh material={MAT.blue} position={[sx * 6, 1.4, sz * 5]} rotation={[0, Math.atan2(sx, sz * 0.9), 0]} castShadow>
              <boxGeometry args={[0.7, 0.6, 5]} />
            </mesh>
            <mesh material={MAT.dark} position={[sx * 7.4, 0.2, sz * 6.2]}>
              <boxGeometry args={[2, 0.4, 2]} />
            </mesh>
          </group>
        ))}
        <mesh material={MAT.blue} position={[0, 9, 0]} castShadow>
          <boxGeometry args={[2.6, 13.5, 2.6]} />
        </mesh>
        <group ref={upper}>
          <mesh material={MAT.white} position={[0, PIVOT - LAND_Y + 1.2, -2.6]} castShadow>
            <boxGeometry args={[4.6, 3.6, 7]} />
          </mesh>
          <mesh material={MAT.dark} position={[0, PIVOT - LAND_Y + 0.6, -6.6]} castShadow>
            <boxGeometry args={[4.2, 2.4, 1.6]} />
          </mesh>
          <mesh material={MAT.glass} position={[2.6, PIVOT - LAND_Y - 0.2, 1.4]} castShadow>
            <boxGeometry args={[1.6, 2, 2]} />
          </mesh>
          <group ref={boom} position={[0, PIVOT - LAND_Y, 0]}>
            <mesh material={MAT.blue} position={[0, 0, BOOM / 2]} castShadow>
              <boxGeometry args={[1.5, 1.5, BOOM]} />
            </mesh>
            <mesh material={MAT.white} position={[0, 0.8, BOOM / 2]}>
              <boxGeometry args={[0.4, 0.2, BOOM * 0.92]} />
            </mesh>
            <mesh material={MAT.dark} position={[0, -0.4, BOOM]}>
              <cylinderGeometry args={[0.6, 0.6, 1.6, 10]} />
            </mesh>
          </group>
        </group>
      </group>
      <mesh ref={rope} material={MAT.rope}>
        <cylinderGeometry args={[0.07, 0.07, 1, 4]} />
      </mesh>
      <group ref={spreader}>
        <mesh material={MAT.yellow}>
          <boxGeometry args={[6.2, 0.4, 1.4]} />
        </mesh>
        <mesh material={MAT.dark} position={[0, 0.5, 0]}>
          <boxGeometry args={[1.2, 0.6, 0.8]} />
        </mesh>
      </group>
    </group>
  )
}

// ───────── ship-to-shore gantry crane: the portal rides the quay rails, the trolley runs out along the boom

const STS = { water: -2, land: -17, girder: LAND_Y + 28, back: -34, out: 40 }
const stsMat = {
  frame: std({ color: '#d9483b', roughness: 0.5 }),
  white: std({ color: '#f4f5f8' }),
  dark: std({ color: '#2d3343' }),
}

export function StsModel({ crane }: { crane: Crane }) {
  const portal = useRef<THREE.Group>(null)
  const trolley = useRef<THREE.Group>(null)
  const rope = useRef<THREE.Mesh>(null)
  const spreader = useRef<THREE.Group>(null)
  const select = useUI((s) => s.select)
  useFrame(() => {
    if (!portal.current || !trolley.current || !rope.current || !spreader.current) return
    const tip = craneTip(crane)
    portal.current.position.set(tip.x, 0, 0)
    trolley.current.position.set(0, STS.girder - 0.8, tip.z)
    const top = crane.hookY + 0.95
    const len = Math.max(0.1, STS.girder - 1.6 - top)
    rope.current.position.set(0, top + len / 2, tip.z)
    rope.current.scale.set(1, len, 1)
    spreader.current.position.set(0, crane.hookY + 0.85, tip.z)
  })
  const legH = STS.girder - LAND_Y
  const boomLen = STS.out - STS.back
  return (
    <group
      ref={portal}
      onClick={(e) => {
        e.stopPropagation()
        select({ type: 'crane', id: crane.id })
      }}
      {...hover}
    >
      {/* four legs on the two quay rails, with sill beams and bogies */}
      {[STS.water, STS.land].map((z) => (
        <group key={z}>
          {[-6.5, 6.5].map((x) => (
            <mesh key={x} material={stsMat.frame} position={[x, LAND_Y + legH / 2, z]} castShadow>
              <boxGeometry args={[1.1, legH, 1.1]} />
            </mesh>
          ))}
          <mesh material={stsMat.frame} position={[0, LAND_Y + 1.6, z]}>
            <boxGeometry args={[14, 0.9, 1]} />
          </mesh>
          {[-6.5, 6.5].map((x) => (
            <mesh key={`b${x}`} material={stsMat.dark} position={[x, LAND_Y + 0.5, z]}>
              <boxGeometry args={[3.2, 1, 1.6]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* portal beams across the rails */}
      {[-6.5, 6.5].map((x) => (
        <mesh key={x} material={stsMat.frame} position={[x, LAND_Y + legH * 0.55, (STS.water + STS.land) / 2]}>
          <boxGeometry args={[0.8, 0.8, STS.water - STS.land]} />
        </mesh>
      ))}
      {/* boom and girder, from backreach to outreach */}
      {[-2.2, 2.2].map((x) => (
        <mesh key={x} material={stsMat.frame} position={[x, STS.girder, (STS.back + STS.out) / 2]} castShadow>
          <boxGeometry args={[1, 1.6, boomLen]} />
        </mesh>
      ))}
      <mesh material={stsMat.frame} position={[0, STS.girder + 0.4, (STS.water + STS.land) / 2]}>
        <boxGeometry args={[14, 1.2, 2]} />
      </mesh>
      {/* A-frame apex with forestays */}
      {[-4, 4].map((x) => (
        <mesh key={x} material={stsMat.frame} position={[x * 0.6, STS.girder + 7, STS.land + 1]} rotation={[0, 0, (x > 0 ? -1 : 1) * 0.12]}>
          <boxGeometry args={[0.8, 14, 0.8]} />
        </mesh>
      ))}
      <mesh material={stsMat.dark} position={[0, STS.girder + 7.5, (STS.land + STS.out) / 2 + 3]} rotation={[Math.atan2(13, STS.out - STS.land), 0, 0]}>
        <boxGeometry args={[0.25, 0.25, Math.hypot(13, STS.out - STS.land) * 0.92]} />
      </mesh>
      <mesh material={stsMat.dark} position={[0, STS.girder + 7.5, (STS.land + STS.back) / 2 - 1]} rotation={[-Math.atan2(13, STS.land - STS.back), 0, 0]}>
        <boxGeometry args={[0.25, 0.25, Math.hypot(13, STS.land - STS.back) * 0.92]} />
      </mesh>
      {/* machinery house on the backreach */}
      <mesh material={stsMat.white} position={[0, STS.girder + 2.2, STS.back + 6]} castShadow>
        <boxGeometry args={[6.5, 3, 9]} />
      </mesh>
      <group ref={trolley}>
        <mesh material={stsMat.white}>
          <boxGeometry args={[5.2, 1.4, 3.4]} />
        </mesh>
        <mesh material={MAT.glass} position={[1.6, -1.6, 0]}>
          <boxGeometry args={[1.8, 1.6, 1.8]} />
        </mesh>
      </group>
      <mesh ref={rope} material={MAT.rope}>
        <cylinderGeometry args={[0.08, 0.08, 1, 4]} />
      </mesh>
      <group ref={spreader}>
        <mesh material={MAT.yellow}>
          <boxGeometry args={[6.2, 0.4, 1.4]} />
        </mesh>
        <mesh material={MAT.dark} position={[0, 0.5, 0]}>
          <boxGeometry args={[1.2, 0.6, 0.8]} />
        </mesh>
      </group>
    </group>
  )
}

// ───────── RTG (yard gantry crane): straddles rows 1–2, drives along the block, trolley across

const RTG_Z0 = rowZ(2) - FRONT_OFFSET - 3 * 1.36 - 1.1
const RTG_Z1 = rowZ(1) + FRONT_OFFSET + 0.9
const RTG_H = 9.5

export function RtgModel({ g }: { g: Rtg }) {
  const body = useRef<THREE.Group>(null)
  const trolley = useRef<THREE.Group>(null)
  const rope = useRef<THREE.Mesh>(null)
  const spreader = useRef<THREE.Group>(null)
  const select = useUI((s) => s.select)
  const span = RTG_Z1 - RTG_Z0
  useFrame(() => {
    if (!body.current || !trolley.current || !rope.current || !spreader.current) return
    body.current.position.set(g.x, LAND_Y, 0)
    trolley.current.position.set(0, RTG_H, g.trolleyZ)
    const top = g.hookY + 0.95
    const len = Math.max(0.1, LAND_Y + RTG_H - 0.6 - top)
    rope.current.position.set(0, top + len / 2 - LAND_Y, g.trolleyZ)
    rope.current.scale.set(1, len, 1)
    spreader.current.position.set(0, g.hookY + 0.85 - LAND_Y, g.trolleyZ)
  })
  return (
    <group
      ref={body}
      onClick={(e) => {
        e.stopPropagation()
        select({ type: 'rtg', id: g.id })
      }}
      {...hover}
    >
      {[RTG_Z0, RTG_Z1].map((z) => (
        <group key={z} position={[0, 0, z]}>
          {[-3.6, 3.6].map((x) => (
            <mesh key={x} material={MAT.yellow} position={[x, RTG_H / 2, 0]} castShadow>
              <boxGeometry args={[0.6, RTG_H, 0.6]} />
            </mesh>
          ))}
          <mesh material={MAT.yellow} position={[0, 1.1, 0]}>
            <boxGeometry args={[8, 0.6, 0.9]} />
          </mesh>
          {[-3.2, 3.2].map((x) => (
            <mesh key={x} material={MAT.tire} position={[x, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.5, 0.5, 0.5, 10]} />
            </mesh>
          ))}
        </group>
      ))}
      {[-3.6, 3.6].map((x) => (
        <mesh key={x} material={MAT.yellow} position={[x, RTG_H + 0.3, (RTG_Z0 + RTG_Z1) / 2]} castShadow>
          <boxGeometry args={[0.7, 0.9, span + 0.6]} />
        </mesh>
      ))}
      <group ref={trolley}>
        <mesh material={MAT.white} position={[0, 0.6, 0]} castShadow>
          <boxGeometry args={[8, 1.1, 2.4]} />
        </mesh>
        <mesh material={MAT.glass} position={[3.2, -0.6, 1]}>
          <boxGeometry args={[1.2, 1.2, 1.2]} />
        </mesh>
      </group>
      <mesh ref={rope} material={MAT.rope}>
        <cylinderGeometry args={[0.06, 0.06, 1, 4]} />
      </mesh>
      <group ref={spreader}>
        <mesh material={MAT.yellow}>
          <boxGeometry args={[6.2, 0.35, 1.3]} />
        </mesh>
      </group>
    </group>
  )
}
export { RTG_SAFE }

// ───────── container forklift (laden top-loader)

export function HandlerModel({ h }: { h: Handler }) {
  const g = useRef<THREE.Group>(null)
  const carriage = useRef<THREE.Group>(null)
  const select = useUI((s) => s.select)
  useFrame(() => {
    if (!g.current || !carriage.current) return
    g.current.position.set(h.pos.x, LAND_Y, h.pos.z)
    g.current.rotation.y = h.heading
    carriage.current.position.y = h.lift - LAND_Y
  })
  return (
    <group
      ref={g}
      onClick={(e) => {
        e.stopPropagation()
        select({ type: 'handler', id: h.id }, true)
      }}
      {...hover}
    >
      <RoundedBox args={[3, 1.5, 6.2]} radius={0.2} smoothness={2} position={[0, 1.6, -0.5]} material={MAT.yellow} castShadow />
      <mesh material={MAT.dark} position={[0, 1.8, -3.4]} castShadow>
        <boxGeometry args={[3, 1.9, 1.2]} />
      </mesh>
      <RoundedBox args={[1.6, 2, 2]} radius={0.15} smoothness={2} position={[-0.6, 3.4, -1.2]} material={MAT.yellow} castShadow />
      <mesh material={MAT.glass} position={[-0.6, 3.6, -0.18]}>
        <boxGeometry args={[1.4, 1.2, 0.08]} />
      </mesh>
      {[
        [-1.55, 1.4], [1.55, 1.4], [-1.55, -2.4], [1.55, -2.4],
      ].map(([x, z], i) => (
        <mesh key={i} material={MAT.tire} position={[x, 0.9, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.9, 0.9, 0.7, 14]} />
        </mesh>
      ))}
      {[-1.15, 1.15].map((x) => (
        <mesh key={x} material={MAT.steel} position={[x, 5, 2.5]} castShadow>
          <boxGeometry args={[0.35, 9.5, 0.45]} />
        </mesh>
      ))}
      <mesh material={MAT.steel} position={[0, 9.6, 2.5]}>
        <boxGeometry args={[2.7, 0.35, 0.45]} />
      </mesh>
      <group ref={carriage}>
        <mesh material={MAT.yellow} position={[0, 0.85, 3.4]}>
          <boxGeometry args={[6.2, 0.4, 0.7]} />
        </mesh>
        {[-1.15, 1.15].map((x) => (
          <mesh key={x} material={MAT.yellow} position={[x, 0.85, 2.95]}>
            <boxGeometry args={[0.4, 0.4, 0.9]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// ───────── containers in motion or parked on the apron

const colorMats = new Map<string, THREE.MeshStandardMaterial>()
export const boxMat = (c: string) => {
  if (!colorMats.has(c)) {
    const m = containerMat.clone()
    m.color.set(c)
    colorMats.set(c, m)
  }
  return colorMats.get(c)!
}

function LooseContainer({ c }: { c: Container }) {
  const ref = useRef<THREE.Mesh>(null)
  const select = useUI((s) => s.select)
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const loc = c.loc
    if (loc.kind === 'crane') {
      const cr = craneById(loc.id)!
      const tip = craneTip(cr)
      m.position.set(tip.x, cr.hookY, tip.z)
      m.rotation.set(0, 0, 0)
    } else if (loc.kind === 'handler') {
      const h = handlerById(loc.id)!
      const w = toWorld(h, 0, 3.4)
      m.position.set(w.x, h.lift, w.z)
      m.rotation.set(0, h.heading, 0)
    } else if (loc.kind === 'rtg') {
      const g = rtgById(loc.id)!
      m.position.set(g.x, g.hookY, g.trolleyZ)
      m.rotation.set(0, 0, 0)
    } else if (loc.kind === 'transfer') {
      const p = transferPos(craneById(loc.craneId)!, loc.idx)
      m.position.set(p.x, p.y, p.z)
      m.rotation.set(0, 0, 0)
    }
  })
  return (
    <mesh
      ref={ref}
      geometry={yardGeo}
      material={boxMat(c.line.color)}
      castShadow
      onClick={(e) => {
        e.stopPropagation()
        select({ type: 'container', id: c.id })
      }}
      {...hover}
    />
  )
}

export function LooseContainers() {
  useUI((s) => s.tick)
  const ids = new Set<string>()
  for (const c of sim.cranes) {
    if (c.carrying) ids.add(c.carrying)
    for (const t of c.transfer) if (t.cid) ids.add(t.cid)
  }
  for (const h of sim.handlers) if (h.carrying) ids.add(h.carrying)
  for (const g of sim.rtgs) if (g.carrying) ids.add(g.carrying)
  return (
    <>
      {[...ids].map((id) => {
        const c = containerById(id)
        return c ? <LooseContainer key={id} c={c} /> : null
      })}
    </>
  )
}

export function YardContainers() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const ver = useRef(-1)
  const select = useUI((s) => s.select)
  const n = sim.yard.length
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), c: new THREE.Color(), zero: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1) }), [])
  useFrame(() => {
    const mesh = ref.current
    if (!mesh || ver.current === sim.yardVersion) return
    ver.current = sim.yardVersion
    for (let i = 0; i < n; i++) {
      const id = sim.yard[i]
      const p = yardLocal(i)
      tmp.m.compose(new THREE.Vector3(p.x, p.y, p.z), tmp.q, id ? tmp.one : tmp.zero)
      mesh.setMatrixAt(i, tmp.m)
      const c = containerById(id ?? undefined)
      mesh.setColorAt(i, tmp.c.set(c ? c.line.color : '#ffffff'))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  })
  return (
    <instancedMesh
      ref={ref}
      args={[yardGeo, containerMat, n]}
      castShadow
      receiveShadow
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        const id = e.instanceId !== undefined ? sim.yard[e.instanceId] : null
        if (id) select({ type: 'container', id })
      }}
    />
  )
}

// wind blades laid down on the TAMT apron next to berth 1
const bladeGeo = new THREE.CylinderGeometry(0.12, 1.0, 34, 10).rotateZ(Math.PI / 2)
export function Laydown() {
  const g = useRef<THREE.Group>(null)
  useFrame(() => g.current?.children.forEach((c, i) => (c.visible = i < sim.laydown)))
  return (
    <group ref={g}>
      {Array.from({ length: 12 }, (_, i) => {
        const col = Math.floor(i / 4)
        const row = i % 4
        return (
          <group key={i} position={[-168 + col * 37, LAND_Y + 1.3, -7 - row * 4.4]} rotation={[0, i % 2 ? Math.PI : 0, 0]}>
            <mesh geometry={bladeGeo} material={MAT.blade} castShadow />
            <mesh material={MAT.support} position={[-10, -0.8, 0]}>
              <boxGeometry args={[0.8, 1, 2.6]} />
            </mesh>
            <mesh material={MAT.support} position={[9, -0.8, 0]}>
              <boxGeometry args={[0.8, 1, 2.6]} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// ───────── world-frame: vehicles rolling off car carriers at NCMT

const CAR_COLORS = ['#f4f5f8', '#c9ced8', '#2d3343', '#d94a3d', '#2f6bed', '#8b93a7'].map((c) => new THREE.Color(c))
const carBody = new THREE.BoxGeometry(0.95, 0.55, 2.2)
const carCab = new THREE.BoxGeometry(0.85, 0.42, 1.15)
const carMat = std({ color: '#ffffff', roughness: 0.4 })
const cabMat = std({ color: '#2a3550', roughness: 0.3 })

export function MovingCars() {
  const body = useRef<THREE.InstancedMesh>(null)
  const cab = useRef<THREE.InstancedMesh>(null)
  const N = 120
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), one: new THREE.Vector3(1, 1, 1), zero: new THREE.Vector3() }), [])
  useFrame(() => {
    if (!body.current || !cab.current) return
    for (let i = 0; i < N; i++) {
      const car = sim.cars[i]
      if (car) {
        tmp.q.setFromEuler(tmp.e.set(0, car.heading, 0))
        tmp.m.compose(new THREE.Vector3(car.pos.x, LAND_Y + 0.45, car.pos.z), tmp.q, tmp.one)
        body.current.setMatrixAt(i, tmp.m)
        body.current.setColorAt(i, CAR_COLORS[car.color])
        tmp.m.compose(new THREE.Vector3(car.pos.x, LAND_Y + 0.95, car.pos.z), tmp.q, tmp.one)
        cab.current.setMatrixAt(i, tmp.m)
      } else {
        tmp.m.compose(tmp.zero, tmp.q, tmp.zero)
        body.current.setMatrixAt(i, tmp.m)
        cab.current.setMatrixAt(i, tmp.m)
      }
    }
    body.current.instanceMatrix.needsUpdate = true
    cab.current.instanceMatrix.needsUpdate = true
    if (body.current.instanceColor) body.current.instanceColor.needsUpdate = true
  })
  return (
    <group>
      <instancedMesh ref={body} args={[carBody, carMat, N]} frustumCulled={false} castShadow />
      <instancedMesh ref={cab} args={[carCab, cabMat, N]} frustumCulled={false} />
    </group>
  )
}

// ───────── world-frame: wakes behind moving ships and tugs

const WAKE_N = 1600
export function Wakes() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const parts = useMemo(() => Array.from({ length: WAKE_N }, () => ({ x: 0, z: 0, vx: 0, vz: 0, age: 1, life: 1, size: 1, grow: 1 })), [])
  const cursor = useRef(0)
  const acc = useRef(0)
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: foamDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffffff' }), [])
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), [])
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), c: new THREE.Color(), v: new THREE.Vector3(), s: new THREE.Vector3() }), [])
  const emit = (x: number, z: number, vx: number, vz: number, life: number, size: number, grow: number) => {
    const p = parts[cursor.current]
    cursor.current = (cursor.current + 1) % WAKE_N
    Object.assign(p, { x, z, vx, vz, age: 0, life, size, grow })
  }
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    acc.current += dt * sim.speed
    const steps = Math.min(4, Math.floor(acc.current / 0.05))
    acc.current -= steps * 0.05
    for (let k = 0; k < steps; k++) {
      for (const s of sim.ships) {
        if (s.speed < 0.6) continue
        const L = s.cls.length
        const B = s.cls.beam
        const rev = s.path[0]?.rev
        const stern = toWorld(s, (Math.random() - 0.5) * B * 0.5, rev ? L / 2 + 1 : -L / 2 - 1)
        emit(stern.x, stern.z, 0, 0, 8, B * 0.45, 1.6)
        if (!rev)
          for (const side of [-1, 1]) {
            const bow = toWorld(s, side * B * 0.45, L / 2 - 6)
            const out = toWorld({ pos: { x: 0, z: 0 }, heading: s.heading }, side * 1.6, -0.6)
            emit(bow.x, bow.z, out.x * s.speed * 0.25, out.z * s.speed * 0.25, 6, 2.2, 1.2)
          }
      }
      for (const t of sim.tugs) {
        if (t.speed < 1) continue
        const st = toWorld(t, 0, -5)
        emit(st.x, st.z, 0, 0, 3.5, 2, 1.4)
      }
    }
    const mesh = ref.current
    if (!mesh) return
    const adv = dt * sim.speed
    for (let i = 0; i < WAKE_N; i++) {
      const p = parts[i]
      p.age += adv
      const a = p.age / p.life
      if (a >= 1) {
        tmp.m.makeScale(0, 0, 0)
        mesh.setMatrixAt(i, tmp.m)
        continue
      }
      p.x += p.vx * adv
      p.z += p.vz * adv
      p.vx *= 1 - 0.5 * adv
      p.vz *= 1 - 0.5 * adv
      const size = p.size * (1 + a * p.grow * 2)
      tmp.m.compose(tmp.v.set(p.x, 0.12, p.z), tmp.q, tmp.s.set(size, 1, size))
      mesh.setMatrixAt(i, tmp.m)
      const f = (1 - a) * (a < 0.1 ? a * 10 : 1) * 0.6
      mesh.setColorAt(i, tmp.c.setRGB(f, f, f))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, WAKE_N]} frustumCulled={false} renderOrder={2} />
}
