// Migration des anciens quartiers vers la parcelle (housing v2, G2, cf. docs/housing-v2.md) : les
// quartiers du commandant du pont supérieur, leurs pièces d'extension et leurs cloisons deviennent
// une construction posée dans la bulle du joueur, au même dessin. Leurs murs, leurs portes, leur
// papier peint et leur sol deviennent des tuiles (cf. housing-home.js), leurs objets suivent, tels
// quels, décalés d'un bloc. La porte des quartiers, qui donnait au nord sur la coursive, donne
// maintenant sur la parcelle, qu'on rejoint par le palier de l'ascenseur.
//
// Les extensions achetées offrent les agrandissements (décision Q4) : une, le premier ; deux ou
// trois, les deux. La construction tient alors toujours dans la parcelle.

import { applyWings, WING_ROOMS, WING_SLOTS } from './cabin-wings.js'
import { applyPartitions, CABIN_ROOM, partitionKey } from './cabin-partitions.js'
import { CELLS, cellIndex } from './housing-home.js'
import { SHIP_LAYOUTS, shipMapOptions } from './ship-layouts.js'
import { ShipMap } from './ship-map.js'

/** Palier d'agrandissement offert par les extensions achetées : une → 1, deux ou trois → 2. */
export const stageFromWings = (count) => (count >= 2 ? 2 : count >= 1 ? 1 : 0)

/**
 * Décalage des anciens quartiers dans la parcelle : sans extension, au milieu de la parcelle de
 * départ ; avec, assez loin à l'est pour que l'extension de gauche tienne. Dans les deux cas, un
 * couloir libre longe le palier et mène à la porte, au nord.
 */
export const migrationOffset = (wings) => ({ dx: wings ? 10 : 5, dz: -3 })

/** Porte des quartiers sur la coursive (tuile des quartiers, et bord nord). */
const CABIN_DOOR = { x: 11, z: 6, dir: 0 }

/**
 * Arête d'un bord de tuile, écrite comme un mur de parcelle (tuile au nord ou à l'ouest, cf.
 * partitionEdge), et le côté de ce mur tourné vers la tuile.
 */
function edgeOf(x, z, dir) {
  if (dir === 1) return { wall: { x, z, e: 'v' }, side: 'a' }
  if (dir === 2) return { wall: { x, z, e: 'h' }, side: 'a' }
  if (dir === 3) return { wall: { x: x - 1, z, e: 'v' }, side: 'b' }
  return { wall: { x, z: z - 1, e: 'h' }, side: 'b' }
}

/**
 * Plan de parcelle (cf. unpackHome) des anciens quartiers `layout` (format 1, déjà lu : objets,
 * revêtements, extensions, cloisons). Les murs sont pleins (les hublots étaient tirés au hasard),
 * les portes sont celles du vaisseau, sauf celles des cloisons, qui gardent leur battant.
 * @param {{ items: object[], wall?: object, floor?: object, wings?: Record<string, { shape: string, wall?: object, floor?: object }>, partitions?: object[] }} layout
 */
export function migrateCabin(layout) {
  const wings = layout.wings ?? {}
  const owned = WING_SLOTS.filter((s) => wings[s.id])
  const map = new ShipMap(SHIP_LAYOUTS['1'], shipMapOptions(1))
  applyWings(map, wings)
  const letters = new Set([CABIN_ROOM, ...owned.map((s) => WING_ROOMS[s.id]).join('')])
  const partitions = applyPartitions(map, layout.partitions ?? [], (room) => letters.has(room))
  const kinds = new Map(partitions.map((p) => [partitionKey(p), p.k]))
  const { dx, dz } = migrationOffset(owned.length > 0)

  /** Revêtements de la pièce d'une lettre : les quartiers, ou la pièce d'une extension. */
  const finishes = (room) => {
    if (room === CABIN_ROOM) return { wall: layout.wall, floor: layout.floor }
    const slot = owned.find((s) => WING_ROOMS[s.id].includes(room))
    return slot ? { wall: wings[slot.id].wall, floor: wings[slot.id].floor } : {}
  }

  const walls = new Map()
  const floor = Array(CELLS).fill(null)
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      const room = map.room(x, z)
      if (!room || !letters.has(room)) continue
      const f = finishes(room)
      if (f.floor) floor[cellIndex(x + dx, z + dz)] = { style: f.floor.style, color: f.floor.color }
      for (let dir = 0; dir < 4; dir++) {
        const kind = map.edge(x, z, dir)
        if (kind === 'open') continue
        const old = edgeOf(x, z, dir)
        const { wall, side } = edgeOf(x + dx, z + dz, dir)
        const key = partitionKey(wall)
        let w = walls.get(key)
        if (!w) {
          w = { ...wall }
          if (kind === 'door') w.k = kinds.get(partitionKey(old.wall)) ?? 'sliding'
          else if (kinds.get(partitionKey(old.wall)) === 'window') w.k = 'window'
          walls.set(key, w)
        }
        if (f.wall) w[side] = { style: f.wall.style, color: f.wall.color }
      }
    }
  }
  // La porte des quartiers, qui donnait sur la coursive : coulissante, comme toutes celles du vaisseau.
  const door = edgeOf(CABIN_DOOR.x + dx, CABIN_DOOR.z + dz, CABIN_DOOR.dir).wall
  walls.get(partitionKey(door)).k ??= 'sliding'

  const items = layout.items.map((it) => ({ ...it, x: Math.round((it.x + dx) * 1000) / 1000, z: Math.round((it.z + dz) * 1000) / 1000 }))
  const stage = stageFromWings(owned.length)
  return { walls: [...walls.values()], floor, items, ...(stage ? { stage } : {}) }
}
