/** Coupes : la tête d'un autre Mini Character (« fb » : femme b…), ou une coupe faite main. */
export declare const HAIR_STYLES: string[]
export declare const HAIR_COLORS: string[]
/** Expressions portées en permanence (les emotes en jouent d'autres, le temps d'un geste). */
export declare const FACES: string[]
export declare const SUIT_PAINTS: string[]
export declare const SUIT_TRIMS: string[]

/** Style du Holo-Me ; '' : comme le modèle. */
export interface LookStyle {
  hair: string
  hairColor: string
  face: string
  paint: string
  trim: string
}

/** Style par défaut : tout comme le modèle. */
export declare const NO_STYLE: Readonly<LookStyle>
/** Un segment d'apparence est-il un style ? */
export declare function isStyleSegment(s: unknown): s is string
/** Lit un segment de style ; null s'il est mal formé ou contient une valeur inconnue. */
export declare function parseStyle(segment: string): LookStyle | null
/** Segment d'un style, ou '' s'il n'y a rien à écrire. Les valeurs inconnues sont ignorées. */
export declare function styleSegment(style: Partial<LookStyle> | null | undefined): string
/** Longueur maximale d'une apparence. */
export declare const MAX_LOOK: number
/** Apparence acceptable par le relais : une base, puis au plus un style dont chaque champ est connu. */
export declare function validLook(s: unknown): boolean
