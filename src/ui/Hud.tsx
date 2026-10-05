import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  sim, shipById, containerById, craneById, rtgById, handlerById, shipProgress, shipOnboard, craneRate, yardLabel, slotLocal, berthPlace,
} from '../sim/sim'
import type { Ship, Container, Crane, Handler, Tug, Rtg, HistoryEvent } from '../sim/sim'
import { BERTHS, PORTS, BLOCKS, YARD_ROWS, YARD_STACKS, berthById, PORT, HOME, isBoxShip, terminalById } from '../sim/world'
import { PORT_LIST, PORT_ID, switchPort } from '../ports/registry'
import { fmtDate, fmtTime, fmtClock, fmtDuration, nmBetween } from '../sim/data'
import { GEO, lonLat } from '../sim/geo'
import { carInfo, LOTS, STALLS } from '../sim/parking'
import { yachtInfo, MARINAS, YACHTS } from '../sim/marina'
import { PLACES, LOGISTICS, placeById, STATUE_ID } from '../sim/places'
import { useUI } from '../store'
import type { Tab } from '../store'
import { shipStatus, fmt } from './format'
import type { Tone } from './format'
import { RouteMap } from './RouteMap'
import {
  IconSearch, IconBell, IconPlus, IconMinus, IconRotL, IconRotR, IconHome, IconChevron, IconChevronDown, IconX, IconTarget,
  IconShip, IconCrane, IconAnchor, IconPlay, IconPause, IconRoute, IconContainer, IconCar, IconAlert, IconUsers, IconForklift,
  IconGrid, IconBox, IconSun, IconMoon, IconEye, IconEyeOff, IconTag, IconBuilding, IconYacht, IconStatue, IconPinMap, IconDock, Logo,
} from './icons'

// ───────────── atoms

const Chip = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`chip chip-${tone}`}>{children}</span>
const Bar = ({ value, tone = 'blue' }: { value: number; tone?: Tone }) => (
  <div className="bar">
    <div className={`bar-fill bar-${tone}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
  </div>
)
const KV = ({ rows }: { rows: [string, ReactNode][] }) => (
  <div className="kv">
    {rows.map(([k, v]) => (
      <div key={k}>
        <span>{k}</span>
        <b>{v}</b>
      </div>
    ))}
  </div>
)
const Tabs = ({ tabs }: { tabs: { id: string; label: string }[] }) => {
  const tab = useUI((s) => s.panelTab)
  const set = useUI((s) => s.setPanelTab)
  return (
    <div className="ptabs">
      {tabs.map((t) => (
        <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => set(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
const portName = (code: string) => (PORTS[code] ? `${PORTS[code].name}, ${PORTS[code].country}` : code)
const hash = (n: number) => {
  let h = n | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function History({ events }: { events: HistoryEvent[] }) {
  const sorted = [...events].sort((a, b) => b.t - a.t)
  return (
    <ol className="timeline">
      {sorted.map((e, i) => (
        <li key={i} className={e.planned ? 'planned' : i === 0 ? 'latest' : ''}>
          <span className="tl-dot" />
          <div>
            <b>{e.event}</b>
            <span>{e.place}</span>
          </div>
          <time>{fmtDate(e.t)}</time>
        </li>
      ))}
    </ol>
  )
}

function PanelHead({ kicker, title, sub, icon, actions }: { kicker: string; title: string; sub: string; icon: ReactNode; actions?: ReactNode }) {
  return (
    <div className="panel-head">
      <div className="panel-icon">{icon}</div>
      <div className="panel-titles">
        <div className="kicker">{kicker}</div>
        <div className="panel-title">{title}</div>
        <div className="panel-sub">{sub}</div>
      </div>
      <div className="panel-actions">{actions}</div>
    </div>
  )
}
function CloseBtn() {
  const select = useUI((s) => s.select)
  return (
    <button className="icon-btn sm" onClick={() => select(null)} title="Close">
      <IconX />
    </button>
  )
}
function FollowBtn() {
  const follow = useUI((s) => s.follow)
  const setFollow = useUI((s) => s.setFollow)
  return (
    <button className={`icon-btn sm ${follow ? 'on' : ''}`} onClick={() => setFollow(!follow)} title="Follow">
      <IconTarget />
    </button>
  )
}
function FocusBtn({ x, z, dist = 160 }: { x: number; z: number; dist?: number }) {
  const cam = useUI((s) => s.cam)
  return (
    <button className="icon-btn sm" onClick={() => cam({ kind: 'focus', x, z, dist })} title="Show on map">
      <IconPinMap />
    </button>
  )
}

/** collapsible card shell used by the side panels */
function Card({ title, icon, right, children, className = '' }: { title: string; icon?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(true)
  return (
    <section className={`card panel ${className} ${open ? '' : 'collapsed'}`}>
      <header className="panel-bar" onClick={() => setOpen((o) => !o)}>
        <span className="row gap">
          {icon}
          <b>{title}</b>
        </span>
        <span className="row gap">
          {right}
          <IconChevronDown className={`chev ${open ? '' : 'up'}`} />
        </span>
      </header>
      {open && <div className="panel-body">{children}</div>}
    </section>
  )
}

// ───────────── top bar

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <IconGrid width={15} height={15} /> },
  { id: 'vessels', label: 'Vessels', icon: <IconShip width={15} height={15} /> },
  { id: 'yard', label: 'Yard', icon: <IconContainer width={15} height={15} /> },
  { id: 'shipments', label: 'Shipments', icon: <IconBox width={15} height={15} /> },
  { id: 'logistics', label: 'Logistics', icon: <IconRoute width={15} height={15} /> },
]

function PortSwitcher() {
  const [open, setOpen] = useState(false)
  return (
    <div className={`site port-switch ${open ? 'open' : ''}`}>
      <button className="site-btn" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="pin-dot-l" />
        <span>
          <b>{PORT.short}</b>
          <small>California, US</small>
        </span>
        <IconChevronDown className="muted" />
      </button>
      {open && (
        <div className="port-menu card" role="listbox">
          <span className="port-menu-title">Switch port</span>
          {PORT_LIST.map((p) => (
            <button key={p.id} role="option" aria-selected={p.id === PORT_ID} className={p.id === PORT_ID ? 'on' : ''} onMouseDown={() => switchPort(p.id)}>
              <span className="pin-dot-l" />
              <span>
                <b>{p.name}</b>
                <small>
                  {p.region} · {p.unlocode}
                </small>
              </span>
              {p.id === PORT_ID && <span className="port-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** select a ship from a list and fly the camera to it (moving ships are then followed) */
function useFocusShip() {
  const select = useUI((st) => st.select)
  const cam = useUI((st) => st.cam)
  return (s: Ship) => {
    select({ type: 'ship', id: s.id }, !['working', 'anchored'].includes(s.state))
    cam({ kind: 'focus', x: s.pos.x, z: s.pos.z, dist: Math.max(220, s.cls.length * 2.8) })
  }
}

function SearchBox() {
  const focusShip = useFocusShip()
  const select = useUI((s) => s.select)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  // "/" or ⌘K / Ctrl+K opens search, Esc closes it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])
  const results = useMemo(() => {
    const k = q.trim().toLowerCase().replace(/\s/g, '')
    if (k.length < 2) return []
    const out: { key: string; label: string; sub: string; go: () => void }[] = []
    for (const s of sim.ships)
      if (`${s.name}${s.imo}${s.navy?.hull ?? ''}`.toLowerCase().replace(/[\s-]/g, '').includes(k.replace(/-/g, '')))
        out.push({ key: s.id, label: s.name, sub: `${s.cls.label} · ${shipStatus(s).label}`, go: () => focusShip(s) })
    for (const p of [...PLACES, ...LOGISTICS]) if (p.name.toLowerCase().replace(/\s/g, '').includes(k)) out.push({ key: p.id, label: p.name, sub: 'Place', go: () => select({ type: 'place', id: p.id }) })
    for (const c of sim.cranes) if (c.id.toLowerCase().replace('-', '').includes(k.replace('-', ''))) out.push({ key: c.id, label: c.id, sub: PORT.ct.crane === 'sts' ? 'Ship-to-shore crane' : 'Mobile harbour crane', go: () => select({ type: 'crane', id: c.id }) })
    if (out.length < 8 && k.length >= 3)
      for (const c of sim.containers.values()) {
        if (c.loc.kind === 'gone') continue
        if (c.id.toLowerCase().replace(/\s/g, '').includes(k) || c.cargo.toLowerCase().includes(k)) {
          out.push({ key: c.id, label: c.id, sub: `${c.cargo} · ${c.status}`, go: () => select({ type: 'container', id: c.id }) })
          if (out.length >= 8) break
        }
      }
    return out.slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sim.version])
  return (
    <div className="search-wrap">
      <button className={`search-btn ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} title="Search (/)" aria-expanded={open}>
        <IconSearch />
        <span>Search</span>
        <kbd>/</kbd>
      </button>
      {open && (
        <div
          className="search-pop card"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
          }}
        >
          <div className="search">
            <IconSearch className="muted" />
            <input ref={input} placeholder="Search vessels, containers, places…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {results.length > 0 ? (
            <div className="search-results">
              {results.map((r) => (
                <button
                  key={r.key}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    r.go()
                    setQ('')
                    setOpen(false)
                  }}
                >
                  <b>{r.label}</b>
                  <span>{r.sub}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="search-hint">{q.trim().length < 2 ? 'Type a vessel name, IMO, container number, crane or place.' : 'No matches.'}</p>
          )}
        </div>
      )}
    </div>
  )
}

