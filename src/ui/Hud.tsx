import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  sim, shipById, containerById, craneById, handlerById, shipProgress, shipOnboard, craneRate, yardLabel, slotLocal,
} from '../sim/sim'
import type { Ship, Container, Crane, Handler, Tug, HistoryEvent } from '../sim/sim'
import { BERTHS, PORTS, TERMINALS, berthById } from '../sim/world'
import { fmtDate, fmtTime, fmtDuration, nmBetween } from '../sim/data'
import { useUI } from '../store'
import type { View } from '../store'
import { shipStatus, fmt } from './format'
import type { Tone } from './format'
import { RouteMap } from './RouteMap'
import {
  IconSearch, IconBell, IconBox, IconPlus, IconMinus, IconRotL, IconRotR, IconHome, IconChevron, IconChevronDown, IconX,
  IconTarget, IconShip, IconCrane, IconAnchor, IconPlay, IconPause, IconRoute, IconContainer, IconCar, IconAlert, IconUsers,
  IconForklift, IconGrid, IconClock, Logo,
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
const portName = (code: string) => {
  const p = PORTS[code]
  return p ? `${p.name}, ${p.country}` : code
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

// ───────────── top bar

export function TopBar() {
  useUI((s) => s.tick)
  const view = useUI((s) => s.view)
  const setView = useUI((s) => s.setView)
  const select = useUI((s) => s.select)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const results = useMemo(() => {
    const k = q.trim().toLowerCase().replace(/\s/g, '')
    if (k.length < 2) return []
    const out: { key: string; label: string; sub: string; go: () => void }[] = []
    for (const s of sim.ships)
      if (`${s.name}${s.imo}`.toLowerCase().replace(/\s/g, '').includes(k))
        out.push({ key: s.id, label: `MV ${s.name}`, sub: `${s.cls.label} · ${shipStatus(s).label}`, go: () => select({ type: 'ship', id: s.id }, s.state !== 'working') })
    for (const c of sim.cranes) if (c.id.toLowerCase().replace('-', '').includes(k.replace('-', ''))) out.push({ key: c.id, label: c.id, sub: 'Mobile harbour crane', go: () => select({ type: 'crane', id: c.id }) })
    for (const h of sim.handlers) if (h.id.toLowerCase().replace('-', '').includes(k.replace('-', ''))) out.push({ key: h.id, label: h.id, sub: 'Container forklift', go: () => select({ type: 'handler', id: h.id }, true) })
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

  const views: { id: View; label: string }[] = [
    { id: 'TAMT', label: 'Tenth Avenue' },
    { id: 'NCMT', label: 'National City' },
    { id: 'CRUISE', label: 'B Street' },
    { id: 'BAY', label: 'Bay overview' },
  ]
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <span>
          AnyMile <em>Port</em>
        </span>
      </div>
      <nav className="views">
        {views.map((v) => (
          <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </nav>
      <div className="search">
        <IconSearch className="muted" />
        <input
          placeholder="Search vessels, containers, cranes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && results.length > 0 && (
          <div className="search-results card">
            {results.map((r) => (
              <button key={r.key} onMouseDown={() => (r.go(), setQ(''))}>
                <b>{r.label}</b>
                <span>{r.sub}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="site">
        <span className="pin-dot" />
        <span>
          <b>Port of San Diego</b>
          <small>San Diego Bay · CA</small>
        </span>
      </div>
      <div className="live">
        <span className="live-dot" /> {sim.speed === 0 ? 'Paused' : 'Live'} <b>{fmtTime(sim.time)}</b>
      </div>
      <button className="icon-btn bell">
        <IconBell />
        {sim.alerts.length > 0 && <span className="badge-dot" />}
      </button>
      <div className="user">
        <div className="avatar">CB</div>
        <div>
          <b>Cahit Berkay</b>
          <span>Operations Manager</span>
        </div>
        <IconChevronDown className="muted" />
      </div>
    </header>
  )
}

// ───────────── KPIs

export function Kpis() {
  useUI((s) => s.tick)
  const berthed = sim.ships.filter((s) => ['working', 'ready', 'berthing'].includes(s.state)).length
  const inbound = sim.ships.filter((s) => s.state === 'inbound').length
  const anchored = sim.ships.filter((s) => s.state === 'anchored').length
  const rate = sim.cranes.reduce((a, c) => a + craneRate(c), 0) / sim.cranes.length
  const util = sim.yard.filter(Boolean).length / sim.yard.length
  return (
    <div className="kpis">
      <Kpi icon={<IconContainer />} label="TEU today" value={fmt(sim.teuToday)} delta="↑ 6%" />
      <Kpi icon={<IconCrane />} label="Crane productivity" value={rate.toFixed(1)} unit="moves/h" />
      <Kpi icon={<IconShip />} label="Vessels in port" value={String(berthed)} sub={`${inbound} arriving · ${anchored} at anchor`} />
      <Kpi icon={<IconGrid />} label="Yard utilization" value={`${Math.round(util * 100)}%`} sub="Tenth Avenue" />
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

export function CamToolbar() {
  const cam = useUI((s) => s.cam)
  const show = useUI((s) => s.showRoutes)
  const setShow = useUI((s) => s.setShowRoutes)
  const view = useUI((s) => s.view)
  return (
    <div className="card cam-toolbar">
      <button title="Zoom in" onClick={() => cam({ kind: 'zoom', dir: 1 })}><IconPlus /></button>
      <button title="Zoom out" onClick={() => cam({ kind: 'zoom', dir: -1 })}><IconMinus /></button>
      <span className="sep" />
      <button title="Rotate left" onClick={() => cam({ kind: 'rotate', dir: 1 })}><IconRotL /></button>
      <button title="Rotate right" onClick={() => cam({ kind: 'rotate', dir: -1 })}><IconRotR /></button>
      <button title="Reset view" onClick={() => cam({ kind: 'view', view })}><IconHome /></button>
      <span className="sep" />
      <button title="Show vessel routes" className={show ? 'on' : ''} onClick={() => setShow(!show)}><IconRoute /></button>
    </div>
  )
}

// ───────────── right panel

export function SidePanel() {
  useUI((s) => s.tick)
  const sel = useUI((s) => s.selected)
  const view = useUI((s) => s.view)
  let body: ReactNode
  if (sel?.type === 'ship' && shipById(sel.id)) body = <ShipPanel s={shipById(sel.id)!} />
  else if (sel?.type === 'container' && containerById(sel.id)) body = <ContainerPanel c={containerById(sel.id)!} />
  else if (sel?.type === 'crane' && craneById(sel.id)) body = <CranePanel c={craneById(sel.id)!} />
  else if (sel?.type === 'handler' && handlerById(sel.id)) body = <HandlerPanel h={handlerById(sel.id)!} />
  else if (sel?.type === 'tug' && sim.tugs.find((t) => t.id === sel.id)) body = <TugPanel t={sim.tugs.find((t) => t.id === sel.id)!} />
  else body = <TerminalPanel view={view} />
  return <aside className="card side">{body}</aside>
}

// ── ship

function voyageProgress(s: Ship) {
  if (s.state === 'outbound') {
    const total = Math.max(1, s.path.length)
    return 1 + Math.min(0.08, 0.08 * (1 - total / 4000))
  }
  if (s.state === 'inbound' || s.state === 'anchored') return 0.985
  return 1
}

function ShipPanel({ s }: { s: Ship }) {
  const tab = useUI((st) => st.panelTab)
  const select = useUI((st) => st.select)
  const st = shipStatus(s)
  const b = berthById(s.berthId)
  const prog = shipProgress(s)
  const isBox = s.kind === 'container' || s.kind === 'feeder'
  const capacity = s.slots.length
  const onboard = shipOnboard(s)
  const kn = (s.speed / 9) * s.cls.speedKn * 0.75
  const term = TERMINALS.find((t) => t.id === b.terminal)!
  return (
    <>
      <PanelHead
        kicker={`Vessel · ${s.cls.label}`}
        title={`MV ${s.name}`}
        sub={`IMO ${s.imo} · ${s.line.name} · ${s.flag}`}
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
        <span className="muted small">
          {term.code} {b.id} · Voy {s.voyageNo}
        </span>
      </div>
      {(s.state === 'working' || s.state === 'ready') && (
        <div className="progress-line">
          <Bar value={prog} tone={st.tone === 'orange' ? 'orange' : 'green'} />
          <span className="small muted">{Math.round(prog * 100)}%</span>
        </div>
      )}
      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'cargo', label: isBox ? 'Containers' : 'Cargo' },
          { id: 'route', label: 'Route' },
          { id: 'history', label: 'History' },
        ]}
      />
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
              <b>San Diego</b>
              <small>{term.short}</small>
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
              [s.ataBerth ? 'Berthed (ATA)' : 'ETA berth', fmtDate(s.ataBerth ?? s.eta)],
              [s.state === 'outbound' || s.state === 'unberthing' ? 'Departed (ATD)' : 'ETD', fmtDate(s.etd)],
              ['Time at berth', s.ataBerth ? fmtDuration((s.state === 'outbound' ? s.etd : sim.time) - s.ataBerth) : '—'],
              ['Service', s.voyage.service],
              ['Speed / heading', `${kn.toFixed(1)} kn · ${String(Math.round(((180 - (s.heading * 180) / Math.PI) % 360 + 360) % 360)).padStart(3, '0')}°`],
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
          <KV
            rows={[
              ['Reefers on board', String(s.slots.filter((id) => id && containerById(id)?.reefer).length)],
              ['Remain on board (ROB)', String(s.slots.filter((id) => id && containerById(id)?.flow === 'rob').length)],
              ['Cranes', s.cranes.length ? s.cranes.join(', ') : '—'],
            ]}
          />
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
              ['Inbound', `${portName(s.voyage.prev)} → San Diego · ${fmt(nmBetween(PORTS[s.voyage.prev], PORTS.USSAN))} nm`],
              ['Outbound', `San Diego → ${portName(s.voyage.next)} · ${fmt(nmBetween(PORTS.USSAN, PORTS[s.voyage.next]))} nm`],
              ['Next port ETA', fmtDate(s.etd + (nmBetween(PORTS.USSAN, PORTS[s.voyage.next]) / s.cls.speedKn) * 60)],
              ['Bay transit', `Point Loma → main channel → turning basin → ${term.code} ${b.id}`],
            ]}
          />
          <p className="hint">Blue dashed line on the water: remaining inbound track. Orange: planned departure track.</p>
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
        <KV rows={[['Main brand', v.brand], ['Remain on board', `${fmt(v.total - v.planned)} units → ${PORTS[s.voyage.next].name}`], ['Ramp', 'Stern quarter ramp · 150 t'], ['Processing', 'NCMT lot & vehicle processing deck']]} />
      </>
    )
  }
  if (s.bulk) {
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
        <KV rows={[['Commodity', s.bulk.cargo], ['Total on arrival', `${fmt(s.bulk.total)} t`], ['Method', 'Grab + hopper to silos']]} />
      </>
    )
  }
  if (s.blades) {
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
        <KV rows={[['Cargo', 'Wind turbine blades · 68 m'], ['Lift', "Ship's cranes · tandem lift"], ['Project', 'Imperial Valley wind repowering']]} />
      </>
    )
  }
  if (s.passengers) {
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
        <KV rows={[['Itinerary', s.voyage.service], ['Crew', fmt(Math.round(s.passengers.total * 0.38))], ['Terminal', 'B Street Cruise Terminal']]} />
      </>
    )
  }
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
  if (loc.kind === 'yard') return `TAMT ${yardLabel(loc.slot)}`
  if (loc.kind === 'crane') return `On ${loc.id} spreader`
  if (loc.kind === 'handler') return `On forklift ${loc.id}`
  if (loc.kind === 'transfer') return `TAMT apron · under ${loc.craneId}`
  return loc.where
}

function plannedSteps(c: Container): HistoryEvent[] {
  const t = sim.time
  if (c.flow === 'import' && c.loc.kind !== 'gone') {
    const steps: HistoryEvent[] = []
    if (c.loc.kind === 'ship' || c.loc.kind === 'crane' || c.loc.kind === 'transfer' || c.loc.kind === 'handler') steps.push({ t: t + 30, event: 'Stack in yard', place: 'TAMT yard', planned: true })
    if (!c.history.some((h) => h.event.startsWith('Customs'))) steps.push({ t: t + 180, event: 'Customs release (CBP)', place: 'TAMT', planned: true })
    steps.push({ t: t + 420, event: 'Gate out · truck/rail', place: `TAMT → ${c.dest}`, planned: true })
    steps.push({ t: t + 1500, event: 'Delivered', place: `${c.consignee} · ${c.dest}`, planned: true })
    return steps
  }
  if ((c.flow === 'export' || c.flow === 'empty') && c.vesselId && c.loc.kind !== 'ship') {
    return [{ t: t + 40, event: `Load on ${c.vesselName}`, place: 'TAMT quay', planned: true }]
  }
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
      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'history', label: 'Tracking history' },
        ]}
      />
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
              <b>San Diego</b>
              <small>TAMT</small>
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
              [
                'Vessel',
                vessel ? (
                  <button className="link-text" onClick={() => select({ type: 'ship', id: vessel.id })}>
                    MV {vessel.name}
                  </button>
                ) : (
                  c.vesselName ?? '—'
                ),
              ],
              ['Status', c.status],
            ]}
          />
        </>
      )}
      {tab === 'history' && <History events={[...c.history, ...plannedSteps(c)]} />}
    </>
  )
}

