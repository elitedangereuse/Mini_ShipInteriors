import * as THREE from 'three'
import { box, drawnTexture, glow, keepShared, lit, part, type Builder } from './kit'

/*
 * Signalétique du bord : le plan du vaisseau, en caisson lumineux, accroché aux endroits où l'on
 * se demande où aller (face aux ascenseurs, aux carrefours). On le consulte pour ouvrir le plan
 * détaillé (cf. main.ts). Sa feuille est dessinée au canvas par src/ship-plan/poster.ts, que le
 * jeu fournit ici (cf. setShipMapArt) : le mobilier ne connaît pas les ponts, et n'a pas à les
 * embarquer dans son morceau du build (cf. vite.config.ts).
 */

export interface ShipMapArt {
  /** Taille du dessin, en pixels. */
  w: number
  h: number
  /** Dessine la feuille ; `here` : où elle est accrochée (pont, position du jeu), pour son repère « Vous êtes ici ». */
  draw(g: CanvasRenderingContext2D, here?: { level: number; x: number; z: number }): void
}

let art: ShipMapArt | null = null
/** Le dessin de la feuille : à fournir avant de bâtir les ponts. Sans lui, la feuille reste blanche. */
export function setShipMapArt(a: ShipMapArt) {
  art = a
}

/** Largeur de la feuille, et hauteur de son milieu au-dessus du sol. */
const W = 0.92, Y = 0.62

const sheets = new Map<string, THREE.MeshBasicMaterial>()

/** La feuille d'une affiche (une texture par emplacement : son repère « Vous êtes ici » lui est propre). */
function sheet(label: string): THREE.MeshBasicMaterial {
  let m = sheets.get(label)
  if (!m) {
    const [level, x, z] = label.split(':').map(Number)
    const here = Number.isFinite(z) ? { level, x, z } : undefined
    const map = keepShared(drawnTexture(art?.w ?? 16, art?.h ?? 10, (g) => {
      g.fillStyle = '#e9eef0'
      g.fillRect(0, 0, g.canvas.width, g.canvas.height)
      art?.draw(g, here)
    }))
    map.anisotropy = 8
    // Rétroéclairée : elle se lit aussi dans la pénombre de la cale. Ses couleurs sont celles du
    // dessin, sans passer par le rendu des tons du jeu, qui délaverait ses aplats clairs.
    sheets.set(label, (m = keepShared(new THREE.MeshBasicMaterial({ map, color: '#ececec', toneMapped: false }))))
  }
  return m
}

/**
 * Plan du vaisseau (0,98 de large, contre le mur, face à +z) : un caisson sombre, la feuille
 * rétroéclairée, un filet orange dessous. `label` : « pont:x:z », l'endroit où il est accroché
 * (position du jeu), pour son repère « Vous êtes ici ».
 */
const shipMap: Builder = ({ label = '' }) => {
  const g = new THREE.Group()
  const H = W * (art ? art.h / art.w : 0.625)
  const frame = lit('#1c2029', 'metal')
  g.add(box(W + 0.06, H + 0.06, 0.03, frame, 0, Y, 0.015, 0.01))
  g.add(part(new THREE.PlaneGeometry(W, H), sheet(label), 0, Y, 0.0312))
  g.add(box(W * 0.5, 0.014, 0.01, glow('#ff8a1c'), 0, Y - H / 2 - 0.048, 0.012))
  return { solid: g }
}

export const WAYFINDING = {
  'ship-map': shipMap,
} satisfies Record<string, Builder>
