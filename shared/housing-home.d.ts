import type { Partition } from './cabin-partitions.js'
import type { ShipMap } from './ship-map.js'

/** Revêtement : un motif et sa couleur (#rrggbb). */
export interface HomeFinish {
  style: string
  color: string
}

/** Mur de la parcelle, au format 2 : une cloison (arête, type), et le papier peint de ses faces (index dans `papers`). */
export interface HomeWall extends Partition {
  a?: number
  b?: number
}

/** Aménagement d'une parcelle, format 2. */
export interface HomeLayout {
  v: 2
  /** Quartiers ouverts : on y entre sans invitation. */
  open?: true
  walls?: HomeWall[]
  papers?: HomeFinish[]
  floor?: { palette: HomeFinish[]; cells: string }
}

/** Mur d'un plan : ses faces portent leur revêtement. */
export interface PlanWall extends Partition {
  a?: HomeFinish
  b?: HomeFinish
}

/** Plan d'une parcelle, commode à modifier : murs, et revêtement de chaque case (null : dalle nue). */
export interface HomePlan {
  /** Quartiers ouverts : on y entre sans invitation. */
  open?: boolean
  walls: PlanWall[]
  floor: (HomeFinish | null)[]
}

/** Pourquoi un mur ne va pas sur une arête (cf. wallRefusal). */
export type WallRefusal = 'outside' | 'landing' | 'void'

export declare const HOME_FORMAT: 2
export declare const MAX_HOME_WALLS: number
export declare const SOLID_KINDS: string[]
export declare const HOME_DOOR_KINDS: string[]
export declare const HOME_WALL_KINDS: string[]
export declare function isHomeDoor(w: Partition): boolean
export declare function isLow(w: Partition): boolean
export declare function sanitizeWalls(raw: unknown): HomeWall[]
export declare function sanitizeHome(raw: unknown): HomeLayout | null
export declare function wallRefusal(map: ShipMap, stage: number, w: Partition): WallRefusal | null
export declare function applyWalls<W extends Partition>(map: ShipMap, walls: W[] | undefined, stage: number): W[]
export declare function clearWalls(map: ShipMap, placed: Partition[]): void
export declare const MAX_FINISHES: number
export declare const GRID: number
export declare const CELLS: number
export declare function sanitizeFinish(raw: unknown): HomeFinish | null
export declare function cellIndex(x: number, z: number): number
export declare function cellAt(index: number): { x: number; z: number }
export declare function encodeCells(letters: string): string
export declare function decodeCells(code: unknown): string
export declare function unpackHome(raw: unknown): HomePlan
export declare function packHome(plan: HomePlan): HomeLayout
export declare function finishCounts(plan: HomePlan): { floor: number; paper: number }
