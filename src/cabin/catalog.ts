import type { StationModel } from '../assets'
import type { CustomModel } from '../furniture'
import type { IconName } from '../icons'

/*
 * Catalogue du mode aménagement : tout ce qu'on peut poser dans sa cabine. Un objet de
 * l'aménagement désigne une entrée par son `id` ; l'entrée dit quel meuble construire,
 * comment il se pose et ce qu'on peut en changer (variantes).
 */

/**
 * Comment un objet se pose :
 * - floor : au sol, il bloque le passage ;
 * - flat : à plat au sol (tapis), on marche dessus et on pose des meubles dessus ;
 * - wall : accroché à un mur (affiches, cadres, étagères) ;
 * - top : petit objet, posé sur un meuble qui a une surface, ou au sol.
 */
export type Mount = 'floor' | 'flat' | 'wall' | 'top'

export interface Variant {
  id: string
  label: string
  /** Pastille de couleur dans le sélecteur. */
  swatch?: string
}

export type CategoryId = 'rest' | 'living' | 'storage' | 'light' | 'plants' | 'wall' | 'objects' | 'elite' | 'leisure' | 'rugs'

export const CATEGORIES: { id: CategoryId; label: string; icon: IconName }[] = [
  { id: 'rest', label: 'Chambre', icon: 'bed' },
  { id: 'living', label: 'Salon', icon: 'couch' },
  { id: 'storage', label: 'Rangements', icon: 'books' },
  { id: 'light', label: 'Lumières', icon: 'lamp' },
  { id: 'plants', label: 'Plantes', icon: 'potted-plant' },
  { id: 'wall', label: 'Murs', icon: 'frame-corners' },
  { id: 'objects', label: 'Objets', icon: 'cube' },
  { id: 'elite', label: 'Elite', icon: 'rocket' },
  { id: 'leisure', label: 'Loisirs', icon: 'game-controller' },
  { id: 'rugs', label: 'Tapis', icon: 'square-half' },
]

export interface CatalogEntry {
  id: string
  name: string
  /** Absent : l'objet n'est pas proposé dans le catalogue (le Holo-Me). */
  category?: CategoryId
  /** Meuble fait main (src/furniture/) ou modèle du kit. */
  model: CustomModel | StationModel
  mount: Mount
  variants?: Variant[]
  /** Texte passé au constructeur du meuble selon la variante (par défaut : la variante elle-même). */
  label?: (variant: string | undefined) => string | undefined
  /** Hauteur du dessus, sur lequel on peut poser des petits objets. */
  surface?: number
  /** Bloque le passage : vrai pour les objets au sol, sauf indication contraire. */
  solid?: boolean
  /** Texte à l'interaction (E) ; une liste : une phrase au hasard. */
  interact?: string | string[] | ((variant: string | undefined) => string | string[])
  /** Verbe de l'invite ; « Examiner » par défaut. */
  action?: string
  /**
   * Lumière de l'objet (la réserve de lumières est petite : priorité la plus basse d'abord).
   * `at` : position dans le repère de l'objet.
   */
  light?: { color: string; intensity: number; at: [number, number, number]; flicker?: 'neon' | 'fire'; priority: number }
  /** Unique et indispensable : on le déplace, on ne le retire pas (le Holo-Me). */
  fixed?: boolean
}

// ---------------------------------------------------------------- variantes

/** Tissus du mobilier des quartiers (cf. FABRIC dans furniture/cozy.ts). */
const FABRICS: Variant[] = [
  { id: 'teal', label: 'Bleu canard', swatch: '#3f8f8c' },
  { id: 'terracotta', label: 'Terre cuite', swatch: '#c0643f' },
  { id: 'mustard', label: 'Moutarde', swatch: '#d9a441' },
  { id: 'navy', label: 'Marine', swatch: '#34507a' },
  { id: 'sage', label: 'Sauge', swatch: '#8fae7e' },
  { id: 'rose', label: 'Vieux rose', swatch: '#d98b8b' },
  { id: 'plum', label: 'Prune', swatch: '#7a4f7a' },
  { id: 'purple', label: 'Violet', swatch: '#5a3a8a' },
  { id: 'cream', label: 'Crème', swatch: '#e9dcc4' },
]
const fabrics = (first: string): Variant[] => [FABRICS.find((f) => f.id === first)!, ...FABRICS.filter((f) => f.id !== first)]

