// Aménagement d'une parcelle des quartiers (housing v2, cf. docs/housing-v2.md), format 2 : ce que
// le joueur y a bâti. Ses murs, le papier peint de chacune de leurs faces, et le revêtement de
// chaque case du sol ; le mobilier suivra.
//
//   { v: 2,
//     open?: true,                              // quartiers ouverts : on y entre sans invitation
//     stage?: 1 | 2 | 3,                        // palier d'agrandissement (cf. housing-plot.js)
//     items?: [{ m, x, z, r, v?, y?, s? }],     // le mobilier, comme celui des anciens quartiers
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

import { DOOR_KINDS, partitionEdge, partitionKey } from './cabin-partitions.js'
import { inPlot, PLOT_ORIGIN, PLOT_SIZES, plotRect } from './housing-plot.js'

/** Format de l'aménagement d'une parcelle. */
export const HOME_FORMAT = 2

/** Murs au plus : de quoi faire le tour de la plus grande parcelle (80) et la cloisonner. */
export const MAX_HOME_WALLS = 512

/** Pans sans passage : plein (sans `k`), demi-mur, à hublot. */
export const SOLID_KINDS = ['wall', 'half', 'window']

/** Murs percés d'un passage : les portes des cloisons, et l'arche (sans battant). */
export const HOME_DOOR_KINDS = DOOR_KINDS

/** Tous les types, dans l'ordre de l'onglet « Murs ». */
export const HOME_WALL_KINDS = [...SOLID_KINDS, ...HOME_DOOR_KINDS]

const KIND = /^[a-z0-9-]{1,24}$/

/**
 * Côté du carré que couvre le format, depuis le coin nord-ouest de la parcelle : 30, fixe. Le
 * format 2 est né avec une plus grande parcelle de 30 × 30 ; celle de 20 × 20 (cf. PLOT_SIZES) y
 * tient, et ce qui a été enregistré avant se lit toujours de même (le site en a le portage).
 * Bornes des arêtes et des objets, pourtour compris, et grille des cases.
 */
const MAX_SIZE = 30

/** Revêtements au plus dans chaque palette (sol, papier peint) : une lettre chacun. */
export const MAX_FINISHES = 16
const LETTERS = 'abcdefghijklmnop'
/** Case sans revêtement : la dalle du vaisseau. */
const BARE = '.'
/** Côté de la grille des cases, et nombre de cases. */
export const GRID = MAX_SIZE
export const CELLS = GRID * GRID

const STYLE = /^[a-z0-9-]{1,24}$/
const COLOR = /^#[0-9a-f]{6}$/

/** Objets au plus sur la parcelle (autant que dans les anciens quartiers et leurs trois extensions). */
export const MAX_HOME_ITEMS = 160
/**
 * Objets au plus à chaque palier d'agrandissement : la parcelle de départ, puis 12 × 12, 15 × 15,
 * 20 × 20 ; comme les anciens quartiers, puis avec une, deux ou trois extensions.
 */
export const STAGE_ITEMS = [64, 96, 128, 160]
const MODEL = /^[a-z0-9-]{1,32}$/
const VARIANT = /^[a-z0-9.:-]{1,24}$/

/** Nombre fini compris entre min et max, arrondi au millimètre, ou null. */
function bounded(v, min, max) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 1000) / 1000 : null
}

/**
 * Objets bien formés ({ m, x, z, r, v?, y?, s? }) : identifiants courts, position sur la plus grande
 * parcelle (un objet accroché déborde sur la face du mur du pourtour), orientation en quarts de
 * tour, hauteur de pose, graine. Les objets mal formés sont écartés un par un ; au-delà de
 * MAX_HOME_ITEMS, le reste est ignoré. Le catalogue est au client : il écarte ce qu'il ne connaît pas.
 */
