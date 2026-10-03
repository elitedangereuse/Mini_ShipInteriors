/** « Pont » des conduits de ventilation : hors des ponts desservis par l'ascenseur. */
export declare const VENT_LEVEL: -3
/** Plan des conduits (une lettre par tuile). */
export declare const VENT_LAYOUT: string[]
/** Où l'on tombe, au sortir de la cuvette. */
export declare const VENT_DROP: { x: number; z: number }
/** La grille qui donne sur le bar. */
export declare const VENT_GRATE: { x: number; z: number }
export declare const VENT_GRATE_REACH: number
/** Où l'on atterrit Chez Jacques (pont de la cale). */
export declare const BAR_DROP: { level: -1; x: number; z: number }
/** Pièce des toilettes du pont supérieur : on n'entre dans les conduits que de là. */
export declare const TOILET_ROOM: { level: 1; room: 'd' }
/** Devant la grille (à portée) ? */
export declare function atVentGrate(p: { x: number; z: number }): boolean