/** Palettes des tapis (cf. RUGS dans furniture/cozy.ts). */
const RUG_PALETTES: Variant[] = [
  { id: 'warm', label: 'Chaud', swatch: '#b8563a' },
  { id: 'blue', label: 'Bleu', swatch: '#34507a' },
  { id: 'bath', label: 'Lagon', swatch: '#6fa8b8' },
  { id: 'neon', label: 'Néon', swatch: '#ff4fd8' },
  { id: 'rubber', label: 'Caoutchouc', swatch: '#3a3e46' },
]

const HOLO_PANELS: Record<string, { label: string; text: string }> = {
  exploration: { label: 'Exploration', text: 'Exploration|Systèmes scannés : 318|Premières découvertes : 42|Valeur : 142 M cr' },
  trade: { label: 'Commerce', text: 'Commerce|Meilleure route : Lave → Leesti|Profit : 4 212 cr/t|Soute : 24 t' },
  combat: { label: 'Combat', text: 'Combat|Primes : 1,2 M cr|Rang : Dangereux|Munitions : 86 %' },
  mining: { label: 'Minage', text: 'Minage|Painite : 12 t|Diamants basse temp. : 6 t|Drones : 18' },
}

const ARCADE_TEXTS: Record<string, string[]> = {
  elite: [
    'ELITE (1984) : vous vous posez à Lave Station du premier coup. Personne ne vous croira.',
    'Un Krait vous prend en chasse. GAME OVER. Record : CMDR Jameson.',
  ],
  invaders: ['THARGOID INVADERS : vague 7. Les Thargoïdes finissent toujours par gagner.', 'INSÉREZ UN CRÉDIT (les crédits de la banque galactique ne marchent pas).'],
  asteroids: ['ASTÉROÏDES : 8 900 points. Le vrai minage paie mieux.', 'Vous pulvérisez une roche de painite. Aïe, votre portefeuille.'],
}

// ---------------------------------------------------------------- catalogue

