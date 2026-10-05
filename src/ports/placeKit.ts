// Landmark pins: types and small constructors shared by the per-port place lists.
import { proj } from '../sim/geo'

export type PlaceKind = 'museum' | 'landmark' | 'park' | 'terminal' | 'navy' | 'industry' | 'leisure' | 'transport' | 'logistics'

export interface Place {
  id: string
  name: string
  kind: PlaceKind
  x: number
  z: number
  blurb: string
  facts: [string, string][]
  pin?: boolean
}

/** a place at real-world coordinates */
export const P = (id: string, name: string, kind: PlaceKind, lat: number, lon: number, blurb: string, facts: [string, string][] = [], pin = true): Place => ({
  id,
  name,
  kind,
  ...proj(lat, lon),
  blurb,
  facts,
  pin,
})
/** a place at model coordinates (taken from the OpenStreetMap feature itself) */
export const X = (id: string, name: string, kind: PlaceKind, x: number, z: number, blurb: string, facts: [string, string][] = [], pin = true): Place => ({ id, name, kind, x, z, blurb, facts, pin })
export const L = (id: string, name: string, x: number, z: number, blurb: string, facts: [string, string][]): Place => ({ id, name, kind: 'logistics', x, z, blurb, facts, pin: true })
export const xz = (p: { x: number; z: number }): [number, number] => [p.x, p.z]

export interface PlaceSet {
  PLACES: Place[]
  LOGISTICS: Place[]
  /** a statue modelled in 3D (San Diego's Unconditional Surrender) */
  STATUE_ID?: string
}
