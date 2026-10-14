// Les habitués du mess (cf. src/diners.ts, qui les dessine) : trois membres d'équipage qui y passent
// leurs pauses. Chacun suit sa journée : prendre un plateau au début du self, longer le comptoir,
// s'attabler à sa place et manger, rendre son plateau, prendre un café au coin café, le boire,
// rendre sa tasse, puis flâner (lire le menu, le tableau de liège, boire un verre d'eau). Tout le
// bord les voit au même endroit : leur position ne dépend que de l'horloge des habitués, que le
// relais tient pour tous (comme la ronde du sergent, cf. patrol.js).
//
// Ils ne sortent jamais de la salle du mess et n'entrent jamais en cuisine : leurs trajets passent
// par les allées de la salle, à au moins la carrure d'un personnage des tables, du comptoir, des
// meubles et des murs (cf. server/diners.test.js, qui le vérifie, et levels.ts pour les meubles).

import { patrolTime } from './patrol.js'

/** Pont et pièce des habitués. */
export const DINERS_LEVEL = 0
export const DINERS_ROOM = 'm'

/** Leur pas (unités par seconde) : on est en pause. */
export const DINER_SPEED = 0.75

/** Le temps de s'asseoir sur le banc (ou de s'en relever), depuis son abord (secondes). */
export const SIT_TIME = 0.7

/**
 * La salle, où ils restent : entre les murs, les meubles du mur nord, et le comptoir du self (au
 * sud, la cuisine). Ce sont les bornes de leur centre (carrure comprise).
 */
export const DINING_AREA = { minX: 8.84, maxX: 15.16, minZ: 6.22, maxZ: 9.45 }

/** Face au sud (le comptoir), au nord (les meubles du mur), à l'ouest (le menu), à l'est (la fresque). */
const SOUTH = 0
const NORTH = Math.PI
const WEST = -Math.PI / 2
const EAST = Math.PI / 2

// Les postes de la salle (cf. levels.ts) : où l'on se tient devant chaque meuble.
/** Le début du self (la pile de plateaux), puis le long du comptoir : plats chauds, passe, frais, boissons. */
const TRAY = [9.93, 9.3]
const HOT = [10.6, 9.3]
const PASS = [11.5, 9.3]
const COLD = [12.55, 9.3]
const DRINKS = [13.45, 9.3]
/** Le retour plateaux et le coin café, contre le mur nord. */
const RETURN = [14.75, 6.42]
const COFFEE = [12.02, 6.42]
/** Le menu du jour (mur ouest), le tableau de liège et la fontaine (mur nord). */
const MENU = [8.95, 7.45]
const BOARD = [10.3, 6.42]
const FOUNTAIN = [9.3, 6.42]

// Les allées : au sud des tables, au milieu, au nord, à l'ouest.
const SOUTH_LANE = 8.7
const MIDDLE = 11.98
const NORTH_LANE = 6.42
const WEST_LANE = 8.93

/** Le long du comptoir, du début du self aux boissons. */
const LINE = [
  { act: 'tray', path: [TRAY], stay: 3, yaw: SOUTH, takes: 'tray' },
  { act: 'serve', path: [HOT], stay: 3, yaw: SOUTH },
  { act: 'serve', path: [PASS], stay: 2.5, yaw: SOUTH },
  { act: 'serve', path: [COLD], stay: 2, yaw: SOUTH },
  { act: 'serve', path: [DRINKS], stay: 2, yaw: SOUTH },
]

/**
 * Les trois habitués : leur apparence (cf. src/looks.ts), leur place (une des places des tables de
 * cantine, cf. seats.ts) et leur journée, poste après poste : le trajet depuis le poste précédent
 * (le dernier point est le poste), le temps passé, l'orientation, ce qu'on y fait, ce qu'on y prend
 * ou y laisse. Une place (`seat`) : on s'y assoit depuis le dernier point du trajet, son abord.
 */
