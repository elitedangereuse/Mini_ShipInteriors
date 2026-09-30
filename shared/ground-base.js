// L'avant-poste Bradbury, une base au sol sur une planète désertique rouge (cf. src/base/, qui la
// dessine avec le Space Kit de Kenney). On y descend en Krait depuis le hangar de la cale : c'est
// un lieu commun, comme un pont, où tous ceux qui y ont atterri se croisent. Son plan, le Krait
// posé sur son aire (on y remonte par l'escabeau pour repartir), et la ronde d'Ada Kerlan, la
// cheffe de la base, qui est la même pour tous : comme le sergent Rourke (cf. patrol.js), sa
// position ne dépend que d'une horloge que le relais tient, figée quelques secondes quand on lui
// parle. Le relais tient aussi l'allumage des réacteurs du Krait de la base, pour que tous le
// voient cracher avant de décoller.

import { holdPatrol, patrolTime } from './patrol.js'

/** « Pont » de la base : hors du vaisseau (cf. LEVEL_HEIGHT côté client). */
export const BASE_LEVEL = 3

/**
 * Le plateau, une ligne par rangée de tuiles (x de 0 à 37, z de 0 à 22) : une seule pièce, la
 * surface (« s »), sans murs, bordée de falaises. Chaque rangée : [début, fin] (compris), une ou
 * deux coulées.
 */
const ROWS = [
  [[6, 16], [24, 31]],
  [[3, 19], [21, 33]],
  [[2, 34]],
  [[1, 35]],
  [[1, 36]],
  [[0, 36]],
  [[0, 37]],
  [[0, 37]],
  [[0, 37]],
  [[0, 37]],
  [[0, 37]],
  [[0, 37]],
  [[0, 37]],
  [[0, 37]],
  [[0, 37]],
  [[0, 37]],
  [[0, 36]],
  [[1, 36]],
  [[1, 35]],
  [[2, 35]],
  [[3, 33]],
  [[4, 16], [20, 31]],
  [[7, 13], [23, 28]],
]

export const BASE_LAYOUT = ROWS.map((runs) => {
  const line = Array(38).fill(' ')
  for (const [a, b] of runs) for (let x = a; x <= b; x++) line[x] = 's'
  return line.join('').trimEnd()
})

/** Le Krait de la base, nez à l'ouest (vers la base), sur son aire à l'est du plateau. */
export const BASE_KRAIT = { x: 28, z: 11 }
/** L'escabeau du cockpit, devant le nez (cf. KRAIT_LADDER_REACH côté client). */
export const BASE_LADDER = { x: 24.25, z: 11 }
/** Le siège du pilote, sur le plateau (cf. KRAIT_PILOT). */
export const BASE_COCKPIT = { x: BASE_KRAIT.x - 2.05, z: BASE_KRAIT.z }

/** Où l'on pose le pied en arrivant : à côté du pied de l'escabeau, face à la base. */
export const BASE_ARRIVAL = { x: 23, z: 12.2, yaw: -Math.PI / 2 }
/** Au retour, dans le hangar de la cale : à côté du pied de l'escabeau du Krait (cf. levels.ts). */
export const HANGAR_ARRIVAL = { level: -1, x: 36.1, z: 4.2, yaw: -Math.PI / 2 }

/** Les réacteurs du Krait de la base se coupent d'eux-mêmes au bout de ce temps (secondes). */
export const BASE_BURN = 8

/** Un joueur est-il installé aux commandes du Krait de la base ? (le siège, à la latence près) */
export function inBaseCockpit(p) {
  return p.level === BASE_LEVEL && p.pose === 'pilot' && Math.hypot(p.x - BASE_COCKPIT.x, p.z - BASE_COCKPIT.z) < 0.6
}

// --------------------------------------------------------------- la cheffe de base

/** Pas de la cheffe (unités par seconde). */
export const CHIEF_SPEED = 0.9

/** Temps d'arrêt quand on lui parle (secondes) ; chaque réplique relance l'arrêt. */
export const CHIEF_HOLD = 7