// ── equipment

function CranePanel({ c }: { c: Crane }) {
  const ship = shipById(c.shipId)
  const select = useUI((s) => s.select)
  const cont = containerById(c.carrying ?? undefined)
  return (
    <>
      <PanelHead kicker="Mobile harbour crane · TAMT" title={c.id} sub="All-electric MHC · 200 t SWL" icon={<IconCrane />} actions={<CloseBtn />} />
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
          ['Slew', `${Math.round(((c.slew * 180) / Math.PI + 360) % 360)}°`],
          ['Power', 'Shore power · 0 g CO₂'],
        ]}
      />
    </>
  )
}

function HandlerPanel({ h }: { h: Handler }) {
  const select = useUI((s) => s.select)
  const cont = containerById(h.carrying ?? undefined)
  return (
    <>
      <PanelHead kicker="Container forklift · TAMT" title={h.id} sub={`Laden top-loader · 45 t · ${h.operator}`} icon={<IconForklift />} actions={<><FollowBtn /><CloseBtn /></>} />
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
      <KV
        rows={[
          ['Carrying', cont ? <button className="link-text" onClick={() => select({ type: 'container', id: cont.id })}>{cont.id}</button> : 'Empty'],
          ['Lift height', `${((h.lift - 2) * 2).toFixed(1)} m`],
          ['Speed', `${(h.speed * 7.2).toFixed(0)} km/h`],
        ]}
      />
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
        <span className="muted small">{ship ? `MV ${ship.name}` : 'Tug pier · Barrio Logan'}</span>
      </div>
      <KV rows={[['Speed', `${(t.speed * 3.9).toFixed(1)} kn`], ['Position', t.shipId ? (t.offset > 0 ? 'Bow' : 'Stern') : 'Moored']]} />
    </>
  )
}

