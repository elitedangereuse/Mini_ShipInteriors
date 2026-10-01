// Aménagement d'une parcelle des quartiers (housing v2, cf. docs/housing-v2.md), format 2 : ce que
// le joueur y a bâti. Ses murs, le papier peint de chacune de leurs faces, et le revêtement de
// chaque case du sol ; le mobilier suivra.
//
//   { v: 2,
//     open?: true,                              // quartiers ouverts : on y entre sans invitation
//     walls?: [{ x, z, e, k?, a?, b? }],        // a, b : papier peint des deux faces (index dans papers)
//     papers?: [{ style, color }],              // 16 au plus
//     floor?: { palette: [{ style, color }],    // 16 au plus
//               cells: 'a12.18b3…' } }          // une lettre par case (cf. encodeCells), '.' : dalle nue
//
// La face `a` d'un mur est tournée vers sa tuile (x, z), au nord ou à l'ouest de l'arête ; la face
// `b` vers la voisine (à l'est pour 'v', au sud pour 'h').
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

/** Revêtements au plus dans chaque palette (sol, papier peint) : une lettre chacun. */
export const MAX_FINISHES = 16
const LETTERS = 'abcdefghijklmnop'
/** Case sans revêtement : la dalle du vaisseau. */
const BARE = '.'
/** Côté de la grille des cases (celle de la plus grande parcelle), et nombre de cases. */
export const GRID = MAX_SIZE
export const CELLS = GRID * GRID

const STYLE = /^[a-z0-9-]{1,24}$/
const COLOR = /^#[0-9a-f]{6}$/
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
    for (const side of ['a', 'b']) if (Number.isInteger(w[side]) && w[side] >= 0 && w[side] < MAX_FINISHES) clean[side] = w[side]
    const key = `${x},${z},${e}`
    byEdge.delete(key)
    byEdge.set(key, clean)
  }
  return [...byEdge.values()]
}

// ---------------------------------------------------------------- revêtements

/** Revêtement bien formé ({ style, color } : identifiant court, #rrggbb), ou null. */
export function sanitizeFinish(raw) {
  if (!raw || typeof raw !== 'object') return null
  const { style, color } = raw
  return typeof style === 'string' && STYLE.test(style) && typeof color === 'string' && COLOR.test(color) ? { style, color } : null
}

const finishKey = (f) => `${f.style}:${f.color}`

/** Index de la case (x, z) dans la grille, ou -1 hors de la plus grande parcelle. */
export function cellIndex(x, z) {
  const i = x - PLOT_ORIGIN.x, j = z - PLOT_ORIGIN.z
  return Number.isInteger(i) && Number.isInteger(j) && i >= 0 && j >= 0 && i < GRID && j < GRID ? j * GRID + i : -1
}

/** Case d'un index de la grille. */
export const cellAt = (index) => ({ x: PLOT_ORIGIN.x + (index % GRID), z: PLOT_ORIGIN.z + Math.floor(index / GRID) })

/** Cases (une lettre chacune, CELLS en tout) encodées par plages : « a12.18b3 » (lettre, puis longueur). */
export function encodeCells(letters) {
  let out = ''
  for (let i = 0; i < letters.length; ) {
    let j = i
    while (j < letters.length && letters[j] === letters[i]) j++
    out += letters[i] + (j - i)
    i = j
  }
  return out
}

/** Cases décodées (CELLS lettres) ; ce qui manque, ou ne se lit pas, est une dalle nue. */
export function decodeCells(code) {
  const out = []
  if (typeof code === 'string' && code.length <= CELLS * 5) {
    for (const [, c, n] of code.matchAll(/([.a-p])(\d{1,4})/g)) {
      for (let k = Number(n); k > 0 && out.length < CELLS; k--) out.push(c)
    }
  }
  while (out.length < CELLS) out.push(BARE)
  return out.join('')
}

/**
 * Plan d'une parcelle, sous une forme commode à modifier : les murs avec le revêtement de leurs
 * faces, et celui de chaque case (null : dalle nue), CELLS en tout (cf. cellIndex).
 * @param {unknown} raw aménagement au format 2 (vérifié ici)
 * @returns {{ walls: object[], floor: ({ style: string, color: string } | null)[] }}
 */
