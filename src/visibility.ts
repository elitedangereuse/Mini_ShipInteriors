import type { ShipMap } from './map'

/*
 * Ce que l'on voit d'un pont en vue subjective, pièce par pièce. Les murs y montent jusqu'au
 * plafond : d'une pièce, on ne voit que la sienne, et ce que laissent voir ses portes, ses cloisons
 * vitrées et ses fenêtres. Le reste du pont n'a pas à être dessiné (cf. Deck.cull).
 *
 * Le calcul se fait sur le plan (cf. shared/ship-map.js) : des rayons partent de l'œil, dans le
 * champ de la caméra, et avancent de tuile en tuile jusqu'au premier mur plein. Une pièce se voit
 * dès qu'un rayon y entre. Tout penche du côté prudent, et l'on dessine en trop plutôt qu'en
 * moins : une porte, même fermée ou verrouillée, laisse passer le regard sur toute sa tuile (ses
 * battants ont des hublots).
 *
 * La géométrie immobile du pont est fusionnée (cf. merge.ts) : chaque objet y est rangé dans une
 * « cellule », l'ensemble des pièces que touche son encombrement au sol. Un mur mitoyen est dans la
 * cellule de ses deux pièces : il se dessine dès que l'une d'elles se voit.
 *
 * Par une verrière, on voit aussi le vaisseau du dehors : les murs extérieurs des autres pièces,
 * pas ce qu'elles contiennent. Ce qui touche le vide autour du pont est donc rangé à part, dans la
 * « façade » de sa pièce, qui se dessine quand on voit la pièce ou seulement son mur extérieur. Les
 * façades qui bordent le vide que l'on regarde se dessinent aussi : leur ombre tombe sur la coque.
 */

/** Écart entre deux rayons (radians) : un quart de degré, soit quelques pixels d'écran. */
const STEP = Math.PI / 720
/**
 * Marge ajoutée à l'encombrement d'un objet : ce qui arrive au bord d'une pièce est aussi de la
 * pièce voisine. On aperçoit la dalle d'à côté sous un mur, et le bout d'un mur au coin d'une serre,
 * derrière ses montants fins. Un meuble adossé au mur, lui, reste à sa pièce.
 */
const REACH = 0.1
/** Au-delà de cette taille (tuiles), ou de ce nombre de pièces, un objet est toujours dessiné : la coque, un sol d'un seul tenant. */
const SPAN = 8
const MANY = 6

const CLEAR = 0
const SOLID = 1

/** Un œil : sa position sur le plan, l'azimut de son regard (atan2(x, z) de sa direction) et le demi-angle de son champ (π : tout autour). */
export interface Eye {
  x: number
  z: number
  toward: number
  half: number
}

