import { useMemo } from 'react'
import * as THREE from 'three'
import { LAND_Y, BLOCKS, YARD_STACKS, STACK_PITCH, rowZ } from '../sim/world'
import { concrete, glassTower, logoBadge, signText, windows } from './textures'

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...p })

const MAT = {
  land: std({ color: '#e6e9f3' }),
  wall: std({ color: '#c3c9d8' }),
  coronado: std({ color: '#dcebd7' }),
  beach: std({ color: '#efe6cf' }),
  hill: std({ color: '#c9dfc0' }),
  road: std({ color: '#d3d8e6' }),
  roadLine: std({ color: '#ffffff' }),
  white: std({ color: '#f6f7fb' }),
  roofGrey: std({ color: '#dfe3ec' }),
  blue: std({ color: '#2f6bed', roughness: 0.55 }),
  steel: std({ color: '#9aa3b8', roughness: 0.5, metalness: 0.3 }),
  dark: std({ color: '#3a4256' }),
  fender: std({ color: '#262b38' }),
  yellow: std({ color: '#f3c74d' }),
  bridge: std({ color: '#3d74e8', roughness: 0.5 }),
  pier: std({ color: '#b9c0d1' }),
  navy: std({ color: '#8f99ad', roughness: 0.6 }),
  navyDeck: std({ color: '#6f7a90' }),
  rail: std({ color: '#7b8397', metalness: 0.4, roughness: 0.4 }),
  runway: std({ color: '#c7ccd8' }),
  roofRed: std({ color: '#d9725b' }),
  silo: std({ color: '#eceef4', roughness: 0.6 }),
  trunk: std({ color: '#b08a6a' }),
  leaf: std({ color: '#8fd27c' }),
  leaf2: std({ color: '#79c46b' }),
  logo: new THREE.MeshStandardMaterial({ map: logoBadge(), transparent: true }),
}

let s = 77
const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646

/** Extrude an outline given in world (x, z) up to a height. */
function useLand(points: [number, number][], height: number) {
  return useMemo(() => {
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)))
    const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    return g
  }, [points, height])
}

const MAINLAND: [number, number][] = [
  [-4600, -3200], [4600, -3200], [4600, 0], [1480, 0], [880, 0], [600, 0], [540, -6], [470, 0], [335, 0],
  [-335, 0], [-1700, 0], [-1900, -10], [-2150, 30], [-2450, 120], [-2750, 205], [-2950, 230], [-3150, 190],
  [-3350, 80], [-3550, -150], [-3800, -400], [-4600, -500],
]
const CORONADO: [number, number][] = [
  [-4600, 1300], [-3600, 900], [-3200, 560], [-2900, 500], [-2500, 480], [-2100, 560], [-1600, 660], [-1000, 715],
  [-300, 720], [380, 705], [800, 740], [1300, 800], [1900, 880], [2600, 980], [3400, 1050], [4600, 1150], [4600, 3600], [-4600, 3600],
]

function Box({ p, s: size, m, cast = true }: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material; cast?: boolean }) {
  return (
    <mesh material={m} position={p} castShadow={cast} receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  )
}

function Flat({ x, z, w, d, m, y = LAND_Y + 0.02 }: { x: number; z: number; w: number; d: number; m: THREE.Material; y?: number }) {
  return (
    <mesh material={m} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
    </mesh>
  )
}

