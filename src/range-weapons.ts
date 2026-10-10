import { tr } from './i18n'
import { WEAPON_STATS, type WeaponId, type WeaponStats } from '../shared/weapons.js'

/*
 * Les armes du stand de tir de la cale : des blasters, du Blaster Kit de Kenney. Leurs réglages
 * sont ici, à part, parce que le jeu (src/range.ts), ses bruitages (src/range-sfx.ts) et le mur où
 * on les prend (src/furniture/range.ts) les lisent tous les trois. Ce que le relais doit lire aussi
 * pour arbitrer l'arène (cadence, chargeur, vitesse de la balle, gerbe, explosion, poids, dégâts)
 * est dans shared/weapons.js ; ici, ce qui ne regarde que le joueur : le nom, le modèle, le recul.
 *
 * Angles en degrés (convertis par le jeu). Le recul et la dispersion se règlent arme par arme :
 * - `kick` cabre le regard à chaque tir, `side` le fait dévier de côté (au hasard, dans les deux
 *   sens) ; le regard revient ensuite de lui-même, à la vitesse `recover` (par seconde). En vue de
 *   dessus, c'est la ligne de tir qui dévie ;
 * - `spread` est la dispersion de l'arme au repos ; chaque tir en ajoute `bloom`, jusqu'à
 *   `bloomMax`, et elle retombe à la vitesse `settle` ; bouger en ajoute `move`.
 *
 * Chaque arme a sa force et son prix :
 * - le pistolet fait tout correctement, et se recharge en un instant ; une cible par tir ;
 * - la mitraillette arrose : gros chargeur, mais elle vise mal de loin, et chaque balle perdue
 *   casse la série ; long rechargement ;
 * - le fusil à pompe balaie les rangées proches, deux cibles d'un coup ; quatre cartouches, et sa
 *   gerbe se perd avant le fond du couloir ;
 * - le fusil ne manque jamais et traverse les cibles, à l'arrêt : trois balles, un tir par
 *   seconde, et il ne pardonne ni la marche ni la précipitation ;
 * - le lance-plasma vide un groupe entier : deux coups, une boule lente, le plus long rechargement.
 * Les trois dernières pèsent : on marche moins vite avec (`weight`).
 */

export type { WeaponId }

export interface Weapon extends WeaponStats {
  id: WeaponId
  name: string
  /** « Prendre le pistolet », sur le mur. */
  take: string
  /** Modèle du kit (canon vers +z) et sa poignée dans le repère du modèle (y, z) : c'est elle qu'on tient. */
  model: string
  grip: [number, number]
  /** Couleur du tir : la balle, sa traînée, l'éclair du canon, le liseré de l'arme au mur. */
  color: string
  kick: number
  side: number
  recover: number
  bloom: number
  bloomMax: number
  settle: number
  move: number
  /** Secousse de la vue et recul de l'arme à l'écran (1 : le pistolet). */
  punch: number
  /** Son caractère, en deux mots, sur sa fiche au mur. */
  trait: string
}

export const WEAPONS: Weapon[] = [
  {
    id: 'pistol', name: tr('Pistolet', 'Pistol'), take: tr('Prendre le pistolet', 'Take the pistol'), model: 'blaster-b', grip: [-0.08, -0.12], color: '#ffb054',
    trait: tr('polyvalent', 'all-rounder'),
    ...WEAPON_STATS.pistol,
    kick: 1.4, side: 0.35, recover: 8, bloom: 0.9, bloomMax: 3, settle: 6, move: 0.4, punch: 1,
  },
  {
    id: 'smg', name: tr('Mitraillette', 'SMG'), take: tr('Prendre la mitraillette', 'Take the SMG'), model: 'blaster-a', grip: [-0.1, -0.14], color: '#6fe8ff',
    trait: tr('arrose', 'bullet hose'),
    ...WEAPON_STATS.smg,
    kick: 0.5, side: 0.45, recover: 5, bloom: 0.5, bloomMax: 5.5, settle: 3.5, move: 1.4, punch: 0.55,
  },
  {
    id: 'shotgun', name: tr('Fusil à pompe', 'Shotgun'), take: tr('Prendre le fusil à pompe', 'Take the shotgun'), model: 'blaster-l', grip: [-0.08, -0.1], color: '#c58bff',
    trait: tr('de près', 'close range'),
    ...WEAPON_STATS.shotgun,
    kick: 5.5, side: 1.2, recover: 4, bloom: 0.8, bloomMax: 6.5, settle: 3, move: 0.6, punch: 2.5,
  },
  {
    id: 'rifle', name: tr('Fusil', 'Rifle'), take: tr('Prendre le fusil', 'Take the rifle'), model: 'blaster-e', grip: [-0.1, 0.3], color: '#ff6ad5',
    trait: tr('perforant', 'piercing'),
    ...WEAPON_STATS.rifle,
    kick: 4.6, side: 0.8, recover: 3.4, bloom: 5, bloomMax: 6, settle: 2.2, move: 3, punch: 2.3,
  },
  {
    id: 'launcher', name: tr('Lance-plasma', 'Plasma launcher'), take: tr('Prendre le lance-plasma', 'Take the plasma launcher'), model: 'blaster-h', grip: [-0.09, -0.08], color: '#8dff6a',
    trait: tr('explosif', 'explosive'),
    ...WEAPON_STATS.launcher,
    kick: 3.6, side: 0.6, recover: 3.4, bloom: 2, bloomMax: 4, settle: 2.5, move: 1.2, punch: 2.7,
  },
]

export const weaponById = (id: string | undefined) => WEAPONS.find((w) => w.id === id)

/**
 * Ce que le décor du stand lit du jeu (cf. src/furniture/range.ts) : une partie est en cours (les
 * feux du pas de tir passent au rouge, les lumières se resserrent sur les cibles), l'arme prise au
 * mur (son support est vide), et la mise en scène du moment, de 0 à 1 : `flash` quand une cible
 * éclate, `tier` quand un palier est franchi, `alarm` à chaque seconde des dix dernières, `beat`
 * à chaque coup de grosse caisse de la musique.
 */
export const rangeState: { live: boolean; weapon: WeaponId | null; flash: number; tier: number; alarm: number; beat: number } = { live: false, weapon: null, flash: 0, tier: 0, alarm: 0, beat: 0 }
export type RangeState = typeof rangeState
