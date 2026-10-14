import type { PatrolClock } from './patrol.js'

/** Pont et pièce des habitués. */
export declare const DINERS_LEVEL: number
export declare const DINERS_ROOM: string
/** Leur pas (unités par seconde). */
export declare const DINER_SPEED: number
/** Le temps de s'asseoir sur le banc, ou de s'en relever (secondes). */
export declare const SIT_TIME: number
/** La salle, où ils restent (bornes de leur centre). */
export declare const DINING_AREA: { minX: number; maxX: number; minZ: number; maxZ: number }

/** Ce qu'un habitué fait à un poste. */
export type DinerAct = 'tray' | 'serve' | 'eat' | 'return' | 'coffee' | 'drink' | 'read' | 'water'

/** Un poste de sa journée : trajet depuis le poste précédent, temps passé, orientation, geste, place. */
export interface DinerStep {
  act: DinerAct
  path: [number, number][]
  stay: number
  yaw?: number
  takes?: 'tray' | 'cup'
  drops?: 'tray' | 'cup'
  seat?: { x: number; z: number; yaw: number }
}

/** Les trois habitués : leur apparence et leur journée. */
export declare const DINERS: { id: string; look: string; steps: DinerStep[] }[]
/** La période commune de leurs journées (secondes). */
export declare const DINERS_PERIOD: number
/** Le décalage de chacun dans la période (secondes). */
export declare const DINER_OFFSETS: number[]

export interface DinerPose {
  x: number
  z: number
  yaw: number
  walking: boolean
  act: DinerAct
  /** Poste vers lequel il va, ou auquel il se tient (indice dans ses `steps`). */
  post: number
  /** Progression de l'arrêt en cours (0 à 1 ; 0 en marche). */
  k: number
  /** Assis à sa place (1), debout (0), ou entre les deux. */
  seated: number
  eating: boolean
  tray: boolean
  cup: boolean
  /** Le repas, de 0 (plateau plein) à 1 (fini). */
  meal: number
}

/** L'habitué `index` à l'instant `t` de l'horloge des habitués (secondes). */
export declare function dinerAt(index: number, t: number): DinerPose
/** Sa place à table, et son abord. */
export declare function dinerSeat(index: number): { x: number; z: number; yaw: number; from: { x: number; z: number } }
/** Les tronçons de sa journée (pour les essais). */
export declare function dinerSteps(index: number): {
  kind: 'walk' | 'sit' | 'stay' | 'rise'
  from: [number, number]
  to: [number, number]
  start: number
  duration: number
  heading: number
  post: number
  seated?: boolean
  eating?: boolean
  tray: boolean
  cup: boolean
  meal: number
}[]
/** Horloge des habitués (secondes), jamais arrêtée. */
export declare function dinersTime(clock: PatrolClock, now: number): number
