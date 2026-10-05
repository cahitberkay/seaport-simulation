import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Ship, Tug } from '../sim/sim'
import { sim, slotLocal, containerById } from '../sim/sim'
import { CONTAINER } from '../sim/world'
import { useUI } from '../store'
import { shipStatus } from '../ui/format'
import { containerSkin, cruiseSide, hullName, sideStripe, windows, logoBadge } from './textures'

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.65, ...p })
const MAT = {
  red: std({ color: '#c8463a' }),
  deck: std({ color: '#c9ced9' }),
  hatch: std({ color: '#aab2c4' }),
  white: std({ color: '#f6f7fb' }),
  navy: std({ color: '#1f2d55' }),
  glass: std({ color: '#26386a', roughness: 0.25, metalness: 0.3 }),
  yellow: std({ color: '#f6b40e' }),
  orange: std({ color: '#f08a0b' }),
  grey: std({ color: '#7a8296' }),
  dark: std({ color: '#2d3343' }),
  pool: std({ color: '#5cc3f0', roughness: 0.2 }),
  lifeboat: std({ color: '#f39a1f' }),
  blade: std({ color: '#f4f6fa', roughness: 0.45 }),
  logo: new THREE.MeshStandardMaterial({ map: logoBadge(), transparent: true }),
  fenderTug: std({ color: '#262b38' }),
}
const lineMats = new Map<string, THREE.MeshStandardMaterial>()
const lineMat = (c: string) => {
  if (!lineMats.has(c)) lineMats.set(c, std({ color: c, roughness: 0.5 }))
  return lineMats.get(c)!
}

// ───────── hull geometry

