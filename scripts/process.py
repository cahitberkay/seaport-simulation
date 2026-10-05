"""Turn raw OpenStreetMap extracts (scripts/cache/*.json) into the compact geo.json the app renders.

Projection: local tangent plane around downtown San Diego, 1 unit = 2 m,
+x = east, +z = south (three.js ground plane, north is -z).
Data © OpenStreetMap contributors, ODbL.
"""
import json
import math
import os
import sys

from shapely.geometry import LineString, Polygon, Point, box, MultiPolygon
from shapely.ops import linemerge, polygonize, unary_union, nearest_points
from shapely import affinity

HERE = os.path.dirname(__file__)

# one entry per modelled port: projection origin, coastline clip box (lon0, lat0, lon1, lat1) and output file
CONFIGS = {
    'san-diego': {'cache': 'cache', 'out': 'geo.json', 'origin': (32.705, -117.165), 'bbox': (-117.295, 32.545, -117.055, 32.765),
                  'skip': {'USS Midway Museum'}},
    'long-beach': {'cache': 'cache-lb', 'out': 'geo-lb.json', 'origin': (33.75, -118.21), 'bbox': (-118.31, 33.67, -118.07, 33.80),
                   'skip': {'Queen Mary', 'RMS Queen Mary'}},
}
PORT = next((a[7:] for a in sys.argv if a.startswith('--port=')), 'san-diego')
CFG = CONFIGS[PORT]
CACHE = os.path.join(HERE, CFG['cache'])
OUT = os.path.join(HERE, '..', 'src', 'data', CFG['out'])

LAT0, LON0 = CFG['origin']
KX = 111320 * math.cos(math.radians(LAT0)) / 2
KZ = 110574 / 2


def proj(lon, lat):
    return ((lon - LON0) * KX, -(lat - LAT0) * KZ)


def load(name):
    return json.load(open(os.path.join(CACHE, name)))['elements']


def r(v, q=0.5):
    return round(v / q) * q


def ring_xy(coords, q=0.5):
    out = []
    for lon, lat in coords:
        x, z = proj(lon, lat)
        p = [r(x, q), r(z, q)]
        if not out or out[-1] != p:
            out.append(p)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


# ───────── land from coastline

def build_land():
    ways = [w for w in load('coast.json') if w['type'] == 'way']
    lines = [LineString([(p['lon'], p['lat']) for p in w['geometry']]) for w in ways]
    merged = linemerge(lines)
    bbox = box(*CFG['bbox'])
    clipped = merged.intersection(bbox)
    faces = list(polygonize(unary_union([clipped, bbox.boundary])))
    segs = []
    for ln in lines:
        cs = list(ln.coords)
        segs += [(cs[i], cs[i + 1]) for i in range(len(cs) - 1)]

    def is_land(face):
        p = face.representative_point()
        best = None
        for a, b in segs:
            seg = LineString([a, b])
            d = seg.distance(p)
            if best is None or d < best[0]:
                best = (d, a, b)
        _, a, b = best
        cross = (b[0] - a[0]) * (p.y - a[1]) - (b[1] - a[1]) * (p.x - a[0])
        return cross > 0  # OSM coastline: land on the left

    land = unary_union([f for f in faces if is_land(f)])
    land = land.simplify(0.00002, preserve_topology=True)
    # continue land that touches the extract's edges far outward so the map has no seams
    from shapely.geometry import LineString as LS
    (bx0, by0, bx1, by1) = bbox.bounds
    far = 0.3
    ext = []
    edges = [
        (LS([(bx0, by1), (bx1, by1)]), (0, far)),   # north
        (LS([(bx1, by0), (bx1, by1)]), (far, 0)),   # east
        (LS([(bx0, by0), (bx1, by0)]), (0, -far)),  # south
        (LS([(bx0, by0), (bx0, by1)]), (-far, 0)),  # west
    ]
    for edge, (dx, dy) in edges:
        hit = land.buffer(1e-7).intersection(edge)
        parts = [g for g in getattr(hit, 'geoms', [hit]) if not g.is_empty]
        if dy > 0 and parts:  # north edge: bridge the narrow river mouths into one strip
            xs = [c[0] for g in parts for c in g.coords]
            parts = [LS([(min(xs), by1), (max(xs), by1)])]
        for g in parts:
            if g.is_empty or g.length < 1e-4:
                continue
            (ax, ay), (cx, cy) = g.coords[0], g.coords[-1]
            ext.append(Polygon([(ax, ay), (cx, cy), (cx + dx, cy + dy), (ax + dx, ay + dy)]))
    # corners between two land edges
    corner = box(bx1, by1, bx1 + far, by1 + far)
    if land.buffer(1e-6).contains(Point(bx1 - 1e-5, by1 - 1e-5)):
        ext.append(corner)
    if land.buffer(1e-6).contains(Point(bx1 - 1e-5, by0 + 1e-5)):
        ext.append(box(bx1, by0 - far, bx1 + far, by0))
    land = unary_union([land] + ext)
    polys = list(land.geoms) if isinstance(land, MultiPolygon) else [land]
    out = []
    for pg in polys:
        if pg.area < 2e-8:
            continue
        rings = [ring_xy(pg.exterior.coords, 1)] + [ring_xy(h.coords, 1) for h in pg.interiors]
        out.append(rings)
    return out, land


