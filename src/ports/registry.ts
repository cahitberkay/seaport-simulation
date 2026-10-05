// Which port the app is showing. Switching reloads the page so every module rebuilds for the new geography.

export type PortId = 'san-diego' | 'long-beach'

export interface PortMeta {
  id: PortId
  name: string
  region: string
  unlocode: string
}

export const PORT_LIST: PortMeta[] = [
  { id: 'san-diego', name: 'Port of San Diego', region: 'San Diego Bay · California', unlocode: 'USSAN' },
  { id: 'long-beach', name: 'Port of Long Beach', region: 'San Pedro Bay · California', unlocode: 'USLGB' },
]

function readPort(): PortId {
  const fromUrl = new URLSearchParams(globalThis.location?.search ?? '').get('port')
  if (PORT_LIST.some((p) => p.id === fromUrl)) return fromUrl as PortId
  try {
    const saved = globalThis.localStorage?.getItem('anymile-port')
    if (PORT_LIST.some((p) => p.id === saved)) return saved as PortId
  } catch {
    // storage unavailable (private mode)
  }
  return 'san-diego'
}

export let PORT_ID: PortId = readPort()
/** for scripts and tests running outside the browser */
export const setPortId = (id: PortId) => (PORT_ID = id)
export const PORT_META = () => PORT_LIST.find((p) => p.id === PORT_ID)!

// ───────── loading screen (markup lives in index.html so it shows before the bundle loads)

const bootEl = () => globalThis.document?.getElementById('boot')
export function bootStep(text: string) {
  const el = globalThis.document?.getElementById('boot-step')
  if (el) el.textContent = text
}
/** fade the loading screen out once the scene has drawn */
export function bootDone() {
  const el = bootEl()
  if (!el || el.classList.contains('done')) return
  el.classList.add('done')
  setTimeout(() => el.classList.add('gone'), 500)
}
function showBoot(portName: string, step: string) {
  const el = bootEl()
  if (!el) return
  el.classList.remove('gone')
  // next frame, so the fade-in transition runs
  requestAnimationFrame(() => el.classList.remove('done'))
  const name = document.getElementById('boot-port')
  if (name) name.textContent = portName
  bootStep(step)
}

export function switchPort(id: PortId) {
  if (id === PORT_ID) return
  showBoot(PORT_LIST.find((p) => p.id === id)?.name ?? 'Loading port', 'Switching port…')
  try {
    localStorage.setItem('anymile-port', id)
  } catch {
    // ignore
  }
  const url = new URL(location.href)
  url.searchParams.set('port', id)
  // let the loading screen paint before the page unloads
  setTimeout(() => location.assign(url.toString()), 60)
}

/** geography for each port is a separate chunk, loaded before the app modules evaluate */
export const loadGeo = (id: PortId) => (id === 'long-beach' ? import('../data/geo-lb.json') : import('../data/geo.json')).then((m) => m.default as unknown)
