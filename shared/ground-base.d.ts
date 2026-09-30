import type { PatrolClock } from './patrol.js'

/** « Pont » de la base : hors du vaisseau. */
export declare const BASE_LEVEL: number
/** Le plateau : une seule pièce, la surface (« s »), sans murs. */
export declare const BASE_LAYOUT: string[]
/** Le Krait de la base, nez à l'ouest. */
export declare const BASE_KRAIT: { x: number; z: number }
/** L'escabeau du cockpit, devant le nez. */
export declare const BASE_LADDER: { x: number; z: number }
/** Le siège du pilote, sur le plateau. */
export declare const BASE_COCKPIT: { x: number; z: number }
/** Où l'on pose le pied en arrivant sur la base. */
export declare const BASE_ARRIVAL: { x: number; z: number; yaw: number }
/** Au retour, dans le hangar de la cale. */
export declare const HANGAR_ARRIVAL: { level: number; x: number; z: number; yaw: number }
/** Les réacteurs du Krait de la base se coupent d'eux-mêmes au bout de ce temps (secondes). */
export declare const BASE_BURN: number
/** Un joueur est-il installé aux commandes du Krait de la base ? */
export declare function inBaseCockpit(p: { level: number; pose?: string; x: number; z: number }): boolean

/** Pas de la cheffe (unités par seconde). */
export declare const CHIEF_SPEED: number
/** Temps d'arrêt quand on lui parle (secondes). */
export declare const CHIEF_HOLD: number

export type ChiefPost = 'pad' | 'tower' | 'garage' | 'greenhouse' | 'quarters' | 'rocket' | 'machines' | 'crystals'

/** Postes de sa ronde : ce qu'elle surveille, trajet depuis le poste précédent, temps passé (s), regard. */
export declare const CHIEF_POSTS: { at: ChiefPost; path: [number, number][]; watch: number; yaw: number }[]
/** Durée d'un tour complet (secondes). */
export declare const CHIEF_PERIOD: number

export interface ChiefPose {
  x: number
  z: number
  yaw: number
  walking: boolean
  /** Poste vers lequel elle va, ou qu'elle surveille (indice dans CHIEF_POSTS). */
  post: number
}

/** La cheffe à l'instant `t` de sa ronde (secondes). */
export declare function chiefAt(t: number): ChiefPose
/** Instant de la ronde (secondes) à l'heure `now` (ms). */
export declare function chiefTime(clock: PatrolClock, now: number): number
/** On lui parle à l'heure `now` (ms) : l'horloge s'arrête pour `seconds`. */
export declare function holdChief(clock: PatrolClock, now: number, seconds?: number): PatrolClock