function Trees({ pts }: { pts: [number, number, number, number][] }) {
  const trunk = useMemo(() => new THREE.CylinderGeometry(0.35, 0.45, 3, 6), [])
  const leaf = useMemo(() => new THREE.CapsuleGeometry(2.2, 2.8, 4, 10), [])
  const groups = [pts.filter((_, i) => i % 2 === 0), pts.filter((_, i) => i % 2 === 1)]
  const set = (mesh: THREE.InstancedMesh | null, list: [number, number, number, number][], yOff: number) => {
    if (!mesh) return
    const m = new THREE.Matrix4()
    list.forEach(([x, z, sc, base], i) => {
      m.compose(new THREE.Vector3(x, base + yOff * sc, z), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc))
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
  }
  return (
    <group>
      <instancedMesh ref={(m) => set(m, pts, 1.5)} args={[trunk, MAT.trunk, pts.length]} castShadow />
      {groups.map((g, i) => (
        <instancedMesh key={i} ref={(m) => set(m, g, 5.2)} args={[leaf, i ? MAT.leaf2 : MAT.leaf, g.length]} castShadow />
      ))}
    </group>
  )
}

function CityBlocks() {
  const towers = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number; h: number; c: string }[] = []
    for (let x = -1680; x < -400; x += 46)
      for (let z = -70; z > -760; z -= 46) {
        if (rnd() < 0.2) continue
        const core = Math.exp(-(((x + 1050) / 380) ** 2) - (((z + 260) / 260) ** 2))
        const h = 8 + rnd() * 18 + core * (40 + rnd() * 70)
        out.push({ x: x + rnd() * 6, z: z + rnd() * 6, w: 18 + rnd() * 14, d: 18 + rnd() * 14, h, c: h > 45 ? pickGlass() : rnd() < 0.5 ? '#f3f4f9' : '#e8ecf6' })
      }
    // Barrio Logan / Logan Heights low-rise behind TAMT and east
    for (let x = -360; x < 4400; x += 40)
      for (let z = -280; z > -900; z -= 40) {
        if (rnd() < 0.3 || (x > 860 && x < 1500 && z > -300)) continue
        out.push({ x, z, w: 16 + rnd() * 10, d: 16 + rnd() * 10, h: 4 + rnd() * 9, c: rnd() < 0.5 ? '#f3f4f9' : '#e9edf7' })
      }
    return out
  }, [])
  return (
    <group>
      {towers.map((t, i) => (
        <Tower key={i} {...t} />
      ))}
    </group>
  )
}
const pickGlass = () => ['#cfe0f6', '#dbe6f7', '#e7eefa', '#c4d7f2'][Math.floor(rnd() * 4)]

