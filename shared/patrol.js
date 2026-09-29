// Ronde du sergent Rourke, sur le pont principal (cf. src/patrol.ts, qui le dessine). Tout le
// bord voit le même sergent au même endroit : sa position ne dépend que de l'horloge de la ronde,
// que le relais tient pour tous. Quand un joueur lui parle, le relais fige cette horloge quelques
// secondes : le sergent s'arrête chez tout le monde, puis reprend là où il s'était arrêté.

/** Pont de la ronde. */
export const PATROL_LEVEL = 0

/** Pas du sergent (unités par seconde). */
export const PATROL_SPEED = 1.05

/** Temps d'arrêt quand on lui parle (secondes) ; chaque réplique relance l'arrêt. */
export const PATROL_HOLD = 8

/**
 * Postes de la ronde, dans l'ordre : la pièce, le trajet depuis le poste précédent (le dernier
 * point est le poste lui-même) et le temps passé à surveiller les lieux (secondes). Les trajets
 * sont ceux du pathfinder du pont principal, lissés, à au moins 0,17 de tout meuble et de tout mur
 * (vérifiés dans le jeu ; à refaire si le mobilier du pont bouge).
 */
export const PATROL_POSTS = [
  { room: 'e', path: [[13, 6], [13, 5], [4.5, 3.5]], watch: 6 },
  { room: 'q', path: [[9, 4], [13, 4], [13, 2]], watch: 5 },
  { room: 'r', path: [[13, 4], [18, 4], [18, 2]], watch: 5 },
  { room: 'c', path: [[18, 4], [22.5, 4.5]], watch: 3 },
  { room: 'b', path: [[26, 4], [29, 3], [30, 4], [32, 4], [34, 3]], watch: 7 },
  { room: 'promenade', path: [[32, 4], [30, 4], [28, 2]], watch: 6 },
  { room: 'promenade', path: [[29, 4], [29, 7], [28, 7.5]], watch: 5 },
  { room: 's', path: [[26, 5], [23, 5], [23, 7], [19, 7]], watch: 5 },
  { room: 'm', path: [[18, 6], [18, 5], [13, 5], [13, 6], [12, 7]], watch: 5 },
]

/**
 * La ronde à plat : chaque tronçon de marche (de, vers, début, durée, cap), puis chaque garde
 * (poste, début, durée, cap à l'arrivée), bout à bout.
 */
const STEPS = []
let tau = 0
{
  const last = PATROL_POSTS[PATROL_POSTS.length - 1].path
  let from = last[last.length - 1]
  let heading = 0
  PATROL_POSTS.forEach((post, index) => {
    for (const to of post.path) {
      const length = Math.hypot(to[0] - from[0], to[1] - from[1])
      if (length > 1e-6) {
        heading = Math.atan2(to[0] - from[0], to[1] - from[1])
        STEPS.push({ walk: true, from, to, start: tau, duration: length / PATROL_SPEED, heading, post: index })
        tau += length / PATROL_SPEED
      }
      from = to
    }
    STEPS.push({ walk: false, from, to: from, start: tau, duration: post.watch, heading, post: index })
    tau += post.watch
  })
}

/** Durée d'un tour complet (secondes). */
export const PATROL_PERIOD = tau

/**
 * Le sergent à l'instant `t` de la ronde (secondes, n'importe quel tour) : position, cap
 * (il balaie la pièce du regard à chaque poste), marche-t-il, et le poste vers lequel il va ou
 * qu'il surveille.
 */
export function patrolAt(t) {
  const local = ((t % PATROL_PERIOD) + PATROL_PERIOD) % PATROL_PERIOD
  let lo = 0, hi = STEPS.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (STEPS[mid].start <= local) lo = mid
    else hi = mid - 1
  }
  const s = STEPS[lo]
  const k = Math.min(1, (local - s.start) / s.duration)
  if (s.walk) {
    return { x: s.from[0] + (s.to[0] - s.from[0]) * k, z: s.from[1] + (s.to[1] - s.from[1]) * k, yaw: s.heading, walking: true, post: s.post }
  }
  // Au poste : un regard à droite, un à gauche, puis de nouveau droit devant.
  const look = k < 0.15 ? 0 : k < 0.45 ? 1 : k < 0.8 ? -1 : 0
  return { x: s.from[0], z: s.from[1], yaw: s.heading + look * 1.1, walking: false, post: s.post }
}

/**
 * Horloge de la ronde : à l'instant `at` (ms), elle en était à `tau` (s) ; elle reste figée
 * jusqu'à `holdUntil` (ms), puis repart.
 */
export function patrolTime(clock, now) {
  return clock.tau + Math.max(0, now - Math.max(clock.at, clock.holdUntil)) / 1000
}

/** On lui parle à l'instant `now` (ms) : l'horloge s'arrête pour `seconds` à partir de maintenant. */
export function holdPatrol(clock, now, seconds = PATROL_HOLD) {
  return { tau: patrolTime(clock, now), at: now, holdUntil: Math.max(clock.holdUntil, now + seconds * 1000) }
}
