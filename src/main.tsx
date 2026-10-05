import { createRoot } from 'react-dom/client'
import './index.css'
import { PORT_ID, loadGeo, bootStep } from './ports/registry'
import { setGeo } from './sim/geo'

// The port's geography must be in place before the simulation modules evaluate, so the app is imported afterwards.
// StrictMode is omitted: drei's <Html> portals double-mount badly under it.
;(async () => {
  bootStep('Loading OpenStreetMap coastline and buildings…')
  setGeo(await loadGeo(PORT_ID))
  bootStep('Building terminals, ships and traffic…')
  // give the browser a frame to paint the new step before the heavy module evaluation
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  const { default: App } = await import('./App.tsx')
  bootStep('Rendering the harbour…')
  createRoot(document.getElementById('root')!).render(<App />)
})()
