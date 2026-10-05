
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

/** Polyline with each corner replaced by a quadratic arc – smooth, and it never bulges outside the corner. */
function filleted(group: Vec[], radius = 90): Vec[] {
  const out: Vec[] = []
  const pushLine = (a: Vec, b: Vec) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / SPACING))
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n })
  }
  let cursor = group[0]
  for (let i = 1; i < group.length - 1; i++) {
    const A = group[i - 1]
    const B = group[i]
    const C = group[i + 1]
    const ab = Math.hypot(B.x - A.x, B.z - A.z) || 1
    const bc = Math.hypot(C.x - B.x, C.z - B.z) || 1
    const t = Math.min(radius, ab / 2, bc / 2)
    const p1 = { x: B.x - ((B.x - A.x) / ab) * t, z: B.z - ((B.z - A.z) / ab) * t }
    const p2 = { x: B.x + ((C.x - B.x) / bc) * t, z: B.z + ((C.z - B.z) / bc) * t }
    pushLine(cursor, p1)
    const n = Math.max(2, Math.ceil((2 * t) / SPACING))
    for (let k = 1; k <= n; k++) {
      const u = k / n
      out.push({
        x: (1 - u) * (1 - u) * p1.x + 2 * (1 - u) * u * B.x + u * u * p2.x,
        z: (1 - u) * (1 - u) * p1.z + 2 * (1 - u) * u * B.z + u * u * p2.z,
      })
    }
    cursor = p2
  }
  pushLine(cursor, group[group.length - 1])
  return out
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
      pts = filleted(group)
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
  // a zero target (e.g. holding for traffic) lets the mover come to a full stop
  if (target <= 0.01 && m.speed < 0.05) m.speed = 0
  let remaining = (target <= 0.01 ? Math.max(0, m.speed) : Math.max(m.speed, 0.4)) * dt
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
