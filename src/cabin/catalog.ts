import type { StationModel } from '../assets'
import type { CustomModel } from '../furniture'
import { FRAMES, GLOBES, NEON_COLORS, POSTERS } from '../furniture/decor'
import { tr } from '../i18n'
import { COATS, petItemId, SPECIES } from '../pets'
import type { IconName } from '../icons'
import type { Flicker } from '../levels'
import { FUN_ENTRIES } from './catalog-fun'
import { GARDEN_ENTRIES } from './catalog-garden'
import { HOME_ENTRIES } from './catalog-home'
import { OUTDOOR_ENTRIES } from './catalog-outdoor'
import { SHIP_ENTRIES } from './catalog-ship'
import { fishCollection } from '../fishing/collection'
import { fishAbout, fishName, RARITY_NAME } from '../fishing/species'
import { FISH, fishById } from '../../shared/fishing.js'
import { fabrics, type Variant } from './variants'

export type { Variant } from './variants'

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

export type CategoryId =
  | 'rest' | 'living' | 'bath' | 'kitchen' | 'storage' | 'light' | 'plants' | 'wall' | 'posters' | 'objects' | 'tech' | 'elite'
  | 'adventures' | 'weapons' | 'pets' | 'leisure' | 'arcade' | 'party' | 'workshop' | 'medical' | 'rugs' | 'gardening' | 'outdoor'

export const CATEGORIES: { id: CategoryId; label: string; icon: IconName }[] = [
  { id: 'rest', label: tr('Chambre', 'Bedroom'), icon: 'bed' },
  { id: 'living', label: tr('Salon', 'Lounge'), icon: 'couch' },
  { id: 'bath', label: tr('Salle de bain', 'Bathroom'), icon: 'bathtub' },
  { id: 'kitchen', label: tr('Cuisine', 'Kitchen'), icon: 'cooking-pot' },
  { id: 'storage', label: tr('Rangements', 'Storage'), icon: 'books' },
  { id: 'light', label: tr('Lumières', 'Lighting'), icon: 'lamp' },
  { id: 'plants', label: tr('Plantes', 'Plants'), icon: 'potted-plant' },
  { id: 'gardening', label: tr('Jardinage', 'Gardening'), icon: 'carrot' },
  { id: 'outdoor', label: tr('Extérieur', 'Outdoors'), icon: 'tree' },
  { id: 'wall', label: tr('Murs', 'Walls'), icon: 'frame-corners' },
  { id: 'posters', label: tr('Affiches', 'Posters'), icon: 'film-slate' },
  { id: 'objects', label: tr('Objets', 'Objects'), icon: 'cube' },
  { id: 'tech', label: tr('Écrans et consoles', 'Screens and consoles'), icon: 'television' },
  { id: 'elite', label: 'Elite', icon: 'rocket' },
  { id: 'adventures', label: tr('Aventures', 'Adventures'), icon: 'treasure-chest' },
  { id: 'weapons', label: tr('Armurerie', 'Armoury'), icon: 'sword' },
  { id: 'pets', label: tr('Animaux', 'Pets'), icon: 'paw-print' },
  { id: 'leisure', label: tr('Sport', 'Fitness'), icon: 'barbell' },
  { id: 'arcade', label: 'Arcade', icon: 'joystick' },
  { id: 'party', label: tr('Soirée', 'Party'), icon: 'disco-ball' },
  { id: 'workshop', label: tr('Atelier', 'Workshop'), icon: 'toolbox' },
  { id: 'medical', label: tr('Infirmerie', 'Medical bay'), icon: 'first-aid-kit' },
  { id: 'rugs', label: tr('Tapis', 'Rugs'), icon: 'square-half' },
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
  /**
   * Teintes, en pastilles, à combiner avec la variante (couleur d'un néon) : la variante posée
   * devient « variante:teinte », sauf pour la première teinte (celle d'origine).
   */
  tints?: Variant[]
  /** Visuel de la miniature du catalogue, indépendant de la variante posée. */
  thumbnailVariant?: string
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
  /**
   * Se pose comme un sol : une tuile du quadrillage par exemplaire, jusque contre les murs, et
   * plusieurs d'un trait en glissant la souris (la tuile de terre cultivable).
   */
  grid?: boolean
  /**
   * Interaction que le jeu prend en charge (cf. `onUse` de CabinView et main.ts) : le cabanon et
   * les caisses de récolte ouvrent le sac et la réserve du jardinier.
   */
  use?: 'garden-shed' | 'garden-stock'
  /** Unique et indispensable : on le déplace, on ne le retire pas (le Holo-Me). */
  fixed?: boolean
  /**
   * Variantes à gagner : l'aménagement ne propose que celles que le joueur possède (les poissons
   * de sa collection, pour le trophée de pêche). Les quartiers des autres, eux, montrent les leurs.
   */
  owned?: (variant: string) => boolean
  /** Ce qu'on dit à qui n'en possède aucune. */
  locked?: string
}

// ---------------------------------------------------------------- variantes

/** Palettes des tapis (cf. RUGS dans furniture/cozy.ts). */
const RUG_PALETTES: Variant[] = [
  { id: 'warm', label: tr('Chaud', 'Warm'), swatch: '#b8563a' },
  { id: 'blue', label: tr('Bleu', 'Blue'), swatch: '#34507a' },
  { id: 'bath', label: tr('Lagon', 'Lagoon'), swatch: '#6fa8b8' },
  { id: 'neon', label: tr('Néon', 'Neon'), swatch: '#ff4fd8' },
  { id: 'rubber', label: tr('Caoutchouc', 'Rubber'), swatch: '#3a3e46' },
]

const HOLO_PANELS: Record<string, { label: string; text: string }> = {
  exploration: {
    label: 'Exploration',
    text: tr(
      'Exploration|Systèmes scannés : 318|Premières découvertes : 42|Valeur : 142 M cr',
      'Exploration|Systems scanned: 318|First discoveries: 42|Value: 142 M CR',
    ),
  },
  trade: {
    label: tr('Commerce', 'Trade'),
    text: tr('Commerce|Meilleure route : Lave → Leesti|Profit : 4 212 cr/t|Soute : 24 t', 'Trade|Best route: Lave → Leesti|Profit: 4,212 CR/t|Cargo: 24 t'),
  },
  combat: { label: 'Combat', text: tr('Combat|Primes : 1,2 M cr|Rang : Dangereux|Munitions : 86 %', 'Combat|Bounties: 1.2 M CR|Rank: Dangerous|Ammo: 86%') },
  mining: {
    label: tr('Minage', 'Mining'),
    text: tr('Minage|Painite : 12 t|Diamants basse temp. : 6 t|Drones : 18', 'Mining|Painite: 12 t|Low temp. diamonds: 6 t|Limpets: 18'),
  },
}

const POSTER_TEXTS: Record<string, string> = {
  colonia: tr(
    'Affiche de Colonia : « Le voyage d\'une vie ». 22 000 al, sans escale si possible.',
    'Colonia poster: “The journey of a lifetime”. 22,000 ly, non-stop if possible.',
  ),
  jameson: tr(
    'Affiche de Jameson Memorial : réservé aux pilotes Elite. Vous y êtes presque.',
    'Jameson Memorial poster: Elite pilots only. You\'re nearly there.',
  ),
  hutton: tr(
    'Affiche de Hutton Orbital : 0,22 al de supercroisière. Prévoyez des sandwichs.',
    'Hutton Orbital poster: 0.22 ly of supercruise. Pack sandwiches.',
  ),
  sagittarius: tr(
    'Affiche de Sagittarius A* : le trou noir au cœur de la galaxie. Ne pas s\'approcher en supercroisière.',
    'Sagittarius A* poster: the black hole at the heart of the galaxy. Do not approach in supercruise.',
  ),
  thargoid: tr(
    'Affiche d\'Aegis : « Restez vigilants ». Quelqu\'un a dessiné des moustaches au Thargoïde.',
    'Aegis poster: “Stay vigilant”. Someone has drawn a moustache on the Thargoid.',
  ),
  beagle: tr(
    'Affiche de Beagle Point : au bout de la galaxie, il y a… encore des étoiles.',
    'Beagle Point poster: at the far end of the galaxy, there are… more stars.',
  ),
  comete: tr(
    'Affiche de Comète : « Ne pas nourrir après un saut ». Comète n\'est pas d\'accord.',
    'Comète poster: “Do not feed after a jump”. Comète disagrees.',
  ),
  guardians: tr(
    'Affiche des Gardiens : ruines de Synuefe. Les obélisques chantent quand personne n\'écoute.',
    'Guardians poster: the Synuefe ruins. The obelisks sing when nobody is listening.',
  ),
}

const GLOBE_TEXTS: Record<string, string> = {
  earth: tr(
    'Globe terrestre : la Terre, berceau de l\'humanité. Permis de Sol requis pour la visite.',
    'Earth globe: the cradle of humanity. Sol permit required to visit.',
  ),
  mars: tr('Globe de Mars : terraformée depuis des siècles, et toujours aussi rouge.', 'Mars globe: terraformed for centuries, and still just as red.'),
  gas: tr('Globe d\'une géante gazeuse : on cherche encore où poser le vaisseau.', 'Gas giant globe: still looking for somewhere to land the ship.'),
}

