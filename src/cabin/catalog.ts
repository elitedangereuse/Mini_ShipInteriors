import type { StationModel } from '../assets'
import type { CustomModel } from '../furniture'
import { FRAMES, GLOBES, POSTERS } from '../furniture/decor'
import type { IconName } from '../icons'
import type { Flicker } from '../levels'

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

export type CategoryId = 'rest' | 'living' | 'storage' | 'light' | 'plants' | 'wall' | 'objects' | 'elite' | 'leisure' | 'arcade' | 'party' | 'rugs'

export const CATEGORIES: { id: CategoryId; label: string; icon: IconName }[] = [
  { id: 'rest', label: 'Chambre', icon: 'bed' },
  { id: 'living', label: 'Salon', icon: 'couch' },
  { id: 'storage', label: 'Rangements', icon: 'books' },
  { id: 'light', label: 'Lumières', icon: 'lamp' },
  { id: 'plants', label: 'Plantes', icon: 'potted-plant' },
  { id: 'wall', label: 'Murs', icon: 'frame-corners' },
  { id: 'objects', label: 'Objets', icon: 'cube' },
  { id: 'elite', label: 'Elite', icon: 'rocket' },
  { id: 'leisure', label: 'Sport', icon: 'barbell' },
  { id: 'arcade', label: 'Arcade', icon: 'joystick' },
  { id: 'party', label: 'Soirée', icon: 'disco-ball' },
  { id: 'rugs', label: 'Tapis', icon: 'square-half' },
]

/** Lumière d'un objet ; `at` : position dans le repère de l'objet. */
export interface CatalogLight {
  color: string
  intensity: number
  at: [number, number, number]
  flicker?: Flicker
  /** La réserve de lumières est petite : priorité la plus basse d'abord. */
  priority: number
}

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
  /**
   * Texte à l'interaction (E) ; une liste : une phrase au hasard. Une fonction reçoit la
   * variante, et rend le texte à l'instant de l'interaction (l'heure d'une horloge…).
   */
  interact?: string | string[] | ((variant: string | undefined) => string | string[])
  /** Verbe de l'invite ; « Examiner » par défaut. */
  action?: string
  /** Emote que joue le personnage à l'interaction (danser sur la piste), avec le texte. */
  emote?: string
  /** L'interaction joue quelques mesures de musique (jukebox, platines), avec le texte. */
  music?: boolean
  /** Lumière de l'objet, ou de chacune de ses variantes. */
  light?: CatalogLight | ((variant: string | undefined) => CatalogLight)
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

const POSTER_TEXTS: Record<string, string> = {
  colonia: 'Affiche de Colonia : « Le voyage d\'une vie ». 22 000 al, sans escale si possible.',
  jameson: 'Affiche de Jameson Memorial : réservé aux pilotes Elite. Vous y êtes presque.',
  hutton: 'Affiche de Hutton Orbital : 0,22 al de supercroisière. Prévoyez des sandwichs.',
  sagittarius: 'Affiche de Sagittarius A* : le trou noir au cœur de la galaxie. Ne pas s\'approcher en supercroisière.',
  thargoid: 'Affiche d\'Aegis : « Restez vigilants ». Quelqu\'un a dessiné des moustaches au Thargoïde.',
  beagle: 'Affiche de Beagle Point : au bout de la galaxie, il y a… encore des étoiles.',
  comete: 'Affiche de Comète : « Ne pas nourrir après un saut ». Comète n\'est pas d\'accord.',
  guardians: 'Affiche des Gardiens : ruines de Synuefe. Les obélisques chantent quand personne n\'écoute.',
}

const GLOBE_TEXTS: Record<string, string> = {
  earth: 'Globe terrestre : la Terre, berceau de l\'humanité. Permis de Sol requis pour la visite.',
  mars: 'Globe de Mars : terraformée depuis des siècles, et toujours aussi rouge.',
  gas: 'Globe d\'une géante gazeuse : on cherche encore où poser le vaisseau.',
}

const NEONS: Record<string, string> = { o7: 'o7', elite: 'ÉLITE', comete: 'COMÈTE', cmdr: 'CMDR' }

