// Cloisons des quartiers : des murs et des portes que le CMDR pose lui-même sur les arêtes du
// quadrillage, pour découper ses quartiers (ou une pièce d'extension) en plusieurs pièces. Une
// cloison est posée entre deux tuiles d'une même pièce ; le plan du pont la connaît comme un mur
// intérieur (ShipMap.walls), et une porte comme une porte. Le client la construit, le relais s'en
// sert pour la ligne de vue ; le site et le relais n'en vérifient que la forme.

import { WING_ROOMS } from './cabin-wings.js'
import { DIRS } from './ship-map.js'

/** Lettre des quartiers du commandant sur le plan du pont supérieur (cf. `cabin` dans src/levels.ts). */
export const CABIN_ROOM = 'p'

/** Pièce où l'on peut poser une cloison : les quartiers, ou une pièce d'extension. */
export const partitionRoom = (room) => room === CABIN_ROOM || Object.values(WING_ROOMS).join('').includes(room)

/** Cloisons au plus, pour toute la cabine (quartiers et extensions). */
export const MAX_PARTITIONS = 48

/** Modèles de portes (cf. src/cabin/partitions.ts) ; une porte inconnue devient coulissante. */
export const DOOR_KINDS = ['sliding', 'wood', 'saloon', 'airlock', 'shoji', 'glass', 'beads', 'arch']

/** Pans de mur : plein, ou percé d'un hublot. */
export const WALL_KINDS = ['wall', 'window']

const KIND = /^[a-z0-9-]{1,24}$/

/**
 * Arête d'une cloison : la tuile (x, z) et sa voisine à l'est (e = 'v', arête verticale) ou au
 * sud (e = 'h', arête horizontale) ; `dir` : direction de la voisine vue de la tuile (cf. DIRS).
 * @param {{ x: number, z: number, e: 'v' | 'h' }} p
 */
export function partitionEdge(p) {
  const dir = p.e === 'v' ? 1 : 2
  return { x: p.x, z: p.z, dir, nx: p.x + DIRS[dir].dx, nz: p.z + DIRS[dir].dz }
}

/** Clé d'une cloison : son arête (deux cloisons ne partagent jamais une arête). */
export const partitionKey = (p) => `${p.x},${p.z},${p.e}`

/**
 * Cloisons bien formées ([{ x, z, e, k? }]), ou null : entiers bornés (le pont supérieur), arête
 * 'v' ou 'h', modèle court ; une arête en double n'est gardée qu'une fois, au-delà de
 * MAX_PARTITIONS le reste est ignoré. `k` : modèle (mur à hublot, porte…), absent pour un mur.
 */
export function sanitizePartitions(raw) {
  if (!Array.isArray(raw)) return null
  const out = []
  const seen = new Set()
  for (const p of raw) {
    if (out.length >= MAX_PARTITIONS) break
    if (!p || typeof p !== 'object') continue
    const { x, z, e, k } = p
    if (!Number.isInteger(x) || !Number.isInteger(z) || x < 0 || z < 0 || x > 60 || z > 30 || (e !== 'v' && e !== 'h')) continue
    const key = `${x},${z},${e}`
    if (seen.has(key)) continue
    seen.add(key)
    const clean = { x, z, e }
    if (typeof k === 'string' && KIND.test(k) && k !== 'wall') clean.k = k
    out.push(clean)
  }
  return out.length ? out : null
}

/** Porte (et non pan de mur) ? */
export const isDoor = (p) => !!p.k && !WALL_KINDS.includes(p.k)

/**
 * Pose les cloisons sur le plan : un mur intérieur par arête, et une porte pour les portes. Une
 * cloison ne se pose qu'entre deux tuiles d'une même pièce, sur une arête encore ouverte (sinon
 * elle est ignorée). Renvoie les cloisons posées, à retirer avec clearPartitions.
 * @param {import('./ship-map.js').ShipMap} map
 * @param {{ x: number, z: number, e: 'v' | 'h', k?: string }[] | undefined} partitions
 * @param {(room: string) => boolean} [allowed] pièces où l'on peut en poser (par défaut : les quartiers et leurs extensions)
 */
export function applyPartitions(map, partitions, allowed = partitionRoom) {
  const placed = []
  for (const p of partitions ?? []) {
    const { x, z, dir } = partitionEdge(p)
    const room = map.room(x, z)
    if (!room || !allowed(room) || map.edge(x, z, dir) !== 'open') continue
    map.walls.add(map.edgeKey(x, z, dir))
    if (isDoor(p)) map.addDoor(x, z, dir)
    placed.push(p)
  }
  return placed
}

/** Retire du plan des cloisons posées par applyPartitions. */
export function clearPartitions(map, placed) {
  for (const p of placed) {
    const { x, z, dir } = partitionEdge(p)
    map.walls.delete(map.edgeKey(x, z, dir))
    if (isDoor(p)) map.removeDoor(x, z, dir)
  }
}
