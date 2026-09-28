export type WingId = 'left' | 'middle' | 'right'

export interface WingSlot {
  id: WingId
  /** Coin nord-ouest du carré de WING_SIZE tuiles. */
  x0: number
  z0: number
  /** Porte depuis les quartiers : tuile des quartiers et bord (cf. ShipMap.addDoor). */
  door: { x: number; z: number; dir: number }
}

/** Côté d'un espace, en tuiles. */
export declare const WING_SIZE: number
/** Espaces accolés aux quartiers : gauche (ouest), milieu (sud), droite (est). */
export declare const WING_SLOTS: WingSlot[]
