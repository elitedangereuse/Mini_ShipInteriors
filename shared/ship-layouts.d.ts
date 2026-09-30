/** Plans des ponts, par identifiant de pont (cf. ShipMap). */
export declare const SHIP_LAYOUTS: Record<'-1' | '0' | '1', string[]>

/** Pièces en travaux de chaque pont (lettres) : leurs portes sont verrouillées. */
export declare const CLOSED_ROOMS: Record<'-1' | '0' | '1', string>

/** Options du plan d'un pont (cf. ShipMap). */
export declare function shipMapOptions(level: number | string): import('./ship-map.js').ShipMapOptions
/** La porte du poste de sécurité du lobby (cale), toujours verrouillée. */
export declare const SECURITY_DOOR: { x: number; z: number; dir: number; locked: true }

/** Tables de jeux de plateau (pont principal), par jeu. */
export declare const BOARD_TABLES: Record<'draughts' | 'guardian-connect' | 'imperial-chess', { level: number; x: number; z: number }>
