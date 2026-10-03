import type { StationModel } from './assets'
import type { CustomModel } from './furniture'
import { CINEMA_ROW_SEATS, CINEMA_SEAT_PITCH } from './furniture/cinema'
import { KRAIT_CLIMB, KRAIT_LADDER_REACH, KRAIT_PILOT } from './furniture/hangar'
import { tr } from './i18n'

/*
 * Places des meubles : où s'asseoir, se coucher, prendre les commandes, jouer. Le personnage
 * marche jusqu'au meuble, s'y installe (sa position, sa hauteur, son orientation) et y tient une
 * pose, que les autres joueurs voient aussi (cf. POSES dans avatar.ts, et le relais). Le moindre
 * mouvement le relève.
 */

/** Poses tenues sur un meuble ; le relais les connaît aussi (server/relay.js). */
export const POSE_IDS = ['sit', 'lie', 'pilot', 'arcade', 'claw', 'punch', 'run', 'pedal', 'mix'] as const
export type PoseId = (typeof POSE_IDS)[number]

export interface Seat {
  pose: PoseId
  /** Position du personnage dans le repère du meuble (construit face à +z, centré, posé au sol). */
  x: number
  z: number
  /** Hauteur du dessus de l'assise, du matelas ; 0 pour une pose debout. */
  y: number
  /**
   * Orientation dans le repère du meuble (0 : regard vers +z). `free` : face à l'endroit d'où
   * l'on vient (un pouf) ; `both` : l'un ou l'autre côté, le plus proche (un banc).
   */
  yaw: number | 'free' | 'both'
  /** Où l'on se tient avant de s'installer (repère du meuble) ; par défaut, 0,5 devant la place. */
  from?: [number, number]
  /**
   * Chemin d'accès (repère du meuble, [x, hauteur, z]) : on le parcourt à pied depuis l'abord avant
   * de s'installer, et à l'envers en se relevant (les marches de l'escabeau du Krait, puis le nez).
   */
  via?: [number, number, number][]
}

const sit = (x: number, z: number, y: number, yaw: Seat['yaw'] = 0, from?: [number, number]): Seat => ({ pose: 'sit', x, z, y, yaw, from })
/** Couché sur le dos, la tête vers -z (l'oreiller) : on s'allonge depuis le côté +x du lit. */
const lie = (x: number, z: number, y: number, from: [number, number] = [x + 0.55, z + 0.1]): Seat => ({ pose: 'lie', x, z, y, yaw: 0, from })
/** Debout devant le meuble (+z), tourné vers lui. */
const stand = (pose: PoseId, z: number, x = 0): Seat => ({ pose, x, z, y: 0, yaw: Math.PI, from: [x, z + 0.12] })

/** Chaises du kit : assise à 0,25, dossier côté -z. */
const KIT_CHAIR = [sit(0, 0.04, 0.25)]

