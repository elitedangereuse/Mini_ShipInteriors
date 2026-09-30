// Capucine, la jardinière de la serre hydroponique du pont supérieur (cf. src/gardener.ts, qui la
// dessine, et src/greenhouse.ts, le mini-jeu de la serre). Comme le sergent Rourke (cf.
// patrol.js), Marcel (cf. chef.js), Betty (cf. nurse.js) et Nico (cf. mechanic.js), elle est la
// même pour tout le bord : sa tournée de la serre ne dépend que d'une horloge que le relais tient
// pour tous, figée quelques secondes quand on lui parle. Quand un joueur l'aide (une fiche de
// culture, prise auprès de la grainothèque), elle se poste au bout des pas japonais et le suit
// des yeux : le relais fige sa tournée tant qu'il y a un aide au travail, plus le temps de revenir
// là où elle l'avait laissée.

import { holdPatrol, patrolTime } from './patrol.js'

/** Pont et pièce de la jardinière. */
export const GARDEN_LEVEL = 1
export const GARDEN_ROOM = 'g'

/** Pas de la jardinière (unités par seconde) : elle prend son temps, les plantes aussi. */
export const GARDEN_SPEED = 0.75

/** Temps d'arrêt quand on lui parle (secondes). */
export const GARDEN_HOLD = 6

/** Une fiche de culture en cours la retient ce temps-là (secondes), relancé à chaque étape. */
export const GARDEN_HELP = 45

/** Orientations : face au sud (+z), au nord (-z), à l'est (+x), à l'ouest (-x). */
const SOUTH = 0
const NORTH = Math.PI
const EAST = Math.PI / 2
const WEST = -Math.PI / 2

/** Où elle attend son aide pendant une fiche : sur les pas japonais, entre les bacs et l'arche, face aux bacs. */
export const GARDEN_WAIT = { x: 5.75, z: 4.05, yaw: NORTH }

/**
 * Meubles de la serre (rectangles au sol, cf. levels.ts) : ses trajets ne les traversent pas.
 * Chaque rectangle est élargi de sa carrure (cf. RADIUS). Les derniers sont les coins cassés de la
 * serre (hors du plan) : elle ne coupe pas à travers leurs murs.
 */
export const GARDEN_OBSTACLES = [
  { minX: 2.03, maxX: 2.97, minZ: -0.5, maxZ: -0.09 }, // grainothèque
  { minX: 3.17, maxX: 4.33, minZ: -0.5, maxZ: 0.01 }, // bac hydroponique
  { minX: 4.47, maxX: 5.63, minZ: -0.5, maxZ: 0.01 }, // bac hydroponique
  { minX: 5.73, maxX: 6.41, minZ: -0.5, maxZ: 0.14 }, // cuve de nutriments
  { minX: 6.45, maxX: 7.5, minZ: -0.5, maxZ: 0.16 }, // caisses de récolte
  { minX: -0.5, maxX: -0.18, minZ: 1.7, maxZ: 5.3 }, // mur végétal
  { minX: 0.88, maxX: 1.72, minZ: 0.88, maxZ: 1.72 }, // arbre fruitier
  { minX: 0.51, maxX: 1.99, minZ: 3.77, maxZ: 4.93 }, // bassin
  { minX: -0.5, maxX: 0.5, minZ: 4.78, maxZ: 5.62 }, // récupérateur d'eau
  { minX: 3.13, maxX: 4.67, minZ: 1.13, maxZ: 1.87 }, // bac à tomates
  { minX: 5.13, maxX: 6.67, minZ: 1.13, maxZ: 1.87 }, // bac d'herbes
  { minX: 3.73, maxX: 5.27, minZ: 2.53, maxZ: 3.27 }, // bac de salades
  { minX: 3.23, maxX: 4.77, minZ: 4.83, maxZ: 5.57 }, // massif de fleurs
  { minX: 5.1, maxX: 6.1, minZ: 5.9, maxZ: 6.5 }, // établi de rempotage
  { minX: 6.64, maxX: 7.5, minZ: 5.78, maxZ: 6.5 }, // compost
  { minX: 0.98, maxX: 1.52, minZ: 5.8, maxZ: 6.5 }, // monstera
  { minX: 2.45, maxX: 2.75, minZ: 5.95, maxZ: 6.5 }, // pot de fleurs
  { minX: 5.95, maxX: 6.25, minZ: 3.3, maxZ: 3.6 }, // pot de fleurs
  { minX: 6.65, maxX: 7.5, minZ: 4.7, maxZ: 5.3 }, // plante exobiologique
  // Les coins cassés.
  { minX: -1, maxX: 1.5, minZ: -1, maxZ: 0.5 },
  { minX: -1, maxX: 0.5, minZ: -1, maxZ: 1.5 },
  { minX: -1, maxX: 0.5, minZ: 5.5, maxZ: 7 },
]

