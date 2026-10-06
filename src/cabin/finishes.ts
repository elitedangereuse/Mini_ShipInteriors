import * as THREE from 'three'
import { rng } from '../furniture/kit'
import type { Finish } from './layout'
import { tr } from '../i18n'

/*
 * Revêtements des quartiers : papiers peints et parements des murs, sols. Chaque motif se
 * dessine dans un canvas carré qui se raccorde de tous côtés, dans la couleur choisie (les
 * teintes secondaires en dérivent). L'aléatoire a une graine fixe par motif : le même motif
 * dans la même couleur donne la même image partout, chez l'hôte comme chez ses invités.
 */

export type Slot = 'wall' | 'floor'

export interface FinishStyle {
  id: string
  name: string
  /** Couleur par défaut, puis les teintes proposées (#rrggbb). */
  palette: string[]
  /** Côté d'un motif, en mètres (une répétition de la texture). */
  size: number
  /** Sol d'extérieur (gazon, gravier, pavés…) : rangé à part dans le mode construction. */
  outdoor?: boolean
  draw: (g: CanvasRenderingContext2D, s: number, c: Tones, random: () => number) => void
}

/** Côté du canvas d'un motif, en pixels. */
const S = 256

// ---------------------------------------------------------------- couleurs

const _c = new THREE.Color()
const _hsl = { h: 0, s: 0, l: 0 }

/** Une couleur et ses nuances, en CSS (sRGB). */
export class Tones {
  readonly h: number
  readonly s: number
  readonly l: number
  constructor(readonly hex: string) {
    _c.set(hex).getHSL(_hsl, THREE.SRGBColorSpace)
    this.h = _hsl.h
    this.s = _hsl.s
    this.l = _hsl.l
  }

  /** Couleur foncée : les motifs y dessinent en clair. */
  get dark(): boolean {
    return this.l < 0.42
  }

  /** La couleur éclaircie (k > 0) ou assombrie (k < 0). */
  shade(k: number, sat = 0): string {
    return `#${_c.setHSL(this.h, THREE.MathUtils.clamp(this.s + sat, 0, 1), THREE.MathUtils.clamp(this.l + k, 0, 1), THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace)}`
  }

  /** Mélange avec une autre couleur (k = 1 : l'autre). */
  mix(other: string, k: number): string {
    const a = new THREE.Color().setStyle(this.hex, THREE.SRGBColorSpace)
    const b = new THREE.Color().setStyle(other, THREE.SRGBColorSpace)
    return `#${a.lerp(b, k).getHexString(THREE.SRGBColorSpace)}`
  }
}

// ---------------------------------------------------------------- outils de dessin

/** Dessine `fn` en (x, y) et, près des bords, de l'autre côté aussi : le motif se raccorde. */
function wrapped(x: number, y: number, r: number, fn: (x: number, y: number) => void) {
  for (const dx of [-S, 0, S]) {
    for (const dy of [-S, 0, S]) {
      if (x + dx + r < 0 || x + dx - r > S || y + dy + r < 0 || y + dy - r > S) continue
      fn(x + dx, y + dy)
    }
  }
}

/** Fines taches plus claires et plus sombres : le grain d'une matière. */
function grain(g: CanvasRenderingContext2D, c: Tones, random: () => number, n: number, k = 0.04, size = 1.5, alpha = 0.5) {
  g.globalAlpha = alpha
  for (let i = 0; i < n; i++) {
    g.fillStyle = random() < 0.5 ? c.shade(k) : c.shade(-k)
    g.fillRect(random() * S, random() * S, size, size)
  }
  g.globalAlpha = 1
}

/** Nuages doux (béton, marbre) : grands disques flous, à peine visibles. */
function mottle(g: CanvasRenderingContext2D, c: Tones, random: () => number, n: number, k: number, radius: number) {
  for (let i = 0; i < n; i++) {
    const x = random() * S, y = random() * S, r = radius * (0.5 + random())
    const tone = random() < 0.5 ? c.shade(k) : c.shade(-k)
    wrapped(x, y, r, (px, py) => {
      const grad = g.createRadialGradient(px, py, 0, px, py, r)
      grad.addColorStop(0, tone)
      grad.addColorStop(1, `${tone}00`)
      g.fillStyle = grad
      g.globalAlpha = 0.35
      g.fillRect(px - r, py - r, r * 2, r * 2)
    })
  }
  g.globalAlpha = 1
}

/** Veinage du bois le long de x (y pour des lames verticales : on tourne le canvas). */
function woodGrain(g: CanvasRenderingContext2D, c: Tones, random: () => number, x0: number, y0: number, w: number, h: number) {
  g.save()
  g.beginPath()
  g.rect(x0, y0, w, h)
  g.clip()
  g.lineWidth = 1
  for (let i = 0; i < h / 3; i++) {
    const y = y0 + random() * h, amp = 0.6 + random() * 1.4, freq = 0.02 + random() * 0.04, phase = random() * 6
    g.strokeStyle = random() < 0.6 ? c.shade(-0.08) : c.shade(0.05)
    g.globalAlpha = 0.35 + random() * 0.3
    g.beginPath()
    for (let x = x0; x <= x0 + w; x += 4) {
      const yy = y + Math.sin(x * freq + phase) * amp
      if (x === x0) g.moveTo(x, yy)
      else g.lineTo(x, yy)
    }
    g.stroke()
  }
  // Un nœud de temps en temps.
  if (random() < 0.35) {
    const kx = x0 + w * (0.2 + random() * 0.6), ky = y0 + h * (0.3 + random() * 0.4)
    g.globalAlpha = 0.45
    g.strokeStyle = c.shade(-0.16)
    for (let k = 1; k <= 3; k++) {
      g.beginPath()
      g.ellipse(kx, ky, 3 * k, 1.2 * k, 0, 0, Math.PI * 2)
      g.stroke()
    }
  }
  g.restore()
  g.globalAlpha = 1
}

/** Tracé d'un hexagone à sommets sur l'horizontale (rayon r, légèrement aplati de `squash`). */
function hexPath(g: CanvasRenderingContext2D, x: number, y: number, r: number, squash = 1) {
  g.beginPath()
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * squash
    if (k) g.lineTo(px, py)
    else g.moveTo(px, py)
  }
  g.closePath()
}

/**
 * Pavage d'hexagones qui se raccorde sur un carré : rayon S/12 (quatre colonnes doubles en
 * largeur), sept rangées en hauteur, soit un aplatissement d'à peine 1 %.
 */
