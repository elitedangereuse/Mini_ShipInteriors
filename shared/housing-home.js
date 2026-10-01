// Aménagement d'une parcelle des quartiers (housing v2, cf. docs/housing-v2.md), format 2 : ce que
// le joueur y a bâti. Pour l'instant, ses murs ; le sol, le papier peint et le mobilier suivront.
//
// Tous les murs de la parcelle sont des tuiles posées sur les arêtes du quadrillage, comme les
// cloisons des anciens quartiers (même forme : { x, z, e, k? }, cf. cabin-partitions.js) : un mur
// plein, un demi-mur (il arrête les pas, pas la vue), un mur à hublot, ou un mur percé d'une
// porte (les battants des cloisons, et l'arche). Sur le pourtour, un mur remplace le champ de
// force ; une porte ou une arche n'y donnerait que sur le vide.
//
// Le client construit les murs, le relais s'en sert pour la ligne de vue ; le site et le relais
// n'en vérifient que la forme (cf. sanitizeHome), et chaque client écarte ce qu'il ne sait pas
// poser (cf. wallRefusal).

import { DOOR_KINDS, partitionEdge } from './cabin-partitions.js'
import { inPlot, PLOT_ORIGIN, PLOT_SIZES } from './housing-plot.js'

/** Format de l'aménagement d'une parcelle. */
export const HOME_FORMAT = 2

/** Murs au plus : de quoi faire le tour de la plus grande parcelle (120) et la cloisonner. */
export const MAX_HOME_WALLS = 512

/** Pans sans passage : plein (sans `k`), demi-mur, à hublot. */
export const SOLID_KINDS = ['wall', 'half', 'window']

/** Murs percés d'un passage : les portes des cloisons, et l'arche (sans battant). */
export const HOME_DOOR_KINDS = DOOR_KINDS

/** Tous les types, dans l'ordre de l'onglet « Murs ». */
export const HOME_WALL_KINDS = [...SOLID_KINDS, ...HOME_DOOR_KINDS]

const KIND = /^[a-z0-9-]{1,24}$/

/** Bornes des arêtes : celles de la plus grande parcelle, pourtour compris (tuile au nord ou à l'ouest). */
const MAX_SIZE = PLOT_SIZES[PLOT_SIZES.length - 1]
const BOUNDS = { minX: PLOT_ORIGIN.x - 1, maxX: PLOT_ORIGIN.x + MAX_SIZE - 1, minZ: PLOT_ORIGIN.z - 1, maxZ: PLOT_ORIGIN.z + MAX_SIZE - 1 }

/** Le mur laisse-t-il passer (porte, arche) ? */
export const isHomeDoor = (w) => !!w.k && !SOLID_KINDS.includes(w.k)

/** Demi-mur ? */
export const isLow = (w) => w.k === 'half'

/**
 * Murs bien formés ([{ x, z, e, k? }]) : entiers bornés à la plus grande parcelle, arête 'v' ou
 * 'h', type court ('wall' s'écrit sans `k`) ; une arête en double n'est gardée qu'une fois (la
 * dernière), au-delà de MAX_HOME_WALLS le reste est ignoré.
 */
export function sanitizeWalls(raw) {
  if (!Array.isArray(raw)) return []
  const byEdge = new Map()
  for (const w of raw) {
    if (byEdge.size >= MAX_HOME_WALLS) break
    if (!w || typeof w !== 'object') continue
    const { x, z, e, k } = w
    if (!Number.isInteger(x) || !Number.isInteger(z) || (e !== 'v' && e !== 'h')) continue
    if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) continue
    const clean = { x, z, e }
    if (typeof k === 'string' && KIND.test(k) && k !== 'wall') clean.k = k
    const key = `${x},${z},${e}`
    byEdge.delete(key)
    byEdge.set(key, clean)
  }
  return [...byEdge.values()]
}

/**
 * Aménagement d'une parcelle propre à enregistrer et à rediffuser ({ v: 2, walls? }), ou null
 * s'il n'a pas la forme attendue.
 */
export function sanitizeHome(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== HOME_FORMAT) return null
  const home = { v: HOME_FORMAT }
  const walls = sanitizeWalls(raw.walls)
  if (walls.length) home.walls = walls
  return home
}

/**
 * Pourquoi ce mur ne peut pas aller sur cette arête de la parcelle (à ce palier d'agrandissement),
 * ou null s'il le peut : 'outside' (l'arête ne borde pas la parcelle), 'landing' (c'est le mur
 * du palier de l'ascenseur, ou sa porte), 'void' (une porte ou une arche sur le pourtour).
 * @param {import('./ship-map.js').ShipMap} map plan du pont des quartiers, parcelle posée
 */
export function wallRefusal(map, stage, w) {
  const { x, z, nx, nz } = partitionEdge(w)
  const a = inPlot(stage, x, z), b = inPlot(stage, nx, nz)
  if (!a && !b) return 'outside'
  const [ox, oz] = a ? [nx, nz] : [x, z]
  if (a && b) return null
  if (map.isFloor(ox, oz)) return 'landing'
  return isHomeDoor(w) ? 'void' : null
}

/**
 * Pose les murs sur le plan du pont des quartiers (la parcelle déjà posée, cf. applyPlot) : un
 * mur par arête, une porte pour les portes, un mur bas pour les demi-murs. Ceux qui ne vont pas
 * là sont ignorés. Renvoie les murs posés, à retirer avec clearWalls.
 * @param {import('./ship-map.js').ShipMap} map
 */
export function applyWalls(map, walls, stage) {
  const placed = []
  for (const w of walls ?? []) {
    if (wallRefusal(map, stage, w)) continue
    const { x, z, dir } = partitionEdge(w)
    const key = map.edgeKey(x, z, dir)
    map.walls.add(key)
    if (isHomeDoor(w)) map.addDoor(x, z, dir)
    if (isLow(w)) map.low.add(key)
    placed.push(w)
  }
  return placed
}

/** Retire du plan des murs posés par applyWalls. */
export function clearWalls(map, placed) {
  for (const w of placed) {
    const { x, z, dir } = partitionEdge(w)
    const key = map.edgeKey(x, z, dir)
    map.walls.delete(key)
    map.low.delete(key)
    if (isHomeDoor(w)) map.removeDoor(x, z, dir)
  }
}
