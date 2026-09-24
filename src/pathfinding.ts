import type { Box2 } from './deck'
import { DIRS, type ShipMap } from './map'
import { clearPath } from './physics'

/**
 * Rayon avec lequel on valide les passages entre tuiles : celui du joueur, le plus large
 * des marcheurs. Une chaise posée entre deux tuiles libres coupe ainsi le passage,
 * au lieu de laisser le chemin la traverser.
 */
const CLEARANCE = 0.18

export interface Tile {
  x: number
  z: number
}

/** A* sur la grille des tuiles, 8 directions sans couper les angles de mur ni les meubles. */
export class Pathfinder {
  /** Passages entre deux tuiles voisines, validés contre les collisions (calculés à la demande). */
  private passages = new Map<number, boolean>()

  constructor(
    private map: ShipMap,
    private blocked: Set<string>,
    private colliders: Box2[] = [],
  ) {}

  walkable(x: number, z: number): boolean {
    return this.map.isFloor(x, z) && !this.blocked.has(`${x},${z}`)
  }

  /** Peut-on passer de la tuile (x,z) à sa voisine dans la direction cardinale dir ? */
  private step(x: number, z: number, dir: number): boolean {
    const d = DIRS[dir]
    return this.map.edge(x, z, dir) !== 'wall' && this.walkable(x + d.dx, z + d.dz)
  }

  /** Un marcheur peut-il aller en ligne droite du centre d'une tuile au centre de sa voisine ? */
  private passage(ax: number, az: number, bx: number, bz: number): boolean {
    const key = (a: number, b: number, c: number, d: number) => ((b * 1000 + a) * 3 + (c - a + 1)) * 3 + (d - b + 1)
    const k = key(ax, az, bx, bz)
    let ok = this.passages.get(k)
    if (ok === undefined) {
      const r = CLEARANCE
      const minX = Math.min(ax, bx) - r, maxX = Math.max(ax, bx) + r
      const minZ = Math.min(az, bz) - r, maxZ = Math.max(az, bz) + r
      const near = this.colliders.filter((c) => c.maxX > minX && c.minX < maxX && c.maxZ > minZ && c.minZ < maxZ)
      ok = clearPath({ x: ax, z: az }, { x: bx, z: bz }, r, near)
      this.passages.set(k, ok)
      this.passages.set(key(bx, bz, ax, az), ok)
    }
    return ok
  }

  /** @param strict valider chaque passage contre les meubles (pas pour la toute première tuile) */
  private neighbors(x: number, z: number, strict: boolean): { x: number; z: number; cost: number }[] {
    const out: { x: number; z: number; cost: number }[] = []
    const ok: boolean[] = []
    const pass = (nx: number, nz: number) => !strict || this.passage(x, z, nx, nz)
    for (let dir = 0; dir < 4; dir++) {
      ok[dir] = this.step(x, z, dir)
      const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
      if (ok[dir] && pass(nx, nz)) out.push({ x: nx, z: nz, cost: 1 })
    }
    // Diagonales : les deux chemins en « L » doivent être libres.
    for (let dir = 0; dir < 4; dir++) {
      const a = dir, b = (dir + 1) % 4
      if (!ok[a] || !ok[b]) continue
      const ax = x + DIRS[a].dx, az = z + DIRS[a].dz
      const bx = x + DIRS[b].dx, bz = z + DIRS[b].dz
      if (!this.step(ax, az, b) || !this.step(bx, bz, a)) continue
      const nx = x + DIRS[a].dx + DIRS[b].dx, nz = z + DIRS[a].dz + DIRS[b].dz
      if (pass(nx, nz)) out.push({ x: nx, z: nz, cost: Math.SQRT2 })
    }
    return out
  }

  /**
   * @param strict refuser les passages que coupe un meuble. Sans cela, on retrouve l'ancien
   *   comportement (le chemin peut frôler une chaise) : utile en dernier recours pour un clic.
   */
  find(start: Tile, goal: Tile, strict = true): Tile[] | null {
    if (!this.walkable(goal.x, goal.z)) return null
    const key = (t: Tile) => t.z * 1000 + t.x
    const h = (t: Tile) => {
      const dx = Math.abs(t.x - goal.x), dz = Math.abs(t.z - goal.z)
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)
    }
    const open = new Map<number, { t: Tile; g: number; f: number }>()
    const came = new Map<number, number>()
    const gScore = new Map<number, number>()
    const tiles = new Map<number, Tile>()
    const sk = key(start)
    open.set(sk, { t: start, g: 0, f: h(start) })
    gScore.set(sk, 0)
    tiles.set(sk, start)

    while (open.size) {
      let bestK = -1
      let best: { t: Tile; g: number; f: number } | undefined
      for (const [k, n] of open) if (!best || n.f < best.f) { best = n; bestK = k }
      const cur = best!
      open.delete(bestK)
      if (cur.t.x === goal.x && cur.t.z === goal.z) {
        const path: Tile[] = [cur.t]
        let k = bestK
        while (came.has(k)) {
          k = came.get(k)!
          path.unshift(tiles.get(k)!)
        }
        return path
      }
      // Depuis la tuile de départ, le marcheur n'est pas au centre : on ne valide pas ce premier pas.
      const fromStart = cur.t.x === start.x && cur.t.z === start.z
      for (const n of this.neighbors(cur.t.x, cur.t.z, strict && !fromStart)) {
        const nk = key(n)
        const g = cur.g + n.cost
        if (g >= (gScore.get(nk) ?? Infinity)) continue
        gScore.set(nk, g)
        came.set(nk, bestK)
        const t = { x: n.x, z: n.z }
        tiles.set(nk, t)
        open.set(nk, { t, g, f: g + h(t) })
      }
    }
    return null
  }
}