function hexGrid(fn: (x: number, y: number, r: number, squash: number, col: number, row: number) => void) {
  const r = S / 12, dy = S / 7, squash = dy / (Math.sqrt(3) * r)
  for (let col = -1; col <= 8; col++) {
    for (let row = -1; row <= 7; row++) fn(col * 1.5 * r, row * dy + (col % 2 ? dy / 2 : 0), r, squash, col, row)
  }
}

// ---------------------------------------------------------------- murs

/** Fleuron damassé, symétrique, centré en (x, y), hauteur ~2 × 46 × k. */
function flourish(g: CanvasRenderingContext2D, x: number, y: number, k: number) {
  g.save()
  g.translate(x, y)
  g.scale(k, k)
  for (const side of [-1, 1]) {
    g.save()
    g.scale(side, 1)
    // Grande feuille recourbée, et sa volute.
    g.beginPath()
    g.moveTo(0, -46)
    g.bezierCurveTo(8, -34, 26, -30, 30, -12)
    g.bezierCurveTo(33, 2, 22, 10, 12, 4)
    g.bezierCurveTo(20, -6, 14, -18, 4, -14)
    g.bezierCurveTo(8, -4, 4, 10, 0, 16)
    g.closePath()
    g.fill()
    g.beginPath()
    g.arc(26, -26, 5, 0, Math.PI * 2)
    g.fill()
    // Feuille du bas.
    g.beginPath()
    g.moveTo(0, 18)
    g.bezierCurveTo(10, 16, 26, 22, 30, 38)
    g.bezierCurveTo(18, 38, 8, 32, 0, 46)
    g.closePath()
    g.fill()
    g.restore()
  }
  // Tige et bouton central.
  g.beginPath()
  g.ellipse(0, 0, 5, 12, 0, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.moveTo(0, -60)
  g.lineTo(5, -48)
  g.lineTo(0, -44)
  g.lineTo(-5, -48)
  g.closePath()
  g.fill()
  g.restore()
}

/** Feuille allongée (bananier) : limbe, nervure, veines obliques. */
function leaf(g: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, w: number, fill: string, vein: string) {
  g.save()
  g.translate(x, y)
  g.rotate(a)
  g.fillStyle = fill
  g.beginPath()
  g.moveTo(0, 0)
  g.bezierCurveTo(w, len * 0.2, w * 0.9, len * 0.8, 0, len)
  g.bezierCurveTo(-w * 0.9, len * 0.8, -w, len * 0.2, 0, 0)
  g.fill()
  g.strokeStyle = vein
  g.lineWidth = 1.2
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(0, len * 0.98)
  for (let t = 0.15; t < 0.9; t += 0.09) {
    for (const side of [-1, 1]) {
      g.moveTo(0, len * t)
      g.lineTo(side * w * 0.8 * Math.sin(Math.PI * (t + 0.1)), len * (t + 0.08))
    }
  }
  g.stroke()
  g.restore()
}

export const WALL_STYLES: FinishStyle[] = [
  {
    id: 'paint', name: tr('Peinture', 'Paint'), size: 1,
    palette: ['#efe3cf', '#d9c4a0', '#9fb59a', '#3f7f7c', '#8fb3c9', '#34507a', '#c0643f', '#d9a0a0', '#d9a441', '#6e4a6e', '#3a3e46', '#f4f2ec'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      grain(g, c, random, 2200, 0.03)
    },
  },
  {
    id: 'stripes', name: tr('Rayures', 'Stripes'), size: 0.5,
    palette: ['#9fb59a', '#efe3cf', '#8fb3c9', '#34507a', '#d9a0a0', '#d9a441', '#7a2e3a', '#3a3e46'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      const p = s / 4
      for (let x = 0; x < s; x += p) {
        g.fillStyle = c.shade(c.dark ? 0.08 : 0.07)
        g.fillRect(x, 0, p * 0.42, s)
        g.fillStyle = c.shade(c.dark ? 0.16 : -0.1)
        g.fillRect(x + p * 0.55, 0, 2, s)
        g.fillRect(x + p * 0.62, 0, 2, s)
      }
      grain(g, c, random, 900, 0.025)
    },
  },
  {
    id: 'damask', name: tr('Damassé', 'Damask'), size: 0.4,
    palette: ['#7a2e3a', '#34507a', '#2f6b4f', '#1f2a3a', '#c9a24a', '#e9dcc4', '#3f7f7c', '#5a3a5a'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      grain(g, c, random, 900, 0.02)
      g.fillStyle = c.dark ? c.shade(0.1, -0.05) : c.shade(-0.1)
      // Deux fleurons par motif, en quinconce (au centre et aux coins), une rosette entre eux.
      wrapped(s / 2, s / 2, 100, (px, py) => flourish(g, px, py, 1.3))
      wrapped(0, 0, 100, (px, py) => flourish(g, px, py, 1.3))
      g.globalAlpha = 0.7
      for (const [x, y] of [[s / 2, 0], [0, s / 2]]) {
        wrapped(x, y, 16, (px, py) => {
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2
            g.beginPath()
            g.ellipse(px + Math.cos(a) * 7, py + Math.sin(a) * 7, 5, 2.5, a, 0, Math.PI * 2)
            g.fill()
          }
        })
      }
      g.globalAlpha = 1
    },
  },
  {
    id: 'scales', name: tr('Écailles art déco', 'Art deco scales'), size: 0.3,
    palette: ['#2c4a6e', '#1f4a4a', '#efe3cf', '#7a2e3a', '#3a3e46', '#d9a441', '#9fb59a'],
    draw: (g, s, c) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      const r = s / 8
      const line = c.dark ? c.mix('#e9c46a', 0.7) : c.shade(-0.22)
      // Rangées d'éventails, décalées d'un demi-éventail ; celles du bas recouvrent celles du haut.
      for (let row = -1; row <= 8; row++) {
        for (let col = -1; col <= 4; col++) {
          const x = col * r * 2 + (row % 2 ? r : 0), y = row * r
          g.fillStyle = row % 2 ? c.hex : c.shade(c.dark ? 0.04 : -0.03)
          g.beginPath()
          g.arc(x, y, r, 0, Math.PI)
          g.fill()
          g.strokeStyle = line
          g.lineWidth = 2
          for (const k of [1, 0.66, 0.33]) {
            g.beginPath()
            g.arc(x, y, r * k, 0, Math.PI)
            g.stroke()
          }
        }
      }
    },
  },
  {
    id: 'stars', name: 'Constellations', size: 0.6,
    palette: ['#1b2440', '#121318', '#2a1f40', '#10302e', '#3a1f2a', '#34507a'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      const star = c.dark ? '#fff3d6' : c.shade(-0.35)
      for (let i = 0; i < 90; i++) {
        const x = random() * s, y = random() * s, r = random() < 0.1 ? 1.6 : 0.8
        g.globalAlpha = 0.4 + random() * 0.6
        g.fillStyle = star
        wrapped(x, y, 2, (px, py) => g.fillRect(px - r, py - r, r * 2, r * 2))
      }
      // Quelques constellations : étoiles brillantes reliées de fins traits.
      for (let k = 0; k < 4; k++) {
        const cx = random() * s, cy = random() * s
        const pts = Array.from({ length: 4 + Math.floor(random() * 3) }, () => [cx + (random() - 0.5) * 80, cy + (random() - 0.5) * 80] as const)
        wrapped(cx, cy, 70, (px, py) => {
          const ox = px - cx, oy = py - cy
          g.globalAlpha = 0.35
          g.strokeStyle = star
          g.lineWidth = 1
          g.beginPath()
          pts.forEach(([x, y], i) => (i ? g.lineTo(x + ox, y + oy) : g.moveTo(x + ox, y + oy)))
          g.stroke()
          g.globalAlpha = 0.95
          g.fillStyle = star
          for (const [x, y] of pts) {
            g.beginPath()
            g.arc(x + ox, y + oy, 2.4, 0, Math.PI * 2)
            g.fill()
            g.fillRect(x + ox - 5, y + oy - 0.5, 10, 1)
            g.fillRect(x + ox - 0.5, y + oy - 5, 1, 10)
          }
        })
      }
      g.globalAlpha = 1
    },
  },
  {
    id: 'leaves', name: tr('Feuillage', 'Foliage'), size: 0.6,
    palette: ['#dfe8d5', '#efe3cf', '#f2dcd2', '#cfe0e6', '#1f3a2e', '#2a2a30'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      const fills = c.dark ? [c.shade(0.12, 0.05), c.shade(0.2, 0.05)] : [c.shade(-0.28, 0.12), c.shade(-0.42, 0.1)]
      for (let i = 0; i < 16; i++) {
        const x = random() * s, y = random() * s, a = random() * Math.PI * 2, len = 60 + random() * 50, w = 16 + random() * 10
        const fill = fills[i % 2]
        wrapped(x, y, len, (px, py) => leaf(g, px, py, a, len, w, fill, c.hex))
      }
    },
  },
  {
    id: 'wood', name: tr('Lambris', 'Wood panelling'), size: 0.4,
    palette: ['#b08556', '#d8c2a0', '#c49a6c', '#8a5a3a', '#6b4630', '#3a2a22', '#e6ddd0', '#5a7a8a', '#7e8f6a'],
    draw: (g, s, c, random) => {
      // Lames verticales : on dessine des lames horizontales, puis on tourne le tout d'un quart de tour.
      g.save()
      g.translate(s, 0)
      g.rotate(Math.PI / 2)
      const w = s / 4
      for (let i = 0; i < 4; i++) {
        const plank = new Tones(c.shade((random() - 0.5) * 0.08))
        g.fillStyle = plank.hex
        g.fillRect(0, i * w, s, w)
        woodGrain(g, plank, random, 0, i * w, s, w)
        g.fillStyle = c.shade(-0.22)
        g.fillRect(0, i * w, s, 2)
      }
      g.restore()
    },
  },
  {
    id: 'brick', name: tr('Briques', 'Brick'), size: 0.5,
    palette: ['#a4533a', '#c07048', '#7a4a3a', '#b89a7a', '#8a8a8a', '#e8e4dc', '#3a3a3e'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.dark ? c.mix('#8a8680', 0.6) : c.mix('#d8d2c4', 0.72)
      g.fillRect(0, 0, s, s)
      const h = s / 8, w = s / 4, m = 3
      for (let row = 0; row < 8; row++) {
        for (let col = -1; col < 4; col++) {
          const x = col * w + (row % 2 ? w / 2 : 0), y = row * h
          const brick = new Tones(c.shade((random() - 0.5) * 0.1, (random() - 0.5) * 0.08))
          g.fillStyle = brick.hex
          g.fillRect(x + m / 2, y + m / 2, w - m, h - m)
          g.fillStyle = brick.shade(-0.06)
          g.fillRect(x + m / 2, y + h - m / 2 - 3, w - m, 3)
          g.fillStyle = brick.shade(0.05)
          g.fillRect(x + m / 2, y + m / 2, w - m, 2)
        }
      }
      grain(g, c, random, 1800, 0.06, 1.5, 0.35)
    },
  },
  {
    id: 'concrete', name: tr('Béton banché', 'Cast concrete'), size: 1,
    palette: ['#9a9a96', '#c8c6c0', '#6e6e6c', '#4a4a4c', '#b8aa98'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      mottle(g, c, random, 40, 0.05, 40)
      grain(g, c, random, 2600, 0.05, 1.5, 0.4)
      // Joints de coffrage et trous des tiges.
      g.fillStyle = c.shade(-0.1)
      g.fillRect(0, 0, s, 2)
      g.fillRect(0, 0, 2, s)
      for (const [x, y] of [[s / 4, s / 4], [(s * 3) / 4, s / 4], [s / 4, (s * 3) / 4], [(s * 3) / 4, (s * 3) / 4]]) {
        g.fillStyle = c.shade(0.06)
        g.beginPath()
        g.arc(x, y, 7, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = c.shade(-0.2)
        g.beginPath()
        g.arc(x, y, 4, 0, Math.PI * 2)
        g.fill()
      }
    },
  },
  {
    id: 'panels', name: tr('Panneaux de coque', 'Hull panels'), size: 0.5,
    palette: ['#7a8292', '#4a505c', '#d8dce2', '#3a4a5c', '#8a6a4a', '#5a6a5a'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.shade(-0.12)
      g.fillRect(0, 0, s, s)
      const w = s / 2, h = s / 2, m = 4
      for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
        g.fillStyle = c.hex
        g.fillRect(x + m, y + m, w - m * 2, h - m * 2)
        g.fillStyle = c.shade(0.1)
        g.fillRect(x + m, y + m, w - m * 2, 2)
        g.fillRect(x + m, y + m, 2, h - m * 2)
        g.fillStyle = c.shade(-0.18)
        g.fillRect(x + m, y + h - m - 2, w - m * 2, 2)
        g.fillRect(x + w - m - 2, y + m, 2, h - m * 2)
        g.fillStyle = c.shade(-0.25)
        for (const [rx, ry] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]]) {
          g.beginPath()
          g.arc(x + rx, y + ry, 2.5, 0, Math.PI * 2)
          g.fill()
        }
      }
      // Une grille d'aération, et un bandeau au pochoir.
      g.fillStyle = c.shade(-0.3)
      for (let i = 0; i < 6; i++) g.fillRect(w + 24, 24 + i * 14, w - 48, 6)
      g.fillStyle = c.dark ? '#ff8a1c' : c.mix('#ff8a1c', 0.75)
      g.fillRect(16, h + h - 30, w - 32, 6)
      grain(g, c, random, 1200, 0.04, 1.2, 0.35)
    },
  },
  {
    id: 'quilted', name: tr('Capitonné', 'Quilted'), size: 0.3,
    palette: ['#6e2a2a', '#8a5a3a', '#2f4a3a', '#1f1f24', '#e9dcc4', '#34507a', '#d98b8b'],
    draw: (g, s, c) => {
      g.fillStyle = c.shade(-0.1)
      g.fillRect(0, 0, s, s)
      const p = s / 2
      // Losanges bombés : plus clairs au centre, plus sombres vers les coutures.
      for (let row = -1; row <= 3; row++) {
        for (let col = -1; col <= 2; col++) {
          const x = col * p + (row % 2 ? p / 2 : 0), y = row * (p / 2) + p / 2
          const grad = g.createRadialGradient(x, y - 6, 4, x, y, p * 0.6)
          grad.addColorStop(0, c.shade(0.1))
          grad.addColorStop(0.6, c.hex)
          grad.addColorStop(1, c.shade(-0.14))
          g.fillStyle = grad
          g.beginPath()
          g.moveTo(x, y - p / 2)
          g.lineTo(x + p / 2, y)
          g.lineTo(x, y + p / 2)
          g.lineTo(x - p / 2, y)
          g.closePath()
          g.fill()
        }
      }
      // Boutons aux croisements des coutures.
      for (let row = 0; row <= 4; row++) {
        for (let col = 0; col <= 2; col++) {
          const x = col * p + (row % 2 ? p / 2 : 0), y = row * (p / 2)
          g.fillStyle = c.shade(-0.22)
          g.beginPath()
          g.arc(x, y, 5, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = c.shade(0.05)
          g.beginPath()
          g.arc(x - 1, y - 1, 2, 0, Math.PI * 2)
          g.fill()
        }
      }
    },
  },
  {
    id: 'hex', name: tr('Alvéoles', 'Honeycomb'), size: 0.3,
    palette: ['#3a4a5c', '#1f2430', '#d8dce2', '#ff8a1c', '#2f6b4f', '#6e4a6e'],
    draw: (g, s, c) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      g.lineWidth = 3
      g.strokeStyle = c.dark ? c.shade(0.14) : c.shade(-0.16)
      hexGrid((x, y, r, squash, col, row) => {
        g.fillStyle = (col * 3 + row * 5) % 7 === 0 ? c.shade(c.dark ? 0.05 : -0.05) : c.hex
        hexPath(g, x, y, r - 2, squash)
        g.fill()
        g.stroke()
      })
    },
  },
]

