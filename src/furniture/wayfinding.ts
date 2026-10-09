import * as THREE from 'three'
import { box, drawnTexture, glow, keepShared, lit, part, type Builder } from './kit'

/*
 * Signalétique du bord : le plan du vaisseau, sur un écran holographique accroché aux endroits où
 * l'on se demande où aller (face aux ascenseurs, aux carrefours). On le consulte pour ouvrir le
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

export const WAYFINDING = {
  'ship-map': shipMap,
} satisfies Record<string, Builder>