const hullCache = new Map<string, THREE.ExtrudeGeometry>()
export function hullGeo(L: number, B: number, y0: number, y1: number, bow = 1.25, inset = 0) {
  const key = `${L}-${B}-${y0}-${y1}-${bow}-${inset}`
  if (hullCache.has(key)) return hullCache.get(key)!
  const b = B / 2 - inset
  const pts = (x: number, z: number) => new THREE.Vector2(x, -z)
  const s = new THREE.Shape()
  s.moveTo(-b * 0.9, -L / 2)
  s.lineTo(b * 0.9, -L / 2)
  s.quadraticCurveTo(b, -L / 2, b, -L / 2 + 3)
  s.lineTo(b, L / 2 - B * bow)
  s.quadraticCurveTo(b, L / 2 - B * 0.25, 0, L / 2 - inset)
  s.quadraticCurveTo(-b, L / 2 - B * 0.25, -b, L / 2 - B * bow)
  s.lineTo(-b, -L / 2 + 3)
  s.quadraticCurveTo(-b, -L / 2, -b * 0.9, -L / 2)
  // outline was drawn in (x, z); the extrude shape lives in (x, -z)
  const shape = new THREE.Shape(s.getPoints(10).map((p) => pts(p.x, p.y)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 10 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  hullCache.set(key, g)
  return g
}

function Hull({ ship, upper, deck }: { ship: Ship | { cls: { length: number; beam: number; freeboard: number } }; upper: THREE.Material; deck?: THREE.Material }) {
  const { length: L, beam: B, freeboard: f } = ship.cls
  return (
    <group>
      <mesh geometry={hullGeo(L, B, -3, 0.6)} material={[MAT.red, MAT.red]} />
      <mesh geometry={hullGeo(L, B, 0.6, f)} material={[deck ?? MAT.deck, upper]} castShadow receiveShadow />
    </group>
  )
}

function NamePlates({ ship, color, y }: { ship: Ship; color: string; y: number }) {
  const m = useMemo(() => std({ map: hullName(ship.name, color) }), [ship.name, color])
  const L = ship.cls.length
  const B = ship.cls.beam
  return (
    <group>
      <mesh material={m} position={[B / 2 + 0.03, y, L / 2 - B * 1.6]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[12, 1.5]} />
      </mesh>
      <mesh material={m} position={[-B / 2 - 0.03, y, L / 2 - B * 1.6]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[12, 1.5]} />
      </mesh>
      <mesh material={m} position={[0, y, -L / 2 - 0.03]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[B * 0.7, B * 0.09]} />
      </mesh>
    </group>
  )
}

function Accommodation({ ship, z, h = 11, w }: { ship: Ship; z: number; h?: number; w?: number }) {
  const f = ship.cls.freeboard
  const B = w ?? ship.cls.beam * 0.82
  const win = useMemo(() => {
    const t = windows('#f6f7fb', '#2a3d70').clone()
    t.needsUpdate = true
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(2, 2)
    return std({ map: t })
  }, [])
  return (
    <group position={[0, f, z]}>
      <mesh material={[win, win, MAT.white, MAT.white, win, win]} position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[B, h, 9]} />
      </mesh>
      <mesh material={MAT.white} position={[0, h + 0.4, 1]} castShadow>
        <boxGeometry args={[ship.cls.beam + 1, 0.8, 4]} />
      </mesh>
      <mesh material={MAT.glass} position={[0, h - 0.6, 3.02 + 1]}>
        <boxGeometry args={[ship.cls.beam + 0.6, 1, 0.1]} />
      </mesh>
      {/* funnel */}
      <mesh material={lineMat(ship.line.color === '#eef1f7' ? '#2f6bed' : ship.line.color)} position={[0, h + 3, -3]} castShadow>
        <boxGeometry args={[3, 5, 3.4]} />
      </mesh>
      <mesh material={MAT.logo} position={[1.52, h + 3, -3]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[2.4, 2.4]} />
      </mesh>
      <mesh material={MAT.logo} position={[-1.52, h + 3, -3]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[2.4, 2.4]} />
      </mesh>
      <mesh material={MAT.dark} position={[0, h + 5.7, -3]}>
        <boxGeometry args={[3.1, 0.6, 3.5]} />
      </mesh>
    </group>
  )
}

// ───────── deck containers (instanced, clickable)

const deckGeo = new THREE.BoxGeometry(CONTAINER.wid, CONTAINER.hgt, CONTAINER.len)
export const containerMat = new THREE.MeshStandardMaterial({ map: containerSkin(), roughness: 0.6 })

function DeckContainers({ ship }: { ship: Ship }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const ver = useRef(-1)
  const select = useUI((s) => s.select)
  const n = ship.slots.length
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), c: new THREE.Color(), q: new THREE.Quaternion(), zero: new THREE.Vector3(0, 0, 0), one: new THREE.Vector3(1, 1, 1) }), [])
  useFrame(() => {
    const mesh = ref.current
    if (!mesh || ver.current === ship.cargoVersion) return
    ver.current = ship.cargoVersion
    for (let i = 0; i < n; i++) {
      const l = slotLocal(ship.cls, i)
      const id = ship.slots[i]
      tmp.m.compose(new THREE.Vector3(l.x, l.y, l.z), tmp.q, id ? tmp.one : tmp.zero)
      mesh.setMatrixAt(i, tmp.m)
      const c = containerById(id ?? undefined)
      mesh.setColorAt(i, tmp.c.set(c ? c.line.color : '#ffffff'))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  })
  if (!n) return null
  return (
    <instancedMesh
      ref={ref}
      args={[deckGeo, containerMat, n]}
      castShadow
      receiveShadow
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        const id = e.instanceId !== undefined ? ship.slots[e.instanceId] : null
        if (id) select({ type: 'container', id })
      }}
    />
  )
}

function HatchCovers({ ship }: { ship: Ship }) {
  const cls = ship.cls
  return (
    <group>
      {Array.from({ length: cls.bays! }, (_, b) => {
        const z = slotLocal(cls, b * cls.rows! * cls.tiers!).z
        return (
          <mesh key={b} material={MAT.hatch} position={[0, cls.freeboard + 0.22, z]} receiveShadow>
            <boxGeometry args={[cls.rows! * 1.32 + 0.4, 0.45, 6.2]} />
          </mesh>
        )
      })}
    </group>
  )
}

// ───────── ship kinds

