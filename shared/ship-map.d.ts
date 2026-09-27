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
 */
export declare class ShipMap {
  readonly width: number
  readonly height: number
  readonly doors: Door[]
  constructor(layout: string[])
  room(x: number, z: number): string | null
  isFloor(x: number, z: number): boolean
  /** Clé unique d'une arête, identique vue des deux tuiles. */
  edgeKey(x: number, z: number, dir: number): string
  edge(x: number, z: number, dir: number): EdgeKind
}
