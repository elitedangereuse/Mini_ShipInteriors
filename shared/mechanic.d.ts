import type { PatrolClock } from './patrol.js'

/** Pont et pièce du mécano. */
export declare const MECH_LEVEL: number
export declare const MECH_ROOM: string
/** Pas du mécano (unités par seconde). */
export declare const MECH_SPEED: number
/** Temps d'arrêt quand on lui parle (secondes). */
export declare const MECH_HOLD: number
/** Une révision en cours le retient ce temps-là (secondes). */
export declare const MECH_HELP: number
/** Le siège du pilote du Krait, sur le pont. */
export declare const KRAIT_COCKPIT: { x: number; z: number }
/** Les réacteurs se coupent d'eux-mêmes au bout de ce temps (secondes). */
export declare const KRAIT_BURN: number
/** Réacteurs coupés, Nico souffle ce temps-là (secondes) avant de reprendre sa tournée. */
export declare const MECH_RELIEF: number
/** Pas de course du mécano quand il panique (facteur de son pas). */
export declare const MECH_RUSH: number
/** Où il court quand les réacteurs démarrent : au pied de l'escabeau, face au cockpit. */
export declare const MECH_PANIC: { x: number; z: number; yaw: number }
/** Où il attend son aide pendant une révision : devant le nez du Krait. */
export declare const MECH_WAIT: { x: number; z: number; yaw: number }

export type MechStation = 'bench' | 'gear' | 'parts' | 'welder' | 'console' | 'nose' | 'shield' | 'fuel' | 'cart' | 'thruster' | 'engines'
export type MechWork = 'tinker' | 'wrench' | 'fetch' | 'weld' | 'type' | 'look' | 'refuel' | 'scan'

/** Meubles du hangar (rectangles au sol) : ses trajets ne les traversent pas. */
export declare const MECH_OBSTACLES: { minX: number; maxX: number; minZ: number; maxZ: number }[]
/** Postes de sa tournée : où il se tient, trajet depuis le poste précédent, orientation, temps passé, geste. */
export declare const MECH_POSTS: { at: MechStation; x: number; z: number; path: [number, number][]; watch: number; yaw: number; work: MechWork }[]
/** Durée d'une tournée complète (secondes). */
export declare const MECH_PERIOD: number

export interface MechPose {
  x: number
  z: number
  yaw: number
  walking: boolean
  /** Poste vers lequel il va, ou auquel il travaille (indice dans MECH_POSTS). */
  post: number
}

export type MechClock = PatrolClock

/** Longueur d'une ligne brisée. */
export declare function pathLength(points: [number, number][]): number
/** Le segment de `a` à `b` évite-t-il tous les meubles du hangar ? */
export declare function mechClear(a: [number, number], b: [number, number]): boolean
/** Trajet d'un point à un autre du hangar, par l'allée qui fait le tour du Krait (arrivée comprise, sans le départ). */
export declare function mechRoute(from: { x: number; z: number }, to: { x: number; z: number }): [number, number][]
/** Il rattrape sa place un peu plus vite qu'il ne marche (facteur de son pas). */
export declare const MECH_CATCH_UP: number
/** Au-delà de cet écart avec sa place, par le chemin, il y saute. */
export declare const MECH_SNAP: number
/** Un pas vers sa place, d'au plus `max` : nouvelle position, cap s'il a bougé, distance parcourue, et celle qui restait par le chemin. */
export declare function mechStep(from: { x: number; z: number }, goal: { x: number; z: number }, max: number): { x: number; z: number; heading: number | null; moved: number; left: number }
/** Le mécano à l'instant `t` de sa tournée (secondes). */
export declare function mechAt(t: number): MechPose
/** Temps de retour de `from` (le nez du Krait par défaut) à sa place dans la tournée, à l'instant `t` (secondes). */
export declare function mechReturn(t: number, from?: { x: number; z: number }): number
/** Instant de la tournée (secondes) à l'heure `now` (ms). */
export declare function mechTime(clock: MechClock, now: number): number
/** On lui parle à l'heure `now` (ms) : la tournée s'arrête pour `seconds`. */
export declare function holdMech(clock: MechClock, now: number, seconds?: number): MechClock
/** Les révisions en cours finissent à `until` (ms, 0 : plus aucune) : la tournée reste figée jusque-là, plus le retour. */
export declare function helpMech(clock: MechClock, now: number, until: number): MechClock
/** Les réacteurs tournent jusqu'à `until` (ms, 0 : ils viennent de s'arrêter) : la tournée reste figée jusque-là, plus souffler et revenir. */
export declare function panicMech(clock: MechClock, now: number, until: number): MechClock
/** Un joueur est-il installé aux commandes du Krait ? */
export declare function inCockpit(p: { x: number; z: number; pose?: string | null }): boolean