/** Les murs de la serre (faces intérieures) : elle reste dedans. */
const ROOM = { minX: -0.5, maxX: 7.5, minZ: -0.5, maxZ: 6.5 }

/** Sa carrure, avec une marge. */
const RADIUS = 0.17

/**
 * Postes de sa tournée, dans l'ordre : où elle se tient, son orientation, le temps passé et ce
 * qu'elle y fait (le geste et le bruit, cf. src/gardener.ts). Le trajet de l'un à l'autre est
 * calculé (cf. gardenRoute) : elle contourne les bacs.
 */
const POSTS = [
  { at: 'seeds', x: 2.5, z: 0.35, yaw: NORTH, watch: 6, work: 'sort' },
  { at: 'racks', x: 4.4, z: 0.45, yaw: NORTH, watch: 7, work: 'water' },
  { at: 'tomato', x: 3.9, z: 2.2, yaw: NORTH, watch: 8, work: 'harvest' },
  { at: 'tree', x: 1.3, z: 2.2, yaw: NORTH, watch: 6, work: 'harvest' },
  { at: 'pond', x: 2.3, z: 4.35, yaw: WEST, watch: 7, work: 'feed' },
  { at: 'barrel', x: 0.85, z: 5.35, yaw: WEST, watch: 4, work: 'water' },
  { at: 'flowers', x: 4.0, z: 4.45, yaw: SOUTH, watch: 7, work: 'water' },
  { at: 'bench', x: 5.6, z: 5.5, yaw: SOUTH, watch: 8, work: 'dig' },
  { at: 'compost', x: 6.35, z: 5.45, yaw: EAST, watch: 5, work: 'dig' },
  { at: 'lettuce', x: 4.5, z: 3.65, yaw: NORTH, watch: 6, work: 'water' },
  { at: 'herbs', x: 5.9, z: 2.2, yaw: NORTH, watch: 6, work: 'trim' },
  { at: 'tank', x: 5.95, z: 0.6, yaw: NORTH, watch: 5, work: 'look' },
  { at: 'crate', x: 6.95, z: 0.65, yaw: NORTH, watch: 5, work: 'sort' },
]

/** Longueur d'une ligne brisée. */
export function pathLength(points) {
  let length = 0
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  return length
}

/** Le segment de `a` à `b` évite-t-il ce rectangle, élargi de `margin` ? (découpage de Liang-Barsky) */
function clearOf(a, b, r, margin) {
  const minX = r.minX - margin, maxX = r.maxX + margin, minZ = r.minZ - margin, maxZ = r.maxZ + margin
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

/** Le segment de `a` à `b` évite-t-il tous les meubles de la serre ? */
export function gardenClear(a, b) {
  return GARDEN_OBSTACLES.every((r) => clearOf(a, b, r, RADIUS))
}

/**
 * Les points de passage : les coins des meubles, élargis un peu plus que sa carrure, qui tombent
 * dans la serre et hors de tout meuble. Un chemin qui contourne des rectangles passe par leurs coins.
 */
const WAYPOINTS = []
{
  const out = RADIUS + 0.06
  for (const r of GARDEN_OBSTACLES) {
    for (const x of [r.minX - out, r.maxX + out]) for (const z of [r.minZ - out, r.maxZ + out]) {
      if (x < ROOM.minX + RADIUS || x > ROOM.maxX - RADIUS || z < ROOM.minZ + RADIUS || z > ROOM.maxZ - RADIUS) continue
      if (GARDEN_OBSTACLES.some((o) => x > o.minX - RADIUS && x < o.maxX + RADIUS && z > o.minZ - RADIUS && z < o.maxZ + RADIUS)) continue
      WAYPOINTS.push([x, z])
    }
  }
}

/**
 * Trajet d'un point à un autre de la serre : tout droit s'il ne traverse aucun meuble, sinon le
 * plus court par les coins des meubles (Dijkstra sur les points de passage reliés s'ils se voient).
 * Rend les points à suivre, arrivée comprise (sans le départ).
 */
export function gardenRoute(from, to) {
  const start = [from.x, from.z], end = [to.x, to.z]
  if (gardenClear(start, end)) return [end]
  const nodes = [start, end, ...WAYPOINTS]
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
      if (done[v] || !gardenClear(nodes[u], nodes[v])) continue
      const d = dist[u] + Math.hypot(nodes[v][0] - nodes[u][0], nodes[v][1] - nodes[u][1])
      if (d < dist[v]) {
        dist[v] = d
        prev[v] = u
      }
    }
  }
  // Coincée (elle ne devrait jamais l'être) : elle y va tout droit.
  if (dist[1] === Infinity) return [end]
  const route = []
  for (let v = 1; v > 0; v = prev[v]) route.unshift(nodes[v])
  return route
}

