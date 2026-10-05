// OpenStreetMap-derived geography (see scripts/process.py). Data © OpenStreetMap contributors, ODbL.
import raw from '../data/geo.json'

export type XZ = [number, number]

export interface GeoBuilding {
  p: XZ[]
  h: number
  t: string
  n?: string
  housenumber?: string
  street?: string
  operator?: string
  levels?: string
  amenity?: string
  tourism?: string
  shop?: string
  office?: string
  website?: string
}
export interface GeoParking {
  p: XZ[]
  a: number
  n: string
  cap?: string
  fee?: string
  op?: string
}
export interface GeoMarina {
  p: XZ[]
  n: string
}
export interface GeoPier {
  c: XZ[]
  closed: boolean
  n?: string
  float?: boolean
}
export interface GeoRunway {
  c: XZ[]
  w: number
  ref: string
}
export interface GeoPoi {
  n: string
  k: string
  x: number
  z: number
  w?: string
  d?: string
  artist?: string
}

interface GeoData {
  origin: { lat: number; lon: number; unitM: number }
  land: XZ[][][]
  buildings: GeoBuilding[]
  parking: GeoParking[]
  marinas: GeoMarina[]
  piers: GeoPier[]
  breakwaters: GeoPier[]
  runways: GeoRunway[]
  pois: GeoPoi[]
  bridge: XZ[]
  attribution: string
}

export const GEO = raw as unknown as GeoData

export function pointInRing(x: number, z: number, ring: XZ[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]
    const [xj, zj] = ring[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

const landBoxes = GEO.land.map((poly) => {
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const [x, z] of poly[0]) {
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    z0 = Math.min(z0, z)
    z1 = Math.max(z1, z)
  }
  return { x0, x1, z0, z1 }
})

export function isLand(x: number, z: number) {
  for (let i = 0; i < GEO.land.length; i++) {
    const b = landBoxes[i]
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue
    const poly = GEO.land[i]
    if (!pointInRing(x, z, poly[0])) continue
    let inHole = false
    for (let h = 1; h < poly.length; h++) if (pointInRing(x, z, poly[h])) inHole = true
    if (!inHole) return true
  }
  return false
}

export const lonLat = (x: number, z: number) => {
  const { lat, lon } = GEO.origin
  const kx = (111320 * Math.cos((lat * Math.PI) / 180)) / 2
  const kz = 110574 / 2
  return { lat: lat - z / kz, lon: lon + x / kx }
}

/** lat/lon → world units (inverse of lonLat) */
export const proj = (lat: number, lon: number) => {
  const { lat: lat0, lon: lon0 } = GEO.origin
  const kx = (111320 * Math.cos((lat0 * Math.PI) / 180)) / 2
  const kz = 110574 / 2
  return { x: (lon - lon0) * kx, z: -(lat - lat0) * kz }
}