// ---------------------------------------------------------------- sols

export const FLOOR_STYLES: FinishStyle[] = [
  {
    id: 'planks', name: tr('Parquet', 'Floorboards'), size: 1,
    palette: ['#b08556', '#d8c2a0', '#c49a6c', '#8a5a3a', '#6b4630', '#3a2a22', '#e6ddd0', '#8a8a86'],
    draw: (g, s, c, random) => {
      const h = s / 8, len = s / 2
      for (let row = 0; row < 8; row++) {
        const offset = [0, 0.5, 0.25, 0.75][row % 4] * len
        for (let k = -1; k < 2; k++) {
          const x = k * len + offset
          const plank = new Tones(c.shade((random() - 0.5) * 0.1))
          g.fillStyle = plank.hex
          g.fillRect(x, row * h, len, h)
          woodGrain(g, plank, random, x, row * h, len, h)
          g.fillStyle = c.shade(-0.2)
          g.fillRect(x, row * h, 2, h)
        }
        g.fillStyle = c.shade(-0.2)
        g.fillRect(0, row * h, s, 2)
      }
    },
  },
  {
    id: 'chevron', name: tr('Point de Hongrie', 'Chevron parquet'), size: 0.6,
    palette: ['#c49a6c', '#b08556', '#d8c2a0', '#8a5a3a', '#6b4630', '#e6ddd0'],
    draw: (g, s, c, random) => {
      const w = s / 4, h = s / 8
      for (let col = 0; col < 4; col++) {
        const x0 = col * w, dir = col % 2 ? -1 : 1
        g.save()
        g.beginPath()
        g.rect(x0, 0, w, s)
        g.clip()
        for (let k = -3; k < 12; k++) {
          const y0 = k * h
          const plank = new Tones(c.shade((random() - 0.5) * 0.12))
          g.fillStyle = plank.hex
          g.beginPath()
          g.moveTo(x0, y0)
          g.lineTo(x0 + w, y0 + dir * w)
          g.lineTo(x0 + w, y0 + dir * w + h)
          g.lineTo(x0, y0 + h)
          g.closePath()
          g.fill()
          g.strokeStyle = c.shade(-0.22)
          g.lineWidth = 1.5
          g.stroke()
        }
        g.restore()
      }
      grain(g, c, random, 1600, 0.05, 1.2, 0.3)
    },
  },
  {
    id: 'carpet', name: tr('Moquette', 'Carpet'), size: 0.5,
    palette: ['#6f7f95', '#8a4a4a', '#4a6a5a', '#b8a88a', '#3a3e46', '#d98b8b', '#5a3a8a', '#d9a441'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      g.lineWidth = 1
      for (let i = 0; i < 5000; i++) {
        const x = random() * s, y = random() * s, a = random() * Math.PI * 2
        g.strokeStyle = random() < 0.5 ? c.shade(0.06) : c.shade(-0.07)
        g.globalAlpha = 0.35
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5)
        g.stroke()
      }
      g.globalAlpha = 1
    },
  },
  {
    id: 'tiles', name: tr('Carrelage', 'Tiles'), size: 0.8,
    palette: ['#e8e4dc', '#efe3cf', '#9fb59a', '#6fa8b8', '#c07048', '#9a9a96', '#2a2a2e'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.dark ? c.shade(0.12) : c.mix('#8a8680', 0.45)
      g.fillRect(0, 0, s, s)
      const t = s / 4, m = 3
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          const tile = new Tones(c.shade((random() - 0.5) * 0.05))
          const grad = g.createLinearGradient(col * t, row * t, col * t + t, row * t + t)
          grad.addColorStop(0, tile.shade(0.04))
          grad.addColorStop(1, tile.shade(-0.03))
          g.fillStyle = grad
          g.fillRect(col * t + m / 2, row * t + m / 2, t - m, t - m)
        }
      }
    },
  },
  {
    id: 'checker', name: tr('Damier', 'Chequerboard'), size: 0.8,
    palette: ['#1f1f24', '#34507a', '#7a2e3a', '#2f6b4f', '#c07048', '#6e4a6e'],
    draw: (g, s, c, random) => {
      const light = c.dark ? c.mix('#f2eee6', 0.9) : c.shade(0.3)
      const t = s / 4
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          g.fillStyle = (row + col) % 2 ? c.hex : light
          g.fillRect(col * t, row * t, t, t)
        }
      }
      grain(g, c, random, 700, 0.02, 1.2, 0.2)
    },
  },
  {
    id: 'marble', name: tr('Marbre', 'Marble'), size: 1.2,
    palette: ['#ece8e2', '#2a2a2e', '#d9c7b0', '#9fb59a', '#c9a0a0'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      mottle(g, c, random, 24, 0.04, 50)
      // Veines : des marches au hasard, reprises de l'autre côté du canvas.
      const vein = c.dark ? '#e8e2d8' : c.shade(-0.3, -0.1)
      // Grandes veines qui ondulent doucement, dans une même direction générale.
      const main = random() * Math.PI
      for (let k = 0; k < 5; k++) {
        const pts: [number, number][] = []
        let x = random() * s, y = random() * s, a = main + (random() - 0.5) * 0.8
        for (let i = 0; i < 22; i++) {
          pts.push([x, y])
          a += (random() - 0.5) * 0.45
          x += Math.cos(a) * 11
          y += Math.sin(a) * 11
        }
        const width = 0.8 + random() * 1.6
        wrapped(pts[0][0], pts[0][1], 230, (px, py) => {
          const ox = px - pts[0][0], oy = py - pts[0][1]
          g.strokeStyle = vein
          g.lineJoin = g.lineCap = 'round'
          // Un halo large et pâle, puis le fil de la veine.
          for (const [w, alpha] of [[width * 8, 0.06], [width * 3, 0.12], [width, 0.3]]) {
            g.globalAlpha = alpha
            g.lineWidth = w
            g.beginPath()
            pts.forEach(([vx, vy], i) => (i ? g.lineTo(vx + ox, vy + oy) : g.moveTo(vx + ox, vy + oy)))
            g.stroke()
          }
        })
      }
      g.globalAlpha = 1
      // Dalles de 60 cm : joints fins.
      g.fillStyle = c.shade(c.dark ? 0.1 : -0.1)
      g.fillRect(0, 0, s, 1.5)
      g.fillRect(0, s / 2, s, 1.5)
      g.fillRect(0, 0, 1.5, s)
      g.fillRect(s / 2, 0, 1.5, s)
    },
  },
  {
    id: 'terrazzo', name: 'Terrazzo', size: 0.6,
    palette: ['#e6e0d6', '#c9d6d0', '#e8c8c0', '#d9c4a0', '#4a4a4c'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      const chips = c.dark ? ['#e8e4dc', '#b8653f', '#8fb3c9', '#d9a441'] : [c.shade(-0.35), '#b8653f', '#5a7a8a', c.shade(0.12), '#d9a441']
      for (let i = 0; i < 420; i++) {
        const x = random() * s, y = random() * s, r = 1.5 + random() * random() * 7, n = 5 + Math.floor(random() * 3)
        const color = chips[Math.floor(random() * chips.length)]
        const shape = Array.from({ length: n }, (_, k) => [((k / n) * Math.PI * 2), r * (0.6 + random() * 0.5)] as const)
        wrapped(x, y, r, (px, py) => {
          g.fillStyle = color
          g.beginPath()
          shape.forEach(([a, d], k) => (k ? g.lineTo(px + Math.cos(a) * d, py + Math.sin(a) * d) : g.moveTo(px + Math.cos(a) * d, py + Math.sin(a) * d)))
          g.closePath()
          g.fill()
        })
      }
    },
  },
  {
    id: 'hextiles', name: tr('Tomettes', 'Hexagonal tiles'), size: 0.5,
    palette: ['#b8653f', '#c9884f', '#8a4a32', '#e6ddd0', '#6e6e6c'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.dark ? c.shade(0.14) : c.mix('#d8d2c4', 0.6)
      g.fillRect(0, 0, s, s)
      hexGrid((x, y, r, squash) => {
        const tile = new Tones(c.shade((random() - 0.5) * 0.1, (random() - 0.5) * 0.1))
        g.fillStyle = tile.hex
        hexPath(g, x, y, r - 1.8, squash)
        g.fill()
      })
      grain(g, c, random, 1600, 0.05, 1.5, 0.3)
    },
  },
  {
    id: 'plate', name: tr('Tôle larmée', 'Tread plate'), size: 0.4,
    palette: ['#9aa2ae', '#6e7480', '#c9a24a', '#4a505c', '#8a5a3a'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      // Brossage du métal.
      g.globalAlpha = 0.25
      for (let i = 0; i < 180; i++) {
        g.fillStyle = random() < 0.5 ? c.shade(0.06) : c.shade(-0.05)
        g.fillRect(0, random() * s, s, 1)
      }
      g.globalAlpha = 1
      const p = s / 8
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const x = col * p + p / 2, y = row * p + p / 2, a = (row + col) % 2 ? Math.PI / 4 : -Math.PI / 4
          g.save()
          g.translate(x, y)
          g.rotate(a)
          g.fillStyle = c.shade(-0.14)
          g.beginPath()
          g.ellipse(1, 1.5, p * 0.36, p * 0.1, 0, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = c.shade(0.12)
          g.beginPath()
          g.ellipse(0, 0, p * 0.36, p * 0.1, 0, 0, Math.PI * 2)
          g.fill()
          g.restore()
        }
      }
    },
  },
  {
    id: 'concrete', name: tr('Béton ciré', 'Polished concrete'), size: 1.2,
    palette: ['#a8a6a0', '#c8c6c0', '#7a7a78', '#4a4a4c', '#c4b8a4'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      mottle(g, c, random, 50, 0.05, 36)
      // Traces de taloche : de grands arcs à peine marqués.
      g.lineWidth = 6
      for (let i = 0; i < 26; i++) {
        const x = random() * s, y = random() * s, r = 20 + random() * 30, a = random() * Math.PI * 2
        g.strokeStyle = random() < 0.5 ? c.shade(0.04) : c.shade(-0.04)
        wrapped(x, y, r + 4, (px, py) => {
          g.globalAlpha = 0.25
          g.beginPath()
          g.arc(px, py, r, a, a + 1.2)
          g.stroke()
        })
      }
      g.globalAlpha = 1
      grain(g, c, random, 1500, 0.03, 1.2, 0.3)
    },
  },
  {
    id: 'tatami', name: tr('Tatamis', 'Tatami'), size: 1,
    palette: ['#c9c08a', '#a8b07a', '#d9cfa0', '#b89a6a'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      // Deux nattes côte à côte, tissées dans la longueur, bordées de tissu sombre.
      g.lineWidth = 1
      for (let y = 0; y < s; y += 3) {
        g.strokeStyle = (y / 3) % 2 ? c.shade(-0.05) : c.shade(0.04)
        g.globalAlpha = 0.7
        g.beginPath()
        g.moveTo(0, y + 0.5)
        g.lineTo(s, y + 0.5)
        g.stroke()
      }
      g.globalAlpha = 1
      grain(g, c, random, 1400, 0.05, 1.2, 0.35)
      g.fillStyle = '#2f3a34'
      for (const x of [0, s / 2]) {
        g.fillRect(x, 0, 6, s)
        g.fillRect(x + s / 2 - 6, 0, 6, s)
      }
      g.fillStyle = c.shade(-0.18)
      g.fillRect(0, 0, s, 1.5)
    },
  },
]