export function TopBar() {
  useUI((s) => s.tick)
  const tab = useUI((s) => s.tab)
  const setTab = useUI((s) => s.setTab)
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <span>
          Port <em>Control</em>
        </span>
      </div>
      <nav className="views">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
      <PortSwitcher />
      <SearchBox />
      <div className={`live ${sim.speed === 0 ? 'paused' : ''}`}>
        <span className="live-dot" /> {sim.speed === 0 ? 'Paused' : 'Live'} <b>{fmtClock(sim.time)}</b>
      </div>
      <button className="icon-btn bell" title={`${sim.alerts.length} alerts`}>
        <IconBell />
        {sim.alerts.length > 0 && <span className="badge-dot" />}
      </button>
      <div className="user">
        <div className="avatar">CB</div>
        <div>
          <b>C.Berkay</b>
          <span>OP Manager</span>
        </div>
        <IconChevronDown className="muted" />
      </div>
    </header>
  )
}

// ───────────── map toolbar (right edge)

export function MapToolbar() {
  const cam = useUI((s) => s.cam)
  const tab = useUI((s) => s.tab)
  const st = useUI()
  return (
    <div className="card map-toolbar">
      <button title={st.showPanels ? 'Hide panels' : 'Show panels'} className={st.showPanels ? '' : 'on'} onClick={() => st.toggle('showPanels')}>
        {st.showPanels ? <IconEyeOff /> : <IconEye />}
      </button>
      <button title={st.night ? 'Day view' : 'Night view'} className={st.night ? 'on' : ''} onClick={() => st.toggle('night')}>
        {st.night ? <IconMoon /> : <IconSun />}
      </button>
      <button title="Labels" className={st.showLabels ? 'on' : ''} onClick={() => st.toggle('showLabels')}>
        <IconTag />
      </button>
      <button title="Vessel routes" className={st.showRoutes ? 'on' : ''} onClick={() => st.toggle('showRoutes')}>
        <IconRoute />
      </button>
      <span className="sep" />
      <button title="Zoom in" onClick={() => cam({ kind: 'zoom', dir: 1 })}>
        <IconPlus />
      </button>
      <button title="Zoom out" onClick={() => cam({ kind: 'zoom', dir: -1 })}>
        <IconMinus />
      </button>
      <button title="Rotate left" onClick={() => cam({ kind: 'rotate', dir: 1 })}>
        <IconRotL />
      </button>
      <button title="Rotate right" onClick={() => cam({ kind: 'rotate', dir: -1 })}>
        <IconRotR />
      </button>
      <button title="Reset view" onClick={() => cam({ kind: 'tab', tab })}>
        <IconHome />
      </button>
    </div>
  )
}

// ───────────── left column per tab

export function LeftColumn() {
  useUI((s) => s.tick)
  const tab = useUI((s) => s.tab)
  return (
    <div className="left-col">
      {tab === 'overview' && (
        <>
          <Kpis />
          <TodayCard />
        </>
      )}
      {tab === 'vessels' && <VesselList />}
      {tab === 'yard' && <YardPanel />}
      {tab === 'shipments' && <ShipmentsPanel />}
      {tab === 'logistics' && <LogisticsPanel />}
    </div>
  )
}

function Kpis() {
  const rate = sim.cranes.reduce((a, c) => a + craneRate(c), 0) / sim.cranes.length
  const util = sim.yard.filter(Boolean).length / sim.yard.length
  const berthed = sim.ships.filter((s) => s.state === 'working' && !s.cls.navy).length
  return (
    <div className="kpis">
      <Kpi icon={<IconContainer />} label="TEU today" value={fmt(sim.teuToday)} delta="↑ 6%" />
      <Kpi icon={<IconCrane />} label="Crane productivity" value={rate.toFixed(1)} unit="moves/h" />
      <Kpi icon={<IconShip />} label="Commercial vessels at berth" value={String(berthed)} sub={`${sim.ships.filter((s) => ['inbound', 'waiting', 'approach'].includes(s.state)).length} arriving · ${sim.ships.filter((s) => s.state === 'anchored').length} at anchor`} />
      <Kpi icon={<IconGrid />} label="Yard utilization" value={`${Math.round(util * 100)}%`} sub={PORT.ct.name} />
    </div>
  )
}
const Kpi = ({ icon, label, value, unit, delta, sub }: { icon: ReactNode; label: string; value: string; unit?: string; delta?: string; sub?: string }) => (
  <div className="card kpi">
    <div className="kpi-icon">{icon}</div>
    <div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value} {unit && <small>{unit}</small>} {delta && <span className="delta">{delta}</span>}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  </div>
)

function TodayCard() {
  const cruise = sim.ships.filter((s) => s.kind === 'cruise' && s.state === 'working')
  const pax = cruise.reduce((a, s) => a + (s.passengers?.total ?? 0), 0)
  const navy = sim.ships.filter((s) => s.cls.navy && s.state === 'working').length
  const boxShips = sim.ships.filter((s) => isBoxShip(s.kind) && s.state === 'working').length
  return (
    <Card title={PORT.id === 'long-beach' ? 'Today in the harbour' : 'Today in the bay'} icon={<IconAnchor width={15} height={15} />}>
      <KV
        rows={[
          ['Cruise ships alongside', `${cruise.length} · ${fmt(pax)} passengers`],
          PORT.id === 'long-beach' ? ['Container ships working', String(boxShips)] : ['Navy ships in port', String(navy)],
          ['Yachts in marinas', fmt(YACHTS.length)],
          ['Cars in waterfront lots', fmt(STALLS.filter((s) => s.occupied).length)],
        ]}
      />
    </Card>
  )
}

