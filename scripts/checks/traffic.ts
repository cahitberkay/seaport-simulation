// Headless traffic run: hull-to-hull overlaps between ships and moving hulls touching land.
// npx tsx scripts/checks/traffic.ts long-beach 30   (sim hours)
import { readFileSync } from 'node:fs'
import { setPortId } from '../../src/ports/registry'
import type { PortId } from '../../src/ports/registry'

const port = (process.argv[2] ?? 'long-beach') as PortId
const hours = Number(process.argv[3] ?? 24)
setPortId(port)
const geo = await import('../../src/sim/geo')
geo.setGeo(JSON.parse(readFileSync(new URL(`../../src/data/${port === 'long-beach' ? 'geo-lb' : 'geo'}.json`, import.meta.url), 'utf8')))
const { sim, initSim, stepSim } = await import('../../src/sim/sim')
type S = (typeof sim.ships)[number]

function corners(s: S, k = 0.92) {
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading)
  const L = (s.cls.length / 2) * k, B = (s.cls.beam / 2) * k
  return [[L, B], [L, -B], [-L, -B], [-L, B]].map(([a, b]) => ({ x: s.pos.x + fx * a + fz * b, z: s.pos.z + fz * a - fx * b }))
}
function overlap(a: S, b: S) {
  if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > (a.cls.length + b.cls.length) / 2) return false
  const ca = corners(a), cb = corners(b)
  for (const poly of [ca, cb])
    for (let i = 0; i < 4; i++) {
      const p = poly[i], q = poly[(i + 1) % 4]
      const nx = -(q.z - p.z), nz = q.x - p.x
      const pa = ca.map((c) => c.x * nx + c.z * nz), pb = cb.map((c) => c.x * nx + c.z * nz)
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false
    }
  return true
}
const MOVING = ['inbound', 'outbound', 'approach', 'berthing', 'unberthing']
initSim()
sim.speed = 16
const start = sim.time
const collisions = new Map<string, string>()
const land = new Map<string, string>()
let departed = 0
const seen = new Set<string>()
let steps = 0
while (sim.time - start < hours * 60) {
  stepSim(0.1)
  steps++
  if (steps % 2) continue
  for (const s of sim.ships) if (s.state === 'outbound') seen.add(s.id)
  const ships = sim.ships
  for (let i = 0; i < ships.length; i++)
    for (let j = i + 1; j < ships.length; j++) {
      const a = ships[i], b = ships[j]
      if (!MOVING.includes(a.state) && !MOVING.includes(b.state)) continue
      if (overlap(a, b)) {
        const key = [a.name, b.name].sort().join(' × ')
        if (!collisions.has(key)) collisions.set(key, `t=${(sim.time - start).toFixed(0)}min ${a.name}(${a.state},${a.berthId}) ${b.name}(${b.state},${b.berthId}) at ${a.pos.x.toFixed(0)},${a.pos.z.toFixed(0)}`)
      }
    }
  for (const s of ships) {
    if (!MOVING.includes(s.state)) continue
    const hit = corners(s, 0.8).find((c) => geo.isLand(c.x, c.z))
    if (hit && !land.has(s.name)) land.set(s.name, `${s.name} ${s.state} ${s.berthId} at ${hit.x.toFixed(0)},${hit.z.toFixed(0)}`)
  }
}
departed = seen.size
console.log('sim hours', hours, 'departed', departed, 'ships now', sim.ships.length, 'anchored', sim.ships.filter((s) => s.state === 'anchored').length)
console.log('states', JSON.stringify(sim.ships.reduce((m, s) => ((m[s.state] = (m[s.state] ?? 0) + 1), m), {} as Record<string, number>)))
console.log('collisions', [...collisions.values()])
console.log('land contacts (moving)', [...land.values()])
if (process.argv.includes('--dump'))
  for (const s of sim.ships)
    console.log(s.name.padEnd(22), s.state.padEnd(11), s.berthId.padEnd(5), `v=${s.speed.toFixed(1)}`, `cap=${s.speedCap}`, `by=${sim.ships.find((o) => o.id === s.blockedBy)?.name ?? ''}`, `pos=${s.pos.x.toFixed(0)},${s.pos.z.toFixed(0)}`, `path=${s.path.length}`, `lock=${Object.entries(sim.locks).filter(([, v]) => v === s.id).map(([k]) => k).join()}`)
