// Mezzanines : un étage dans une pièce, et les escaliers qui y montent (cf. MEZZANINES dans
// ship-layouts.js, et src/mezzanine.ts qui les dessine). Partagé par le client (hauteur du sol,
// garde-corps) et par le relais, dont le plan du pont a les mêmes garde-corps (cf. shipMapOptions).
//
// Le dessous d'une mezzanine est plein : on n'y passe pas, on ne fait qu'y monter. Le pont reste
// donc un plan à une seule couche, où les garde-corps sont des murs : ils arrêtent les pas, et la
// vue (on n'attrape pas le jukebox d'en bas, à travers le plancher).

import { DIRS } from './ship-map.js'

/** Sens de montée de chaque marque d'escalier du plan : vers le nord, l'est, le sud, l'ouest. */
const STAIR_DIRS = { '^': 0, '>': 1, v: 2, '<': 3 }

/**
 * Plan d'une mezzanine, lu une fois : ses tuiles hautes et ses volées d'escalier.
 * @param {{ height: number, plan: string[] }} def
 *   plan : une lettre par tuile du pont (colonne = x, ligne = z), comme le plan du pont :
 *   'M' plancher de la mezzanine ; '^', '>', 'v', '<' marche d'escalier, qui monte dans ce sens ;
 *   ' ' sol du pont. Une volée part du sol et débouche sur le plancher.
 */
export function parseMezzanine(def) {
  const tiles = new Map()
  def.plan.forEach((row, z) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x]
      if (c === 'M') tiles.set(`${x},${z}`, { x, z, stair: -1, step: 0, run: 0 })
      else if (c in STAIR_DIRS) tiles.set(`${x},${z}`, { x, z, stair: STAIR_DIRS[c], step: 0, run: 0 })
      else if (c !== ' ') throw new Error(`Marque de mezzanine inconnue « ${c} » en (${x}, ${z})`)
    }
  })
  const at = (x, z) => tiles.get(`${x},${z}`)
  // Chaque marche a son rang dans sa volée (0 en bas) et la longueur de la volée.
  for (const foot of tiles.values()) {
    if (foot.stair < 0) continue
    const d = DIRS[foot.stair]
    if (at(foot.x - d.dx, foot.z - d.dz)) {
      if (at(foot.x - d.dx, foot.z - d.dz).stair !== foot.stair) throw new Error(`Escalier sans pied en (${foot.x}, ${foot.z})`)
      continue
    }
    const run = []
    let t = foot
    while (t?.stair === foot.stair) {
      run.push(t)
      t = at(t.x + d.dx, t.z + d.dz)
    }
    if (t?.stair !== -1) throw new Error(`Escalier sans palier en (${foot.x}, ${foot.z})`)
    run.forEach((s, i) => Object.assign(s, { step: i, run: run.length }))
  }
  return { height: def.height, tiles }
}

/** Tuile de la mezzanine (plancher ou marche) en (x, z), ou undefined. */
export function mezzanineTile(mezz, x, z) {
  return mezz.tiles.get(`${Math.round(x)},${Math.round(z)}`)
}

/** Hauteur du sol en (x, z) : celle du plancher, qui monte le long des escaliers ; 0 ailleurs. */
export function mezzanineHeight(mezz, x, z) {
  const t = mezzanineTile(mezz, x, z)
  if (!t) return 0
  if (t.stair < 0) return mezz.height
  const d = DIRS[t.stair]
  // Avancée dans la marche, de 0 (son bord bas) à 1 (son bord haut).
  const s = (x - t.x) * d.dx + (z - t.z) * d.dz + 0.5
  return (mezz.height * (t.step + Math.min(1, Math.max(0, s)))) / t.run
}

/**
 * Peut-on passer de la tuile `a` à sa voisine `b` (dans la direction `dir`) ? Sur le plancher,
 * entre deux marches d'une même volée, du pied de la volée au sol, et de son haut au plancher.
 */
function linked(a, b, dir) {
  if (a?.stair >= 0) {
    if (dir === a.stair) return a.step < a.run - 1 ? b?.stair === a.stair : b?.stair === -1
    if (dir === (a.stair + 2) % 4) return a.step > 0 ? b?.stair === a.stair : !b
    return false
  }
  if (b?.stair >= 0) return linked(b, a, (dir + 2) % 4)
  // Ni l'un ni l'autre n'est une marche : de plain-pied, plancher contre plancher ou sol contre sol.
  return !a === !b
}

/**
 * Garde-corps : les arêtes entre deux tuiles de la pièce qu'on ne franchit pas (bord du plancher,
 * flancs des escaliers). Chacune une fois, depuis la tuile (x, z), vers `dir`.
 * @param {(x: number, z: number) => boolean} inRoom tuile de la pièce de la mezzanine
 */
export function mezzanineRails(mezz, inRoom) {
  const rails = []
  const seen = new Set()
  for (const t of mezz.tiles.values()) {
    for (let dir = 0; dir < 4; dir++) {
      const nx = t.x + DIRS[dir].dx, nz = t.z + DIRS[dir].dz
      if (!inRoom(nx, nz)) continue
      const key = [Math.min(t.x, nx), Math.min(t.z, nz), DIRS[dir].dx ? 'v' : 'h'].join(',')
      if (seen.has(key)) continue
      seen.add(key)
      if (!linked(t, mezz.tiles.get(`${nx},${nz}`), dir)) rails.push({ x: t.x, z: t.z, dir })
    }
  }
  return rails
}
