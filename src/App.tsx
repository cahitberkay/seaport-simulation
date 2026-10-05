import Scene from './three/Scene'
import { TopBar, LeftColumn, RightColumn, MapToolbar, BottomDock, JourneyStrip } from './ui/Hud'
import { useUI } from './store'

export default function App() {
  const showPanels = useUI((s) => s.showPanels)
  const night = useUI((s) => s.night)
  return (
    <div className={`app ${night ? 'is-night' : ''}`}>
      <div className="viewport">
        <Scene />
      </div>
      <TopBar />
      <div className="hud">
        <div className="hud-top">
          {showPanels && <LeftColumn />}
          <div className="right-col">
            {showPanels && <RightColumn />}
            <MapToolbar />
          </div>
        </div>
        <JourneyStrip />
        {showPanels && <BottomDock />}
      </div>
    </div>
  )
}
