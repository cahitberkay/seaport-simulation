import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GEO, pointInRing } from '../sim/geo'
import type { XZ } from '../sim/geo'
import { LAND_Y, MIDWAY_POSE, PORT } from '../sim/world'
import { Bridges, OtherTerminals, QueenMary, CruiseDome, ThumsIslands } from './Harbour'
import { STALLS, CAR_COLORS } from '../sim/parking'
import { YACHTS, DOCKS } from '../sim/marina'
import { PLACES, STATUE_ID } from '../sim/places'
import { useUI } from '../store'
import { LIGHT } from './light'

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...p })
const MAT = {
  land: std({ color: '#ece7dc' }),
  wall: std({ color: '#cbbfa8' }),
  pier: std({ color: '#d4d8e3' }),
  dock: std({ color: '#c9b79a', roughness: 0.9 }),
  rock: std({ color: '#a7adbb' }),
  runway: std({ color: '#bfc4d0' }),
  stripe: std({ color: '#ffffff' }),
  lot: std({ color: '#d6dae5', roughness: 0.95 }),
  bridge: std({ color: '#3d74e8', roughness: 0.5 }),
  bridgeTop: std({ color: '#f2f4f9' }),
  bridgePier: std({ color: '#b9c0d1' }),
  navy: std({ color: '#8f99ad', roughness: 0.6 }),
  navyDeck: std({ color: '#6f7a90' }),
  steel: std({ color: '#9aa3b8', metalness: 0.3, roughness: 0.5 }),
}

const clickable = (onClick: (e: ThreeEvent<MouseEvent>) => void) => ({
  onClick: (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onClick(e)
  },
  onPointerOver: (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    document.body.style.cursor = 'pointer'
  },
  onPointerOut: () => (document.body.style.cursor = ''),
})

// ───────── land

function shapeOf(rings: XZ[][]) {
  const s = new THREE.Shape(rings[0].map(([x, z]) => new THREE.Vector2(x, -z)))
  for (let i = 1; i < rings.length; i++) s.holes.push(new THREE.Path(rings[i].map(([x, z]) => new THREE.Vector2(x, -z))))
  return s
}

function Land() {
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(GEO.land.map(shapeOf), { depth: LAND_Y, bevelEnabled: false, curveSegments: 1 })
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  return <mesh geometry={geo} material={[MAT.land, MAT.wall]} receiveShadow />
}

// ───────── buildings (one merged mesh; each triangle remembers its building for picking)

const PALETTE = {
  glass: ['#cfdcf0', '#dbe5f5', '#c2d3ec', '#e3eaf6'],
  mid: ['#f2f3f7', '#e9edf6', '#f4efe6', '#eef0f5'],
  low: ['#f4f0e8', '#ece7dc', '#f6f4ee', '#e7ebf2', '#f1e9e1'],
  industry: ['#e3e6ed', '#dde1ea', '#e8eaf0'],
  roofLow: ['#d9a68e', '#cfd4de', '#e3d6c3', '#c9ced9'],
}

function pickColor(b: (typeof GEO.buildings)[number], i: number) {
  const r = (i * 2654435761) % 97
  if (b.h >= 28) return { wall: PALETTE.glass[r % 4], roof: '#dfe4ee' }
  if (['warehouse', 'industrial', 'hangar', 'military'].includes(b.t)) return { wall: PALETTE.industry[r % 3], roof: '#d4d9e3' }
  if (b.h >= 8) return { wall: PALETTE.mid[r % 4], roof: '#e1e5ee' }
  return { wall: PALETTE.low[r % 5], roof: PALETTE.roofLow[r % 4] }
}

export const BUILDING_OF_FACE: Int32Array[] = []

