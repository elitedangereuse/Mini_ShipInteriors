/** « Pont » du simulateur d'accueil : hors des ponts desservis par l'ascenseur. */
export declare const TUTORIAL_LEVEL: -4
/** Plan du simulateur (une lettre par tuile). */
export declare const TUTORIAL_LAYOUT: string[]
/** Pièces fermées au début (elles s'ouvrent au fil des leçons). */
export declare const TUTORIAL_CLOSED: string
/** Où l'on se réveille. */
export declare const TUTORIAL_SPAWN: { x: number; z: number; yaw: number }
/** Le téléporteur, au centre de sa salle. */
export declare const TUTORIAL_TELEPORTER: { x: number; z: number }
/** À la sortie : sur le pont principal. */
export declare const TUTORIAL_EXIT: { level: 0; x: number; z: number; yaw: number }
/** Une position est-elle sur le sol du simulateur ? */
export declare function onTutorialFloor(x: number, z: number): boolean