/** Orientations : face au sud (+z), au nord (-z), à l'est (+x), à l'ouest (-x). */
const SOUTH = 0
const NORTH = Math.PI
const EAST = Math.PI / 2
const WEST = -Math.PI / 2

/**
 * Postes de sa ronde, dans l'ordre : ce qu'elle y surveille, le trajet depuis le poste précédent
 * (le dernier point est le poste lui-même), le temps passé (secondes) et où elle regarde. Les
 * trajets suivent les pistes de la base, loin des bâtiments (cf. src/base/level.ts : à refaire si
 * un bâtiment bouge).
 */
export const CHIEF_POSTS = [
  { at: 'pad', path: [[22.2, 11], [22.2, 9.4]], watch: 7, yaw: EAST },
  { at: 'tower', path: [[21, 9.4], [21, 7.6]], watch: 5, yaw: NORTH },
  { at: 'garage', path: [[21, 8], [16, 8], [16, 7.2]], watch: 5, yaw: NORTH },
  { at: 'greenhouse', path: [[16, 8], [12, 8], [9.4, 8]], watch: 6, yaw: NORTH },
  { at: 'quarters', path: [[12, 8], [12, 11], [7.6, 11]], watch: 5, yaw: WEST },
  { at: 'rocket', path: [[12, 11], [12, 14.4], [8.6, 14.4]], watch: 6, yaw: WEST },
  { at: 'machines', path: [[12, 14.4], [12, 16.4], [14.6, 16.4]], watch: 5, yaw: SOUTH },
  { at: 'crystals', path: [[12, 16.4], [12, 14.4], [21, 14.4], [29, 17.6]], watch: 6, yaw: EAST },
  { at: 'pad', path: [[21, 14.4], [21, 12.6]], watch: 4, yaw: EAST },
]

/** La ronde à plat : chaque tronçon de marche, puis chaque garde, bout à bout. */
const STEPS = []
let tau = 0
{
  const last = CHIEF_POSTS[CHIEF_POSTS.length - 1].path
  let from = last[last.length - 1]
  let heading = 0
  CHIEF_POSTS.forEach((post, index) => {
    for (const to of post.path) {
      const length = Math.hypot(to[0] - from[0], to[1] - from[1])
      if (length > 1e-6) {
        heading = Math.atan2(to[0] - from[0], to[1] - from[1])
        STEPS.push({ walk: true, from, to, start: tau, duration: length / CHIEF_SPEED, heading, post: index })
        tau += length / CHIEF_SPEED
      }
      from = to
    }
    STEPS.push({ walk: false, from, to: from, start: tau, duration: post.watch, heading: post.yaw, post: index })
    tau += post.watch
  })
}

/** Durée d'un tour complet (secondes). */
export const CHIEF_PERIOD = tau

/** La cheffe à l'instant `t` de sa ronde (secondes, n'importe quel tour). */
export function chiefAt(t) {
  const local = ((t % CHIEF_PERIOD) + CHIEF_PERIOD) % CHIEF_PERIOD
  let lo = 0, hi = STEPS.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (STEPS[mid].start <= local) lo = mid
    else hi = mid - 1
  }
  const s = STEPS[lo]
  if (s.walk) {
    const k = Math.min(1, (local - s.start) / s.duration)
    return { x: s.from[0] + (s.to[0] - s.from[0]) * k, z: s.from[1] + (s.to[1] - s.from[1]) * k, yaw: s.heading, walking: true, post: s.post }
  }
  return { x: s.from[0], z: s.from[1], yaw: s.heading, walking: false, post: s.post }
}

/** Horloge de la ronde (cf. patrolTime). */
export const chiefTime = patrolTime

/** On lui parle à l'instant `now` (ms) : l'horloge s'arrête pour `seconds`. */
export function holdChief(clock, now, seconds = CHIEF_HOLD) {
  return holdPatrol(clock, now, seconds)
}
