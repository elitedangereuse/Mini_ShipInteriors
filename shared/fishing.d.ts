/** Pont de l'étang (le pont supérieur). */
export declare const FISHING_LEVEL: number
/** L'étang : centre, taille hors tout (margelle comprise), rayon des coins, margelle, hauteur de l'eau. */
export declare const FISHING_POND: { x: number; z: number; w: number; d: number; corner: number; rim: number; water: number }
/** Le ponton, sur la rive nord : là où l'on se tient pour pêcher, face au sud. */
export declare const FISHING_DOCK: { x: number; z: number }
/** Là où l'on nourrit les carpes, sur la rive ouest. */
export declare const FISHING_FEED: { x: number; z: number }

/** Le point est-il dans l'eau, à `margin` au moins de la margelle ? */
export declare function inPond(x: number, z: number, margin?: number): boolean
/** Le point de l'eau le plus proche où le bouchon peut se poser. */
export declare function castPoint(x: number, z: number): { x: number; z: number }

export type FishRarity = 'common' | 'rare' | 'epic' | 'legendary'
export type FishModel =
  // « Animated Fish Pack »
  | 'fish1' | 'fish2' | 'fish3' | 'dolphin' | 'manta' | 'shark' | 'whale'
  // « Cute Fish Pack »
  | 'angler' | 'catfish' | 'betta' | 'lionfish-black' | 'blobfish' | 'tang' | 'butterfly' | 'cowfish' | 'flatfish' | 'flowerhorn'
  | 'goblin' | 'goldfish' | 'humphead' | 'koi' | 'lionfish' | 'mandarin' | 'idol' | 'parrot' | 'piranha' | 'puffer'
  | 'gramma' | 'sunfish' | 'swordfish' | 'tetra' | 'tuna'

export declare const FISH_RARITIES: FishRarity[]
/** Part des touches, feintes (de… à…), temps laissé pour ferrer (secondes). */
export declare const FISH_RARITY: Record<FishRarity, { weight: number; feints: [number, number]; window: number }>

export interface FishSpecies {
  id: string
  model: FishModel
  rarity: FishRarity
  /** Taille des prises, de la plus petite à la plus grande (cm). */
  size: [number, number]
  /** Couleur des parties du modèle (nom de ses matériaux) ; les autres gardent celle du pack. */
  colors: Record<string, string>
  /** Part de sa couleur qu'une partie émet (les poissons qui luisent). */
  glow?: Record<string, number>
}

export declare const FISH: FishSpecies[]
export declare function fishById(id: string): FishSpecies | undefined
export declare function pickFish(random?: () => number): FishSpecies
export declare function fishSize(fish: FishSpecies, random?: () => number): number

/** Durée d'une feinte (secondes). */
export declare const FEINT_TIME: number
/** Déroulé d'une touche : instants des feintes, instant où le bouchon plonge, temps pour ferrer. */
export declare function bitePlan(fish: FishSpecies, random?: () => number): { feints: number[]; bite: number; window: number }
