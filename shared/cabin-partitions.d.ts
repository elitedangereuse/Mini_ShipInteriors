import type { ShipMap } from './ship-map.js'

/** Cloison : l'arête entre la tuile (x, z) et sa voisine à l'est ('v') ou au sud ('h'). */
export interface Partition {
  x: number
  z: number
  e: 'v' | 'h'
  /** Modèle : mur à hublot (« window ») ou porte (cf. DOOR_KINDS) ; absent pour un mur plein. */
  k?: string
}

/** Lettre des quartiers du commandant sur le plan du pont supérieur. */
export declare const CABIN_ROOM: string
/** Pièce où l'on peut poser une cloison : les quartiers, ou une pièce d'extension. */
export declare function partitionRoom(room: string): boolean
/** Cloisons au plus, pour toute la cabine. */
export declare const MAX_PARTITIONS: number
/** Modèles de portes. */
export declare const DOOR_KINDS: string[]
/** Pans de mur (plein, à hublot). */
export declare const WALL_KINDS: string[]
/** Tuile, direction de sa voisine (cf. DIRS) et voisine. */
export declare function partitionEdge(p: Partition): { x: number; z: number; dir: number; nx: number; nz: number }
export declare function partitionKey(p: Partition): string
/** Cloisons bien formées, ou null. */
export declare function sanitizePartitions(raw: unknown): Partition[] | null
export declare function isDoor(p: Partition): boolean
/** Pose les cloisons valables sur le plan ; renvoie celles qui l'ont été. */
export declare function applyPartitions(map: ShipMap, partitions: Partition[] | undefined, allowed?: (room: string) => boolean): Partition[]
/** Retire du plan des cloisons posées par applyPartitions. */
export declare function clearPartitions(map: ShipMap, placed: Partition[]): void
