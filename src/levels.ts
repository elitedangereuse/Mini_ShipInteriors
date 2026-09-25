import type { StationModel, Theme } from './assets'
import type { CabinDef } from './cabin/view'
import type { CustomModel } from './furniture'
import { tr } from './i18n'

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
  /** On y choisit la musique (le jukebox, cf. src/music.ts). */
  music?: boolean
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
    name: tr('Cale', 'Hold'),
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
    rooms: {
      a: tr('Atelier', 'Workshop'),
      j: tr('Palier de la cale', 'Hold landing'),
      r: tr('Baie de réparation', 'Repair bay'),
      m: tr('Raffinerie', 'Refinery'),
      g: tr('Soute', 'Cargo bay'),
    },
    floors: { a: 'floor-panel', j: 'floor-panel', r: 'floor-panel', m: 'floor-panel', g: 'floor-panel' },
    windows: { a: 0.1, j: 0, r: 0.12, m: 0, g: 0.1 },
    props: [
      // --- Palier : l'ascenseur au centre (cf. LIFT) ---
      { model: 'hazard-floor', x: 10, z: 5, solid: false },
      {
        model: 'computer', x: 9, z: 4, rot: 1,
        interact: tr(
          'Monte-charge de la cale : 3 t maximum. Les drones collecteurs ne comptent pas comme passagers.',
          'Hold cargo lift: 3 t maximum. Collector limpets do not count as passengers.',
        ),
      },
      { model: 'drums', x: 9.2, z: 5.95 },

      // --- Atelier ---
      {
        model: 'workbench', x: 4.75, z: 1.97,
        interact: [
          tr(
            'Établi : un drone collecteur démonté et trois vis de trop. Classique.',
            'Workbench: a dismantled collector limpet and three screws too many. Classic.',
          ),
          tr('Quelqu\'un a laissé un mot : « Ne pas toucher, ça marche presque. »', 'Someone has left a note: “Do not touch, it almost works.”'),
        ],
      },
      { model: 'workbench', x: 6.45, z: 1.97 },
      {
        model: 'tool-rack', x: 3.87, z: 3.6, rot: 1,
        interact: tr(
          'Panneau à outils : il manque la clé de 12. Il manque toujours la clé de 12.',
          'Tool board: the 12 mm spanner is missing. The 12 mm spanner is always missing.',
        ),
      },
      {
        model: 'welder', x: 4.2, z: 5.4, rot: 1,
        interact: tr(
          'Poste de soudure : ne jamais regarder l\'arc sans masque. Oui, même toi.',
          'Welding station: never look at the arc without a mask. Yes, even you.',
        ),
      },
      {
        model: 'engineer-bench', x: 5.75, z: 4.35,
        interact: tr(
          'Établi d\'ingénieur : « Apportez-moi du Meta-Alloy et je fais des miracles avec votre FSD. » — F. Farseer',
          'Engineer\'s workbench: “Bring me Meta-Alloys and I\'ll work miracles on your FSD.” — F. Farseer',
        ),
      },
      {
        model: 'scrap-pile', x: 6.8, z: 6.85,
        interact: tr('Ferraille de récupération : 30 % d\'épave de Sidewinder, 70 % de mystère.', 'Salvaged scrap: 30% Sidewinder wreck, 70% mystery.'),
      },
      { model: 'drums', x: 4.35, z: 6.95 },
      { model: 'steam-vent', x: 5.6, z: 6.2, solid: false },
      { model: 'cables', x: 5.7, z: 5.6, solid: false },
      { model: 'stain', x: 5.1, z: 3.1, solid: false },

      // --- Baie de réparation : le SRV sur son pont élévateur ---
      { model: 'repair-lift', x: 13.6, z: 2.15 },
      {
        model: 'srv', x: 13.6, z: 2.15, y: 0.13, rot: 1,
        interact: tr(
          'SRV Scarab sur le pont élévateur : suspension réparée, pare-chocs toujours tordu. Et toujours pas de ceinture.',
          'SRV Scarab on the hoist: suspension repaired, bumper still bent. And still no seatbelt.',
        ),
      },
      {
        model: 'robot-arm', x: 15.15, z: 1.25, rot: 3,
        interact: tr(
          'Bras de maintenance : soudure de la coque du SRV en cours. Garder ses distances.',
          'Maintenance arm: welding the SRV\'s hull. Keep your distance.',
        ),
      },
      {
        model: 'afmu', x: 16.05, z: 1.2,
        interact: tr(
          'AFMU : réparation des modules en cours. Rappel : elle ne répare pas la coque.',
          'AFMU: module repairs in progress. Reminder: it does not repair the hull.',
        ),
      },
      { model: 'tire-stack', x: 16.1, z: 2.35 },
      { model: 'cables', x: 13.4, z: 3.55, solid: false },
      { model: 'stain', x: 15.6, z: 3.3, solid: false },

      // --- Raffinerie ---
      {
        model: 'refinery', x: 13.3, z: 5.35,
        interact: tr(
          'Raffinerie : bac 1 platine 42 %, bac 2 painite 18 %, bac 3 diamants basse température 97 %.',
          'Refinery: bin 1 platinum 42%, bin 2 painite 18%, bin 3 low temperature diamonds 97%.',
        ),
      },
      { model: 'conveyor', x: 14.5, z: 7.95 },
      {
        model: 'skip-rocks', x: 16, z: 7.7,
        interact: tr(
          'Benne : 4,2 t de diamants basse température. Meilleur prix signalé : à 180 al d\'ici.',
          'Skip: 4.2 t of low temperature diamonds. Best reported price: 180 ly away.',
        ),
      },
      {
        model: 'ore-pile', x: 12.95, z: 7.75,
        interact: tr(
          'Minerai brut : painite, platine, et quelques opales du vide qui luisent dans le noir.',
          'Raw ore: painite, platinum, and a few void opals glowing in the dark.',
        ),
      },
      { model: 'limpets', x: 14.6, z: 6.8 },
      { model: 'stain', x: 14.5, z: 6.4, solid: false },

      // --- Soute ---
      { model: 'cargo', x: 17.93, z: 2.3 },
      { model: 'container', x: 18, z: 3.4 },
      {
        model: 'cargo', x: 17.93, z: 4.55,
        interact: tr(
          'Soute : 24 t de Brandy de Lave. Si la sécurité vous scanne, vous n\'avez rien vu.',
          'Cargo bay: 24 t of Lavian Brandy. If security scans you, you saw nothing.',
        ),
      },
      {
        model: 'mining-laser', x: 18, z: 6.95, rot: 3,
        interact: tr(
          'Laser minier 2B, rangé pour l\'hiver. Ne pas viser les réservoirs d\'hydrogène.',
          '2B mining laser, put away for the winter. Do not aim at the hydrogen tanks.',
        ),
      },
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
    name: tr('Pont principal', 'Main deck'),
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
      e: tr('Salle des machines', 'Engine room'),
      c: tr('Coursive', 'Corridor'),
      q: tr('Infirmerie', 'Medical bay'),
      r: tr('Salle de sport', 'Gym'),
      m: 'Mess',
      s: tr('Salon d\'arcade', 'Arcade lounge'),
      b: tr('Poste de pilotage', 'Cockpit'),
    },
    floors: { c: 'floor-panel', b: 'floor-detail' },
    engine: true,
    props: [
      // --- Poste de pilotage : siège et HOTAS, scanner, panneaux holographiques, carte galactique ---
      {
        model: 'computer-wide', x: 27, z: 4, rot: 3,
        interact: tr(
          'Supercroisière assistée engagée. Destination : Jameson Memorial, Shinrarta Dezhra — 3 sauts.',
          'Supercruise assist engaged. Destination: Jameson Memorial, Shinrarta Dezhra — 3 jumps.',
        ),
      },
      {
        model: 'computer-wide', x: 27, z: 5, rot: 3,
        interact: tr('Ordinateur d\'amarrage prêt. Musique d\'approche : « Le Beau Danube bleu ».', 'Docking computer ready. Approach music: “The Blue Danube”.'),
      },
      {
        model: 'pilot-seat', x: 25.9, z: 4.5, rot: 1,
        interact: tr('Siège du pilote. Quelqu\'un a gravé « o7 » sur l\'accoudoir.', 'Pilot\'s seat. Someone has carved “o7” into the armrest.'),
      },
      { model: 'radar', x: 26.55, z: 4.5, rot: 1 },
      {
        model: 'holo-panel', x: 26.2, z: 3.35, rot: 0,
        label: tr('Navigation|Shinrarta Dezhra|Jameson Memorial|12,4 al · 3 sauts', 'Navigation|Shinrarta Dezhra|Jameson Memorial|12.4 ly · 3 jumps'),
      },
      {
        model: 'holo-panel', x: 26.2, z: 5.65, rot: 2,
        label: tr('Systèmes|Boucliers 100 %|Coque 100 %|FSD chargé', 'Systems|Shields 100%|Hull 100%|FSD charged'),
      },
      {
        model: 'galaxy-map', x: 24, z: 4.5,
        interact: tr(
          'Carte galactique : 400 milliards d\'étoiles. Colonia à 22 000 al, Beagle Point à 65 279 al.',
          'Galaxy map: 400 billion stars. Colonia is 22,000 ly away, Beagle Point 65,279 ly.',
        ),
      },
      {
        model: 'computer-screen', x: 24.5, z: 2, rot: 0,
        interact: tr('Comms : Felicity Farseer attend toujours son Meta-Alloy.', 'Comms: Felicity Farseer is still waiting for her Meta-Alloys.'),
      },
      {
        model: 'computer-screen', x: 24.5, z: 7, rot: 2,
        interact: tr(
          'Télémétrie : portée de saut 42,7 al, carburant 32 t. Aucune signature thargoïde.',
          'Telemetry: jump range 42.7 ly, fuel 32 t. No Thargoid signatures.',
        ),
      },

      // --- Salle des machines ---
      {
        model: 'computer-system', x: 4.5, z: 2, rot: 0,
        interact: tr(
          'Distributeur d\'énergie : 4 pips aux systèmes, 2 aux moteurs, 0 aux armes. Vaisseau pacifiste.',
          'Power distributor: 4 pips to systems, 2 to engines, 0 to weapons. A pacifist ship.',
        ),
      },
      {
        model: 'computer-system', x: 4.5, z: 7, rot: 2,
        interact: tr('Support vital : oxygène 100 %. Filtres à remplacer dans 42 jours.', 'Life support: oxygen 100%. Filters due for replacement in 42 days.'),
      },
      {
        model: 'fsd', x: 2, z: 4.5, rot: 1,
        interact: tr(
          'Réacteur FSD 5A, modifié par Felicity Farseer (portée augmentée). Ne pas toucher pendant la charge.',
          '5A frame shift drive, engineered by Felicity Farseer (increased range). Do not touch while charging.',
        ),
      },
      {
        model: 'container-tall', x: 0, z: 3,
        interact: tr(
          'Réservoir : 32 t d\'hydrogène. Pour le plein, écoper une étoile K, G, B, F, O, A ou M.',
          'Fuel tank: 32 t of hydrogen. To refuel, scoop a K, G, B, F, O, A or M star.',
        ),
      },
      { model: 'container-tall', x: 0, z: 5 },
      { model: 'container-wide', x: 1, z: 1 },
      { model: 'container-wide', x: 1, z: 8 },
      { model: 'pipe-ring-colored', x: 7, z: 1 },
      { model: 'pipe-ring-colored', x: 7, z: 8 },
      { model: 'structure-panel', x: 2, z: 7, y: 0.005, solid: false },
      { model: 'structure-panel', x: 2, z: 2, y: 0.005, solid: false },

      // --- Infirmerie ---
      {
        model: 'med-bed', x: 11, z: 0.3,
        interact: [
          tr('Lit médical : draps propres, scanner en veille.', 'Medical bed: clean sheets, scanner on standby.'),
          tr('Le moniteur affiche 72 battements par minute. Les vôtres.', 'The monitor shows 72 beats per minute. Yours.'),
        ],
      },
      { model: 'med-bed', x: 15, z: 0.3, label: 'left' },
      {
        model: 'body-scan', x: 13, z: 0.35,
        interact: tr(
          'Scanner médical : constantes de l\'équipage normales. Le chat est en léger surpoids.',
          'Medical scanner: crew vital signs normal. The cat is slightly overweight.',
        ),
      },
      {
        model: 'med-cabinet', x: 11, z: 2.5, rot: 1,
        interact: tr(
          'Armoire à pharmacie : trousses de soin, cellules d\'énergie et pansements Pioneer Supplies.',
          'Medicine cabinet: medkits, energy cells and Pioneer Supplies plasters.',
        ),
      },
      {
        model: 'sample-tank', x: 15, z: 2.55,
        interact: tr('Quarantaine : Bacterium Aurasus. Il bouge quand on ne le regarde pas.', 'Quarantine: Bacterium Aurasus. It moves when nobody is looking.'),
      },

      // --- Salle de sport ---
      {
        model: 'treadmill', x: 16.05, z: 0.7, action: tr('Courir', 'Run'),
        interact: [
          tr('Tapis de course : 5 km parcourus. Le vaisseau, lui, en a fait 3 milliards.', 'Treadmill: 5 km run. The ship, meanwhile, has done 3 billion.'),
          tr('Programme « Fuite devant un Thargoïde » : niveau 7 atteint.', '“Fleeing a Thargoid” programme: level 7 reached.'),
        ],
      },
      {
        model: 'exercise-bike', x: 17.1, z: 0.55, action: tr('Pédaler', 'Pedal'),
        interact: tr(
          'Vélo d\'appartement : il recharge les batteries de secours. Pédalez, CMDR !',
          'Exercise bike: it charges the backup batteries. Pedal, CMDR!',
        ),
      },
      {
        model: 'weight-bench', x: 19.55, z: 0.55,
        interact: tr(
          'Banc de musculation : 60 kg… sous 0,8 g. Vous êtes plus fort que vous ne le croyez.',
          'Weight bench: 60 kg… at 0.8 g. You are stronger than you think.',
        ),
      },
      { model: 'dumbbell-rack', x: 20.15, z: 2.35, rot: 3 },
      {
        model: 'punching-bag', x: 16.3, z: 2.4, rot: 1, action: tr('Frapper', 'Punch'),
        interact: [
          tr('Paf ! Le sac encaisse sans broncher.', 'Thwack! The bag takes it without flinching.'),
          tr('Bim ! Quelqu\'un a dessiné un Thargoïde dessus.', 'Pow! Someone has drawn a Thargoid on it.'),
        ],
      },
      { model: 'rug', x: 18.2, z: 1.9, label: 'rubber:1.6x1.1', solid: false },

      // --- Mess ---
      { model: 'table-large', x: 13, z: 8, rot: 0 },
      { model: 'chair-cushion', x: 12.5, z: 7.2, rot: 0 },
      { model: 'chair-cushion', x: 13.5, z: 7.2, rot: 0 },
      { model: 'chair-cushion', x: 12.5, z: 8.8, rot: 2 },
      { model: 'chair-cushion', x: 13.5, z: 8.8, rot: 2 },
      {
        model: 'computer', x: 11, z: 9, rot: 2,
        interact: tr(
          'Distributeur : plus de Brandy de Lave. Il reste du café lyophilisé et une tasse de Hutton Orbital.',
          'Vending machine: out of Lavian Brandy. There is freeze-dried coffee left, and a Hutton Orbital mug.',
        ),
      },
      { model: 'table-display-planet', x: 15, z: 7, rot: 3, solid: false },
      // Le jukebox du mess : tout le pont l'entend (cf. src/music.ts).
      { model: 'jukebox', x: 11.3, z: 6.32, action: tr('Choisir un morceau', 'Pick a song'), music: true },

      // --- Salon d'arcade ---
      // Les trois bornes se jouent (cf. src/arcade/) : Cargaison, Viper, Astéroïdes.
      { model: 'arcade', x: 16.05, z: 7, rot: 1, label: 'cargo' },
      { model: 'arcade', x: 16.05, z: 8, rot: 1, label: 'viper' },
      { model: 'arcade', x: 16.05, z: 9, rot: 1, label: 'asteroids' },
      { model: 'neon-sign', x: 17.1, z: 6.1, label: 'ARCADE' },
      { model: 'claw-machine', x: 19.95, z: 6.42, rot: 3, label: 'cyan' },
      { model: 'rug', x: 18.3, z: 8.1, label: 'neon:2x1.8', solid: false },
      {
        model: 'sofa', x: 20.02, z: 8.1, rot: 3, label: 'purple',
        interact: tr('Canapé du salon : la meilleure place pour regarder les autres perdre.', 'Lounge sofa: the best seat for watching others lose.'),
      },
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
    name: tr('Pont supérieur', 'Upper deck'),
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
      c: tr('Coursive', 'Corridor'),
      k: tr('Cabines d\'équipage', 'Crew cabins'),
      d: tr('Douches', 'Showers'),
      p: tr('Quartiers du commandant', 'Commander\'s quarters'),
      g: tr('Serre hydroponique', 'Hydroponics bay'),
      o: tr('Salon panoramique', 'Observation lounge'),
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
      {
        model: 'bunk-bed', x: 8.05, z: 1.24, label: 'navy',
        interact: tr(
          'Couchette. Sous l\'oreiller, un journal : « Jour 214. Toujours en supercroisière vers Hutton Orbital. »',
          'Bunk. Under the pillow, a diary: “Day 214. Still in supercruise to Hutton Orbital.”',
        ),
      },
      { model: 'bunk-bed', x: 11, z: 1.24, label: 'sage' },
      {
        model: 'locker', x: 9.55, z: 0.84,
        interact: tr(
          'Casiers de l\'équipage : chaussettes de rechange, barres protéinées, une photo de famille prise à Achenar.',
          'Crew lockers: spare socks, protein bars, a family photo taken at Achenar.',
        ),
      },
      { model: 'rug', x: 9.9, z: 2.35, label: 'blue:1.3x0.8', solid: false },

      // --- Douches ---
      {
        model: 'shower', x: 12.45, z: 1.07, action: tr('Se doucher', 'Shower'),
        interact: [
          tr(
            'Douche sonique : 30 secondes, zéro goutte d\'eau. Le recyclage vous remercie.',
            'Sonic shower: 30 seconds, not a single drop of water. The recycling system thanks you.',
          ),
          tr('Vous chantez sous la douche sonique. L\'équipage aussi, malgré lui.', 'You sing in the sonic shower. So does the crew, against its will.'),
        ],
      },
      {
        model: 'shower', x: 13.35, z: 1.07, action: tr('Se doucher', 'Shower'),
        interact: tr('Douche sonique : réglage « comme sur Terre », vapeur comprise.', 'Sonic shower: “just like on Earth” setting, steam included.'),
      },
      {
        model: 'toilet', x: 15.05, z: 0.95,
        interact: tr('Toilettes à dépression. Ne pas utiliser pendant un saut FSD.', 'Vacuum toilet. Do not use during an FSD jump.'),
      },
      {
        model: 'sink', x: 15.12, z: 2.25, rot: 3,
        interact: tr('Lavabo : le miroir affiche la météo de la station la plus proche.', 'Washbasin: the mirror shows the weather at the nearest station.'),
      },
      { model: 'rug', x: 13.2, z: 2.3, label: 'bath:1.2x0.7', solid: false },

      // --- Serre hydroponique ---
      {
        model: 'hydro-rack', x: 5.75, z: 2.9,
        interact: [
          tr('Hydroponie : tomates, basilic et un piment de Lave.', 'Hydroponics: tomatoes, basil and a Lave chilli.'),
          tr('Les plantes poussent sous des LED roses. Elles ont l\'air heureuses.', 'The plants grow under pink LEDs. They look happy.'),
        ],
      },
      { model: 'hydro-rack', x: 5.75, z: 6.1, rot: 2 },
      { model: 'plant-tall', x: 5, z: 4.5 },

      // --- Salon panoramique ---
      {
        model: 'orrery', x: 17.5, z: 2.65,
        interact: tr(
          'Carte du système : une étoile de classe G, quatre planètes, dont une géante gazeuse à anneaux.',
          'System map: a class G star and four planets, one of them a ringed gas giant.',
        ),
      },
      { model: 'rug', x: 17.4, z: 5.5, label: 'warm:2.2x1.6', solid: false },
      {
        model: 'sofa', x: 16.3, z: 5.5, rot: 1, label: 'teal',
        interact: tr('Canapé face aux étoiles. On ne s\'en lasse pas.', 'A sofa facing the stars. It never gets old.'),
      },
      { model: 'coffee-table', x: 17.35, z: 5.5, rot: 1 },
      { model: 'beanbag', x: 18.5, z: 5, label: 'mustard' },
      { model: 'beanbag', x: 18.5, z: 6, label: 'rose' },
      {
        model: 'holo-panel', x: 19, z: 3.3, rot: 3,
        label: tr(
          'Exploration|Systèmes scannés : 318|Premières découvertes : 42|Valeur : 142 M cr',
          'Exploration|Systems scanned: 318|First discoveries: 42|Value: 142 M CR',
        ),
      },
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