// ---------------------------------------------------------------- sols d'extérieur

/** Brins d'herbe : de courts traits vers le haut, penchés au hasard, dans les nuances du vert choisi. */
function blades(g: CanvasRenderingContext2D, c: Tones, random: () => number, n: number, len: number, spread = 0.1) {
  g.lineWidth = 1.4
  g.lineCap = 'round'
  for (let i = 0; i < n; i++) {
    const x = random() * S, y = random() * S, h = len * (0.5 + random()), lean = (random() - 0.5) * len * 0.9
    g.strokeStyle = c.shade((random() - 0.5) * 2 * spread, (random() - 0.5) * 0.1)
    g.globalAlpha = 0.55 + random() * 0.4
    wrapped(x, y, len * 1.5, (px, py) => {
      g.beginPath()
      g.moveTo(px, py)
      g.quadraticCurveTo(px + lean * 0.3, py - h * 0.6, px + lean, py - h)
      g.stroke()
    })
  }
  g.globalAlpha = 1
}

/** Cailloux : des polygones arrondis, ombrés d'un côté. */
function pebbles(g: CanvasRenderingContext2D, c: Tones, random: () => number, n: number, min: number, max: number, spread = 0.12) {
  for (let i = 0; i < n; i++) {
    const x = random() * S, y = random() * S, r = min + random() * (max - min), a = random() * Math.PI
    const tone = new Tones(c.shade((random() - 0.5) * 2 * spread))
    wrapped(x, y, r * 1.4, (px, py) => {
      g.fillStyle = tone.shade(-0.14)
      g.beginPath()
      g.ellipse(px + r * 0.12, py + r * 0.16, r, r * 0.74, a, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = tone.hex
      g.beginPath()
      g.ellipse(px, py, r, r * 0.74, a, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = tone.shade(0.07)
      g.beginPath()
      g.ellipse(px - r * 0.2, py - r * 0.2, r * 0.5, r * 0.3, a, 0, Math.PI * 2)
      g.fill()
    })
  }
}

/** Petite fleur vue de dessus : des pétales autour d'un cœur. */
function blossom(g: CanvasRenderingContext2D, x: number, y: number, r: number, petal: string, heart: string, petals = 5) {
  g.fillStyle = petal
  for (let k = 0; k < petals; k++) {
    const a = (k / petals) * Math.PI * 2
    g.beginPath()
    g.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.5, r * 0.32, a, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = heart
  g.beginPath()
  g.arc(x, y, r * 0.3, 0, Math.PI * 2)
  g.fill()
}

const GREENS = ['#5f9e45', '#4c8a3a', '#7ab552', '#6f9a5a', '#3f7a52', '#9aa84e', '#b8a85a']

export const OUTDOOR_FLOOR_STYLES: FinishStyle[] = [
  {
    id: 'lawn', name: tr('Gazon tondu', 'Mown lawn'), size: 1, outdoor: true, palette: GREENS,
    draw: (g, s, c, random) => {
      // Les bandes de la tondeuse : une sur deux un peu plus claire.
      for (let i = 0; i < 2; i++) {
        g.fillStyle = i ? c.shade(0.035) : c.shade(-0.02)
        g.fillRect((i * s) / 2, 0, s / 2, s)
      }
      mottle(g, c, random, 14, 0.04, 40)
      blades(g, c, random, 2600, 5, 0.07)
    },
  },
  {
    id: 'grass', name: tr('Herbe folle', 'Rough grass'), size: 1, outdoor: true, palette: GREENS,
    draw: (g, s, c, random) => {
      g.fillStyle = c.shade(-0.06)
      g.fillRect(0, 0, s, s)
      mottle(g, c, random, 22, 0.08, 46)
      blades(g, c, random, 2200, 11, 0.13)
      blades(g, new Tones(c.shade(0.1, 0.05)), random, 500, 14, 0.06)
    },
  },
  {
    id: 'meadow', name: tr('Prairie fleurie', 'Flower meadow'), size: 1, outdoor: true, palette: GREENS,
    draw: (g, s, c, random) => {
      g.fillStyle = c.shade(-0.04)
      g.fillRect(0, 0, s, s)
      mottle(g, c, random, 18, 0.07, 44)
      blades(g, c, random, 2000, 9, 0.12)
      const kinds: [string, string][] = [['#ffffff', '#ffd23c'], ['#ffd23c', '#f08a2a'], ['#ff8ac8', '#ffe9a8'], ['#8fa8ff', '#ffffff'], ['#e8453a', '#2a2420']]
      for (let i = 0; i < 46; i++) {
        const x = random() * s, y = random() * s, r = 3.5 + random() * 3
        const [petal, heart] = kinds[Math.floor(random() * kinds.length)]
        wrapped(x, y, r * 1.2, (px, py) => blossom(g, px, py, r, petal, heart))
      }
    },
  },
  {
    id: 'clover', name: tr('Trèfle', 'Clover'), size: 0.8, outdoor: true, palette: ['#4f9a4a', '#3c7a44', '#6aa84f', '#5a8a5a'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.shade(-0.1)
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 520; i++) {
        const x = random() * s, y = random() * s, r = 4 + random() * 3, a = random() * Math.PI
        const leaf = c.shade((random() - 0.5) * 0.16)
        wrapped(x, y, r * 1.6, (px, py) => {
          g.fillStyle = leaf
          for (let k = 0; k < 3; k++) {
            g.beginPath()
            g.arc(px + Math.cos(a + (k * Math.PI * 2) / 3) * r * 0.62, py + Math.sin(a + (k * Math.PI * 2) / 3) * r * 0.62, r * 0.62, 0, Math.PI * 2)
            g.fill()
          }
        })
      }
      // Quelques fleurs de trèfle, blanches.
      for (let i = 0; i < 14; i++) {
        const x = random() * s, y = random() * s
        wrapped(x, y, 5, (px, py) => blossom(g, px, py, 4, '#f4f1ea', '#e8d8e0', 7))
      }
    },
  },
  {
    id: 'moss', name: tr('Mousse', 'Moss'), size: 0.9, outdoor: true, palette: ['#5a8a3e', '#6f9a48', '#48783a', '#7a9a52'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.shade(-0.05)
      g.fillRect(0, 0, s, s)
      mottle(g, c, random, 60, 0.1, 26)
      grain(g, c, random, 6000, 0.09, 2, 0.6)
    },
  },
  {
    id: 'gravel', name: tr('Gravier', 'Gravel'), size: 0.7, outdoor: true, palette: ['#b8b2a6', '#d8d2c4', '#8f8c86', '#c8a888', '#e8e4dc', '#6a6a6c'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.shade(-0.22)
      g.fillRect(0, 0, s, s)
      pebbles(g, c, random, 900, 3.5, 7.5, 0.13)
    },
  },
  {
    id: 'cobble', name: tr('Galets', 'Cobbles'), size: 0.9, outdoor: true, palette: ['#9a9a92', '#b8a88a', '#77776f', '#c8c4b8', '#8a7a6a'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.shade(-0.26)
      g.fillRect(0, 0, s, s)
      // Des galets ronds, en quinconce, serrés.
      const n = 8, d = s / n
      for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
        const x = (col + (row % 2 ? 0.5 : 0)) * d + (random() - 0.5) * 3, y = (row + 0.5) * d + (random() - 0.5) * 3
        const tone = new Tones(c.shade((random() - 0.5) * 0.14)), r = d * 0.46
        wrapped(x, y, r, (px, py) => {
          const grad = g.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r)
          grad.addColorStop(0, tone.shade(0.08))
          grad.addColorStop(1, tone.shade(-0.08))
          g.fillStyle = grad
          g.beginPath()
          g.ellipse(px, py, r, r * 0.9, 0, 0, Math.PI * 2)
          g.fill()
        })
      }
    },
  },
  {
    id: 'flagstones', name: tr('Dalles de jardin', 'Garden flagstones'), size: 1, outdoor: true, palette: ['#b0aaa0', '#c8b898', '#8f8c86', '#d8d2c4', '#a08a78'],
    draw: (g, s, c, random) => {
      // Du gazon dans les joints, des dalles à pans coupés par-dessus.
      const grass = new Tones('#5f9e45')
      g.fillStyle = grass.shade(-0.06)
      g.fillRect(0, 0, s, s)
      blades(g, grass, random, 900, 5, 0.1)
      const n = 4, d = s / n
      for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
        const tone = new Tones(c.shade((random() - 0.5) * 0.1))
        const cx = (col + 0.5) * d, cy = (row + 0.5) * d, r = d / 2 - 4
        const cut = () => 5 + random() * 9
        const k = [cut(), cut(), cut(), cut()]
        g.fillStyle = tone.shade(-0.14)
        g.fillRect(cx - r + 2, cy - r + 3, r * 2, r * 2)
        g.fillStyle = tone.hex
        g.beginPath()
        g.moveTo(cx - r + k[0], cy - r)
        g.lineTo(cx + r - k[1], cy - r)
        g.lineTo(cx + r, cy - r + k[1])
        g.lineTo(cx + r, cy + r - k[2])
        g.lineTo(cx + r - k[2], cy + r)
        g.lineTo(cx - r + k[3], cy + r)
        g.lineTo(cx - r, cy + r - k[3])
        g.lineTo(cx - r, cy - r + k[0])
        g.closePath()
        g.fill()
      }
      grain(g, c, random, 1600, 0.05, 1.5, 0.3)
    },
  },
  {
    id: 'sand', name: tr('Sable', 'Sand'), size: 1, outdoor: true, palette: ['#e2c98f', '#f0e0b8', '#d8b078', '#c8c0b0', '#e8a878'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      // Les rides du râteau, qui ondulent le long de x.
      g.lineWidth = 2
      for (let y = 0; y < s; y += s / 16) {
        for (const [dy, tone, alpha] of [[0, c.shade(-0.07), 0.5], [2, c.shade(0.06), 0.6]] as const) {
          g.strokeStyle = tone
          g.globalAlpha = alpha
          g.beginPath()
          for (let x = 0; x <= s; x += 4) {
            const yy = y + dy + Math.sin((x / s) * Math.PI * 4) * 3
            if (x === 0) g.moveTo(x, yy)
            else g.lineTo(x, yy)
          }
          g.stroke()
        }
      }
      g.globalAlpha = 1
      grain(g, c, random, 3500, 0.06, 1.4, 0.5)
    },
  },
  {
    id: 'dirt', name: tr('Terre battue', 'Packed earth'), size: 1, outdoor: true, palette: ['#8a6a4a', '#6b4e36', '#a8825a', '#b86a48', '#5a4330'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      mottle(g, c, random, 30, 0.06, 40)
      pebbles(g, new Tones(c.shade(0.1, -0.1)), random, 40, 1.5, 3.5, 0.08)
      grain(g, c, random, 4500, 0.07, 1.6, 0.5)
    },
  },
  {
    id: 'decking', name: tr('Terrasse en bois', 'Timber decking'), size: 1, outdoor: true, palette: ['#a8825a', '#c49a6c', '#8a5a3a', '#6b4630', '#9a9a8e', '#d8c2a0'],
    draw: (g, s, c, random) => {
      const h = s / 6
      for (let row = 0; row < 6; row++) {
        const plank = new Tones(c.shade((random() - 0.5) * 0.08))
        g.fillStyle = plank.hex
        g.fillRect(0, row * h, s, h)
        woodGrain(g, plank, random, 0, row * h, s, h)
        // Les rainures antidérapantes, et le joint entre deux lames.
        g.fillStyle = plank.shade(-0.07)
        for (let k = 1; k < 5; k++) g.fillRect(0, row * h + (k * h) / 5, s, 1.5)
        g.fillStyle = c.shade(-0.32)
        g.fillRect(0, row * h, s, 3)
      }
    },
  },
  {
    id: 'snow', name: tr('Neige', 'Snow'), size: 1.2, outdoor: true, palette: ['#f2f6fa', '#e4ecf6', '#fdfdfd'],
    draw: (g, s, c, random) => {
      g.fillStyle = c.hex
      g.fillRect(0, 0, s, s)
      mottle(g, new Tones(c.mix('#9fb8d8', 0.5)), random, 26, 0.05, 44)
      g.fillStyle = '#ffffff'
      for (let i = 0; i < 260; i++) {
        g.globalAlpha = 0.5 + random() * 0.5
        g.fillRect(random() * s, random() * s, 1.6, 1.6)
      }
      g.globalAlpha = 1
    },
  },
]

