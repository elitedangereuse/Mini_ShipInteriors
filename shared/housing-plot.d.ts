import type { ShipMap } from './ship-map.js'

export declare const HOUSING_LEVEL: 2
export declare const PLOT_ROOM: string
export declare const LANDING_ROOM: string
export declare const PLOT_SIZES: readonly number[]
export declare const PLOT_ORIGIN: { readonly x: number; readonly z: number }
export declare const PLOT_DOOR: { readonly x: number; readonly z: number; readonly dir: number }

/** Arête d'une tuile : la tuile et son bord (0 nord, 1 est, 2 sud, 3 ouest). */
export interface PlotEdge {
  x: number
  z: number
  dir: number
}

export interface PlotRect {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

export interface PlotPlan {
  stage: number
  rect: PlotRect
  tiles: { x: number; z: number }[]
  /** Arêtes du pourtour qui donnent sur le vide : le champ de force. */
  field: PlotEdge[]
}

export declare function plotStage(stage: unknown): number
export declare function plotSize(stage: number): number
export declare function plotRect(stage: number): PlotRect
export declare function inPlot(stage: number, x: number, z: number): boolean
export declare function applyPlot(map: ShipMap, stage: number): PlotPlan
export declare function straightRuns(edges: PlotEdge[]): { dir: number; edges: PlotEdge[] }[]
