import type { Door, ShipMap } from './ship-map.js'

export type WingId = 'left' | 'middle' | 'right'
export type PatternId = 'carre' | 'octogone' | 'rectangle' | 'galerie' | 'l' | 't' | 'u' | 'losange' | 'deux-pieces' | 'suite'

export interface WingSlot {
  id: WingId
  /** Coin nord-ouest du carré de WING_SIZE tuiles. */
  x0: number
  z0: number
  /** Porte depuis les quartiers : tuile des quartiers et bord (cf. ShipMap.addDoor). */
  door: Door
  /** Tuile d'entrée derrière la porte, direction du fond, direction latérale. */
  entry: { x: number; z: number }
  depth: { dx: number; dz: number }
  lateral: { dx: number; dz: number }
}

export interface WingPlan {
  tiles: { x: number; z: number; room: string }[]
  doors: Door[]
}

/** Côté d'un espace, en tuiles. */
export declare const WING_SIZE: number
/** Espaces accolés aux quartiers : gauche (ouest), milieu (sud), droite (est). */
export declare const WING_SLOTS: WingSlot[]
/** Lettres des pièces de chaque espace sur le plan du pont. */
export declare const WING_ROOMS: Record<WingId, string>
/** Formes de plan, vues depuis la porte (cf. shared/cabin-wings.js). */
export declare const WING_PATTERNS: Record<PatternId, { rows: string[]; doors?: { px: number; pz: number; dir: number }[] }>
export declare const DEFAULT_PATTERN: PatternId
export declare function slotOf(id: string): WingSlot | undefined
/** Tuiles et portes intérieures d'une pièce de cette forme dans cet espace. */
export declare function wingPlan(slot: WingSlot, pattern: string): WingPlan
/** Pose les pièces des extensions sur le plan (les autres espaces se vident, leur porte se verrouille). */
export declare function applyWings(map: ShipMap, wings: Partial<Record<WingId, { shape: string }>> | undefined): Partial<Record<WingId, WingPlan>>
/** Portes des trois espaces, à ajouter au plan du pont supérieur. */
export declare function wingDoors(): Door[]
