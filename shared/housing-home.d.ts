import type { Partition } from './cabin-partitions.js'
import type { ShipMap } from './ship-map.js'

/** Mur de la parcelle : la même forme qu'une cloison (arête, type). */
export type HomeWall = Partition

/** Aménagement d'une parcelle, format 2. */
export interface HomeLayout {
  v: 2
  walls?: HomeWall[]
}

/** Pourquoi un mur ne va pas sur une arête (cf. wallRefusal). */
export type WallRefusal = 'outside' | 'landing' | 'void'

export declare const HOME_FORMAT: 2
export declare const MAX_HOME_WALLS: number
export declare const SOLID_KINDS: string[]
export declare const HOME_DOOR_KINDS: string[]
export declare const HOME_WALL_KINDS: string[]
export declare function isHomeDoor(w: HomeWall): boolean
export declare function isLow(w: HomeWall): boolean
export declare function sanitizeWalls(raw: unknown): HomeWall[]
export declare function sanitizeHome(raw: unknown): HomeLayout | null
export declare function wallRefusal(map: ShipMap, stage: number, w: HomeWall): WallRefusal | null
export declare function applyWalls(map: ShipMap, walls: HomeWall[] | undefined, stage: number): HomeWall[]
export declare function clearWalls(map: ShipMap, placed: HomeWall[]): void