export const DINERS = [
  {
    id: 'rahel',
    look: 'suit.female.c.maverick',
    steps: [
      { act: 'tray', path: [[WEST_LANE, SOUTH_LANE], TRAY], stay: 3, yaw: SOUTH, takes: 'tray' },
      ...LINE.slice(1),
      { act: 'eat', path: [[MIDDLE, SOUTH_LANE], [9.58, SOUTH_LANE], [9.58, 8.43]], seat: { x: 9.58, z: 8.05, yaw: NORTH }, stay: 55 },
      { act: 'return', path: [[9.58, SOUTH_LANE], [MIDDLE, SOUTH_LANE], [MIDDLE, NORTH_LANE], RETURN], stay: 2.5, yaw: NORTH, drops: 'tray' },
      { act: 'coffee', path: [COFFEE], stay: 5, yaw: NORTH, takes: 'cup' },
      { act: 'drink', path: [[11.55, 7.05]], stay: 28, yaw: EAST },
      { act: 'return', path: [[MIDDLE, NORTH_LANE], RETURN], stay: 1.5, yaw: NORTH, drops: 'cup' },
      { act: 'read', path: [[WEST_LANE, NORTH_LANE], MENU], stay: 8, yaw: WEST },
    ],
  },
  {
    id: 'bastien',
    look: 'human.male.b',
    steps: [
      { act: 'tray', path: [[WEST_LANE, NORTH_LANE], [WEST_LANE, SOUTH_LANE], TRAY], stay: 3, yaw: SOUTH, takes: 'tray' },
      ...LINE.slice(1),
      { act: 'eat', path: [[MIDDLE, SOUTH_LANE], [MIDDLE, NORTH_LANE], [13.8, 6.47]], seat: { x: 13.8, z: 6.85, yaw: SOUTH }, stay: 50 },
      { act: 'return', path: [RETURN], stay: 2.5, yaw: NORTH, drops: 'tray' },
      { act: 'coffee', path: [COFFEE], stay: 5, yaw: NORTH, takes: 'cup' },
      { act: 'drink', path: [[MIDDLE, SOUTH_LANE], [15.05, 9.0]], stay: 28, yaw: EAST },
      { act: 'return', path: [[MIDDLE, SOUTH_LANE], [MIDDLE, NORTH_LANE], RETURN], stay: 1.5, yaw: NORTH, drops: 'cup' },
      { act: 'read', path: [BOARD], stay: 8, yaw: NORTH },
    ],
  },
  {
    id: 'ilka',
    look: 'alien.female.d.blue',
    steps: [
      { act: 'tray', path: [[WEST_LANE, NORTH_LANE], [WEST_LANE, SOUTH_LANE], TRAY], stay: 3, yaw: SOUTH, takes: 'tray' },
      ...LINE.slice(1),
      { act: 'eat', path: [[14.42, SOUTH_LANE], [14.42, 8.43]], seat: { x: 14.42, z: 8.05, yaw: NORTH }, stay: 45 },
      { act: 'return', path: [[14.42, SOUTH_LANE], [MIDDLE, SOUTH_LANE], [MIDDLE, NORTH_LANE], RETURN], stay: 2.5, yaw: NORTH, drops: 'tray' },
      { act: 'coffee', path: [COFFEE], stay: 5, yaw: NORTH, takes: 'cup' },
      { act: 'drink', path: [[MIDDLE, 7.4], [12.42, 7.85]], stay: 28, yaw: WEST },
      { act: 'return', path: [[MIDDLE, 7.4], [MIDDLE, NORTH_LANE], RETURN], stay: 1.5, yaw: NORTH, drops: 'cup' },
      { act: 'water', path: [FOUNTAIN], stay: 6, yaw: NORTH },
    ],
  },
]

/** Longueur d'une ligne brisée. */
function pathLength(points) {
  let length = 0
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  return length
}

/**
 * La journée d'un habitué à plat : chaque tronçon (marche, assise, lever) et chaque arrêt, bout à
 * bout, avec ce qu'il tient pendant ce temps (plateau, repas entamé, tasse). Rend aussi sa durée.
 */