export const CATALOG: CatalogEntry[] = [
  {
    id: 'holo-me', name: 'Holo-Me', model: 'holo-me', mount: 'floor', solid: false, fixed: true,
    light: { color: '#ffd2a8', intensity: 1.4, at: [0, 1.4, 0], priority: 0 },
  },

  // --- Chambre
  {
    id: 'cozy-bed', name: 'Grand lit', category: 'rest', model: 'cozy-bed', mount: 'floor', variants: fabrics('teal'),
    interact: 'Grand lit : couette épaisse, deux oreillers, et une peluche qui ressemble étrangement à Comète.',
  },
  {
    id: 'bunk-bed', name: 'Lits superposés', category: 'rest', model: 'bunk-bed', mount: 'floor', variants: fabrics('navy'),
    interact: 'Couchette. Sous l\'oreiller, un journal : « Jour 214. Toujours en supercroisière vers Hutton Orbital. »',
  },
  { id: 'nightstand', name: 'Table de chevet', category: 'rest', model: 'nightstand', mount: 'floor', surface: 0.28 },
  {
    id: 'suit-locker', name: 'Casier à combinaison', category: 'rest', model: 'suit-locker', mount: 'floor',
    variants: [{ id: 'maverick', label: 'Maverick', swatch: '#c98a34' }, { id: 'artemis', label: 'Artemis', swatch: '#e9eef4' }],
    interact: (v) => (v === 'artemis' ? 'Casier à combinaison : une Artemis immaculée, bulle de verre polie.' : 'Casier à combinaison : une Maverick propre et repassée. Enfin, propre.'),
  },

  // --- Salon
  {
    id: 'sofa', name: 'Canapé', category: 'living', model: 'sofa', mount: 'floor', variants: fabrics('terracotta'),
    interact: 'Canapé : moelleux à souhait, idéal pour une sieste entre deux sauts.',
  },
  { id: 'beanbag', name: 'Pouf', category: 'living', model: 'beanbag', mount: 'floor', variants: fabrics('mustard') },
  { id: 'bench', name: 'Banc', category: 'living', model: 'bench', mount: 'floor', variants: fabrics('sage') },
  { id: 'coffee-table', name: 'Table basse', category: 'living', model: 'coffee-table', mount: 'floor', surface: 0.22 },
  { id: 'table', name: 'Table', category: 'living', model: 'table', mount: 'floor', surface: 0.4 },
  { id: 'table-large', name: 'Grande table', category: 'living', model: 'table-large', mount: 'floor', surface: 0.4 },
  { id: 'chair', name: 'Chaise', category: 'living', model: 'chair-cushion', mount: 'floor' },
  { id: 'office-chair', name: 'Fauteuil de bureau', category: 'living', model: 'chair-armrest-headrest', mount: 'floor' },
  {
    id: 'desk', name: 'Bureau', category: 'living', model: 'desk', mount: 'floor', surface: 0.4,
    interact: 'Bureau : une maquette de Cobra Mk III, une tasse de Hutton Orbital et 212 messages non lus.',
  },
  {
    id: 'fireplace', name: 'Cheminée holographique', category: 'living', model: 'fireplace', mount: 'floor', surface: 0.4,
    action: 'Se réchauffer', interact: 'Cheminée holographique : 100 % réconfort, 0 % combustion. Comète adore.',
    light: { color: '#ff9a4a', intensity: 2.2, at: [0, 1.4, 0.95], flicker: 'fire', priority: 1 },
  },
  {
    id: 'aquarium', name: 'Aquarium', category: 'living', model: 'aquarium', mount: 'floor', surface: 0.78, action: 'Observer',
    interact: ['Aquarium : six poissons de la Terre, une plante de Colonia.', 'Le poisson orange vous fixe. Il juge vos choix de carrière.'],
  },
  {
    id: 'cat-bed', name: 'Panier de Comète', category: 'living', model: 'cat-bed', mount: 'floor', solid: false,
    interact: 'Panier de Comète : plein de poils, et une souris en tissu mâchouillée.',
  },

  // --- Rangements
  {
    id: 'bookshelf', name: 'Bibliothèque', category: 'storage', model: 'bookshelf', mount: 'floor', surface: 0.95,
    interact: [
      'Bibliothèque : « Elite : The Dark Wheel », un guide des Ingénieurs, et un livre de cuisine thargoïde (vide).',
      'Un album photo : vous devant Sagittarius A*, en combinaison, pouce levé.',
    ],
  },
  {
    id: 'locker', name: 'Casiers', category: 'storage', model: 'locker', mount: 'floor', surface: 0.9,
    interact: 'Casiers : chaussettes de rechange, barres protéinées, une photo de famille prise à Achenar.',
  },

  // --- Lumières
  {
    id: 'floor-lamp', name: 'Lampadaire', category: 'light', model: 'floor-lamp', mount: 'floor',
    light: { color: '#ffd9a8', intensity: 1.1, at: [0, 1.05, 0], priority: 3 },
  },

  // --- Plantes
  { id: 'plant', name: 'Plante', category: 'plants', model: 'plant', mount: 'floor' },
  { id: 'plant-tall', name: 'Palmier', category: 'plants', model: 'plant-tall', mount: 'floor' },
  {
    id: 'hydro-rack', name: 'Bac hydroponique', category: 'plants', model: 'hydro-rack', mount: 'floor',
    interact: ['Hydroponie : tomates, basilic et un piment de Lave.', 'Les plantes poussent sous des LED roses. Elles ont l\'air heureuses.'],
  },

  // --- Elite
  {
    id: 'holo-panel', name: 'Panneau holographique', category: 'elite', model: 'holo-panel', mount: 'floor', solid: false,
    variants: Object.entries(HOLO_PANELS).map(([id, p]) => ({ id, label: p.label })),
    label: (v) => HOLO_PANELS[v ?? '']?.text ?? HOLO_PANELS.exploration.text,
  },
  {
    id: 'orrery', name: 'Carte du système', category: 'elite', model: 'orrery', mount: 'floor',
    interact: 'Carte du système : une étoile de classe G, quatre planètes, dont une géante gazeuse à anneaux.',
  },
  {
    id: 'galaxy-map', name: 'Carte galactique', category: 'elite', model: 'galaxy-map', mount: 'floor',
    interact: 'Carte galactique : 400 milliards d\'étoiles. Colonia à 22 000 al, Beagle Point à 65 279 al.',
  },
  { id: 'radar', name: 'Scanner', category: 'elite', model: 'radar', mount: 'floor', solid: false },
  {
    id: 'sample-tank', name: 'Cuve d\'exobiologie', category: 'elite', model: 'sample-tank', mount: 'floor',
    interact: 'Cuve d\'exobiologie : Bacterium Aurasus. Il bouge quand on ne le regarde pas.',
  },
  {
    id: 'pilot-seat', name: 'Siège de pilote', category: 'elite', model: 'pilot-seat', mount: 'floor',
    interact: 'Siège de pilote d\'occasion, recyclé en fauteuil. Quelqu\'un a gravé « o7 » sur l\'accoudoir.',
  },
  { id: 'cargo', name: 'Conteneurs de cargaison', category: 'elite', model: 'cargo', mount: 'floor' },

  // --- Loisirs
  {
    id: 'arcade', name: 'Borne d\'arcade', category: 'leisure', model: 'arcade', mount: 'floor', action: 'Jouer',
    variants: [{ id: 'elite', label: 'Elite' }, { id: 'invaders', label: 'Thargoid Invaders' }, { id: 'asteroids', label: 'Astéroïdes' }],
    interact: (v) => ARCADE_TEXTS[v ?? 'elite'] ?? ARCADE_TEXTS.elite,
  },
  {
    id: 'punching-bag', name: 'Sac de frappe', category: 'leisure', model: 'punching-bag', mount: 'floor', action: 'Frapper',
    interact: ['Paf ! Le sac encaisse sans broncher.', 'Bim ! Quelqu\'un a dessiné un Thargoïde dessus.'],
  },
  {
    id: 'exercise-bike', name: 'Vélo d\'appartement', category: 'leisure', model: 'exercise-bike', mount: 'floor', action: 'Pédaler',
    interact: 'Vélo d\'appartement : il recharge les batteries de secours. Pédalez, CMDR !',
  },
  {
    id: 'treadmill', name: 'Tapis de course', category: 'leisure', model: 'treadmill', mount: 'floor', action: 'Courir',
    interact: 'Tapis de course : programme « Fuite devant un Thargoïde », niveau 7.',
  },
  { id: 'weight-bench', name: 'Banc de musculation', category: 'leisure', model: 'weight-bench', mount: 'floor' },
  { id: 'dumbbell-rack', name: 'Haltères', category: 'leisure', model: 'dumbbell-rack', mount: 'floor' },

  // --- Tapis
  { id: 'rug', name: 'Tapis', category: 'rugs', model: 'rug', mount: 'flat', variants: RUG_PALETTES, label: (v) => `${v ?? 'warm'}:2x1.4` },
  { id: 'rug-small', name: 'Petit tapis', category: 'rugs', model: 'rug', mount: 'flat', variants: RUG_PALETTES, label: (v) => `${v ?? 'warm'}:1.3x0.9` },
  { id: 'rug-large', name: 'Grand tapis', category: 'rugs', model: 'rug', mount: 'flat', variants: RUG_PALETTES, label: (v) => `${v ?? 'warm'}:2.6x1.7` },
]

const BY_ID = new Map(CATALOG.map((e) => [e.id, e]))

export function entryOf(id: string): CatalogEntry | undefined {
  return BY_ID.get(id)
}

/** Texte passé au constructeur du meuble. */
export function builderLabel(entry: CatalogEntry, variant: string | undefined): string | undefined {
  return entry.label ? entry.label(variant) : variant
}

export function interactText(entry: CatalogEntry, variant: string | undefined): string | string[] | undefined {
  return typeof entry.interact === 'function' ? entry.interact(variant) : entry.interact
}

/** Bloque le passage ? */
export function isSolid(entry: CatalogEntry): boolean {
  return entry.solid ?? entry.mount === 'floor'
}
