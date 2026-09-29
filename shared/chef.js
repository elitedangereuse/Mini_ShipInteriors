// Marcel, le chef du mess (cf. src/chef.ts, qui le dessine). Comme le sergent Rourke (cf.
// patrol.js), il est le même pour tout le bord : sa tournée des postes de la cuisine ne dépend
// que d'une horloge que le relais tient pour tous, figée quelques secondes quand on lui parle.
// Quand un joueur cuisine avec lui (une commande prise au rail de la passe), il l'attend au bout
// de la ligne du self, sans gêner la passe : le relais fige sa tournée tant qu'il y a un commis
// aux fourneaux, plus le temps de revenir là où il l'avait laissée.

import { holdPatrol, patrolTime } from './patrol.js'

/** Pont et pièce du chef. */
export const CHEF_LEVEL = 0
export const CHEF_ROOM = 'm'

/** Pas du chef (unités par seconde). */
export const CHEF_SPEED = 0.85

/** Temps d'arrêt quand on lui parle (secondes). */
export const CHEF_HOLD = 6

/** Une commande en cours le retient au bout du self ce temps-là (secondes), relancé à chaque étape. */
export const CHEF_COOK = 45

/** Face aux fourneaux (sud) ou face à la salle (nord). */
const SOUTH = 0
const NORTH = Math.PI

/** La passe, où il envoie les plats, face à la salle. */
export const CHEF_PASSE = { x: 11.5, z: 10.6, yaw: NORTH }

/**
 * Où il attend son commis pendant une commande : au bout de la ligne du self, derrière le pain et
 * les boissons, face à la salle ; la passe reste libre pour dresser.
 */
export const CHEF_WAIT = { x: 13.45, z: 10.6, yaw: NORTH }

/**
 * Passage entre la cuisine et la salle, à l'est du comptoir : côté cuisine, côté salle. Le
 * comptoir court de x = 8,65 à 13,85 entre z = 9,7 et 10,3 (cf. levels.ts).
 */
const KITCHEN_GATE = [14.6, 10.9]
const DINING_GATE = [14.6, 9.2]

/**
 * Postes de sa tournée, dans l'ordre : trajet depuis le poste précédent (le dernier point est le
 * poste), temps passé, orientation, et ce qu'il y fait (le geste et le bruit, cf. src/chef.ts).
 * Dans la cuisine, les postes sont le long de l'allée (z = 11,45), devant les meubles.
 */
export const CHEF_POSTS = [
  { at: 'fridge', path: [[9.15, 11.45]], watch: 4, yaw: SOUTH, work: 'fetch' },
  { at: 'prep', path: [[10.35, 11.45]], watch: 8, yaw: SOUTH, work: 'chop' },
  { at: 'range', path: [[11.8, 11.45]], watch: 9, yaw: SOUTH, work: 'stir' },
  { at: 'passe', path: [[CHEF_PASSE.x, CHEF_PASSE.z]], watch: 5, yaw: NORTH, work: 'serve' },
  { at: 'sink', path: [[13.15, 11.45]], watch: 6, yaw: SOUTH, work: 'wash' },
  { at: 'range', path: [[11.8, 11.45]], watch: 6, yaw: SOUTH, work: 'stir' },
  { at: 'pantry', path: [[14.65, 11.45]], watch: 5, yaw: SOUTH, work: 'fetch' },
  // Le tour de salle : il sort par le passage, jette un œil aux tables, puis rentre.
  { at: 'hall', path: [KITCHEN_GATE, DINING_GATE, [12, 9.2]], watch: 6, yaw: NORTH, work: 'look' },
  { at: 'prep', path: [DINING_GATE, KITCHEN_GATE, [10.35, 11.45]], watch: 7, yaw: SOUTH, work: 'chop' },
]

/** Longueur d'une ligne brisée. */
export function pathLength(points) {
  let length = 0
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  return length
}

/**
 * Le comptoir, élargi de la carrure du chef et d'une marge : ses trajets ne le traversent pas.
 * La passe et le bout du self (z = 10,6) restent juste derrière.
 */
const COUNTER = { minX: 8.4, maxX: 14.1, minZ: 9.4, maxZ: 10.52 }

/** Le segment de `a` à `b` évite-t-il le comptoir ? (découpage de Liang-Barsky) */
function clear(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  let t0 = 0, t1 = 1
  for (const [p, q] of [[-dx, a[0] - COUNTER.minX], [dx, COUNTER.maxX - a[0]], [-dz, a[1] - COUNTER.minZ], [dz, COUNTER.maxZ - a[1]]]) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return true
      continue
    }
    const r = q / p
    if (p < 0) t0 = Math.max(t0, r)
    else t1 = Math.min(t1, r)
    if (t0 > t1) return true
  }
  return false
}