/** Postes de sa tournée, avec le trajet depuis le poste précédent (le dernier point est le poste). */
export const GARDEN_POSTS = POSTS.map((post, i) => {
  const before = POSTS[(i - 1 + POSTS.length) % POSTS.length]
  return { ...post, path: gardenRoute(before, post) }
})

/** Tout près de sa place, elle y va tout droit. */
const NEAR = 0.3

/** Elle rattrape sa place un peu plus vite qu'elle ne marche (facteur de son pas). */
export const GARDEN_CATCH_UP = 1.3
/**
 * Au-delà de cet écart avec sa place, par le chemin, elle y saute : plus long que n'importe quel
 * trajet de la serre (d'un coin à l'autre, une douzaine d'unités au plus), elle ne saute donc que
 * si elle est vraiment perdue.
 */
export const GARDEN_SNAP = 14

/**
 * Un pas de la jardinière vers sa place `goal`, d'au plus `max` : sa nouvelle position, son cap
 * si elle a bougé, la distance parcourue et celle qui lui restait par le chemin (`left`, avant ce pas).
 */
export function gardenStep(from, goal, max) {
  const route = Math.hypot(goal.x - from.x, goal.z - from.z) < NEAR ? [[goal.x, goal.z]] : gardenRoute(from, goal)
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
  const last = GARDEN_POSTS[GARDEN_POSTS.length - 1]
  let from = [last.x, last.z]
  GARDEN_POSTS.forEach((post, index) => {
    for (const to of post.path) {
      const length = Math.hypot(to[0] - from[0], to[1] - from[1])
      if (length > 1e-6) {
        const heading = Math.atan2(to[0] - from[0], to[1] - from[1])
        STEPS.push({ walk: true, from, to, start: tau, duration: length / GARDEN_SPEED, heading, post: index })
        tau += length / GARDEN_SPEED
      }
      from = to
    }
    STEPS.push({ walk: false, from, to: from, start: tau, duration: post.watch, heading: post.yaw, post: index })
    tau += post.watch
  })
}

/** Durée d'une tournée complète (secondes). */
export const GARDEN_PERIOD = tau

/**
 * La jardinière à l'instant `t` de sa tournée (secondes, n'importe quel tour) : position, cap,
 * marche-t-elle, et le poste vers lequel elle va ou auquel elle travaille.
 */
export function gardenAt(t) {
  const local = ((t % GARDEN_PERIOD) + GARDEN_PERIOD) % GARDEN_PERIOD
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

/** Temps qu'il lui faut pour revenir de là où elle attend son aide à sa place dans la tournée, à l'instant `t` (secondes). */
export function gardenReturn(t) {
  const at = gardenAt(t)
  return pathLength([[GARDEN_WAIT.x, GARDEN_WAIT.z], ...gardenRoute(GARDEN_WAIT, at)]) / GARDEN_SPEED
}

/** Horloge de la tournée (même forme que celle de la ronde, cf. patrol.js). */
export const gardenTime = patrolTime

/** On lui parle à l'instant `now` (ms) : sa tournée s'arrête pour `seconds`. */
export function holdGarden(clock, now, seconds = GARDEN_HOLD) {
  return holdPatrol(clock, now, seconds)
}

/**
 * Les fiches de culture en cours ont changé à l'instant `now` (ms) : `until` est la fin de la
 * dernière (ms, ou 0 s'il n'y en a plus). La tournée reste figée jusque-là, plus le retour.
 */
export function helpGarden(clock, now, until) {
  const t = patrolTime(clock, now)
  return { tau: t, at: now, holdUntil: Math.max(now, until) + gardenReturn(t) * 1000 }
}