export function sanitizeItems(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const it of raw) {
    if (out.length >= MAX_HOME_ITEMS) break
    if (!it || typeof it !== 'object' || typeof it.m !== 'string' || !MODEL.test(it.m)) continue
    const x = bounded(it.x, PLOT_ORIGIN.x - 1, PLOT_ORIGIN.x + MAX_SIZE), z = bounded(it.z, PLOT_ORIGIN.z - 1, PLOT_ORIGIN.z + MAX_SIZE)
    if (x === null || z === null) continue
    const item = { m: it.m, x, z, r: [0, 1, 2, 3].includes(it.r) ? it.r : 0 }
    if (typeof it.v === 'string' && VARIANT.test(it.v)) item.v = it.v
    const y = bounded(it.y, 0, 2)
    if (y) item.y = y
    if (Number.isInteger(it.s) && it.s >= 0 && it.s < 100000) item.s = it.s
    out.push(item)
  }
  return out
}
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
 * Plus petit palier dont la parcelle contient tout ce qui est bâti : chaque mur (sur son pourtour,
 * s'il n'est pas une porte), chaque case revêtue, chaque objet. Une parcelle enregistrée avant le
 * passage aux tailles de 8, 12, 15 et 20 tuiles (lot 7 de docs/housing-v2.md) garde ainsi tout ce
 * qu'elle porte.
 * @param {{ walls: object[], floor: object[], items?: object[] }} plan
 */
