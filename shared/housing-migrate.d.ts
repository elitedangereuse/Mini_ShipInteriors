import type { HomeFinish, HomePlan } from './housing-home.js'
import type { Partition } from './cabin-partitions.js'

/** Anciens quartiers (format 1), déjà lus. */
export interface LegacyCabin {
  items: { m: string; x: number; z: number; r: 0 | 1 | 2 | 3; v?: string; y?: number; s?: number }[]
  wall?: HomeFinish
  floor?: HomeFinish
  wings?: Partial<Record<string, { shape: string; wall?: HomeFinish; floor?: HomeFinish }>>
  partitions?: Partition[]
}

export declare function stageFromWings(count: number): number
export declare function migrationOffset(wings: boolean): { dx: number; dz: number }
export declare function migrateCabin(layout: LegacyCabin): HomePlan
