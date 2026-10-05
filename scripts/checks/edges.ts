// For each quay frame: where the water starts (local z) along the quay (local x).
import { readFileSync } from 'node:fs'
import { setPortId } from '../../src/ports/registry'
setPortId('long-beach')
const geo = await import('../../src/sim/geo')
geo.setGeo(JSON.parse(readFileSync(new URL('../../src/data/geo-lb.json', import.meta.url), 'utf8')))
const { frame, toWorldF } = await import('../../src/ports/kit')
const frames: Record<string, [number, number, number, number]> = {
  LBCT: [-178, -706, -178, -57], TTI: [-1555.5, -67.3, -755.5, -349.3], ITS: [300, 344, 720, 344], PCT: [690, 517, 340, 517], PIERF: [-219.8, 234.1, 110.2, 502.5], PIERH: [1062, 30, 1062, -170],
}
for (const [name, a] of Object.entries(frames)) {
  const f = frame(...a)
  const half = Math.hypot(a[2] - a[0], a[3] - a[1]) / 2
  const row: string[] = []
  for (let lx = -Math.round(half / 25) * 25; lx <= half + 1; lx += 25) {
    // first water going seaward from 30 inland, and where land resumes beyond
    let z0 = NaN, z1 = NaN
    for (let lz = -120; lz < 400; lz += 1) {
      const w = toWorldF(f, lx, lz)
      const land = geo.isLand(w.x, w.z)
      if (isNaN(z0) && !land) z0 = lz
      else if (!isNaN(z0) && land) { z1 = lz; break }
    }
    row.push(`${lx}:${z0}..${isNaN(z1) ? '∞' : z1}`)
  }
  console.log(name, row.join('  '))
}