export function fitStage(plan) {
  const side = (x, z) => Math.max(x - PLOT_ORIGIN.x + 1, z - PLOT_ORIGIN.z + 1, 0)
  let need = 0
  for (const w of plan.walls) {
    const { x, z, nx, nz } = partitionEdge(w)
    const a = side(x, z), b = side(nx, nz)
    need = Math.max(need, isHomeDoor(w) ? Math.max(a, b) : Math.min(a, b))
  }
  plan.floor.forEach((f, i) => {
    if (f) need = Math.max(need, side(cellAt(i).x, cellAt(i).z))
  })
  for (const it of plan.items ?? []) need = Math.max(need, side(Math.round(it.x), Math.round(it.z)))
  const stage = PLOT_SIZES.findIndex((size) => size >= need)
  return stage < 0 ? PLOT_SIZES.length - 1 : stage
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
  const plan = { walls, floor, items: (home?.items ?? []).map((it) => ({ ...it })), ...(home?.open ? { open: true } : {}) }
  // La parcelle contient toujours ce qu'on y a bâti (cf. fitStage).
  const stage = Math.max(home?.stage ?? 0, fitStage(plan))
  return stage ? { ...plan, stage } : plan
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
  if (Number.isInteger(plan.stage) && plan.stage > 0) home.stage = Math.min(plan.stage, PLOT_SIZES.length - 1)
  if (plan.items?.length) home.items = plan.items.map((it) => ({ ...it }))
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
  const stage = Number.isInteger(raw.stage) && raw.stage > 0 && raw.stage < PLOT_SIZES.length ? raw.stage : 0
  return packHome({ walls, floor, items: sanitizeItems(raw.items), stage, open: raw.open === true })
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

// ---------------------------------------------------------------- déplacer un bloc

/**
 * Bloc de la construction sur ces cases (un rectangle, une pièce, toute la parcelle) : les murs qui
 * bordent l'une d'elles, et celles qui sont revêtues. Les objets sont au client (il sait lesquels
 * sont posés là, accrochés à ces murs, ou posés sur un meuble du bloc).
 * @param {{ walls: object[], floor: object[] }} plan (cf. unpackHome)
 * @param {{ x: number, z: number }[]} cells
 * @returns {{ walls: Set<string>, cells: Set<number>, items: Set<number> }} clés d'arête (cf. partitionKey), index des cases et des objets
 */
export function blockOf(plan, cells) {
  const inside = new Set(cells.map((c) => `${c.x},${c.z}`))
  const walls = new Set()
  for (const w of plan.walls) {
    const { x, z, nx, nz } = partitionEdge(w)
    if (inside.has(`${x},${z}`) || inside.has(`${nx},${nz}`)) walls.add(partitionKey(w))
  }
  const covered = new Set()
  for (const c of cells) {
    const i = cellIndex(c.x, c.z)
    if (i >= 0 && plan.floor[i]) covered.add(i)
  }
  return { walls, cells: covered, items: new Set() }
}

/**
 * Pourquoi le bloc ne peut pas être déplacé de (dx, dz) tuiles, ou null s'il le peut : 'outside'
 * (un mur, une case revêtue ou un objet sortirait de la parcelle), 'landing' (un mur tomberait
 * sur celui du palier), 'void' (une porte arriverait sur le pourtour). Ce qui l'attend à l'arrivée
 * (murs, meubles) est au client.
 * @param {import('./ship-map.js').ShipMap} map plan du pont des quartiers, parcelle posée
 */
export function blockRefusal(map, stage, plan, block, dx, dz) {
  for (const w of plan.walls) {
    if (!block.walls.has(partitionKey(w))) continue
    const why = wallRefusal(map, stage, { ...w, x: w.x + dx, z: w.z + dz })
    if (why) return why
  }
  for (const i of block.cells) {
    const c = cellAt(i)
    if (plan.floor[i] && !inPlot(stage, c.x + dx, c.z + dz)) return 'outside'
  }
  // Un objet accroché au pourtour déborde un peu sur la face de son mur.
  const r = plotRect(stage)
  for (const i of block.items) {
    const it = plan.items?.[i]
    if (!it) continue
    const x = it.x + dx, z = it.z + dz
    if (x < r.minX - 0.5 || x > r.maxX + 0.5 || z < r.minZ - 0.5 || z > r.maxZ + 0.5) return 'outside'
  }
  return null
}

/**
 * Plan où le bloc est déplacé de (dx, dz) tuiles, d'un seul tenant : ses murs, ses cases revêtues
 * et ses objets. Ses murs et ses revêtements remplacent ce qui était à l'arrivée (un mur y garde
 * le papier peint de la face que le bloc n'habille pas) ; les cases qu'il quitte redeviennent
 * nues. Les objets gardent leur ordre. À vérifier d'abord avec blockRefusal.
 */
export function moveBlock(plan, block, dx, dz) {
  const byKey = new Map()
  for (const w of plan.walls) if (!block.walls.has(partitionKey(w))) byKey.set(partitionKey(w), w)
  for (const w of plan.walls) {
    if (!block.walls.has(partitionKey(w))) continue
    const moved = { ...w, x: w.x + dx, z: w.z + dz }
    const there = byKey.get(partitionKey(moved))
    for (const side of ['a', 'b']) if (!moved[side] && there?.[side]) moved[side] = there[side]
    byKey.set(partitionKey(moved), moved)
  }
  const floor = plan.floor.slice()
  const carried = []
  for (const i of block.cells) {
    if (!plan.floor[i]) continue
    carried.push([i, plan.floor[i]])
    floor[i] = null
  }
  for (const [i, f] of carried) {
    const c = cellAt(i)
    const j = cellIndex(c.x + dx, c.z + dz)
    if (j >= 0) floor[j] = f
  }
  const round = (v) => Math.round(v * 1000) / 1000
  const items = (plan.items ?? []).map((it, i) => (block.items.has(i) ? { ...it, x: round(it.x + dx), z: round(it.z + dz) } : it))
  return { ...plan, walls: [...byKey.values()], floor, items }
}

/** Le bloc, une fois déplacé de (dx, dz) tuiles (mêmes objets, cf. moveBlock). */
export function shiftBlock(block, dx, dz) {
  const walls = new Set([...block.walls].map((k) => {
    const [x, z, e] = k.split(',')
    return partitionKey({ x: Number(x) + dx, z: Number(z) + dz, e })
  }))
  const cells = new Set([...block.cells].map((i) => {
    const c = cellAt(i)
    return cellIndex(c.x + dx, c.z + dz)
  }).filter((i) => i >= 0))
  return { walls, cells, items: new Set(block.items) }
}
