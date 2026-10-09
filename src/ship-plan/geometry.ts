import { DIRS, type ShipMap } from '../map'

/*
 * Géométrie du plan d'un pont, tirée de son ShipMap : le contour de chaque pièce, ses portes, et
 * la place de son nom. Les coordonnées sont celles du plan, en tuiles : la tuile (x, z) du pont
 * occupe le carré de (x, z) à (x + 1, z + 1), soit la position du jeu décalée d'une demi-tuile.
 * Les mêmes contours servent à plat (la fenêtre du plan) et en perspective (la pile des ponts,
 * cf. isoPoint) ; ils se dessinent en SVG comme au canvas (Path2D lit la même chaîne).
 */

export type Point = [number, number]

export interface Rect {
  x: number
  z: number
  w: number
  h: number
}

export interface PlanRoom {
  id: string
  /** Contours fermés de la pièce (un par morceau, et un par trou). */
  loops: Point[][]
  tiles: Point[]
  /** Le plus grand rectangle de tuiles de la pièce : là où tient son nom. */
  label: Rect
}

export interface PlanDoor {
  /** Milieu de la porte, et son sens : `true` si elle est dans un mur qui file le long de x. */
  x: number
  z: number
  alongX: boolean
  locked: boolean
  /** Les deux pièces qu'elle relie (null : le vide). */
  rooms: [string | null, string | null]
}

export interface DeckPlan {
  width: number
  height: number
  rooms: PlanRoom[]
  doors: PlanDoor[]
  /** Contour du pont entier : sa coque. */
  hull: Point[][]
}

/**
 * Contours d'un ensemble de tuiles : on suit ses bords, la matière à main droite, de sommet en
 * sommet. Là où deux tuiles ne se touchent que par un coin, on tourne au plus serré : chaque
 * morceau garde son propre contour.
 */
function outline(inside: (x: number, z: number) => boolean, width: number, height: number): Point[][] {
  // Arêtes orientées, par sommet de départ : [dx, dz] de l'arête.
  const from = new Map<string, Point[]>()
  const add = (x: number, z: number, dx: number, dz: number) => {
    const key = `${x},${z}`
    from.set(key, [...(from.get(key) ?? []), [dx, dz]])
  }
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      if (!inside(x, z)) continue
      if (!inside(x, z - 1)) add(x, z, 1, 0)
      if (!inside(x + 1, z)) add(x + 1, z, 0, 1)
      if (!inside(x, z + 1)) add(x + 1, z + 1, -1, 0)
      if (!inside(x - 1, z)) add(x, z + 1, 0, -1)
    }
  }
  const loops: Point[][] = []
  for (const [key, edges] of from) {
    while (edges.length) {
      const [sx, sz] = key.split(',').map(Number)
      let x = sx, z = sz
      let [dx, dz] = edges.pop()!
      const loop: Point[] = [[x, z]]
      for (;;) {
        x += dx
        z += dz
        if (x === sx && z === sz) break
        const next = from.get(`${x},${z}`)!
        // À droite d'abord, puis tout droit, puis à gauche.
        const turns: Point[] = [[-dz, dx], [dx, dz], [dz, -dx]]
        const i = turns.map(([tx, tz]) => next.findIndex(([ex, ez]) => ex === tx && ez === tz)).find((k) => k >= 0)!
        const [nx, nz] = next.splice(i, 1)[0]
        // Un sommet au milieu d'un bord droit n'apporte rien.
        if (nx !== dx || nz !== dz) loop.push([x, z])
        dx = nx
        dz = nz
      }
      // Le départ lui-même peut être au milieu d'un bord droit.
      const [ax, az] = loop[1], [bx, bz] = loop[loop.length - 1]
      if ((ax === sx && bx === sx) || (az === sz && bz === sz)) loop.shift()
      loops.push(loop)
    }
  }
  return loops
}

/**
 * Le rectangle de tuiles où écrire un nom : le plus large possible d'abord (un nom s'écrit à
 * l'horizontale), sur trois tuiles de haut au plus.
 */
function labelRect(inside: (x: number, z: number) => boolean, width: number, height: number): Rect {
  let best: Rect = { x: 0, z: 0, w: 0, h: 0 }
  let score = 0
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      let maxW = Infinity
      for (let h = 1; z + h <= height; h++) {
        let w = 0
        while (w < maxW && inside(x + w, z + h - 1)) w++
        maxW = w
        if (!w) break
        const s = w * Math.min(h, 3) + Math.min(w, h) * 0.01
        if (s > score) {
          score = s
          best = { x, z, w, h }
        }
      }
    }
  }
  return best
}

/**
 * @param skip tuiles d'une pièce où l'on n'écrit pas son nom : une partie de la pièce a le sien
 *   (la Promenade dans la coursive, le jardin exotique dans la serre)
 */
export function deckPlan(map: ShipMap, skip: (room: string, x: number, z: number) => boolean = () => false): DeckPlan {
  const { width, height } = map
  const ids = new Set<string>()
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
    const r = map.room(x, z)
    if (r) ids.add(r)
  }
  const rooms = [...ids].map((id): PlanRoom => {
    const inside = (x: number, z: number) => map.room(x, z) === id
    const tiles: Point[] = []
    for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) if (inside(x, z)) tiles.push([x, z])
    return { id, loops: outline(inside, width, height), tiles, label: labelRect((x, z) => inside(x, z) && !skip(id, x, z), width, height) }
  })
  const doors = map.doors.map((d): PlanDoor => {
    const { dx, dz } = DIRS[d.dir]
    return {
      x: d.x + 0.5 + dx / 2,
      z: d.z + 0.5 + dz / 2,
      alongX: dz !== 0,
      locked: map.isLocked(d.x, d.z, d.dir),
      rooms: [map.room(d.x, d.z), map.room(d.x + dx, d.z + dz)],
    }
  })
  return { width, height, rooms, doors, hull: outline((x, z) => map.isFloor(x, z), width, height) }
}

/** La pièce a-t-elle au moins une porte qui s'ouvre ? (Une pièce sans porte du tout est ouverte.) */
export function roomOpen(plan: DeckPlan, room: string): boolean {
  const doors = plan.doors.filter((d) => d.rooms.includes(room))
  return !doors.length || doors.some((d) => !d.locked)
}

/** Chemin SVG (ou Path2D) de contours, après une éventuelle projection. */
export function pathOf(loops: Point[][], project: (p: Point) => Point = (p) => p): string {
  const n = (v: number) => +v.toFixed(2)
  return loops.map((loop) => loop.map((p, i) => {
    const [x, y] = project(p)
    return `${i ? 'L' : 'M'}${n(x)} ${n(y)}`
  }).join('') + 'Z').join('')
}

/**
 * Perspective de la pile des ponts, la même que la vue du jeu : la proue (+x) part en bas à
 * droite, le sud (+z) en bas à gauche. `unit` : largeur d'une tuile à l'écran, le long de x.
 */
export function isoPoint([x, z]: Point, unit: number): Point {
  return [(x - z) * 0.866 * unit, (x + z) * 0.5 * unit]
}

/** Boîte d'un pont de `width` × `height` tuiles vu en perspective : son coin haut-gauche et sa taille. */
export function isoBox(width: number, height: number, unit: number): { x: number; y: number; w: number; h: number } {
  return { x: -height * 0.866 * unit, y: 0, w: (width + height) * 0.866 * unit, h: (width + height) * 0.5 * unit }
}
