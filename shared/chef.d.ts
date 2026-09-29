import type { PatrolClock } from './patrol.js'

/** Pont et pièce du chef. */
export declare const CHEF_LEVEL: number
export declare const CHEF_ROOM: string
/** Pas du chef (unités par seconde). */
export declare const CHEF_SPEED: number
/** Temps d'arrêt quand on lui parle (secondes). */
export declare const CHEF_HOLD: number
/** Une commande en cours le retient au bout du self ce temps-là (secondes). */
export declare const CHEF_COOK: number
/** La passe, où il envoie les plats, face à la salle. */
export declare const CHEF_PASSE: { x: number; z: number; yaw: number }
/** Où il attend son commis pendant une commande : au bout de la ligne du self, face à la salle. */
export declare const CHEF_WAIT: { x: number; z: number; yaw: number }

export type ChefStation = 'fridge' | 'prep' | 'range' | 'passe' | 'sink' | 'pantry' | 'hall'
export type ChefWork = 'fetch' | 'chop' | 'stir' | 'serve' | 'wash' | 'look'

/** Postes de sa tournée : trajet depuis le poste précédent, temps passé, orientation, geste. */
export declare const CHEF_POSTS: { at: ChefStation; path: [number, number][]; watch: number; yaw: number; work: ChefWork }[]
/** Durée d'une tournée complète (secondes). */
export declare const CHEF_PERIOD: number

export interface ChefPose {
  x: number
  z: number
  yaw: number
  walking: boolean
  /** Poste vers lequel il va, ou auquel il travaille (indice dans CHEF_POSTS). */
  post: number
}

export type ChefClock = PatrolClock

/** Longueur d'une ligne brisée. */
export declare function pathLength(points: [number, number][]): number
/** Trajet d'un point à un autre, par le passage s'il faut changer de côté du comptoir (arrivée comprise, sans le départ). */
export declare function chefRoute(from: { x: number; z: number }, to: { x: number; z: number }): [number, number][]
/** Il rattrape sa place un peu plus vite qu'il ne marche (facteur de son pas). */
export declare const CHEF_CATCH_UP: number
/** Au-delà de cet écart avec sa place, par le chemin, il y saute. */
export declare const CHEF_SNAP: number
/** Un pas vers sa place, d'au plus `max` : nouvelle position, cap s'il a bougé, distance parcourue, et celle qui restait par le chemin. */
export declare function chefStep(from: { x: number; z: number }, goal: { x: number; z: number }, max: number): { x: number; z: number; heading: number | null; moved: number; left: number }
/** Le chef à l'instant `t` de sa tournée (secondes). */
export declare function chefAt(t: number): ChefPose
/** Temps de retour du bout du self à sa place dans la tournée, à l'instant `t` (secondes). */
export declare function chefReturn(t: number): number
/** Instant de la tournée (secondes) à l'heure `now` (ms). */
export declare function chefTime(clock: ChefClock, now: number): number
/** On lui parle à l'heure `now` (ms) : la tournée s'arrête pour `seconds`. */
export declare function holdChef(clock: ChefClock, now: number, seconds?: number): ChefClock
/** Les commandes en cours finissent à `until` (ms, 0 : plus aucune) : la tournée reste figée jusque-là, plus le retour. */
export declare function cookChef(clock: ChefClock, now: number, until: number): ChefClock