const NEONS: Record<string, string> = { o7: 'o7', elite: tr('ÉLITE', 'ELITE'), comete: 'COMÈTE', cmdr: 'CMDR' }
const NEON_TINTS: Variant[] = Object.entries(NEON_COLORS).map(([id, c]) => ({ id, label: c.label, swatch: c.tube }))

/** Néons en forme (cf. NEON_SHAPES dans furniture/lights.ts) : libellé, couleur du tube, phrase. */
const NEON_SHAPES: (Variant & { text: string })[] = [
  {
    id: 'planet', label: tr('Planète à anneaux', 'Ringed planet'), swatch: '#39d5ff',
    text: tr(
      'Néon planète : une géante gazeuse de poche. Pas de station en orbite, pas de taxe d\'amarrage.',
      'Planet neon: a pocket gas giant. No station in orbit, no docking fees.',
    ),
  },
  {
    id: 'star', label: tr('Étoile', 'Star'), swatch: '#ffd23c',
    text: tr(
      'Néon étoile : classe O, la plus brillante… de la cabine. Ne pas écoper de carburant dessus.',
      'Star neon: class O, the brightest… in these quarters. Do not scoop fuel from it.',
    ),
  },
  {
    id: 'bolt', label: tr('Éclair', 'Lightning bolt'), swatch: '#ff8a1c',
    text: tr('Néon éclair : il grésille comme un FSD qui charge.', 'Lightning neon: it crackles like a charging FSD.'),
  },
  {
    id: 'cat', label: 'Comète', swatch: '#ff6ad5',
    text: tr('Néon Comète : la seule version de Comète qui ne réclame pas sa pâtée.', 'Comète neon: the only version of Comète that never demands dinner.'),
  },
  {
    id: 'heart', label: tr('Cœur', 'Heart'), swatch: '#ff2e63',
    text: tr('Néon cœur : cadeau d\'un CMDR croisé à Jameson Memorial.', 'Heart neon: a gift from a CMDR met at Jameson Memorial.'),
  },
]

/** Bandeaux LED (cf. LEDS dans furniture/lights.ts) et la couleur de leur lumière. */
const LED_STRIPS: (Variant & { light: string })[] = [
  { id: 'cyan', label: 'Cyan', swatch: '#39d5ff', light: '#39d5ff' },
  { id: 'magenta', label: 'Magenta', swatch: '#ff3bd0', light: '#ff3bd0' },
  { id: 'amber', label: tr('Ambre', 'Amber'), swatch: '#ffa630', light: '#ffa630' },
  { id: 'rainbow', label: tr('Arc-en-ciel', 'Rainbow'), swatch: 'linear-gradient(90deg, #ff3b3b, #ffe94f, #3bff8a, #3bc8ff, #b061ff)', light: '#c9a0ff' },
]

/** Palettes de la piste de danse (cf. FLOOR_PALETTES dans furniture/party.ts), et leur lumière. */
const DANCE: (Variant & { light: string })[] = [
  { id: 'disco', label: tr('Arc-en-ciel', 'Rainbow'), swatch: 'conic-gradient(#ff3b6b, #ffe94f, #3bff8a, #3bc8ff, #b43bff, #ff3b6b)', light: '#ff4fd8' },
  { id: 'neon', label: tr('Néon', 'Neon'), swatch: 'linear-gradient(135deg, #ff4fd8, #39e0ff)', light: '#ff4fd8' },
  { id: 'gold', label: tr('Or', 'Gold'), swatch: 'linear-gradient(135deg, #fff1c4, #ff9f3b)', light: '#ffb86b' },
  { id: 'ice', label: tr('Glace', 'Ice'), swatch: 'linear-gradient(135deg, #ffffff, #6a8cff)', light: '#59d8ff' },
]
const DANCE_TEXTS = [
  tr('La piste s\'illumine sous vos pieds. Comète vous regarde, perplexe.', 'The floor lights up under your feet. Comète watches you, baffled.'),
  tr('Vous enchaînez un pas de danse en gravité réduite. Enfin, presque.', 'You bust a move in low gravity. Well, almost.'),
  tr('Le Thargoïde de l\'affiche semble battre la mesure.', 'The Thargoid on the poster seems to be tapping along.'),
]
const danceLight = (v: string | undefined): CatalogLight => {
  const d = DANCE.find((x) => x.id === v) ?? DANCE[0]
  // Juste après le Holo-Me : on pose une piste de danse pour sa lumière.
  return { color: d.light, intensity: 1.6, at: [0, 0.45, 0], flicker: d.id === 'disco' ? 'disco' : 'pulse', priority: 0.5 }
}

const GALNET = [
  tr('GalNet en direct : des Thargoïdes aperçus près de Maia.', 'GalNet live: Thargoids sighted near Maia.'),
  tr('GalNet en direct : la painite s\'envole à Jameson Memorial.', 'GalNet live: painite prices soar at Jameson Memorial.'),
  tr('GalNet en direct : Hutton Orbital annonce un record de visiteurs (trois).', 'GalNet live: Hutton Orbital reports record visitor numbers (three).'),
]

const ARCADE_TEXTS: Record<string, string[]> = {
  elite: [
    tr(
      'ELITE (1984) : vous vous posez à Lave Station du premier coup. Personne ne vous croira.',
      'ELITE (1984): you dock at Lave Station on your first try. Nobody will believe you.',
    ),
    tr('Un Krait vous prend en chasse. GAME OVER. Record : CMDR Jameson.', 'A Krait gives chase. GAME OVER. High score: CMDR Jameson.'),
  ],
  invaders: [
    tr('THARGOID INVADERS : vague 7. Les Thargoïdes finissent toujours par gagner.', 'THARGOID INVADERS: wave 7. The Thargoids always win in the end.'),
    tr('INSÉREZ UN CRÉDIT (les crédits de la banque galactique ne marchent pas).', 'INSERT CREDIT (galactic bank credits not accepted).'),
  ],
  asteroids: [
    tr('ASTÉROÏDES : 8 900 points. Le vrai minage paie mieux.', 'ASTEROIDS: 8,900 points. Real mining pays better.'),
    tr('Vous pulvérisez une roche de painite. Aïe, votre portefeuille.', 'You blast a painite rock to dust. Ouch, your wallet.'),
  ],
  comete: [
    tr(
      'LE LABYRINTHE DE COMÈTE : toutes les croquettes avalées, trois robots aspirateurs semés. Comète réclame le niveau suivant.',
      'COMÈTE\'S MAZE: every last biscuit eaten, three robot vacuums shaken off. Comète demands the next level.',
    ),
    tr('GAME OVER : Comète s\'est arrêtée en plein couloir pour faire sa toilette.', 'GAME OVER: Comète stopped in the middle of a corridor to groom herself.'),
  ],
  srv: [
    tr(
      'SRV RALLY : saut de 40 m en 0,16 G. Vous atterrissez trois minutes plus tard, sur le toit.',
      'SRV RALLY: a 40 m jump in 0.16 G. You land three minutes later, on your roof.',
    ),
    tr(
      'Record de la lune : 1 240 m sans casser un seul module. L\'assurance n\'en revient pas.',
      'Moon record: 1,240 m without breaking a single module. The insurers can\'t believe it.',
    ),
  ],
  cargo: [
    tr(
      'CARGAISON : 64 t de palladium parfaitement rangées. La station refuse quand même le conteneur rouge.',
      'CARGO: 64 t of palladium, perfectly stacked. The station still refuses the red canister.',
    ),
    tr(
      'Rangée complète ! Un conteneur marqué « Brandy de Lave » vient de disparaître. Aucun témoin.',
      'Line cleared! A canister marked “Lavian Brandy” has just vanished. No witnesses.',
    ),
  ],
}

/**
 * Jeux des bornes (cf. GAMES dans furniture/arcade.ts) : la vignette de chacun sert de pastille.
 * Les cinq premiers se jouent (cf. src/arcade/) ; les autres ne font que leur démonstration.
 */
const ARCADE_GAMES: Variant[] = [
  { id: 'cargo', label: tr('Cargaison (jouable)', 'Cargo (playable)') },
  { id: 'viper', label: tr('Viper (jouable)', 'Viper (playable)') },
  { id: 'asteroids', label: tr('Astéroïdes (jouable)', 'Asteroids (playable)') },
  { id: 'invaders', label: tr('Thargoid Invaders (jouable)', 'Thargoid Invaders (playable)') },
  { id: 'fight', label: tr('Ruelle Fighter II (solo / 2 joueurs)', 'Ruelle Fighter II (solo / 2 players)') },
  { id: 'elite', label: 'Elite' },
  { id: 'comete', label: tr('Le Labyrinthe de Comète', 'Comète\'s Maze') },
  { id: 'srv', label: 'SRV Rally' },
]

