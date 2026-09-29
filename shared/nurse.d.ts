import type { PatrolClock } from './patrol.js'

/** Pont et pièce de l'infirmière. */
export declare const NURSE_LEVEL: number
export declare const NURSE_ROOM: string
/** Pas de l'infirmière (unités par seconde). */
export declare const NURSE_SPEED: number
/** Temps d'arrêt quand on lui parle (secondes). */
export declare const NURSE_HOLD: number
/** Une consultation la retient au chevet au plus ce temps-là (secondes). */
export declare const NURSE_CARE: number
/** Durée minimale d'une consultation menée à son terme (secondes). */
export declare const NURSE_CARE_MIN: number
/** Le pansement reste ce temps-là (secondes). */
export declare const NURSE_PATCH: number

/** Les lits (le long du mur nord) et, pour chacun, où elle se tient au chevet. */
export declare const NURSE_BEDS: { x: number; z: number; side: { x: number; z: number; yaw: number } }[]
/** Meubles de l'infirmerie : rectangles au sol que ses trajets évitent. */
export declare const NURSE_OBSTACLES: { minX: number; maxX: number; minZ: number; maxZ: number }[]
/** Son poste, derrière le comptoir, face aux lits. */
export declare const NURSE_DESK: { x: number; z: number; yaw: number }

export type NurseStation = 'desk' | 'cabinet' | 'bed' | 'scanner' | 'fridge' | 'tank' | 'sink' | 'waiting'
export type NurseWork = 'type' | 'fetch' | 'check' | 'look' | 'wash'

/** Postes de sa tournée : trajet depuis le poste précédent, temps passé, orientation, geste. */
export declare const NURSE_POSTS: { at: NurseStation; path: [number, number][]; watch: number; yaw: number; work: NurseWork }[]
/** Durée d'une tournée complète (secondes). */
export declare const NURSE_PERIOD: number

export interface NursePose {
  x: number
  z: number
  yaw: number
  walking: boolean
  /** Poste vers lequel elle va, ou auquel elle travaille (indice dans NURSE_POSTS). */
  post: number
}

export type NurseClock = PatrolClock

/** Longueur d'une ligne brisée. */
export declare function pathLength(points: [number, number][]): number
/** Le segment de `a` à `b` évite-t-il tous les meubles ? */
export declare function nurseClear(a: [number, number], b: [number, number]): boolean
/** Trajet d'un point à un autre de l'infirmerie, par l'allée s'il le faut (arrivée comprise, sans le départ). */
export declare function nurseRoute(from: { x: number; z: number }, to: { x: number; z: number }): [number, number][]
/** Elle rattrape sa place un peu plus vite qu'elle ne marche (facteur de son pas). */
export declare const NURSE_CATCH_UP: number
/** Au-delà de cet écart avec sa place, par le chemin, elle y saute. */
export declare const NURSE_SNAP: number
/** Un pas vers sa place, d'au plus `max` : nouvelle position, cap si elle a bougé, distance parcourue, et celle qui restait par le chemin. */
export declare function nurseStep(from: { x: number; z: number }, goal: { x: number; z: number }, max: number): { x: number; z: number; heading: number | null; moved: number; left: number }
/** L'infirmière à l'instant `t` de sa tournée (secondes). */
export declare function nurseAt(t: number): NursePose
/** Lit sur lequel est allongé un joueur (indice dans NURSE_BEDS), ou -1. */
export declare function bedOf(p: { x: number; z: number }): number
/** Temps de retour du chevet du lit `bed` à sa place dans la tournée, à l'instant `t` (secondes). */
export declare function nurseReturn(t: number, bed: number): number
/** Instant de la tournée (secondes) à l'heure `now` (ms). */
export declare function nurseTime(clock: NurseClock, now: number): number
/** On lui parle à l'heure `now` (ms) : la tournée s'arrête pour `seconds`. */
export declare function holdNurse(clock: NurseClock, now: number, seconds?: number): NurseClock
/** Une consultation au lit `bed` finit à `until` (ms, 0 : finie) : la tournée reste figée jusque-là, plus le retour. */
export declare function careNurse(clock: NurseClock, now: number, until: number, bed: number): NurseClock
