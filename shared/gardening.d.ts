export type GardenTool = 'hoe' | 'trowel' | 'can' | 'shears'

/** Une culture : niveau de plantoir demandé, durée de pousse (s), prix de la graine et d'une unité, rendement. */
export interface CropRules {
  tier: number
  grow: number
  seed: number
  price: number
  yield: number
}

/** Un outil : prix des niveaux 1 et 2 (le niveau 0 est offert), durée du geste à chaque niveau (s). */
export interface ToolRules {
  prices: number[]
  time: number[]
}

/** Chiffres du jardinage (section `gardening` de src/economy/economy.json). */
export interface GardenRules {
  /** Tuiles travaillées au plus. */
  maxPlots: number
  /** Place de la réserve : avec le cabanon seul, avec des caisses de récolte. */
  stock: { base: number; crate: number }
  /** Sachets ou sacs d'une même sorte, au plus. */
  bagMax: number
  /** Crédits que Marcel paie par jour. */
  saleDaily: number
  /** Ce que vaut une unité selon sa qualité (0 à 2). */
  grades: number[]
  /** Les cultures qui poussent au moins ce temps-là (s) ont des mauvaises herbes. */
  weedsFrom: number
  /** Temps passé sans pousser qui coûte une qualité, puis deux : au moins `floor` (s), ou `factor` fois la durée de pousse. */
  neglect: { floor: [number, number]; factor: [number, number] }
  /** Arrosoir : durée d'un arrosage par niveau (s). Sécateur : unités en plus par niveau. */
  tools: { hoe: ToolRules; trowel: ToolRules; can: ToolRules & { wet: number[] }; shears: ToolRules & { bonus: number[] } }
  soils: Record<string, { price: number; grade: number }>
  fertilizers: Record<string, { price: number; speed: number }>
  crops: Record<string, CropRules>
}

/** Une tuile travaillée (cf. gardening.js). */
export interface Plot {
  s: string
  c?: string
  p?: number
  g: number
  t: number
  w: number
  d: number
  f?: string
  x: number
  k?: number
}

export interface GardenBag {
  seeds: Record<string, number>
  soils: Record<string, number>
  ferts: Record<string, number>
}

/** Jardin d'un CMDR, tel que le site le garde. */
export interface Garden {
  plots: Record<string, Plot>
  bag: GardenBag
  tools: Record<GardenTool, number>
  stock: Record<string, number>
}

export type PlotNeed = 'sow' | 'water' | 'weed' | 'harvest'

export interface PlotStatus {
  /** -1 : rien de semé ; 0 semis, 1 jeune plant, 2 plant, 3 mûre. */
  stage: -1 | 0 | 1 | 2 | 3
  progress: number
  need: PlotNeed | null
  wet: boolean
  /** Date du prochain changement (secondes Unix), 0 si rien ne change sans le joueur. */
  next: number
}

export declare const GARDEN_TOOLS: GardenTool[]
export declare const TOOL_TIERS: number
export declare const PLOT_KEY: RegExp
export declare const plotKey: (x: number, z: number) => string
export declare function emptyGarden(): Garden
export declare const growGoal: (crop: CropRules) => number
export declare function growRate(rules: GardenRules, plot: Pick<Plot, 'f'>): number
export declare const hasWeeds: (rules: GardenRules, crop: CropRules) => boolean
export declare const weedy: (plot: Plot) => boolean
export declare function advancePlot(rules: GardenRules, plot: Plot, now: number): Plot
export declare function plotStatus(rules: GardenRules, plot: Plot, now: number): PlotStatus
export declare function neglect(rules: GardenRules, crop: CropRules, plot: Plot): 0 | 1 | 2
export declare function harvestOf(rules: GardenRules, plot: Plot, tools: Record<GardenTool, number>): { grade: number; count: number }
export declare const unitPrice: (rules: GardenRules, crop: string, grade: number) => number
export declare const stockKey: (crop: string, grade: number) => string
export declare const stockTotal: (stock: Record<string, number>) => number
export declare const stockRoom: (rules: GardenRules, crate: boolean) => number