# ───────── buildings

DEFAULT_H = {
    'house': 7, 'detached': 7, 'residential': 9, 'garage': 3.5, 'garages': 3.5, 'shed': 3, 'roof': 5,
    'apartments': 14, 'commercial': 12, 'retail': 8, 'office': 16, 'industrial': 11, 'warehouse': 11,
    'hotel': 30, 'school': 9, 'church': 12, 'hangar': 16, 'parking': 12, 'military': 9, 'public': 12,
}


def height_of(t):
    h = t.get('height') or t.get('building:height')
    try:
        if h:
            return float(str(h).replace('m', '').strip())
    except ValueError:
        pass
    lv = t.get('building:levels')
    try:
        if lv:
            return float(lv) * 3.6 + 1.5
    except ValueError:
        pass
    return DEFAULT_H.get(t.get('building'), 8)


def build_buildings(land):
    out = []
    for w in load('buildings.json'):
        if w['type'] != 'way' or 'geometry' not in w:
            continue
        t = w.get('tags', {})
        coords = [(p['lon'], p['lat']) for p in w['geometry']]
        if len(coords) < 4:
            continue
        pg = Polygon(coords)
        if not pg.is_valid:
            pg = pg.buffer(0)
            if pg.is_empty or not isinstance(pg, Polygon):
                continue
        area_m2 = pg.area * (KX * 2) * (KZ * 2)
        name = t.get('name')
        if name in CFG['skip']:
            continue
        if area_m2 < 90 and not name:
            continue
        pg = pg.simplify(0.000012, preserve_topology=True)
        ring = ring_xy(pg.exterior.coords)
        if len(ring) < 3:
            continue
        b = {'p': ring, 'h': r(height_of(t) / 2, 0.5), 't': t.get('building', 'yes')}
        if name:
            b['n'] = name
            for k in ('addr:housenumber', 'addr:street', 'operator', 'building:levels', 'amenity', 'tourism', 'shop', 'office', 'website'):
                if k in t:
                    b[k.split(':')[-1] if k.startswith('addr') else k] = t[k]
        out.append(b)
    return out


# ───────── parking, marinas, piers, runways, pois

def build_parking():
    out = []
    for w in load('parking.json'):
        if w['type'] != 'way' or 'geometry' not in w:
            continue
        t = w.get('tags', {})
        coords = [(p['lon'], p['lat']) for p in w['geometry']]
        if len(coords) < 4 or coords[0] != coords[-1]:
            continue
        pg = Polygon(coords)
        if not pg.is_valid:
            pg = pg.buffer(0)
        if not isinstance(pg, Polygon) or pg.is_empty:
            continue
        kind = t.get('parking', 'surface')
        area_m2 = pg.area * (KX * 2) * (KZ * 2)
        if area_m2 < 400 or kind in ('underground', 'multi-storey', 'rooftop'):
            continue
        rect = pg.minimum_rotated_rectangle
        cs = list(rect.exterior.coords)
        ex, ez = proj(*cs[0])
        fx, fz = proj(*cs[1])
        gx, gz = proj(*cs[2])
        e1 = math.hypot(fx - ex, fz - ez)
        e2 = math.hypot(gx - fx, gz - fz)
        ang = math.atan2(fz - ez, fx - ex) if e1 >= e2 else math.atan2(gz - fz, gx - fx)
        out.append({
            'p': ring_xy(pg.simplify(0.000008).exterior.coords),
            'a': round(ang, 3),
            'n': t.get('name') or t.get('operator') or '',
            'cap': t.get('capacity'),
            'fee': t.get('fee'),
            'op': t.get('operator'),
        })
    return out