const towerMats = new Map<string, THREE.Material>()
function Tower({ x, z, w, d, h, c }: { x: number; z: number; w: number; d: number; h: number; c: string }) {
  const key = `${c}-${h > 45}`
  if (!towerMats.has(key)) {
    const t = (h > 45 ? glassTower(c) : windows(c)).clone()
    t.needsUpdate = true
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(2, h > 45 ? 6 : 1)
    towerMats.set(key, new THREE.MeshStandardMaterial({ map: t, roughness: h > 45 ? 0.35 : 0.8, metalness: h > 45 ? 0.15 : 0 }))
  }
  const m = towerMats.get(key)!
  return (
    <group>
      <mesh material={[m, m, MAT.roofGrey, MAT.roofGrey, m, m]} position={[x, LAND_Y + h / 2, z]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
      </mesh>
    </group>
  )
}

function CoronadoBridge() {
  // the iconic curved, rising box-girder bridge from Barrio Logan to Coronado
  const segs = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(600, 4, -140),
      new THREE.Vector3(545, 14, 0),
      new THREE.Vector3(500, 30, 200),
      new THREE.Vector3(465, 37, 330),
      new THREE.Vector3(430, 30, 470),
      new THREE.Vector3(395, 14, 650),
      new THREE.Vector3(330, 4, 800),
    ])
    const n = 70
    const pts = curve.getSpacedPoints(n)
    return pts.slice(0, -1).map((a, i) => {
      const b = pts[i + 1]
      const mid = a.clone().add(b).multiplyScalar(0.5)
      const len = a.distanceTo(b)
      const heading = Math.atan2(b.x - a.x, b.z - a.z)
      const pitch = Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z))
      return { mid, len, heading, pitch, pier: i % 4 === 0 }
    })
  }, [])
  return (
    <group>
      {segs.map((sg, i) => (
        <group key={i} position={sg.mid} rotation={[0, sg.heading, 0]}>
          <mesh material={MAT.bridge} rotation={[-sg.pitch, 0, 0]} castShadow>
            <boxGeometry args={[9, 2.6, sg.len + 0.3]} />
          </mesh>
          <mesh material={MAT.white} rotation={[-sg.pitch, 0, 0]} position={[0, 1.45, 0]}>
            <boxGeometry args={[9.4, 0.35, sg.len + 0.3]} />
          </mesh>
          {sg.pier && sg.mid.y > 6 && (
            <>
              <mesh material={MAT.pier} position={[-2.6, -sg.mid.y / 2, 0]} castShadow>
                <boxGeometry args={[1.6, sg.mid.y, 2.4]} />
              </mesh>
              <mesh material={MAT.pier} position={[2.6, -sg.mid.y / 2, 0]} castShadow>
                <boxGeometry args={[1.6, sg.mid.y, 2.4]} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  )
}

function Midway() {
  // museum aircraft carrier moored along the downtown waterfront
  return (
    <group position={[-950, 0, 14]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh material={MAT.navy} position={[0, 2.5, 0]} castShadow>
        <boxGeometry args={[18, 9, 140]} />
      </mesh>
      <mesh material={MAT.navyDeck} position={[0, 7.2, 4]} castShadow>
        <boxGeometry args={[30, 0.8, 150]} />
      </mesh>
      <mesh material={MAT.navy} position={[11, 12, 10]} castShadow>
        <boxGeometry args={[5, 9, 22]} />
      </mesh>
      <mesh material={MAT.navy} position={[11, 18, 12]}>
        <boxGeometry args={[2, 6, 3]} />
      </mesh>
      {[-40, -20, 20, 50].map((z, i) => (
        <group key={i} position={[(i % 2 ? -1 : 1) * 6, 8.2, z]} rotation={[0, i * 0.6, 0]}>
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

function Quay({ x0, x1 }: { x0: number; x1: number }) {
  const bollards = []
  for (let x = x0 + 6; x < x1; x += 14) bollards.push(x)
  const fenders = []
  for (let x = x0 + 10; x < x1; x += 22) fenders.push(x)
  return (
    <group>
      {bollards.map((x) => (
        <mesh key={`b${x}`} material={MAT.dark} position={[x, LAND_Y + 0.35, -1]}>
          <cylinderGeometry args={[0.35, 0.45, 0.7, 8]} />
        </mesh>
      ))}
      {fenders.map((x) => (
        <mesh key={`f${x}`} material={MAT.fender} position={[x, LAND_Y - 1.2, 0.35]}>
          <boxGeometry args={[2.2, 2.4, 0.8]} />
        </mesh>
      ))}
      <mesh material={MAT.yellow} position={[(x0 + x1) / 2, LAND_Y + 0.03, -2.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[x1 - x0, 0.25]} />
      </mesh>
    </group>
  )
}

function Tamt() {
  const conc = useMemo(() => {
    const t = concrete().clone()
    t.needsUpdate = true
    t.repeat.set(30, 10)
    return std({ map: t })
  }, [])
  const coldSign = useMemo(() => std({ map: signText('COLD STORAGE', '#2f6bed', '#ffffff') }), [])
  const shedMat = useMemo(() => std({ map: windows('#f4f5fa', '#c7d3ea') }), [])
  const masts: [number, number][] = []
  for (const bx of [-205, 0, 205]) for (const z of [-40, -105]) masts.push([bx - 95, z], [bx + 95, z])
  return (
    <group>
      <Flat x={0} z={-108} w={672} d={214} m={conc} />
      <Quay x0={-335} x1={335} />
      {/* yard block outlines */}
      {BLOCKS.map((b) =>
        [0, 1, 2, 3, 4].map((r) => (
          <mesh key={`${b.id}${r}`} material={MAT.yellow} position={[b.cx, LAND_Y + 0.04, rowZ(r) + 2.9]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[YARD_STACKS * STACK_PITCH, 0.18]} />
          </mesh>
        )),
      )}
      {/* reefer power racks on block C rows 1-2 */}
      {[0, 1].map((r) =>
        Array.from({ length: 8 }, (_, k) => (
          <group key={`rk${r}${k}`} position={[205 - 91 + k * 26, LAND_Y, rowZ(r) - 2.9]}>
            <Box p={[0, 2.6, 0]} s={[0.3, 5.2, 0.3]} m={MAT.steel} />
            <Box p={[0, 5.1, 0]} s={[3, 0.3, 0.6]} m={MAT.steel} />
          </group>
        )),
      )}
      {/* light masts */}
      {masts.map(([x, z], i) => (
        <group key={i} position={[x, LAND_Y, z]}>
          <Box p={[0, 11, 0]} s={[0.5, 22, 0.5]} m={MAT.steel} />
          <Box p={[0, 22.3, 0]} s={[3.2, 0.8, 1.2]} m={MAT.white} />
        </group>
      ))}
      {/* transit sheds / cold storage */}
      <mesh material={[shedMat, shedMat, MAT.roofGrey, MAT.roofGrey, shedMat, shedMat]} position={[-225, LAND_Y + 6, -180]} castShadow receiveShadow>
        <boxGeometry args={[140, 12, 34]} />
      </mesh>
      <mesh material={[shedMat, shedMat, MAT.white, MAT.white, shedMat, shedMat]} position={[-50, LAND_Y + 7, -182]} castShadow receiveShadow>
        <boxGeometry args={[150, 14, 38]} />
      </mesh>
      <mesh material={coldSign} position={[-50, LAND_Y + 11, -162.9]}>
        <planeGeometry args={[30, 4]} />
      </mesh>
      <mesh material={[shedMat, shedMat, MAT.roofGrey, MAT.roofGrey, shedMat, shedMat]} position={[120, LAND_Y + 5.5, -180]} castShadow receiveShadow>
        <boxGeometry args={[120, 11, 34]} />
      </mesh>
      {/* bulk silos at the east end */}
      {[0, 1, 2, 3].map((k) => (
        <group key={k} position={[248 + (k % 2) * 16, LAND_Y, -168 - Math.floor(k / 2) * 18]}>
          <mesh material={MAT.silo} position={[0, 16, 0]} castShadow>
            <cylinderGeometry args={[7, 7, 32, 24]} />
          </mesh>
          <mesh material={MAT.roofGrey} position={[0, 33, 0]}>
            <coneGeometry args={[7.2, 3, 24]} />
          </mesh>
        </group>
      ))}
      <Box p={[300, LAND_Y + 20, -176]} s={[6, 40, 6]} m={MAT.steel} />
      {/* gate canopy */}
      <group position={[-322, LAND_Y, -120]}>
        <Box p={[0, 6, 0]} s={[14, 0.6, 40]} m={MAT.white} />
        {[-16, -6, 4, 14].map((z) => (
          <Box key={z} p={[0, 3, z]} s={[0.6, 6, 0.6]} m={MAT.steel} />
        ))}
      </group>
      {/* rail spur */}
      {[-0.8, 0.8].map((o) => (
        <Box key={o} p={[0, LAND_Y + 0.12, -207 + o]} s={[680, 0.2, 0.25]} m={MAT.rail} cast={false} />
      ))}
      <mesh material={MAT.logo} position={[0, LAND_Y + 14.1, -182]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 14]} />
      </mesh>
    </group>
  )
}

function Ncmt() {
  const conc = useMemo(() => {
    const t = concrete().clone()
    t.needsUpdate = true
    t.repeat.set(24, 10)
    return std({ map: t })
  }, [])
  const shed = useMemo(() => std({ map: windows('#f4f5fa', '#c7d3ea') }), [])
  const sign = useMemo(() => std({ map: signText('NATIONAL CITY MARINE TERMINAL', '#ffffff', '#2f6bed', 1024) }), [])
  return (
    <group>
      <Flat x={1175} z={-130} w={600} d={262} m={conc} />
      <Quay x0={880} x1={1470} />
      <mesh material={[shed, shed, MAT.white, MAT.white, shed, shed]} position={[1000, LAND_Y + 7, -238]} castShadow receiveShadow>
        <boxGeometry args={[160, 14, 30]} />
      </mesh>
      <mesh material={sign} position={[1000, LAND_Y + 11, -222.9]}>
        <planeGeometry args={[60, 5.6]} />
      </mesh>
      {/* multi-level vehicle processing deck */}
      <group position={[1340, LAND_Y, -228]}>
        {[0, 1, 2, 3].map((k) => (
          <Box key={k} p={[0, 1 + k * 3.4, 0]} s={[110, 0.6, 40]} m={MAT.roofGrey} />
        ))}
        {[-50, -15, 15, 50].map((x) => [-17, 17].map((z) => <Box key={`${x}${z}`} p={[x, 6, z]} s={[1.2, 12, 1.2]} m={MAT.steel} />))}
      </group>
      {/* lot stripes */}
      {Array.from({ length: 10 }, (_, k) => (
        <mesh key={k} material={MAT.roadLine} position={[1175, LAND_Y + 0.04, -40 - k * 17]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[560, 0.2]} />
        </mesh>
      ))}
    </group>
  )
}

function CruiseTerminal() {
  const shed = useMemo(() => std({ map: windows('#f7f8fc', '#bcd0f0') }), [])
  const sign = useMemo(() => std({ map: signText('B STREET CRUISE TERMINAL', '#2f6bed', '#ffffff', 1024) }), [])
  return (
    <group>
      <Flat x={-1250} z={-40} w={190} d={78} m={MAT.white} />
      <Quay x0={-1345} x1={-1155} />
      <mesh material={[shed, shed, MAT.white, MAT.white, shed, shed]} position={[-1250, LAND_Y + 5, -38]} castShadow receiveShadow>
        <boxGeometry args={[150, 10, 26]} />
      </mesh>
      <mesh material={MAT.white} position={[-1250, LAND_Y + 10, -38]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[13, 13, 150, 24, 1, false, 0, Math.PI]} />
      </mesh>
      <mesh material={sign} position={[-1250, LAND_Y + 6, -24.9]}>
        <planeGeometry args={[52, 4.8]} />
      </mesh>
      {/* convention center with its sail roof */}
      <mesh material={MAT.white} position={[-590, LAND_Y + 7, -55]} castShadow receiveShadow>
        <boxGeometry args={[330, 14, 50]} />
      </mesh>
      {[-700, -620, -540].map((x) => (
        <mesh key={x} material={MAT.white} position={[x, LAND_Y + 18, -55]} castShadow>
          <coneGeometry args={[9, 12, 4]} />
        </mesh>
      ))}
    </group>
  )
}

function CoronadoSide() {
  const houses = useMemo(() => {
    const out: [number, number, number][] = []
    for (let x = -1400; x < 900; x += 22)
      for (let z = 760; z < 1200; z += 22) if (rnd() > 0.35 && !(x < -300 && z < 1000)) out.push([x + rnd() * 6, z + rnd() * 6, rnd()])
    return out
  }, [])
  const set = (mesh: THREE.InstancedMesh | null, roof: boolean) => {
    if (!mesh) return
    const m = new THREE.Matrix4()
    houses.forEach(([x, z, r], i) => {
      const w = 9 + r * 6
      m.compose(new THREE.Vector3(x, 1.6 + (roof ? 5.2 : 2.5), z), new THREE.Quaternion(), new THREE.Vector3(w, roof ? 0.8 : 5, w * 0.8))
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
  }
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  return (
    <group>
      <instancedMesh ref={(m) => set(m, false)} args={[box, MAT.white, houses.length]} castShadow receiveShadow />
      <instancedMesh ref={(m) => set(m, true)} args={[box, MAT.roofRed, houses.length]} castShadow />
      {/* North Island runway + hangars */}
      <Flat x={-1500} z={860} w={1400} d={50} m={MAT.runway} y={1.62} />
      <Flat x={-1000} z={980} w={60} d={500} m={MAT.runway} y={1.63} />
      {[-2000, -1880, -1760, -1640].map((x) => (
        <mesh key={x} material={MAT.navy} position={[x, 1.6 + 6, 770]} castShadow>
          <boxGeometry args={[80, 12, 40]} />
        </mesh>
      ))}
      {/* Hotel del Coronado */}
      <group position={[300, 1.6, 1180]}>
        <Box p={[0, 6, 0]} s={[90, 12, 30]} m={MAT.white} />
        <mesh material={MAT.roofRed} position={[0, 15, 0]} castShadow>
          <coneGeometry args={[14, 10, 4]} />
        </mesh>
        <Box p={[0, 12.5, 0]} s={[92, 1.4, 32]} m={MAT.roofRed} />
      </group>
    </group>
  )
}

function PointLoma() {
  return (
    <group>
      {[
        [-3200, -60, 260, 34],
        [-2950, -240, 300, 46],
        [-3400, -360, 260, 40],
        [-2650, -120, 220, 26],
      ].map(([x, z, r, h], i) => (
        <mesh key={i} material={MAT.hill} position={[x, LAND_Y, z]} scale={[r, h, r * 0.8]} castShadow receiveShadow>
          <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      ))}
      {/* lighthouse */}
      <group position={[-3150, LAND_Y + 30, 120]}>
        <Box p={[0, 6, 0]} s={[3, 12, 3]} m={MAT.white} />
        <Box p={[0, 12.8, 0]} s={[4, 1.6, 4]} m={MAT.dark} />
      </group>
    </group>
  )
}

function Roads() {
  return (
    <group>
      <Flat x={0} z={-232} w={9000} d={14} m={MAT.road} y={LAND_Y + 0.015} />
      <Flat x={-1000} z={-20} w={1400} d={10} m={MAT.road} y={LAND_Y + 0.015} />
      <Flat x={900} z={-560} w={20} d={600} m={MAT.road} y={LAND_Y + 0.015} />
      <Flat x={-380} z={-480} w={16} d={500} m={MAT.road} y={LAND_Y + 0.015} />
      {/* tug pier */}
      <Box p={[425, LAND_Y - 0.2, 20]} s={[60, 1.2, 8]} m={MAT.pier} cast={false} />
    </group>
  )
}

export function Land() {
  const mainland = useLand(MAINLAND, LAND_Y)
  const coronado = useLand(CORONADO, 1.6)
  const trees = useMemo(() => {
    const out: [number, number, number, number][] = []
    // waterfront park (Cesar Chavez) and street trees
    for (let x = 345; x < 470; x += 9) for (let z = -10; z > -60; z -= 11) out.push([x + rnd() * 4, z, 0.7 + rnd() * 0.5, LAND_Y])
    for (let x = -1700; x < -360; x += 24) out.push([x, -12, 0.7 + rnd() * 0.4, LAND_Y])
    for (let x = -340; x < 4000; x += 18) out.push([x + rnd() * 4, -243, 0.7 + rnd() * 0.4, LAND_Y])
    // Coronado
    for (let i = 0; i < 360; i++) out.push([-1600 + rnd() * 3400, 740 + rnd() * 600, 0.7 + rnd() * 0.7, 1.6])
    // Point Loma
    for (let i = 0; i < 160; i++) out.push([-3600 + rnd() * 1200, -700 + rnd() * 820, 0.8 + rnd() * 0.6, LAND_Y + 6])
    return out
  }, [])
  return (
    <group>
      <mesh geometry={mainland} material={[MAT.land, MAT.wall]} receiveShadow />
      <mesh geometry={coronado} material={[MAT.coronado, MAT.beach]} receiveShadow />
      <Roads />
      <Tamt />
      <Ncmt />
      <CruiseTerminal />
      <Midway />
      <CityBlocks />
      <CoronadoBridge />
      <CoronadoSide />
      <PointLoma />
      <Trees pts={trees} />
    </group>
  )
}
