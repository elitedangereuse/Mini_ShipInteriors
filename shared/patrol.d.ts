/** Pont de la ronde. */
export declare const PATROL_LEVEL: number
/** Pas du sergent (unités par seconde). */
export declare const PATROL_SPEED: number
/** Temps d'arrêt quand on lui parle (secondes). */
export declare const PATROL_HOLD: number
/** Postes de la ronde : pièce, trajet depuis le poste précédent, temps de garde (secondes). */
export declare const PATROL_POSTS: { room: string; path: [number, number][]; watch: number }[]
/** Durée d'un tour complet (secondes). */
export declare const PATROL_PERIOD: number

export interface PatrolPose {
  x: number
  z: number
  yaw: number
  walking: boolean
  /** Poste vers lequel il va, ou qu'il surveille (indice dans PATROL_POSTS). */
  post: number
}

/** Horloge de la ronde : à l'instant `at` (ms), elle en était à `tau` (s), figée jusqu'à `holdUntil` (ms). */
export interface PatrolClock {
  tau: number
  at: number
  holdUntil: number
}

/** Le sergent à l'instant `t` de la ronde (secondes). */
export declare function patrolAt(t: number): PatrolPose
/** Instant de la ronde (secondes) à l'heure `now` (ms). */
export declare function patrolTime(clock: PatrolClock, now: number): number
/** On lui parle à l'heure `now` (ms) : l'horloge s'arrête pour `seconds`. */
export declare function holdPatrol(clock: PatrolClock, now: number, seconds?: number): PatrolClock