export class RoomSight {
  /** Nombre de pièces, plus une : l'index 0 est le vide autour du pont. La façade de la pièce `r` a l'index `count + r`. */
  readonly count: number
  /** Emprise de chaque pièce (par index), en tuiles. */
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number }[] = []
  private readonly index = new Map<string, number>()
  /** Le plan, entouré d'une tuile de vide : pièce de chaque tuile, arêtes à l'est et au sud de chacune. */
  private readonly cols: number
  private readonly room: Uint8Array
  private readonly east: Uint8Array
  private readonly south: Uint8Array
  /** Par tuile de vide, les pièces qui la bordent (coins compris). */
  private readonly beside: (number[] | undefined)[] = []
  /** Pièces de chaque cellule ; la cellule 0 n'en a pas : elle est toujours dessinée. */
  private readonly cells: number[][] = [[]]
  private readonly cellIds = new Map<string, number>()
  private readonly pierced: { edges: Uint8Array; tile: number }[] = []

  constructor(private readonly map: ShipMap) {
    this.cols = map.width + 2
    const tiles = this.cols * (map.height + 2)
    this.room = new Uint8Array(tiles)
    this.east = new Uint8Array(tiles)
    this.south = new Uint8Array(tiles)
    this.bounds.push({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 })
    for (let z = 0; z < map.height; z++) {
      for (let x = 0; x < map.width; x++) {
        const letter = map.room(x, z)
        if (!letter) continue
        let i = this.index.get(letter)
        if (i === undefined) {
          this.index.set(letter, (i = this.bounds.length))
          this.bounds.push({ minX: x, maxX: x, minZ: z, maxZ: z })
        }
        const b = this.bounds[i]
        b.minX = Math.min(b.minX, x)
        b.maxX = Math.max(b.maxX, x)
        b.minZ = Math.min(b.minZ, z)
        b.maxZ = Math.max(b.maxZ, z)
        this.room[this.tile(x, z)] = i
      }
    }
    this.count = this.bounds.length
    for (let z = -1; z <= map.height; z++) {
      for (let x = -1; x <= map.width; x++) {
        if (map.room(x, z)) continue
        const rooms: number[] = []
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const r = this.roomIndex(map.room(x + dx, z + dz))
          if (r && !rooms.includes(r)) rooms.push(r)
        }
        if (rooms.length) this.beside[this.tile(x, z)] = rooms
      }
    }
  }

  private tile(x: number, z: number): number {
    return (z + 1) * this.cols + x + 1
  }

  /** Index d'une pièce (0 : aucune). */
  roomIndex(letter: string | null): number {
    return (letter && this.index.get(letter)) || 0
  }

  /**
   * Relève les arêtes du plan, une fois les murs du pont bâtis.
   * @param clear arête murée à travers laquelle on voit (vitrage, fenêtre, champ de force, garde-corps)
   */
  setEdges(clear: (key: string) => boolean) {
    const { map } = this
    const doors = new Set(map.doors.map((d) => map.edgeKey(d.x, d.z, d.dir)))
    for (let z = -1; z <= map.height; z++) {
      for (let x = -1; x <= map.width; x++) {
        for (const [edges, dx, dz, dir] of [[this.east, 1, 0, 1], [this.south, 0, 1, 2]] as const) {
          const a = map.room(x, z), b = map.room(x + dx, z + dz)
          let kind = CLEAR
          if (a || b) {
            const key = map.edgeKey(x, z, dir)
            if (!doors.has(key) && (a !== b || map.walls.has(key))) kind = clear(key) || map.low.has(key) ? CLEAR : SOLID
          }
          edges[this.tile(x, z)] = kind
        }
      }
    }
  }

  /**
   * Perce une arête jusqu'à `mend` : un mur tramé parce qu'il cache le personnage (cf. merge.ts)
   * laisse voir ce qu'il y a derrière lui.
   */
  pierce(x: number, z: number, dir: number) {
    // L'arête est rangée avec la tuile de l'ouest (ou du nord) de ses deux tuiles.
    const edges = dir % 2 ? this.east : this.south
    const tile = this.tile(dir === 3 ? x - 1 : x, dir === 0 ? z - 1 : z)
    if (edges[tile] === CLEAR) return
    this.pierced.push({ edges, tile })
    edges[tile] = CLEAR
  }

  /** Referme les arêtes percées. */
  mend() {
    for (const p of this.pierced) p.edges[p.tile] = SOLID
    this.pierced.length = 0
  }

  /**
   * Cellule d'un objet immobile, d'après son encombrement au sol (coordonnées du pont) : les pièces
   * qu'il touche. 0 : il n'est dans aucune pièce, ou il en couvre trop, et se dessine toujours.
   */
  cellOf(minX: number, maxX: number, minZ: number, maxZ: number): number {
    // Un encombrement vide (infini, à l'envers) ne passe pas ce test.
    if (!(minX <= maxX && minZ <= maxZ && maxX - minX <= SPAN && maxZ - minZ <= SPAN)) return 0
    const rooms: number[] = []
    let outside = false
    const x0 = Math.max(-1, Math.round(minX - REACH)), x1 = Math.min(this.map.width, Math.round(maxX + REACH))
    const z0 = Math.max(-1, Math.round(minZ - REACH)), z1 = Math.min(this.map.height, Math.round(maxZ + REACH))
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const r = this.room[this.tile(x, z)]
        if (!r) outside = true
        else if (!rooms.includes(r)) rooms.push(r)
      }
    }
    if (!rooms.length || rooms.length > MANY) return 0
    // Au bord du pont : c'est de la façade de ces pièces.
    if (outside) for (let i = 0; i < rooms.length; i++) rooms[i] += this.count
    const key = rooms.sort((a, b) => a - b).join()
    let id = this.cellIds.get(key)
    if (id === undefined) {
      this.cellIds.set(key, (id = this.cells.length))
      this.cells.push(rooms)
    }
    return id
  }

  /** Nombre de cellules relevées jusqu'ici. */
  get cellCount(): number {
    return this.cells.length
  }

  /** Cellules à dessiner, d'après les pièces vues (dont on voit alors aussi la façade). */
  cellsSeen(seen: Uint8Array, out: Uint8Array) {
    for (let r = 1; r < this.count; r++) if (seen[r]) seen[this.count + r] = 1
    out[0] = 1
    for (let c = 1; c < this.cells.length; c++) {
      let any = 0
      for (const r of this.cells[c]) if (seen[r]) any = 1
      out[c] = any
    }
  }

  /**
   * Marque dans `seen` (par index de pièce, ou de façade) ce que voit un œil.
   * @returns faux s'il n'est dans aucune pièce (dans un mur, hors du pont) : rien n'est marqué
   */
  look(seen: Uint8Array, eye: Eye): boolean {
    const { map, room, east, south } = this
    const tx = Math.round(eye.x), tz = Math.round(eye.z)
    if (tx < 0 || tx >= map.width || tz < 0 || tz >= map.height) return false
    const here = room[this.tile(tx, tz)]
    if (!here) return false
    seen[here] = 1
    const around = eye.half >= Math.PI
    const span = around ? 2 * Math.PI : 2 * eye.half
    const rays = Math.ceil(span / STEP)
    for (let i = around ? 1 : 0; i <= rays; i++) {
      const angle = eye.toward - span / 2 + (span * i) / rays
      const dx = Math.sin(angle), dz = Math.cos(angle)
      const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1
      const stepX = dx ? 1 / Math.abs(dx) : Infinity, stepZ = dz ? 1 / Math.abs(dz) : Infinity
      // Distance, le long du rayon, de la prochaine arête franchie sur chaque axe.
      let nextX = dx ? (tx + sx * 0.5 - eye.x) / dx : Infinity
      let nextZ = dz ? (tz + sz * 0.5 - eye.z) / dz : Infinity
      let x = tx, z = tz
      for (;;) {
        let nx = x, nz = z, edge: number
        if (nextX < nextZ) {
          nx += sx
          if (nx < -1 || nx > map.width) break
          edge = east[this.tile(sx > 0 ? x : nx, z)]
          nextX += stepX
        } else {
          nz += sz
          if (nz < -1 || nz > map.height) break
          edge = south[this.tile(x, sz > 0 ? z : nz)]
          nextZ += stepZ
        }
        const next = room[this.tile(nx, nz)]
        if (edge === SOLID) {
          // Du dehors (par une verrière, d'une aile du vaisseau à l'autre), on voit le mur extérieur de la pièce.
          if (next && !room[this.tile(x, z)]) seen[this.count + next] = 1
          break
        }
        x = nx
        z = nz
        if (next) seen[next] = 1
        else {
          const rooms = this.beside[this.tile(x, z)]
          if (rooms) for (const r of rooms) seen[this.count + r] = 1
        }
      }
    }
    return true
  }
}
