import type { Box2 } from './deck'

/** Repousse un cercle hors des rectangles de collision. Modifie `p` en place. */
export function resolveCircle(p: { x: number; z: number }, r: number, boxes: Box2[]) {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false
    for (const b of boxes) {
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX))
      const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ))
      const dx = p.x - cx
      const dz = p.z - cz
      const d2 = dx * dx + dz * dz
      if (d2 >= r * r) continue
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2)
        p.x += (dx / d) * (r - d)
        p.z += (dz / d) * (r - d)
      } else {
        // Centre à l'intérieur du rectangle : sortie par le côté le plus proche.
        const pushes = [
          [b.minX - r - p.x, 0],
          [b.maxX + r - p.x, 0],
          [0, b.minZ - r - p.z],
          [0, b.maxZ + r - p.z],
        ]
        pushes.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]))
        p.x += pushes[0][0]
        p.z += pushes[0][1]
      }
      moved = true
    }
    if (!moved) break
  }
}

/** Vrai si un cercle de rayon r peut glisser en ligne droite de a à b sans rien toucher. */
export function clearPath(a: { x: number; z: number }, b: { x: number; z: number }, r: number, boxes: Box2[]): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z)
  const steps = Math.max(1, Math.ceil(len / 0.08))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = a.x + (b.x - a.x) * t
    const z = a.z + (b.z - a.z) * t
    for (const box of boxes) {
      const cx = Math.max(box.minX, Math.min(x, box.maxX))
      const cz = Math.max(box.minZ, Math.min(z, box.maxZ))
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false
    }
  }
  return true
}

/** Ouverture d'une porte où l'on passe : milieu, sens du mur, demi-largeur. */
export interface Doorway {
  x: number
  z: number
  /** Le mur court le long de x (porte à franchir en z), sinon le long de z. */
  alongX: boolean
  half: number
}

/** Jusqu'où, le long du mur, une porte attire celui qui fonce dedans : à peine plus que ses montants. */
const FUNNEL_REACH = 0.3
/**
 * Distance au mur (de part et d'autre) où l'on est guidé : le guidage monte en douceur de
 * FUNNEL_DEPTH jusqu'à FUNNEL_FULL (le personnage touche presque le mur), où il est entier.
 */
const FUNNEL_DEPTH = 0.6
const FUNNEL_FULL = 0.35
/** Il faut viser la porte franchement (cosinus de l'angle avec la normale du mur). */
const FUNNEL_AIM = 0.5

/**
 * Guidage dans l'embrasure : l'ouverture ne laisse que quelques centimètres de jeu de chaque côté
 * du personnage, qui bute sinon sur un montant. S'il avance vers une porte en la visant à peu près,
 * `next` glisse vers l'axe de l'ouverture (de `maxShift` au plus, et d'autant moins qu'on est loin
 * du mur), juste assez pour passer. Modifie `next`.
 * @param p position actuelle ; `dir` direction voulue (normalisée)
 */
export function funnelDoorway(p: { x: number; z: number }, next: { x: number; z: number }, dir: { x: number; z: number }, r: number, doorways: Doorway[], maxShift: number) {
  let best: Doorway | null = null
  let bestDist = Infinity
  for (const d of doorways) {
    const across = d.alongX ? p.z - d.z : p.x - d.x
    const lateral = d.alongX ? p.x - d.x : p.z - d.z
    if (Math.abs(across) > FUNNEL_DEPTH || Math.abs(lateral) > d.half + FUNNEL_REACH) continue
    // On va vers le mur (ou on est dedans), franchement : pas en le longeant.
    const push = d.alongX ? dir.z : dir.x
    const toward = Math.abs(across) < 0.05 ? Math.abs(push) : -Math.sign(across) * push
    if (toward < FUNNEL_AIM) continue
    const dist = Math.hypot(across, lateral)
    if (dist < bestDist) {
      best = d
      bestDist = dist
    }
  }
  if (!best) return
  const lateral = best.alongX ? p.x - best.x : p.z - best.z
  const across = best.alongX ? p.z - best.z : p.x - best.x
  const t = Math.min(1, Math.max(0, (FUNNEL_DEPTH - Math.abs(across)) / (FUNNEL_DEPTH - FUNNEL_FULL)))
  const strength = t * t * (3 - 2 * t)
  const slack = Math.max(0, best.half - r - 0.02)
  const excess = Math.abs(lateral) - slack
  if (excess <= 0) return
  const shift = -Math.sign(lateral) * Math.min(excess, maxShift * strength)
  if (best.alongX) next.x += shift
  else next.z += shift
}

/** Le cercle touche-t-il un des rectangles ? */
export function overlapsAny(p: { x: number; z: number }, r: number, boxes: Box2[]): boolean {
  for (const b of boxes) {
    const cx = Math.max(b.minX, Math.min(p.x, b.maxX))
    const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ))
    if ((p.x - cx) ** 2 + (p.z - cz) ** 2 < r * r - 1e-6) return true
  }
  return false
}
