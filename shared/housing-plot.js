// Parcelle des quartiers (housing v2, cf. docs/housing-v2.md) : sur le pont des quartiers, au-dessus
// du pont supérieur, chaque joueur a sa bulle, une parcelle carrée bordée d'un champ de force, où il
// bâtit ce qu'il veut. On y entre par le palier de l'ascenseur, à l'ouest. La parcelle grandit vers
// l'est et vers le sud depuis son coin nord-ouest (fixe), si bien qu'un agrandissement ne déplace
// rien de ce qui y est posé. Le client la construit, le relais s'en sert pour la ligne de vue.

import { DIRS } from './ship-map.js'

/** Pont des quartiers (cf. `bubble` dans src/levels.ts). */
export const HOUSING_LEVEL = 2

/** Lettre de la parcelle sur le plan du pont, et celle du palier de l'ascenseur. */
export const PLOT_ROOM = 'q'
export const LANDING_ROOM = 'a'

/** Côté de la parcelle, en tuiles : au départ, puis après chacun des trois agrandissements. */
export const PLOT_SIZES = [8, 12, 15, 20]

/** Coin nord-ouest de la parcelle : la tuile qui touche la porte du palier. */
export const PLOT_ORIGIN = { x: 12, z: 0 }

/** Porte du palier vers la parcelle (tuile du palier et bord, cf. ShipMap.addDoor). */
export const PLOT_DOOR = { x: 11, z: 5, dir: 1 }

/** Palier d'agrandissement borné (0 : la parcelle de départ). */
export const plotStage = (stage) => (Number.isInteger(stage) ? Math.max(0, Math.min(PLOT_SIZES.length - 1, stage)) : 0)

/** Côté de la parcelle à ce palier d'agrandissement. */
export const plotSize = (stage) => PLOT_SIZES[plotStage(stage)]

/** Tuiles de la parcelle (bornes comprises). */
export function plotRect(stage) {
  const size = plotSize(stage)
  return { minX: PLOT_ORIGIN.x, minZ: PLOT_ORIGIN.z, maxX: PLOT_ORIGIN.x + size - 1, maxZ: PLOT_ORIGIN.z + size - 1 }
}

/** La tuile (x, z) est-elle dans la parcelle à ce palier ? */
export function inPlot(stage, x, z) {
  const r = plotRect(stage)
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ
}

/**
 * Pose la parcelle sur le plan du pont des quartiers : ses tuiles (celles d'une parcelle plus
 * grande, posée avant, retournent au vide), et renvoie son plan : ses tuiles, et les arêtes de son
 * pourtour qui donnent sur le vide (le champ de force). Le palier garde ses murs.
 * @param {import('./ship-map.js').ShipMap} map
 * @param {number} stage palier d'agrandissement
 */
export function applyPlot(map, stage) {
  const all = plotRect(PLOT_SIZES.length - 1)
  for (let z = all.minZ; z <= all.maxZ; z++) {
    for (let x = all.minX; x <= all.maxX; x++) if (map.room(x, z) === PLOT_ROOM) map.setRoom(x, z, null)
  }
  const r = plotRect(stage)
  const tiles = []
  for (let z = r.minZ; z <= r.maxZ; z++) {
    for (let x = r.minX; x <= r.maxX; x++) {
      map.setRoom(x, z, PLOT_ROOM)
      tiles.push({ x, z })
    }
  }
  const field = []
  for (const t of tiles) {
    for (let dir = 0; dir < 4; dir++) {
      const d = DIRS[dir]
      if (!map.isFloor(t.x + d.dx, t.z + d.dz)) field.push({ x: t.x, z: t.z, dir })
    }
  }
  return { stage: plotStage(stage), rect: r, tiles, field }
}

/**
 * Arêtes (tuile et bord) regroupées en pans droits et continus : un par côté de la parcelle tant
 * que rien ne l'interrompt. Chaque pan : son bord (`dir`) et ses arêtes, dans l'ordre.
 * @param {{ x: number, z: number, dir: number }[]} edges
 */
export function straightRuns(edges) {
  const lines = new Map()
  for (const e of edges) {
    const alongX = DIRS[e.dir].dz !== 0
    const key = `${e.dir}:${alongX ? e.z : e.x}`
    if (!lines.has(key)) lines.set(key, [])
    lines.get(key).push(e)
  }
  const runs = []
  for (const line of lines.values()) {
    const alongX = DIRS[line[0].dir].dz !== 0
    const pos = (e) => (alongX ? e.x : e.z)
    line.sort((a, b) => pos(a) - pos(b))
    let run = [line[0]]
    for (const e of line.slice(1)) {
      if (pos(e) === pos(run[run.length - 1]) + 1) run.push(e)
      else runs.push({ dir: run[0].dir, edges: run }), (run = [e])
    }
    runs.push({ dir: run[0].dir, edges: run })
  }
  return runs
}
