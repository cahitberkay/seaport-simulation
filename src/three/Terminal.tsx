import { useMemo } from 'react'
import * as THREE from 'three'
import { sim } from '../sim/sim'
import { useUI } from '../store'
import { LAND_Y, CT_FRAME, PORT, BLOCKS, YARD_STACKS, STACK_PITCH, rowZ, FRONT_OFFSET } from '../sim/world'
import { concrete } from './textures'
import { CraneModel, StsModel, RtgModel, HandlerModel, LooseContainers, YardContainers, Laydown } from './Equipment'

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...p })
const MAT = {
  yellow: std({ color: '#f3c74d' }),
  white: std({ color: '#f6f7fb' }),
  steel: std({ color: '#9aa3b8', metalness: 0.3, roughness: 0.5 }),
  dark: std({ color: '#3a4256' }),
  fender: std({ color: '#262b38' }),
}

function Apron() {
  const conc = useMemo(() => {
    const t = concrete().clone()
    t.needsUpdate = true
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(24, 5)
    return std({ map: t })
  }, [])
  // the terminal pavement follows the terminal outline (shape y = metres inland)
  const apron = PORT.ct.apron
  const x0 = Math.min(...apron.map((p) => p[0]))
  const x1 = Math.max(...apron.filter((p) => p[1] === 0).map((p) => p[0]))
  const geo = useMemo(() => {
    const s = new THREE.Shape(apron.map(([x, y]) => new THREE.Vector2(x, y)))
    const g = new THREE.ShapeGeometry(s)
    g.rotateX(-Math.PI / 2)
    g.translate(0, LAND_Y + 0.025, 0)
    return g
  }, [])
  const bollards = []
  for (let x = x0 + 6; x < x1; x += 14) bollards.push(x)
  return (
    <group>
      <mesh geometry={geo} material={conc} receiveShadow />
      {bollards.map((x) => (
        <mesh key={x} material={MAT.dark} position={[x, LAND_Y + 0.35, -1]}>
          <cylinderGeometry args={[0.35, 0.45, 0.7, 8]} />
        </mesh>
      ))}
      {bollards.filter((_, i) => i % 2 === 0).map((x) => (
        <mesh key={`f${x}`} material={MAT.fender} position={[x + 5, LAND_Y - 1.2, 0.35]}>
          <boxGeometry args={[2.2, 2.4, 0.8]} />
        </mesh>
      ))}
      <mesh material={MAT.yellow} position={[(x0 + x1) / 2, LAND_Y + 0.04, -2.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[x1 - x0 - 4, 0.25]} />
      </mesh>
      {PORT.ct.crane === 'sts' &&
        [-2, -17].map((z) => (
          <mesh key={`rail${z}`} material={MAT.steel} position={[(x0 + x1) / 2, LAND_Y + 0.06, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[x1 - x0 - 4, 0.5]} />
          </mesh>
        ))}
      {BLOCKS.map((b) =>
        [0, 1, 2].map((r) => (
          <mesh key={`${b.id}${r}`} material={MAT.yellow} position={[b.cx, LAND_Y + 0.04, rowZ(r) + FRONT_OFFSET + 0.9]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[YARD_STACKS * STACK_PITCH, 0.18]} />
          </mesh>
        )),
      )}
      {/* reefer power racks on block B row 1 */}
      {Array.from({ length: 7 }, (_, k) => (
        <group key={k} position={[BLOCKS[1].cx - 60 + k * 20, LAND_Y, rowZ(0) - FRONT_OFFSET - 4.6]}>
          <mesh material={MAT.steel} position={[0, 2.6, 0]}>
            <boxGeometry args={[0.3, 5.2, 0.3]} />
          </mesh>
          <mesh material={MAT.steel} position={[0, 5.1, 0]}>
            <boxGeometry args={[3, 0.3, 0.6]} />
          </mesh>
        </group>
      ))}
      {/* light masts */}
      {PORT.ct.lights.map((x) => (
        <group key={x} position={[x, LAND_Y, -38]}>
          <mesh material={MAT.steel} position={[0, 11, 0]}>
            <boxGeometry args={[0.5, 22, 0.5]} />
          </mesh>
          <mesh material={MAT.white} position={[0, 22.3, 0]}>
            <boxGeometry args={[3.2, 0.8, 1.2]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Equipment() {
  useUI((s) => s.tick)
  return (
    <>
      {sim.cranes.map((c) => (PORT.ct.crane === 'sts' ? <StsModel key={c.id} crane={c} /> : <CraneModel key={c.id} crane={c} />))}
      {sim.rtgs.map((g) => (
        <RtgModel key={g.id} g={g} />
      ))}
      {sim.handlers.map((h) => (
        <HandlerModel key={h.id} h={h} />
      ))}
      <LooseContainers />
    </>
  )
}

/** the fully simulated terminal (TAMT / LBCT), drawn in its own quay-aligned frame */
export function Terminal() {
  return (
    <group position={[CT_FRAME.ox, 0, CT_FRAME.oz]} rotation={[0, CT_FRAME.rot, 0]}>
      <Apron />
      <YardContainers />
      <Laydown />
      <Equipment />
    </group>
  )
}
