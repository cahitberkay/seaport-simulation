import { PORTS, HOME, PORT } from '../sim/world'
import type { Port } from '../sim/world'

// Schematic Pacific map (equirectangular, Pacific-centred). Coastlines are deliberately simplified.
const W = 300
const H = 160
const LON0 = 100
const LON1 = 295
const LAT0 = 62
const LAT1 = -25

const X = (lon: number) => ((((lon + 360) % 360) - LON0) / (LON1 - LON0)) * W
const Y = (lat: number) => ((LAT0 - lat) / (LAT0 - LAT1)) * H

const AMERICAS: [number, number][] = [
  [64, -150], [60, -146], [58, -136], [54, -130], [49, -125], [46, -124], [42, -124.3], [38, -123], [34.5, -120.6], [34, -118.5],
  [32.7, -117.2], [30, -115.8], [27.5, -114.5], [24.5, -112], [23, -110], [20.5, -105.3], [18, -102], [16, -97], [15, -93],
  [13.5, -90.5], [12.5, -87.5], [11, -85.7], [9.5, -84.5], [8, -82.5], [8.5, -79.5], [7, -78], [4, -77.4], [1, -79],
  [-2.5, -80.5], [-6, -81], [-12, -77.2], [-18, -70.5], [-25, -70.6], [-30, -71.5], [-30, -60], [64, -60],
]
const ASIA: [number, number][] = [
  [64, 175], [60, 165], [59, 150], [59, 143], [54, 141], [50, 140.5], [43, 132], [39, 128], [35, 129], [34.7, 126.5],
  [37.5, 126.5], [39, 124], [40, 122], [37.5, 119], [35, 119.5], [31, 122], [27, 120.2], [23, 117], [22, 113.5], [21, 110],
  [18, 106], [12, 109], [9, 105], [10, 100], [-25, 100], [64, 100],
]
const JAPAN: [number, number][] = [
  [45.5, 141.9], [43, 145.5], [41.4, 141.4], [39, 142], [35.5, 140.8], [34.6, 138.2], [33.5, 135.8], [34, 132.5], [31, 130.5],
  [33.5, 129.5], [35.5, 132.8], [38, 139.5], [41.5, 140], [43, 140.3],
]
const PHILIPPINES: [number, number][] = [[18.5, 121], [14, 124], [10, 126], [7, 126], [9, 123], [12, 120], [16, 120]]
const TAIWAN: [number, number][] = [[25.3, 121.5], [22, 120.8], [23.5, 120.1]]
const AUS: [number, number][] = [[-11, 131], [-12, 137], [-11, 142], [-18, 146], [-25, 153], [-25, 113], [-21, 114], [-14, 126]]
const PNG: [number, number][] = [[-2, 131], [-1, 138], [-3, 141], [-6, 147], [-10, 150], [-8, 143], [-6, 139], [-4, 133]]

const poly = (pts: [number, number][]) => pts.map(([lat, lon]) => `${X(lon).toFixed(1)},${Y(lat).toFixed(1)}`).join(' ')

function arc(a: Port, b: Port) {
  const x1 = X(a.lon)
  const y1 = Y(a.lat)
  const x2 = X(b.lon)
  const y2 = Y(b.lat)
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2 - Math.min(26, Math.abs(x2 - x1) * 0.18)
  return { d: `M${x1},${y1} Q${mx},${my} ${x2},${y2}`, x1, y1, x2, y2, mx, my }
}

/** progress 0..1 along the inbound leg, or 1..2 along the outbound leg */
export function RouteMap({ prev, next, progress }: { prev: string; next: string; progress: number }) {
  const a = PORTS[prev]
  const sd = HOME
  const b = PORTS[next]
  const inLeg = arc(a, sd)
  const outLeg = arc(sd, b)
  const leg = progress <= 1 ? inLeg : outLeg
  const t = progress <= 1 ? progress : progress - 1
  const px = (1 - t) ** 2 * leg.x1 + 2 * (1 - t) * t * leg.mx + t * t * leg.x2
  const py = (1 - t) ** 2 * leg.y1 + 2 * (1 - t) * t * leg.my + t * t * leg.y2
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="routemap" role="img" aria-label={`Route ${a.name} to ${PORT.short} to ${b.name}`}>
      <rect width={W} height={H} rx="10" className="rm-sea" />
      {[0, 30].map((lat) => (
        <line key={lat} x1="0" x2={W} y1={Y(lat)} y2={Y(lat)} className="rm-grid" />
      ))}
      {[150, 180, 210, 240, 270].map((lon) => (
        <line key={lon} y1="0" y2={H} x1={X(lon)} x2={X(lon)} className="rm-grid" />
      ))}
      {[AMERICAS, ASIA, JAPAN, PHILIPPINES, TAIWAN, AUS, PNG].map((p, i) => (
        <polygon key={i} points={poly(p)} className="rm-land" />
      ))}
      <path d={inLeg.d} className="rm-in" />
      <path d={outLeg.d} className="rm-out" />
      {[a, b].map((p) => (
        <g key={p.code}>
          <circle cx={X(p.lon)} cy={Y(p.lat)} r="3" className="rm-port" />
          <text x={X(p.lon) + 5} y={Y(p.lat) + 3} className="rm-label">
            {p.name}
          </text>
        </g>
      ))}
      <circle cx={X(sd.lon)} cy={Y(sd.lat)} r="4.5" className="rm-hub" />
      <text x={X(sd.lon) - 5} y={Y(sd.lat) - 7} textAnchor="end" className="rm-label rm-strong">
        {PORT.short}
      </text>
      <circle cx={px} cy={py} r="5" className="rm-ship" />
    </svg>
  )
}