const STYLES: Record<Slot, FinishStyle[]> = { wall: WALL_STYLES, floor: [...FLOOR_STYLES, ...OUTDOOR_FLOOR_STYLES] }

export function stylesOf(slot: Slot): FinishStyle[] {
  return STYLES[slot]
}

export function styleOf(slot: Slot, id: string): FinishStyle | undefined {
  return STYLES[slot].find((s) => s.id === id)
}

const HEX = /^#[0-9a-f]{6}$/

/** Revêtement lisible par ce client (motif connu, couleur #rrggbb), ou undefined : celui d'origine. */
export function normalizeFinish(slot: Slot, raw: unknown): Finish | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const { style, color } = raw as { style?: unknown; color?: unknown }
  const s = typeof style === 'string' ? styleOf(slot, style) : undefined
  if (!s) return undefined
  return { style: s.id, color: typeof color === 'string' && HEX.test(color.toLowerCase()) ? color.toLowerCase() : s.palette[0] }
}

/**
 * Dessine un revêtement dans un canvas (S × S). Même motif, même couleur : même image.
 * @returns le motif dessiné
 */
export function drawFinish(canvas: HTMLCanvasElement, slot: Slot, finish: Finish): FinishStyle | undefined {
  const style = styleOf(slot, finish.style)
  if (!style) return undefined
  canvas.width = canvas.height = S
  const g = canvas.getContext('2d')!
  g.clearRect(0, 0, S, S)
  g.save()
  style.draw(g, S, new Tones(finish.color), rng([...`${slot}:${style.id}`].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7)))
  g.restore()
  return style
}

