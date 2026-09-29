// Betty, l'infirmière (cf. src/nurse.ts, qui la dessine, et src/infirmary.ts, la consultation).
// Comme le sergent Rourke (cf. patrol.js) et Marcel (cf. chef.js), elle est la même pour tout le
// bord : sa tournée de l'infirmerie ne dépend que d'une horloge que le relais tient pour tous,
// figée quelques secondes quand on lui parle. Quand un joueur allongé sur un lit l'appelle, elle
// vient à son chevet : le relais fige sa tournée tant que dure la consultation, plus le temps de
// revenir là où elle l'avait laissée. Une consultation menée à son terme laisse un pansement,
// que tout le bord voit un moment.

import { holdPatrol, patrolTime } from './patrol.js'

/** Pont et pièce de l'infirmière. */
export const NURSE_LEVEL = 0
export const NURSE_ROOM = 'q'

/** Pas de l'infirmière (unités par seconde). */
export const NURSE_SPEED = 0.8

/** Temps d'arrêt quand on lui parle (secondes). */
export const NURSE_HOLD = 6

/** Une consultation la retient au chevet au plus ce temps-là (secondes). */
export const NURSE_CARE = 40

/** Durée minimale d'une consultation menée à son terme (secondes) : en deçà, pas de pansement. */
export const NURSE_CARE_MIN = 8

/** Le pansement reste ce temps-là (secondes). */
export const NURSE_PATCH = 600

/** Orientations : face au sud (+z), au nord (-z), à l'est (+x), à l'ouest (-x). */
const SOUTH = 0
const NORTH = Math.PI
const EAST = Math.PI / 2
const WEST = -Math.PI / 2

/**
 * Les trois lits, le long du mur nord (cf. levels.ts) ; on s'y allonge depuis l'est. Au chevet,
 * Betty se tient du côté est, un peu vers le pied, tournée vers la poitrine du patient.
 */
export const NURSE_BEDS = [9.2, 10.5, 11.8].map((x) => {
  const side = { x: x + 0.52, z: 0.62 }
  return { x, z: 0.3, side: { ...side, yaw: Math.atan2(x - side.x, 0.3 - side.z) } }
})

/**
 * Meubles de l'infirmerie (rectangles au sol, cf. levels.ts) : ses trajets ne les traversent
 * pas. Chaque rectangle est élargi de sa carrure (cf. RADIUS).
 */
export const NURSE_OBSTACLES = [
  ...NURSE_BEDS.flatMap((b) => [
    // Le lit et son moniteur (côté ouest), puis l'arche du scanner, qui dépasse à la tête.
    { minX: b.x - 0.46, maxX: b.x + 0.28, minZ: -0.25, maxZ: 0.85 },
    { minX: b.x + 0.28, maxX: b.x + 0.375, minZ: -0.1, maxZ: 0 },
    // Pied à perfusion, à la tête du lit.
    { minX: b.x + 0.38, maxX: b.x + 0.52, minZ: -0.2, maxZ: -0.04 },
  ]),
  { minX: 12.88, maxX: 13.52, minZ: 0.08, maxZ: 0.72 }, // scanner corporel
  { minX: 14, maxX: 14.5, minZ: -0.33, maxZ: 0.09 }, // frigo à vaccins
  { minX: 8.67, maxX: 8.97, minZ: 1, maxZ: 1.6 }, // pharmacie
  { minX: 9.02, maxX: 10.18, minZ: 2.35, maxZ: 2.85 }, // poste de soins
  { minX: 10.78, maxX: 11.77, minZ: 2.85, maxZ: 3.27 }, // chaises de la salle d'attente
  { minX: 12.1, maxX: 12.4, minZ: 2.95, maxZ: 3.35 }, // toise
  { minX: 13.74, maxX: 14.26, minZ: 3, maxZ: 3.35 }, // lavabo
  { minX: 14.55, maxX: 15.15, minZ: 2.6, maxZ: 3.3 }, // fauteuil roulant
  { minX: 14.81, maxX: 15.29, minZ: 1.11, maxZ: 1.59 }, // quarantaine
]

/** Sa carrure, avec une marge. */
const RADIUS = 0.17

/** L'allée du milieu, entre les pieds des lits et le poste de soins. */
const AISLE_Z = 1.65
const AISLE_MIN_X = 9.3
const AISLE_MAX_X = 14.4

/** Derrière le poste de soins : on y entre par l'est, entre le comptoir et les chaises. */
const DESK_GATE = [10.45, 3.1]
const DESK_DOOR = [10.45, 2.2]

/** Son poste, derrière le comptoir, face aux lits. */
export const NURSE_DESK = { x: 9.6, z: 3.1, yaw: NORTH }

/**
 * Postes de sa tournée, dans l'ordre : trajet depuis le poste précédent (le dernier point est le
 * poste), temps passé, orientation, et ce qu'elle y fait (le geste, cf. src/nurse.ts).
 */
