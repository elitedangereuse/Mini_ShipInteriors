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

export type WeaponId = 'pistol' | 'smg' | 'rifle'

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
    auto: false, interval: 0.14, mag: 12, reload: 1.1, speed: 46, pierce: false,
    kick: 1.5, side: 0.45, recover: 7, spread: 0.2, bloom: 0.85, bloomMax: 3.2, settle: 5, move: 0.7, punch: 1,
  },
  {
    id: 'smg', name: tr('Mitraillette', 'SMG'), take: tr('Prendre la mitraillette', 'Take the SMG'), model: 'blaster-a', grip: [-0.1, -0.14], color: '#6fe8ff',
    auto: true, interval: 0.085, mag: 30, reload: 1.6, speed: 50, pierce: false,
    kick: 0.75, side: 0.6, recover: 5, spread: 0.8, bloom: 0.42, bloomMax: 4.2, settle: 4, move: 1.1, punch: 0.6,
  },
  {
    id: 'rifle', name: tr('Fusil', 'Rifle'), take: tr('Prendre le fusil', 'Take the rifle'), model: 'blaster-e', grip: [-0.1, 0.3], color: '#ff6ad5',
    auto: false, interval: 0.8, mag: 5, reload: 1.9, speed: 90, pierce: true,
    kick: 4.2, side: 0.9, recover: 3.6, spread: 0, bloom: 4.5, bloomMax: 6, settle: 2.4, move: 2.4, punch: 2.2,
  },
]

export const weaponById = (id: string | undefined) => WEAPONS.find((w) => w.id === id)

/**
 * Ce que le décor du stand lit du jeu (cf. src/furniture/range.ts) : une partie est en cours (les
 * feux du pas de tir passent au rouge), et l'arme prise au mur (son support est vide).
 */
export const rangeState: { live: boolean; weapon: WeaponId | null } = { live: false, weapon: null }
