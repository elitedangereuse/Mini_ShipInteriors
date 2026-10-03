/** Plans des ponts, par identifiant de pont (cf. ShipMap). */
export declare const SHIP_LAYOUTS: Record<'-1' | '0' | '1' | '2', string[]>

/** Le pont supérieur du temps des anciens quartiers, figé pour leur migration. */
export declare const LEGACY_UPPER_LAYOUT: string[]

/** Pièces en travaux de chaque pont (lettres) : leurs portes sont verrouillées. */
export declare const CLOSED_ROOMS: Record<'-1' | '0' | '1', string>

/** Le Zorb, la boîte de nuit de la cale (lettre de sa pièce) : réservée aux aliens. */
export declare const CLUB_ROOM: 'n'
/** Chez Jacques, le bar de la cale : réservé aux habitués (cf. vents.js). */
export declare const BAR_ROOM: 'b'
/** Apparence d'alien (identifiant du Holo-Me, ex. « alien.male.c.blue ») ? */
export declare function isAlienLook(skin: unknown): boolean

/** Le planétarium de Bugenhagen, au pont supérieur (lettre de sa pièce). */
export declare const PLANETARIUM_ROOM: 'p'

/** Options du plan d'un pont (cf. ShipMap). */
export declare function shipMapOptions(level: number | string): import('./ship-map.js').ShipMapOptions
/** Options du plan du pont supérieur des anciens quartiers : les portes de leurs extensions, verrouillées. */
export declare function legacyUpperMapOptions(): import('./ship-map.js').ShipMapOptions
/** La porte du poste de sécurité du lobby (cale), toujours verrouillée. */
export declare const SECURITY_DOOR: { x: number; z: number; dir: number; locked: true }

/** Tables de jeux de plateau (pont principal), par jeu. */
export declare const BOARD_TABLES: Record<'draughts' | 'guardian-connect' | 'imperial-chess', { level: number; x: number; z: number }>

/** Terrains de la zone sportive (pont supérieur), par jeu : pièce, marque de tir, mur visé (x de sa face) et milieu de la cible le long de ce mur. */
export declare const SPORT_COURTS: Record<'gym-basket' | 'gym-foot', { level: number; room: string; spot: { x: number; z: number }; wall: number; center: number }>
