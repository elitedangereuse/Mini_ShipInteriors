import * as THREE from 'three'
import { box, drawnTexture, glow, keepShared, lit, part, type Builder } from './kit'

/*
 * Signalétique du bord : le plan du vaisseau, sur un écran holographique accroché aux endroits où
 * l'on se demande où aller (près des téléporteurs, aux carrefours), et le totem de chaque téléporteur. On le consulte pour ouvrir le
 * plan détaillé (cf. main.ts). Son image est dessinée au canvas par src/ship-plan/poster.ts, que
 * le jeu fournit ici (cf. setShipMapArt) : le mobilier ne connaît pas les ponts, et n'a pas à les
 * embarquer dans son morceau du build (cf. vite.config.ts).
 */

export interface ShipMapArt {
  /** Taille du dessin, en pixels. */
  w: number
  h: number
  /** Dessine l'écran ; `here` : où elle est accrochée (pont, position du jeu), pour son repère « Vous êtes ici ». */
  draw(g: CanvasRenderingContext2D, here?: { level: number; x: number; z: number }): void
}

let art: ShipMapArt | null = null
/** Le dessin de l'écran : à fournir avant de bâtir les ponts. Sans lui, l'écran reste noir. */
export function setShipMapArt(a: ShipMapArt) {
  art = a
}

/** Largeur de l'écran, et hauteur de son milieu au-dessus du sol. */
const W = 0.92, Y = 0.62

const sheets = new Map<string, THREE.MeshBasicMaterial>()

/** L'écran d'une affiche (une texture par emplacement : sa balise « Vous êtes ici » lui est propre). */
function sheet(label: string): THREE.MeshBasicMaterial {
  let m = sheets.get(label)
  if (!m) {
    const [level, x, z] = label.split(':').map(Number)
    const here = Number.isFinite(z) ? { level, x, z } : undefined
    const map = keepShared(drawnTexture(art?.w ?? 16, art?.h ?? 10, (g) => {
      g.fillStyle = '#060b17'
      g.fillRect(0, 0, g.canvas.width, g.canvas.height)
      art?.draw(g, here)
    }))
    map.anisotropy = 8
    // Un écran : il luit de lui-même, jusque dans la pénombre de la cale. Ses couleurs sont celles
    // du dessin, sans passer par le rendu des tons du jeu, qui délaverait ses traits de lumière.
    sheets.set(label, (m = keepShared(new THREE.MeshBasicMaterial({ map, toneMapped: false }))))
  }
  return m
}