function VesselList() {
  const focusShip = useFocusShip()
  const [filter, setFilter] = useState<'all' | 'cargo' | 'cruise' | 'navy' | 'moving'>('all')
  const list = sim.ships.filter((s) =>
    filter === 'all' ? true : filter === 'cargo' ? !s.cls.navy && s.kind !== 'cruise' : filter === 'cruise' ? s.kind === 'cruise' : filter === 'navy' ? !!s.cls.navy : !['working', 'anchored'].includes(s.state),
  )
  return (
    <Card title="Vessels" icon={<IconShip width={15} height={15} />} right={<span className="muted small">{list.length}</span>} className="tall">
      <div className="seg">
        {(['all', 'cargo', 'cruise', 'navy', 'moving'] as const).filter((f) => f !== 'navy' || sim.ships.some((s) => s.cls.navy)).map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={(e) => (e.stopPropagation(), setFilter(f))}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="list scroll">
        {list.map((s) => {
          const st = shipStatus(s)
          return (
            <button key={s.id} className="list-row link" onClick={() => focusShip(s)}>
              <span className={`kind-dot k-${s.cls.navy ? 'navy' : s.kind}`} />
              <span className="grow">
                <b className="ellipsis block">{s.name}</b>
                <span className="muted small block">
                  {s.cls.label} · {berthById(s.berthId).label}
                </span>
              </span>
              <Chip tone={st.tone}>
                {st.label}
                {st.pct !== undefined ? ` ${st.pct}%` : ''}
              </Chip>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function YardPanel() {
  const select = useUI((s) => s.select)
  const perBlock = BLOCKS.map((b, bi) => {
    let used = 0
    let reef = 0
    const per = YARD_ROWS * YARD_STACKS * 12
    for (let i = bi * per; i < (bi + 1) * per; i++) {
      const id = sim.yard[i]
      if (id) {
        used++
        if (containerById(id)?.reefer) reef++
      }
    }
    return { b, used, reef, cap: per }
  })
  return (
    <>
      <Card title={`Yard · ${PORT.ct.code === 'TAMT' ? 'Tenth Avenue' : PORT.ct.name}`} icon={<IconContainer width={15} height={15} />}>
        <div className={`tiles ${perBlock.length === 3 ? 'three' : ''}`}>
          {perBlock.map(({ b, used, reef, cap }) => (
            <div className="tile" key={b.id}>
              <span>Block {b.id}</span>
              <b>
                {Math.round((used / cap) * 100)}% <small>{used} FEU</small>
              </b>
              <Bar value={used / cap} tone={used / cap > 0.8 ? 'amber' : 'blue'} />
              <small className="muted">{reef} reefers</small>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Yard equipment" icon={<IconForklift width={15} height={15} />}>
        <div className="list">
          {sim.rtgs.map((g) => (
            <button key={g.id} className="list-row link" onClick={() => select({ type: 'rtg', id: g.id })}>
              <b className="mono">{g.id}</b>
              <span className="grow ellipsis small">{g.status}</span>
              <Chip tone={g.job ? 'green' : 'grey'}>{g.job ? 'Working' : 'Idle'}</Chip>
            </button>
          ))}
          {sim.handlers.map((h) => (
            <button key={h.id} className="list-row link" onClick={() => select({ type: 'handler', id: h.id }, true)}>
              <b className="mono">{h.id}</b>
              <span className="grow ellipsis small">{h.status}</span>
              <Chip tone={h.phase === 'working' ? 'green' : 'grey'}>{h.phase === 'working' ? 'Working' : 'Parked'}</Chip>
            </button>
          ))}
        </div>
      </Card>
    </>
  )
}

function shipmentRows() {
  const rows: Container[] = []
  const seen = new Set<string>()
  const add = (id?: string | null) => {
    const c = containerById(id ?? undefined)
    if (c && !seen.has(c.id)) {
      seen.add(c.id)
      rows.push(c)
    }
  }
  for (const c of sim.cranes) {
    add(c.carrying)
    for (const t of c.transfer) add(t.cid)
  }
  for (const h of sim.handlers) add(h.carrying)
  for (const s of sim.ships) {
    if (s.state !== 'working') continue
    ;[...s.toDischarge].slice(0, 6).forEach(add)
    s.loadPlan.slice(0, 6).forEach(add)
  }
  return rows.slice(0, 40)
}

function ShipmentsPanel() {
  const select = useUI((s) => s.select)
  const rows = shipmentRows()
  return (
    <Card title="Shipments in progress" icon={<IconBox width={15} height={15} />} right={<span className="muted small">{rows.length}</span>} className="tall">
      <div className="list scroll">
        {rows.map((c) => (
          <button key={c.id} className="list-row link" onClick={() => select({ type: 'container', id: c.id })}>
            <span className="swatch" style={{ background: c.line.color }} />
            <span className="grow">
              <b className="mono block">{c.id}</b>
              <span className="muted small block ellipsis">
                {c.cargo} · {PORTS[c.origin]?.name ?? c.origin} → {c.dest.split(' (')[0]}
              </span>
            </span>
            <Chip tone={c.flow === 'import' ? 'orange' : 'green'}>{c.flow === 'import' ? 'Import' : 'Export'}</Chip>
          </button>
        ))}
      </div>
    </Card>
  )
}

function siteStats(id: string) {
  const r = (k: number) => hash(id.length * 131 + id.charCodeAt(0) * 7 + k + Math.floor(sim.time / 30))
  return { trucks: Math.floor(r(1) * 14) + 2, docks: `${Math.floor(r(2) * 10) + 4}/${Math.floor(r(3) * 8) + 14}`, util: 0.45 + r(4) * 0.5, wait: Math.floor(r(5) * 22) + 3 }
}

function LogisticsPanel() {
  const select = useUI((s) => s.select)
  const sites = [...LOGISTICS, ...PLACES.filter((p) => p.kind === 'industry')]
  return (
    <>
      <Card title="Logistics district" icon={<IconRoute width={15} height={15} />} right={<span className="muted small">{sites.length} sites</span>} className="tall">
        <div className="list scroll">
          {sites.map((p) => {
            const s = siteStats(p.id)
            return (
              <button key={p.id} className="list-row link" onClick={() => select({ type: 'place', id: p.id })}>
                <span className="kind-dot k-logistics" />
                <span className="grow">
                  <b className="block ellipsis">{p.name}</b>
                  <span className="muted small block">
                    {s.trucks} trucks queued · avg wait {s.wait} min
                  </span>
                </span>
                <span className="mini-bar">
                  <Bar value={s.util} tone={s.util > 0.85 ? 'amber' : 'green'} />
                </span>
              </button>
            )
          })}
        </div>
      </Card>
      <Card title="Inland flows" icon={<IconCar width={15} height={15} />}>
        <div className="tiles three">
          <div className="tile">
            <span>Truck</span>
            <b>{PORT.id === 'long-beach' ? '67%' : '78%'}</b>
          </div>
          <div className="tile">
            <span>Rail</span>
            <b>{PORT.id === 'long-beach' ? '28%' : '17%'}</b>
          </div>
          <div className="tile">
            <span>Barge/CFS</span>
            <b>5%</b>
          </div>
        </div>
        <p className="hint">{PORT.id === 'long-beach' ? 'Rail share as reported for 2024 (about 28% of boxes); queues are simulated.' : 'Modal split and queue figures are simulated.'}</p>
      </Card>
    </>
  )
}

// ───────────── right column: selection details or the tab's default card

export function RightColumn() {
  useUI((s) => s.tick)
  const sel = useUI((s) => s.selected)
  const tab = useUI((s) => s.tab)
  let body: ReactNode = null
  if (sel?.type === 'ship' && shipById(sel.id)) body = <ShipPanel s={shipById(sel.id)!} />
  else if (sel?.type === 'container' && containerById(sel.id)) body = <ContainerPanel c={containerById(sel.id)!} />
  else if (sel?.type === 'crane' && craneById(sel.id)) body = <CranePanel c={craneById(sel.id)!} />
  else if (sel?.type === 'rtg' && rtgById(sel.id)) body = <RtgPanel g={rtgById(sel.id)!} />
  else if (sel?.type === 'handler' && handlerById(sel.id)) body = <HandlerPanel h={handlerById(sel.id)!} />
  else if (sel?.type === 'tug' && sim.tugs.find((t) => t.id === sel.id)) body = <TugPanel t={sim.tugs.find((t) => t.id === sel.id)!} />
  else if (sel?.type === 'building') body = <BuildingPanel idx={Number(sel.id)} />
  else if (sel?.type === 'car') body = <CarPanel idx={Number(sel.id)} />
  else if (sel?.type === 'yacht') body = <YachtPanel idx={Number(sel.id)} />
  else if (sel?.type === 'place' && placeById(sel.id)) body = <PlacePanel id={sel.id} />
  if (body) return <aside className="card side">{body}</aside>
  return <AlertsCard compact={tab !== 'overview'} />
}

function AlertsCard({ compact }: { compact: boolean }) {
  const select = useUI((s) => s.select)
  return (
    <Card title="Alerts" icon={<IconAlert width={15} height={15} />} right={<span className="muted small">{sim.alerts.length}</span>} className="alerts">
      <div className="list">
        {sim.alerts.slice(0, compact ? 3 : 6).map((a, i) => (
          <button key={i} className="list-row link alert" onClick={() => a.ref && select({ type: a.ref.type, id: a.ref.id } as never)}>
            <span className={`alert-ic tone-${a.tone}`}>
              <IconAlert width={13} height={13} />
            </span>
            <span className="grow small">{a.text}</span>
            <time className="muted small">{fmtTime(a.t)}</time>
          </button>
        ))}
      </div>
    </Card>
  )
}

// ── ship

function voyageProgress(s: Ship) {
  if (s.state === 'outbound') return 1.04
  if (['inbound', 'anchored', 'waiting'].includes(s.state)) return 0.985
  return 1
}

function ShipPanel({ s }: { s: Ship }) {
  const tab = useUI((st) => st.panelTab)
  const select = useUI((st) => st.select)
  const st = shipStatus(s)
  const b = berthById(s.berthId)
  const prog = shipProgress(s)
  const isBox = isBoxShip(s.kind)
  const capacity = s.slots.length
  const onboard = shipOnboard(s)
  const kn = (s.speed / 11) * s.cls.speedKn * 0.7
  const blocker = shipById(s.blockedBy)
  return (
    <>
      <PanelHead
        kicker={`${s.cls.navy ? 'U.S. Navy' : 'Vessel'} · ${s.cls.label}`}
        title={s.cls.navy ? s.name : `MV ${s.name}`}
        sub={s.navy ? `${s.navy.hull} · ${PORT.text.navyHome ?? 'U.S. Navy'}` : `IMO ${s.imo} · ${s.line.name} · ${s.flag}`}
        icon={s.kind === 'carcarrier' ? <IconCar /> : s.kind === 'cruise' ? <IconUsers /> : <IconShip />}
        actions={
          <>
            <FollowBtn />
            <CloseBtn />
          </>
        }
      />
      <div className="row gap wrap">
        <Chip tone={st.tone}>{st.label}</Chip>
        <span className="muted small">{b.label}</span>
        {s.navy && <Chip tone="grey">Simulated identity</Chip>}
      </div>
      {blocker && <div className="note">Holding for {blocker.name} — keeping a safe distance in the channel.</div>}
      {(s.state === 'working' || s.state === 'ready') && !s.navy && (
        <div className="progress-line">
          <Bar value={prog} tone={st.tone === 'orange' ? 'orange' : 'green'} />
          <span className="small muted">{Math.round(prog * 100)}%</span>
        </div>
      )}
      <Tabs tabs={[{ id: 'overview', label: 'Overview' }, { id: 'cargo', label: isBox ? 'Containers' : s.navy ? 'Ship' : 'Cargo' }, { id: 'route', label: 'Route' }, { id: 'history', label: 'History' }]} />
      {tab === 'overview' && (
        <>
          <div className="voyage">
            <div>
              <span>From</span>
              <b>{PORTS[s.voyage.prev].name}</b>
              <small>{PORTS[s.voyage.prev].country}</small>
            </div>
            <IconChevron className="muted" />
            <div className="hub">
              <span>Now</span>
              <b>{PORT.short}</b>
              <small>{terminalById(b.terminal)?.short ?? b.terminal}</small>
            </div>
            <IconChevron className="muted" />
            <div>
              <span>Next</span>
              <b>{PORTS[s.voyage.next].name}</b>
              <small>{PORTS[s.voyage.next].country}</small>
            </div>
          </div>
          <KV
            rows={[
              [s.ataBerth ? 'Arrived (ATA)' : 'ETA berth', fmtDate(s.ataBerth ?? s.eta)],
              [['outbound', 'unberthing'].includes(s.state) ? 'Departed (ATD)' : 'Departs (ETD)', fmtDate(s.etd)],
              ['Time at berth', s.ataBerth ? fmtDuration((s.state === 'outbound' ? s.etd : sim.time) - s.ataBerth) : '—'],
              ['Service', s.voyage.service],
              ['Speed · heading', `${kn.toFixed(1)} kn · ${String(Math.round(((180 - (s.heading * 180) / Math.PI) % 360 + 360) % 360)).padStart(3, '0')}°`],
              ['Length × beam', `${s.cls.length * 2} m × ${s.cls.beam * 2} m`],
              ['Draft · GT', `${s.cls.draft} m · ${fmt(s.gt)}`],
              ['MMSI · Call sign', `${s.mmsi} · ${s.callSign}`],
            ]}
          />
        </>
      )}
      {tab === 'cargo' && isBox && (
        <>
          <div className="tiles">
            <div className="tile">
              <span>On board</span>
              <b>
                {onboard} <small>/ {capacity} FEU</small>
              </b>
              <Bar value={onboard / capacity} />
            </div>
            <div className="tile">
              <span>Fill rate</span>
              <b>{Math.round((onboard / capacity) * 100)}%</b>
              <small className="muted">{fmt(onboard * 2)} TEU</small>
            </div>
            <div className="tile">
              <span>Discharge</span>
              <b>
                {s.discharged} <small>/ {s.plannedDischarge}</small>
              </b>
              <Bar value={s.plannedDischarge ? s.discharged / s.plannedDischarge : 1} tone="orange" />
            </div>
            <div className="tile">
              <span>Load</span>
              <b>
                {s.loaded} <small>/ {s.plannedLoad}</small>
              </b>
              <Bar value={s.plannedLoad ? s.loaded / s.plannedLoad : 0} tone="green" />
            </div>
          </div>
          <KV rows={[['Reefers on board', String(s.slots.filter((id) => id && containerById(id)?.reefer).length)], ['Remain on board (ROB)', String(s.slots.filter((id) => id && containerById(id)?.flow === 'rob').length)], ['Cranes', s.cranes.length ? s.cranes.join(', ') : '—']]} />
          <div className="section-head">
            <b>Cargo mix</b>
            <span>containers</span>
          </div>
          <CargoMix ids={s.slots.filter(Boolean) as string[]} />
          <div className="section-head">
            <b>On deck</b>
            <span>tap to inspect</span>
          </div>
          <div className="list">
            {(s.slots.filter(Boolean) as string[])
              .slice(-8)
              .reverse()
              .map((id) => {
                const c = containerById(id)!
                return (
                  <button key={id} className="list-row link" onClick={() => select({ type: 'container', id })}>
                    <span className="swatch" style={{ background: c.line.color }} />
                    <span className="grow">
                      <b className="mono">{c.id}</b>
                      <span className="muted small block">
                        {c.cargo} · {c.flow === 'import' ? 'discharge here' : `to ${PORTS[c.pod]?.name ?? c.dest}`}
                      </span>
                    </span>
                    <IconChevron className="muted" />
                  </button>
                )
              })}
          </div>
        </>
      )}
      {tab === 'cargo' && !isBox && <OtherCargo s={s} />}
      {tab === 'route' && (
        <>
          <RouteMap prev={s.voyage.prev} next={s.voyage.next} progress={voyageProgress(s)} />
          <div className="legend">
            <span>
              <i className="lg-in" /> Inbound leg
            </span>
            <span>
              <i className="lg-out" /> Outbound leg
            </span>
          </div>
          <KV
            rows={[
              ['Inbound', `${portName(s.voyage.prev)} → ${PORT.short} · ${fmt(nmBetween(PORTS[s.voyage.prev], HOME))} nm`],
              ['Outbound', `${PORT.short} → ${portName(s.voyage.next)} · ${fmt(nmBetween(HOME, PORTS[s.voyage.next]))} nm`],
              ['Harbour transit', PORT.id === 'long-beach' ? `Queen’s Gate → Long Beach Channel → ${b.label}` : `Point Loma → Ballast Point → main channel → ${b.label}`],
              ['Traffic separation', 'Inbound and outbound lanes, one vessel manoeuvring per basin'],
            ]}
          />
          <p className="hint">On the water: blue dashes = remaining inbound track and planned approach, orange = planned departure track. Vessels hold for traffic ahead, so tracks never overlap in time.</p>
        </>
      )}
      {tab === 'history' && <History events={s.history} />}
    </>
  )
}

function CargoMix({ ids }: { ids: string[] }) {
  const counts = new Map<string, number>()
  for (const id of ids) {
    const c = containerById(id)
    if (c) counts.set(c.cargo, (counts.get(c.cargo) ?? 0) + 1)
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const max = rows[0]?.[1] ?? 1
  return (
    <div className="mix">
      {rows.map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          <Bar value={v / max} />
          <b>{v}</b>
        </div>
      ))}
    </div>
  )
}

function OtherCargo({ s }: { s: Ship }) {
  if (s.vehicles) {
    const v = s.vehicles
    return (
      <>
        <div className="tiles">
          <div className="tile">
            <span>Vehicles on board</span>
            <b>
              {fmt(v.onboard)} <small>/ {fmt(v.total)}</small>
            </b>
            <Bar value={v.onboard / v.total} />
          </div>
          <div className="tile">
            <span>Discharged</span>
            <b>
              {fmt(v.planned - v.toDischarge)} <small>/ {fmt(v.planned)}</small>
            </b>
            <Bar value={1 - v.toDischarge / v.planned} tone="orange" />
          </div>
        </div>
        <KV rows={[['Main brand', v.brand], ['Remain on board', `${fmt(v.total - v.planned)} units → ${PORTS[s.voyage.next].name}`], ['Ramp', 'Stern quarter ramp'], ['Processing', `${PORT.roro.code} lots & processing`]]} />
      </>
    )
  }
  if (s.bulk)
    return (
      <>
        <div className="tiles">
          <div className="tile">
            <span>Cargo remaining</span>
            <b>
              {fmt(s.bulk.remaining)} <small>t</small>
            </b>
            <Bar value={s.bulk.remaining / s.bulk.total} />
          </div>
          <div className="tile">
            <span>Discharge rate</span>
            <b>
              ~920 <small>t/h</small>
            </b>
          </div>
        </div>
        <KV rows={[['Commodity', s.bulk.cargo], ['Total on arrival', `${fmt(s.bulk.total)} t`]]} />
      </>
    )
  if (s.blades)
    return (
      <>
        <div className="tiles">
          <div className="tile">
            <span>Blades on board</span>
            <b>
              {s.blades.onboard} <small>/ {s.blades.total}</small>
            </b>
            <Bar value={s.blades.onboard / s.blades.total} />
          </div>
          <div className="tile">
            <span>Laid down on quay</span>
            <b>{sim.laydown}</b>
          </div>
        </div>
        <KV rows={[['Cargo', 'Wind turbine blades · 68 m'], ['Lift', "Ship's cranes · tandem lift"]]} />
      </>
    )
  if (s.passengers)
    return (
      <>
        <div className="tiles">
          <div className="tile">
            <span>Passengers</span>
            <b>{fmt(s.passengers.total)}</b>
          </div>
          <div className="tile">
            <span>Disembarked</span>
            <b>{fmt(s.passengers.ashore)}</b>
            <Bar value={s.passengers.ashore / s.passengers.total} tone="green" />
          </div>
        </div>
        <KV rows={[['Cruise line', s.passengers.line], ['Itinerary', s.voyage.service], ['Crew', fmt(Math.round(s.passengers.total * 0.38))], ['Terminal', berthById(s.berthId).label]]} />
      </>
    )
  if (s.navy)
    return (
      <KV
        rows={[
          ['Hull number', s.navy.hull],
          ['Class', s.cls.label],
          ['Crew', fmt(s.navy.crew)],
          ['Status', s.navy.status],
          ['Commissioned', String(s.navy.commissioned)],
          ['Mooring', berthPlace(berthById(s.berthId))],
        ]}
      />
    )
  return null
}

// ── container

function containerWhere(c: Container): string {
  const loc = c.loc
  if (loc.kind === 'ship') {
    const s = shipById(loc.shipId)
    if (!s) return 'On vessel'
    const l = slotLocal(s.cls, loc.slot)
    return `MV ${s.name} · Bay ${String(l.bay * 2 + 1).padStart(2, '0')} · Row ${String(l.row).padStart(2, '0')} · Tier ${82 + l.tier * 2}`
  }
  if (loc.kind === 'yard') return `${PORT.ct.code} ${yardLabel(loc.slot)}`
  if (loc.kind === 'crane') return `On ${loc.id} spreader`
  if (loc.kind === 'handler') return `On forklift ${loc.id}`
  if (loc.kind === 'rtg') return `On ${loc.id} (yard re-handle)`
  if (loc.kind === 'transfer') return `${PORT.ct.code} apron · under ${loc.craneId}`
  return loc.where
}

function plannedSteps(c: Container): HistoryEvent[] {
  const t = sim.time
  if (c.flow === 'import' && c.loc.kind !== 'gone') {
    const steps: HistoryEvent[] = []
    if (c.loc.kind !== 'yard') steps.push({ t: t + 30, event: 'Stack in yard', place: `${PORT.ct.code} yard`, planned: true })
    if (!c.history.some((h) => h.event.startsWith('Customs'))) steps.push({ t: t + 180, event: 'Customs release (CBP)', place: PORT.ct.code, planned: true })
    steps.push({ t: t + 420, event: 'Gate out · truck/rail', place: `${PORT.ct.code} → ${c.dest}`, planned: true })
    steps.push({ t: t + 1500, event: 'Delivered', place: `${c.consignee} · ${c.dest}`, planned: true })
    return steps
  }
  if ((c.flow === 'export' || c.flow === 'empty') && c.vesselId && c.loc.kind !== 'ship') return [{ t: t + 40, event: `Load on ${c.vesselName}`, place: `${PORT.ct.code} quay`, planned: true }]
  return []
}

function ContainerPanel({ c }: { c: Container }) {
  const tab = useUI((s) => s.panelTab)
  const select = useUI((s) => s.select)
  const vessel = c.loc.kind === 'ship' ? shipById(c.loc.shipId) : shipById(c.vesselId)
  const tone: Tone = c.loc.kind === 'gone' ? 'grey' : c.loc.kind === 'ship' ? 'blue' : c.loc.kind === 'yard' ? 'green' : 'orange'
  const flowLabel = { import: 'Import', export: 'Export', rob: 'Transit (ROB)', empty: 'Empty' }[c.flow]
  return (
    <>
      <PanelHead kicker={`Container · ${c.size}`} title={c.id} sub={`${c.line.name} · seal ${c.seal}`} icon={<IconContainer />} actions={<CloseBtn />} />
      <div className="row gap wrap">
        <Chip tone={tone}>{c.status.split(' · ')[0]}</Chip>
        <Chip tone="grey">{flowLabel}</Chip>
        {c.reefer && <Chip tone="blue">Reefer {c.temp !== undefined ? `${c.temp > 0 ? '+' : ''}${c.temp}°C` : 'off'}</Chip>}
      </div>
      <Tabs tabs={[{ id: 'overview', label: 'Overview' }, { id: 'history', label: 'Tracking history' }]} />
      {tab === 'overview' && (
        <>
          <div className="voyage">
            <div>
              <span>Origin</span>
              <b>{PORTS[c.origin]?.name ?? c.origin}</b>
              <small>{PORTS[c.origin]?.country ?? ''}</small>
            </div>
            <IconChevron className="muted" />
            <div className="hub">
              <span>Via</span>
              <b>{PORT.short}</b>
              <small>{PORT.ct.code}</small>
            </div>
            <IconChevron className="muted" />
            <div>
              <span>Destination</span>
              <b>{c.dest.split(' (')[0]}</b>
              <small>{c.dest.includes('(') ? c.dest.split('(')[1].replace(')', '') : PORTS[c.pod]?.country ?? ''}</small>
            </div>
          </div>
          <div className="tiles">
            <div className="tile">
              <span>Contents</span>
              <b className="tile-text">{c.cargo}</b>
            </div>
            <div className="tile">
              <span>Fill level</span>
              <b>{c.fill}%</b>
              <Bar value={c.fill / 100} tone="green" />
            </div>
          </div>
          <KV
            rows={[
              ['Current location', containerWhere(c)],
              ['Gross weight', `${c.weight.toFixed(1)} t (tare ${c.tare} t)`],
              ['Shipper', c.shipper],
              ['Consignee', c.consignee],
              ['Vessel', vessel ? <button className="link-text" onClick={() => select({ type: 'ship', id: vessel.id })}>MV {vessel.name}</button> : c.vesselName ?? '—'],
              ['Status', c.status],
            ]}
          />
        </>
      )}
      {tab === 'history' && <History events={[...c.history, ...plannedSteps(c)]} />}
    </>
  )
}

/** shipment journey strip for the selected container (Shipments tab) */
export function JourneyStrip() {
  useUI((s) => s.tick)
  const sel = useUI((s) => s.selected)
  const tab = useUI((s) => s.tab)
  if (tab !== 'shipments' || sel?.type !== 'container') return null
  const c = containerById(sel.id)
  if (!c) return null
  const has = (k: string) => c.history.find((h) => h.event.startsWith(k))
  const steps =
    c.flow === 'import' || c.flow === 'rob'
      ? [
          { l: 'Loaded', e: has('Loaded on') },
          { l: 'Departed', e: has('Vessel departed') },
          { l: 'Discharged', e: has('Discharged') },
          { l: 'In yard', e: has('Stacked in yard') },
          { l: 'Customs', e: has('Customs') },
          { l: 'Gate out', e: has('Gate out') },
        ]
      : [
          { l: 'Gate in', e: has('Gate in') },
          { l: 'In yard', e: has('Stacked in yard') },
          { l: 'Booked', e: has('Booked on') },
          { l: 'To quay', e: has('Delivered to quay') },
          { l: 'Loaded', e: has('Loaded on') },
        ]
  const cur = steps.findIndex((s) => !s.e)
  return (
    <div className="card journey">
      <div className="journey-head">
        <b>Shipment journey</b>
        <span className="muted small">
          {c.flow === 'import' ? 'Import' : 'Export'} · {c.id} · {c.cargo}
        </span>
      </div>
      <div className="steps">
        {steps.map((s, i) => (
          <div key={s.l} className={`step ${s.e ? 'done' : ''} ${i === cur ? 'cur' : ''}`}>
            <div className="step-dot">{s.e ? '✓' : i + 1}</div>
            <div className="step-label">{s.l}</div>
            <div className="step-time">{s.e ? fmtTime(s.e.t) : i === cur ? 'next' : '--:--'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── equipment

function CranePanel({ c }: { c: Crane }) {
  const ship = shipById(c.shipId)
  const select = useUI((s) => s.select)
  const cont = containerById(c.carrying ?? undefined)
  return (
    <>
      <PanelHead
        kicker={PORT.ct.crane === 'sts' ? `Ship-to-shore crane · ${PORT.ct.code}` : `Mobile harbour crane · ${PORT.ct.code}`}
        title={c.id}
        sub={PORT.ct.crane === 'sts' ? 'Electric super-post-Panamax STS · 24 boxes wide · 65 t' : 'All-electric MHC · 200 t'}
        icon={<IconCrane />}
        actions={<CloseBtn />}
      />
      <div className="row gap wrap">
        <Chip tone={c.job ? 'green' : c.phase === 'travel' ? 'blue' : 'grey'}>{c.job ? (c.job.type === 'discharge' ? 'Discharging' : 'Loading') : c.phase === 'travel' ? 'Travelling' : 'Idle'}</Chip>
        <span className="muted small ellipsis">{c.status}</span>
      </div>
      <div className="tiles">
        <div className="tile">
          <span>Productivity</span>
          <b>
            {craneRate(c)} <small>moves/h</small>
          </b>
          <Bar value={craneRate(c) / 35} tone="green" />
        </div>
        <div className="tile">
          <span>Outreach</span>
          <b>
            {(c.radius * 2).toFixed(0)} <small>m</small>
          </b>
        </div>
      </div>
      <KV
        rows={[
          ['Assigned vessel', ship ? <button className="link-text" onClick={() => select({ type: 'ship', id: ship.id })}>MV {ship.name}</button> : '—'],
          ['On spreader', cont ? <button className="link-text" onClick={() => select({ type: 'container', id: cont.id })}>{cont.id}</button> : 'Empty'],
          ['Hook height', `${((c.hookY - 2) * 2).toFixed(0)} m above quay`],
          ['Power', 'Shore power · zero tailpipe emissions'],
        ]}
      />
    </>
  )
}

function RtgPanel({ g }: { g: Rtg }) {
  const select = useUI((s) => s.select)
  const cont = containerById(g.carrying ?? undefined)
  return (
    <>
      <PanelHead
        kicker={PORT.ct.crane === 'sts' ? `Automated stacking crane · ${PORT.ct.code}` : `Yard gantry crane · ${PORT.ct.code}`}
        title={g.id}
        sub={`Block ${BLOCKS[g.block].id} · rows 2–3 · 40 t`}
        icon={<IconCrane />}
        actions={<CloseBtn />}
      />
      <div className="row gap wrap">
        <Chip tone={g.job ? 'green' : 'grey'}>{g.job ? 'Re-handling' : 'Standing by'}</Chip>
        <span className="muted small ellipsis">{g.status}</span>
      </div>
      <div className="tiles">
        <div className="tile">
          <span>Moves today</span>
          <b>{g.moves}</b>
        </div>
        <div className="tile">
          <span>Hoist</span>
          <b>
            {((g.hookY - 2) * 2).toFixed(1)} <small>m</small>
          </b>
        </div>
      </div>
      <KV rows={[['On spreader', cont ? <button className="link-text" onClick={() => select({ type: 'container', id: cont.id })}>{cont.id}</button> : 'Empty'], ['Task', 'Pre-marshalling deep rows for gate-out']]} />
    </>
  )
}

function HandlerPanel({ h }: { h: Handler }) {
  const select = useUI((s) => s.select)
  const cont = containerById(h.carrying ?? undefined)
  return (
    <>
      <PanelHead
        kicker={PORT.ct.crane === 'sts' ? `Electric top handler · ${PORT.ct.code}` : `Container forklift · ${PORT.ct.code}`}
        title={h.id}
        sub={`${PORT.ct.crane === 'sts' ? 'Battery-electric laden handler' : 'Laden top-loader'} · 45 t · ${h.operator}`}
        icon={<IconForklift />}
        actions={
          <>
            <FollowBtn />
            <CloseBtn />
          </>
        }
      />
      <div className="row gap wrap">
        <Chip tone={h.phase === 'working' ? 'green' : 'grey'}>{h.phase === 'working' ? 'Working' : 'Parked'}</Chip>
        <span className="muted small ellipsis">{h.status}</span>
      </div>
      <div className="tiles">
        <div className="tile">
          <span>Moves today</span>
          <b>{h.moves}</b>
        </div>
        <div className="tile">
          <span>Battery</span>
          <b>{Math.round(h.fuel)}%</b>
          <Bar value={h.fuel / 100} tone={h.fuel < 25 ? 'amber' : 'green'} />
        </div>
      </div>
      <KV rows={[['Carrying', cont ? <button className="link-text" onClick={() => select({ type: 'container', id: cont.id })}>{cont.id}</button> : 'Empty'], ['Lift height', `${((h.lift - 2) * 2).toFixed(1)} m`], ['Speed', `${(h.speed * 7.2).toFixed(0)} km/h`]]} />
    </>
  )
}

function TugPanel({ t }: { t: Tug }) {
  const ship = shipById(t.shipId)
  return (
    <>
      <PanelHead kicker="Harbour tug" title={t.name} sub="ASD tug · 70 t bollard pull" icon={<IconAnchor />} actions={<><FollowBtn /><CloseBtn /></>} />
      <div className="row gap">
        <Chip tone={ship ? 'blue' : 'grey'}>{ship ? 'Assisting' : 'Standing by'}</Chip>
        <span className="muted small">{ship ? ship.name : PORT.id === 'long-beach' ? 'Tug berth · Long Beach Harbor' : 'Tug berth · Barrio Logan'}</span>
      </div>
      <KV rows={[['Speed', `${(t.speed * 3.9).toFixed(1)} kn`], ['Position', t.shipId ? (t.offset > 0 ? 'Bow' : 'Stern') : 'Moored']]} />
    </>
  )
}

// ── buildings, cars, yachts, places

const LOGI_TYPES = ['warehouse', 'industrial', 'hangar']
function BuildingPanel({ idx }: { idx: number }) {
  const b = GEO.buildings[idx]
  if (!b) return null
  let cx = 0
  let cz = 0
  for (const [x, z] of b.p) {
    cx += x
    cz += z
  }
  cx /= b.p.length
  cz /= b.p.length
  const ll = lonLat(cx, cz)
  const logistic = LOGI_TYPES.includes(b.t) || /logistic|freight|storage|warehouse|terminal|cold/i.test(b.n ?? '')
  const r = (k: number) => hash(idx * 17 + k + Math.floor(sim.time / 20))
  const typeLabel = b.t === 'yes' ? 'Building' : b.t[0].toUpperCase() + b.t.slice(1)
  return (
    <>
      <PanelHead kicker={logistic ? 'Logistics facility' : typeLabel} title={b.n ?? `${typeLabel}`} sub={b.street ? `${b.housenumber ?? ''} ${b.street}`.trim() : `${ll.lat.toFixed(5)}, ${ll.lon.toFixed(5)}`} icon={<IconBuilding />} actions={<><FocusBtn x={cx} z={cz} /><CloseBtn /></>} />
      <KV
        rows={[
          ['Type', typeLabel],
          ['Height', `${Math.round(b.h * 2)} m${b.levels ? ` · ${b.levels} floors` : ''}`],
          ...(b.operator ? [['Operator', b.operator] as [string, string]] : []),
          ...(b.amenity || b.tourism || b.office || b.shop ? [['Use', b.amenity ?? b.tourism ?? b.office ?? b.shop ?? ''] as [string, string]] : []),
          ['Coordinates', `${ll.lat.toFixed(5)}°N, ${Math.abs(ll.lon).toFixed(5)}°W`],
        ]}
      />
      {logistic && (
        <>
          <div className="section-head">
            <b>Live operations</b>
            <span>simulated</span>
          </div>
          <div className="tiles">
            <div className="tile">
              <span>Dock doors busy</span>
              <b>
                {Math.floor(r(1) * 10) + 3} <small>/ {Math.floor(r(2) * 8) + 14}</small>
              </b>
            </div>
            <div className="tile">
              <span>Space utilization</span>
              <b>{Math.round(55 + r(3) * 40)}%</b>
              <Bar value={0.55 + r(3) * 0.4} tone="green" />
            </div>
            <div className="tile">
              <span>Trucks queued</span>
              <b>{Math.floor(r(4) * 9)}</b>
            </div>
            <div className="tile">
              <span>Pallets moved today</span>
              <b>{fmt(400 + r(5) * 2600)}</b>
            </div>
          </div>
        </>
      )}
      <p className="hint">Footprint, height and name from OpenStreetMap.</p>
    </>
  )
}

function CarPanel({ idx }: { idx: number }) {
  const s = STALLS[idx]
  if (!s) return null
  const c = carInfo(idx, sim.time)
  const mins = sim.time - c.enteredMin
  const lot = LOTS[s.lot]
  return (
    <>
      <PanelHead kicker={`Parked car · ${c.ev ? 'Electric' : 'Gasoline'}`} title={`${c.make} ${c.model}`} sub={`${c.year} · ${c.color}`} icon={<IconCar />} actions={<><FocusBtn x={s.x} z={s.z} dist={60} /><CloseBtn /></>} />
      <div className={`plate ${c.state === 'California' ? 'ca' : ''}`}>
        <small>{c.state}</small>
        <b>{c.plate}</b>
      </div>
      <div className="tiles">
        <div className="tile">
          <span>Parked for</span>
          <b>
            {Math.floor(mins / 60)} <small>h</small> {Math.floor(mins % 60)} <small>min</small>
          </b>
        </div>
        <div className="tile">
          <span>Fee so far</span>
          <b>{c.rate ? `$${Math.max(c.rate, Math.ceil(mins / 60) * c.rate).toFixed(2)}` : 'Free'}</b>
        </div>
      </div>
      <KV
        rows={[
          ['Entered', fmtDate(c.enteredMin)],
          ['Lot', c.lot],
          ['Stall', c.stall],
          ['Rate', c.rate ? `$${c.rate}.00 / hour` : 'No charge'],
          ['Payment', c.paid],
          ['Lot occupancy', lot ? `${lot.occupied} / ${lot.stalls} stalls` : '—'],
        ]}
      />
      <p className="hint">Vehicle details are simulated; the car park outline comes from OpenStreetMap.</p>
    </>
  )
}

function YachtPanel({ idx }: { idx: number }) {
  const y = YACHTS[idx]
  if (!y) return null
  const info = yachtInfo(idx)
  const m = MARINAS[y.marina]
  return (
    <>
      <PanelHead kicker={`${info.type} · ${info.lengthM} m`} title={info.name} sub={`${info.builder} · ${info.year} · ${info.flag}`} icon={<IconYacht />} actions={<><FocusBtn x={y.x} z={y.z} dist={70} /><CloseBtn /></>} />
      <div className="row gap wrap">
        <Chip tone="blue">{info.status}</Chip>
        <span className="muted small">
          {info.marina} · slip {info.slip}
        </span>
      </div>
      <div className="tiles">
        <div className="tile">
          <span>In marina</span>
          <b>
            {info.daysInMarina} <small>days</small>
          </b>
        </div>
        <div className="tile">
          <span>Arrived</span>
          <b className="tile-text">{fmtDate(sim.time - info.arrivedMinAgo).split(' · ')[0]}</b>
        </div>
      </div>
      <KV
        rows={[
          ['IMO', info.imo],
          ['MMSI', info.mmsi],
          ['Owner', info.owner],
          ['Captain', info.captain],
          ['Home port', info.homeport],
          ['Length × beam', `${info.lengthM} m × ${info.beamM} m`],
          ['Marina occupancy', m ? `${m.occupied} / ${m.slips} slips` : '—'],
        ]}
      />
      <p className="hint">Yacht identities are simulated; marinas and docks come from OpenStreetMap.</p>
    </>
  )
}

function PlacePanel({ id }: { id: string }) {
  const p = placeById(id)!
  const ll = lonLat(p.x, p.z)
  const statue = id === STATUE_ID
  const logi = p.kind === 'logistics' ? siteStats(p.id) : null
  return (
    <>
      <PanelHead
        kicker={p.id.startsWith('marina-') ? 'Yacht marina' : { museum: 'Museum', landmark: 'Landmark', park: 'Park', terminal: 'Marine terminal', navy: 'U.S. Navy', industry: PORT.id === 'long-beach' ? 'Industry' : 'Shipyard', leisure: 'Waterfront', transport: 'Transport', logistics: 'Logistics site' }[p.kind]}
        title={p.name}
        sub={`${ll.lat.toFixed(4)}°N, ${Math.abs(ll.lon).toFixed(4)}°W`}
        icon={statue ? <IconStatue /> : p.kind === 'logistics' ? <IconDock /> : <IconPinMap />}
        actions={<><FocusBtn x={p.x} z={p.z} dist={statue ? 45 : 220} /><CloseBtn /></>}
      />
      <p className="blurb">{p.blurb}</p>
      {p.facts.length > 0 && <KV rows={p.facts} />}
      {logi && (
        <div className="tiles">
          <div className="tile">
            <span>Trucks queued</span>
            <b>{logi.trucks}</b>
          </div>
          <div className="tile">
            <span>Dock doors</span>
            <b>{logi.docks}</b>
          </div>
          <div className="tile">
            <span>Utilization</span>
            <b>{Math.round(logi.util * 100)}%</b>
            <Bar value={logi.util} tone="green" />
          </div>
          <div className="tile">
            <span>Avg truck wait</span>
            <b>
              {logi.wait} <small>min</small>
            </b>
          </div>
        </div>
      )}
      {logi && <p className="hint">Operating figures are simulated.</p>}
    </>
  )
}

// ───────────── bottom dock: berth plan + time controls

const WINDOW_BEFORE = 8 * 60
const WINDOW_AFTER = 16 * 60

export function BottomDock() {
  useUI((s) => s.tick)
  const open = useUI((s) => s.dockOpen)
  const toggle = useUI((s) => s.toggle)
  const tab = useUI((s) => s.bottomTab)
  const setTab = useUI((s) => s.setBottomTab)
  return (
    <div className="card dock">
      <div className="dock-head">
        <div className="tabs">
          <button className={tab === 'berths' ? 'on' : ''} onClick={() => setTab('berths')}>
            Berth plan
          </button>
          <button className={tab === 'vessels' ? 'on' : ''} onClick={() => setTab('vessels')}>
            Vessels <span>{sim.ships.length}</span>
          </button>
          <button className={tab === 'equipment' ? 'on' : ''} onClick={() => setTab('equipment')}>
            Equipment
          </button>
        </div>
        <div className="row gap">
          <div className="dock-legend">
            <span><i className="lg lg-orange" />Discharging</span>
            <span><i className="lg lg-green" />Loading / turnaround</span>
            <span><i className="lg lg-blue" />Arriving</span>
            <span><i className="lg lg-amber" />At anchor</span>
            <span><i className="lg lg-plan" />Planned</span>
          </div>
          <button className="icon-btn sm" onClick={() => toggle('dockOpen')} title={open ? 'Collapse' : 'Expand'}>
            <IconChevronDown className={`chev ${open ? '' : 'up'}`} />
          </button>
        </div>
      </div>
      {open && tab === 'berths' && <BerthPlan />}
      {open && tab === 'vessels' && <VesselTable />}
      {open && tab === 'equipment' && <EquipmentTable />}
      <TimeControls />
    </div>
  )
}

const PLAN_BERTHS = Object.keys(PORT.schedule)
function BerthPlan() {
  const focusShip = useFocusShip()
  const berths = BERTHS.filter((b) => PLAN_BERTHS.includes(b.id))
  const t0 = sim.time - WINDOW_BEFORE
  const span = WINDOW_BEFORE + WINDOW_AFTER
  const pct = (t: number) => ((t - t0) / span) * 100
  const hours: number[] = []
  for (let h = Math.ceil(t0 / 120) * 120; h < t0 + span; h += 120) hours.push(h)
  return (
    <div className="gantt">
      <div className="g-axis">
        <span className="g-label" />
        <div className="g-track">
          {hours.map((h) => (
            <span key={h} style={{ left: `${pct(h)}%` }}>
              {fmtTime(h)}
            </span>
          ))}
        </div>
      </div>
      {berths.map((b) => (
        <div className="g-row" key={b.id}>
          <span className="g-label">
            <b>{b.id}</b>
            <small>{terminalById(b.terminal)?.code ?? b.terminal}</small>
          </span>
          <div className="g-track">
            {sim.calls
              .filter((c) => c.berthId === b.id && c.etd > t0 && c.eta < t0 + span)
              .map((c) => {
                const s = shipById(c.shipId)
                let cls = 'plan'
                if (c.status === 'departed') cls = 'done'
                else if (c.status === 'anchored' || s?.state === 'anchored') cls = 'amber'
                else if (s && ['inbound', 'waiting', 'approach', 'berthing'].includes(s.state)) cls = 'blue'
                else if (s && s.state === 'working') cls = shipStatus(s).tone === 'orange' ? 'orange' : 'green'
                else if (s && s.state === 'ready') cls = 'green'
                const eta = s?.ataBerth ?? c.eta
                const etd = s && !['outbound', 'unberthing'].includes(s.state) ? Math.max(s.etd, sim.time + 10) : c.etd
                const left = Math.max(0, pct(eta))
                const right = Math.min(100, pct(etd))
                return (
                  <button
                    key={c.id}
                    className={`g-bar g-${cls}`}
                    style={{ left: `${left}%`, width: `${Math.max(0.8, right - left)}%` }}
                    title={`${c.name} · ${fmtTime(eta)}–${fmtTime(etd)}`}
                    onClick={() => s && focusShip(s)}
                  >
                    {c.name.toUpperCase()}
                  </button>
                )
              })}
          </div>
        </div>
      ))}
      <div className="g-now" style={{ left: `calc(64px + (100% - 64px) * ${WINDOW_BEFORE / span})` }}>
        <span>{fmtTime(sim.time)}</span>
      </div>
    </div>
  )
}

function VesselTable() {
  const focusShip = useFocusShip()
  return (
    <div className="vtable">
      {sim.ships.map((s) => {
        const st = shipStatus(s)
        return (
          <button key={s.id} className="vrow" onClick={() => focusShip(s)}>
            <b className="ellipsis">{s.name}</b>
            <span className="muted">{s.cls.label}</span>
            <span className="ellipsis">
              {PORTS[s.voyage.prev].name} → {PORTS[s.voyage.next].name}
            </span>
            <span className="muted">{s.berthId}</span>
            <Chip tone={st.tone}>
              {st.label}
              {st.pct !== undefined ? ` ${st.pct}%` : ''}
            </Chip>
            <span className="muted small">ETD {fmtTime(s.etd)}</span>
          </button>
        )
      })}
    </div>
  )
}

function EquipmentTable() {
  const select = useUI((s) => s.select)
  return (
    <div className="vtable">
      {sim.cranes.map((c) => (
        <button key={c.id} className="vrow" onClick={() => select({ type: 'crane', id: c.id })}>
          <b>{c.id}</b>
          <span className="muted">Mobile harbour crane</span>
          <span className="ellipsis">{c.status}</span>
          <span className="muted">{craneRate(c)} mv/h</span>
          <Chip tone={c.job ? 'green' : 'grey'}>{c.job ? 'Working' : 'Idle'}</Chip>
          <span />
        </button>
      ))}
      {sim.rtgs.map((g) => (
        <button key={g.id} className="vrow" onClick={() => select({ type: 'rtg', id: g.id })}>
          <b>{g.id}</b>
          <span className="muted">Yard gantry crane</span>
          <span className="ellipsis">{g.status}</span>
          <span className="muted">{g.moves} moves</span>
          <Chip tone={g.job ? 'green' : 'grey'}>{g.job ? 'Working' : 'Idle'}</Chip>
          <span />
        </button>
      ))}
      {sim.handlers.map((h) => (
        <button key={h.id} className="vrow" onClick={() => select({ type: 'handler', id: h.id }, true)}>
          <b>{h.id}</b>
          <span className="muted">Container forklift</span>
          <span className="ellipsis">{h.status}</span>
          <span className="muted">{h.moves} moves</span>
          <Chip tone={h.phase === 'working' ? 'green' : 'grey'}>{h.phase === 'working' ? 'Working' : 'Parked'}</Chip>
          <span />
        </button>
      ))}
    </div>
  )
}

function TimeControls() {
  const [, force] = useState(0)
  const setSpeed = (v: number) => {
    sim.speed = v
    force((n) => n + 1)
  }
  return (
    <div className="timebar">
      <button className="play" onClick={() => setSpeed(sim.speed === 0 ? 1 : 0)} title={sim.speed === 0 ? 'Play' : 'Pause'}>
        {sim.speed === 0 ? <IconPlay width={14} height={14} /> : <IconPause width={14} height={14} />}
      </button>
      <div className="clock">
        <b>{fmtClock(sim.time)}</b>
        <small>
          {fmtDate(sim.time).split(' · ')[0]} · {sim.speed === 0 ? 'Paused' : sim.speed === 1 ? 'Live' : `Fast-forward ×${sim.speed}`}
        </small>
      </div>
      <div className="speeds">
        {[1, 4, 16].map((v) => (
          <button key={v} className={sim.speed === v ? 'on' : ''} onClick={() => setSpeed(v)}>
            ×{v}
          </button>
        ))}
      </div>
      <span className="muted small timebar-note">Map data © OpenStreetMap contributors · vessel, cargo and people data simulated</span>
    </div>
  )
}
