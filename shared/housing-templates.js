// Plans tout faits du mode construction (housing v2, E4, cf. docs/housing-v2.md) : des pièces à
// poser d'un clic sur la parcelle, tournées d'un quart de tour au besoin. Chacune est un jeu de
// murs (même forme que ceux de la parcelle, cf. housing-home.js), posés à partir de la tuile
// nord-ouest de son emprise.

/** Murs du pourtour d'un rectangle de tuiles (x0, z0, largeur, hauteur), sauf les côtés `open`. */
function outline(x0, z0, w, h, k, open = '') {
  const out = []
  const wall = (x, z, e) => out.push(k ? { x, z, e, k } : { x, z, e })
  for (let i = 0; i < w; i++) {
    if (!open.includes('n')) wall(x0 + i, z0 - 1, 'h')
    if (!open.includes('s')) wall(x0 + i, z0 + h - 1, 'h')
  }
  for (let j = 0; j < h; j++) {
    if (!open.includes('w')) wall(x0 - 1, z0 + j, 'v')
    if (!open.includes('e')) wall(x0 + w - 1, z0 + j, 'v')
  }
  return out
}

/** Remplace (ou ajoute) les murs de ces arêtes. */
function set(walls, ...changes) {
  const key = (w) => `${w.x},${w.z},${w.e}`
  const byKey = new Map(walls.map((w) => [key(w), w]))
  for (const c of changes) byKey.set(key(c), c)
  return [...byKey.values()]
}

/** Une ligne de murs verticale (entre les colonnes x et x + 1) ou horizontale (entre z et z + 1). */
const line = (e, at, from, to) => Array.from({ length: to - from + 1 }, (_, i) => (e === 'v' ? { x: at, z: from + i, e } : { x: from + i, z: at, e }))

/**
 * Les plans, dans l'ordre de l'onglet « Murs » : identifiant, emprise (largeur, hauteur, en tuiles)
 * et murs, à partir de la tuile (0, 0).
 */
export const HOME_TEMPLATES = [
  {
    id: 'studio', size: [5, 4],
    walls: set(outline(0, 0, 5, 4), { x: 2, z: 3, e: 'h', k: 'sliding' }),
  },
  {
    id: 'deux-pieces', size: [7, 4],
    walls: set([...outline(0, 0, 7, 4), ...line('v', 3, 0, 3)], { x: 3, z: 1, e: 'v', k: 'wood' }, { x: 1, z: 3, e: 'h', k: 'sliding' }),
  },
  {
    id: 'suite', size: [8, 6],
    walls: set(
      [...outline(0, 0, 8, 6), ...line('v', 3, 0, 5), ...line('h', 2, 4, 7)],
      { x: 3, z: 4, e: 'v', k: 'wood' }, { x: 5, z: 2, e: 'h', k: 'sliding' }, { x: 6, z: 5, e: 'h', k: 'sliding' },
    ),
  },
  {
    id: 'veranda', size: [6, 4],
    walls: set(outline(0, 0, 6, 4, 'window'), { x: 2, z: 3, e: 'h', k: 'arch' }),
  },
  {
    id: 'coin-salon', size: [4, 3],
    walls: outline(0, 0, 4, 3, 'half', 's'),
  },
]

export const templateOf = (id) => HOME_TEMPLATES.find((t) => t.id === id)

/**
 * Murs d'un plan posé à partir de la tuile `at` (son coin nord-ouest, une fois tourné), tourné de
 * `turns` quarts de tour dans le sens des aiguilles d'une montre.
 */
export function placeTemplate(template, at, turns = 0) {
  const [w0, h0] = template.size
  const quarter = ((turns % 4) + 4) % 4
  // Une tuile du plan, tournée : (x, z) → (h - 1 - z, x), un quart de tour à la fois.
  const turn = (t) => {
    let { x, z } = t
    let w = w0, h = h0
    for (let i = 0; i < quarter; i++) {
      ;[x, z] = [h - 1 - z, x]
      ;[w, h] = [h, w]
    }
    return { x, z }
  }
  return template.walls.map((wall) => {
    // Les deux tuiles de part et d'autre de l'arête, tournées, redonnent l'arête.
    const a = turn({ x: wall.x, z: wall.z })
    const b = turn(wall.e === 'v' ? { x: wall.x + 1, z: wall.z } : { x: wall.x, z: wall.z + 1 })
    const out = a.z === b.z ? { x: Math.min(a.x, b.x) + at.x, z: a.z + at.z, e: 'v' } : { x: a.x + at.x, z: Math.min(a.z, b.z) + at.z, e: 'h' }
    if (wall.k) out.k = wall.k
    return out
  })
}

/** Emprise d'un plan tourné (largeur, hauteur). */
export const templateSize = (template, turns = 0) => (turns % 2 ? [template.size[1], template.size[0]] : [...template.size])
