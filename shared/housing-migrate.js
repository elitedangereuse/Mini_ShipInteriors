// Migration des anciens quartiers vers la parcelle (housing v2, G2, cf. docs/housing-v2.md) : les
// quartiers du commandant du pont supérieur, leurs pièces d'extension et leurs cloisons deviennent
// une construction posée dans la bulle du joueur, au même dessin. Leurs murs, leurs portes, leur
// papier peint et leur sol deviennent des tuiles (cf. housing-home.js), leurs objets suivent, tels
// quels, décalés d'un bloc. La porte des quartiers, qui donnait au nord sur la coursive, donne
// maintenant sur la parcelle, qu'on rejoint par le palier de l'ascenseur.
//
// Les extensions achetées offrent un agrandissement (décision Q4) : la plus petite parcelle où les
// quartiers et ces extensions tiennent avec leur accès, quelle que soit la forme de leurs pièces
// (cf. stageFromWings). Rien n'est retiré.

import { applyWings, slotOf, WING_ROOMS, WING_SIZE, WING_SLOTS } from './cabin-wings.js'
import { applyPartitions, CABIN_ROOM, partitionKey } from './cabin-partitions.js'
import { CELLS, cellIndex } from './housing-home.js'
import { LEGACY_UPPER_LAYOUT, shipMapOptions } from './ship-layouts.js'
import { PLOT_DOOR, PLOT_ORIGIN, PLOT_SIZES, plotStage } from './housing-plot.js'
import { ShipMap } from './ship-map.js'

/** Emprise des anciens quartiers sans extension (tuiles), sur le pont supérieur. */
const CABIN_BOX = { minX: 8, maxX: 15, minZ: 6, maxZ: 10 }

/**
 * Palier offert par les extensions achetées : le plus petit où les quartiers et ces extensions
 * tiennent avec leur accès, chaque pièce d'extension prise pleine (WING_SIZE de côté), quelle que
 * soit sa forme. Seuls, les quartiers tiennent dans la parcelle de départ ; avec l'extension du
 * milieu, 12 × 12 ; avec celle de gauche ou de droite (le milieu en plus ou non), 15 × 15 ; avec
 * les deux, 20 × 20. Le site applique le même tableau.
 * @param {Iterable<string>} ids extensions achetées ('left', 'middle', 'right')
 */
export function stageFromWings(ids) {
  const box = { ...CABIN_BOX }
  for (const id of ids) {
    const slot = slotOf(id)
    if (!slot) continue
    box.minX = Math.min(box.minX, slot.x0), box.maxX = Math.max(box.maxX, slot.x0 + WING_SIZE - 1)
    box.minZ = Math.min(box.minZ, slot.z0), box.maxZ = Math.max(box.maxZ, slot.z0 + WING_SIZE - 1)
  }
  return migrationPlace(box, 0).stage
}

/**
 * Où poser les anciens quartiers (emprise `box`, en tuiles), et sur quelle parcelle : la plus
 * petite, à partir du palier `stage` (celui des extensions), où ils tiennent avec leur accès.
 * D'abord tels quels : une colonne libre longe le palier, une rangée libre passe au nord devant
 * la porte des quartiers (la rangée du haut de l'emprise), la construction est centrée dans le
 * reste. Sinon, tournés d'un demi-tour (`half`) contre le bord nord, s'ils laissent libre la
 * rangée du palier : leur porte donne alors au sud, sur la bande où arrive l'ascenseur. C'est le
 * cas des quartiers seuls (8 × 5) dans la parcelle de départ (8 × 8).
 * Le demi-tour se fait autour du centre de l'emprise, puis le décalage (dx, dz).
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} box
 */
export function migrationPlace(box, stage) {
  const w = box.maxX - box.minX + 1, h = box.maxZ - box.minZ + 1
  for (let s = plotStage(stage); ; s++) {
    const size = PLOT_SIZES[s]
    if (Math.max(w, h) + 1 <= size || s === PLOT_SIZES.length - 1) {
      const free = size - 1
      const left = PLOT_ORIGIN.x + 1 + Math.max(0, Math.floor((free - w) / 2))
      const top = PLOT_ORIGIN.z + 1 + Math.max(0, Math.floor((free - h) / 2))
      return { dx: left - box.minX, dz: top - box.minZ, stage: s, half: false }
    }
    if (w <= size && h <= PLOT_DOOR.z - PLOT_ORIGIN.z) {
      const left = PLOT_ORIGIN.x + Math.floor((size - w) / 2)
      return { dx: left - box.minX, dz: PLOT_ORIGIN.z - box.minZ, stage: s, half: true }
    }
  }
}

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
  const map = new ShipMap(LEGACY_UPPER_LAYOUT, shipMapOptions(1))
  applyWings(map, wings)
  const letters = new Set([CABIN_ROOM, ...owned.map((s) => WING_ROOMS[s.id]).join('')])
  const partitions = applyPartitions(map, layout.partitions ?? [], (room) => letters.has(room))
  const kinds = new Map(partitions.map((p) => [partitionKey(p), p.k]))
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      if (!letters.has(map.room(x, z) ?? '')) continue
      box.minX = Math.min(box.minX, x), box.maxX = Math.max(box.maxX, x)
      box.minZ = Math.min(box.minZ, z), box.maxZ = Math.max(box.maxZ, z)
    }
  }
  const { dx, dz, stage, half } = migrationPlace(box, stageFromWings(owned.map((s) => s.id)))
  // Une tuile, un point et un bord des anciens quartiers, une fois posés (cf. migrationPlace).
  const sx = box.minX + box.maxX, sz = box.minZ + box.maxZ
  const at = (x, z) => (half ? { x: sx - x + dx, z: sz - z + dz } : { x: x + dx, z: z + dz })
  const turn = (dir) => (half ? (dir + 2) % 4 : dir)

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
      const t = at(x, z)
      if (f.floor) floor[cellIndex(t.x, t.z)] = { style: f.floor.style, color: f.floor.color }
      for (let dir = 0; dir < 4; dir++) {
        const kind = map.edge(x, z, dir)
        if (kind === 'open') continue
        const old = edgeOf(x, z, dir)
        const { wall, side } = edgeOf(t.x, t.z, turn(dir))
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
  const entry = at(CABIN_DOOR.x, CABIN_DOOR.z)
  const door = edgeOf(entry.x, entry.z, turn(CABIN_DOOR.dir)).wall
  walls.get(partitionKey(door)).k ??= 'sliding'

  const items = layout.items.map((it) => {
    const p = at(it.x, it.z)
    return { ...it, x: Math.round(p.x * 1000) / 1000, z: Math.round(p.z * 1000) / 1000, r: half ? (it.r + 2) % 4 : it.r }
  })
  // Contre le palier, c'est son mur qui tient lieu de celui des quartiers (cf. applyWalls) ; on
  // garde le leur, qui revient si on les éloigne (cf. moveBlock).
  return { walls: [...walls.values()], floor, items, ...(stage ? { stage } : {}) }
}
