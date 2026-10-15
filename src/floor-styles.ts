import * as THREE from 'three'
import { withSurface, type Surface } from './surfaces'

/*
 * Les sols dessinés des pièces (cf. `floorStyle` dans levels.ts) : chaque pièce a le sol de ce
 * qu'elle est. Un parquet à bâtons rompus pour la bibliothèque, un damier de marbre pour l'entrée
 * des quartiers, un terrazzo de concourse pour le hall d'accueil, une moquette de cinéma au foyer,
 * de la tôle larmée à l'atelier, du caillebotis à la raffinerie, du béton peint au hall de la cale,
 * du caoutchouc de salle de sport au hall d'entraînement, du carrelage aux vestiaires…
 *
 * Un motif est dessiné une fois, sur un canevas qui couvre `period` tuiles de côté, et se répète
 * sans couture : chaque tuile du sol y prend sa part selon sa position (cf. floorTileGeometry).
 */

export type FloorStyle =
  | 'parquet-honey' | 'parquet-walnut' | 'planks-oak' | 'planks-bistro' | 'marble-checker' | 'temple-stone'
  | 'terrazzo' | 'carpet-cinema' | 'carpet-acoustic' | 'carpet-weekly' | 'tiles-white' | 'tiles-pool' | 'lab-tiles'
  | 'diamond-plate' | 'grating' | 'concrete' | 'concrete-dark' | 'rubber-sport' | 'rubber-dark' | 'lino-checker' | 'club'

interface Pattern {
  /** Côté du motif, en tuiles. */
  period: number
  surface: Surface
  /** Un peu de brillant (marbre, terrazzo, carrelage, métal). */
  shine?: number
  draw: (c: CanvasRenderingContext2D, s: number, random: () => number) => void
}

/** Un aléatoire déterministe : tout le monde voit le même sol. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const shade = (hex: string, k: number) => {
  const c = new THREE.Color(hex)
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 })
  c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + k, 0, 1))
  return `#${c.getHexString()}`
}

/** Une latte de bois : un dégradé de teinte, quelques veines, des joints sombres. */
function plank(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, random: () => number, vertical = false) {
  c.fillStyle = shade(base, (random() - 0.5) * 0.08)
  c.fillRect(x, y, w, h)
  c.strokeStyle = shade(base, -0.08)
  c.globalAlpha = 0.35
  c.lineWidth = 1
  for (let k = 0; k < 4; k++) {
    c.beginPath()
    if (vertical) {
      const vx = x + random() * w
      c.moveTo(vx, y)
      c.bezierCurveTo(vx + (random() - 0.5) * 6, y + h / 3, vx + (random() - 0.5) * 6, y + (2 * h) / 3, vx, y + h)
    } else {
      const vy = y + random() * h
      c.moveTo(x, vy)
      c.bezierCurveTo(x + w / 3, vy + (random() - 0.5) * 6, x + (2 * w) / 3, vy + (random() - 0.5) * 6, x + w, vy)
    }
    c.stroke()
  }
  c.globalAlpha = 1
  c.strokeStyle = shade(base, -0.2)
  c.lineWidth = 2
  c.strokeRect(x + 1, y + 1, w - 2, h - 2)
}

/** Parquet à bâtons rompus, en damier de carrés de quatre lattes (période d'une tuile). */
const basket = (base: string): Pattern['draw'] => (c, s, random) => {
  const cell = s / 2, n = 4, w = cell / n
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const vertical = (i + j) % 2 === 1
    for (let k = 0; k < n; k++) {
      if (vertical) plank(c, i * cell + k * w, j * cell, w, cell, base, random, true)
      else plank(c, i * cell, j * cell + k * w, cell, w, base, random)
    }
  }
}

/** Lames de plancher, joints décalés (période de deux tuiles). */
const planks = (base: string, rows = 10): Pattern['draw'] => (c, s, random) => {
  const h = s / rows
  for (let r = 0; r < rows; r++) {
    // Les lames font une demi-période : décalées d'une rangée à l'autre, elles se raccordent toujours au bord.
    const offset = ((r * 0.37) % 1) * s
    const len = s / 2
    for (let i = 0; i < 2; i++) {
      // Chaque lame est dessinée deux fois, à une période d'écart, avec le même tirage : le bord se raccorde.
      const seed = Math.floor(random() * 1e9)
      for (const shift of [-s, 0]) plank(c, offset + i * len + shift, r * h, len, h, base, rng(seed))
    }
  }
}