function ContainerShip({ ship }: { ship: Ship }) {
  const L = ship.cls.length
  const f = ship.cls.freeboard
  return (
    <group>
      <Hull ship={ship} upper={MAT.navy} />
      <HatchCovers ship={ship} />
      <DeckContainers ship={ship} />
      <mesh material={MAT.white} position={[0, f + 1.2, L / 2 - 12.5]} castShadow>
        <boxGeometry args={[ship.cls.beam * 0.86, 2.4, 0.6]} />
      </mesh>
      <Accommodation ship={ship} z={-L / 2 + 7} h={ship.kind === 'feeder' ? 8 : 11} />
      <NamePlates ship={ship} color="#1f2d55" y={f - 1} />
    </group>
  )
}

function CarCarrier({ ship }: { ship: Ship }) {
  const L = ship.cls.length
  const B = ship.cls.beam
  const f = ship.cls.freeboard
  const ramp = useRef<THREE.Group>(null)
  const stripe = useMemo(() => std({ map: sideStripe(ship.name, ship.line.color) }), [ship.name, ship.line.color])
  const mid = L - B * 1.25 - 4
  useFrame(() => {
    if (!ramp.current) return
    const target = ship.state === 'working' ? -0.12 : -1.45
    ramp.current.rotation.x += (target - ramp.current.rotation.x) * 0.04
  })
  return (
    <group>
      <mesh geometry={hullGeo(L, B, -3, 0.6, 0.9)} material={[MAT.red, MAT.red]} />
      <mesh geometry={hullGeo(L, B, 0.6, f, 0.9)} material={[MAT.white, MAT.white]} castShadow receiveShadow />
      <mesh material={stripe} position={[B / 2 + 0.03, f / 2 + 0.6, -L / 2 + 2 + mid / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[mid, f - 1.5]} />
      </mesh>
      <mesh material={stripe} position={[-B / 2 - 0.03, f / 2 + 0.6, -L / 2 + 2 + mid / 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[mid, f - 1.5]} />
      </mesh>
      {/* bridge at the front, funnel aft */}
      <mesh material={MAT.white} position={[0, f + 1.6, L / 2 - B * 1.3]} castShadow>
        <boxGeometry args={[B * 0.9, 3.2, 6]} />
      </mesh>
      <mesh material={MAT.glass} position={[0, f + 2, L / 2 - B * 1.3 + 3.02]}>
        <boxGeometry args={[B * 0.88, 1.1, 0.1]} />
      </mesh>
      <mesh material={lineMat(ship.line.color)} position={[0, f + 2.5, -L / 2 + 8]} castShadow>
        <boxGeometry args={[3, 5, 4]} />
      </mesh>
      {/* stern quarter ramp (port side, faces the quay when berthed) */}
      <group ref={ramp} position={[-B / 2 + 3, 2.6, -L / 2 + 1]} rotation={[-1.45, 0, 0]}>
        <group rotation={[0, -Math.PI * 0.72, 0]}>
          <mesh material={MAT.grey} position={[0, 0, 7]} castShadow>
            <boxGeometry args={[6, 0.4, 14]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

function BulkCarrier({ ship }: { ship: Ship }) {
  const L = ship.cls.length
  const f = ship.cls.freeboard
  const hatches = 5
  return (
    <group>
      <Hull ship={ship} upper={lineMat('#7a2e2a')} />
      {Array.from({ length: hatches }, (_, i) => {
        const z = -L / 2 + 18 + i * ((L - 30) / hatches) + 5
        return (
          <group key={i}>
            <mesh material={MAT.orange} position={[0, f + 0.6, z]} castShadow>
              <boxGeometry args={[ship.cls.beam * 0.62, 1.2, 9]} />
            </mesh>
            {i < hatches - 1 && (
              <group position={[ship.cls.beam * 0.3 * (i % 2 ? 1 : -1), f, z + 6.3]}>
                <mesh material={MAT.yellow} position={[0, 2.5, 0]} castShadow>
                  <cylinderGeometry args={[0.8, 1, 5, 10]} />
                </mesh>
                <mesh material={MAT.yellow} position={[0, 7, 3.5]} rotation={[0.55, 0, 0]} castShadow>
                  <boxGeometry args={[0.6, 0.6, 12]} />
                </mesh>
              </group>
            )}
          </group>
        )
      })}
      <Accommodation ship={ship} z={-L / 2 + 7} />
      <NamePlates ship={ship} color="#7a2e2a" y={f - 1} />
    </group>
  )
}

const bladeGeo = new THREE.CylinderGeometry(0.12, 1.0, 34, 10).rotateX(Math.PI / 2)
function MultipurposeShip({ ship }: { ship: Ship }) {
  const L = ship.cls.length
  const f = ship.cls.freeboard
  const blades = useRef<THREE.Group>(null)
  useFrame(() => {
    blades.current?.children.forEach((c, i) => (c.visible = i < (ship.blades?.onboard ?? 0)))
  })
  return (
    <group>
      <Hull ship={ship} upper={lineMat('#2f6bed')} />
      <group ref={blades}>
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} geometry={bladeGeo} material={MAT.blade} position={[(i % 4) * 2.4 - 3.6, f + 1.2 + Math.floor(i / 4) * 1.9, 6 + (i % 2) * 2]} rotation={[0, i % 2 ? Math.PI : 0, 0]} castShadow />
        ))}
      </group>
      {[-1, 1].map((sd, k) => (
        <group key={k} position={[sd * ship.cls.beam * 0.36, f, -L / 2 + 22 + k * 30]}>
          <mesh material={MAT.dark} position={[0, 3, 0]} castShadow>
            <cylinderGeometry args={[1, 1.2, 6, 10]} />
          </mesh>
          <mesh material={MAT.yellow} position={[-sd * 3, 8, 6]} rotation={[0.45, -sd * 0.5, 0]} castShadow>
            <boxGeometry args={[0.8, 0.8, 18]} />
          </mesh>
        </group>
      ))}
      <Accommodation ship={ship} z={-L / 2 + 6} h={9} />
      <NamePlates ship={ship} color="#2f6bed" y={f - 1} />
    </group>
  )
}

function CruiseShip({ ship }: { ship: Ship }) {
  const L = ship.cls.length
  const B = ship.cls.beam
  const f = ship.cls.freeboard
  const sideMat = useMemo(() => {
    const t = cruiseSide().clone()
    t.needsUpdate = true
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(4, 1)
    return std({ map: t })
  }, [])
  const tiers = [
    { l: L * 0.86, w: B * 0.96, h: 5 },
    { l: L * 0.78, w: B * 0.92, h: 5 },
    { l: L * 0.66, w: B * 0.86, h: 4 },
    { l: L * 0.5, w: B * 0.78, h: 3.5 },
  ]
  let y = f
  return (
    <group>
      <mesh geometry={hullGeo(L, B, -3, 0.6, 1.6)} material={[MAT.red, MAT.red]} />
      <mesh geometry={hullGeo(L, B, 0.6, f, 1.6)} material={[MAT.white, lineMat('#1f2d55')]} castShadow receiveShadow />
      {tiers.map((t, i) => {
        const el = (
          <mesh key={i} material={[sideMat, sideMat, MAT.white, MAT.white, MAT.white, MAT.white]} position={[0, y + t.h / 2, -L * 0.04 - i * 2]} castShadow receiveShadow>
            <boxGeometry args={[t.w, t.h, t.l]} />
          </mesh>
        )
        y += t.h
        return el
      })}
      <mesh material={MAT.pool} position={[0, y + 0.05, 8]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[B * 0.4, 14]} />
      </mesh>
      <mesh material={lineMat('#2f6bed')} position={[0, y + 4, -L * 0.18]} castShadow>
        <boxGeometry args={[5, 8, 9]} />
      </mesh>
      <mesh material={MAT.logo} position={[2.53, y + 4.5, -L * 0.18]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[4.5, 4.5]} />
      </mesh>
      <mesh material={MAT.logo} position={[-2.53, y + 4.5, -L * 0.18]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[4.5, 4.5]} />
      </mesh>
      <mesh material={MAT.glass} position={[0, f + 13.5, L * 0.35]}>
        <boxGeometry args={[B * 0.95, 1.4, 1]} />
      </mesh>
      {[-1, 1].map((sd) =>
        Array.from({ length: 9 }, (_, i) => (
          <mesh key={`${sd}${i}`} material={MAT.lifeboat} position={[sd * (B * 0.49), f + 5.6, -L * 0.3 + i * 9]} rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.8, 3.6, 4, 8]} />
          </mesh>
        )),
      )}
    </group>
  )
}

