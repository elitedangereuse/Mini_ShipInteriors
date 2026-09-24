/**
 * Grille d'un pont, une lettre par tuile (colonne = x, ligne = z).
 *   ' '  vide
 *   a-z  sol d'une pièce (même lettre = même pièce ; un mur sépare deux lettres différentes)
 *   '+'  porte : relie les deux tuiles voisines situées de part et d'autre
 */

export const DIRS = [
  { dx: 0, dz: -1 }, // 0 nord
  { dx: 1, dz: 0 }, // 1 est
  { dx: 0, dz: 1 }, // 2 sud
  { dx: -1, dz: 0 }, // 3 ouest
] as const

export type EdgeKind = 'open' | 'wall' | 'door'

export interface Door {
  /** Tuile de la porte et direction (0..3) vers la tuile de l'autre côté. */
  x: number
  z: number
  dir: number
}

export class ShipMap {
  readonly width: number
  readonly height: number
  /** Pièce de chaque tuile (null = vide). */
  private rooms: (string | null)[][]
  readonly doors: Door[] = []
  private doorEdges = new Set<string>()

  constructor(layout: string[]) {
    this.height = layout.length
    this.width = Math.max(...layout.map((l) => l.length))
    this.rooms = layout.map((line) =>
      Array.from({ length: this.width }, (_, x) => {
        const c = line[x] ?? ' '
        return c === ' ' ? null : c
      }),
    )
    this.resolveDoors()
  }

  /** Une tuile '+' prend la pièce du côté vers lequel ses voisins latéraux penchent ; la porte est sur l'autre bord. */
  private resolveDoors() {
    for (let z = 0; z < this.height; z++) {
      for (let x = 0; x < this.width; x++) {
        if (this.rooms[z][x] !== '+') continue
        for (const [neg, pos] of [[3, 1], [0, 2]] as const) {
          const a = this.rawRoom(x + DIRS[neg].dx, z + DIRS[neg].dz)
          const b = this.rawRoom(x + DIRS[pos].dx, z + DIRS[pos].dz)
          if (!a || !b || a === '+' || b === '+' || a === b) continue
          const lat = neg === 3 ? [0, 2] : [1, 3]
          const lats = lat.map((d) => this.rawRoom(x + DIRS[d].dx, z + DIRS[d].dz))
          const score = (r: string) => lats.filter((l) => l === r).length
          const towardB = score(a) >= score(b)
          this.rooms[z][x] = towardB ? a : b
          const dir = towardB ? pos : neg
          this.doors.push({ x, z, dir })
          this.doorEdges.add(this.edgeKey(x, z, dir))
          break
        }
        if (this.rooms[z][x] === '+') throw new Error(`Porte mal placée en (${x}, ${z})`)
      }
    }
  }

  private rawRoom(x: number, z: number): string | null {
    return this.rooms[z]?.[x] ?? null
  }

  room(x: number, z: number): string | null {
    return this.rawRoom(x, z)
  }

  isFloor(x: number, z: number): boolean {
    return this.room(x, z) !== null
  }

  /** Clé unique d'une arête, identique vue des deux tuiles. */
  edgeKey(x: number, z: number, dir: number): string {
    const d = DIRS[dir]
    const ax = Math.min(x, x + d.dx), az = Math.min(z, z + d.dz)
    return `${ax},${az},${d.dx !== 0 ? 'v' : 'h'}`
  }

  edge(x: number, z: number, dir: number): EdgeKind {
    const a = this.room(x, z)
    const b = this.room(x + DIRS[dir].dx, z + DIRS[dir].dz)
    if (a === b && a !== null) return 'open'
    if (this.doorEdges.has(this.edgeKey(x, z, dir))) return 'door'
    return 'wall'
  }
}