const PATTERNS: Record<FloorStyle, Pattern> = {
  'parquet-honey': { period: 1, surface: 'grain', draw: basket('#c8955a') },
  'parquet-walnut': { period: 1, surface: 'grain', draw: basket('#6e4528') },
  'planks-oak': { period: 2, surface: 'grain', draw: planks('#b78452') },
  'planks-bistro': { period: 2, surface: 'grain', draw: planks('#5a3a22', 12) },
  // Le damier de marbre de l'entrée des quartiers : crème veiné et anthracite, un filet de laiton.
  'marble-checker': {
    period: 2, surface: 'grain', shine: 70,
    draw: (c, s, random) => {
      const q = s / 2
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const dark = (i + j) % 2 === 1
        c.fillStyle = dark ? '#2e3034' : '#ece6da'
        c.fillRect(i * q, j * q, q, q)
        c.strokeStyle = dark ? 'rgba(200,200,210,0.18)' : 'rgba(120,110,95,0.28)'
        for (let k = 0; k < 5; k++) {
          c.lineWidth = 0.6 + random() * 1.6
          c.beginPath()
          let x = i * q + random() * q, y = j * q
          c.moveTo(x, y)
          while (y < (j + 1) * q) { x += (random() - 0.5) * 30; y += 12 + random() * 18; c.lineTo(x, Math.min(y, (j + 1) * q)) }
          c.stroke()
        }
      }
      c.strokeStyle = '#c9a24a'
      c.lineWidth = 3
      for (let k = 0; k <= 2; k++) { c.beginPath(); c.moveTo(k * q, 0); c.lineTo(k * q, s); c.moveTo(0, k * q); c.lineTo(s, k * q); c.stroke() }
    },
  },
  // Les dalles du sanctuaire de la Voie : ardoise noire, joints d'or, une rosace pâle tous les deux pas.
  'temple-stone': {
    period: 2, surface: 'grain', shine: 40,
    draw: (c, s, random) => {
      const q = s / 2
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        c.fillStyle = shade('#1c1a22', (random() - 0.5) * 0.04)
        c.fillRect(i * q, j * q, q, q)
        for (let k = 0; k < 40; k++) { c.fillStyle = `rgba(255,255,255,${random() * 0.04})`; c.fillRect(i * q + random() * q, j * q + random() * q, 3, 3) }
      }
      c.strokeStyle = '#8a6a2a'
      c.lineWidth = 3
      for (let k = 0; k <= 2; k++) { c.beginPath(); c.moveTo(k * q, 0); c.lineTo(k * q, s); c.moveTo(0, k * q); c.lineTo(s, k * q); c.stroke() }
      c.strokeStyle = 'rgba(201,162,74,0.35)'
      c.lineWidth = 2
      c.beginPath(); c.arc(q, q, q * 0.35, 0, Math.PI * 2); c.stroke()
      c.beginPath(); c.arc(q, q, q * 0.2, 0, Math.PI * 2); c.stroke()
    },
  },
  // Le terrazzo poli du hall d'accueil, comme le sol d'un concourse : éclats de pierre, grandes dalles, filets orange.
  terrazzo: {
    period: 2, surface: 'grain', shine: 55,
    draw: (c, s, random) => {
      c.fillStyle = '#d9dbe0'
      c.fillRect(0, 0, s, s)
      const chips = ['#9aa0ac', '#b9bec8', '#7c8494', '#e9ebef', '#c8a27a', '#5d6474']
      for (let k = 0; k < 1400; k++) {
        c.fillStyle = chips[Math.floor(random() * chips.length)]
        const r = 1 + random() * 3.5
        c.beginPath(); c.ellipse(random() * s, random() * s, r, r * (0.5 + random() * 0.5), random() * 3, 0, Math.PI * 2); c.fill()
      }
      c.strokeStyle = 'rgba(120,128,142,0.55)'
      c.lineWidth = 2
      c.strokeRect(1, 1, s - 2, s - 2)
      c.strokeStyle = '#ff8a1c'
      c.lineWidth = 3
      c.beginPath(); c.moveTo(s / 2, 0); c.lineTo(s / 2, s); c.moveTo(0, s / 2); c.lineTo(s, s / 2); c.stroke()
    },
  },
  // La moquette du cinéma et de son foyer : bordeaux, losanges dorés.
  'carpet-cinema': {
    period: 1, surface: 'cloth',
    draw: (c, s) => {
      c.fillStyle = '#5e1420'
      c.fillRect(0, 0, s, s)
      c.strokeStyle = '#c99a3c'
      c.lineWidth = 3
      const q = s / 4
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const x = i * q + q / 2, y = j * q + q / 2
        c.beginPath(); c.moveTo(x, y - q * 0.32); c.lineTo(x + q * 0.32, y); c.lineTo(x, y + q * 0.32); c.lineTo(x - q * 0.32, y); c.closePath(); c.stroke()
        c.fillStyle = '#7a1c2a'
        c.fillRect(x - 3, y - 3, 6, 6)
      }
    },
  },
  // La moquette acoustique du studio : anthracite chiné.
  'carpet-acoustic': {
    period: 1, surface: 'cloth',
    draw: (c, s, random) => {
      c.fillStyle = '#2b2e35'
      c.fillRect(0, 0, s, s)
      for (let k = 0; k < 2600; k++) { c.fillStyle = random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; c.fillRect(random() * s, random() * s, 2, 2) }
    },
  },
  // La moquette du bureau du Weekly : bleu nuit, filet orange des interfaces d'Elite.
  'carpet-weekly': {
    period: 1, surface: 'cloth',
    draw: (c, s, random) => {
      c.fillStyle = '#18233a'
      c.fillRect(0, 0, s, s)
      for (let k = 0; k < 1800; k++) { c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(random() * s, random() * s, 2, 2) }
      c.strokeStyle = 'rgba(255,138,28,0.75)'
      c.lineWidth = 4
      c.strokeRect(s * 0.08, s * 0.08, s * 0.84, s * 0.84)
      c.strokeStyle = 'rgba(255,138,28,0.35)'
      c.lineWidth = 2
      c.strokeRect(s * 0.14, s * 0.14, s * 0.72, s * 0.72)
    },
  },
  // Carrelage blanc des toilettes : petits carreaux, joints gris.
  'tiles-white': {
    period: 1, surface: 'grain', shine: 60,
    draw: (c, s, random) => {
      const n = 6, q = s / n
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        c.fillStyle = shade('#e8ecef', (random() - 0.5) * 0.04)
        c.fillRect(i * q, j * q, q, q)
      }
      c.strokeStyle = '#9aa3ab'
      c.lineWidth = 3
      for (let k = 0; k <= n; k++) { c.beginPath(); c.moveTo(k * q, 0); c.lineTo(k * q, s); c.moveTo(0, k * q); c.lineTo(s, k * q); c.stroke() }
    },
  },
  // Les vestiaires : mosaïque bleue et blanche de piscine, une frise.
  'tiles-pool': {
    period: 1, surface: 'grain', shine: 70,
    draw: (c, s, random) => {
      const n = 8, q = s / n
      const blues = ['#2f7fc1', '#3a90d0', '#5aa8e0', '#e6f2fb']
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const border = j === 0 || j === n - 1
        c.fillStyle = border ? blues[(i + j) % 2] : random() < 0.15 ? blues[2] : blues[3]
        c.fillRect(i * q, j * q, q, q)
      }
      c.strokeStyle = 'rgba(80,110,130,0.5)'
      c.lineWidth = 2
      for (let k = 0; k <= n; k++) { c.beginPath(); c.moveTo(k * q, 0); c.lineTo(k * q, s); c.moveTo(0, k * q); c.lineTo(s, k * q); c.stroke() }
    },
  },
  // Le labo de la Chasse galactique : grands carreaux blancs, quadrillage vert du L.J.P.C.
  'lab-tiles': {
    period: 1, surface: 'grain', shine: 60,
    draw: (c, s) => {
      c.fillStyle = '#eef3f1'
      c.fillRect(0, 0, s, s)
      c.strokeStyle = '#b9c7c2'
      c.lineWidth = 3
      c.strokeRect(0, 0, s, s)
      c.beginPath(); c.moveTo(s / 2, 0); c.lineTo(s / 2, s); c.moveTo(0, s / 2); c.lineTo(s, s / 2); c.stroke()
      c.strokeStyle = 'rgba(87,230,193,0.55)'
      c.lineWidth = 2
      c.strokeRect(s * 0.06, s * 0.06, s * 0.88, s * 0.88)
    },
  },
  // La tôle larmée de l'atelier : losanges en relief, usure claire.
  'diamond-plate': {
    period: 1, surface: 'metal', shine: 40,
    draw: (c, s, random) => {
      c.fillStyle = '#5c5f63'
      c.fillRect(0, 0, s, s)
      const n = 8, q = s / n
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const x = i * q + (j % 2) * q / 2, y = j * q + q / 2
        c.save()
        c.translate(x % s, y)
        c.rotate((j % 2 ? 1 : -1) * 0.8)
        c.fillStyle = '#7d8187'
        c.fillRect(-q * 0.32, -q * 0.07, q * 0.64, q * 0.14)
        c.fillStyle = '#3e4145'
        c.fillRect(-q * 0.32, q * 0.05, q * 0.64, q * 0.04)
        c.restore()
      }
      for (let k = 0; k < 30; k++) { c.fillStyle = `rgba(120,80,40,${random() * 0.12})`; c.beginPath(); c.arc(random() * s, random() * s, 6 + random() * 30, 0, Math.PI * 2); c.fill() }
    },
  },
  // Le caillebotis de la raffinerie et des salles des machines : une grille sur le noir.
  grating: {
    period: 1, surface: 'metal', shine: 30,
    draw: (c, s) => {
      c.fillStyle = '#121416'
      c.fillRect(0, 0, s, s)
      const n = 12, q = s / n
      c.fillStyle = '#5b5f66'
      for (let k = 0; k < n; k++) c.fillRect(k * q, 0, q * 0.22, s)
      c.fillStyle = '#474b51'
      for (let k = 0; k < n / 2; k++) c.fillRect(0, k * q * 2, s, q * 0.18)
      c.strokeStyle = '#2a2d31'
      c.lineWidth = 6
      c.strokeRect(0, 0, s, s)
    },
  },
  // Le béton peint du hall de la cale : dalles coulées, joints de dilatation, taches d'huile.
  concrete: {
    period: 2, surface: 'grain',
    draw: (c, s, random) => {
      c.fillStyle = '#6d6a64'
      c.fillRect(0, 0, s, s)
      for (let k = 0; k < 3000; k++) { c.fillStyle = random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)'; c.fillRect(random() * s, random() * s, 2, 2) }
      for (let k = 0; k < 6; k++) { c.fillStyle = `rgba(20,16,10,${0.08 + random() * 0.1})`; c.beginPath(); c.ellipse(random() * s, random() * s, 10 + random() * 40, 8 + random() * 25, random() * 3, 0, Math.PI * 2); c.fill() }
      c.strokeStyle = '#4a4742'
      c.lineWidth = 3
      c.beginPath(); c.moveTo(s / 2, 0); c.lineTo(s / 2, s); c.moveTo(0, s / 2); c.lineTo(s, s / 2); c.stroke()
      c.strokeRect(1, 1, s - 2, s - 2)
    },
  },
  // Le béton sombre de la planque des Scavengers : brut, rayé, des traces de pas.
  'concrete-dark': {
    period: 2, surface: 'grain',
    draw: (c, s, random) => {
      c.fillStyle = '#3d3c3a'
      c.fillRect(0, 0, s, s)
      for (let k = 0; k < 3000; k++) { c.fillStyle = random() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.09)'; c.fillRect(random() * s, random() * s, 2, 2) }
      c.strokeStyle = 'rgba(0,0,0,0.35)'
      for (let k = 0; k < 12; k++) { c.lineWidth = 1 + random() * 2; c.beginPath(); const x = random() * s, y = random() * s; c.moveTo(x, y); c.lineTo(x + (random() - 0.5) * 120, y + (random() - 0.5) * 120); c.stroke() }
    },
  },
  // Le caoutchouc des salles de sport : bleu, moucheté, une ligne blanche de terrain.
  'rubber-sport': {
    period: 2, surface: 'grain',
    draw: (c, s, random) => {
      c.fillStyle = '#2d5d8f'
      c.fillRect(0, 0, s, s)
      for (let k = 0; k < 2600; k++) { c.fillStyle = ['#7fb2e0', '#1b3f66', '#f0c93a'][Math.floor(random() * 3)]; c.globalAlpha = 0.35; c.fillRect(random() * s, random() * s, 3, 3) }
      c.globalAlpha = 1
      c.strokeStyle = 'rgba(255,255,255,0.75)'
      c.lineWidth = 5
      c.beginPath(); c.moveTo(0, s * 0.5); c.lineTo(s, s * 0.5); c.stroke()
    },
  },
  'rubber-dark': {
    period: 1, surface: 'grain',
    draw: (c, s, random) => {
      c.fillStyle = '#26292e'
      c.fillRect(0, 0, s, s)
      for (let k = 0; k < 1600; k++) { c.fillStyle = 'rgba(160,170,180,0.12)'; c.fillRect(random() * s, random() * s, 3, 3) }
      c.strokeStyle = '#1a1c20'
      c.lineWidth = 4
      c.strokeRect(0, 0, s, s)
    },
  },
  // Le lino à damier du placard à balais : jauni, ébréché.
  'lino-checker': {
    period: 1, surface: 'grain',
    draw: (c, s, random) => {
      const n = 4, q = s / n
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { c.fillStyle = (i + j) % 2 ? '#3b3d3a' : '#c9c1a3'; c.fillRect(i * q, j * q, q, q) }
      for (let k = 0; k < 20; k++) { c.fillStyle = `rgba(90,70,30,${random() * 0.15})`; c.beginPath(); c.arc(random() * s, random() * s, 10 + random() * 30, 0, Math.PI * 2); c.fill() }
    },
  },
  // La piste du Zorb : noir, éclats de néon.
  club: {
    period: 1, surface: 'grain', shine: 50,
    draw: (c, s, random) => {
      c.fillStyle = '#0d0b14'
      c.fillRect(0, 0, s, s)
      const neon = ['#ff3df2', '#3dfff0', '#b6ff3d', '#7a5cff']
      for (let k = 0; k < 160; k++) { c.fillStyle = neon[Math.floor(random() * neon.length)]; c.globalAlpha = 0.25 + random() * 0.5; c.fillRect(random() * s, random() * s, 3, 3) }
      c.globalAlpha = 1
    },
  },
}

