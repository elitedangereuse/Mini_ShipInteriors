import type { Deck } from '../deck'
import { DIRS } from '../map'
import { overlapsAny } from '../physics'
import type { Spot } from './data'

/*
 * Où poser une tâche de bord : ses emplacements (economy.json) sont notés à la main, et les ponts
 * changent sous eux (un meuble, un comptoir, un mur déplacés). Avant d'apparaître, une tâche
 * vérifie sa place : au sol, dans une pièce ouverte, à l'écart des murs, des meubles et des
 * portes ; au mur, sur un pan lisse (ni porte, ni hublot, ni pilier) que rien ne masque. Sinon,
 * elle glisse à la place libre la plus proche, dans la même pièce ; faute de place, elle
 * n'apparaît pas. Le calcul ne dépend que du plan du pont : la même place chez tous.
 */

/** Rayon d'une tâche au sol (ordures, flaque, conteneurs…). */
const FLOOR_R = 0.26
/** Marge devant une porte : le passage reste libre. */
const DOOR_CLEAR = 0.75
/** Objets sans collision, posés à plat : une tâche peut les recouvrir. */
const FLOOR_COVERS = new Set(['rug', 'rug-round', 'works-tape', 'stain', 'cables', 'hazard-floor'])
/** Rayon autour d'un objet sans collision (affiche, hologramme, projecteur) qu'une tâche évite. */
const PROP_CLEAR = 0.38

/** Place retenue : au sol (x, z), ou tuile du mur (x, z, dans la direction `wall`). */
export interface TaskPlace {
  x: number
  z: number
  /** Côté du mur, pour une tâche murale (il peut changer si elle glisse sur un autre pan). */
  wall?: 0 | 1 | 2 | 3
  /** La place diffère de celle d'economy.json. */
  moved: boolean
}

/** Place d'une tâche sur son pont, ou null si aucune ne convient. */
export function placeTask(deck: Deck, spot: Spot): TaskPlace | null {
  if (spot.y !== undefined) return onFurniture(deck, spot) ? { x: spot.x, z: spot.z, moved: false } : null
  return spot.wall !== undefined ? placeOnWall(deck, spot, spot.wall) : placeOnFloor(deck, spot)
}

/**
 * Pièce où une tâche peut vivre : ni vide, ni en travaux, ni dans les quartiers (instanciés), ni
 * en hauteur (la mezzanine et ses escaliers : elle s'y poserait au sol, sous le plancher).
 */
function openRoom(deck: Deck, x: number, z: number): string | null {
  const room = deck.map.room(Math.round(x), Math.round(z))
  if (!room || deck.def.closed?.[room] !== undefined) return null
  if (deck.cabin?.contains(x, z) || deck.raised(x, z)) return null
  return room
}

/** Objets sans collision qui ne se recouvrent pas (affiches, hologrammes…). */
function airyProps(deck: Deck) {
  return deck.def.props.filter((p) => p.solid === false && !FLOOR_COVERS.has(p.model))
}

function nearDoor(deck: Deck, x: number, z: number, clear: number): boolean {
  return deck.map.doors.some((d) => Math.hypot(d.x + DIRS[d.dir].dx * 0.5 - x, d.z + DIRS[d.dir].dz * 0.5 - z) < clear)
}

/** Vaisselle et autres tâches posées sur un meuble : le meuble est-il toujours là ? */
function onFurniture(deck: Deck, spot: Spot): boolean {
  return !!openRoom(deck, spot.x, spot.z) && deck.colliders.some((b) => spot.x > b.minX && spot.x < b.maxX && spot.z > b.minZ && spot.z < b.maxZ)
}

function floorFree(deck: Deck, room: string, x: number, z: number): boolean {
  if (openRoom(deck, x, z) !== room) return false
  // Tout le disque dans la pièce (pas à cheval sur une autre, par une porte).
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (deck.map.room(Math.round(x + dx * FLOOR_R), Math.round(z + dz * FLOOR_R)) !== room) return false
  }
  if (overlapsAny({ x, z }, FLOOR_R, deck.colliders)) return false
  if (nearDoor(deck, x, z, DOOR_CLEAR)) return false
  return !airyProps(deck).some((p) => Math.hypot(p.x - x, p.z - z) < PROP_CLEAR + FLOOR_R)
}

function placeOnFloor(deck: Deck, spot: Spot): TaskPlace | null {
  const room = openRoom(deck, spot.x, spot.z)
  if (!room) return null
  if (floorFree(deck, room, spot.x, spot.z)) return { x: spot.x, z: spot.z, moved: false }
  // En spirale autour de la place prévue : la plus proche qui convient.
  for (let r = 0.1; r <= 2.5; r += 0.1) {
    const steps = Math.max(8, Math.round(r * 24))
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2
      const x = Math.round((spot.x + Math.cos(a) * r) * 100) / 100
      const z = Math.round((spot.z + Math.sin(a) * r) * 100) / 100
      if (floorFree(deck, room, x, z)) return { x, z, moved: true }
    }
  }
  return null
}

/** Pan de mur de la tuile (x, z) dans la direction `dir` : lisse, et dégagé devant. */
function wallFree(deck: Deck, room: string, x: number, z: number, dir: number): boolean {
  if (openRoom(deck, x, z) !== room || deck.map.edge(x, z, dir) !== 'wall') return false
  const d = DIRS[dir]
  const cx = x + d.dx * 0.5, cz = z + d.dz * 0.5
  const seg = deck.walls.find((w) => Math.abs(w.x - cx) < 1e-6 && Math.abs(w.z - cz) < 1e-6)
  if (seg?.model !== 'wall') return false
  // Devant le pan (entre 0,2 et 0,6 du mur), sur sa largeur : ni meuble, ni comptoir.
  const along = { dx: Math.abs(d.dz), dz: Math.abs(d.dx) }
  for (const s of [-0.18, 0, 0.18]) {
    const p = { x: x + d.dx * 0.1 + along.dx * s, z: z + d.dz * 0.1 + along.dz * s }
    if (overlapsAny(p, 0.2, deck.colliders)) return false
  }
  // Ni affiche, ni applique, ni tableau accrochés là.
  return !airyProps(deck).some((p) => Math.hypot(p.x - cx, p.z - cz) < 0.6)
}

function placeOnWall(deck: Deck, spot: Spot, dir: 0 | 1 | 2 | 3): TaskPlace | null {
  const room = openRoom(deck, spot.x, spot.z)
  if (!room) return null
  if (wallFree(deck, room, spot.x, spot.z, dir)) return { x: spot.x, z: spot.z, wall: dir, moved: false }
  // Un autre pan de la pièce, du même côté d'abord (le décor est fait pour ce mur-là), puis les autres.
  const tiles: { x: number; z: number; dir: 0 | 1 | 2 | 3; cost: number }[] = []
  for (let z = 0; z < deck.map.height; z++) {
    for (let x = 0; x < deck.map.width; x++) {
      if (deck.map.room(x, z) !== room) continue
      for (const w of [0, 1, 2, 3] as const) tiles.push({ x, z, dir: w, cost: Math.hypot(x - spot.x, z - spot.z) + (w === dir ? 0 : 100) })
    }
  }
  tiles.sort((a, b) => a.cost - b.cost)
  for (const t of tiles) if (wallFree(deck, room, t.x, t.z, t.dir)) return { x: t.x, z: t.z, wall: t.dir, moved: true }
  return null
}
