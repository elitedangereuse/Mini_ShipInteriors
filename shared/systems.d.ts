export type SystemId = 'shinrarta' | 'sol' | 'colonia' | 'alpha-centauri' | 'lave' | 'sagittarius' | 'maia' | 'beagle-point'

/** Identifiants des destinations, dans l'ordre de la liste des sauts. */
export declare const SYSTEM_IDS: SystemId[]
/** Système où se trouve le vaisseau au démarrage du relais. */
export declare const HOME_SYSTEM: SystemId
/** Siège du pilote (pont principal) : on ne lance un saut qu'installé dessus. */
export declare const PILOT_SEAT: { level: number; x: number; z: number }
/** Durée d'un saut : charge du réacteur, puis traversée (secondes). */
export declare const JUMP_CHARGE: number
export declare const JUMP_TRAVEL: number
/** Destination d'un saut depuis `from` : une autre, au hasard. */
export declare function nextSystem(from: SystemId, random?: () => number): SystemId
