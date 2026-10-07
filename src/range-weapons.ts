import { tr } from './i18n'

/*
 * Les armes du stand de tir de la cale : des blasters, du Blaster Kit de Kenney. Leurs réglages
 * sont ici, à part, parce que le jeu (src/range.ts), ses bruitages (src/range-sfx.ts) et le mur où
 * on les prend (src/furniture/range.ts) les lisent tous les trois.
 *
 * Angles en degrés (convertis par le jeu). Le recul et la dispersion se règlent arme par arme :
 * - `kick` cabre le regard à chaque tir, `side` le fait dévier de côté (au hasard, dans les deux
 *   sens) ; le regard revient ensuite de lui-même, à la vitesse `recover` (par seconde). En vue de
 *   dessus, c'est la ligne de tir qui dévie ;
 * - `spread` est la dispersion de l'arme au repos ; chaque tir en ajoute `bloom`, jusqu'à
 *   `bloomMax`, et elle retombe à la vitesse `settle` ; bouger en ajoute `move`.
 */

export type WeaponId = 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'launcher'

export interface Weapon {
  id: WeaponId
  name: string
  /** « Prendre le pistolet », sur le mur. */
  take: string
  /** Modèle du kit (canon vers +z) et sa poignée dans le repère du modèle (y, z) : c'est elle qu'on tient. */
  model: string
  grip: [number, number]
  /** Couleur du tir : la balle, sa traînée, l'éclair du canon, le liseré de l'arme au mur. */
  color: string
  /** Tire tant que la détente est tenue. */
  auto: boolean
  /** Délai entre deux tirs, taille du chargeur, durée du rechargement (secondes). */
  interval: number
  mag: number
  reload: number
  /** Vitesse de la balle (tuiles par seconde). */
  speed: number
  /** La balle traverse les cibles. */
  pierce: boolean
  /** Balles par tir (la gerbe du fusil à pompe) : chacune part dans le cône de dispersion de l'arme. */
  pellets: number
  /** Rayon de l'explosion à l'impact (0 : aucune) : toutes les cibles prises dedans éclatent. */
  blast: number
  kick: number
  side: number
  recover: number
  spread: number
  bloom: number
  bloomMax: number
  settle: number
  move: number
  /** Secousse de la vue et recul de l'arme à l'écran (1 : le pistolet). */
  punch: number
}

export const WEAPONS: Weapon[] = [
  {
    id: 'pistol', name: tr('Pistolet', 'Pistol'), take: tr('Prendre le pistolet', 'Take the pistol'), model: 'blaster-b', grip: [-0.08, -0.12], color: '#ffb054',
    auto: false, interval: 0.14, mag: 12, reload: 1.1, speed: 46, pierce: false, pellets: 1, blast: 0,
    kick: 1.5, side: 0.4, recover: 7, spread: 0.2, bloom: 0.85, bloomMax: 3.2, settle: 5, move: 0.7, punch: 1,
  },
  {
    id: 'smg', name: tr('Mitraillette', 'SMG'), take: tr('Prendre la mitraillette', 'Take the SMG'), model: 'blaster-a', grip: [-0.1, -0.14], color: '#6fe8ff',
    auto: true, interval: 0.085, mag: 30, reload: 1.6, speed: 50, pierce: false, pellets: 1, blast: 0,
    kick: 0.55, side: 0.4, recover: 5, spread: 0.8, bloom: 0.42, bloomMax: 4.2, settle: 4, move: 1.1, punch: 0.6,
  },
  {
    // Huit plombs en gerbe : imprécis de loin, mais deux cibles voisines tombent d'un coup.
    id: 'shotgun', name: tr('Fusil à pompe', 'Shotgun'), take: tr('Prendre le fusil à pompe', 'Take the shotgun'), model: 'blaster-l', grip: [-0.08, -0.1], color: '#c58bff',
    auto: false, interval: 0.85, mag: 6, reload: 2.1, speed: 42, pierce: false, pellets: 8, blast: 0,
    kick: 5, side: 1.1, recover: 4, spread: 4.2, bloom: 1, bloomMax: 5.5, settle: 3, move: 0.8, punch: 2.4,
  },
  {
    id: 'rifle', name: tr('Fusil', 'Rifle'), take: tr('Prendre le fusil', 'Take the rifle'), model: 'blaster-e', grip: [-0.1, 0.3], color: '#ff6ad5',
    auto: false, interval: 0.8, mag: 5, reload: 1.9, speed: 90, pierce: true, pellets: 1, blast: 0,
    kick: 4.2, side: 0.9, recover: 3.6, spread: 0, bloom: 4.5, bloomMax: 6, settle: 2.4, move: 2.4, punch: 2.2,
  },
  {
    // Une boule de plasma, lente, qui explose là où elle frappe : on vise le milieu d'un groupe.
    id: 'launcher', name: tr('Lance-plasma', 'Plasma launcher'), take: tr('Prendre le lance-plasma', 'Take the plasma launcher'), model: 'blaster-h', grip: [-0.09, -0.08], color: '#8dff6a',
    auto: false, interval: 1.1, mag: 3, reload: 2.4, speed: 13, pierce: false, pellets: 1, blast: 0.8,
    kick: 3.4, side: 0.6, recover: 3.6, spread: 0.3, bloom: 2, bloomMax: 4, settle: 2.5, move: 1, punch: 2.6,
  },
]

export const weaponById = (id: string | undefined) => WEAPONS.find((w) => w.id === id)

/**
 * Ce que le décor du stand lit du jeu (cf. src/furniture/range.ts) : une partie est en cours (les
 * feux du pas de tir passent au rouge, les lumières se resserrent sur les cibles), l'arme prise au
 * mur (son support est vide), et la mise en scène du moment, de 0 à 1 : `flash` quand une cible
 * éclate, `tier` quand un palier est franchi, `alarm` à chaque seconde des dix dernières.
 */
export const rangeState: { live: boolean; weapon: WeaponId | null; flash: number; tier: number; alarm: number } = { live: false, weapon: null, flash: 0, tier: 0, alarm: 0 }
