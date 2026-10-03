import * as THREE from 'three'
import { box, mesh, part, lit, glow, drawnTexture, animatedScreen, keepShared, type Builder } from './kit'
import { wallScreenHousing } from './decor'
import { tr } from '../i18n'
import { REWARD_COUNTER } from './reward-counter'
import { renderQuality } from '../quality'
import { courtBoards, records, sportRecords, type CourtId } from '../arcade/game'

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
    c.font = '600 20px sans-serif'; c.fillText(tr('ÉQUIPAGE / CLASSEMENTS', 'CREW / RANKINGS'), 65, 58)
    c.fillStyle = '#edf6ff'; c.font = 'bold 42px sans-serif'
    c.fillText(tr('TABLEAU D’HONNEUR', 'HALL OF HONOUR'), 65, 106)
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
    c.fillText(tr('EMPLOYÉS DU MOIS   /   POINTS   /   COLLECTIONS   /   AVENTURES', 'EMPLOYEES OF THE MONTH   /   POINTS   /   COLLECTIONS   /   ADVENTURES'), 480, 463)
    c.fillStyle = '#ffd58b'; c.font = '17px sans-serif'
    c.fillText(tr('CONSULTER LES CLASSEMENTS  ›', 'VIEW RANKINGS  ›'), 480, 500)
  })
  g.add(mesh(new THREE.PlaneGeometry(1.30, 0.704), new THREE.MeshBasicMaterial({ map }), 0, 0.90, 0.041))
  // Keep the whole casing below the wall top, while preserving screen proportions.
  g.scale.setScalar(0.8)
  g.position.y = -0.08
  return { solid: g }
}
/** Tableaux des scores : le record de chaque jeu (cf. src/arcade/scores.ts), relu à chaque image. */
const SCORE_BOARDS = {
  arcade: {
    kicker: tr('SALON D’ARCADE / RECORDS DU VAISSEAU', 'ARCADE LOUNGE / SHIP RECORDS'), title: 'HIGH SCORES', accent: '#ff5fd2', from: '#2a0f3d', to: '#0a0716',
    rows: [['cargo', tr('CARGAISON', 'CARGO')], ['viper', 'VIPER'], ['asteroids', tr('ASTÉROÏDES', 'ASTEROIDS')], ['invaders', 'THARGOID INVADERS']],
    best: (id: string) => records[id as keyof typeof records],
  },
  gym: {
    kicker: tr('SALLE DE SPORT / RECORDS DU VAISSEAU', 'GYM / SHIP RECORDS'), title: tr('RECORDS', 'RECORDS'), accent: '#7dff9b', from: '#12382c', to: '#07141a',
    rows: [['gym-run', tr('TAPIS DE COURSE', 'TREADMILL')], ['gym-bike', tr('VÉLO', 'BIKE')], ['gym-punch', tr('SAC DE FRAPPE', 'PUNCHING BAG')]],
    best: (id: string) => sportRecords[id as keyof typeof sportRecords],
  },
}
/** Classements des terrains de sport : les cinq meilleurs de la salle (cf. src/court.ts). */
const COURT_BOARDS: Record<string, { id: CourtId; kicker: string; title: string; accent: string; from: string; to: string }> = {
  basket: { id: 'gym-basket', kicker: tr('TERRAIN DE BASKET / MEILLEURS TIREURS', 'BASKETBALL COURT / TOP SHOOTERS'), title: 'BASKET', accent: '#ff8a3c', from: '#3d1d0c', to: '#120a07' },
  foot: { id: 'gym-foot', kicker: tr('TERRAIN DE FOOT / MEILLEURS BUTEURS', 'FOOTBALL PITCH / TOP SCORERS'), title: tr('TIRS AU BUT', 'PENALTY SHOOTOUT'), accent: '#7dff9b', from: '#12382c', to: '#07141a' },
}
/**
 * Écran mural des scores (`label` : `arcade` ou `gym`, ou un terrain, `basket` ou `foot`), du
 * gabarit du tableau d'honneur.
 */
const scoreBoard: Builder = ({ label }) => {
  const court = COURT_BOARDS[label ?? '']
  const board = court
    ? { ...court, rows: [1, 2, 3, 4, 5].map((n) => [String(n), `${n}.`]), best: (n: string) => courtBoards[court.id]?.[Number(n) - 1] }
    : SCORE_BOARDS[label === 'gym' ? 'gym' : 'arcade']
  const g = wallScreenHousing(1.42, 0.82, 0.90)
  g.add(box(1.35, 0.75, 0.012, lit('#97abb7'), 0, 0.90, 0.034, 0.01),
    box(0.26, 0.007, 0.008, glow(board.accent), 0, 0.503, 0.034))
  const screen = animatedScreen(960, 520, 1, (c, t) => {
    const grad = c.createLinearGradient(0, 0, 960, 520)
    grad.addColorStop(0, board.from); grad.addColorStop(1, board.to)
    c.fillStyle = grad; c.fillRect(0, 0, 960, 520)
    c.textAlign = 'left'; c.textBaseline = 'alphabetic'
    c.fillStyle = board.accent; c.fillRect(38, 38, 5, 72)
    c.font = '600 20px sans-serif'; c.fillText(board.kicker, 65, 58)
    c.fillStyle = '#edf6ff'; c.font = 'bold 42px sans-serif'; c.fillText(board.title, 65, 106)
    c.fillStyle = '#ffd58b'; c.font = '18px sans-serif'; c.textAlign = 'right'; c.fillText(court ? 'TOP 5' : 'TOP 10', 916, 58)
    const step = 300 / board.rows.length
    board.rows.forEach(([id, name], i) => {
      const y = 150 + i * step, best = board.best(id)
      c.fillStyle = i % 2 ? '#ffffff08' : '#ffffff12'; c.fillRect(38, y, 884, step - 10)
      c.fillStyle = board.accent; c.fillRect(38, y, 4, step - 10)
      const base = y + (step - 10) / 2 + 9
      c.textAlign = 'left'; c.font = 'bold 24px sans-serif'; c.fillStyle = '#cbe0ee'; c.fillText(name, 62, base)
      c.font = '24px sans-serif'; c.fillStyle = best ? '#edf6ff' : '#7f93a6'
      const cmdr = best ? best.cmdr.toUpperCase() : tr('PLACE À PRENDRE', 'UP FOR GRABS')
      c.fillText(cmdr.length > 20 ? cmdr.slice(0, 19) + '…' : cmdr, court ? 130 : 380, base)
      if (best) { c.textAlign = 'right'; c.font = 'bold 28px monospace'; c.fillStyle = '#ffd58b'; c.fillText(best.score.toLocaleString(), 900, base) }
    })
    c.fillStyle = '#ffffff30'; c.fillRect(38, 462, 884, 1)
    if (Math.floor(t) % 2) {
      c.fillStyle = '#ffd58b'; c.font = '17px sans-serif'; c.textAlign = 'center'
      c.fillText(tr('CONSULTER LES CLASSEMENTS  ›', 'VIEW RANKINGS  ›'), 480, 498)
    }
  })
  screen.texture.magFilter = THREE.LinearFilter
  // Même gabarit que le tableau d'honneur. L'écran, redessiné, reste à part du boîtier, un peu en
  // avant de sa dalle.
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(1.30, 0.704), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0.90, 0.045))
  return { solid: g, live, update: (t) => screen.tick(t) }
}
export const SITE = { 'site-art': artFrame, ...REWARD_COUNTER, 'employee-board': employeeBoard, 'score-board': scoreBoard }