/** La ligne de balayage de l'écran : un trait de lumière froide, qui s'ajoute à l'image. */
const scanMaterial = keepShared(new THREE.MeshBasicMaterial({ color: '#8fdcff', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
/** Durée d'un balayage, de haut en bas, en secondes. */
const SCAN = 5

/**
 * Plan du vaisseau (0,98 de large, contre le mur, face à +z) : un cadre sombre aux arêtes orange,
 * l'écran holographique, qu'une ligne de lumière balaie de haut en bas. `label` : « pont:x:z »,
 * l'endroit où il est accroché (position du jeu), pour sa balise « Vous êtes ici ».
 */
const shipMap: Builder = ({ label = '', random }) => {
  const g = new THREE.Group()
  const H = W * (art ? art.h / art.w : 0.625)
  const frame = lit('#12151c', 'metal')
  g.add(box(W + 0.06, H + 0.06, 0.03, frame, 0, Y, 0.015, 0.01))
  g.add(part(new THREE.PlaneGeometry(W, H), sheet(label), 0, Y, 0.0312))
  // Un filet orange sous l'écran, et un autre au-dessus : on le repère de loin.
  for (const s of [-1, 1]) g.add(box(W * 0.5, 0.012, 0.01, glow('#ff8a1c'), 0, Y + s * (H / 2 + 0.046), 0.012))
  // La partie mobile : le pont la pose à la place du meuble, la ligne y court de haut en bas.
  const live = new THREE.Group()
  const scan = part(new THREE.PlaneGeometry(W, 0.014), scanMaterial, 0, Y, 0.0325)
  live.add(scan)
  // Chaque écran a son propre déphasage : ils ne balaient pas tous ensemble.
  const phase = random() * SCAN
  return {
    solid: g,
    live,
    update(t) {
      const k = ((t + phase) % SCAN) / SCAN
      scan.position.y = Y + H / 2 - k * H
    },
  }
}

// ---------------------------------------------------------------- le totem du téléporteur

/**
 * Ce que le jeu fournit pour dessiner les totems (cf. src/deck-identity.ts) : la taille de leur
 * écran, leur dessin et la couleur de leur pont, d'après leur `label`.
 */
export interface TotemArt {
  w: number
  h: number
  draw(g: CanvasRenderingContext2D, label: string): void
  color(label: string): string
}

let totemArt: TotemArt | null = null
/** Le dessin des totems : à fournir avant de bâtir les ponts. */
export function setTotemArt(a: TotemArt) {
  totemArt = a
}

/** Largeur de l'écran d'un totem, et hauteur de son milieu au-dessus du sol. */
const TW = 0.5, TY = 0.66

/**
 * Totem du téléporteur (face à +z) : sur un socle, un écran haut et étroit, dans un cadre sombre
 * liseré de la couleur du pont. Il dit le pont (étage, nom, devise), « Vous êtes ici », ses lieux
 * et leur direction, et les autres ponts. `label` : « pont:x:z:rot », sa place, pour ses flèches.
 */
const deckTotem: Builder = ({ label = '' }) => {
  const g = new THREE.Group()
  const H = TW * (totemArt ? totemArt.h / totemArt.w : 1.7)
  const color = totemArt?.color(label) ?? '#59d8ff'
  const frame = lit('#12151c', 'metal')
  g.add(box(0.4, 0.05, 0.22, frame, 0, 0.025, 0, 0.01))
  g.add(box(0.06, TY - H / 2, 0.06, frame, 0, (TY - H / 2) / 2, -0.02))
  g.add(box(TW + 0.05, H + 0.05, 0.05, frame, 0, TY, -0.02, 0.01))
  // Le liseré du pont, tout autour de l'écran, et une lame au dos.
  for (const s of [-1, 1]) g.add(box(0.012, H + 0.03, 0.012, glow(color), s * (TW / 2 + 0.032), TY, 0.008))
  g.add(box(TW * 0.7, 0.014, 0.012, glow(color), 0, TY + H / 2 + 0.034, 0.008))
  g.add(box(0.03, H * 0.8, 0.012, glow(color), 0, TY, -0.05))
  const map = keepShared(drawnTexture(totemArt?.w ?? 16, totemArt?.h ?? 27, (c) => {
    c.fillStyle = '#070b14'
    c.fillRect(0, 0, c.canvas.width, c.canvas.height)
    totemArt?.draw(c, label)
  }))
  map.anisotropy = 8
  g.add(part(new THREE.PlaneGeometry(TW, H), keepShared(new THREE.MeshBasicMaterial({ map, toneMapped: false })), 0, TY, 0.0062))
  return { solid: g }
}

// ---------------------------------------------------------------- les lignes au sol

/** Matériau des lignes au sol d'une couleur (partagé) : de la lumière, à peine translucide. */
const lineMaterials = new Map<string, THREE.MeshBasicMaterial>()
const lineMaterial = (color: string) => {
  let m = lineMaterials.get(color)
  if (!m) lineMaterials.set(color, (m = keepShared(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, toneMapped: false }))))
  return m
}

/**
 * Ligne de guidage peinte au sol, de la couleur du pont : un filet lumineux et, de loin en loin,
 * un chevron qui montre le sens. `label` : « couleur|x,z x,z … », ses points par rapport au
 * meuble (dans le repère du pont, quel que soit `rot`), du téléporteur vers la destination.
 */
const guideLine: Builder = ({ label = '' }) => {
  const [color = '#59d8ff', path = ''] = label.split('|')
  const points = path.trim().split(/\s+/).map((p) => p.split(',').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite))
  const g = new THREE.Group()
  const m = lineMaterial(color)
  const Y = 0.009
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i]
    const len = Math.hypot(bx - ax, bz - az)
    if (len < 1e-3) continue
    const angle = Math.atan2(bx - ax, bz - az)
    const strip = part(new THREE.PlaneGeometry(0.06, len + 0.06), m, (ax + bx) / 2, Y, (az + bz) / 2)
    strip.rotation.set(-Math.PI / 2, 0, angle)
    g.add(strip)
    // Un chevron tous les 0,7, pointe vers la destination.
    for (let d = 0.45; d < len - 0.15; d += 0.7) {
      const k = d / len
      const chevron = new THREE.Group()
      chevron.position.set(ax + (bx - ax) * k, Y + 0.001, az + (bz - az) * k)
      chevron.rotation.y = angle
      for (const side of [-1, 1]) {
        const arm = part(new THREE.PlaneGeometry(0.045, 0.16), m, side * 0.05, 0, -0.03)
        arm.rotation.set(-Math.PI / 2, 0, -side * 0.75)
        chevron.add(arm)
      }
      g.add(chevron)
    }
  }
  return { solid: g }
}

export const WAYFINDING = {
  'ship-map': shipMap,
  'deck-totem': deckTotem,
  'guide-line': guideLine,
} satisfies Record<string, Builder>
