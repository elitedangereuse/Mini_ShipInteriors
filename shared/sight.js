// Ligne de vue sur le plan d'un pont (cf. ship-map.js) : on n'utilise pas un objet, un PNJ ou un
// siège de l'autre côté d'un mur. Le client s'en sert pour l'invite et la touche E, le relais
// pour les actions qu'il arbitre (tables de jeux, jukebox).
//
// Le segment va du joueur à l'objet ; chaque arête de tuile qu'il franchit doit être ouverte, ou
// une porte franchie dans son ouverture. Un objet adossé à un mur a son centre du côté de sa
// pièce : il se voit de sa face, pas de derrière la cloison.

/** Largeur de l'ouverture d'une porte (celle des collisions, cf. src/deck.ts). */
export const DOOR_GAP = 0.5

const EPS = 1e-9

/** Arête franchie en `t` du segment a → b (depuis la tuile x, z, vers dir) : ouverte ou porte passée dans l'ouverture ? */
function passes(map, x, z, dir, a, b, t) {
  const kind = map.edge(x, z, dir)
  if (kind === 'open') return true
  if (kind === 'wall') return false
  // Porte : le point de passage doit tomber dans l'ouverture, pas sur les montants.
  const along = dir === 1 || dir === 3 ? a.z + (b.z - a.z) * t - z : a.x + (b.x - a.x) * t - x
  return Math.abs(along) <= DOOR_GAP / 2
}

/**
 * Un point au-dessus du vide (au ras d'un mur extérieur) : ramené vers `from`, dans la tuile de
 * sol la plus proche le long du segment ; null s'il n'y en a pas à moins de 0,6.
 */
function onFloor(map, from, to) {
  const len = Math.hypot(to.x - from.x, to.z - from.z)
  for (let d = 0; d <= Math.min(0.6, len); d += 0.05) {
    const t = len ? d / len : 0
    const p = { x: to.x + (from.x - to.x) * t, z: to.z + (from.z - to.z) * t }
    if (map.isFloor(Math.round(p.x), Math.round(p.z))) return p
  }
  return null
}

/**
 * Rien ne sépare `from` de `to` (coordonnées du pont) : parcours des tuiles traversées par le
 * segment, et contrôle de chaque arête franchie.
 */
export function lineOfSight(map, from, to) {
  const b = onFloor(map, from, to)
  if (!b) return false
  const a = from
  let x = Math.round(a.x), z = Math.round(a.z)
  if (!map.isFloor(x, z)) return false
  const tx = Math.round(b.x), tz = Math.round(b.z)
  const dx = b.x - a.x, dz = b.z - a.z
  const sx = Math.sign(dx), sz = Math.sign(dz)
  const dirX = sx > 0 ? 1 : 3, dirZ = sz > 0 ? 2 : 0
  // Paramètre t (0 en a, 1 en b) de la prochaine arête verticale et horizontale.
  let nextX = sx ? (x + sx * 0.5 - a.x) / dx : Infinity
  let nextZ = sz ? (z + sz * 0.5 - a.z) / dz : Infinity
  const stepX = sx ? 1 / Math.abs(dx) : Infinity
  const stepZ = sz ? 1 / Math.abs(dz) : Infinity
  for (let guard = 0; guard < 256 && (x !== tx || z !== tz); guard++) {
    const t = Math.min(nextX, nextZ)
    if (t > 1 + EPS) break
    if (Math.abs(nextX - nextZ) < EPS) {
      // Par un coin : les deux chemins autour du poteau doivent être libres.
      const viaX = passes(map, x, z, dirX, a, b, t) && passes(map, x + sx, z, dirZ, a, b, t)
      const viaZ = passes(map, x, z, dirZ, a, b, t) && passes(map, x, z + sz, dirX, a, b, t)
      if (!viaX || !viaZ) return false
      x += sx
      z += sz
      nextX += stepX
      nextZ += stepZ
    } else if (nextX < nextZ) {
      if (!passes(map, x, z, dirX, a, b, t)) return false
      x += sx
      nextX += stepX
    } else {
      if (!passes(map, x, z, dirZ, a, b, t)) return false
      z += sz
      nextZ += stepZ
    }
  }
  return true
}

/** À portée de main (`range`, au sol) et en vue. */
export function canReach(map, from, to, range) {
  return Math.hypot(to.x - from.x, to.z - from.z) <= range && lineOfSight(map, from, to)
}
