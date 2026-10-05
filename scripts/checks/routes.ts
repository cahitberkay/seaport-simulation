// Headless check: every berth's arrival/departure route and the channel lanes stay clear of land and breakwaters.
// npx tsx scripts/checks/routes.ts long-beach
import { readFileSync } from 'node:fs'
import { setPortId } from '../../src/ports/registry'
import type { PortId } from '../../src/ports/registry'

const port = (process.argv[2] ?? 'long-beach') as PortId
setPortId(port)
const geo = await import('../../src/sim/geo')
geo.setGeo(JSON.parse(readFileSync(new URL(`../../src/data/${port === 'long-beach' ? 'geo-lb' : 'geo'}.json`, import.meta.url), 'utf8')))
const W = await import('../../src/sim/world')
const { buildPath } = await import('../../src/sim/path')
type V = { x: number; z: number }

const segs: [V, V][] = []
for (const b of geo.GEO.breakwaters) for (let i = 0; i < b.c.length - 1; i++) segs.push([{ x: b.c[i][0], z: b.c[i][1] }, { x: b.c[i + 1][0], z: b.c[i + 1][1] }])
const dSeg = (p: V, a: V, b: V) => {
  const dx = b.x - a.x, dz = b.z - a.z
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t)
}
const blocked = (p: V) => geo.isLand(p.x, p.z) || segs.some(([a, b]) => dSeg(p, a, b) < 4)

function sweep(name: string, path: { x: number; z: number; rev?: boolean; hold?: boolean }[], L: number, B0: number, startHeading?: number) {
  const B = B0 * 0.9
  let heading = startHeading ?? 0
  let hits = 0
  const where: string[] = []
  for (let i = 1; i < path.length; i += 3) {
    const p = path[i], q = path[i - 1]
    if (!p.hold && Math.hypot(p.x - q.x, p.z - q.z) > 1e-3) heading = Math.atan2(p.x - q.x, p.z - q.z) + (p.rev ? Math.PI : 0)
    const fx = Math.sin(heading), fz = Math.cos(heading)
    for (const k of [-0.5, -0.25, 0, 0.25, 0.5])
      for (const s of [-0.5, 0, 0.5]) {
        const pt = { x: p.x + fx * L * k * 0.96 + fz * B * s, z: p.z + fz * L * k * 0.96 - fx * B * s }
        if (blocked(pt)) {
          hits++
          if (where.length < 4) where.push(`(${pt.x.toFixed(0)},${pt.z.toFixed(0)})`)
        }
      }
  }
  console.log(`${hits ? '✗' : '✓'} ${name}${hits ? `  ${hits} hull samples on land/breakwater e.g. ${where.join(' ')}` : ''}`)
  return hits
}

let total = 0
const big = W.SHIP_CLASSES.ulcv
const n = W.CHANNEL.length - 1
total += sweep('inbound lane', buildPath(W.inboundLane(0, 0)[0], W.inboundLane(1, n)), big.length, big.beam)
total += sweep('outbound lane', buildPath(W.outboundLane(n, n)[0], [...W.outboundLane(n - 1, 0), W.EXIT]), big.length, big.beam)
for (const b of W.BERTHS) {
  if (!b.arrival(10, 80).length) continue
  for (const kind of b.kinds) {
    const c = W.SHIP_CLASSES[kind]
    const lanePt = W.inboundLane(b.junction, b.junction)[0]
    const start = b.wait ?? lanePt
    const prev = b.wait ? lanePt : W.inboundLane(b.junction - 1, b.junction - 1)[0]
    if (b.wait) total += sweep(`${b.id} to waiting spot (${kind})`, buildPath(W.inboundLane(b.junction - 1, b.junction - 1)[0], [lanePt, b.wait]), c.length, c.beam)
    const arr = buildPath(start, b.arrival(c.beam, c.length))
    total += sweep(`${b.id} arrival (${kind})`, arr, c.length, c.beam, Math.atan2(start.x - prev.x, start.z - prev.z))
    const pose = b.pose(c.beam, c.length)
    const dep = buildPath(pose, b.departure(c.beam, c.length))
    const end = dep[dep.length - 1]
    const out = buildPath(end, W.outboundLane(W.outboundEntry(end.x, end.z, b.junction), 1))
    total += sweep(`${b.id} departure (${kind})`, [...dep, ...out], c.length, c.beam, pose.heading)
    // moored hull itself
    total += sweep(`${b.id} moored (${kind})`, [{ ...pose, hold: true }, { ...pose, hold: true }], c.length, c.beam, pose.heading)
  }
}
for (let i = 0; i < 8; i++) {
  const a = buildPath(W.SEA_SPAWN, W.anchorageIn(i, W.SEA_SPAWN))
  total += sweep(`anchorage ${i + 1} in`, a, big.length, big.beam)
  const o = buildPath(W.anchorage(i), [...W.anchorageOut(i), ...W.inboundLane(W.PORT.anchorJoin, W.PORT.anchorJoin + 1)])
  total += sweep(`anchorage ${i + 1} out`, o, big.length, big.beam)
}
console.log(total ? `\n${total} problem samples` : '\nall routes clear')
