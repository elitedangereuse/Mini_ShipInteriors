import { DIRS, type ShipMap } from './map'

export interface Tile {
  x: number
  z: number
}

/** A* sur la grille des tuiles, 8 directions sans couper les angles de mur. */
export class Pathfinder {
  constructor(
    private map: ShipMap,
    private blocked: Set<string>,
  ) {}

  walkable(x: number, z: number): boolean {
    return this.map.isFloor(x, z) && !this.blocked.has(`${x},${z}`)
  }

  /** Peut-on passer de la tuile (x,z) à sa voisine dans la direction cardinale dir ? */
  private step(x: number, z: number, dir: number): boolean {
    const d = DIRS[dir]
    return this.map.edge(x, z, dir) !== 'wall' && this.walkable(x + d.dx, z + d.dz)
  }

  private neighbors(x: number, z: number): { x: number; z: number; cost: number }[] {
    const out: { x: number; z: number; cost: number }[] = []
    const ok: boolean[] = []
    for (let dir = 0; dir < 4; dir++) {
      ok[dir] = this.step(x, z, dir)
      if (ok[dir]) out.push({ x: x + DIRS[dir].dx, z: z + DIRS[dir].dz, cost: 1 })
    }
    // Diagonales : les deux chemins en « L » doivent être libres.
    for (let dir = 0; dir < 4; dir++) {
      const a = dir, b = (dir + 1) % 4
      if (!ok[a] || !ok[b]) continue
      const ax = x + DIRS[a].dx, az = z + DIRS[a].dz
      const bx = x + DIRS[b].dx, bz = z + DIRS[b].dz
      if (!this.step(ax, az, b) || !this.step(bx, bz, a)) continue
      out.push({ x: x + DIRS[a].dx + DIRS[b].dx, z: z + DIRS[a].dz + DIRS[b].dz, cost: Math.SQRT2 })
    }
    return out
  }

  find(start: Tile, goal: Tile): Tile[] | null {
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
      for (const n of this.neighbors(cur.t.x, cur.t.z)) {
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
