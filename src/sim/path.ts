import { CatmullRomCurve3, Vector3 } from 'three'

export interface Vec {
  x: number
  z: number
}

export interface Waypoint extends Vec {
  rev?: boolean
  /** keep the current heading while moving (lateral push by tugs) */
  hold?: boolean
}

/** A dense point on a followed path; `remain` is the distance left until the next stop/cusp. */
export interface PathPoint extends Vec {
  rev: boolean
  hold: boolean
  remain: number
}

export interface Mover {
  pos: Vec
  heading: number
  path: PathPoint[]
  speed: number
  finalHeading?: number
}

const SPACING = 0.8

export function lerpAngle(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

/**
 * Turn sparse waypoints into a dense, smooth polyline. Consecutive waypoints with the
 * same direction (forward/reverse) form one Catmull-Rom curve; a direction change is a cusp.
 */
export function buildPath(start: Vec, wps: Waypoint[]): PathPoint[] {
  const out: PathPoint[] = []
  let cursor: Vec = { ...start }
  let i = 0
  while (i < wps.length) {
    const rev = !!wps[i].rev
    const hold = !!wps[i].hold
    const group: Vec[] = [cursor]
    while (i < wps.length && !!wps[i].rev === rev && !!wps[i].hold === hold) {
      const p = wps[i]
      const last = group[group.length - 1]
      if (Math.hypot(p.x - last.x, p.z - last.z) > 0.05) group.push(p)
      i++
    }
    if (group.length < 2) continue
    let pts: Vec[]
    if (group.length === 2) {
      const [a, b] = group
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / SPACING))
      pts = []
      for (let k = 1; k <= n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n })
    } else {
      const curve = new CatmullRomCurve3(
        group.map((p) => new Vector3(p.x, 0, p.z)),
        false,
        'centripetal',
      )
      const n = Math.max(2, Math.ceil(curve.getLength() / SPACING))
      pts = curve.getSpacedPoints(n).slice(1).map((v) => ({ x: v.x, z: v.z }))
    }
    // distance-to-cusp for braking
    const seg: PathPoint[] = pts.map((p) => ({ ...p, rev, hold, remain: 0 }))
    let acc = 0
    for (let k = seg.length - 1; k >= 0; k--) {
      seg[k].remain = acc
      const prev = k > 0 ? seg[k - 1] : cursor
      acc += Math.hypot(seg[k].x - prev.x, seg[k].z - prev.z)
    }
    out.push(...seg)
    cursor = group[group.length - 1]
  }
  return out
}

/** Advance a mover along its path. Returns true on the frame the path completes. */
export function follow(
  m: Mover,
  dt: number,
  speedFor: (p: PathPoint) => number,
  turnRate = 12,
  brake = 1.1,
): boolean {
  if (!m.path.length) {
    m.speed = 0
    if (m.finalHeading !== undefined) m.heading = lerpAngle(m.heading, m.finalHeading, 1 - Math.exp(-6 * dt))
    return false
  }
  const head = m.path[0]
  const target = Math.min(speedFor(head), 0.6 + head.remain * brake)
  m.speed += (target - m.speed) * (1 - Math.exp(-3 * dt))
  let remaining = Math.max(m.speed, 0.4) * dt
  let desired: number | null = null
  while (remaining > 0 && m.path.length) {
    const wp = m.path[0]
    const dx = wp.x - m.pos.x
    const dz = wp.z - m.pos.z
    const dist = Math.hypot(dx, dz)
    if (dist > 1e-5 && !wp.hold) desired = Math.atan2(dx, dz) + (wp.rev ? Math.PI : 0)
    if (dist <= remaining) {
      m.pos.x = wp.x
      m.pos.z = wp.z
      remaining -= dist
      m.path.shift()
    } else {
      m.pos.x += (dx / dist) * remaining
      m.pos.z += (dz / dist) * remaining
      remaining = 0
    }
  }
  if (desired !== null) m.heading = lerpAngle(m.heading, desired, 1 - Math.exp(-turnRate * dt))
  return m.path.length === 0
}