const PINBALL_TEXTS: Record<string, string[]> = {
  thargoid: [
    tr(
      'THARGOID ATTACK : multibille ! Trois cœurs thargoïdes rebondissent entre les bumpers.',
      'THARGOID ATTACK: multiball! Three Thargoid hearts bounce between the bumpers.',
    ),
    tr(
      'HYPERDICTION : la bille s\'arrête net, tourne sur elle-même… puis file dans le trou. TILT.',
      'HYPERDICTION: the ball stops dead, spins on the spot… then drains. TILT.',
    ),
  ],
  guardians: [
    tr('GARDIENS : les trois obélisques s\'allument. La bille, elle, n\'y comprend rien.', 'GUARDIANS: all three obelisks light up. The ball hasn\'t a clue.'),
    tr('Relique gagnée ! Elle ne sert à rien, mais elle brille en bleu.', 'Relic won! It\'s no use at all, but it glows blue.'),
  ],
  lave: [
    tr('LAVE STATION : amarrage au premier essai, bille supplémentaire !', 'LAVE STATION: docked on the first attempt, extra ball!'),
    tr('JACKPOT : une caisse de Brandy de Lave. Le flipper ne rend pas la monnaie.', 'JACKPOT: a crate of Lavian Brandy. The machine gives no change.'),
  ],
}

// ---------------------------------------------------------------- catalogue