export const NURSE_POSTS = [
  { at: 'desk', path: [DESK_DOOR, DESK_GATE, [NURSE_DESK.x, NURSE_DESK.z]], watch: 9, yaw: NURSE_DESK.yaw, work: 'type' },
  { at: 'cabinet', path: [DESK_GATE, DESK_DOOR, [9.3, 1.3]], watch: 4, yaw: WEST, work: 'fetch' },
  { at: 'bed', path: [[9.2, 1.15]], watch: 4, yaw: NORTH, work: 'check' },
  { at: 'bed', path: [[10.5, 1.15]], watch: 4, yaw: NORTH, work: 'check' },
  { at: 'bed', path: [[11.8, 1.15]], watch: 4, yaw: NORTH, work: 'check' },
  { at: 'scanner', path: [[13.2, 1.05]], watch: 4, yaw: NORTH, work: 'check' },
  { at: 'fridge', path: [[13.9, 1.05], [14.25, 0.45]], watch: 4, yaw: NORTH, work: 'fetch' },
  { at: 'tank', path: [[14.45, 1.35]], watch: 5, yaw: EAST, work: 'look' },
  { at: 'sink', path: [[14, 2.7]], watch: 4, yaw: SOUTH, work: 'wash' },
  { at: 'waiting', path: [[11.9, 2.45]], watch: 4, yaw: SOUTH, work: 'look' },
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
export function nurseClear(a, b) {
  return NURSE_OBSTACLES.every((r) => clearOf(a, b, r))
}

const aisle = (x) => [Math.min(AISLE_MAX_X, Math.max(AISLE_MIN_X, x)), AISLE_Z]

/**
 * Trajet d'un point à un autre de l'infirmerie : tout droit s'il ne traverse aucun meuble, sinon
 * le plus court par l'allée du milieu et l'entrée du poste de soins. Rend les points à suivre,
 * arrivée comprise (sans le départ).
 */
export function nurseRoute(from, to) {
  const start = [from.x, from.z], end = [to.x, to.z]
  if (nurseClear(start, end)) return [end]
  // Plus court chemin (Dijkstra) sur quelques points de passage, reliés s'ils se voient.
  const nodes = [start, end, aisle(from.x), aisle(to.x), [DESK_DOOR[0], AISLE_Z], DESK_DOOR, DESK_GATE]
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
      if (done[v] || !nurseClear(nodes[u], nodes[v])) continue
      const d = dist[u] + Math.hypot(nodes[v][0] - nodes[u][0], nodes[v][1] - nodes[u][1])
      if (d < dist[v]) {
        dist[v] = d
        prev[v] = u
      }
    }
  }
  if (dist[1] === Infinity) return [aisle(from.x), aisle(to.x), end]
  const route = []
  for (let v = 1; v > 0; v = prev[v]) route.unshift(nodes[v])
  return route
}

/** Tout près de sa place, elle y va tout droit. */
const NEAR = 0.3

/** Elle rattrape sa place un peu plus vite qu'elle ne marche (facteur de son pas). */
export const NURSE_CATCH_UP = 1.3
/**
 * Au-delà de cet écart avec sa place, par le chemin, elle y saute : plus long que n'importe quel
 * trajet de l'infirmerie, elle ne saute donc que si elle est vraiment perdue.
 */
export const NURSE_SNAP = 12

/**
 * Un pas de l'infirmière vers sa place `goal`, d'au plus `max` : sa nouvelle position, son cap
 * si elle a bougé, la distance parcourue et celle qui lui restait par le chemin (`left`, avant ce pas).
 */
export function nurseStep(from, goal, max) {
  const route = Math.hypot(goal.x - from.x, goal.z - from.z) < NEAR ? [[goal.x, goal.z]] : nurseRoute(from, goal)
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
  const last = NURSE_POSTS[NURSE_POSTS.length - 1].path
  let from = last[last.length - 1]
  NURSE_POSTS.forEach((post, index) => {
    for (const to of post.path) {
      const length = Math.hypot(to[0] - from[0], to[1] - from[1])
      if (length > 1e-6) {
        const heading = Math.atan2(to[0] - from[0], to[1] - from[1])
        STEPS.push({ walk: true, from, to, start: tau, duration: length / NURSE_SPEED, heading, post: index })
        tau += length / NURSE_SPEED
      }
      from = to
    }
    STEPS.push({ walk: false, from, to: from, start: tau, duration: post.watch, heading: post.yaw, post: index })
    tau += post.watch
  })
}

/** Durée d'une tournée complète (secondes). */
export const NURSE_PERIOD = tau

/**
 * L'infirmière à l'instant `t` de sa tournée (secondes, n'importe quel tour) : position, cap,
 * marche-t-elle, et le poste vers lequel elle va ou auquel elle travaille.
 */
export function nurseAt(t) {
  const local = ((t % NURSE_PERIOD) + NURSE_PERIOD) % NURSE_PERIOD
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

/** Lit le plus proche d'un joueur allongé (indice dans NURSE_BEDS), s'il est bien dessus ; sinon -1. */
export function bedOf(p) {
  let best = -1, closest = 0.6
  NURSE_BEDS.forEach((b, i) => {
    const d = Math.hypot(p.x - b.x, p.z - b.z)
    if (d < closest) {
      best = i
      closest = d
    }
  })
  return best
}

/** Temps qu'il lui faut pour revenir du chevet du lit `bed` à sa place dans la tournée, à l'instant `t` (secondes). */
export function nurseReturn(t, bed) {
  const at = nurseAt(t)
  const side = NURSE_BEDS[bed].side
  return pathLength([[side.x, side.z], ...nurseRoute(side, at)]) / NURSE_SPEED
}

/** Horloge de la tournée (même forme que celle de la ronde, cf. patrol.js). */
export const nurseTime = patrolTime

/** On lui parle à l'instant `now` (ms) : sa tournée s'arrête pour `seconds`. */
export function holdNurse(clock, now, seconds = NURSE_HOLD) {
  return holdPatrol(clock, now, seconds)
}

/**
 * Une consultation au lit `bed` commence ou change à l'instant `now` (ms) ; `until` est sa fin
 * (ms, ou 0 si elle est finie). La tournée reste figée jusque-là, plus le retour depuis le chevet.
 */
export function careNurse(clock, now, until, bed) {
  const t = patrolTime(clock, now)
  return { tau: t, at: now, holdUntil: Math.max(now, until) + nurseReturn(t, bed) * 1000 }
}