function buildCity() {
  const pos: number[] = []
  const nor: number[] = []
  const col: number[] = []
  const wall: number[] = []
  const owner: number[] = []
  const c = new THREE.Color()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const d = new THREE.Vector3()
  const n = new THREE.Vector3()
  const pushTri = (p: number[][], normal: THREE.Vector3, color: THREE.Color, isWall: number, idx: number) => {
    a.set(p[0][0], p[0][1], p[0][2])
    b.set(p[1][0], p[1][1], p[1][2])
    d.set(p[2][0], p[2][1], p[2][2])
    const face = b.clone().sub(a).cross(d.clone().sub(a))
    const order = face.dot(normal) >= 0 ? [0, 1, 2] : [0, 2, 1]
    for (const k of order) {
      pos.push(p[k][0], p[k][1], p[k][2])
      nor.push(normal.x, normal.y, normal.z)
      col.push(color.r, color.g, color.b)
      wall.push(isWall)
    }
    owner.push(idx)
  }
  GEO.buildings.forEach((bd, idx) => {
    const ring = bd.p
    if (ring.length < 3) return
    const y0 = LAND_Y - 0.3
    const y1 = LAND_Y + Math.max(1.5, bd.h)
    const colors = pickColor(bd, idx)
    c.set(colors.wall)
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i]
      const [x1, z1] = ring[(i + 1) % ring.length]
      const len = Math.hypot(x1 - x0, z1 - z0)
      if (len < 0.05) continue
      n.set((z1 - z0) / len, 0, -(x1 - x0) / len)
      const mx = (x0 + x1) / 2 + n.x * 0.3
      const mz = (z0 + z1) / 2 + n.z * 0.3
      if (pointInRing(mx, mz, ring)) n.negate()
      pushTri([[x0, y0, z0], [x1, y0, z1], [x1, y1, z1]], n, c, 1, idx)
      pushTri([[x0, y0, z0], [x1, y1, z1], [x0, y1, z0]], n, c, 1, idx)
    }
    c.set(colors.roof)
    const contour = ring.map(([x, z]) => new THREE.Vector2(x, z))
    const tris = THREE.ShapeUtils.triangulateShape(contour, [])
    n.set(0, 1, 0)
    for (const [i0, i1, i2] of tris) {
      pushTri([[ring[i0][0], y1, ring[i0][1]], [ring[i1][0], y1, ring[i1][1]], [ring[i2][0], y1, ring[i2][1]]], n, c, 0, idx)
    }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('aWall', new THREE.Float32BufferAttribute(wall, 1))
  g.computeBoundingSphere()
  return { geo: g, owner: Int32Array.from(owner) }
}

function cityMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = LIGHT.night
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWall;\nvarying float vWall;\nvarying vec3 vCityPos;\nvarying vec3 vCityNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWall = aWall;\nvCityPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvCityNormal = normal;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vWall;\nvarying vec3 vCityPos;\nvarying vec3 vCityNormal;\nfloat cityHash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (vWall > 0.5) {
          float along = abs(vCityNormal.x) > 0.5 ? vCityPos.z : vCityPos.x;
          float floorY = (vCityPos.y - ${LAND_Y.toFixed(1)}) / 1.8;
          vec2 cell = vec2(floor(along / 1.6), floor(floorY));
          vec2 f = vec2(fract(along / 1.6), fract(floorY));
          float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.78) * step(0.6, floorY);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.84, 0.95), win * 0.55);
          float lit = step(0.55, cityHash(cell + floor(vCityPos.xz / 40.0)));
          totalEmissiveRadiance += vec3(1.0, 0.82, 0.52) * win * lit * uNight * 0.9;
        }`,
      )
  }
  return m
}

export function City() {
  const select = useUI((s) => s.select)
  const { geo, owner } = useMemo(buildCity, [])
  const mat = useMemo(cityMaterial, [])
  return (
    <mesh
      geometry={geo}
      material={mat}
      castShadow
      receiveShadow
      {...clickable((e) => {
        if (e.faceIndex === undefined || e.faceIndex === null) return
        const i = owner[e.faceIndex]
        if (i !== undefined) select({ type: 'building', id: String(i) })
      })}
    />
  )
}

// ───────── piers, docks, breakwaters, runways

function segBox(ax: number, az: number, bx: number, bz: number, w: number, y0: number, y1: number) {
  const len = Math.hypot(bx - ax, bz - az)
  const g = new THREE.BoxGeometry(w, y1 - y0, len + w * 0.5)
  g.rotateY(Math.atan2(bx - ax, bz - az))
  g.translate((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2)
  return g
}

function Piers() {
  const geos = useMemo(() => {
    const fixed: THREE.BufferGeometry[] = []
    const floating: THREE.BufferGeometry[] = []
    const rocks: THREE.BufferGeometry[] = []
    const dockSet = new Set(DOCKS.map((d) => d.c))
    for (const p of GEO.piers) {
      if (p.closed) {
        const s = new THREE.Shape(p.c.map(([x, z]) => new THREE.Vector2(x, -z)))
        const g = new THREE.ExtrudeGeometry(s, { depth: LAND_Y - 0.25, bevelEnabled: false, curveSegments: 1 })
        g.rotateX(-Math.PI / 2)
        fixed.push(g)
        continue
      }
      const isDock = dockSet.has(p.c)
      const naval = /^Pier \d+/.test(p.n ?? '')
      for (let i = 0; i < p.c.length - 1; i++) {
        const [ax, az] = p.c[i]
        const [bx, bz] = p.c[i + 1]
        if (isDock) floating.push(segBox(ax, az, bx, bz, 1.6, 0.25, 0.75))
        else fixed.push(segBox(ax, az, bx, bz, naval ? 11 : 3.5, 0, LAND_Y - 0.2))
      }
    }
    for (const p of GEO.breakwaters) for (let i = 0; i < p.c.length - 1; i++) rocks.push(segBox(p.c[i][0], p.c[i][1], p.c[i + 1][0], p.c[i + 1][1], 6, -1, 1.6))
    const merge = (l: THREE.BufferGeometry[]) => (l.length ? mergeGeometries(l.map((g) => g.toNonIndexed()), false) : null)
    return { fixed: merge(fixed), floating: merge(floating), rocks: merge(rocks) }
  }, [])
  return (
    <group>
      {geos.fixed && <mesh geometry={geos.fixed} material={MAT.pier} receiveShadow castShadow />}
      {geos.floating && <mesh geometry={geos.floating} material={MAT.dock} receiveShadow />}
      {geos.rocks && <mesh geometry={geos.rocks} material={MAT.rock} receiveShadow />}
    </group>
  )
}

function Runways() {
  const geo = useMemo(() => {
    const list: THREE.BufferGeometry[] = []
    for (const r of GEO.runways) for (let i = 0; i < r.c.length - 1; i++) list.push(segBox(r.c[i][0], r.c[i][1], r.c[i + 1][0], r.c[i + 1][1], r.w, LAND_Y, LAND_Y + 0.06))
    return list.length ? mergeGeometries(list.map((g) => g.toNonIndexed())) : null
  }, [])
  return geo ? <mesh geometry={geo} material={MAT.runway} receiveShadow /> : null
}

// ───────── USS Midway (museum carrier at Navy Pier)

function Midway() {
  const select = useUI((s) => s.select)
  if (!MIDWAY_POSE) return null
  const k = MIDWAY_POSE.length / 150
  return (
    <group position={[MIDWAY_POSE.x, 0, MIDWAY_POSE.z]} rotation={[0, MIDWAY_POSE.heading, 0]} scale={[1, 1, k]} {...clickable(() => select({ type: 'place', id: 'midway' }))}>
      <mesh material={MAT.navy} position={[0, 2.5, 0]} castShadow>
        <boxGeometry args={[17, 9, 140]} />
      </mesh>
      <mesh material={MAT.navyDeck} position={[0, 7.3, 3]} castShadow receiveShadow>
        <boxGeometry args={[30, 0.8, 150]} />
      </mesh>
      <mesh material={MAT.navy} position={[11, 12.5, 12]} castShadow>
        <boxGeometry args={[5, 9, 24]} />
      </mesh>
      <mesh material={MAT.navy} position={[11, 19, 14]}>
        <boxGeometry args={[1.6, 6, 2.4]} />
      </mesh>
      {[-52, -36, -18, 24, 40, 58].map((z, i) => (
        <group key={i} position={[(i % 2 ? -1 : 1) * 6, 8.3, z]} rotation={[0, i * 0.7, 0]}>
          <mesh material={MAT.steel}>
            <boxGeometry args={[7, 0.5, 1.2]} />
          </mesh>
          <mesh material={MAT.steel}>
            <boxGeometry args={[1, 0.6, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ───────── Unconditional Surrender ("Embracing Peace") – the 25 ft kissing statue

function Statue() {
  const select = useUI((s) => s.select)
  const p = PLACES.find((x) => x.id === STATUE_ID)!
  const m = useMemo(
    () => ({
      navy: std({ color: '#1d2742', roughness: 0.5 }),
      white: std({ color: '#f7f7f4', roughness: 0.45 }),
      skin: std({ color: '#e7b99a', roughness: 0.6 }),
      base: std({ color: '#b7bcc8' }),
      hair: std({ color: '#5a3b28' }),
    }),
    [],
  )
  // ~1.5× real size so the landmark reads at port scale
  return (
    <group position={[p.x, LAND_Y, p.z]} rotation={[0, -0.6, 0]} scale={1.5} {...clickable(() => select({ type: 'place', id: STATUE_ID }))}>
      <mesh material={m.base} position={[0, 0.25, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.6, 1.8, 0.5, 20]} />
      </mesh>
      {/* sailor: leaning in, dark navy uniform */}
      <group position={[0.35, 0.5, 0]} rotation={[0, 0, 0.32]}>
        <mesh material={m.navy} position={[0, 0.85, 0]} castShadow>
          <capsuleGeometry args={[0.22, 1.0, 4, 10]} />
        </mesh>
        <mesh material={m.navy} position={[0, 2.05, 0]} castShadow>
          <capsuleGeometry args={[0.34, 0.9, 4, 12]} />
        </mesh>
        <mesh material={m.skin} position={[-0.12, 2.95, 0]} castShadow>
          <sphereGeometry args={[0.24, 14, 10]} />
        </mesh>
        <mesh material={m.white} position={[-0.12, 3.18, 0]}>
          <cylinderGeometry args={[0.2, 0.22, 0.12, 14]} />
        </mesh>
        <mesh material={m.navy} position={[-0.45, 2.3, 0.25]} rotation={[0, 0, 1.0]} castShadow>
          <capsuleGeometry args={[0.1, 0.7, 4, 8]} />
        </mesh>
      </group>
      {/* nurse: bent back in his arms, white dress */}
      <group position={[-0.45, 0.5, 0]} rotation={[0, 0, -0.62]}>
        <mesh material={m.skin} position={[0.05, 0.55, 0]} castShadow>
          <capsuleGeometry args={[0.08, 0.7, 4, 8]} />
        </mesh>
        <mesh material={m.white} position={[0, 1.35, 0]} castShadow>
          <coneGeometry args={[0.42, 1.2, 14]} />
        </mesh>
        <mesh material={m.white} position={[0, 2.1, 0]} castShadow>
          <capsuleGeometry args={[0.24, 0.55, 4, 10]} />
        </mesh>
        <mesh material={m.skin} position={[0.05, 2.75, 0]} castShadow>
          <sphereGeometry args={[0.21, 14, 10]} />
        </mesh>
        <mesh material={m.hair} position={[-0.05, 2.82, 0]}>
          <sphereGeometry args={[0.2, 12, 8]} />
        </mesh>
      </group>
    </group>
  )
}

// ───────── Star of India (Maritime Museum flagship)

function StarOfIndia() {
  const select = useUI((s) => s.select)
  const m = useMemo(() => ({ hull: std({ color: '#1b1f2b' }), stripe: std({ color: '#f2f2ee' }), wood: std({ color: '#8a6a4a' }), sail: std({ color: '#f4f1e8' }) }), [])
  const p = PLACES.find((x) => x.id === 'maritime')!
  return (
    <group position={[p.x - 25, 0, p.z + 4]} rotation={[0, Math.PI, 0]} {...clickable(() => select({ type: 'place', id: 'maritime' }))}>
      <mesh material={m.hull} position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[5, 3.4, 32]} />
      </mesh>
      <mesh material={m.stripe} position={[0, 2.4, 0]}>
        <boxGeometry args={[5.05, 0.4, 32.05]} />
      </mesh>
      {[-9, 0, 9].map((z, i) => (
        <group key={i} position={[0, 2.9, z]}>
          <mesh material={m.wood} position={[0, 9, 0]}>
            <cylinderGeometry args={[0.18, 0.25, 18, 6]} />
          </mesh>
          {[5, 9, 13].map((y) => (
            <mesh key={y} material={m.wood} position={[0, y, 0]}>
              <boxGeometry args={[7 - y * 0.25, 0.18, 0.18]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

// ───────── parking lots and parked cars

const carBody = new THREE.BoxGeometry(0.95, 0.5, 2.3)
const carCab = new THREE.BoxGeometry(0.8, 0.4, 1.05).translate(0, 0, -0.15)

export const CAR_OF_INSTANCE: number[] = STALLS.map((s, i) => (s.occupied ? i : -1)).filter((i) => i >= 0)

function ParkedCars() {
  const select = useUI((s) => s.select)
  const body = useRef<THREE.InstancedMesh>(null)
  const cab = useRef<THREE.InstancedMesh>(null)
  const n = CAR_OF_INSTANCE.length
  const setup = (mesh: THREE.InstancedMesh | null, y: number, isCab: boolean) => {
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const c = new THREE.Color()
    CAR_OF_INSTANCE.forEach((si, i) => {
      const s = STALLS[si]
      q.setFromEuler(e.set(0, s.rot, 0))
      m.compose(new THREE.Vector3(s.x, y, s.z), q, new THREE.Vector3(1, 1, 1))
      mesh.setMatrixAt(i, m)
      if (!isCab) mesh.setColorAt(i, c.set(CAR_COLORS[s.color]))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }
  const carMat = useMemo(() => std({ color: '#ffffff', roughness: 0.35, metalness: 0.1 }), [])
  const cabMat = useMemo(() => std({ color: '#2a3550', roughness: 0.3 }), [])
  return (
    <group>
      <instancedMesh
        ref={(m) => {
          body.current = m
          setup(m, LAND_Y + 0.4, false)
        }}
        args={[carBody, carMat, n]}
        castShadow
        {...clickable((e) => e.instanceId !== undefined && select({ type: 'car', id: String(CAR_OF_INSTANCE[e.instanceId]) }))}
      />
      <instancedMesh
        ref={(m) => {
          cab.current = m
          setup(m, LAND_Y + 0.84, true)
        }}
        args={[carCab, cabMat, n]}
        {...clickable((e) => e.instanceId !== undefined && select({ type: 'car', id: String(CAR_OF_INSTANCE[e.instanceId]) }))}
      />
    </group>
  )
}

function LotSurfaces() {
  const geo = useMemo(() => {
    const list: THREE.BufferGeometry[] = []
    GEO.parking.forEach((p) => {
      const sh = new THREE.Shape(p.p.map(([x, z]) => new THREE.Vector2(x, -z)))
      const g = new THREE.ShapeGeometry(sh)
      g.rotateX(-Math.PI / 2)
      g.translate(0, LAND_Y + 0.02, 0)
      list.push(g.toNonIndexed())
    })
    return list.length ? mergeGeometries(list) : null
  }, [])
  return geo ? <mesh geometry={geo} material={MAT.lot} receiveShadow /> : null
}

// ───────── marinas and yachts

function hullGeometry() {
  const s = new THREE.Shape()
  s.moveTo(-0.5, -0.5)
  s.lineTo(0.5, -0.5)
  s.lineTo(0.5, 0.15)
  s.quadraticCurveTo(0.45, 0.42, 0, 0.5)
  s.quadraticCurveTo(-0.45, 0.42, -0.5, 0.15)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 4 })
  g.rotateX(Math.PI / 2) // extrude upward, outline in x/z
  g.translate(0, 1, 0)
  g.scale(1, 1, -1)
  return g
}

export function Yachts() {
  const select = useUI((s) => s.select)
  const hull = useMemo(hullGeometry, [])
  const cabinGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const mastGeo = useMemo(() => new THREE.CylinderGeometry(0.05, 0.07, 1, 5), [])
  const sails = useMemo(() => YACHTS.map((y, i) => (y.kind === 'sail' || y.kind === 'cat' ? i : -1)).filter((i) => i >= 0), [])
  const mats = useMemo(() => ({ hull: std({ color: '#fbfcff', roughness: 0.35, side: THREE.DoubleSide }), cabin: std({ color: '#e7ebf3', roughness: 0.3 }), mast: std({ color: '#c8cdd8' }) }), [])
  const setup = (mesh: THREE.InstancedMesh | null, kind: 'hull' | 'cabin' | 'mast') => {
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const list = kind === 'mast' ? sails : YACHTS.map((_, i) => i)
    list.forEach((yi, i) => {
      const y = YACHTS[yi]
      q.setFromEuler(e.set(0, y.heading, 0))
      const h = y.kind === 'super' ? 2.2 : 0.9
      if (kind === 'hull') m.compose(new THREE.Vector3(y.x, -0.35, y.z), q, new THREE.Vector3(y.beam, h, y.length))
      else if (kind === 'cabin') {
        const ch = y.kind === 'super' ? 2.6 : y.kind === 'sail' ? 0.5 : 0.95
        const off = new THREE.Vector3(0, 0, -y.length * 0.08).applyQuaternion(q)
        m.compose(new THREE.Vector3(y.x + off.x, h - 0.35 + ch / 2, y.z + off.z), q, new THREE.Vector3(y.beam * 0.7, ch, y.length * (y.kind === 'super' ? 0.6 : 0.42)))
      } else m.compose(new THREE.Vector3(y.x, 0.55 + y.length * 0.65, y.z), q, new THREE.Vector3(1, y.length * 1.3, 1))
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }
  const onClick = (map: (i: number) => number) => clickable((e) => e.instanceId !== undefined && select({ type: 'yacht', id: String(map(e.instanceId)) }))
  return (
    <group>
      <instancedMesh ref={(m) => setup(m, 'hull')} args={[hull, mats.hull, YACHTS.length]} castShadow {...onClick((i) => i)} />
      <instancedMesh ref={(m) => setup(m, 'cabin')} args={[cabinGeo, mats.cabin, YACHTS.length]} {...onClick((i) => i)} />
      <instancedMesh ref={(m) => setup(m, 'mast')} args={[mastGeo, mats.mast, sails.length]} {...onClick((i) => sails[i])} />
    </group>
  )
}

// ───────── street lights that glow at night along the waterfront

function NightGlow() {
  const ref = useRef<THREE.Points>(null)
  const geo = useMemo(() => {
    const pts: number[] = []
    for (const d of DOCKS) for (const [x, z] of d.c) pts.push(x, 1.6, z)
    GEO.piers.forEach((p) => {
      if (!p.closed) return
      for (const [x, z] of p.c) pts.push(x, LAND_Y + 4, z)
    })
    GEO.parking.forEach((p) => {
      const [x, z] = p.p[0]
      pts.push(x, LAND_Y + 5, z)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])
  const mat = useMemo(() => new THREE.PointsMaterial({ color: '#ffd58a', size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), [])
  useFrame(() => {
    mat.opacity = LIGHT.night.value * 0.9
    if (ref.current) ref.current.visible = LIGHT.night.value > 0.02
  })
  return <points ref={ref} geometry={geo} material={mat} />
}

export function World() {
  return (
    <group>
      <Land />
      <City />
      <Piers />
      <Runways />
      <LotSurfaces />
      <ParkedCars />
      <Yachts />
      <Bridges />
      {PORT.id === 'san-diego' ? (
        <>
          <Midway />
          <Statue />
          <StarOfIndia />
        </>
      ) : (
        <>
          <OtherTerminals />
          <QueenMary />
          <CruiseDome />
          <ThumsIslands />
        </>
      )}
      <NightGlow />
    </group>
  )
}