/** Texture d'un revêtement, redessinée sur place quand il change (aucun matériau à recréer). */
export class FinishTexture {
  readonly canvas = document.createElement('canvas')
  readonly texture: THREE.CanvasTexture
  private key = ''

  constructor() {
    this.canvas.width = this.canvas.height = S
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping
    this.texture.anisotropy = 8
  }

  /** @returns vrai si le revêtement a changé */
  set(slot: Slot, finish: Finish): boolean {
    const key = `${slot}:${finish.style}:${finish.color}`
    if (key === this.key) return false
    const style = drawFinish(this.canvas, slot, finish)
    if (!style) return false
    this.key = key
    // Coordonnées de texture en mètres : une répétition par motif.
    this.texture.repeat.set(1 / style.size, 1 / style.size)
    this.texture.needsUpdate = true
    return true
  }

  dispose() {
    this.texture.dispose()
  }
}

// ---------------------------------------------------------------- vignettes des revêtements

/** Côté des vignettes des revêtements (px) : un pan de mur de 1 m de haut, ou 0,8 m de sol. */
export const FINISH_THUMB = 128
/** Canvas de travail des vignettes, créé à la première (le module se charge aussi hors navigateur, dans les tests). */
let offscreen: HTMLCanvasElement | null = null
const thumbs = new Map<string, HTMLCanvasElement>()