// ───────── ship root

function ShipLabel({ ship }: { ship: Ship }) {
  useUI((s) => s.tick)
  const st = shipStatus(ship)
  const tall = ship.kind === 'cruise' ? 30 : ship.kind === 'carcarrier' ? 24 : 22
  return (
    <Html position={[0, tall, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
      <div className="tag">
        <span className={`tag-dot dot-${st.tone}`} />
        <b>{ship.name.toUpperCase()}</b>
        <span>
          {st.label}
          {st.pct !== undefined ? ` ${st.pct}%` : ''}
        </span>
      </div>
    </Html>
  )
}

export function ShipModel({ ship }: { ship: Ship }) {
  const group = useRef<THREE.Group>(null)
  const select = useUI((s) => s.select)
  const bob = useMemo(() => Math.random() * 10, [])
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    g.position.set(ship.pos.x, Math.sin(clock.elapsedTime * 0.7 + bob) * 0.08, ship.pos.z)
    g.rotation.y = ship.heading
    g.rotation.z = Math.sin(clock.elapsedTime * 0.5 + bob) * 0.006
  })
  const body =
    ship.kind === 'container' || ship.kind === 'feeder' ? (
      <ContainerShip ship={ship} />
    ) : ship.kind === 'carcarrier' ? (
      <CarCarrier ship={ship} />
    ) : ship.kind === 'bulk' ? (
      <BulkCarrier ship={ship} />
    ) : ship.kind === 'multipurpose' ? (
      <MultipurposeShip ship={ship} />
    ) : (
      <CruiseShip ship={ship} />
    )
  return (
    <group
      ref={group}
      onClick={(e) => {
        e.stopPropagation()
        select({ type: 'ship', id: ship.id }, ship.state !== 'working' && ship.state !== 'anchored')
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      {body}
      <ShipLabel ship={ship} />
    </group>
  )
}

export function Ships() {
  useUI((s) => s.tick)
  return (
    <>
      {sim.ships.map((s) => (
        <ShipModel key={s.id} ship={s} />
      ))}
    </>
  )
}

// ───────── tugs

const tugHull = { cls: { length: 9, beam: 3.8, freeboard: 1.6 } }
export function TugModel({ tug }: { tug: Tug }) {
  const g = useRef<THREE.Group>(null)
  const select = useUI((s) => s.select)
  useFrame(() => {
    if (!g.current) return
    g.current.position.set(tug.pos.x, 0, tug.pos.z)
    g.current.rotation.y = tug.heading
  })
  return (
    <group
      ref={g}
      onClick={(e) => {
        e.stopPropagation()
        select({ type: 'tug', id: tug.id }, true)
      }}
    >
      <Hull ship={tugHull} upper={lineMat('#e0533d')} />
      <mesh material={MAT.white} position={[0, 2.8, 0.5]} castShadow>
        <boxGeometry args={[2.6, 2.4, 3]} />
      </mesh>
      <mesh material={MAT.glass} position={[0, 3.4, 2.02]}>
        <boxGeometry args={[2.4, 0.8, 0.1]} />
      </mesh>
      <mesh material={MAT.dark} position={[0, 4.8, -0.2]}>
        <boxGeometry args={[0.3, 2.4, 0.3]} />
      </mesh>
      <mesh material={MAT.fenderTug} position={[0, 1.2, 4.6]}>
        <boxGeometry args={[3.2, 1.2, 0.6]} />
      </mesh>
    </group>
  )
}
