/**
 * Grille d'un pont, une lettre par tuile (colonne = x, ligne = z).
 *   ' '  vide
 *   a-z  sol d'une pièce (même lettre = même pièce ; un mur sépare deux lettres différentes)
 *   '+'  porte : relie les deux tuiles voisines situées de part et d'autre
 *
 * Une porte peut être verrouillée : on la voit, mais elle ne s'ouvre pas, et elle arrête le
 * passage et la vue comme un mur (pièce en travaux, extension de quartiers pas encore achetée).
 */

export const DIRS = [
  { dx: 0, dz: -1 }, // 0 nord
  { dx: 1, dz: 0 }, // 1 est
  { dx: 0, dz: 1 }, // 2 sud
  { dx: -1, dz: 0 }, // 3 ouest
]

export class ShipMap {
  /**
   * @param {string[]} layout
   * @param {{ closed?: string, doors?: { x: number, z: number, dir: number }[] }} [options]
   *   closed : pièces fermées (leurs portes sont verrouillées) ; doors : portes en plus des '+',
   *   posées sur un bord de tuile (elles peuvent donner sur le vide, fermées, cf. lock)
   */
  constructor(layout, options = {}) {
    /** Portes : tuile de la porte et direction (0..3) vers la tuile de l'autre côté. */
    this.doors = []
    this.doorEdges = new Set()
    /** Arêtes des portes verrouillées. */
    this.locked = new Set()
    this.height = layout.length
    this.width = Math.max(...layout.map((l) => l.length))
    this.rooms = layout.map((line) =>
      Array.from({ length: this.width }, (_, x) => {
        const c = line[x] ?? ' '
        return c === ' ' ? null : c
      }),
    )
    this.resolveDoors()
    for (const d of options.doors ?? []) this.addDoor(d.x, d.z, d.dir)
    if (options.closed) {
      for (const d of this.doors) {
        const other = this.room(d.x + DIRS[d.dir].dx, d.z + DIRS[d.dir].dz)
        if (options.closed.includes(this.room(d.x, d.z)) || options.closed.includes(other)) this.lock(d.x, d.z, d.dir)
      }
    }
  }

  /** Porte sur le bord `dir` de la tuile (x, z). */
  addDoor(x, z, dir) {
    const key = this.edgeKey(x, z, dir)
    if (this.doorEdges.has(key)) return
    this.doors.push({ x, z, dir })
    this.doorEdges.add(key)
  }

  /** Verrouille (ou déverrouille) la porte du bord `dir` de la tuile (x, z). */
  lock(x, z, dir, on = true) {
    const key = this.edgeKey(x, z, dir)
    if (on) this.locked.add(key)
    else this.locked.delete(key)
  }

  isLocked(x, z, dir) {
    return this.locked.has(this.edgeKey(x, z, dir))
  }

  /** Une tuile '+' prend la pièce du côté vers lequel ses voisins latéraux penchent ; la porte est sur l'autre bord. */
  resolveDoors() {
    for (let z = 0; z < this.height; z++) {
      for (let x = 0; x < this.width; x++) {
        if (this.rooms[z][x] !== '+') continue
        for (const [neg, pos] of [[3, 1], [0, 2]]) {
          const a = this.rawRoom(x + DIRS[neg].dx, z + DIRS[neg].dz)
          const b = this.rawRoom(x + DIRS[pos].dx, z + DIRS[pos].dz)
          if (!a || !b || a === '+' || b === '+' || a === b) continue
          const lat = neg === 3 ? [0, 2] : [1, 3]
          const lats = lat.map((d) => this.rawRoom(x + DIRS[d].dx, z + DIRS[d].dz))
          const score = (r) => lats.filter((l) => l === r).length
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

  rawRoom(x, z) {
    return this.rooms[z]?.[x] ?? null
  }

  room(x, z) {
    return this.rawRoom(x, z)
  }

  isFloor(x, z) {
    return this.room(x, z) !== null
  }

  /** Clé unique d'une arête, identique vue des deux tuiles. */
  edgeKey(x, z, dir) {
    const d = DIRS[dir]
    const ax = Math.min(x, x + d.dx), az = Math.min(z, z + d.dz)
    return `${ax},${az},${d.dx !== 0 ? 'v' : 'h'}`
  }

  /** @returns {'open' | 'wall' | 'door'} */
  edge(x, z, dir) {
    const a = this.room(x, z)
    const b = this.room(x + DIRS[dir].dx, z + DIRS[dir].dz)
    if (a === b && a !== null) return 'open'
    const key = this.edgeKey(x, z, dir)
    if (this.doorEdges.has(key) && !this.locked.has(key)) return 'door'
    return 'wall'
  }
}