// ── terminal

function TerminalPanel({ view }: { view: View }) {
  const select = useUI((s) => s.select)
  const setView = useUI((s) => s.setView)
  const term = TERMINALS.find((t) => t.id === view)
  const berths = BERTHS.filter((b) => view === 'BAY' || b.terminal === view)
  const shipAt = (id: string) => sim.ships.find((s) => s.berthId === id && ['berthing', 'working', 'ready', 'unberthing'].includes(s.state))
  return (
    <>
      <PanelHead
        kicker={term ? term.kind : 'Port of San Diego'}
        title={term ? term.name : 'San Diego Bay'}
        sub={term ? term.address : '3 marine terminals · 7 berths'}
        icon={term?.id === 'NCMT' ? <IconCar /> : term?.id === 'CRUISE' ? <IconUsers /> : <IconShip />}
      />
      <div className="row gap">
        <Chip tone="green">Operational</Chip>
        <span className="muted small">Wind 9 kn W · Visibility 10 nm · Tide +1.2 m</span>
      </div>
      {view === 'TAMT' && (
        <div className="tiles">
          <div className="tile">
            <span>Yard</span>
            <b>
              {fmt(sim.yard.filter(Boolean).length * 2)} <small>TEU</small>
            </b>
            <Bar value={sim.yard.filter(Boolean).length / sim.yard.length} />
          </div>
          <div className="tile">
            <span>Reefer plugs</span>
            <b>
              {sim.yard.filter((id) => id && containerById(id)?.reefer).length} <small>/ 1,400</small>
            </b>
            <Bar value={sim.yard.filter((id) => id && containerById(id)?.reefer).length / 1400} tone="green" />
          </div>
          <div className="tile">
            <span>Cranes working</span>
            <b>
              {sim.cranes.filter((c) => c.job).length} <small>/ {sim.cranes.length}</small>
            </b>
          </div>
          <div className="tile">
            <span>Forklifts working</span>
            <b>
              {sim.handlers.filter((h) => h.phase === 'working').length} <small>/ {sim.handlers.length}</small>
            </b>
          </div>
        </div>
      )}
      {view === 'NCMT' && (
        <div className="tiles">
          <div className="tile">
            <span>Vehicles in lot</span>
            <b>{fmt(sim.lot.count)}</b>
            <Bar value={sim.lot.count / sim.lot.cap} />
          </div>
          <div className="tile">
            <span>Driving off now</span>
            <b>{sim.cars.length * 12}</b>
            <small className="muted">units in transit</small>
          </div>
        </div>
      )}
      <div className="section-head">
        <b>Berths</b>
        <span>{berths.filter((b) => shipAt(b.id)).length}/{berths.length} occupied</span>
      </div>
      <div className="list">
        {berths.map((b) => {
          const s = shipAt(b.id)
          const st = s ? shipStatus(s) : null
          return (
            <button key={b.id} className="list-row link" onClick={() => (s ? select({ type: 'ship', id: s.id }) : setView(b.terminal))}>
              <span className="code">{b.id}</span>
              <span className="grow">
                <b>{s ? `MV ${s.name}` : 'Available'}</b>
                <span className="muted small block">{s ? s.cls.label : b.kinds.join(' · ')}</span>
              </span>
              {st ? (
                <Chip tone={st.tone}>
                  {st.label}
                  {st.pct !== undefined ? ` ${st.pct}%` : ''}
                </Chip>
              ) : (
                <Chip tone="grey">Free</Chip>
              )}
            </button>
          )
        })}
      </div>
      <div className="section-head">
        <b>Alerts</b>
        <span>{sim.alerts.length}</span>
      </div>
      <div className="list">
        {sim.alerts.slice(0, 5).map((a, i) => (
          <button key={i} className="list-row link alert" onClick={() => a.ref && select({ type: a.ref.type, id: a.ref.id } as never)}>
            <span className={`alert-ic tone-${a.tone}`}>
              <IconAlert width={13} height={13} />
            </span>
            <span className="grow small">{a.text}</span>
            <time className="muted small">{fmtTime(a.t)}</time>
          </button>
        ))}
      </div>
    </>
  )
}