export const SEATS: Partial<Record<CustomModel | StationModel, Seat[]>> = {
  chair: KIT_CHAIR,
  'chair-cushion': KIT_CHAIR,
  'chair-armrest-headrest': KIT_CHAIR,
  // Assez près du bord avant pour que les jambes pendent hors des coussins.
  sofa: [sit(-0.38, 0.22, 0.3), sit(0, 0.22, 0.3), sit(0.38, 0.22, 0.3)],
  armchair: [sit(0, 0.08, 0.28)],
  'bar-chair': [sit(0, 0.03, 0.27)],
  // Face au comptoir : on grimpe dessus par derrière.
  'bar-stool': [sit(0, 0, 0.43, 0, [0, -0.45])],
  beanbag: [sit(0, 0, 0.24, 'free')],
  bench: [sit(-0.24, 0, 0.3, 'both'), sit(0.24, 0, 0.3, 'both')],
  // Table de cantine du mess : trois places par banc, face au plateau ; on enjambe le banc par derrière.
  'canteen-table': [-0.62, 0, 0.62].flatMap((x) => [sit(x, 0.6, 0.27, Math.PI, [x, 0.98]), sit(x, -0.6, 0.27, 0, [x, -0.98])]),
  toilet: [sit(0, 0.06, 0.235)],
  // La cuvette est au fond de la cabine : on y entre depuis le pas de la porte.
  'toilet-stall': [sit(0, -0.18, 0.235, 0, [0, 0.8])],
  // On s'y glisse de face, entre le siège et le tableau de bord (de côté, on traverserait
  // l'accoudoir et le HOTAS) : le siège est reculé d'autant (cf. PILOT_SEAT).
  'pilot-seat': [{ pose: 'pilot', x: 0, z: 0.06, y: 0.3, yaw: 0, from: [0, 0.5] }],
  'crew-seat': [sit(0, 0.05, 0.3)],
  // Le cockpit du Krait du hangar : on monte les marches de l'escabeau (du bas, -z, vers la
  // plateforme), on avance sur le nez du Krait, puis on se glisse dans le siège, face au nez.
  'krait-ladder': [{ pose: 'pilot', x: 0, z: KRAIT_LADDER_REACH, y: KRAIT_PILOT.y, yaw: Math.PI, from: [0, -0.75], via: KRAIT_CLIMB }],
  'command-chair': [sit(0, 0.06, 0.36)],
  'cozy-bed': [lie(-0.27, 0.02, 0.32, [-0.95, 0.12]), lie(0.27, 0.02, 0.32, [0.95, 0.12])],
  'bunk-bed': [lie(0, 0.1, 0.27, [0.55, 0.2]), lie(0, 0.1, 0.71, [0.55, 0.2])],
  'med-bed': [lie(0, 0.08, 0.3)],
  'weight-bench': [lie(0, 0.16, 0.34, [0.45, 0.2])],
  'exercise-bike': [{ pose: 'pedal', x: 0, z: -0.1, y: 0.53, yaw: 0, from: [0.4, -0.05] }],
  treadmill: [{ pose: 'run', x: 0, z: -0.08, y: 0.12, yaw: 0, from: [0, -0.8] }],
  'punching-bag': [stand('punch', 0.36)],
  arcade: [stand('arcade', 0.44)],
  'arcade-table': [stand('arcade', 0.42), { pose: 'arcade', x: 0, z: -0.42, y: 0, yaw: 0, from: [0, -0.54] }],
  'holo-draughts': [sit(0, 0.48, 0.28, Math.PI, [0, 0.75]), sit(0, -0.48, 0.28, 0, [0, -0.75])],
  'guardian-connect': [sit(0, 0.48, 0.28, Math.PI, [0, 0.75]), sit(0, -0.48, 0.28, 0, [0, -0.75])],
  'imperial-chess': [sit(0, 0.48, 0.28, Math.PI, [0, 0.75]), sit(0, -0.48, 0.28, 0, [0, -0.75])],
  pinball: [stand('arcade', 0.5)],
  'arcade-racer': [{ pose: 'pilot', x: 0, z: 0.2, y: 0.26, yaw: Math.PI, from: [0.5, 0.25] }],
  'claw-machine': [stand('claw', 0.46)],
  'dj-booth': [stand('mix', 0.44)],
  // Rangée de fauteuils de cinéma : on entre par l'allée, devant la rangée.
  'cinema-row': Array.from({ length: CINEMA_ROW_SEATS }, (_, i) => {
    const x = (i - (CINEMA_ROW_SEATS - 1) / 2) * CINEMA_SEAT_PITCH
    return sit(x, 0.04, 0.27, 0, [x, 0.5])
  }),
  'projection-chair': [sit(0, 0.04, 0.31, 0, [0, 0.58])],
  // Fauteuil du studio, tourné vers la table : on s'y glisse par le côté (cf. Seating.approach).
  'studio-chair': [sit(0, 0.03, 0.3)],
  'floor-cushion': [sit(0, 0, 0.13, 'free')],
  // Furniture Kit de Kenney (cf. furniture/kenney.ts) : hauteurs relevées sur les modèles remis à l'échelle.
  'k-toilet': [sit(0, 0.04, 0.25)],
  'k-toilet-square': [sit(0, 0.03, 0.25)],
  // Dans l'eau, allongé le long de la baignoire, la tête côté -x.
  'k-bathtub': [{ pose: 'lie', x: 0, z: 0, y: 0.12, yaw: Math.PI / 2, from: [0, 0.6] }],
  'k-bar-stool': [sit(0, 0, 0.57, 'free')],
  'k-bar-stool-square': [sit(0, 0, 0.53, 'free')],
  'k-lounge-sofa': [sit(-0.36, 0.06, 0.32), sit(0, 0.06, 0.32), sit(0.36, 0.06, 0.32)],
  'k-lounge-sofa-long': [sit(-0.36, -0.22, 0.32), sit(0, -0.22, 0.32), lie(0.22, 0.12, 0.32, [0.62, 0.2])],
  'k-lounge-sofa-corner': [sit(-0.4, -0.34, 0.32), sit(-0.02, -0.34, 0.32), sit(0.34, 0.02, 0.32, -Math.PI / 2), sit(0.34, 0.4, 0.32, -Math.PI / 2)],
  'k-ottoman': [sit(0, 0, 0.32, 'free')],
  'k-lounge-chair': [sit(0, 0.06, 0.32)],
  'k-lounge-chair-relax': [sit(0, 0, 0.3)],
  'k-design-chair': [sit(0, 0.06, 0.32)],
  'k-design-sofa': [sit(-0.4, 0.06, 0.32), sit(0, 0.06, 0.32), sit(0.4, 0.06, 0.32)],
  'k-design-sofa-corner': [sit(-0.6, -0.56, 0.32), sit(-0.2, -0.56, 0.32), sit(0.56, -0.1, 0.32, -Math.PI / 2), sit(0.56, 0.34, 0.32, -Math.PI / 2)],
  'k-chair-modern': [sit(0, 0.02, 0.3)],
  'k-chair-modern-frame': [sit(0, 0.02, 0.3)],
  'k-chair-rounded': [sit(0, 0.02, 0.275)],
  'k-desk-chair': [sit(0, 0.02, 0.27)],
  'k-low-bench': [sit(-0.14, 0, 0.28, 'both'), sit(0.14, 0, 0.28, 'both')],
  'k-bed-double': [lie(-0.3, 0.06, 0.34, [-0.95, 0.12]), lie(0.3, 0.06, 0.34, [0.95, 0.12])],
  'k-bed-single': [lie(0, 0.06, 0.34, [0.62, 0.12])],
  'k-bed-bunk': [lie(0, 0.1, 0.28, [0.55, 0.2]), lie(0, 0.1, 0.85, [0.55, 0.2])],
}