function flatten(diner) {
  const steps = []
  let tau = 0
  const last = diner.steps[diner.steps.length - 1].path
  let from = last[last.length - 1]
  let heading = 0
  let tray = false, cup = false, meal = 0
  const push = (s) => {
    steps.push({ ...s, start: tau, tray, cup, meal: s.meal ?? meal })
    tau += s.duration
  }
  diner.steps.forEach((step, post) => {
    for (const to of step.path) {
      const length = Math.hypot(to[0] - from[0], to[1] - from[1])
      if (length > 1e-6) {
        heading = Math.atan2(to[0] - from[0], to[1] - from[1])
        push({ kind: 'walk', from, to, duration: length / DINER_SPEED, heading, post })
      }
      from = to
    }
    if (step.seat) {
      const seat = [step.seat.x, step.seat.z]
      push({ kind: 'sit', from, to: seat, duration: SIT_TIME, heading: step.seat.yaw, post })
      push({ kind: 'stay', from: seat, to: seat, duration: step.stay, heading: step.seat.yaw, post, seated: true, eating: step.act === 'eat' })
      if (step.act === 'eat') meal = 1
      push({ kind: 'rise', from: seat, to: from, duration: SIT_TIME, heading: step.seat.yaw, post })
    } else {
      push({ kind: 'stay', from, to: from, duration: step.stay, heading: step.yaw, post })
    }
    // Ce qu'on prend ou laisse au poste vaut à partir du poste suivant.
    if (step.takes === 'tray') { tray = true; meal = 0 }
    if (step.drops === 'tray') { tray = false; meal = 0 }
    if (step.takes === 'cup') cup = true
    if (step.drops === 'cup') cup = false
  })
  return { steps, duration: tau }
}

const FLAT = DINERS.map(flatten)

/**
 * La période commune des journées (secondes) : la plus longue, arrondie ; les autres s'achèvent
 * par une flânerie plus longue au dernier poste. Les habitués sont décalés dans cette période (cf.
 * DINER_OFFSETS) pour ne jamais se trouver ensemble au même poste.
 */
export const DINERS_PERIOD = Math.ceil(Math.max(...FLAT.map((f) => f.duration)) / 10) * 10 + 10
for (const f of FLAT) {
  const end = f.steps[f.steps.length - 1]
  end.duration += DINERS_PERIOD - f.duration
}

/**
 * Le décalage de chaque habitué dans la période commune (secondes), choisi pour qu'ils ne se
 * croisent jamais de trop près : le couloir du mur nord est trop étroit pour deux, et ils partagent
 * le self, le retour plateaux et le coin café. À rechercher si leurs journées changent (par essais :
 * server/diners.test.js vérifie qu'ils restent à deux carrures l'un de l'autre).
 */
export const DINER_OFFSETS = [0, 62, 130]

/**
 * L'habitué `index` à l'instant `t` de l'horloge des habitués (secondes, n'importe quel tour) :
 * position, cap, marche-t-il, ce qu'il fait (`act`, son poste `post`, sa progression `k` de 0 à 1),
 * est-il assis (et à quel point de son assise, `seated` de 0 à 1), ce qu'il tient (plateau, tasse)
 * et où en est son repas (`meal`, de 0 à 1).
 */
export function dinerAt(index, t) {
  const { steps } = FLAT[index]
  const local = (((t + DINER_OFFSETS[index]) % DINERS_PERIOD) + DINERS_PERIOD) % DINERS_PERIOD
  let lo = 0, hi = steps.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (steps[mid].start <= local) lo = mid
    else hi = mid - 1
  }
  const s = steps[lo]
  const k = Math.min(1, (local - s.start) / s.duration)
  const x = s.from[0] + (s.to[0] - s.from[0]) * k
  const z = s.from[1] + (s.to[1] - s.from[1]) * k
  const post = DINERS[index].steps[s.post]
  const seated = s.kind === 'sit' ? k : s.kind === 'rise' ? 1 - k : s.seated ? 1 : 0
  return {
    x, z, yaw: s.heading, walking: s.kind === 'walk', act: post.act, post: s.post, k: s.kind === 'stay' ? k : 0,
    seated, eating: !!s.eating, tray: s.tray, cup: s.cup, meal: s.eating ? k : s.meal,
  }
}

/** La place de l'habitué `index` (où il s'assoit pour manger), et son abord. */
export function dinerSeat(index) {
  const step = DINERS[index].steps.find((s) => s.seat)
  const path = step.path
  return { ...step.seat, from: { x: path[path.length - 1][0], z: path[path.length - 1][1] } }
}

/** Les tronçons de la journée d'un habitué (pour les essais). */
export function dinerSteps(index) {
  return FLAT[index].steps
}

/** Horloge des habitués (même forme que celle de la ronde, cf. patrol.js ; jamais arrêtée). */
export function dinersTime(clock, now) {
  return patrolTime(clock, now)
}
