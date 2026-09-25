import type { StationModel, Theme } from './assets'
import type { CabinDef } from './cabin/view'
import type { CustomModel } from './furniture'

/** Orientation en quarts de tour : 0 = face +z (sud), 1 = +x (est), 2 = -z (nord), 3 = -x (ouest). */
export type Rot = 0 | 1 | 2 | 3

export interface Prop {
  /** Modèle du kit Kenney, ou meuble fait main (cf. src/furniture/). */
  model: StationModel | CustomModel
  x: number
  z: number
  rot?: Rot
  /** Décalage vertical (certains modèles du kit s'encastrent dans le sol). */
  y?: number
  /** Bloque le passage (true par défaut). */
  solid?: boolean
  /** Texte affiché quand on interagit avec l'objet (touche E) ; avec une liste, une phrase au hasard à chaque fois. */
  interact?: string | string[]
  /** Verbe de l'invite (« Jouer », « Se doucher »…) ; « Examiner » par défaut. */
  action?: string
  /** Texte libre d'un meuble fait main : titre d'un panneau (« TITRE|ligne|ligne »), jeu d'une borne, couleur d'un tissu… */
  label?: string
}

/** Lumière : x, z, couleur, intensité, et au besoin sa façon de vaciller (néon fatigué, feu de cheminée). */
/**
 * Vacillement d'une lumière : néon fatigué, feu de cheminée ; ou lumière de soirée, qui bat au
 * tempo de la piste de danse (pulse), en changeant de couleur (disco).
 */
export type Flicker = 'neon' | 'fire' | 'disco' | 'pulse'

export type LightDef = [number, number, string, number, ('neon' | 'fire')?]

/** Éclairage d'ambiance d'un pont : ciel et sol (lumière hémisphérique), soleil. */
export interface Ambience {
  sky: string
  ground: string
  hemi: number
  sun: string
  sunIntensity: number
}

export const DEFAULT_AMBIENCE: Ambience = { sky: '#c4ccff', ground: '#2b2446', hemi: 1.4, sun: '#fff1dd', sunIntensity: 2.2 }

export interface LevelDef {
  id: number
  name: string
  /** Voir `ShipMap` : une lettre par pièce, '+' pour une porte. La proue est à l'est (+x). */
  layout: string[]
  rooms: Record<string, string>
  /** Peinture de la coque et du mobilier du kit (cf. assets.ts) ; 'station' par défaut. */
  theme?: Theme
  /** Éclairage d'ambiance ; celui de la station par défaut. */
  ambience?: Ambience
  /** Bruit des pas : 'soft' sur les sols feutrés. */
  footsteps?: 'hard' | 'soft'
  /** Sol utilisé par pièce (défaut : 'floor'). */
  floors?: Record<string, StationModel>
  /** Proportion de murs extérieurs percés d'un hublot, par pièce (défaut : 1/3). */
  windows?: Record<string, number>
  props: Prop[]
  /** 8 lumières au plus (cf. main.ts). */
  lights: LightDef[]
  /** Réacteur et tuyères. */
  engine?: boolean
  /**
   * Cabine personnalisable : ses meubles (Holo-Me compris) ne sont pas dans `props` mais dans
   * l'aménagement de chaque joueur (cf. src/cabin/).
   */
  cabin?: CabinDef
}

/** Écart vertical entre deux ponts. */
export const LEVEL_HEIGHT = 1.6

/** L'ascenseur est au même endroit sur chaque pont. */
export const LIFT = { x: 10, z: 5 }

/**
 * On se réveille dans ses quartiers, à deux pas du Holo-Me (cf. main.ts) ; à défaut, ici
 * (même valeur que dans server/relay.js).
 */
export const SPAWN = { level: 1, x: 11.2, z: 7.4 }
/** Comète vit dans les quartiers, près de son panier (ou ici, s'il n'y en a pas). */
export const CAT_SPAWN = { level: 1, x: 14.9, z: 7.3 }