export function unpackHome(raw) {
  const home = sanitizeHome(raw)
  const papers = home?.papers ?? []
  const walls = (home?.walls ?? []).map((w) => {
    const out = { x: w.x, z: w.z, e: w.e }
    if (w.k) out.k = w.k
    if (w.a !== undefined) out.a = { ...papers[w.a] }
    if (w.b !== undefined) out.b = { ...papers[w.b] }
    return out
  })
  const palette = home?.floor?.palette ?? []
  const cells = decodeCells(home?.floor?.cells)
  const floor = [...cells].map((c) => (c === BARE ? null : { ...palette[LETTERS.indexOf(c)] }))
  return { walls, floor, ...(home?.open ? { open: true } : {}) }
}

/** Nombre de revêtements différents du sol et du papier peint d'un plan (16 au plus chacun). */
export function finishCounts(plan) {
  const floor = new Set(plan.floor.filter(Boolean).map(finishKey))
  const paper = new Set()
  for (const w of plan.walls) for (const f of [w.a, w.b]) if (f) paper.add(finishKey(f))
  return { floor: floor.size, paper: paper.size }
}

/**
 * Aménagement au format 2 d'un plan (cf. unpackHome) : palettes des revêtements utilisés (dans
 * l'ordre où on les rencontre), cases encodées. Au-delà de 16 revêtements, le reste est ignoré.
 */
export function packHome(plan) {
  const home = { v: HOME_FORMAT }
  if (plan.open) home.open = true
  const papers = new Map()
  const paperOf = (f) => {
    const key = finishKey(f)
    if (!papers.has(key) && papers.size < MAX_FINISHES) papers.set(key, { index: papers.size, finish: { style: f.style, color: f.color } })
    return papers.get(key)?.index
  }
  const walls = plan.walls.map((w) => {
    const out = { x: w.x, z: w.z, e: w.e }
    if (w.k && w.k !== 'wall') out.k = w.k
    for (const side of ['a', 'b']) {
      const i = w[side] ? paperOf(w[side]) : undefined
      if (i !== undefined) out[side] = i
    }
    return out
  })
  if (walls.length) home.walls = walls
  if (papers.size) home.papers = [...papers.values()].map((p) => p.finish)
  const palette = new Map()
  let letters = ''
  for (let i = 0; i < CELLS; i++) {
    const f = plan.floor[i]
    let c = BARE
    if (f) {
      const key = finishKey(f)
      if (!palette.has(key) && palette.size < MAX_FINISHES) palette.set(key, { letter: LETTERS[palette.size], finish: { style: f.style, color: f.color } })
      c = palette.get(key)?.letter ?? BARE
    }
    letters += c
  }
  if (palette.size) home.floor = { palette: [...palette.values()].map((p) => p.finish), cells: encodeCells(letters) }
  return home
}

/**
 * Aménagement d'une parcelle propre à enregistrer et à rediffuser ({ v: 2, walls?, papers?,
 * floor? }), ou null s'il n'a pas la forme attendue. Les revêtements mal formés sont oubliés (les
 * faces et les cases qui s'en servaient redeviennent nues), les palettes ne gardent que ce qui
 * sert, dans l'ordre (cf. packHome).
 */
export function sanitizeHome(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== HOME_FORMAT) return null
  const papers = Array.isArray(raw.papers) ? raw.papers.slice(0, MAX_FINISHES).map(sanitizeFinish) : []
  const walls = sanitizeWalls(raw.walls).map((w) => {
    const out = { x: w.x, z: w.z, e: w.e }
    if (w.k) out.k = w.k
    if (papers[w.a]) out.a = papers[w.a]
    if (papers[w.b]) out.b = papers[w.b]
    return out
  })
  const palette = raw.floor && typeof raw.floor === 'object' && Array.isArray(raw.floor.palette) ? raw.floor.palette.slice(0, MAX_FINISHES).map(sanitizeFinish) : []
  const cells = decodeCells(raw.floor?.cells)
  const floor = [...cells].map((c) => (c === BARE ? null : palette[LETTERS.indexOf(c)] ?? null))
  return packHome({ walls, floor, open: raw.open === true })
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
