import type { PatrolClock } from './patrol.js'

/** Pont et pièce de la jardinière. */
export declare const GARDEN_LEVEL: number
export declare const GARDEN_ROOM: string
/** Pas de la jardinière (unités par seconde). */
export declare const GARDEN_SPEED: number
/** Temps d'arrêt quand on lui parle (secondes). */
export declare const GARDEN_HOLD: number
/** Une fiche de culture en cours la retient ce temps-là (secondes). */
export declare const GARDEN_HELP: number
/** Où elle attend son aide pendant une fiche : sur les pas japonais, face aux bacs. */
export declare const GARDEN_WAIT: { x: number; z: number; yaw: number }

/** Le jardin exotique commence ici (z), au sud de la serre. */
export declare const GARDEN_SOUTH: number

export type GardenStation = 'seeds' | 'racks' | 'tomato' | 'tree' | 'pond' | 'barrel' | 'flowers' | 'bench' | 'compost' | 'lettuce' | 'herbs' | 'tank' | 'crate'
export type GardenWork = 'sort' | 'water' | 'harvest' | 'feed' | 'dig' | 'trim' | 'look'

/** Meubles de la serre (rectangles au sol) : ses trajets ne les traversent pas. */
export declare const GARDEN_OBSTACLES: { minX: number; maxX: number; minZ: number; maxZ: number }[]
/** Postes de sa tournée : où elle se tient, trajet depuis le poste précédent, orientation, temps passé, geste. */
export declare const GARDEN_POSTS: { at: GardenStation; x: number; z: number; path: [number, number][]; watch: number; yaw: number; work: GardenWork }[]
/** Durée d'une tournée complète (secondes). */
export declare const GARDEN_PERIOD: number

export interface GardenPose {
  x: number
  z: number
  yaw: number
  walking: boolean
  /** Poste vers lequel elle va, ou auquel elle travaille (indice dans GARDEN_POSTS). */
  post: number
}

export type GardenClock = PatrolClock

/** Longueur d'une ligne brisée. */
export declare function pathLength(points: [number, number][]): number
/** Le segment de `a` à `b` évite-t-il tous les meubles de la serre ? */
export declare function gardenClear(a: [number, number], b: [number, number]): boolean
/** Trajet d'un point à un autre de la serre, en contournant les meubles (arrivée comprise, sans le départ). */
export declare function gardenRoute(from: { x: number; z: number }, to: { x: number; z: number }): [number, number][]
/** Elle rattrape sa place un peu plus vite qu'elle ne marche (facteur de son pas). */
export declare const GARDEN_CATCH_UP: number
/** Au-delà de cet écart avec sa place, par le chemin, elle y saute. */
export declare const GARDEN_SNAP: number
/** Un pas vers sa place, d'au plus `max` : nouvelle position, cap si elle a bougé, distance parcourue, et celle qui restait par le chemin. */
export declare function gardenStep(from: { x: number; z: number }, goal: { x: number; z: number }, max: number): { x: number; z: number; heading: number | null; moved: number; left: number }
/** La jardinière à l'instant `t` de sa tournée (secondes). */
export declare function gardenAt(t: number): GardenPose
/** Temps de retour de là où elle attend son aide à sa place dans la tournée, à l'instant `t` (secondes). */
export declare function gardenReturn(t: number): number
/** Instant de la tournée (secondes) à l'heure `now` (ms). */
export declare function gardenTime(clock: GardenClock, now: number): number
/** On lui parle à l'heure `now` (ms) : la tournée s'arrête pour `seconds`. */
export declare function holdGarden(clock: GardenClock, now: number, seconds?: number): GardenClock
/** Les fiches en cours finissent à `until` (ms, 0 : plus aucune) : la tournée reste figée jusque-là, plus le retour. */
export declare function helpGarden(clock: GardenClock, now: number, until: number): GardenClock
