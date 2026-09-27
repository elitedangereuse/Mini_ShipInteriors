/** Plans des ponts, par identifiant de pont (cf. ShipMap). */
export declare const SHIP_LAYOUTS: Record<'-1' | '0' | '1', string[]>

/** Tables de jeux de plateau (pont principal), par jeu. */
export declare const BOARD_TABLES: Record<'draughts' | 'guardian-connect' | 'imperial-chess', { level: number; x: number; z: number }>
