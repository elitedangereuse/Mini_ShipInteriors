export declare const DIRS: readonly [
  { readonly dx: 0; readonly dz: -1 },
  { readonly dx: 1; readonly dz: 0 },
  { readonly dx: 0; readonly dz: 1 },
  { readonly dx: -1; readonly dz: 0 },
]

export type EdgeKind = 'open' | 'wall' | 'door'

export interface Door {
  /** Tuile de la porte et direction (0..3) vers la tuile de l'autre côté. */
  x: number
  z: number
  dir: number
}

/**
 * Grille d'un pont, une lettre par tuile (colonne = x, ligne = z).
 *   ' '  vide
 *   a-z  sol d'une pièce (même lettre = même pièce ; un mur sépare deux lettres différentes)
 *   '+'  porte : relie les deux tuiles voisines situées de part et d'autre
 *
 * Une porte peut être verrouillée : on la voit, mais elle ne s'ouvre pas, et elle arrête le
 * passage et la vue comme un mur.
 */
export interface ShipMapOptions {
  /** Pièces fermées : leurs portes sont verrouillées. */
  closed?: string
  /** Portes en plus des '+', posées sur un bord de tuile ; verrouillées si `locked`. */
  doors?: (Door & { locked?: boolean })[]
}

export declare class ShipMap {
  readonly width: number
  readonly height: number
  readonly doors: Door[]
  constructor(layout: string[], options?: ShipMapOptions)
  /** Porte sur le bord `dir` de la tuile (x, z). */
  addDoor(x: number, z: number, dir: number): void
  /** Retire la porte du bord `dir` de la tuile (x, z), s'il y en a une. */
  removeDoor(x: number, z: number, dir: number): void
  /** Change la pièce d'une tuile (null : du vide), le plan s'agrandissant au besoin. */
  setRoom(x: number, z: number, room: string | null): void
  /** Verrouille (ou déverrouille) la porte du bord `dir` de la tuile (x, z). */
  lock(x: number, z: number, dir: number, on?: boolean): void
  isLocked(x: number, z: number, dir: number): boolean
  room(x: number, z: number): string | null
  isFloor(x: number, z: number): boolean
  /** Clé unique d'une arête, identique vue des deux tuiles. */
  edgeKey(x: number, z: number, dir: number): string
  edge(x: number, z: number, dir: number): EdgeKind
}