const FIGHT_SEATS = [stand('arcade', 0.44, -0.2), stand('arcade', 0.44, 0.2)]
/** Les deux chaises de la table Galactic Clash, déjà visibles dans le bar. */
const CARD_SEATS = [
  sit(-0.52, 0, 0.27, Math.PI / 2, [-0.82, 0]),
  sit(0.52, 0, 0.27, -Math.PI / 2, [0.82, 0]),
]
export const seatsOf = (model: string, label?: string): Seat[] | undefined =>
  model === 'arcade' && label === 'fight' ? FIGHT_SEATS
    : model === 'bar-table' && label === 'galactic-clash' ? CARD_SEATS
      : SEATS[model as CustomModel | StationModel]

/** Verbe de l'invite d'un meuble où l'on s'installe (s'il n'en a pas un à lui). */
export function seatAction(seats: Seat[]): string {
  switch (seats[0].pose) {
    case 'lie': return tr('S\'allonger', 'Lie down')
    case 'pilot': return tr('Prendre les commandes', 'Take the controls')
    case 'arcade': return tr('Jouer', 'Play')
    case 'claw': return tr('Tenter sa chance', 'Try your luck')
    case 'punch': return tr('Frapper', 'Punch')
    case 'run': return tr('Courir', 'Run')
    case 'pedal': return tr('Pédaler', 'Pedal')
    case 'mix': return tr('Mixer', 'Mix')
    default: return tr('S\'asseoir', 'Sit down')
  }
}

/** Place d'un meuble, dans le repère du pont. */
export interface SeatSpot {
  pose: PoseId
  x: number
  z: number
  y: number
  yaw: number
  /** Où se tenir avant de s'installer, et où l'on se relève. */
  from: { x: number; z: number }
  /** Chemin d'accès, dans le repère du pont (y : hauteur au-dessus du pont), cf. Seat.via. */
  via?: { x: number; y: number; z: number }[]
}

/**
 * Places d'un meuble posé en (px, pz), tourné de `rot` radians autour de la verticale (une
 * rotation de θ envoie (x, z) sur (x cos θ + z sin θ, −x sin θ + z cos θ), comme dans Three.js).
 * @param toward position de celui qui s'installe (places `free` et `both`)
 */
export function placeSeats(seats: Seat[], px: number, pz: number, rot: number, toward?: { x: number; z: number }): SeatSpot[] {
  const c = Math.cos(rot), s = Math.sin(rot)
  const world = (x: number, z: number) => ({ x: px + x * c + z * s, z: pz - x * s + z * c })
  return seats.map((seat) => {
    const at = world(seat.x, seat.z)
    let yaw = typeof seat.yaw === 'number' ? seat.yaw + rot : rot
    let from = world(...(seat.from ?? [seat.x + Math.sin(typeof seat.yaw === 'number' ? seat.yaw : 0) * 0.5, seat.z + Math.cos(typeof seat.yaw === 'number' ? seat.yaw : 0) * 0.5]))
    if (seat.yaw === 'free' && toward) {
      // Face à l'arrivant, qui se tient à 0,45 de la place.
      yaw = Math.atan2(toward.x - at.x, toward.z - at.z)
      from = { x: at.x + Math.sin(yaw) * 0.45, z: at.z + Math.cos(yaw) * 0.45 }
    } else if (seat.yaw === 'both') {
      // Le côté (+z ou -z du meuble) où se trouve l'arrivant.
      const side = toward && (toward.x - at.x) * s + (toward.z - at.z) * c < 0 ? Math.PI : 0
      yaw = rot + side
      from = { x: at.x + Math.sin(yaw) * 0.45, z: at.z + Math.cos(yaw) * 0.45 }
    }
    const via = seat.via?.map(([x, y, z]) => ({ ...world(x, z), y }))
    return { pose: seat.pose, x: at.x, z: at.z, y: seat.y, yaw, from, ...(via ? { via } : {}) }
  })
}
