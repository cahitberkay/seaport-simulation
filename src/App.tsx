import Scene from './three/Scene'
import { TopBar, Kpis, CamToolbar, SidePanel, BottomDock } from './ui/Hud'

export default function App() {
  return (
    <div className="app">
      <div className="viewport">
        <Scene />
      </div>
      <TopBar />
      <div className="hud">
        <div className="hud-top">
          <Kpis />
          <div className="right-col">
            <CamToolbar />
            <SidePanel />
          </div>
        </div>
        <BottomDock />
      </div>
    </div>
  )
}
