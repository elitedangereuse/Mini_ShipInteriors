// Nico, le mécano du hangar (cf. src/mechanic.ts, qui le dessine avec Boulon, son drone, et
// src/hangar.ts, la révision du Krait). Comme le sergent Rourke (cf. patrol.js), Marcel (cf.
// chef.js) et Betty (cf. nurse.js), il est le même pour tout le bord : sa tournée du hangar ne
// dépend que d'une horloge que le relais tient pour tous, figée quelques secondes quand on lui
// parle. Quand un joueur l'aide (une révision du Krait, prise auprès de lui), il se poste devant
// le nez du Krait et le suit des yeux : le relais fige sa tournée tant qu'il y a un aide au
// travail, plus le temps de revenir là où il l'avait laissée.

import { holdPatrol, patrolTime } from './patrol.js'

/** Pont et pièce du mécano. */
export const MECH_LEVEL = -1
export const MECH_ROOM = 'k'

/** Pas du mécano (unités par seconde) : il est jeune, il trotte. */
export const MECH_SPEED = 0.95

/** Temps d'arrêt quand on lui parle (secondes). */
export const MECH_HOLD = 6

/** Une révision en cours le retient ce temps-là (secondes), relancé à chaque étape. */
export const MECH_HELP = 45

/** Orientations : face au sud (+z), au nord (-z), à l'est (+x), à l'ouest (-x). */
const SOUTH = 0
const NORTH = Math.PI
const EAST = Math.PI / 2
const WEST = -Math.PI / 2

/** Où il attend son aide pendant une révision : devant le nez du Krait, à côté de l'escabeau. */
export const MECH_WAIT = { x: 35.95, z: 3.9, yaw: WEST }

/**
 * Meubles du hangar (rectangles au sol, cf. levels.ts) : ses trajets ne les traversent pas.
 * Chaque rectangle est élargi de sa carrure (cf. RADIUS). Le Krait (x = 31,4, z = 5, nez à l'est)
 * occupe le milieu ; l'escabeau, qui n'arrête pas les joueurs, l'arrête lui.
 */
export const MECH_OBSTACLES = [
  { minX: 28.37, maxX: 34.6, minZ: 1.98, maxZ: 8.02 }, // Krait Mk II
  { minX: 34.78, maxX: 35.65, minZ: 4.75, maxZ: 5.25 }, // escabeau
  { minX: 27.3, maxX: 28.5, minZ: -0.35, maxZ: 0.35 }, // établi
  { minX: 29.02, maxX: 29.98, minZ: -0.35, maxZ: 0.21 }, // panneau à outils
  { minX: 32.03, maxX: 33.17, minZ: -0.35, maxZ: 0.08 }, // étagère à pièces
  { minX: 34, maxX: 34.82, minZ: -0.1, maxZ: 0.36 }, // poste de soudure
  { minX: 36.31, maxX: 36.75, minZ: 0.84, maxZ: 1.56 }, // pupitre du hangar
  { minX: 36.96, maxX: 37.14, minZ: 2.51, maxZ: 2.69 }, // balise du bouclier
  { minX: 36.96, maxX: 37.14, minZ: 7.31, maxZ: 7.49 }, // balise du bouclier
  { minX: 26.4, maxX: 27.1, minZ: 8.05, maxZ: 8.55 }, // support de propulseur
  { minX: 26.25, maxX: 26.6, minZ: 2.45, maxZ: 2.75 }, // projecteur
  { minX: 28.29, maxX: 28.91, minZ: 9.07, maxZ: 9.43 }, // chariot à outils
  { minX: 32.08, maxX: 32.64, minZ: 9.9, maxZ: 10.35 }, // station de ravitaillement
  { minX: 36, maxX: 37.35, minZ: 9.6, maxZ: 10.35 }, // caisses
  // Les gyrophares aux coins du pad.
  { minX: 27.97, maxX: 28.13, minZ: 1.57, maxZ: 1.73 },
  { minX: 34.67, maxX: 34.83, minZ: 1.57, maxZ: 1.73 },
  { minX: 27.97, maxX: 28.13, minZ: 8.27, maxZ: 8.43 },
  { minX: 34.67, maxX: 34.83, minZ: 8.27, maxZ: 8.43 },
]

/** Sa carrure, avec une marge. */
const RADIUS = 0.17

/**
 * Les coins de l'allée qui fait le tour du Krait : entre lui et l'atelier au nord, le bouclier à
 * l'est, le ravitaillement au sud, la porte du lobby à l'ouest.
 */