def build_marine():
    marinas, piers, breakwaters = [], [], []
    for e in load('marine.json'):
        t = e.get('tags', {})
        if e['type'] == 'way' and 'geometry' in e:
            coords = [(p['lon'], p['lat']) for p in e['geometry']]
            if t.get('leisure') == 'marina' and len(coords) >= 4:
                marinas.append({'p': ring_xy(Polygon(coords).simplify(0.00001).exterior.coords), 'n': t.get('name', 'Marina')})
            elif t.get('man_made') in ('pier', 'breakwater'):
                closed = coords[0] == coords[-1] and len(coords) >= 4
                item = {'c': ring_xy(coords) if closed else [[r(x), r(z)] for x, z in (proj(*c) for c in coords)], 'closed': closed}
                if t.get('name'):
                    item['n'] = t['name']
                if t.get('floating') == 'yes' or t.get('mooring'):
                    item['float'] = True
                (piers if t['man_made'] == 'pier' else breakwaters).append(item)
        elif e['type'] == 'relation' and t.get('leisure') == 'marina':
            for m in e.get('members', []):
                if m.get('role') == 'outer' and 'geometry' in m:
                    coords = [(p['lon'], p['lat']) for p in m['geometry']]
                    if len(coords) >= 4:
                        marinas.append({'p': ring_xy(Polygon(coords).simplify(0.00001).exterior.coords), 'n': t.get('name', 'Marina')})
    return marinas, piers, breakwaters


def build_runways():
    out = []
    for w in load('aero.json'):
        if 'geometry' not in w:
            continue
        coords = [proj(p['lon'], p['lat']) for p in w['geometry']]
        raw = str(w.get('tags', {}).get('width', '45'))
        try:
            width = float(raw.split()[0]) * (0.3048 if 'ft' in raw else 1) / 2
        except ValueError:
            width = 22.5
        out.append({'c': [[r(x), r(z)] for x, z in coords], 'w': width, 'ref': w.get('tags', {}).get('ref', '')})
    return out


def build_pois():
    out = []
    for e in load('pois.json'):
        t = e.get('tags', {})
        if not t.get('name'):
            continue
        c = e.get('center') or {'lat': e.get('lat'), 'lon': e.get('lon')}
        x, z = proj(c['lon'], c['lat'])
        out.append({'n': t['name'], 'k': t.get('tourism') or t.get('leisure') or t.get('amenity'), 'x': r(x), 'z': r(z),
                    'w': t.get('website'), 'd': t.get('description'), 'artist': t.get('artist_name')})
    return out


def build_bridges():
    """high bridges as centrelines with a deck-height profile (units above water)"""
    els = json.load(open(os.path.join(CACHE, 'bridge.json')))['elements']
    if PORT == 'san-diego':
        ways = {w['id']: [proj(p['lon'], p['lat']) for p in w['geometry']] for w in els}
        main_span = ways[153343716]
        coronado = list(reversed(ways[6055495]))
        pts = [(990.0, 310.0)] + main_span + coronado[1:]
        return [{'n': 'San Diego–Coronado Bridge', 'c': [[r(x), r(z)] for x, z in pts], 'peak': 30, 'color': '#3d74e8'}]
    out = []
    # (name, deck clearance in units, colour); one carriageway each is enough at this scale
    spec = [('Long Beach International Gateway', 31, '#f4f6fa'), ('Vincent Thomas Bridge', 28, '#4f8fe0'), ('Commodore Schuyler F. Heim Bridge', 9, '#c9ced9')]
    for name, peak, color in spec:
        lines = [LineString([(p['lon'], p['lat']) for p in w['geometry']]) for w in els if w.get('tags', {}).get('bridge:name') == name]
        if not lines:
            continue
        merged = linemerge(lines)
        parts = list(merged.geoms) if hasattr(merged, 'geoms') else [merged]
        best = max(parts, key=lambda g: g.length)
        pts = [proj(x, y) for x, y in best.coords]
        out.append({'n': name, 'c': [[r(x), r(z)] for x, z in pts], 'peak': peak, 'color': color})
    return out