const materials = new Map<FloorStyle, THREE.Material>()

/** Le matériau d'un sol dessiné : son motif, répété sans couture. */
export function floorStyleMaterial(style: FloorStyle): THREE.Material {
  let m = materials.get(style)
  if (m) return m
  const pattern = PATTERNS[style]
  const S = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const c = canvas.getContext('2d')!
  pattern.draw(c, S, rng(style.length * 9973 + style.charCodeAt(0)))
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.anisotropy = 8
  m = withSurface(pattern.shine ? new THREE.MeshPhongMaterial({ map, shininess: pattern.shine, specular: '#3a3f48' }) : new THREE.MeshLambertMaterial({ map }), pattern.surface)
  materials.set(style, m)
  return m
}

const geometries = new Map<string, THREE.BufferGeometry>()

/**
 * La dalle d'une tuile d'un sol dessiné (son dessus au niveau du sol, `depth` de profondeur) : le
 * dessus prend sa part du motif selon la position de la tuile, pour que les tuiles se raccordent.
 */
export function floorTileGeometry(style: FloorStyle, x: number, z: number, depth: number): THREE.BufferGeometry {
  const period = PATTERNS[style].period
  const px = ((x % period) + period) % period, pz = ((z % period) + period) % period
  const key = `${period}:${px}:${pz}:${depth}`
  let g = geometries.get(key)
  if (g) return g
  g = new THREE.BoxGeometry(1, depth, 1)
  const pos = g.getAttribute('position'), uv = g.getAttribute('uv')
  // Le dessus de la boîte : ses sommets 8 à 11 (face +y).
  for (let i = 8; i < 12; i++) {
    const vx = pos.getX(i), vz = pos.getZ(i)
    uv.setXY(i, (px + vx + 0.5) / period, 1 - (pz + vz + 0.5) / period)
  }
  uv.needsUpdate = true
  geometries.set(key, g)
  return g
}
