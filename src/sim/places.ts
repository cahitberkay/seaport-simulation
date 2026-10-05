// Landmarks, logistics sites and marina pins for the active port.
import { CT_FRAME, RORO_FRAME, PORT } from './world'
import { MARINAS } from './marina'
import { sanDiegoPlaces } from '../ports/sanDiegoPlaces'
import { longBeachPlaces } from '../ports/longBeachPlaces'
import type { Place } from '../ports/placeKit'

export type { Place, PlaceKind } from '../ports/placeKit'

const set = PORT.id === 'long-beach' ? longBeachPlaces(CT_FRAME, RORO_FRAME) : sanDiegoPlaces(CT_FRAME, RORO_FRAME)
export const PLACES = set.PLACES
export const LOGISTICS = set.LOGISTICS
export const STATUE_ID = set.STATUE_ID ?? ''

/** every yacht marina gets its own pin, with live slip occupancy */
export const MARINA_PLACES: Place[] = MARINAS.filter((m) => m.slips > 0).map((m, i) => ({
  id: `marina-${i}`,
  name: m.name,
  kind: 'leisure' as const,
  x: m.cx,
  z: m.cz,
  blurb: `Yacht marina with ${m.slips} slips; ${m.occupied} are occupied today. Tap a yacht to see its owner, captain and how long it has been here.`,
  facts: [
    ['Slips', String(m.slips)],
    ['Occupied', `${m.occupied} (${Math.round((m.occupied / m.slips) * 100)}%)`],
  ] as [string, string][],
  pin: true,
}))

export const ALL_PLACES = [...PLACES, ...LOGISTICS, ...MARINA_PLACES]
export const placeById = (id?: string) => ALL_PLACES.find((p) => p.id === id)
