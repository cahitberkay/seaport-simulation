// Port of Long Beach and San Pedro Bay landmarks. Positions are the OpenStreetMap features themselves (model units).
import { X, L, xz } from './placeKit'
import type { Place, PlaceSet } from './placeKit'
import { toWorldF } from './kit'
import type { Frame } from './kit'
import { GEO } from '../sim/geo'

const bridgeMid = (name: string, fallback: [number, number]): [number, number] => {
  const b = GEO.bridges.find((x) => x.n === name)
  if (!b) return fallback
  const p = b.c[Math.floor(b.c.length / 2)]
  return [p[0], p[1]]
}

export function longBeachPlaces(CT_FRAME: Frame, RORO_FRAME: Frame): PlaceSet {
  const PLACES: Place[] = [
    X('queen-mary', 'The Queen Mary', 'landmark', 935, -159,
      'Cunard’s 1936 ocean liner, retired to Long Beach in 1967 and moored at Pier H as a hotel, museum and event venue.',
      [['Maiden voyage', 'May 1936'], ['In Long Beach since', 'December 1967'], ['Length', '310.7 m (1,019 ft)'], ['Gross tonnage', '81,237 GRT'], ['Listed', 'National Register of Historic Places']]),
    X('cruise-dome', 'Long Beach Cruise Terminal', 'terminal', 967, -68,
      'Carnival Cruise Line’s terminal inside the geodesic dome that once housed Howard Hughes’ Spruce Goose, beside the Queen Mary.',
      [['Operator', 'Carnival Cruise Line'], ['Cruises since', '2003'], ['Berth', '1,100 ft · 28 ft deep'], ['Dome', '142,000 sq ft']]),
    X('aquarium', 'Aquarium of the Pacific', 'museum', 595, -663,
      'Southern California’s largest aquarium, on Rainbow Harbor, focused on the Pacific Ocean.',
      [['Opened', '1998'], ['Animals', '12,000+'], ['Exhibits', '100+']]),
    X('shoreline-village', 'Shoreline Village', 'leisure', 790, -560,
      'Waterfront shopping and dining village on Rainbow Harbor, with the Lions Lighthouse and harbor cruises.',
      [['Opened', '1983'], ['Landmark', 'Lions Lighthouse for Sight']]),
    X('convention', 'Long Beach Convention & Entertainment Center', 'landmark', 931, -831,
      'Downtown convention complex with the Terrace Theater and the Arena (Long Beach’s whale mural “Planet Ocean”).',
      [['Opened', '1962'], ['Exhibit space', '400,000 sq ft']]),
    X('civic', 'Long Beach Civic Center · Port HQ', 'landmark', 566, -990,
      'The 2019 Civic Center, home of City Hall and the Port of Long Beach Administration Building.',
      [['Opened', '2019'], ['Port HQ', '415 W. Ocean Blvd']]),
    X('molaa', 'Museum of Latin American Art (MOLAA)', 'museum', 1403, -1359,
      'The only museum in the U.S. dedicated to modern and contemporary Latin American and Latino art.',
      [['Opened', '1996']]),
    X('lbma', 'Long Beach Museum of Art', 'museum', 2092, -745,
      'Art museum in the 1912 Elizabeth Milbank Anderson house on the bluff above the beach.',
      [['Opened', '1950']]),
    X('harry-bridges', 'Harry Bridges Memorial Park', 'park', 705, -233, 'Waterfront park and event lawn next to the Queen Mary on Pier H.', []),
    X('catalina', 'Catalina Express Landing', 'transport', 496, -746, 'Ferry terminal with year-round crossings to Avalon and Two Harbors on Santa Catalina Island.', [['Crossing', 'about 1 hour']]),
    X('lb-light', 'Long Beach Light', 'landmark', 1070, 1480,
      'The “Robot Light” at the east end of the Middle Breakwater, marking Queen’s Gate.', [['Built', '1949'], ['Style', 'Art deco, on six columns']]),
    X('angels-gate', 'Angels Gate Lighthouse', 'landmark', -1926, 2292,
      'Los Angeles Harbor Light at the end of the 2-mile San Pedro Breakwater, marking Angels Gate.', [['First lit', '1913'], ['Light', 'Green, every 15 s']]),
    X('gateway', 'Long Beach International Gateway', 'landmark', ...bridgeMid('Long Beach International Gateway', [-500, -850]),
      'The cable-stayed bridge that replaced the Gerald Desmond Bridge so the largest container ships can pass underneath.',
      [['Opened', 'October 5, 2020'], ['Main span', '1,000 ft (305 m)'], ['Clearance', '205 ft (62 m)'], ['Towers', '515 ft']]),
    X('vincent-thomas', 'Vincent Thomas Bridge', 'landmark', ...bridgeMid('Vincent Thomas Bridge', [-2850, 0]),
      'Suspension bridge between San Pedro and Terminal Island over the Los Angeles Main Channel.', [['Opened', '1963'], ['Main span', '1,500 ft (457 m)'], ['Clearance', '185 ft']]),
    X('heim', 'Commodore Schuyler F. Heim Bridge', 'landmark', ...bridgeMid('Commodore Schuyler F. Heim Bridge', [-1400, -1300]),
      'Vertical-lift bridge carrying SR-47 over the Cerritos Channel.', [['Replacement opened', '2020']]),
    X('thums-grissom', 'Island Grissom (THUMS)', 'landmark', 1327, -518,
      'One of four oil-drilling islands built in 1965, disguised with palm trees, waterfalls and sculpted sound walls.', [['Named for', 'Astronaut Gus Grissom'], ['Built', '1965']]),
    X('thums-white', 'Island White (THUMS)', 'landmark', 2328, -154, 'THUMS oil island, named for astronaut Ed White.', [['Built', '1965']]),
    X('thums-freeman', 'Island Freeman (THUMS)', 'landmark', 2200, 468, 'THUMS oil island, named for astronaut Theodore Freeman.', [['Built', '1966']]),
    X('thums-chaffee', 'Island Chaffee (THUMS)', 'landmark', 3276, 562, 'THUMS oil island, named for astronaut Roger Chaffee.', [['Built', '1966']]),
    X('pier-wind', 'Pier Wind (future site)', 'industry', -760, 640,
      'Planned 400-acre terminal for assembling floating offshore wind turbines, south-west of the Gateway bridge.', [['Status', 'Planning · first phase targeted 2031'], ['Estimated cost', '$4.7 billion']]),
    X('uss-iowa', 'Battleship USS Iowa Museum', 'museum', -3115, 443, 'The WWII battleship, now a museum ship on the San Pedro waterfront.', [['Commissioned', '1943'], ['Museum since', '2012']]),
    X('la-cruise', 'Los Angeles World Cruise Center', 'transport', -3109, 213, 'The Port of Los Angeles cruise terminal at San Pedro.', []),
    X('la-maritime', 'Los Angeles Maritime Museum', 'museum', -3177, 618, 'Maritime museum in the 1941 Municipal Ferry Building.', [['Opened', '1980']]),
    X('lane-victory', 'SS Lane Victory', 'museum', -2989, 1598, 'Preserved WWII Victory ship and museum.', [['Built', '1945']]),
    X('cabrillo-aquarium', 'Cabrillo Marine Aquarium', 'museum', -3496, 2140, 'Marine aquarium at Cabrillo Beach designed by Frank Gehry.', []),
    X('banning', 'The Banning Museum', 'museum', -2259, -2211, 'The 1864 Greek Revival home of Phineas Banning, founder of the Port of Los Angeles.', [['Built', '1864']]),
    X('apm', 'APM Terminals Pier 400', 'terminal', -1798, 1381, 'The largest proprietary container terminal in the Port of Los Angeles.', [['Area', '484 acres']]),
    X('fenix', 'Fenix Marine Services (Pier 300)', 'terminal', -2037, 699, 'Port of Los Angeles container terminal on Terminal Island.', []),
    X('everport', 'Everport Terminal', 'terminal', -2787, 394, 'Port of Los Angeles container terminal on Terminal Island.', []),
    X('yusen', 'Yusen Terminals', 'terminal', -2327, -266, 'Port of Los Angeles container terminal on Terminal Island.', []),
    X('trapac', 'TraPac Los Angeles', 'terminal', -2877, -761, 'Semi-automated container terminal in Wilmington.', []),
    { id: 'lbct', name: 'Long Beach Container Terminal', kind: 'terminal', ...toWorldF(CT_FRAME, 0, -110), blurb: 'The Middle Harbor terminal: one of the most advanced and automated container terminals in North America, built on combined Piers D, E and F.', facts: [['Operator', 'LBCT LLC'], ['Area', '311 acres'], ['Wharf', '4,200 ft · berths E24–E26'], ['Capacity', '3.3 million TEU / year'], ['Equipment', 'Electric STS cranes, automated stacking cranes, battery shuttle carriers']], pin: true },
    X('tti', 'Total Terminals International (Pier T)', 'terminal', -1120, -330, 'Container terminal on the former Long Beach Naval Station site, Pier T.', [['Area', '385 acres'], ['Berths', 'T132–T140']]),
    X('its', 'International Transportation Service (Pier G)', 'terminal', 470, 210, 'Container terminal on Pier G.', [['Area', '246 acres']]),
    X('pct', 'Pacific Container Terminal (Pier J)', 'terminal', 880, 840, 'Container terminal on Pier J at the south-east of the harbour.', [['Area', '256 acres']]),
    X('ssa-a', 'SSA Terminals Pier A', 'terminal', -1000, -1180, 'Container terminal on Pier A, along the Cerritos Channel.', [['Berths', 'A88–A96']]),
    X('matson', 'Matson · SSA Pier C', 'terminal', -300, -1180, 'Matson’s Hawaii, Guam and South Pacific services.', [['Services', 'Hawaii · Guam · Micronesia']]),
    { id: 'pier-f', name: 'Pier F · SSA Marine', kind: 'terminal', ...toWorldF(RORO_FRAME, 0, -60), blurb: 'Breakbulk, ro-ro, steel and project-cargo terminal on Pier F.', facts: [['Area', '22 acres'], ['Berths', 'F205–F211 · 2,400 ft']], pin: true },
    X('toyota', 'Toyota Logistics Services (Pier B)', 'industry', -420, -1600, 'Toyota’s marine terminal and vehicle processing centre: new cars are off-loaded, prepared and sent on by rail and truck.', [['Area', '144 acres'], ['Address', '785 Edison Ave']]),
  ]

  // logistics sites (positions real, operating figures simulated)
  const LOGISTICS: Place[] = [
    L('lbct-gate', 'LBCT Gate · CBP inspection', ...xz(toWorldF(CT_FRAME, 210, -150)), 'Automated in-gate with optical character recognition portals and radiation portal monitors.', [['Lanes', '14 in · 8 out']]),
    L('lbct-rail', 'LBCT On-Dock Rail Yard', ...xz(toWorldF(CT_FRAME, -120, -200)), 'Intermodal rail yard inside the terminal; trains leave for the Alameda Corridor.', [['Tracks', '8 working tracks']]),
    L('pier-b-rail', 'Pier B On-Dock Rail Support Facility', -650, -1450, 'Rail support yard being expanded to triple the port’s on-dock rail capacity by 2032.', [['Investment', '$1.5 billion']]),
    L('alameda', 'Alameda Corridor (south end)', -1150, -1700, '20-mile freight rail expressway linking the ports to the transcontinental rail yards near downtown Los Angeles.', [['Opened', '2002'], ['Share by rail', 'about 28% of boxes']]),
    L('pier-f-sheds', 'Pier F Transit Sheds', ...xz(toWorldF(RORO_FRAME, 40, -110)), 'Covered storage for steel, lumber and project cargo.', [['Use', 'Breakbulk · ro-ro']]),
    L('truck-staging', 'Harbor Scenic Drive Truck Staging', 260, -560, 'Staging lanes for drayage trucks waiting for terminal appointments.', [['Use', 'Truck staging']]),
  ]
  return { PLACES, LOGISTICS }
}