const AISLE = [[27.75, 1.2], [35.95, 1.2], [35.95, 8.75], [27.75, 8.75]]

/**
 * Postes de sa tournée, dans l'ordre : où il se tient, son orientation, le temps passé et ce
 * qu'il y fait (le geste et le bruit, cf. src/mechanic.ts). Le trajet de l'un à l'autre est
 * calculé (cf. mechRoute) : il fait le tour du Krait par l'allée.
 */
const POSTS = [
  { at: 'bench', x: 27.9, z: 0.78, yaw: NORTH, watch: 8, work: 'tinker' },
  { at: 'gear', x: 29.95, z: 1.45, yaw: SOUTH, watch: 6, work: 'wrench' },
  { at: 'parts', x: 32.6, z: 0.72, yaw: NORTH, watch: 5, work: 'fetch' },
  { at: 'welder', x: 34.4, z: 0.8, yaw: NORTH, watch: 7, work: 'weld' },
  { at: 'console', x: 35.85, z: 1.2, yaw: EAST, watch: 6, work: 'type' },
  { at: 'nose', x: MECH_WAIT.x, z: MECH_WAIT.z, yaw: WEST, watch: 6, work: 'look' },
  { at: 'shield', x: 36.75, z: 6.3, yaw: EAST, watch: 6, work: 'look' },
  { at: 'fuel', x: 32.4, z: 9.3, yaw: SOUTH, watch: 7, work: 'refuel' },
  { at: 'gear', x: 29.95, z: 8.6, yaw: NORTH, watch: 6, work: 'wrench' },
  { at: 'cart', x: 28.6, z: 8.7, yaw: SOUTH, watch: 4, work: 'fetch' },
  { at: 'thruster', x: 27.6, z: 8.2, yaw: WEST, watch: 7, work: 'weld' },
  { at: 'engines', x: 27.75, z: 5, yaw: EAST, watch: 6, work: 'scan' },
]

/** Longueur d'une ligne brisée. */
export function pathLength(points) {
  let length = 0
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  return length
}

/** Le segment de `a` à `b` évite-t-il ce rectangle, élargi de sa carrure ? (découpage de Liang-Barsky) */
function clearOf(a, b, r) {
  const minX = r.minX - RADIUS, maxX = r.maxX + RADIUS, minZ = r.minZ - RADIUS, maxZ = r.maxZ + RADIUS
  const dx = b[0] - a[0], dz = b[1] - a[1]
  let t0 = 0, t1 = 1
  for (const [p, q] of [[-dx, a[0] - minX], [dx, maxX - a[0]], [-dz, a[1] - minZ], [dz, maxZ - a[1]]]) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return true
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return true
  }
  return false
}

/** Le segment de `a` à `b` évite-t-il tous les meubles ? */
export function mechClear(a, b) {
  return MECH_OBSTACLES.every((r) => clearOf(a, b, r))
}

/**
 * Trajet d'un point à un autre du hangar : tout droit s'il ne traverse aucun meuble, sinon le plus
 * court par les coins de l'allée (Dijkstra sur quelques points reliés s'ils se voient). Rend les
 * points à suivre, arrivée comprise (sans le départ).
 */
export function mechRoute(from, to) {
  const start = [from.x, from.z], end = [to.x, to.z]
  if (mechClear(start, end)) return [end]
  const nodes = [start, end, ...AISLE]
  const dist = nodes.map(() => Infinity)
  const prev = nodes.map(() => -1)
  const done = nodes.map(() => false)
  dist[0] = 0
  for (;;) {
    let u = -1
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i
    if (u < 0 || u === 1) break
    done[u] = true
    for (let v = 0; v < nodes.length; v++) {
      if (done[v] || !mechClear(nodes[u], nodes[v])) continue
      const d = dist[u] + Math.hypot(nodes[v][0] - nodes[u][0], nodes[v][1] - nodes[u][1])
      if (d < dist[v]) {
        dist[v] = d
        prev[v] = u
      }
    }
  }
  // Perdu hors de l'allée (il ne devrait jamais l'être) : il y va tout droit.
  if (dist[1] === Infinity) return [end]
  const route = []
  for (let v = 1; v > 0; v = prev[v]) route.unshift(nodes[v])
  return route
}

/** Postes de sa tournée, avec le trajet depuis le poste précédent (le dernier point est le poste). */
export const MECH_POSTS = POSTS.map((post, i) => {
  const before = POSTS[(i - 1 + POSTS.length) % POSTS.length]
  return { ...post, path: mechRoute(before, post) }
})

