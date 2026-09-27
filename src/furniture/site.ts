import * as THREE from 'three'
import { box, mesh, lit, glow, drawnTexture, keepShared, type Builder } from './kit'
import { wallScreenHousing } from './decor'
import { tr } from '../i18n'
import { REWARD_COUNTER } from './reward-counter'
import { renderQuality } from '../quality'

const prints = new Map<string, THREE.MeshBasicMaterial>()
const printLoads = new Map<string, Promise<void>>()
/** Visuels SVG animés (badges, emblèmes de la Voie) : redessinés au fil du temps, cf. tickArtwork. */
const animated = new Map<string, { svg: string; draw: (img: HTMLImageElement) => void; busy: boolean; last: number }>()
const ANIMATION = /(?:-webkit-)?animation\s*:/

/**
 * SVG figé à l'instant `t` (secondes) : un navigateur ne dessine dans un canvas que la première
 * image d'un SVG animé. Chaque animation CSS est mise en pause, avec un délai négatif qui la
 * place là où elle en serait après `t` secondes.
 */
export function seekSvg(svg: string, t: number): string {
  return svg.replace(/((?:-webkit-)?animation)\s*:\s*([^;}"]+)/g, (declaration, property: string, value: string) => {
    const delays = value.split(/,(?![^(]*\))/).map((part) => {
      const times = [...part.matchAll(/(?:^|\s)(-?\d*\.?\d+)(ms|s)(?=\s|$)/g)].map((m) => Number(m[1]) / (m[2] === 'ms' ? 1000 : 1))
      return `${((times[1] ?? 0) - t).toFixed(3)}s`
    })
    return `${declaration};${property}-delay:${delays.join(',')};${property}-play-state:paused`
  })
}

/** Image d'un SVG (texte), chargée. */
function svgImage(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const img = new Image()
  return new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

/**
 * Nouvelle image des visuels animés, une dizaine de fois par seconde au plus (moins en mode
 * léger) ; chaque visuel partagé n'est redessiné qu'une fois, quel que soit le nombre de cadres.
 */
function tickArtwork(key: string) {
  const a = animated.get(key)
  const now = performance.now()
  if (!a || a.busy || now - a.last < (renderQuality.light ? 500 : 100)) return
  a.busy = true
  a.last = now
  void svgImage(seekSvg(a.svg, (now / 1000) % 3600)).then(a.draw, () => {}).finally(() => { a.busy = false })
}

/** Shared placeholder map survives merging; update it after the site image arrives. */
function artwork(id: string) {
  let material = prints.get(id)
  if (material) return material
  const badge = id.startsWith('badge:')
  const poster = id.startsWith('adv:')
  const width = id.startsWith('card:') ? 371 : 512
  const map = keepShared(drawnTexture(width, 512, (g) => {
    if (!badge) { g.fillStyle = '#e8edf0'; g.fillRect(0, 0, width, 512) }
    g.fillStyle = '#ffae48'; g.font = '40px sans-serif'; g.textAlign = 'center'; g.fillText('…', width / 2, 270)
  }))
  material = keepShared(new THREE.MeshBasicMaterial({ map, transparent: badge, alphaTest: badge ? 0.05 : 0 }))
  prints.set(id, material)
  if (typeof Image !== 'undefined' && /^(card|badge|adv):[a-f0-9]{16}$/.test(id)) {
    let loaded!: () => void
    printLoads.set(id, new Promise<void>((resolve) => { loaded = resolve }))
    const draw = (img: HTMLImageElement, vector: boolean) => {
      const canvas = map.image as HTMLCanvasElement
      const g = canvas.getContext('2d')!
      g.clearRect(0, 0, width, 512)
      // Un emblème vectoriel (les aventures de la Voie) se détache sur un fond sombre.
      if (!badge) { g.fillStyle = poster && vector ? '#0d1420' : '#e8edf0'; g.fillRect(0, 0, width, 512) }
      // Poster carré : une couverture rectangulaire est recadrée, un emblème reste entier.
      const fit = poster && !vector ? Math.max : Math.min
      const scale = fit(width / img.width, 512 / img.height) * (poster && vector ? 0.86 : 1)
      const w = img.width * scale, h = img.height * scale
      g.drawImage(img, (width - w) / 2, (512 - h) / 2, w, h)
      map.needsUpdate = true
    }
    void (async () => {
      try {
        const response = await fetch(`/outils/mini-shipinteriors-site.php?image=${encodeURIComponent(id)}`)
        if (!response.ok) return
        if ((response.headers.get('Content-Type') ?? '').startsWith('image/svg+xml')) {
          const svg = await response.text()
          draw(await svgImage(ANIMATION.test(svg) ? seekSvg(svg, (performance.now() / 1000) % 3600) : svg), true)
          if (ANIMATION.test(svg)) animated.set(id, { svg, draw: (img) => draw(img, true), busy: false, last: performance.now() })
        } else {
          const url = URL.createObjectURL(await response.blob())
          const img = new Image()
          await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url }).finally(() => URL.revokeObjectURL(url))
          draw(img, false)
        }
      } catch {
        // Visuel indisponible : le cadre garde son attente.
      } finally {
        loaded()
      }
    })()
  }
  return material
}
/** Catalogue captures the furnished frame only once its artwork has arrived. */
export async function prepareArtwork(id: string): Promise<THREE.MeshBasicMaterial> {
  const material = artwork(id)
  const pending = printLoads.get(id)
  if (!pending) return material
  await new Promise<void>((resolve) => {
    // An unavailable image must not block the rest of the furniture catalogue.
    const timer = setTimeout(resolve, 4000)
    void pending.then(() => { clearTimeout(timer); resolve() })
  })
  return material
}