def build_yards():
    """named container-terminal outlines (Port of Los Angeles side), filled with container stacks in the app"""
    path = os.path.join(CACHE, 'landuse.json')
    if not os.path.exists(path):
        return []
    out = []
    pat = ('Container Terminal', 'Pier 400', 'Pier 300', 'TraPac', 'Yusen', 'Evergreen')
    for e in load('landuse.json'):
        t = e.get('tags', {})
        n = t.get('name', '')
        if not any(k in n for k in pat):
            continue
        rings = []
        if e['type'] == 'way' and 'geometry' in e:
            rings = [[(q['lon'], q['lat']) for q in e['geometry']]]
        elif e['type'] == 'relation':
            lines = [LineString([(q['lon'], q['lat']) for q in m['geometry']]) for m in e.get('members', []) if m.get('role') in ('outer', '') and len(m.get('geometry', [])) > 1]
            rings = [list(pg.exterior.coords) for pg in polygonize(linemerge(lines))] if lines else []
        for ring in rings:
            if len(ring) >= 4:
                pg = Polygon(ring)
                if not pg.is_valid:
                    pg = pg.buffer(0)
                if isinstance(pg, Polygon) and not pg.is_empty:
                    out.append({'n': n, 'p': ring_xy(pg.simplify(0.00002).exterior.coords, 1)})
    return out


def main():
    land_rings, land = build_land()
    print('land polygons', len(land_rings), 'verts', sum(len(r) for p in land_rings for r in p))
    buildings = build_buildings(land)
    print('buildings', len(buildings), 'named', sum(1 for b in buildings if 'n' in b))
    parking = build_parking()
    print('parking', len(parking))
    marinas, piers, breakwaters = build_marine()
    print('marinas', len(marinas), 'piers', len(piers), 'breakwaters', len(breakwaters))
    runways = build_runways()
    pois = build_pois()
    data = {
        'origin': {'lat': LAT0, 'lon': LON0, 'unitM': 2},
        'land': land_rings,
        'buildings': buildings,
        'parking': parking,
        'marinas': marinas,
        'piers': piers,
        'breakwaters': breakwaters,
        'runways': runways,
        'pois': pois,
        'bridges': build_bridges(),
        'yards': build_yards() if PORT != 'san-diego' else [],
        'attribution': '© OpenStreetMap contributors (ODbL)',
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')

    if '--plot' in sys.argv:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(14, 14))
        ax.set_facecolor('#7fb6e0')
        for poly in land_rings:
            xs = [p[0] for p in poly[0]]
            zs = [-p[1] for p in poly[0]]
            ax.fill(xs, zs, color='#efe9dc', lw=0.3, ec='#999')
        for b in buildings[::3]:
            ax.fill([p[0] for p in b['p']], [-p[1] for p in b['p']], color='#bbb', lw=0)
        for m in marinas:
            ax.plot([p[0] for p in m['p']] + [m['p'][0][0]], [-p[1] for p in m['p']] + [-m['p'][0][1]], color='purple', lw=0.6)
        for p in piers:
            ax.plot([q[0] for q in p['c']], [-q[1] for q in p['c']], color='k', lw=0.5)
        for rw in runways:
            ax.plot([q[0] for q in rw['c']], [-q[1] for q in rw['c']], color='#555', lw=2)
        extra = [a for a in sys.argv if a.startswith('--wp=')]
        if extra:
            pts = json.load(open(extra[0][5:]))
            ax.plot([p[0] for p in pts], [-p[1] for p in pts], 'r.-', lw=1)
        ax.set_aspect('equal')
        lim = [a for a in sys.argv if a.startswith('--lim=')]
        if lim:
            x0, x1, z0, z1 = map(float, lim[0][6:].split(','))
            ax.set_xlim(x0, x1)
            ax.set_ylim(-z1, -z0)
        ax.grid(True, lw=0.3)
        out = [a for a in sys.argv if a.startswith('--png=')]
        for bd in data['bridges']:
            ax.plot([q[0] for q in bd['c']], [-q[1] for q in bd['c']], color='blue', lw=1.5)
        fig.savefig(out[0][6:] if out else os.path.join(CACHE, 'map.png'), dpi=110, bbox_inches='tight')


if __name__ == '__main__':
    main()