/**
 * Dessine la vignette d'un revêtement dans `canvas` (FINISH_THUMB × FINISH_THUMB) : un pan de mur de 1 m de
 * haut (bandeaux du kit en bas et en haut, motif entre les deux) ou 0,8 m de sol, à l'échelle.
 * Sans revêtement : l'allure d'origine du vaisseau.
 */
export function paintThumb(canvas: HTMLCanvasElement, slot: Slot, finish: Finish | undefined) {
  const key = finish ? `${slot}:${finish.style}:${finish.color}` : `${slot}:origin`
  let src = thumbs.get(key)
  if (!src) {
    src = document.createElement('canvas')
    src.width = src.height = FINISH_THUMB
    const g = src.getContext('2d')!
    offscreen ??= document.createElement('canvas')
    const style = finish && drawFinish(offscreen, slot, finish)
    if (style) {
      const pattern = g.createPattern(offscreen, 'repeat')!
      const k = (FINISH_THUMB / (slot === 'wall' ? 1 : 0.8)) * (style.size / offscreen.width)
      pattern.setTransform(new DOMMatrix().scale(k, k))
      g.fillStyle = pattern
    } else g.fillStyle = slot === 'wall' ? '#efe6d6' : '#d9d3de'
    g.fillRect(0, 0, FINISH_THUMB, FINISH_THUMB)
    if (slot === 'wall') {
      // Bandeaux du kit : plein en bas (0 à 0,2), chanfrein puis plein en haut (0,7 à 1).
      g.fillStyle = '#e4d8c2'
      g.fillRect(0, FINISH_THUMB * 0.8, FINISH_THUMB, FINISH_THUMB * 0.2)
      g.fillRect(0, 0, FINISH_THUMB, FINISH_THUMB * 0.2)
      g.fillStyle = '#d6c7ad'
      g.fillRect(0, FINISH_THUMB * 0.2, FINISH_THUMB, FINISH_THUMB * 0.1)
    } else if (!style) {
      g.strokeStyle = '#c3bccb'
      g.lineWidth = 3
      g.strokeRect(FINISH_THUMB * 0.1, FINISH_THUMB * 0.1, FINISH_THUMB * 0.8, FINISH_THUMB * 0.8)
    }
    if (thumbs.size > 200) thumbs.delete(thumbs.keys().next().value!)
    thumbs.set(key, src)
  }
  canvas.getContext('2d')!.drawImage(src, 0, 0)
}