/** Tout près de sa place, il y va tout droit. */
const NEAR = 0.3

/** Il rattrape sa place un peu plus vite qu'il ne marche (facteur de son pas). */
export const MECH_CATCH_UP = 1.3
/**
 * Au-delà de cet écart avec sa place, par le chemin, il y saute : plus long que n'importe quel
 * trajet du hangar (le tour complet fait une trentaine d'unités, il n'en fait jamais plus de la
 * moitié pour rejoindre un point), il ne saute donc que s'il est vraiment perdu.
 */
export const MECH_SNAP = 18

/**
 * Un pas du mécano vers sa place `goal`, d'au plus `max` : sa nouvelle position, son cap s'il a
 * bougé, la distance parcourue et celle qui lui restait par le chemin (`left`, avant ce pas).
 */
export function mechStep(from, goal, max) {
  const route = Math.hypot(goal.x - from.x, goal.z - from.z) < NEAR ? [[goal.x, goal.z]] : mechRoute(from, goal)
  const left = pathLength([[from.x, from.z], ...route])
  let x = from.x, z = from.z, heading = null, moved = 0
  let step = Math.min(left, max)
  for (const [px, pz] of route) {
    if (step <= 1e-9) break
    const d = Math.hypot(px - x, pz - z)
    if (d > 1e-4) heading = Math.atan2(px - x, pz - z)
    const k = d <= step ? 1 : step / d
    x += (px - x) * k
    z += (pz - z) * k
    moved += Math.min(d, step)
    step -= Math.min(d, step)
  }
  return { x, z, heading, moved, left }
}

const STEPS = []
let tau = 0
{
  const last = MECH_POSTS[MECH_POSTS.length - 1]
  let from = [last.x, last.z]
  MECH_POSTS.forEach((post, index) => {
    for (const to of post.path) {
      const length = Math.hypot(to[0] - from[0], to[1] - from[1])
      if (length > 1e-6) {
        const heading = Math.atan2(to[0] - from[0], to[1] - from[1])
        STEPS.push({ walk: true, from, to, start: tau, duration: length / MECH_SPEED, heading, post: index })
        tau += length / MECH_SPEED
      }
      from = to
    }
    STEPS.push({ walk: false, from, to: from, start: tau, duration: post.watch, heading: post.yaw, post: index })
    tau += post.watch
  })
}

/** Durée d'une tournée complète (secondes). */
export const MECH_PERIOD = tau

/**
 * Le mécano à l'instant `t` de sa tournée (secondes, n'importe quel tour) : position, cap,
 * marche-t-il, et le poste vers lequel il va ou auquel il travaille.
 */
export function mechAt(t) {
  const local = ((t % MECH_PERIOD) + MECH_PERIOD) % MECH_PERIOD
  let lo = 0, hi = STEPS.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (STEPS[mid].start <= local) lo = mid
    else hi = mid - 1
  }
  const s = STEPS[lo]
  const k = Math.min(1, (local - s.start) / s.duration)
  const x = s.from[0] + (s.to[0] - s.from[0]) * k
  const z = s.from[1] + (s.to[1] - s.from[1]) * k
  return { x, z, yaw: s.heading, walking: s.walk, post: s.post }
}

/** Temps qu'il lui faut pour revenir du nez du Krait à sa place dans la tournée, à l'instant `t` (secondes). */
export function mechReturn(t) {
  const at = mechAt(t)
  return pathLength([[MECH_WAIT.x, MECH_WAIT.z], ...mechRoute(MECH_WAIT, at)]) / MECH_SPEED
}

/** Horloge de la tournée (même forme que celle de la ronde, cf. patrol.js). */
export const mechTime = patrolTime

/** On lui parle à l'instant `now` (ms) : sa tournée s'arrête pour `seconds`. */
export function holdMech(clock, now, seconds = MECH_HOLD) {
  return holdPatrol(clock, now, seconds)
}

/**
 * Les révisions en cours ont changé à l'instant `now` (ms) : `until` est la fin de la dernière
 * (ms, ou 0 s'il n'y en a plus). La tournée reste figée jusque-là, plus le retour depuis le nez du Krait.
 */
export function helpMech(clock, now, until) {
  const t = patrolTime(clock, now)
  return { tau: t, at: now, holdUntil: Math.max(now, until) + mechReturn(t) * 1000 }
}