export const CATALOG: CatalogEntry[] = [
  {
    id: 'holo-me', name: 'Holo-Me', model: 'holo-me', mount: 'floor', solid: false, fixed: true,
    light: { color: '#ffd2a8', intensity: 1.4, at: [0, 1.4, 0], priority: 0 },
  },

  // --- Chambre
  {
    id: 'cozy-bed', name: tr('Grand lit', 'Double bed'), category: 'rest', model: 'cozy-bed', mount: 'floor', variants: fabrics('teal'),
    interact: tr(
      'Grand lit : couette épaisse, deux oreillers, et une peluche qui ressemble étrangement à Comète.',
      'Double bed: a thick duvet, two pillows, and a plush toy that looks oddly like Comète.',
    ),
  },
  {
    id: 'bunk-bed', name: tr('Lits superposés', 'Bunk beds'), category: 'rest', model: 'bunk-bed', mount: 'floor', variants: fabrics('navy'),
    interact: tr(
      'Couchette. Sous l\'oreiller, un journal : « Jour 214. Toujours en supercroisière vers Hutton Orbital. »',
      'Bunk. Under the pillow, a diary: “Day 214. Still in supercruise to Hutton Orbital.”',
    ),
  },
  { id: 'nightstand', name: tr('Table de chevet', 'Bedside table'), category: 'rest', model: 'nightstand', mount: 'floor', surface: 0.28 },
  {
    id: 'dresser', name: tr('Commode', 'Chest of drawers'), category: 'rest', model: 'dresser', mount: 'floor', surface: 0.47,
    interact: tr(
      'Commode : chaussettes dépareillées et une combinaison de rechange (taille unique, donc trop grande).',
      'Chest of drawers: odd socks and a spare flight suit (one size fits all, so too big).',
    ),
  },
  {
    id: 'suit-locker', name: tr('Casier à combinaison', 'Suit locker'), category: 'rest', model: 'suit-locker', mount: 'floor',
    variants: [{ id: 'maverick', label: 'Maverick', swatch: '#c98a34' }, { id: 'artemis', label: 'Artemis', swatch: '#e9eef4' }],
    interact: (v) =>
      v === 'artemis'
        ? tr('Casier à combinaison : une Artemis immaculée, bulle de verre polie.', 'Suit locker: a spotless Artemis, its glass bubble polished.')
        : tr('Casier à combinaison : une Maverick propre et repassée. Enfin, propre.', 'Suit locker: a Maverick, clean and pressed. Well, clean.'),
  },

  // --- Salon
  {
    id: 'sofa', name: tr('Canapé', 'Sofa'), category: 'living', model: 'sofa', mount: 'floor', variants: fabrics('terracotta'),
    interact: tr('Canapé : moelleux à souhait, idéal pour une sieste entre deux sauts.', 'Sofa: lovely and soft, ideal for a nap between jumps.'),
  },
  {
    id: 'armchair', name: tr('Fauteuil club', 'Club armchair'), category: 'living', model: 'armchair', mount: 'floor', variants: fabrics('teal'),
    interact: tr('Fauteuil club : on s\'y enfonce, on n\'en ressort plus.', 'Club armchair: you sink in, and you never get back out.'),
  },
  { id: 'beanbag', name: tr('Pouf', 'Beanbag'), category: 'living', model: 'beanbag', mount: 'floor', variants: fabrics('mustard') },
  { id: 'bench', name: tr('Banc', 'Bench'), category: 'living', model: 'bench', mount: 'floor', variants: fabrics('sage') },
  { id: 'coffee-table', name: tr('Table basse', 'Coffee table'), category: 'living', model: 'coffee-table', mount: 'floor', surface: 0.22 },
  { id: 'side-table', name: tr('Guéridon', 'Side table'), category: 'living', model: 'side-table', mount: 'floor', surface: 0.3125 },
  { id: 'table', name: 'Table', category: 'living', model: 'table', mount: 'floor', surface: 0.4 },
  { id: 'table-large', name: tr('Grande table', 'Large table'), category: 'living', model: 'table-large', mount: 'floor', surface: 0.4 },
  { id: 'chair', name: tr('Chaise', 'Chair'), category: 'living', model: 'chair-cushion', mount: 'floor' },
  { id: 'office-chair', name: tr('Fauteuil de bureau', 'Office chair'), category: 'living', model: 'chair-armrest-headrest', mount: 'floor' },
  {
    id: 'desk', name: tr('Bureau', 'Desk'), category: 'living', model: 'desk', mount: 'floor', surface: 0.4,
    interact: tr(
      'Bureau : une maquette de Cobra Mk III, une tasse de Hutton Orbital et 212 messages non lus.',
      'Desk: a Cobra Mk III model, a Hutton Orbital mug and 212 unread messages.',
    ),
  },
  {
    id: 'fireplace', name: tr('Cheminée holographique', 'Holographic fireplace'), category: 'living', model: 'fireplace', mount: 'floor', surface: 0.4,
    action: tr('Se réchauffer', 'Warm up'),
    interact: tr('Cheminée holographique : 100 % réconfort, 0 % combustion. Comète adore.', 'Holographic fireplace: 100% cosy, 0% combustion. Comète adores it.'),
    light: { color: '#ff9a4a', intensity: 2.2, at: [0, 1.4, 0.95], flicker: 'fire', priority: 1 },
  },
  {
    id: 'aquarium', name: 'Aquarium', category: 'living', model: 'aquarium', mount: 'floor', surface: 0.78, action: tr('Observer', 'Watch'),
    interact: [
      tr('Aquarium : six poissons de la Terre, une plante de Colonia.', 'Aquarium: six fish from Earth, one plant from Colonia.'),
      tr('Le poisson orange vous fixe. Il juge vos choix de carrière.', 'The goldfish stares at you. It is judging your career choices.'),
    ],
  },

  // --- Rangements
  {
    id: 'bookshelf', name: tr('Bibliothèque', 'Bookcase'), category: 'storage', model: 'bookshelf', mount: 'floor', surface: 0.95,
    interact: [
      tr(
        'Bibliothèque : « Elite : The Dark Wheel », un guide des Ingénieurs, et un livre de cuisine thargoïde (vide).',
        'Bookcase: “Elite: The Dark Wheel”, a guide to the Engineers, and a Thargoid cookbook (blank).',
      ),
      tr(
        'Un album photo : vous devant Sagittarius A*, en combinaison, pouce levé.',
        'A photo album: you in front of Sagittarius A*, in your flight suit, thumbs up.',
      ),
    ],
  },
  {
    id: 'locker', name: tr('Casiers', 'Lockers'), category: 'storage', model: 'locker', mount: 'floor', surface: 0.9,
    interact: tr(
      'Casiers : chaussettes de rechange, barres protéinées, une photo de famille prise à Achenar.',
      'Lockers: spare socks, protein bars, a family photo taken at Achenar.',
    ),
  },
  {
    id: 'crate', name: tr('Caisse de fret', 'Freight crate'), category: 'storage', model: 'crate', mount: 'floor', surface: 0.4,
    interact: tr('Caisse de fret : « Fragile — Brandy de Lave ». Elle est étrangement légère.', 'Freight crate: “Fragile — Lavian Brandy”. It is strangely light.'),
  },
  { id: 'wall-shelf', name: tr('Étagère murale', 'Wall shelf'), category: 'storage', model: 'wall-shelf', mount: 'wall', surface: 0.5125 },

  // --- Lumières
  {
    id: 'floor-lamp', name: tr('Lampadaire', 'Floor lamp'), category: 'light', model: 'floor-lamp', mount: 'floor',
    light: { color: '#ffd9a8', intensity: 1.1, at: [0, 1.05, 0], priority: 3 },
  },
  {
    id: 'arc-lamp', name: tr('Lampadaire arc', 'Arc lamp'), category: 'light', model: 'arc-lamp', mount: 'floor',
    light: { color: '#ffd9a8', intensity: 1.0, at: [0, 0.8, 0.3], priority: 3 },
    interact: [
      tr(
        'Lampadaire arc : quarante kilos de marbre dans le socle, la cargaison la moins rentable de la galaxie.',
        'Arc lamp: forty kilos of marble in the base, the least profitable cargo in the galaxy.',
      ),
      tr(
        'Il se penche sur le fauteuil comme un contrôleur de trafic sur une approche ratée.',
        'It leans over the armchair like a traffic controller over a botched approach.',
      ),
    ],
  },
  {
    id: 'paper-lantern', name: tr('Lampe en papier', 'Paper lantern'), category: 'light', model: 'paper-lantern', mount: 'floor',
    variants: [{ id: 'round', label: tr('Trois boules', 'Three globes'), swatch: '#ffe6bd' }, { id: 'tall', label: tr('Colonne', 'Column'), swatch: '#ffd494' }],
    light: { color: '#ffcf8f', intensity: 0.8, at: [0, 0.45, 0], priority: 3 },
    interact: [
      tr(
        'Papier de riz cultivé en hydroponie à Achenar. Tenir à l\'écart des propulseurs.',
        'Rice paper, grown hydroponically at Achenar. Keep away from thrusters.',
      ),
      tr('Le papier frémit à chaque saut ; la lanterne, elle, reste zen.', 'The paper quivers at every jump; the lantern itself stays zen.'),
    ],
  },
  {
    id: 'pendant-lamp', name: tr('Suspension', 'Pendant lamp'), category: 'light', model: 'pendant-lamp', mount: 'floor', solid: false,
    variants: [
      { id: 'dome', label: tr('Dôme de métal', 'Metal dome'), swatch: '#30343c' },
      { id: 'globe', label: tr('Globe de verre', 'Glass globe'), swatch: '#fff3dc' },
      { id: 'rattan', label: tr('Rotin', 'Rattan'), swatch: '#a8743c' },
    ],
    light: (v) => ({ color: v === 'rattan' ? '#ffb870' : '#ffd2a0', intensity: 0.9, at: [0, 0.68, 0], priority: 3 }),
    interact: (v) =>
      v === 'rattan'
        ? tr(
          'Suspension de rotin : tressée main sur une planète agricole. Le rotin n\'avait jamais vu l\'espace.',
          'Rattan pendant lamp: hand-woven on an agricultural world. The rattan had never seen space before.',
        )
        : tr(
          'Suspension : elle se balance à chaque saut hyperspatial, et un peu plus à chaque atterrissage raté.',
          'Pendant lamp: it sways with every hyperspace jump, and a little more with every botched landing.',
        ),
  },
  {
    id: 'sconce', name: tr('Applique', 'Wall light'), category: 'light', model: 'sconce', mount: 'wall',
    light: { color: '#ffd9a8', intensity: 0.8, at: [0, 0.8, 0.3], priority: 4 },
  },
  {
    id: 'string-lights', name: tr('Guirlande lumineuse', 'Fairy lights'), category: 'light', model: 'string-lights', mount: 'wall',
    variants: [
      { id: 'warm', label: tr('Blanc chaud', 'Warm white'), swatch: '#ffe3b0' },
      { id: 'multi', label: tr('Multicolore', 'Multicolour'), swatch: 'conic-gradient(#ff6a5a, #ffd23c, #6aff8a, #6ab8ff, #ff6ad5, #ff6a5a)' },
      { id: 'blue', label: tr('Bleu glacier', 'Glacier blue'), swatch: '#9fdcff' },
    ],
    light: (v) => ({ color: v === 'blue' ? '#9fd4ff' : '#ffc98a', intensity: 0.5, at: [0, 0.72, 0.25], priority: 5 }),
    interact: [
      tr(
        'Guirlande lumineuse : seize ampoules, et toujours une qui clignote à contretemps. Comme le pilote automatique.',
        'Fairy lights: sixteen bulbs, and there is always one blinking out of time. Just like the autopilot.',
      ),
      tr(
        'Accrochée pour les fêtes de 3309. Personne n\'a eu le cœur de la décrocher.',
        'Put up for the festive season of 3309. Nobody has had the heart to take them down.',
      ),
    ],
  },
  {
    id: 'led-strip', name: tr('Bandeau LED', 'LED strip'), category: 'light', model: 'led-strip', mount: 'wall', variants: LED_STRIPS,
    light: (v) => ({ color: (LED_STRIPS.find((l) => l.id === v) ?? LED_STRIPS[0]).light, intensity: 0.6, at: [0, 0.7, 0.2], priority: 5 }),
    interact: [
      tr(
        'Bandeau LED : ambiance salon de tuning de Deciat. Felicity Farseer n\'approuve pas.',
        'LED strip: all the charm of a Deciat modding garage. Felicity Farseer does not approve.',
      ),
      tr(
        'Seize millions de couleurs, et l\'équipage vote toujours pour l\'orange des interfaces.',
        'Sixteen million colours, and the crew always votes for HUD orange.',
      ),
    ],
  },
  {
    id: 'desk-lamp', name: tr('Lampe de bureau', 'Desk lamp'), category: 'light', model: 'desk-lamp', mount: 'top',
    variants: [
      { id: 'black', label: tr('Noire', 'Black'), swatch: '#23262d' },
      { id: 'white', label: tr('Blanche', 'White'), swatch: '#e9ecef' },
      { id: 'orange', label: tr('Orange Elite', 'Elite orange'), swatch: '#ff8a1c' },
      { id: 'teal', label: tr('Bleu canard', 'Teal'), swatch: '#2f9a96' },
    ],
    light: { color: '#ffe2b0', intensity: 0.5, at: [0, 0.12, 0.09], priority: 5 },
    interact: [
      tr(
        'Lampe de bureau : idéale pour lire les petites lignes d\'un contrat de la Pilots Federation.',
        'Desk lamp: ideal for reading the small print on a Pilots Federation contract.',
      ),
      tr('Elle éclaire le journal de bord. Et les 212 messages non lus.', 'It lights up the logbook. And the 212 unread messages.'),
    ],
  },
  {
    id: 'lava-lamp', name: tr('Lampe à lave', 'Lava lamp'), category: 'light', model: 'lava-lamp', mount: 'top',
    variants: [
      { id: 'orange', label: 'Orange', swatch: '#ff5a1c' },
      { id: 'violet', label: tr('Violette', 'Violet'), swatch: '#ff3bb0' },
      { id: 'green', label: tr('Verte', 'Green'), swatch: '#29d97a' },
    ],
    interact: tr('Lampe à lave : les bulles montent, redescendent… Hypnotique.', 'Lava lamp: the blobs rise, sink back down… Hypnotic.'),
    light: { color: '#ff9a5a', intensity: 0.5, at: [0, 0.4, 0], priority: 5 },
  },
  {
    id: 'candles', name: tr('Bougies', 'Candles'), category: 'light', model: 'candles', mount: 'top',
    interact: tr(
      'Bougies : de vraies flammes, rarissimes à bord. Le détecteur d\'incendie fait semblant de dormir.',
      'Candles: real flames, a rare sight on board. The smoke detector is pretending to be asleep.',
    ),
    light: { color: '#ffb35c', intensity: 0.5, at: [0, 0.35, 0], flicker: 'fire', priority: 5 },
  },
  {
    id: 'plasma-ball', name: tr('Boule plasma', 'Plasma ball'), category: 'light', model: 'plasma-ball', mount: 'top', action: tr('Toucher', 'Touch'),
    light: { color: '#c77dff', intensity: 0.5, at: [0, 0.2, 0], priority: 5 },
    interact: [
      tr(
        'Vous posez un doigt sur le verre : les éclairs viennent vous saluer. Comète crache, puis revient regarder.',
        'You put a finger on the glass: the lightning comes over to say hello. Comète hisses, then comes back to watch.',
      ),
      tr(
        'Un orage en bocal : la météo la plus stable du vaisseau. Ne pas la montrer aux Gardiens.',
        'A storm in a jar: the most stable weather on the ship. Do not show it to the Guardians.',
      ),
    ],
  },

  // --- Plantes
  { id: 'plant', name: tr('Plante', 'Plant'), category: 'plants', model: 'plant', mount: 'floor' },
  { id: 'plant-tall', name: tr('Palmier', 'Palm tree'), category: 'plants', model: 'plant-tall', mount: 'floor' },
  { id: 'monstera', name: 'Monstera', category: 'plants', model: 'monstera', mount: 'floor' },
  {
    id: 'exobio-plant', name: tr('Spécimen exobiologique', 'Exobiology specimen'), category: 'plants', model: 'exobio-plant', mount: 'floor',
    variants: [
      { id: 'anemone', label: tr('Anémone', 'Anemone'), swatch: '#ff6ad5' },
      { id: 'brain', label: tr('Arbre-cerveau', 'Brain tree'), swatch: '#5ff2ff' },
      { id: 'crystal', label: tr('Cristallin', 'Crystalline'), swatch: '#b8ff5a' },
    ],
    interact: tr(
      'Spécimen d\'exobiologie : il pulse doucement. Vista Genomics en offrirait une fortune.',
      'Exobiology specimen: it pulses gently. Vista Genomics would pay a fortune for it.',
    ),
  },
  { id: 'succulent', name: tr('Plante grasse', 'Succulent'), category: 'plants', model: 'succulent', mount: 'top' },
  {
    id: 'cactus', name: 'Cactus', category: 'plants', model: 'cactus', mount: 'top',
    interact: tr('Cactus : arrosage une fois par saut hyperspatial. Environ.', 'Cactus: water once per hyperspace jump. Roughly.'),
  },
  { id: 'bonsai', name: tr('Bonsaï', 'Bonsai'), category: 'plants', model: 'bonsai', mount: 'top' },
  {
    id: 'flowers', name: 'Bouquet', category: 'plants', model: 'flowers', mount: 'top',
    variants: [
      { id: 'rose', label: 'Roses', swatch: '#ff6aa0' },
      { id: 'yellow', label: tr('Jaunes', 'Yellow'), swatch: '#ffd23c' },
      { id: 'blue', label: tr('Bleues', 'Blue'), swatch: '#6ab0ff' },
      { id: 'white', label: tr('Blanches', 'White'), swatch: '#f4f0ea' },
    ],
  },
  {
    id: 'hydro-rack', name: tr('Bac hydroponique', 'Hydroponics tray'), category: 'plants', model: 'hydro-rack', mount: 'floor',
    interact: [
      tr('Hydroponie : tomates, basilic et un piment de Lave.', 'Hydroponics: tomatoes, basil and a Lave chilli.'),
      tr('Les plantes poussent sous des LED roses. Elles ont l\'air heureuses.', 'The plants grow under pink LEDs. They look happy.'),
    ],
  },

  // Site artwork is unlocked by actual possessions / completed adventures, at no CR cost.
  { id: 'site-card', name: tr('Carte de collection encadrée', 'Framed collectible card'), category: 'wall', model: 'site-art', mount: 'wall', variants: [] },
  { id: 'site-badge', name: tr('Badge encadré', 'Framed badge'), category: 'wall', model: 'site-art', mount: 'wall', variants: [] },
  { id: 'adventure-poster', name: tr('Poster d’aventure', 'Adventure poster'), category: 'wall', model: 'site-art', mount: 'wall', variants: [], thumbnailVariant: 'adv:d4735e3a265e16ee' /* La Disparition de Jacob Scarlett (aventure 2) */ },

  // --- Murs
  {
    id: 'poster', name: tr('Affiche de voyage', 'Travel poster'), category: 'posters', model: 'poster', mount: 'wall',
    variants: Object.entries(POSTERS).map(([id, p]) => ({ id, label: p.label })),
    interact: (v) => POSTER_TEXTS[v ?? ''] ?? POSTER_TEXTS.colonia,
  },
  {
    id: 'frame', name: tr('Tableau', 'Painting'), category: 'wall', model: 'frame', mount: 'wall',
    variants: Object.entries(FRAMES).map(([id, f]) => ({ id, label: f.label })),
  },
  {
    // Un poisson de sa collection (cf. src/fishing/), sur le fond de son choix.
    id: 'fish-frame', name: tr('Trophée de pêche', 'Fishing trophy'), category: 'wall', model: 'fish-frame', mount: 'wall',
    variants: FISH.map((f) => ({ id: f.id, label: fishName(f) })),
    tints: [
      { id: 'white', label: tr('Fond blanc', 'White background'), swatch: '#f4f1e8' },
      { id: 'water', label: tr('Fond d\'eau', 'Water background'), swatch: '#3f9ac0' },
      { id: 'sand', label: tr('Fond de sable', 'Sand background'), swatch: '#e2c98f' },
      { id: 'night', label: tr('Fond de nuit étoilée', 'Starry night background'), swatch: '#1a1440' },
      { id: 'wood', label: tr('Fond de bois', 'Wood background'), swatch: '#b98a58' },
    ],
    owned: (id) => fishCollection.has(id),
    locked: tr('Pêchez d\'abord un poisson à l\'étang du jardin exotique (pont supérieur) : ce trophée montre vos prises.', 'Catch a fish at the exotic garden pond first (upper deck): this trophy shows your catches.'),
    interact: (v) => {
      const fish = fishById((v ?? '').split(':')[0])
      return fish ? `${fishName(fish)} (${RARITY_NAME[fish.rarity]}). ${fishAbout(fish)}` : ''
    },
  },
  {
    id: 'wall-clock', name: tr('Horloge', 'Wall clock'), category: 'wall', model: 'wall-clock', mount: 'wall', action: tr('Lire l\'heure', 'Check the time'),
    interact: () => {
      const now = new Date()
      const h = now.getHours(), m = String(now.getMinutes()).padStart(2, '0')
      return tr(`Il est ${h} h ${m} à votre montre. À bord, c'est toujours l'heure du café.`, `It's ${h}:${m} by your watch. On board, it's always teatime.`)
    },
  },
  {
    id: 'wall-screen', name: tr('Écran GalNet', 'GalNet screen'), category: 'wall', model: 'wall-screen', mount: 'wall', action: tr('Regarder', 'Watch'),
    interact: GALNET,
  },
  {
    id: 'wall-neon', name: tr('Néon', 'Neon sign'), category: 'wall', model: 'wall-neon', mount: 'wall',
    variants: Object.entries(NEONS).map(([id, label]) => ({ id, label })), tints: NEON_TINTS,
    label: (v) => {
      const [text, tint] = (v ?? '').split(':')
      return `${NEONS[text] ?? NEONS.o7}|${tint ?? 'pink'}`
    },
    light: (v) => ({ color: (NEON_COLORS[(v ?? '').split(':')[1]] ?? NEON_COLORS.pink).tube, intensity: 0.45, at: [0, 0.74, 0.3], flicker: 'neon', priority: 5 }),
  },
  {
    id: 'neon-shape', name: tr('Néon en forme', 'Shaped neon'), category: 'wall', model: 'neon-shape', mount: 'wall', variants: NEON_SHAPES,
    light: (v) => ({ color: (NEON_SHAPES.find((n) => n.id === v) ?? NEON_SHAPES[0]).swatch!, intensity: 0.5, at: [0, 0.6, 0.3], flicker: 'neon', priority: 5 }),
    interact: (v) => (NEON_SHAPES.find((n) => n.id === v) ?? NEON_SHAPES[0]).text,
  },

  // --- Objets
  {
    id: 'mug', name: tr('Tasse de Hutton Orbital', 'Hutton Orbital mug'), category: 'objects', model: 'mug', mount: 'top',
    interact: tr(
      'Tasse de Hutton Orbital : « J\'ai fait le trajet jusqu\'à Hutton Orbital, et je n\'ai eu que cette tasse. »',
      'Hutton Orbital mug: “I flew all the way to Hutton Orbital and all I got was this lousy mug.”',
    ),
  },
  {
    id: 'globe', name: 'Globe', category: 'objects', model: 'globe', mount: 'top',
    variants: Object.entries(GLOBES).map(([id, g]) => ({ id, label: g.label })),
    interact: (v) => GLOBE_TEXTS[v ?? ''] ?? GLOBE_TEXTS.earth,
  },
  {
    id: 'books', name: tr('Pile de livres', 'Stack of books'), category: 'objects', model: 'books', mount: 'top',
    interact: tr(
      'Pile de livres : « Guide des Ingénieurs », tome 3. Le tome 2 est introuvable.',
      'Stack of books: “A Guide to the Engineers”, volume 3. Volume 2 is nowhere to be found.',
    ),
  },
  {
    id: 'plush', name: tr('Peluche de Comète', 'Comète plush'), category: 'objects', model: 'plush', mount: 'top',
    interact: tr('Peluche de Comète : plus sage que l\'original.', 'Comète plush: better behaved than the original.'),
  },
  {
    id: 'trophy', name: tr('Trophée Elite', 'Elite trophy'), category: 'objects', model: 'trophy', mount: 'top',
    interact: tr('Trophée du rang Elite : « Au CMDR, pour services rendus à la galaxie ».', 'Elite rank trophy: “To the CMDR, for services to the galaxy”.'),
  },
  {
    id: 'radio', name: 'Radio', category: 'objects', model: 'radio', mount: 'top',
    interact: tr('Radio de bord : entre deux grésillements, une vieille chanson de la Terre.', 'Ship\'s radio: between bursts of static, an old song from Earth.'),
  },
  {
    id: 'record-player', name: tr('Platine vinyle', 'Record player'), category: 'objects', model: 'record-player', mount: 'top',
    interact: tr(
      'Platine vinyle : de la musique d\'avant les sauts. Ça craque, c\'est charmant.',
      'Record player: music from before the jump drive. It crackles; that\'s the charm.',
    ),
  },
  {
    id: 'photo-frame', name: 'Photo', category: 'objects', model: 'photo-frame', mount: 'top',
    interact: tr('Photo : vous devant une planète, en combinaison, pouce levé.', 'Photo: you in front of a planet, in your flight suit, thumbs up.'),
  },
  {
    id: 'ship-model', name: tr('Maquette de Cobra', 'Cobra model'), category: 'objects', model: 'ship-model', mount: 'top',
    variants: [
      { id: 'silver', label: tr('Argent', 'Silver'), swatch: '#c9cdd4' },
      { id: 'orange', label: 'Orange', swatch: '#e0701e' },
      { id: 'black', label: tr('Noire', 'Black'), swatch: '#3a3e46' },
      { id: 'white', label: tr('Blanche', 'White'), swatch: '#f4f6f8' },
    ],
    interact: tr(
      'Maquette de Cobra Mk III : le vaisseau de vos débuts. On ne l\'oublie jamais.',
      'Cobra Mk III model: the ship you started out in. You never forget your first.',
    ),
  },
  {
    id: 'telescope', name: tr('Lunette astronomique', 'Telescope'), category: 'objects', model: 'telescope', mount: 'floor',
    interact: tr('Lunette astronomique : on voit Sol d\'ici. Enfin, on croit.', 'Telescope: you can see Sol from here. Or so you think.'),
  },
  {
    id: 'guitar', name: tr('Guitare', 'Guitar'), category: 'objects', model: 'guitar', mount: 'floor', action: tr('Jouer', 'Play'),
    interact: [
      tr('Vous grattez quelques accords. Comète quitte la pièce.', 'You strum a few chords. Comète leaves the room.'),
      tr('Vous jouez « Le Beau Danube bleu » à la guitare. Presque.', 'You play “The Blue Danube” on the guitar. Nearly.'),
    ],
  },
  {
    id: 'display-case', name: tr('Vitrine', 'Display case'), category: 'objects', model: 'display-case', mount: 'floor', action: tr('Admirer', 'Admire'),
    variants: [
      { id: 'silver', label: tr('Argent', 'Silver'), swatch: '#c9cdd4' },
      { id: 'orange', label: 'Orange', swatch: '#e0701e' },
      { id: 'black', label: tr('Noire', 'Black'), swatch: '#3a3e46' },
      { id: 'white', label: tr('Blanche', 'White'), swatch: '#f4f6f8' },
    ],
    interact: tr('Vitrine : une Cobra Mk III au 1/500, la fierté du CMDR.', 'Display case: a 1:500 Cobra Mk III, the CMDR\'s pride and joy.'),
  },

  // --- Elite
  {
    id: 'thargoid-sensor', name: tr('Capteur thargoïde', 'Thargoid sensor'), category: 'elite', model: 'thargoid-sensor', mount: 'top',
    interact: tr(
      'Capteur thargoïde : il palpite. Ne pas le secouer, et surtout ne pas le montrer à la douane.',
      'Thargoid sensor: it throbs. Do not shake it, and whatever you do, do not show it to customs.',
    ),
  },
  {
    id: 'guardian-relic', name: tr('Relique des Gardiens', 'Guardian relic'), category: 'elite', model: 'guardian-relic', mount: 'top',
    interact: tr('Relique des Gardiens : elle vibre doucement quand on s\'en approche.', 'Guardian relic: it hums softly when you come near.'),
  },
  {
    id: 'terrarium', name: 'Terrarium', category: 'elite', model: 'terrarium', mount: 'top',
    interact: tr(
      'Terrarium : un organisme de Colonia qui luit la nuit. Il s\'appelle Gérard.',
      'Terrarium: an organism from Colonia that glows at night. It is called Gerald.',
    ),
  },
  {
    id: 'holo-panel', name: tr('Panneau holographique', 'Holographic panel'), category: 'elite', model: 'holo-panel', mount: 'floor', solid: false,
    variants: Object.entries(HOLO_PANELS).map(([id, p]) => ({ id, label: p.label })),
    label: (v) => HOLO_PANELS[v ?? '']?.text ?? HOLO_PANELS.exploration.text,
  },
  {
    id: 'orrery', name: tr('Carte du système', 'System map'), category: 'elite', model: 'orrery', mount: 'floor',
    interact: tr(
      'Carte du système : une étoile de classe G, quatre planètes, dont une géante gazeuse à anneaux.',
      'System map: a class G star and four planets, one of them a ringed gas giant.',
    ),
  },
  {
    id: 'galaxy-map', name: tr('Carte galactique', 'Galaxy map'), category: 'elite', model: 'galaxy-map', mount: 'floor',
    interact: tr(
      'Carte galactique : 400 milliards d\'étoiles. Colonia à 22 000 al, Beagle Point à 65 279 al.',
      'Galaxy map: 400 billion stars. Colonia is 22,000 ly away, Beagle Point 65,279 ly.',
    ),
  },
  { id: 'radar', name: 'Scanner', category: 'elite', model: 'radar', mount: 'floor', solid: false },
  {
    id: 'sample-tank', name: tr('Cuve d\'exobiologie', 'Exobiology tank'), category: 'elite', model: 'sample-tank', mount: 'floor',
    interact: tr(
      'Cuve d\'exobiologie : Bacterium Aurasus. Il bouge quand on ne le regarde pas.',
      'Exobiology tank: Bacterium Aurasus. It moves when nobody is looking.',
    ),
  },
  {
    id: 'pilot-seat', name: tr('Siège de pilote', 'Pilot seat'), category: 'elite', model: 'pilot-seat', mount: 'floor',
    interact: tr(
      'Siège de pilote d\'occasion, recyclé en fauteuil. Quelqu\'un a gravé « o7 » sur l\'accoudoir.',
      'Second-hand pilot seat, recycled as an armchair. Someone has carved “o7” into the armrest.',
    ),
  },
  { id: 'cargo', name: tr('Conteneurs de cargaison', 'Cargo canisters'), category: 'elite', model: 'cargo', mount: 'floor' },

  // --- Arcade
  {
    id: 'arcade', name: tr('Borne d\'arcade', 'Arcade cabinet'), category: 'arcade', model: 'arcade', mount: 'floor', action: tr('Jouer', 'Play'),
    variants: ARCADE_GAMES, surface: 0.95,
    interact: (v) => ARCADE_TEXTS[v ?? 'elite'] ?? ARCADE_TEXTS.elite,
  },
  {
    id: 'arcade-table', name: tr('Borne cocktail', 'Cocktail cabinet'), category: 'arcade', model: 'arcade-table', mount: 'floor', action: tr('Jouer', 'Play'),
    variants: ARCADE_GAMES, surface: 0.38,
    interact: [
      tr(
        'Borne cocktail : partie à deux, face à face. Votre adversaire a posé sa tasse de Hutton Orbital sur l\'écran.',
        'Cocktail cabinet: two players, face to face. Your opponent has put their Hutton Orbital mug down on the screen.',
      ),
      tr(
        'Vous perdez contre un CMDR qui joue à l\'envers. Il prétend que c\'est l\'écran qui l\'est.',
        'You lose to a CMDR playing upside down. He claims it is the screen that is upside down.',
      ),
    ],
  },
  {
    id: 'pinball', name: tr('Flipper', 'Pinball machine'), category: 'arcade', model: 'pinball', mount: 'floor', action: tr('Jouer', 'Play'),
    variants: [{ id: 'thargoid', label: 'Thargoid Attack' }, { id: 'guardians', label: tr('Gardiens', 'Guardians') }, { id: 'lave', label: 'Lave Station' }],
    interact: (v) => PINBALL_TEXTS[v ?? 'thargoid'] ?? PINBALL_TEXTS.thargoid,
  },
  {
    id: 'arcade-racer', name: tr('Borne de course', 'Racing cabinet'), category: 'arcade', model: 'arcade-racer', mount: 'floor', action: tr('Piloter', 'Race'),
    variants: [
      { id: 'red', label: tr('Rouge', 'Red'), swatch: '#c62a22' },
      { id: 'blue', label: tr('Bleu', 'Blue'), swatch: '#2358c4' },
      { id: 'yellow', label: tr('Jaune', 'Yellow'), swatch: '#e8b420' },
    ],
    interact: [
      tr(
        'CANYON RUN : 412 km/h au ras de la roche. La tour de contrôle vous rappelle que la limite est à 100.',
        'CANYON RUN: 412 km/h, skimming the rock. The control tower reminds you the limit is 100.',
      ),
      tr(
        'Dernier portique passé à deux mètres du sol. Record battu ; l\'odeur de brûlé, c\'est d\'origine.',
        'Last gate cleared two metres off the ground. Record broken; the burning smell comes as standard.',
      ),
    ],
  },
  {
    id: 'claw-machine', name: tr('Pince à peluches', 'Claw machine'), category: 'arcade', model: 'claw-machine', mount: 'floor',
    action: tr('Tenter sa chance', 'Try your luck'),
    variants: [
      { id: 'pink', label: tr('Rose', 'Pink'), swatch: '#ff6fae' },
      { id: 'cyan', label: 'Cyan', swatch: '#35c6d9' },
      { id: 'yellow', label: tr('Jaune', 'Yellow'), swatch: '#ffc93c' },
    ],
    interact: [
      tr(
        'PINCE À COMÈTE : la pince attrape une Comète… et la lâche en remontant. Comme d\'habitude.',
        'COMÈTE CLAW: the claw grabs a Comète… and drops it on the way up. As usual.',
      ),
      tr(
        '1 CR la partie. Taux de réussite affiché : « compétitif ». La vraie Comète vous observe, l\'air narquois.',
        '1 CR a go. Advertised success rate: “competitive”. The real Comète watches you, looking smug.',
      ),
    ],
  },

  // --- Sport
  {
    id: 'punching-bag', name: tr('Sac de frappe', 'Punchbag'), category: 'leisure', model: 'punching-bag', mount: 'floor', action: tr('Frapper', 'Punch'),
    interact: [
      tr('Paf ! Le sac encaisse sans broncher.', 'Thwack! The bag takes it without flinching.'),
      tr('Bim ! Quelqu\'un a dessiné un Thargoïde dessus.', 'Pow! Someone has drawn a Thargoid on it.'),
    ],
  },
  {
    id: 'exercise-bike', name: tr('Vélo d\'appartement', 'Exercise bike'), category: 'leisure', model: 'exercise-bike', mount: 'floor',
    action: tr('Pédaler', 'Pedal'),
    interact: tr('Vélo d\'appartement : il recharge les batteries de secours. Pédalez, CMDR !', 'Exercise bike: it charges the backup batteries. Pedal, CMDR!'),
  },
  {
    id: 'treadmill', name: tr('Tapis de course', 'Treadmill'), category: 'leisure', model: 'treadmill', mount: 'floor', action: tr('Courir', 'Run'),
    interact: tr('Tapis de course : programme « Fuite devant un Thargoïde », niveau 7.', 'Treadmill: “Fleeing a Thargoid” programme, level 7.'),
  },
  { id: 'weight-bench', name: tr('Banc de musculation', 'Weight bench'), category: 'leisure', model: 'weight-bench', mount: 'floor' },
  { id: 'dumbbell-rack', name: tr('Haltères', 'Dumbbells'), category: 'leisure', model: 'dumbbell-rack', mount: 'floor' },

  // --- Soirée
  {
    id: 'dance-floor', name: tr('Piste de danse', 'Dance floor'), category: 'party', model: 'dance-floor', mount: 'flat', variants: DANCE,
    label: (v) => `${v ?? 'disco'}:1.5x1.5`, action: tr('Danser', 'Dance'), emote: 'danse', interact: DANCE_TEXTS, light: danceLight,
  },
  {
    id: 'dance-floor-large', name: tr('Grande piste de danse', 'Large dance floor'), category: 'party', model: 'dance-floor', mount: 'flat', variants: DANCE,
    label: (v) => `${v ?? 'disco'}:2x2`, action: tr('Danser', 'Dance'), emote: 'danse', interact: DANCE_TEXTS, light: danceLight,
  },
  {
    id: 'disco-ball', name: tr('Boule à facettes', 'Mirror ball'), category: 'party', model: 'disco-ball', mount: 'floor', solid: false,
    action: tr('Admirer', 'Admire'),
    interact: [
      tr(
        'Boule à facettes : quatre cent trente-deux petits miroirs, et autant de reflets de vous.',
        'Mirror ball: four hundred and thirty-two little mirrors, and as many reflections of you.',
      ),
      tr('Elle tourne. Comète essaie d\'attraper les reflets depuis une heure.', 'It spins. Comète has been trying to catch the reflections for an hour.'),
    ],
  },
  {
    id: 'dj-booth', name: tr('Platines de DJ', 'DJ decks'), category: 'party', model: 'dj-booth', mount: 'floor', action: tr('Mixer', 'Mix'), music: true,
    interact: [
      tr('Vous scratchez « Le Beau Danube bleu ». Le public (Comète) est en délire.', 'You scratch “The Blue Danube”. The crowd (Comète) goes wild.'),
      tr('Aux platines : un remix du bip de l\'ordinateur de bord. Un classique.', 'On the decks: a remix of the ship computer\'s beep. A classic.'),
      tr('Vous montez le son. Quelque part, un voisin de cabine tape au mur.', 'You turn it up. Somewhere, a neighbour bangs on the cabin wall.'),
    ],
  },
  {
    id: 'jukebox', name: 'Jukebox', category: 'party', model: 'jukebox', mount: 'floor', action: tr('Choisir un morceau', 'Pick a track'), music: true,
    interact: [
      tr(
        'Le jukebox joue « Le Beau Danube bleu (Docking Mix) ». Parfait pour un amarrage.',
        'The jukebox plays “The Blue Danube (Docking Mix)”. Perfect for docking.',
      ),
      tr(
        'Morceau choisi : « Sérénade en supercroisière ». Quatorze minutes, comme le trajet jusqu\'à la station.',
        'Track selected: “Supercruise Serenade”. Fourteen minutes, just like the trip to the station.',
      ),
      tr('Le jukebox joue « Fly Me to Hutton Orbital ». Il y en a pour un moment.', 'The jukebox plays “Fly Me to Hutton Orbital”. This could take a while.'),
      tr('Face B : « Thargoid Groove ». La coque vibre étrangement.', 'B-side: “Thargoid Groove”. The hull vibrates strangely.'),
    ],
  },
  {
    id: 'speaker', name: tr('Enceinte', 'Speaker'), category: 'party', model: 'speaker', mount: 'floor',
    variants: [
      { id: 'black', label: tr('Noire', 'Black'), swatch: '#1b1b21' },
      { id: 'wood', label: tr('Bois', 'Wood'), swatch: '#7a4e32' },
      { id: 'white', label: tr('Blanche', 'White'), swatch: '#e8eaee' },
    ],
  },
  {
    id: 'laser', name: tr('Projecteur laser', 'Laser projector'), category: 'party', model: 'laser', mount: 'top',
    variants: [
      { id: 'green', label: tr('Vert', 'Green'), swatch: '#39ff6a' },
      { id: 'red', label: tr('Rouge', 'Red'), swatch: '#ff3b3b' },
      { id: 'blue', label: tr('Bleu', 'Blue'), swatch: '#3b8cff' },
      { id: 'rgb', label: tr('Multicolore', 'Multicolour'), swatch: 'conic-gradient(#ff3b3b, #39ff6a, #3b8cff, #ff3b3b)' },
    ],
    interact: tr('Projecteur laser : classe 2, promis. Ne pas viser les hublots.', 'Laser projector: class 2, honest. Do not aim at the portholes.'),
  },
  {
    id: 'stage-light', name: tr('Lyre', 'Moving head light'), category: 'party', model: 'stage-light', mount: 'floor',
    interact: tr('Lyre motorisée : elle balaie la pièce en rythme. Comète la poursuit.', 'Moving head light: it sweeps the room to the beat. Comète chases it.'),
  },

  // --- Aventures : souvenirs des aventures du site (src/furniture/adventures.ts)
  {
    id: 'scarlett-holo', name: tr('Hologramme de Jacob Scarlett', 'Jacob Scarlett hologram'), category: 'adventures', model: 'scarlett-holo', mount: 'floor',
    action: tr('Se recueillir', 'Pay respects'),
    light: { color: '#6fd8ff', intensity: 0.3, at: [0, 0.5, 0], priority: 4 },
    interact: [
      tr(
        'L\'officier Jacob Scarlett, sécurité de Ross 154. Vu pour la dernière fois à Ross 446. (La Disparition de Jacob Scarlett)',
        'Officer Jacob Scarlett, Ross 154 security. Last seen in Ross 446. (The Disappearance of Jacob Scarlett)',
      ),
      tr('« … Scarlett. Bingo ! … fausse identité … base … Istanu … » Le message est toujours aussi corrompu.', '“… Scarlett. Bingo! … false identity … base … Istanu …” The message is as corrupted as ever.'),
      tr('L\'hologramme grésille. Un café au bar de Birkeland City, et tout a commencé.', 'The hologram flickers. One coffee at the Birkeland City bar, and it all began.'),
    ],
  },
  {
    id: 'treasure-chest', name: tr('Coffre de La Buse', 'La Buse\'s chest'), category: 'adventures', model: 'treasure-chest', mount: 'floor',
    action: tr('Fouiller', 'Rummage'),
    light: { color: '#ffc55a', intensity: 0.3, at: [0, 0.35, 0.05], priority: 3 },
    interact: [
      tr('Le trésor de La Buse : des doublons, des rubis, et pas un seul crédit convertible. (Le Trésor de La Buse)', 'La Buse\'s treasure: doubloons, rubies, and not a single convertible credit. (La Buse\'s Treasure)'),
      tr('« Mes trésors à qui saura comprendre. » Vous comprenez surtout qu\'il faut payer la douane.', '“My treasure to whoever understands.” Mostly, you understand that customs must be paid.'),
    ],
  },
  {
    id: 'escape-pod', name: tr('Capsule de l\'Odysseus', 'Odysseus escape pod'), category: 'adventures', model: 'escape-pod', mount: 'floor',
    interact: [
      tr('Capsule de survie de l\'expédition Odysseus. Vide, heureusement : tout le monde a été sauvé. (Le Sauvetage de l\'Odysseus)', 'Escape pod from the Odysseus expedition. Empty, fortunately: everyone was rescued. (Saving the Odysseus)'),
      tr('La balise de détresse clignote encore. Personne n\'a trouvé comment l\'éteindre.', 'The distress beacon is still blinking. Nobody has worked out how to turn it off.'),
    ],
  },
  {
    id: 'survival-guide', name: tr('Guide de survie', 'Survival guide'), category: 'adventures', model: 'survival-guide', mount: 'top', action: tr('Lire', 'Read'),
    interact: [
      tr('Le Guide de survie, ses onze pages perdues enfin recollées. (Les Pages Perdues du Guide de Survie)', 'The Survival Guide, its eleven lost pages finally glued back in. (The Lost Pages of the Survival Guide)'),
      tr('Page 7 : « Toujours emporter un module de ravitaillement. » Souligné trois fois.', 'Page 7: “Always carry a fuel scoop.” Underlined three times.'),
    ],
  },
  {
    id: 'damocles-model', name: tr('Maquette du FNS Damocles', 'FNS Damocles model'), category: 'adventures', model: 'damocles-model', mount: 'top', action: tr('Admirer', 'Admire'),
    interact: tr(
      'Le FNS Damocles, croiseur de classe Farragut, détourné puis retrouvé. Celui-ci ne quitte pas l\'étagère. (Le Détournement du FNS Damocles)',
      'The FNS Damocles, a Farragut-class battlecruiser, hijacked and then found. This one stays on the shelf. (The FNS Damocles Hijacking)',
    ),
  },
  {
    id: 'duchess-portrait', name: tr('Portrait de la duchesse', 'Portrait of the Duchess'), category: 'adventures', model: 'duchess-portrait', mount: 'wall',
    interact: tr(
      'La duchesse d\'Adenates, peinte à la cour impériale. Elle a toujours l\'air de négocier avec des mercenaires. (Une duchesse d\'Adenates en détresse)',
      'The Duchess of Adenates, painted at the Imperial court. She still looks like she is haggling with mercenaries. (A Distressed Duchess from Adenates)',
    ),
  },
  {
    id: 'christmas-tree', name: tr('Sapin de la Quête de Noël', 'Christmas Quest tree'), category: 'adventures', model: 'christmas-tree', mount: 'floor',
    light: { color: '#ffcf8a', intensity: 0.3, at: [0, 0.6, 0], priority: 3 },
    interact: [
      tr('Les jouets de Sandra Corrs, livrés à temps. Joyeux Noël, CMDR ! (La Quête de Noël)', 'Sandra Corrs\'s toys, delivered on time. Merry Christmas, CMDR! (The Christmas Quest)'),
      tr('Une étiquette sur un paquet : « Pour Comète. Ne pas ouvrir avant le 25. » Il est déjà ouvert.', 'A tag on a present: “For Comète. Do not open before the 25th.” It is already open.'),
    ],
  },
  {
    id: 'path-banner', name: tr('Bannière de la Voie', 'Banner of the Path'), category: 'adventures', model: 'path-banner', mount: 'wall',
    light: { color: '#3dff9a', intensity: 0.2, at: [0, 0.7, 0.2], priority: 2 },
    interact: [
      tr('« Que la lumière te guide, Adepte o7. » (L\'Épreuve, la Cérémonie et les Reliques de la Voie)', '“May the light guide you, Adept o7.” (The Trial, the Ceremony and the Relics of the Path)'),
      tr('Le symbole de Raxxla. La Voie vous attend.', 'The symbol of Raxxla. The Path awaits you.'),
    ],
  },
  {
    id: 'thetis-blackbox', name: tr('Boîte noire du Thetis', 'Thetis black box'), category: 'adventures', model: 'thetis-blackbox', mount: 'top', action: tr('Écouter', 'Listen'),
    interact: [
      tr('L\'enregistreur du Thetis. Au casque, un signal lointain se répète… (L\'Écho du Thetis)', 'The Thetis flight recorder. Through the headset, a distant signal repeats… (The Echo of the Thetis)'),
      tr('Vous avez cru entendre votre nom dans l\'écho. Mieux vaut ne pas y penser.', 'You thought you heard your name in the echo. Best not to dwell on it.'),
    ],
  },
  {
    id: 'taxi-sign', name: tr('Enseigne TAXI Corp.', 'TAXI Corp. sign'), category: 'adventures', model: 'taxi-sign', mount: 'wall',
    light: { color: '#ffd23a', intensity: 0.35, at: [0, 0.8, 0.25], priority: 4 },
    interact: tr('TAXI Corp. : « Épreuve du feu réussie. » Vos passagers en parlent encore. (Taxi Driver)', 'TAXI Corp.: “Trial by fire passed.” Your passengers still talk about it. (Taxi Driver)'),
  },

  // --- Animaux : un panier par compagnon adopté (il vit à côté, cf. src/pets.ts), et de quoi s'en occuper
  // Comète, le chat du bord : offert, et un seul. Le choisir pose son panier (il vit à côté).
  {
    id: 'cat-bed', name: tr('Chat · Comète', 'Cat · Comète'), category: 'pets', model: 'cat-bed', mount: 'floor', solid: false,
    interact: tr('Panier de Comète : plein de poils, et une souris en tissu mâchouillée.', 'Comète\'s basket: full of fur, plus one chewed-up fabric mouse.'),
  },
  ...SPECIES.map((s): CatalogEntry => ({
    id: petItemId(s), name: `${s.label} · ${s.name}`, category: 'pets', model: 'pet-bed', mount: 'floor', solid: false,
    variants: COATS.map(({ id, label, swatch }) => ({ id, label, swatch })),
    label: (v) => `${s.id}|${v ?? COATS[0].id}`,
    interact: tr(`Le panier de ${s.name}. Encore tout chaud.`, `${s.name}'s basket. Still warm.`),
  })),
  {
    id: 'pet-bowl', name: tr('Gamelles', 'Pet bowls'), category: 'pets', model: 'pet-bowl', mount: 'top',
    interact: tr('Croquettes et eau fraîche. Les compagnons viennent y manger de temps en temps.', 'Kibble and fresh water. Your pets drop by for a snack now and then.'),
  },
  { id: 'cat-tree', name: tr('Arbre à chat', 'Cat tree'), category: 'pets', model: 'cat-tree', mount: 'floor', interact: tr('Arbre à chat : trois étages de moquette et une balle qui pend.', 'Cat tree: three floors of carpet and a dangling ball.') },
  { id: 'dog-house', name: tr('Niche', 'Dog house'), category: 'pets', model: 'dog-house', mount: 'floor', interact: tr('Une niche en bois. Ici, elle est climatisée.', 'A wooden dog house. Up here, it has air conditioning.') },
  { id: 'pet-toys', name: tr('Jouets', 'Pet toys'), category: 'pets', model: 'pet-toys', mount: 'top', action: tr('Couiner', 'Squeak'), interact: [tr('Couic !', 'Squeak!'), tr('La balle roule sous le canapé. Évidemment.', 'The ball rolls under the sofa. Of course.')] },
  { id: 'scratching-post', name: tr('Griffoir', 'Scratching post'), category: 'pets', model: 'scratching-post', mount: 'floor', interact: tr('Griffoir : il protège le canapé. En théorie.', 'Scratching post: it protects the sofa. In theory.') },
  {
    id: 'fish-bowl', name: tr('Bocal à poisson', 'Fish bowl'), category: 'pets', model: 'fish-bowl', mount: 'top', action: tr('Nourrir', 'Feed'),
    interact: [tr('Le poisson-clown fait le tour de son bocal. Il s\'appelle Bubulle.', 'The clownfish swims round its bowl. It is called Bubbles.'), tr('Vous saupoudrez un peu de nourriture. Bubulle est ravi.', 'You sprinkle some food. Bubbles is delighted.')],
  },

  // --- Tapis
  { id: 'rug', name: tr('Tapis', 'Rug'), category: 'rugs', model: 'rug', mount: 'flat', variants: RUG_PALETTES, label: (v) => `${v ?? 'warm'}:2x1.4` },
  {
    id: 'rug-small', name: tr('Petit tapis', 'Small rug'), category: 'rugs', model: 'rug', mount: 'flat', variants: RUG_PALETTES,
    label: (v) => `${v ?? 'warm'}:1.3x0.9`,
  },
  {
    id: 'rug-large', name: tr('Grand tapis', 'Large rug'), category: 'rugs', model: 'rug', mount: 'flat', variants: RUG_PALETTES,
    label: (v) => `${v ?? 'warm'}:2.6x1.7`,
  },
  { id: 'rug-round', name: tr('Tapis rond', 'Round rug'), category: 'rugs', model: 'rug-round', mount: 'flat', variants: RUG_PALETTES },

  // --- Le Furniture Kit (salle de bain, cuisine, salon, chambre…), cf. catalog-home.ts
  ...HOME_ENTRIES,
  // --- Le jardinage : tuiles de terre cultivable, cabanon, mobilier de jardin, cf. catalog-garden.ts
  // (avant le mobilier de la serre, rangé dans la même catégorie : la tuile et le cabanon d'abord)
  ...GARDEN_ENTRIES,
  ...OUTDOOR_ENTRIES,
  // --- Le mobilier des pièces du vaisseau (douches, mess, atelier, infirmerie, bar…), cf. catalog-ship.ts
  ...SHIP_ENTRIES,
  // --- Écrans et consoles, armurerie, affiches de films et pin-up, salle de bain, cf. catalog-fun.ts
  ...FUN_ENTRIES,
]

const BY_ID = new Map(CATALOG.map((e) => [e.id, e]))

export function entryOf(id: string): CatalogEntry | undefined {
  return BY_ID.get(id)
}

/** Variante et teinte d'une variante posée (cf. `tints`) ; la teinte d'origine si aucune. */
export function splitVariant(entry: CatalogEntry, variant: string | undefined): [string | undefined, string | undefined] {
  if (!entry.tints?.length || !variant) return [variant, entry.tints?.[0]?.id]
  const [base, tint] = variant.split(':')
  return [base, tint ?? entry.tints[0].id]
}

/** Variante posée pour une variante et une teinte ; la teinte d'origine ne s'écrit pas. */
export function joinVariant(entry: CatalogEntry, base: string, tint: string | undefined): string {
  return !entry.tints?.length || !tint || tint === entry.tints[0].id ? base : `${base}:${tint}`
}

/** Variante connue du catalogue (teinte comprise) ? */
export function knownVariant(entry: CatalogEntry, variant: string | undefined): boolean {
  const [base, tint] = splitVariant(entry, variant)
  return !!entry.variants?.some((v) => v.id === base) && (!entry.tints?.length || entry.tints.some((t) => t.id === tint))
    && variant === joinVariant(entry, base!, tint)
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