// ───────────── bottom: berth plan + time controls

const WINDOW_BEFORE = 8 * 60
const WINDOW_AFTER = 16 * 60

export function BottomDock() {
  useUI((s) => s.tick)
  const tab = useUI((s) => s.bottomTab)
  const setTab = useUI((s) => s.setBottomTab)
  const view = useUI((s) => s.view)
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
        <div className="dock-legend">
          <span><i className="lg lg-orange" />Discharging</span>
          <span><i className="lg lg-green" />Loading</span>
          <span><i className="lg lg-blue" />Arriving</span>
          <span><i className="lg lg-amber" />At anchor</span>
          <span><i className="lg lg-plan" />Planned</span>
        </div>
      </div>
      {tab === 'berths' && <BerthPlan view={view} />}
      {tab === 'vessels' && <VesselTable />}
      {tab === 'equipment' && <EquipmentTable />}
      <TimeControls />
    </div>
  )
}

function BerthPlan({ view }: { view: View }) {
  const select = useUI((s) => s.select)
  const berths = BERTHS.filter((b) => view === 'BAY' || b.terminal === view)
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
            <small>{b.terminal === 'CRUISE' ? 'BST' : b.terminal}</small>
          </span>
          <div className="g-track">
            {sim.calls
              .filter((c) => c.berthId === b.id && c.etd > t0 && c.eta < t0 + span)
              .map((c) => {
                const s = shipById(c.shipId)
                let cls = 'plan'
                if (c.status === 'departed') cls = 'done'
                else if (c.status === 'anchored' || s?.state === 'anchored') cls = 'amber'
                else if (c.status === 'arriving' || s?.state === 'inbound' || s?.state === 'berthing') cls = 'blue'
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
                    onClick={() => s && select({ type: 'ship', id: s.id }, s.state !== 'working')}
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
  const select = useUI((s) => s.select)
  return (
    <div className="vtable">
      {sim.ships.map((s) => {
        const st = shipStatus(s)
        return (
          <button key={s.id} className="vrow" onClick={() => select({ type: 'ship', id: s.id }, s.state !== 'working')}>
            <b>MV {s.name}</b>
            <span className="muted">{s.cls.label}</span>
            <span>{PORTS[s.voyage.prev].name} → {PORTS[s.voyage.next].name}</span>
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
          <span>{c.status}</span>
          <span className="muted">{craneRate(c)} mv/h</span>
          <Chip tone={c.job ? 'green' : 'grey'}>{c.job ? 'Working' : 'Idle'}</Chip>
          <span />
        </button>
      ))}
      {sim.handlers.map((h) => (
        <button key={h.id} className="vrow" onClick={() => select({ type: 'handler', id: h.id }, true)}>
          <b>{h.id}</b>
          <span className="muted">Container forklift</span>
          <span>{h.status}</span>
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
        <b>{fmtTime(sim.time)}</b>
        <small>{fmtDate(sim.time).split(' · ')[0]} · {sim.speed === 0 ? 'Paused' : sim.speed === 1 ? 'Live' : `Fast-forward ×${sim.speed}`}</small>
      </div>
      <div className="speeds">
        {[1, 4, 16].map((v) => (
          <button key={v} className={sim.speed === v ? 'on' : ''} onClick={() => setSpeed(v)}>
            ×{v}
          </button>
        ))}
      </div>
      <span className="muted small timebar-note">
        <IconClock width={12} height={12} /> 1 s = 15 s port time at ×1
      </span>
      <span className="muted small timebar-note">
        <IconBox width={12} height={12} /> Simulated data
      </span>
    </div>
  )
}
