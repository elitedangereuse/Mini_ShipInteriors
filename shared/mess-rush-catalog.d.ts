/** Un texte affiché, dans les deux langues du jeu. */
export interface Text { fr: string; en: string }
export type ProcessId = 'couper' | 'cuire' | 'saisir'
export type StationKind = 'crate' | 'board' | 'pot' | 'pan' | 'sink' | 'plates' | 'return' | 'counter' | 'pass' | 'trash'
export type CatalogStatus = 'canonique' | 'adaptation' | 'création'
export type Difficulty = 'rapide' | 'intermediaire' | 'complexe'

export interface Source { title: string; url: string }
export declare const SOURCES: Record<string, Source>

export interface Process { station: StationKind; active: boolean; duration: number; result: string; verb: Text }
export declare const PROCESSES: Record<ProcessId, Process>

export interface Ingredient {
  name: Text
  short: Text
  /** Genre et nombre du nom court, pour accorder son état (« Crevettes rincées »). */
  gender: 'ms' | 'fs' | 'mp' | 'fp'
  /** Nom canonique d'Elite Dangerous : métadonnée, jamais affichée (null pour une création). */
  canonical: string | null
  category: string | null
  rare: boolean
  origin?: { system: string; station: string }
  prep: ProcessId[]
  cook: ProcessId[]
  /** Modèle du Food Kit de Kenney. */
  model: string
  color: string
  status: CatalogStatus
  sources: string[]
}
export declare const INGREDIENTS: Record<string, Ingredient>

export declare const DIFFICULTIES: Record<Difficulty, { points: number; time: number; name: Text }>

export interface Recipe {
  name: Text
  difficulty: Difficulty
  prototype?: boolean
  points?: number
  time?: number
  /** La couleur du plat : son bon, son client dans la file, les assiettes qui le deviennent. */
  color: string
  dish: { container: 'plate'; contents: [string, string][] }
  steps: [StationKind, string?][]
  success: Text
  failure: Text
  status: CatalogStatus
  sources: string[]
}
export declare const RECIPES: Record<string, Recipe>
export declare const PROTOTYPE_RECIPES: string[]
export declare const SERVICE_RECIPES: string[]