export const LEVELS: LevelDef[] = [
  // ======================================================== Cale : minage, bricolage, réparation
  {
    id: -1,
    name: 'Cale',
    theme: 'raw',
    ambience: { sky: '#8f97a8', ground: '#22180f', hemi: 0.9, sun: '#ffd2a0', sunIntensity: 1.35 },
    layout: [
      '                     ',
      '            rrrrr    ',
      '    aaaa    rrrrrgg  ',
      '    aaaa    rrrrr+g  ',
      '    aaaa jjj+rr+rgg  ',
      '    aaaa+jjjmmmmmgg  ',
      '    aaaa jjj+mmmm+g  ',
      '    aaaa    mmmmmgg  ',
      '            mmmmm    ',
      '                     ',
    ],
    rooms: { a: 'Atelier', j: 'Palier de la cale', r: 'Baie de réparation', m: 'Raffinerie', g: 'Soute' },
    floors: { a: 'floor-panel', j: 'floor-panel', r: 'floor-panel', m: 'floor-panel', g: 'floor-panel' },
    windows: { a: 0.1, j: 0, r: 0.12, m: 0, g: 0.1 },
    props: [
      // --- Palier : l'ascenseur au centre (cf. LIFT) ---
      { model: 'hazard-floor', x: 10, z: 5, solid: false },
      { model: 'computer', x: 9, z: 4, rot: 1, interact: 'Monte-charge de la cale : 3 t maximum. Les drones collecteurs ne comptent pas comme passagers.' },
      { model: 'drums', x: 9.2, z: 5.95 },

      // --- Atelier ---
      { model: 'workbench', x: 4.75, z: 1.97, interact: ['Établi : un drone collecteur démonté et trois vis de trop. Classique.', 'Quelqu\'un a laissé un mot : « Ne pas toucher, ça marche presque. »'] },
      { model: 'workbench', x: 6.45, z: 1.97 },
      { model: 'tool-rack', x: 3.87, z: 3.6, rot: 1, interact: 'Panneau à outils : il manque la clé de 12. Il manque toujours la clé de 12.' },
      { model: 'welder', x: 4.2, z: 5.4, rot: 1, interact: 'Poste de soudure : ne jamais regarder l\'arc sans masque. Oui, même toi.' },
      { model: 'engineer-bench', x: 5.75, z: 4.35, interact: 'Établi d\'ingénieur : « Apportez-moi du Meta-Alloy et je fais des miracles avec votre FSD. » — F. Farseer' },
      { model: 'scrap-pile', x: 6.8, z: 6.85, interact: 'Ferraille de récupération : 30 % d\'épave de Sidewinder, 70 % de mystère.' },
      { model: 'drums', x: 4.35, z: 6.95 },
      { model: 'steam-vent', x: 5.6, z: 6.2, solid: false },
      { model: 'cables', x: 5.7, z: 5.6, solid: false },
      { model: 'stain', x: 5.1, z: 3.1, solid: false },

      // --- Baie de réparation : le SRV sur son pont élévateur ---
      { model: 'repair-lift', x: 13.6, z: 2.15 },
      { model: 'srv', x: 13.6, z: 2.15, y: 0.13, rot: 1, interact: 'SRV Scarab sur le pont élévateur : suspension réparée, pare-chocs toujours tordu. Et toujours pas de ceinture.' },
      { model: 'robot-arm', x: 15.15, z: 1.25, rot: 3, interact: 'Bras de maintenance : soudure de la coque du SRV en cours. Garder ses distances.' },
      { model: 'afmu', x: 16.05, z: 1.2, interact: 'AFMU : réparation des modules en cours. Rappel : elle ne répare pas la coque.' },
      { model: 'tire-stack', x: 16.1, z: 2.35 },
      { model: 'cables', x: 13.4, z: 3.55, solid: false },
      { model: 'stain', x: 15.6, z: 3.3, solid: false },

      // --- Raffinerie ---
      { model: 'refinery', x: 13.3, z: 5.35, interact: 'Raffinerie : bac 1 platine 42 %, bac 2 painite 18 %, bac 3 diamants basse température 97 %.' },
      { model: 'conveyor', x: 14.5, z: 7.95 },
      { model: 'skip-rocks', x: 16, z: 7.7, interact: 'Benne : 4,2 t de diamants basse température. Meilleur prix signalé : à 180 al d\'ici.' },
      { model: 'ore-pile', x: 12.95, z: 7.75, interact: 'Minerai brut : painite, platine, et quelques opales du vide qui luisent dans le noir.' },
      { model: 'limpets', x: 14.6, z: 6.8 },
      { model: 'stain', x: 14.5, z: 6.4, solid: false },

      // --- Soute ---
      { model: 'cargo', x: 17.93, z: 2.3 },
      { model: 'container', x: 18, z: 3.4 },
      { model: 'cargo', x: 17.93, z: 4.55, interact: 'Soute : 24 t de Brandy de Lave. Si la sécurité vous scanne, vous n\'avez rien vu.' },
      { model: 'mining-laser', x: 18, z: 6.95, rot: 3, interact: 'Laser minier 2B, rangé pour l\'hiver. Ne pas viser les réservoirs d\'hydrogène.' },
    ],
    lights: [
      [5.6, 3.1, '#ffb35c', 3],
      [5.6, 6.3, '#ffa24a', 2.4, 'neon'],
      [10, 5, '#ffd9a0', 1.6],
      [14.3, 2.3, '#fff0d8', 3.2],
      [14.3, 6.9, '#ff7a2a', 3, 'fire'],
      [17.9, 4.6, '#ffb060', 2.2, 'neon'],
    ],
  },

  // ======================================================== Pont principal
  {
    id: 0,
    name: 'Pont principal',
    layout: [
      '  eeeeee   qqqqqrrrrr       ',
      ' eeeeeeee  qqqqqrrrrr       ',
      'eeeeeeeee  qqqqqrrrrr   bb  ',
      'eeeeeeeee  qq+qqrr+rr  bbbb ',
      'eeeeeeee+cccccccccccc+bbbbbb',
      'eeeeeeeeecccccccccccccbbbbbb',
      'eeeeeeeee  mm+mmss+ss  bbbb ',
      'eeeeeeeee  mmmmmsssss   bb  ',
      ' eeeeeeee  mmmmmsssss       ',
      '  eeeeee   mmmmmsssss       ',
    ],
    rooms: {
      e: 'Salle des machines',
      c: 'Coursive',
      q: 'Infirmerie',
      r: 'Salle de sport',
      m: 'Mess',
      s: 'Salon d\'arcade',
      b: 'Poste de pilotage',
    },
    floors: { c: 'floor-panel', b: 'floor-detail' },
    engine: true,
    props: [
      // --- Poste de pilotage : siège et HOTAS, scanner, panneaux holographiques, carte galactique ---
      { model: 'computer-wide', x: 27, z: 4, rot: 3, interact: 'Supercroisière assistée engagée. Destination : Jameson Memorial, Shinrarta Dezhra — 3 sauts.' },
      { model: 'computer-wide', x: 27, z: 5, rot: 3, interact: 'Ordinateur d\'amarrage prêt. Musique d\'approche : « Le Beau Danube bleu ».' },
      { model: 'pilot-seat', x: 25.9, z: 4.5, rot: 1, interact: 'Siège du pilote. Quelqu\'un a gravé « o7 » sur l\'accoudoir.' },
      { model: 'radar', x: 26.55, z: 4.5, rot: 1 },
      { model: 'holo-panel', x: 26.2, z: 3.35, rot: 0, label: 'Navigation|Shinrarta Dezhra|Jameson Memorial|12,4 al · 3 sauts' },
      { model: 'holo-panel', x: 26.2, z: 5.65, rot: 2, label: 'Systèmes|Boucliers 100 %|Coque 100 %|FSD chargé' },
      { model: 'galaxy-map', x: 24, z: 4.5, interact: 'Carte galactique : 400 milliards d\'étoiles. Colonia à 22 000 al, Beagle Point à 65 279 al.' },
      { model: 'computer-screen', x: 24.5, z: 2, rot: 0, interact: 'Comms : Felicity Farseer attend toujours son Meta-Alloy.' },
      { model: 'computer-screen', x: 24.5, z: 7, rot: 2, interact: 'Télémétrie : portée de saut 42,7 al, carburant 32 t. Aucune signature thargoïde.' },

      // --- Salle des machines ---
      { model: 'computer-system', x: 4.5, z: 2, rot: 0, interact: 'Distributeur d\'énergie : 4 pips aux systèmes, 2 aux moteurs, 0 aux armes. Vaisseau pacifiste.' },
      { model: 'computer-system', x: 4.5, z: 7, rot: 2, interact: 'Support vital : oxygène 100 %. Filtres à remplacer dans 42 jours.' },
      { model: 'fsd', x: 2, z: 4.5, rot: 1, interact: 'Réacteur FSD 5A, modifié par Felicity Farseer (portée augmentée). Ne pas toucher pendant la charge.' },
      { model: 'container-tall', x: 0, z: 3, interact: 'Réservoir : 32 t d\'hydrogène. Pour le plein, écoper une étoile K, G, B, F, O, A ou M.' },
      { model: 'container-tall', x: 0, z: 5 },
      { model: 'container-wide', x: 1, z: 1 },
      { model: 'container-wide', x: 1, z: 8 },
      { model: 'pipe-ring-colored', x: 7, z: 1 },
      { model: 'pipe-ring-colored', x: 7, z: 8 },
      { model: 'structure-panel', x: 2, z: 7, y: 0.005, solid: false },
      { model: 'structure-panel', x: 2, z: 2, y: 0.005, solid: false },

      // --- Infirmerie ---
      { model: 'med-bed', x: 11, z: 0.3, interact: ['Lit médical : draps propres, scanner en veille.', 'Le moniteur affiche 72 battements par minute. Les vôtres.'] },
      { model: 'med-bed', x: 15, z: 0.3, label: 'left' },
      { model: 'body-scan', x: 13, z: 0.35, interact: 'Scanner médical : constantes de l\'équipage normales. Le chat est en léger surpoids.' },
      { model: 'med-cabinet', x: 11, z: 2.5, rot: 1, interact: 'Armoire à pharmacie : trousses de soin, cellules d\'énergie et pansements Pioneer Supplies.' },
      { model: 'sample-tank', x: 15, z: 2.55, interact: 'Quarantaine : Bacterium Aurasus. Il bouge quand on ne le regarde pas.' },

      // --- Salle de sport ---
      { model: 'treadmill', x: 16.05, z: 0.7, action: 'Courir', interact: ['Tapis de course : 5 km parcourus. Le vaisseau, lui, en a fait 3 milliards.', 'Programme « Fuite devant un Thargoïde » : niveau 7 atteint.'] },
      { model: 'exercise-bike', x: 17.1, z: 0.55, action: 'Pédaler', interact: 'Vélo d\'appartement : il recharge les batteries de secours. Pédalez, CMDR !' },
      { model: 'weight-bench', x: 19.55, z: 0.55, interact: 'Banc de musculation : 60 kg… sous 0,8 g. Vous êtes plus fort que vous ne le croyez.' },
      { model: 'dumbbell-rack', x: 20.15, z: 2.35, rot: 3 },
      { model: 'punching-bag', x: 16.3, z: 2.4, rot: 1, action: 'Frapper', interact: ['Paf ! Le sac encaisse sans broncher.', 'Bim ! Quelqu\'un a dessiné un Thargoïde dessus.'] },
      { model: 'rug', x: 18.2, z: 1.9, label: 'rubber:1.6x1.1', solid: false },

      // --- Mess ---
      { model: 'table-large', x: 13, z: 8, rot: 0 },
      { model: 'chair-cushion', x: 12.5, z: 7.2, rot: 0 },
      { model: 'chair-cushion', x: 13.5, z: 7.2, rot: 0 },
      { model: 'chair-cushion', x: 12.5, z: 8.8, rot: 2 },
      { model: 'chair-cushion', x: 13.5, z: 8.8, rot: 2 },
      { model: 'computer', x: 11, z: 9, rot: 2, interact: 'Distributeur : plus de Brandy de Lave. Il reste du café lyophilisé et une tasse de Hutton Orbital.' },
      { model: 'table-display-planet', x: 15, z: 7, rot: 3, solid: false },

      // --- Salon d'arcade ---
      {
        model: 'arcade', x: 16.05, z: 7, rot: 1, label: 'elite', action: 'Jouer',
        interact: [
          'ELITE (1984) : vous vous posez à Lave Station du premier coup. Personne ne vous croira.',
          'Un Krait vous prend en chasse. GAME OVER. Record : CMDR Jameson.',
          'Vous survivez à un passage à Riedquat. Légende instantanée.',
        ],
      },
      {
        model: 'arcade', x: 16.05, z: 8, rot: 1, label: 'invaders', action: 'Jouer',
        interact: [
          'THARGOID INVADERS : vague 7. Les Thargoïdes finissent toujours par gagner.',
          'Nouveau record : 12 340 points ! Une hyperdiction vous arrache à la partie.',
          'INSÉREZ UN CRÉDIT (les crédits de la banque galactique ne marchent pas).',
        ],
      },
      {
        model: 'arcade', x: 16.05, z: 9, rot: 1, label: 'asteroids', action: 'Jouer',
        interact: ['ASTÉROÏDES : 8 900 points. Le vrai minage paie mieux.', 'Vous pulvérisez une roche de painite. Aïe, votre portefeuille.'],
      },
      { model: 'neon-sign', x: 17.1, z: 6.1, label: 'ARCADE' },
      { model: 'rug', x: 18.3, z: 8.1, label: 'neon:2x1.8', solid: false },
      { model: 'sofa', x: 20.02, z: 8.1, rot: 3, label: 'purple', interact: 'Canapé du salon : la meilleure place pour regarder les autres perdre.' },
      { model: 'beanbag', x: 18.8, z: 9.05, label: 'teal' },
    ],
    lights: [
      [4.5, 4.5, '#4fd4ff', 6],
      [24.5, 4.5, '#ffa04a', 4],
      [13, 1.5, '#e8f6ff', 3.2],
      [18, 1.5, '#fff4e4', 3],
      [13, 8, '#ffe2b0', 3],
      [18.3, 8.2, '#ff4fd8', 2.6, 'neon'],
      [16.8, 7.2, '#39d0ff', 2],
      [15, 4.5, '#ffffff', 2.5],
    ],
  },

  // ======================================================== Pont supérieur : les quartiers
  {
    id: 1,
    name: 'Pont supérieur',
    theme: 'cozy',
    footsteps: 'soft',
    ambience: { sky: '#ffe6cc', ground: '#3a2a20', hemi: 1.3, sun: '#ffd9b0', sunIntensity: 1.9 },
    layout: [
      '                     ',
      '        kkkkdddd     ',
      '        kkkkdddd oo  ',
      '     gggk+kkdd+doooo ',
      '     ggg+ccccccc+ooo ',
      '     gggccccccccoooo ',
      '     gggppp+ppppoooo ',
      '        pppppppp oo  ',
      '        pppppppp     ',
      '        pppppppp     ',
      '        pppppppp     ',
    ],
    rooms: {
      c: 'Coursive',
      k: 'Cabines d\'équipage',
      d: 'Douches',
      p: 'Quartiers du commandant',
      g: 'Serre hydroponique',
      o: 'Salon panoramique',
    },
    windows: { c: 0, k: 0.3, d: 0.2, p: 0.6, g: 0.5, o: 1 },
    // Les quartiers du commandant : la cabine de chaque joueur, porte au nord sur la coursive.
    cabin: { room: 'p', door: { x: 11, z: 6 } },
    props: [
      // --- Coursive ---
      { model: 'rug', x: 12.9, z: 5, label: 'warm:3.8x0.7', solid: false },
      { model: 'bench', x: 12.3, z: 3.9, label: 'teal' },
      { model: 'plant-tall', x: 15.1, z: 5.2 },

      // --- Cabines d'équipage ---
      { model: 'bunk-bed', x: 8.05, z: 1.24, label: 'navy', interact: 'Couchette. Sous l\'oreiller, un journal : « Jour 214. Toujours en supercroisière vers Hutton Orbital. »' },
      { model: 'bunk-bed', x: 11, z: 1.24, label: 'sage' },
      { model: 'locker', x: 9.55, z: 0.84, interact: 'Casiers de l\'équipage : chaussettes de rechange, barres protéinées, une photo de famille prise à Achenar.' },
      { model: 'rug', x: 9.9, z: 2.35, label: 'blue:1.3x0.8', solid: false },

      // --- Douches ---
      { model: 'shower', x: 12.45, z: 1.07, action: 'Se doucher', interact: ['Douche sonique : 30 secondes, zéro goutte d\'eau. Le recyclage vous remercie.', 'Vous chantez sous la douche sonique. L\'équipage aussi, malgré lui.'] },
      { model: 'shower', x: 13.35, z: 1.07, action: 'Se doucher', interact: 'Douche sonique : réglage « comme sur Terre », vapeur comprise.' },
      { model: 'toilet', x: 15.05, z: 0.95, interact: 'Toilettes à dépression. Ne pas utiliser pendant un saut FSD.' },
      { model: 'sink', x: 15.12, z: 2.25, rot: 3, interact: 'Lavabo : le miroir affiche la météo de la station la plus proche.' },
      { model: 'rug', x: 13.2, z: 2.3, label: 'bath:1.2x0.7', solid: false },

      // --- Serre hydroponique ---
      { model: 'hydro-rack', x: 5.75, z: 2.9, interact: ['Hydroponie : tomates, basilic et un piment de Lave.', 'Les plantes poussent sous des LED roses. Elles ont l\'air heureuses.'] },
      { model: 'hydro-rack', x: 5.75, z: 6.1, rot: 2 },
      { model: 'plant-tall', x: 5, z: 4.5 },

      // --- Salon panoramique ---
      { model: 'orrery', x: 17.5, z: 2.65, interact: 'Carte du système : une étoile de classe G, quatre planètes, dont une géante gazeuse à anneaux.' },
      { model: 'rug', x: 17.4, z: 5.5, label: 'warm:2.2x1.6', solid: false },
      { model: 'sofa', x: 16.3, z: 5.5, rot: 1, label: 'teal', interact: 'Canapé face aux étoiles. On ne s\'en lasse pas.' },
      { model: 'coffee-table', x: 17.35, z: 5.5, rot: 1 },
      { model: 'beanbag', x: 18.5, z: 5, label: 'mustard' },
      { model: 'beanbag', x: 18.5, z: 6, label: 'rose' },
      { model: 'holo-panel', x: 19, z: 3.3, rot: 3, label: 'Exploration|Systèmes scannés : 318|Premières découvertes : 42|Valeur : 142 M cr' },
      { model: 'plant-tall', x: 17.5, z: 7.15 },
    ],
    lights: [
      [12, 4.6, '#ffd9a8', 2],
      [9.6, 2, '#ffcf99', 2.2],
      [13.8, 2, '#e6f6ff', 2],
      [10.2, 8.4, '#ffc98f', 2.3],
      [6, 4.5, '#ffb3e6', 2.6],
      [17.8, 4.6, '#ffd0a0', 2.4],
      // Les deux dernières lumières sont celles des objets de la cabine (Holo-Me, cheminée…).
    ],
  },
]