/** Néons en forme (cf. NEON_SHAPES dans furniture/lights.ts) : libellé, couleur du tube, phrase. */
const NEON_SHAPES: (Variant & { text: string })[] = [
  { id: 'planet', label: 'Planète à anneaux', swatch: '#39d5ff', text: 'Néon planète : une géante gazeuse de poche. Pas de station en orbite, pas de taxe d\'amarrage.' },
  { id: 'star', label: 'Étoile', swatch: '#ffd23c', text: 'Néon étoile : classe O, la plus brillante… de la cabine. Ne pas écoper de carburant dessus.' },
  { id: 'bolt', label: 'Éclair', swatch: '#ff8a1c', text: 'Néon éclair : il grésille comme un FSD qui charge.' },
  { id: 'cat', label: 'Comète', swatch: '#ff6ad5', text: 'Néon Comète : la seule version de Comète qui ne réclame pas sa pâtée.' },
  { id: 'heart', label: 'Cœur', swatch: '#ff2e63', text: 'Néon cœur : cadeau d\'un CMDR croisé à Jameson Memorial.' },
]

/** Bandeaux LED (cf. LEDS dans furniture/lights.ts) et la couleur de leur lumière. */
const LED_STRIPS: (Variant & { light: string })[] = [
  { id: 'cyan', label: 'Cyan', swatch: '#39d5ff', light: '#39d5ff' },
  { id: 'magenta', label: 'Magenta', swatch: '#ff3bd0', light: '#ff3bd0' },
  { id: 'amber', label: 'Ambre', swatch: '#ffa630', light: '#ffa630' },
  { id: 'rainbow', label: 'Arc-en-ciel', swatch: 'linear-gradient(90deg, #ff3b3b, #ffe94f, #3bff8a, #3bc8ff, #b061ff)', light: '#c9a0ff' },
]

/** Palettes de la piste de danse (cf. FLOOR_PALETTES dans furniture/party.ts), et leur lumière. */
const DANCE: (Variant & { light: string })[] = [
  { id: 'disco', label: 'Arc-en-ciel', swatch: 'conic-gradient(#ff3b6b, #ffe94f, #3bff8a, #3bc8ff, #b43bff, #ff3b6b)', light: '#ff4fd8' },
  { id: 'neon', label: 'Néon', swatch: 'linear-gradient(135deg, #ff4fd8, #39e0ff)', light: '#ff4fd8' },
  { id: 'gold', label: 'Or', swatch: 'linear-gradient(135deg, #fff1c4, #ff9f3b)', light: '#ffb86b' },
  { id: 'ice', label: 'Glace', swatch: 'linear-gradient(135deg, #ffffff, #6a8cff)', light: '#59d8ff' },
]
const DANCE_TEXTS = [
  'La piste s\'illumine sous vos pieds. Comète vous regarde, perplexe.',
  'Vous enchaînez un pas de danse en gravité réduite. Enfin, presque.',
  'Le Thargoïde de l\'affiche semble battre la mesure.',
]
const danceLight = (v: string | undefined): CatalogLight => {
  const d = DANCE.find((x) => x.id === v) ?? DANCE[0]
  // Juste après le Holo-Me : on pose une piste de danse pour sa lumière.
  return { color: d.light, intensity: 1.6, at: [0, 0.45, 0], flicker: d.id === 'disco' ? 'disco' : 'pulse', priority: 0.5 }
}