const artFrame: Builder = ({ label }) => {
  const g = new THREE.Group()
  if (label?.startsWith('badge:')) {
    // Outline of the site's SVG socle (viewBox 674 × 675). Its metallic border
    // is the frame itself; only a thin matching hexagonal backing adds depth.
    const shape = new THREE.Shape()
    const outline = [[195.48, 90.461], [480.74, 90.5305], [621.91, 338.2205],
      [481.69, 586.5205], [193.28, 586.4992], [52.73, 336.9092]]
    outline.forEach(([x, y], i) => {
      const px = (x / 674 - 0.5) * 0.58, py = (0.5 - y / 675) * 0.58
      if (i === 0) shape.moveTo(px, py)
      else shape.lineTo(px, py)
    })
    shape.closePath()
    const front = new THREE.ShapeGeometry(shape)
    const positions = front.getAttribute('position'), uv = front.getAttribute('uv')
    for (let i = 0; i < positions.count; i++) {
      uv.setXY(i, positions.getX(i) / 0.58 + 0.5, positions.getY(i) / 0.58 + 0.5)
    }
    g.add(mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false }), lit('#614a3b'), 0, 0.65, 0),
      mesh(front, artwork(label), 0, 0.65, 0.026))
    return { solid: g, update: () => tickArtwork(label) }
  }
  const card = label?.startsWith('card:')
  const w = card ? 0.42 : 0.58, h = card ? 0.58 : 0.58
  g.add(box(w + 0.05, h + 0.05, 0.025, lit('#d6ad65'), 0, 0.65, 0.0125))
  g.add(mesh(new THREE.PlaneGeometry(w, h), artwork(label ?? ''), 0, 0.65, 0.026))
  return { solid: g, update: () => tickArtwork(label ?? '') }
}
const employeeBoard: Builder = () => {
  const g = wallScreenHousing(1.42, 0.82, 0.90)
  g.add(box(1.35, 0.75, 0.012, lit('#97abb7'), 0, 0.90, 0.034, 0.01),
    box(0.26, 0.007, 0.008, glow('#ffd58b'), 0, 0.503, 0.034))
  const map = drawnTexture(960, 520, (c) => {
    const grad = c.createLinearGradient(0, 0, 960, 520)
    grad.addColorStop(0, '#173a52'); grad.addColorStop(1, '#0b182c')
    c.fillStyle = grad; c.fillRect(0, 0, 960, 520)
    c.fillStyle = '#ffd58b'; c.fillRect(38, 38, 5, 72)
    c.font = '600 20px sans-serif'; c.fillText(tr('ÉQUIPAGE / TABLEAU D’HONNEUR', 'CREW / HALL OF HONOUR'), 65, 58)
    c.fillStyle = '#edf6ff'; c.font = 'bold 42px sans-serif'
    c.fillText(tr('EMPLOYÉS DU MOIS', 'EMPLOYEES OF THE MONTH'), 65, 106)
    c.fillStyle = '#74c8e8'; c.font = '18px sans-serif'; c.textAlign = 'right'; c.fillText('TOP 10', 916, 58)
    // Three luminous podium cards, with the winning silhouette in the middle.
    for (const [x, y, rank, accent] of [[260, 232, '02', '#b9d7ec'], [480, 192, '01', '#ffd58b'], [700, 252, '03', '#dca382']] as const) {
      c.fillStyle = '#ffffff0c'; c.fillRect(x - 88, y - 38, 176, 170)
      c.fillStyle = accent; c.fillRect(x - 88, y + 130, 176, 3)
      c.beginPath(); c.arc(x, y + 10, 22, 0, Math.PI * 2); c.fill()
      c.beginPath(); c.arc(x, y + 73, 40, Math.PI, 0); c.fill()
      c.font = 'bold 27px sans-serif'; c.textAlign = 'center'; c.fillText(rank, x, y + 115)
    }
    c.fillStyle = '#77b5d1'; c.fillRect(38, 428, 884, 1)
    c.fillStyle = '#cbe0ee'; c.font = '19px sans-serif'; c.textAlign = 'center'
    c.fillText(tr('POINTS   /   COLLECTIONS   /   AVENTURES', 'POINTS   /   COLLECTIONS   /   ADVENTURES'), 480, 463)
    c.fillStyle = '#ffd58b'; c.font = '17px sans-serif'
    c.fillText(tr('CONSULTER LES CLASSEMENTS  ›', 'VIEW RANKINGS  ›'), 480, 500)
  })
  g.add(mesh(new THREE.PlaneGeometry(1.30, 0.704), new THREE.MeshBasicMaterial({ map }), 0, 0.90, 0.041))
  // Keep the whole casing below the wall top, while preserving screen proportions.
  g.scale.setScalar(0.8)
  g.position.y = -0.08
  return { solid: g }
}
export const SITE = { 'site-art': artFrame, ...REWARD_COUNTER, 'employee-board': employeeBoard }