/**
 * Trajet d'un point à un autre de la cuisine ou de la salle : tout droit s'il ne traverse pas le
 * comptoir, sinon le plus court par les entrées du passage. Rend les points à suivre, arrivée
 * comprise (sans le départ).
 */
export function chefRoute(from, to) {
  const start = [from.x, from.z], end = [to.x, to.z]
  if (clear(start, end)) return [end]
  let best = null, shortest = Infinity
  for (const via of [[DINING_GATE], [KITCHEN_GATE], [DINING_GATE, KITCHEN_GATE], [KITCHEN_GATE, DINING_GATE]]) {
    const route = [...via, end]
    const points = [start, ...route]
    if (!points.slice(1).every((p, i) => clear(points[i], p))) continue
    const length = pathLength(points)
    if (length < shortest) {
      best = route
      shortest = length
    }
  }
  return best ?? [DINING_GATE, KITCHEN_GATE, end]
}

/**
 * Tout près de sa place, il y va tout droit : il suit sa tournée, qui ne traverse jamais le
 * comptoir. Plus loin (il revient du bout du self, il arrive à bord), il prend le chemin.
 */
const NEAR = 0.3

/** Il rattrape sa place un peu plus vite qu'il ne marche (facteur de son pas). */
export const CHEF_CATCH_UP = 1.3
/**
 * Au-delà de cet écart avec sa place, par le chemin, il y saute : plus long que n'importe quel
 * trajet du mess (du frigo au tour de salle, environ 10), il ne saute donc que s'il est vraiment
 * perdu (horloge du relais très différente de la sienne, après une coupure).
 */
export const CHEF_SNAP = 12

/**
 * Un pas du chef vers sa place `goal`, d'au plus `max` : sa nouvelle position, son cap s'il a
 * bougé, la distance parcourue et celle qui lui restait par le chemin (`left`, avant ce pas).
 */
export function chefStep(from, goal, max) {
  const route = Math.hypot(goal.x - from.x, goal.z - from.z) < NEAR ? [[goal.x, goal.z]] : chefRoute(from, goal)
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
  const last = CHEF_POSTS[CHEF_POSTS.length - 1].path
  let from = last[last.length - 1]
  let heading = 0
  CHEF_POSTS.forEach((post, index) => {
    for (const to of post.path) {
      const length = Math.hypot(to[0] - from[0], to[1] - from[1])
      if (length > 1e-6) {
        heading = Math.atan2(to[0] - from[0], to[1] - from[1])
        STEPS.push({ walk: true, from, to, start: tau, duration: length / CHEF_SPEED, heading, post: index })
        tau += length / CHEF_SPEED
      }
      from = to
    }
    STEPS.push({ walk: false, from, to: from, start: tau, duration: post.watch, heading: post.yaw, post: index })
    tau += post.watch
  })
}

/** Durée d'une tournée complète (secondes). */
export const CHEF_PERIOD = tau

/**
 * Le chef à l'instant `t` de sa tournée (secondes, n'importe quel tour) : position, cap, marche-t-il,
 * et le poste vers lequel il va ou auquel il travaille.
 */
export function chefAt(t) {
  const local = ((t % CHEF_PERIOD) + CHEF_PERIOD) % CHEF_PERIOD
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

/** Temps qu'il lui faut pour revenir du bout du self à sa place dans la tournée, à l'instant `t` (secondes). */
export function chefReturn(t) {
  const at = chefAt(t)
  const route = chefRoute(CHEF_WAIT, at)
  return pathLength([[CHEF_WAIT.x, CHEF_WAIT.z], ...route]) / CHEF_SPEED
}

/** Horloge de la tournée (même forme que celle de la ronde, cf. patrol.js). */
export const chefTime = patrolTime

/** On lui parle à l'instant `now` (ms) : sa tournée s'arrête pour `seconds`. */
export function holdChef(clock, now, seconds = CHEF_HOLD) {
  return holdPatrol(clock, now, seconds)
}

/**
 * Les commandes en cours ont changé à l'instant `now` (ms) : `until` est la fin de la dernière
 * (ms, ou 0 s'il n'y en a plus). La tournée reste figée jusque-là, plus le retour depuis le bout du self.
 */
export function cookChef(clock, now, until) {
  const t = patrolTime(clock, now)
  return { tau: t, at: now, holdUntil: Math.max(now, until) + chefReturn(t) * 1000 }
}
