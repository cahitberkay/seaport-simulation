import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

const cache = new Map<string, CanvasTexture>()

function make(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number], srgb = true) {
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new CanvasTexture(c)
  if (srgb) t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  if (repeat) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(...repeat)
  }
  cache.set(key, t)
  return t
}

/** White corrugated container skin – tinted per instance. */
export function containerSkin() {
  return make('container', 256, 64, (g) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, 256, 64)
    for (let x = 0; x < 256; x += 8) {
      g.fillStyle = 'rgba(0,0,0,0.13)'
      g.fillRect(x, 0, 2, 64)
      g.fillStyle = 'rgba(255,255,255,0.6)'
      g.fillRect(x + 3, 0, 2, 64)
    }
    g.fillStyle = 'rgba(0,0,0,0.18)'
    g.fillRect(0, 0, 256, 3)
    g.fillRect(0, 61, 256, 3)
    g.fillRect(0, 0, 4, 64)
    g.fillRect(252, 0, 4, 64)
  })
}

export function hullName(name: string, color: string, text = '#ffffff') {
  return make(`hull-${name}-${color}`, 1024, 128, (g) => {
    g.fillStyle = color
    g.fillRect(0, 0, 1024, 128)
    g.fillStyle = text
    g.font = '700 64px Inter, system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.fillText(name.toUpperCase(), 40, 66)
  })
}

export function sideStripe(name: string, accent: string) {
  return make(`pctc-${name}-${accent}`, 1024, 256, (g) => {
    g.fillStyle = '#f6f7fb'
    g.fillRect(0, 0, 1024, 256)
    g.fillStyle = '#e4e8f1'
    for (let y = 18; y < 256; y += 34) g.fillRect(0, y, 1024, 2)
    g.fillStyle = accent
    g.fillRect(0, 196, 1024, 26)
    g.font = '800 70px Inter, system-ui, sans-serif'
    g.fillStyle = accent
    g.textBaseline = 'middle'
    g.fillText(name.toUpperCase(), 60, 110)
  })
}

export function cruiseSide() {
  return make('cruise-side', 1024, 256, (g) => {
    g.fillStyle = '#fbfcff'
    g.fillRect(0, 0, 1024, 256)
    for (let y = 16; y < 230; y += 26) {
      g.fillStyle = '#2b4f9e'
      g.fillRect(0, y, 1024, 9)
      g.fillStyle = '#c9d6f2'
      for (let x = 0; x < 1024; x += 14) g.fillRect(x, y + 10, 8, 6)
    }
  })
}

export function windows(base: string, glass = '#b9c9ea') {
  return make(`win-${base}-${glass}`, 128, 128, (g) => {
    g.fillStyle = base
    g.fillRect(0, 0, 128, 128)
    g.fillStyle = glass
    for (let y = 10; y < 128; y += 22) for (let x = 8; x < 128; x += 20) g.fillRect(x, y, 13, 11)
  })
}

export function glassTower(base: string) {
  return make(`tower-${base}`, 64, 128, (g) => {
    g.fillStyle = base
    g.fillRect(0, 0, 64, 128)
    g.fillStyle = 'rgba(255,255,255,0.55)'
    for (let y = 0; y < 128; y += 8) g.fillRect(0, y, 64, 1.5)
    g.fillStyle = 'rgba(30,60,120,0.12)'
    for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 2, 128)
  })
}

export function concrete() {
  return make(
    'concrete',
    256,
    256,
    (g) => {
      g.fillStyle = '#eef0f6'
      g.fillRect(0, 0, 256, 256)
      g.strokeStyle = 'rgba(120,130,160,0.14)'
      g.lineWidth = 2
      for (let x = 0; x <= 256; x += 64) {
        g.beginPath()
        g.moveTo(x, 0)
        g.lineTo(x, 256)
        g.stroke()
        g.beginPath()
        g.moveTo(0, x)
        g.lineTo(256, x)
        g.stroke()
      }
    },
    [1, 1],
  )
}

export function signText(text: string, bg: string, fg: string, w = 512) {
  return make(`sign-${text}-${bg}-${w}`, w, 96, (g) => {
    g.fillStyle = bg
    g.fillRect(0, 0, w, 96)
    g.fillStyle = fg
    g.font = '700 50px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, w / 2, 50)
  })
}

export function foamDot() {
  return make('foam', 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.5, 'rgba(255,255,255,0.55)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
  })
}

export function logoBadge() {
  return make('logo-badge', 256, 256, (g) => {
    g.clearRect(0, 0, 256, 256)
    g.fillStyle = 'rgba(255,255,255,0.95)'
    g.beginPath()
    g.arc(128, 128, 120, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#2f6bed'
    g.beginPath()
    g.moveTo(128, 60)
    g.lineTo(186, 94)
    g.lineTo(186, 162)
    g.lineTo(128, 196)
    g.lineTo(70, 162)
    g.lineTo(70, 94)
    g.closePath()
    g.fill()
    g.fillStyle = '#6f9bff'
    g.beginPath()
    g.moveTo(128, 60)
    g.lineTo(186, 94)
    g.lineTo(128, 128)
    g.lineTo(70, 94)
    g.closePath()
    g.fill()
  })
}
