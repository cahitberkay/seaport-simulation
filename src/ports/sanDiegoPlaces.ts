// Port of San Diego landmarks (positions from OpenStreetMap / public coordinates).
import { P, L, xz } from './placeKit'
import type { Place, PlaceSet } from './placeKit'
import { toWorldF } from './kit'
import { proj } from '../sim/geo'
import type { Frame } from './kit'

export const STATUE_ID = 'unconditional-surrender'

export function sanDiegoPlaces(CT_FRAME: Frame, RORO_FRAME: Frame): PlaceSet {
  const PLACES: Place[] = [
    P('midway', 'USS Midway Museum', 'museum', 32.7137, -117.1751,
      'The longest-serving U.S. aircraft carrier of the 20th century, now a floating museum at Navy Pier.',
      [['In service', '1945 – 1992'], ['Museum since', '2004'], ['Length', '305 m (1,001 ft)'], ['Collection', '30+ restored aircraft']]),
    P(STATUE_ID, 'Unconditional Surrender', 'landmark', 32.7129, -117.17516,
      'The 25-foot "kissing statue" by Seward Johnson, based on Alfred Eisenstaedt’s V-J Day photograph taken in Times Square in 1945.',
      [['Artist', 'J. Seward Johnson II'], ['Height', '7.6 m (25 ft)'], ['Location', 'Tuna Harbor Park, next to USS Midway'], ['Material', 'Painted bronze (permanent since 2013)']]),
    P('maritime', 'Maritime Museum of San Diego', 'museum', 32.72051, -117.17444,
      'A fleet of historic vessels on the North Embarcadero, led by the Star of India.',
      [['Flagship', 'Star of India (1863) · oldest active sailing ship'], ['Also', 'HMS Surprise, Berkeley (1898 ferry), Medea, Californian'], ['Submarines', 'B-39 and USS Dolphin']]),
    P('seal', 'Navy SEAL Museum San Diego', 'museum', 32.71653, -117.16893, 'Museum dedicated to the history of the U.S. Navy SEALs and Naval Special Warfare.', [['District', 'Downtown waterfront']]),
    P('seaport', 'Seaport Village', 'leisure', 32.7092, -117.171, 'Waterfront shopping and dining village on the bay, between the Midway and the Convention Center.', [['Opened', '1980']]),
    P('convention', 'San Diego Convention Center', 'landmark', 32.70635, -117.16182, 'The sail-roofed convention center on the bay, home of Comic-Con International.', [['Size', 'approx. 2.6 million sq ft']]),
    P('petco', 'Petco Park', 'landmark', 32.7073, -117.1566, 'Downtown ballpark of the San Diego Padres.', [['Opened', '2004']]),
    P('gaslamp', 'Historic Gaslamp Quarter', 'landmark', 32.71056, -117.16065, 'Victorian-era historic district of restaurants, nightlife and shops.', [['Area', '16½ blocks']]),
    P('broadway', 'Broadway Pier & Port Pavilion', 'terminal', 32.71525, -117.1736, 'Second cruise terminal on the Embarcadero; the Port Pavilion doubles as an event venue.', [['Pavilion opened', '2010']]),
    P('bstreet', 'B Street Cruise Ship Terminal', 'terminal', 32.71768, -117.17497, 'The Port of San Diego’s main cruise terminal, with berths on both sides of the pier.', [['Berths', 'North and south faces']]),
    P('portside', 'Portside Pier', 'leisure', 32.71941, -117.17365, 'Dining pier on the Embarcadero with restaurants over the water.', [['Opened', '2022']]),
    P('freedom', 'Freedom Park (future site)', 'park', 32.7144, -117.1744, 'Planned memorial park at Navy Pier beside the USS Midway Museum.', [['Status', 'Planned']]),
    P('marina-park', 'Embarcadero Marina Park North', 'park', 32.70693, -117.16854, 'Waterfront park wrapping the Marriott Marquis marina.', []),
    P('ferry', 'Coronado Ferry Landing', 'transport', 32.69994, -117.16979, 'Ferry landing and shops on Coronado, linked to Broadway Pier and the Convention Center.', []),
    P('bridge', 'San Diego–Coronado Bridge', 'landmark', 32.6932, -117.1525, 'The curving blue bridge linking Barrio Logan with Coronado; ships pass under its high central span.', [['Opened', '1969'], ['Length', '3.4 km (2.1 mi)'], ['Clearance', 'about 61 m (200 ft)']]),
    P('chicano', 'Chicano Park', 'park', 32.7003, -117.14296, 'Park under the bridge ramps, famous for its murals; a National Historic Landmark.', [['Established', '1970']]),
    P('chavez', 'Cesar Chavez Park', 'park', 32.69658, -117.15028, 'Waterfront park next to Tenth Avenue Marine Terminal.', []),
    P('nassco', 'General Dynamics NASSCO', 'industry', 32.6866, -117.1337, 'The largest new-construction shipyard on the U.S. West Coast, building auxiliary and commercial ships.', []),
    P('bae', 'BAE Systems San Diego Ship Repair', 'industry', 32.6928, -117.1425, 'Ship repair and modernization yard serving the U.S. Navy.', []),
    P('nbsd', 'Naval Base San Diego', 'navy', 32.6797, -117.1268, 'Principal homeport of the U.S. Pacific Fleet’s surface ships, along the 32nd Street waterfront.', []),
    P('nasni', 'Naval Air Station North Island', 'navy', 32.6996, -117.2133, 'Known as the birthplace of naval aviation; homeport of aircraft carriers.', []),
    P('hotel-del', 'Hotel del Coronado', 'landmark', 32.6809, -117.1786, 'The red-roofed Victorian beach resort on Coronado.', [['Opened', '1888']]),
    P('cabrillo', 'Cabrillo National Monument', 'landmark', 32.6722, -117.241, 'Monument and the Old Point Loma Lighthouse at the tip of Point Loma, overlooking the bay entrance.', [['Lighthouse', '1855']]),
    P('airport', 'San Diego International Airport', 'transport', 32.7336, -117.1897, 'Single-runway airport (Lindbergh Field) right on the bay.', []),
    P('shelter', 'Shelter Island', 'leisure', 32.7133, -117.2297, 'Man-made peninsula lined with marinas, yacht clubs and hotels.', []),
    P('harbor-island', 'Harbor Island', 'leisure', 32.7246, -117.2005, 'Man-made peninsula with marinas and hotels facing downtown.', []),
    { id: 'tamt', name: 'Tenth Avenue Marine Terminal', kind: 'terminal', ...toWorldF(CT_FRAME, 0, -60), blurb: '96-acre multi-purpose terminal: refrigerated containers, breakbulk, bulk and project cargo, with all-electric mobile harbor cranes.', facts: [['Berths', '8'], ['Channel depth', '42 ft']], pin: true },
    { id: 'ncmt', name: 'National City Marine Terminal', kind: 'terminal', ...toWorldF(RORO_FRAME, 0, -90), blurb: 'Vehicle import/export terminal at the south bay, one of the busiest auto ports on the West Coast.', facts: [['Berths', '4'], ['Area', '135 acres']], pin: true },
  ]

  // logistics sites (positions real, operating figures simulated)
  const LOGISTICS: Place[] = [
    L('tamt-shed-1', 'TAMT Transit Shed 1', ...xz(toWorldF(CT_FRAME, -35, -110)), 'Covered breakbulk and project-cargo storage behind berths 1–2.', [['Use', 'Breakbulk · steel · project cargo']]),
    L('tamt-shed-2', 'TAMT Transit Shed 2 · Cold chain', ...xz(toWorldF(CT_FRAME, 129, -111)), 'Refrigerated storage for fruit and perishables discharged at TAMT.', [['Use', 'Refrigerated cargo']]),
    L('tamt-gate', 'TAMT Gate · CBP inspection', ...xz(toWorldF(CT_FRAME, 200, -120)), 'Truck gate with U.S. Customs and Border Protection inspection lanes.', [['Lanes', '4 in · 2 out']]),
    L('ncmt-processing', 'NCMT Vehicle Processing', ...xz(toWorldF(RORO_FRAME, 40, -170)), 'Vehicle processing, accessory fitting and rail/truck dispatch for imported cars.', [['Use', 'Vehicle processing']]),
    L('harbor-drayage', 'Harbor Drive Truck Staging', ...xz(proj(32.6985, -117.1445)), 'Staging area for drayage trucks serving the marine terminals.', [['Use', 'Truck staging']]),
  ]
  return { PLACES, LOGISTICS, STATUE_ID }
}