const GALNET = [
  'GalNet en direct : des Thargoïdes aperçus près de Maia.',
  'GalNet en direct : la painite s\'envole à Jameson Memorial.',
  'GalNet en direct : Hutton Orbital annonce un record de visiteurs (trois).',
]

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
    id: 'dresser', name: 'Commode', category: 'rest', model: 'dresser', mount: 'floor', surface: 0.47,
    interact: 'Commode : chaussettes dépareillées et une combinaison de rechange (taille unique, donc trop grande).',
  },
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
  {
    id: 'armchair', name: 'Fauteuil club', category: 'living', model: 'armchair', mount: 'floor', variants: fabrics('teal'),
    interact: 'Fauteuil club : on s\'y enfonce, on n\'en ressort plus.',
  },
  { id: 'beanbag', name: 'Pouf', category: 'living', model: 'beanbag', mount: 'floor', variants: fabrics('mustard') },
  { id: 'bench', name: 'Banc', category: 'living', model: 'bench', mount: 'floor', variants: fabrics('sage') },
  { id: 'coffee-table', name: 'Table basse', category: 'living', model: 'coffee-table', mount: 'floor', surface: 0.22 },
  { id: 'side-table', name: 'Guéridon', category: 'living', model: 'side-table', mount: 'floor', surface: 0.3125 },
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
  {
    id: 'crate', name: 'Caisse de fret', category: 'storage', model: 'crate', mount: 'floor', surface: 0.4,
    interact: 'Caisse de fret : « Fragile — Brandy de Lave ». Elle est étrangement légère.',
  },
  { id: 'wall-shelf', name: 'Étagère murale', category: 'storage', model: 'wall-shelf', mount: 'wall', surface: 0.5125 },

  // --- Lumières
  {
    id: 'floor-lamp', name: 'Lampadaire', category: 'light', model: 'floor-lamp', mount: 'floor',
    light: { color: '#ffd9a8', intensity: 1.1, at: [0, 1.05, 0], priority: 3 },
  },
  {
    id: 'arc-lamp', name: 'Lampadaire arc', category: 'light', model: 'arc-lamp', mount: 'floor',
    light: { color: '#ffd9a8', intensity: 1.0, at: [0, 0.8, 0.3], priority: 3 },
    interact: [
      'Lampadaire arc : quarante kilos de marbre dans le socle, la cargaison la moins rentable de la galaxie.',
      'Il se penche sur le fauteuil comme un contrôleur de trafic sur une approche ratée.',
    ],
  },
  {
    id: 'paper-lantern', name: 'Lampe en papier', category: 'light', model: 'paper-lantern', mount: 'floor',
    variants: [{ id: 'round', label: 'Trois boules', swatch: '#ffe6bd' }, { id: 'tall', label: 'Colonne', swatch: '#ffd494' }],
    light: { color: '#ffcf8f', intensity: 0.8, at: [0, 0.45, 0], priority: 3 },
    interact: ['Papier de riz cultivé en hydroponie à Achenar. Tenir à l\'écart des propulseurs.', 'Le papier frémit à chaque saut ; la lanterne, elle, reste zen.'],
  },
  {
    id: 'pendant-lamp', name: 'Suspension', category: 'light', model: 'pendant-lamp', mount: 'floor', solid: false,
    variants: [{ id: 'dome', label: 'Dôme de métal', swatch: '#30343c' }, { id: 'globe', label: 'Globe de verre', swatch: '#fff3dc' }, { id: 'rattan', label: 'Rotin', swatch: '#a8743c' }],
    light: (v) => ({ color: v === 'rattan' ? '#ffb870' : '#ffd2a0', intensity: 0.9, at: [0, 0.68, 0], priority: 3 }),
    interact: (v) =>
      v === 'rattan'
        ? 'Suspension de rotin : tressée main sur une planète agricole. Le rotin n\'avait jamais vu l\'espace.'
        : 'Suspension : elle se balance à chaque saut hyperspatial, et un peu plus à chaque atterrissage raté.',
  },
  {
    id: 'sconce', name: 'Applique', category: 'light', model: 'sconce', mount: 'wall',
    light: { color: '#ffd9a8', intensity: 0.8, at: [0, 0.8, 0.3], priority: 4 },
  },
  {
    id: 'string-lights', name: 'Guirlande lumineuse', category: 'light', model: 'string-lights', mount: 'wall',
    variants: [{ id: 'warm', label: 'Blanc chaud', swatch: '#ffe3b0' }, { id: 'multi', label: 'Multicolore', swatch: 'conic-gradient(#ff6a5a, #ffd23c, #6aff8a, #6ab8ff, #ff6ad5, #ff6a5a)' }, { id: 'blue', label: 'Bleu glacier', swatch: '#9fdcff' }],
    light: (v) => ({ color: v === 'blue' ? '#9fd4ff' : '#ffc98a', intensity: 0.5, at: [0, 0.72, 0.25], priority: 5 }),
    interact: [
      'Guirlande lumineuse : seize ampoules, et toujours une qui clignote à contretemps. Comme le pilote automatique.',
      'Accrochée pour les fêtes de 3309. Personne n\'a eu le cœur de la décrocher.',
    ],
  },
  {
    id: 'led-strip', name: 'Bandeau LED', category: 'light', model: 'led-strip', mount: 'wall', variants: LED_STRIPS,
    light: (v) => ({ color: (LED_STRIPS.find((l) => l.id === v) ?? LED_STRIPS[0]).light, intensity: 0.6, at: [0, 0.7, 0.2], priority: 5 }),
    interact: [
      'Bandeau LED : ambiance salon de tuning de Deciat. Felicity Farseer n\'approuve pas.',
      'Seize millions de couleurs, et l\'équipage vote toujours pour l\'orange des interfaces.',
    ],
  },
  {
    id: 'desk-lamp', name: 'Lampe de bureau', category: 'light', model: 'desk-lamp', mount: 'top',
    variants: [
      { id: 'black', label: 'Noire', swatch: '#23262d' },
      { id: 'white', label: 'Blanche', swatch: '#e9ecef' },
      { id: 'orange', label: 'Orange Elite', swatch: '#ff8a1c' },
      { id: 'teal', label: 'Bleu canard', swatch: '#2f9a96' },
    ],
    light: { color: '#ffe2b0', intensity: 0.5, at: [0, 0.12, 0.09], priority: 5 },
    interact: ['Lampe de bureau : idéale pour lire les petites lignes d\'un contrat de la Pilots Federation.', 'Elle éclaire le journal de bord. Et les 212 messages non lus.'],
  },
  {
    id: 'lava-lamp', name: 'Lampe à lave', category: 'light', model: 'lava-lamp', mount: 'top',
    variants: [{ id: 'orange', label: 'Orange', swatch: '#ff5a1c' }, { id: 'violet', label: 'Violette', swatch: '#ff3bb0' }, { id: 'green', label: 'Verte', swatch: '#29d97a' }],
    interact: 'Lampe à lave : les bulles montent, redescendent… Hypnotique.',
    light: { color: '#ff9a5a', intensity: 0.5, at: [0, 0.4, 0], priority: 5 },
  },
  {
    id: 'candles', name: 'Bougies', category: 'light', model: 'candles', mount: 'top',
    interact: 'Bougies : de vraies flammes, rarissimes à bord. Le détecteur d\'incendie fait semblant de dormir.',
    light: { color: '#ffb35c', intensity: 0.5, at: [0, 0.35, 0], flicker: 'fire', priority: 5 },
  },
  {
    id: 'plasma-ball', name: 'Boule plasma', category: 'light', model: 'plasma-ball', mount: 'top', action: 'Toucher',
    light: { color: '#c77dff', intensity: 0.5, at: [0, 0.2, 0], priority: 5 },
    interact: [
      'Vous posez un doigt sur le verre : les éclairs viennent vous saluer. Comète crache, puis revient regarder.',
      'Un orage en bocal : la météo la plus stable du vaisseau. Ne pas la montrer aux Gardiens.',
    ],
  },

  // --- Plantes
  { id: 'plant', name: 'Plante', category: 'plants', model: 'plant', mount: 'floor' },
  { id: 'plant-tall', name: 'Palmier', category: 'plants', model: 'plant-tall', mount: 'floor' },
  { id: 'monstera', name: 'Monstera', category: 'plants', model: 'monstera', mount: 'floor' },
  {
    id: 'exobio-plant', name: 'Spécimen exobiologique', category: 'plants', model: 'exobio-plant', mount: 'floor',
    variants: [{ id: 'anemone', label: 'Anémone', swatch: '#ff6ad5' }, { id: 'brain', label: 'Arbre-cerveau', swatch: '#5ff2ff' }, { id: 'crystal', label: 'Cristallin', swatch: '#b8ff5a' }],
    interact: 'Spécimen d\'exobiologie : il pulse doucement. Vista Genomics en offrirait une fortune.',
  },
  { id: 'succulent', name: 'Plante grasse', category: 'plants', model: 'succulent', mount: 'top' },
  { id: 'cactus', name: 'Cactus', category: 'plants', model: 'cactus', mount: 'top', interact: 'Cactus : arrosage une fois par saut hyperspatial. Environ.' },
  { id: 'bonsai', name: 'Bonsaï', category: 'plants', model: 'bonsai', mount: 'top' },
  {
    id: 'flowers', name: 'Bouquet', category: 'plants', model: 'flowers', mount: 'top',
    variants: [{ id: 'rose', label: 'Roses', swatch: '#ff6aa0' }, { id: 'yellow', label: 'Jaunes', swatch: '#ffd23c' }, { id: 'blue', label: 'Bleues', swatch: '#6ab0ff' }, { id: 'white', label: 'Blanches', swatch: '#f4f0ea' }],
  },
  {
    id: 'hydro-rack', name: 'Bac hydroponique', category: 'plants', model: 'hydro-rack', mount: 'floor',
    interact: ['Hydroponie : tomates, basilic et un piment de Lave.', 'Les plantes poussent sous des LED roses. Elles ont l\'air heureuses.'],
  },

  // --- Murs
  {
    id: 'poster', name: 'Affiche', category: 'wall', model: 'poster', mount: 'wall',
    variants: Object.entries(POSTERS).map(([id, p]) => ({ id, label: p.label })),
    interact: (v) => POSTER_TEXTS[v ?? ''] ?? POSTER_TEXTS.colonia,
  },
  {
    id: 'frame', name: 'Tableau', category: 'wall', model: 'frame', mount: 'wall',
    variants: Object.entries(FRAMES).map(([id, f]) => ({ id, label: f.label })),
  },
  {
    id: 'wall-clock', name: 'Horloge', category: 'wall', model: 'wall-clock', mount: 'wall', action: 'Lire l\'heure',
    interact: () => {
      const now = new Date()
      return `Il est ${now.getHours()} h ${String(now.getMinutes()).padStart(2, '0')} à votre montre. À bord, c'est toujours l'heure du café.`
    },
  },
  { id: 'wall-screen', name: 'Écran GalNet', category: 'wall', model: 'wall-screen', mount: 'wall', action: 'Regarder', interact: GALNET },
  {
    id: 'wall-neon', name: 'Néon', category: 'wall', model: 'wall-neon', mount: 'wall',
    variants: Object.entries(NEONS).map(([id, label]) => ({ id, label })),
    label: (v) => NEONS[v ?? ''] ?? NEONS.o7,
  },
  {
    id: 'neon-shape', name: 'Néon en forme', category: 'wall', model: 'neon-shape', mount: 'wall', variants: NEON_SHAPES,
    light: (v) => ({ color: (NEON_SHAPES.find((n) => n.id === v) ?? NEON_SHAPES[0]).swatch!, intensity: 0.5, at: [0, 0.6, 0.3], flicker: 'neon', priority: 5 }),
    interact: (v) => (NEON_SHAPES.find((n) => n.id === v) ?? NEON_SHAPES[0]).text,
  },

  // --- Objets
  { id: 'mug', name: 'Tasse de Hutton Orbital', category: 'objects', model: 'mug', mount: 'top', interact: 'Tasse de Hutton Orbital : « J\'ai fait le trajet jusqu\'à Hutton Orbital, et je n\'ai eu que cette tasse. »' },
  {
    id: 'globe', name: 'Globe', category: 'objects', model: 'globe', mount: 'top',
    variants: Object.entries(GLOBES).map(([id, g]) => ({ id, label: g.label })),
    interact: (v) => GLOBE_TEXTS[v ?? ''] ?? GLOBE_TEXTS.earth,
  },
  { id: 'books', name: 'Pile de livres', category: 'objects', model: 'books', mount: 'top', interact: 'Pile de livres : « Guide des Ingénieurs », tome 3. Le tome 2 est introuvable.' },
  { id: 'plush', name: 'Peluche de Comète', category: 'objects', model: 'plush', mount: 'top', interact: 'Peluche de Comète : plus sage que l\'original.' },
  { id: 'trophy', name: 'Trophée Elite', category: 'objects', model: 'trophy', mount: 'top', interact: 'Trophée du rang Elite : « Au CMDR, pour services rendus à la galaxie ».' },
  { id: 'radio', name: 'Radio', category: 'objects', model: 'radio', mount: 'top', interact: 'Radio de bord : entre deux grésillements, une vieille chanson de la Terre.' },
  { id: 'record-player', name: 'Platine vinyle', category: 'objects', model: 'record-player', mount: 'top', interact: 'Platine vinyle : de la musique d\'avant les sauts. Ça craque, c\'est charmant.' },
  { id: 'photo-frame', name: 'Photo', category: 'objects', model: 'photo-frame', mount: 'top', interact: 'Photo : vous devant une planète, en combinaison, pouce levé.' },
  {
    id: 'ship-model', name: 'Maquette de Cobra', category: 'objects', model: 'ship-model', mount: 'top',
    variants: [{ id: 'silver', label: 'Argent', swatch: '#c9cdd4' }, { id: 'orange', label: 'Orange', swatch: '#e0701e' }, { id: 'black', label: 'Noire', swatch: '#3a3e46' }, { id: 'white', label: 'Blanche', swatch: '#f4f6f8' }],
    interact: 'Maquette de Cobra Mk III : le vaisseau de vos débuts. On ne l\'oublie jamais.',
  },
  { id: 'telescope', name: 'Lunette astronomique', category: 'objects', model: 'telescope', mount: 'floor', interact: 'Lunette astronomique : on voit Sol d\'ici. Enfin, on croit.' },
  {
    id: 'guitar', name: 'Guitare', category: 'objects', model: 'guitar', mount: 'floor', action: 'Jouer',
    interact: ['Vous grattez quelques accords. Comète quitte la pièce.', 'Vous jouez « Le Beau Danube bleu » à la guitare. Presque.'],
  },
  {
    id: 'display-case', name: 'Vitrine', category: 'objects', model: 'display-case', mount: 'floor', action: 'Admirer',
    variants: [{ id: 'silver', label: 'Argent', swatch: '#c9cdd4' }, { id: 'orange', label: 'Orange', swatch: '#e0701e' }, { id: 'black', label: 'Noire', swatch: '#3a3e46' }, { id: 'white', label: 'Blanche', swatch: '#f4f6f8' }],
    interact: 'Vitrine : une Cobra Mk III au 1/500, la fierté du CMDR.',
  },

  // --- Elite
  {
    id: 'thargoid-sensor', name: 'Capteur thargoïde', category: 'elite', model: 'thargoid-sensor', mount: 'top',
    interact: 'Capteur thargoïde : il palpite. Ne pas le secouer, et surtout ne pas le montrer à la douane.',
  },
  { id: 'guardian-relic', name: 'Relique des Gardiens', category: 'elite', model: 'guardian-relic', mount: 'top', interact: 'Relique des Gardiens : elle vibre doucement quand on s\'en approche.' },
  { id: 'terrarium', name: 'Terrarium', category: 'elite', model: 'terrarium', mount: 'top', interact: 'Terrarium : un organisme de Colonia qui luit la nuit. Il s\'appelle Gérard.' },
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

  // --- Sport
  {
    id: 'arcade', name: 'Borne d\'arcade', category: 'arcade', model: 'arcade', mount: 'floor', action: 'Jouer',
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

  // --- Soirée
  {
    id: 'dance-floor', name: 'Piste de danse', category: 'party', model: 'dance-floor', mount: 'flat', variants: DANCE,
    label: (v) => `${v ?? 'disco'}:1.5x1.5`, action: 'Danser', emote: 'danse', interact: DANCE_TEXTS, light: danceLight,
  },
  {
    id: 'dance-floor-large', name: 'Grande piste de danse', category: 'party', model: 'dance-floor', mount: 'flat', variants: DANCE,
    label: (v) => `${v ?? 'disco'}:2x2`, action: 'Danser', emote: 'danse', interact: DANCE_TEXTS, light: danceLight,
  },
  {
    id: 'disco-ball', name: 'Boule à facettes', category: 'party', model: 'disco-ball', mount: 'floor', solid: false, action: 'Admirer',
    interact: ['Boule à facettes : quatre cent trente-deux petits miroirs, et autant de reflets de vous.', 'Elle tourne. Comète essaie d\'attraper les reflets depuis une heure.'],
  },
  {
    id: 'dj-booth', name: 'Platines de DJ', category: 'party', model: 'dj-booth', mount: 'floor', action: 'Mixer', music: true,
    interact: [
      'Vous scratchez « Le Beau Danube bleu ». Le public (Comète) est en délire.',
      'Aux platines : un remix du bip de l\'ordinateur de bord. Un classique.',
      'Vous montez le son. Quelque part, un voisin de cabine tape au mur.',
    ],
  },
  {
    id: 'jukebox', name: 'Jukebox', category: 'party', model: 'jukebox', mount: 'floor', action: 'Choisir un morceau', music: true,
    interact: [
      'Le jukebox joue « Le Beau Danube bleu (Docking Mix) ». Parfait pour un amarrage.',
      'Morceau choisi : « Sérénade en supercroisière ». Quatorze minutes, comme le trajet jusqu\'à la station.',
      'Le jukebox joue « Fly Me to Hutton Orbital ». Il y en a pour un moment.',
      'Face B : « Thargoid Groove ». La coque vibre étrangement.',
    ],
  },
  {
    id: 'speaker', name: 'Enceinte', category: 'party', model: 'speaker', mount: 'floor',
    variants: [{ id: 'black', label: 'Noire', swatch: '#1b1b21' }, { id: 'wood', label: 'Bois', swatch: '#7a4e32' }, { id: 'white', label: 'Blanche', swatch: '#e8eaee' }],
  },
  {
    id: 'laser', name: 'Projecteur laser', category: 'party', model: 'laser', mount: 'top',
    variants: [
      { id: 'green', label: 'Vert', swatch: '#39ff6a' },
      { id: 'red', label: 'Rouge', swatch: '#ff3b3b' },
      { id: 'blue', label: 'Bleu', swatch: '#3b8cff' },
      { id: 'rgb', label: 'Multicolore', swatch: 'conic-gradient(#ff3b3b, #39ff6a, #3b8cff, #ff3b3b)' },
    ],
    interact: 'Projecteur laser : classe 2, promis. Ne pas viser les hublots.',
  },
  {
    id: 'stage-light', name: 'Lyre', category: 'party', model: 'stage-light', mount: 'floor',
    interact: 'Lyre motorisée : elle balaie la pièce en rythme. Comète la poursuit.',
  },

  // --- Tapis
  { id: 'rug', name: 'Tapis', category: 'rugs', model: 'rug', mount: 'flat', variants: RUG_PALETTES, label: (v) => `${v ?? 'warm'}:2x1.4` },
  { id: 'rug-small', name: 'Petit tapis', category: 'rugs', model: 'rug', mount: 'flat', variants: RUG_PALETTES, label: (v) => `${v ?? 'warm'}:1.3x0.9` },
  { id: 'rug-large', name: 'Grand tapis', category: 'rugs', model: 'rug', mount: 'flat', variants: RUG_PALETTES, label: (v) => `${v ?? 'warm'}:2.6x1.7` },
  { id: 'rug-round', name: 'Tapis rond', category: 'rugs', model: 'rug-round', mount: 'flat', variants: RUG_PALETTES },
]

const BY_ID = new Map(CATALOG.map((e) => [e.id, e]))

export function entryOf(id: string): CatalogEntry | undefined {
  return BY_ID.get(id)
}

/** Texte passé au constructeur du meuble. */
export function builderLabel(entry: CatalogEntry, variant: string | undefined): string | undefined {
  return entry.label ? entry.label(variant) : variant
}

/** Texte à l'interaction ; celui d'une fonction est relu à chaque interaction (l'heure d'une horloge). */
export function interactText(entry: CatalogEntry, variant: string | undefined): string | string[] | (() => string | string[]) | undefined {
  const text = entry.interact
  return typeof text === 'function' ? () => text(variant) : text
}

/** Bloque le passage ? */
export function isSolid(entry: CatalogEntry): boolean {
  return entry.solid ?? entry.mount === 'floor'
}
