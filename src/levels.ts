import type { StationModel, Theme } from './assets'
import type { CabinDef } from './cabin/view'
import type { CustomModel } from './furniture'
import { tr } from './i18n'
import { BOARD_TABLES, SHIP_LAYOUTS } from '../shared/ship-layouts.js'

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
 * tempo de la piste de danse (pulse), en changeant de couleur (disco) ; ou reflet de l'écran de
 * cinéma, qui suit les scènes du film (screen).
 */
export type Flicker = 'neon' | 'fire' | 'disco' | 'pulse' | 'screen'

export type LightDef = [number, number, string, number, ('neon' | 'fire' | 'screen')?]

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
  /** Verrières : par pièce, les côtés (0 nord, 1 est, 2 sud, 3 ouest) dont les murs extérieurs sont vitrés. */
  canopy?: Record<string, number[]>
  props: Prop[]
  /** La réserve en éclaire 8 à la fois, les plus proches du joueur (cf. applyLights dans main.ts). */
  lights: LightDef[]
  /**
   * Pièces tamisées : quand on y entre, la lumière d'ambiance du pont (ciel, soleil) descend à
   * cette fraction, en fondu (cf. main.ts).
   */
  dim?: Record<string, number>
  /** Réacteur et tuyères. */
  engine?: boolean
  /**
   * Pièces en travaux (cf. CLOSED_ROOMS) : ce qu'on lit en examinant leur porte verrouillée,
   * par lettre de pièce.
   */
  closed?: Record<string, string | string[]>
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
  // ======================================================== Cale : minage, bricolage, réparation, et un bar clandestin
  {
    id: -1,
    name: tr('Cale', 'Hold'),
    theme: 'raw',
    ambience: { sky: '#8f97a8', ground: '#22180f', hemi: 0.9, sun: '#ffd2a0', sunIntensity: 1.35 },
    layout: SHIP_LAYOUTS['-1'],
    rooms: {
      a: tr('Atelier', 'Workshop'),
      j: tr('Palier de la cale', 'Hold landing'),
      r: tr('Baie de réparation', 'Repair bay'),
      m: tr('Raffinerie', 'Refinery'),
      g: tr('Soute', 'Cargo bay'),
      // Le nom du bar ne se traduit pas.
      b: 'Chez Jacques',
      h: tr('Sas de la zone thargoïde', 'Thargoid zone airlock'),
    },
    closed: {
      h: tr(
        'Porte verrouillée : « Sas de la zone thargoïde — en travaux ». Derrière, on entend gratter.',
        'Locked door: “Thargoid zone airlock — under construction”. Something is scratching on the other side.',
      ),
    },
    // Le bar est tenu plus proprement que le reste de la cale : dalles lisses, pas un hublot.
    floors: { a: 'floor-panel', j: 'floor-panel', r: 'floor-panel', m: 'floor-panel', g: 'floor-panel', h: 'floor-panel' },
    windows: { a: 0.1, j: 0, r: 0.12, m: 0, g: 0.1, b: 0, h: 0 },
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

      // --- Chez Jacques : le bar clandestin, au fond de la soute ---
      // Arrière-bar contre le mur nord, Jacques entre lui et le comptoir, tabourets côté salle.
      {
        model: 'back-bar', x: 12.4, z: 8.8,
        interact: tr(
          'Arrière-bar : Brandy de Lave, whisky d\'Eranin, Onionhead « à usage médical » et une bouteille sans étiquette que personne n\'ose ouvrir.',
          'Back bar: Lavian Brandy, Eranin whisky, Onionhead “for medical use” and an unlabelled bottle nobody dares to open.',
        ),
      },
      { model: 'bar-counter', x: 12.4, z: 9.8 },
      {
        model: 'bartender', x: 12.4, z: 9.25, action: tr('Parler à Jacques', 'Talk to Jacques'),
        interact: [
          tr('Jacques : « Bienvenue chez Jacques. Ici, on ne demande ni votre nom, ni votre cargaison. »', 'Jacques: “Welcome to Chez Jacques. Here, nobody asks your name, or your cargo.”'),
          tr('Jacques : « Du Brandy de Lave ? Officiellement, je n\'en ai pas. Officieusement, c\'est 400 CR le verre. »', 'Jacques: “Lavian Brandy? Officially, I have none. Unofficially, it\'s 400 CR a glass.”'),
          tr('Jacques : « Le cocktail du jour : le Supercroisière. Trois doses de rhum, une de carburant… pardon, de sirop. »', 'Jacques: “Cocktail of the day: the Supercruise. Three shots of rum, one of fuel… sorry, of syrup.”'),
          tr('Jacques : « Si la sécurité monte à bord, ce bar est une réserve de pièces détachées. Compris ? »', 'Jacques: “If security comes aboard, this bar is a spare parts store. Understood?”'),
          tr('Jacques : « J\'ai servi à Jameson Memorial, moi. Ils m\'ont remplacé par un distributeur. Un distributeur ! »', 'Jacques: “I used to serve at Jameson Memorial, you know. They replaced me with a vending machine. A vending machine!”'),
          tr('Jacques : « Onionhead ? Jamais entendu parler. Et baissez la voix. »', 'Jacques: “Onionhead? Never heard of it. And keep your voice down.”'),
          tr('Jacques : « o7, CMDR. Le premier verre au retour de Colonia, c\'est la maison qui l\'offre. »', 'Jacques: “o7, CMDR. Your first drink back from Colonia is on the house.”'),
          tr('Jacques essuie un verre, vous regarde, et en essuie un autre. Il attend votre commande.', 'Jacques wipes a glass, looks at you, and wipes another one. He is waiting for your order.'),
        ],
      },
      { model: 'bar-stool', x: 11.2, z: 10.45, rot: 2 },
      { model: 'bar-stool', x: 12, z: 10.45, rot: 2 },
      { model: 'bar-stool', x: 12.8, z: 10.45, rot: 2, label: 'black' },
      { model: 'bar-stool', x: 13.6, z: 10.45, rot: 2 },
      // Le jukebox du bar, contre le mur ouest : toute la cale l'entend (cf. src/music.ts).
      { model: 'jukebox', x: 8.83, z: 9.6, rot: 1, action: tr('Choisir un morceau', 'Pick a song'), music: true },
      // Trois tables de bistro, sur un grand tapis.
      { model: 'rug', x: 13, z: 12.3, label: 'bar:7.6x1.7', solid: false },
      { model: 'bar-table', x: 10.3, z: 12.3 },
      { model: 'bar-chair', x: 9.78, z: 12.3, rot: 1 },
      { model: 'bar-chair', x: 10.82, z: 12.3, rot: 3 },
      { model: 'bar-table', x: 13, z: 12.2, label: 'galactic-clash', action: tr('Jouer à Galactic Clash', 'Play Galactic Clash'), interact: tr('Table de cartes Galactic Clash : solo ou duel.', 'Galactic Clash card table: solo or duel.') },
      { model: 'bar-chair', x: 12.48, z: 12.2, rot: 1 },
      { model: 'bar-chair', x: 13.52, z: 12.2, rot: 3 },
      { model: 'bar-chair', x: 13, z: 12.74, rot: 2 },
      { model: 'pinball', x: 17.25, z: 12.55, rot: 3, label: 'thargoid', action: tr('Jouer au Mini-CQC', 'Play Mini-CQC') },
      { model: 'bar-table', x: 15.7, z: 12.3 },
      { model: 'bar-chair', x: 15.18, z: 12.3, rot: 1 },
      { model: 'bar-chair', x: 16.22, z: 12.3, rot: 3 },
      // Banquette du coin, contre le mur est, et sa table.
      {
        model: 'sofa', x: 18.03, z: 10.9, rot: 3, label: 'plum',
        interact: tr('Banquette du fond : la place de ceux qui ne veulent pas qu\'on voie leur visage.', 'Back booth: the seat for those who would rather not show their face.'),
      },
      { model: 'bar-table', x: 17.2, z: 10.9 },
      // La marchandise, à deux pas de l'entrée de la soute.
      {
        model: 'crate', x: 18, z: 9.1,
        interact: tr(
          'Caisses marquées « PIÈCES DÉTACHÉES ». Elles tintent quand on les secoue.',
          'Crates marked “SPARE PARTS”. They clink when you shake them.',
        ),
      },
      { model: 'crate', x: 18, z: 9.1, y: 0.4 },
      { model: 'crate', x: 18.02, z: 9.62 },
      { model: 'plant-tall', x: 17.95, z: 12.95 },

      // --- Sas de la zone thargoïde (SOC-06), en travaux ---
      { model: 'works-sign', x: 22.9, z: 5.2, rot: 3, label: tr('Bientôt|Zone thargoïde', 'Coming soon|Thargoid zone') },
      { model: 'works-tape', x: 23.5, z: 5, solid: false },
      { model: 'scaffold', x: 22.6, z: 2.05 },
      { model: 'tarp-crates', x: 24.9, z: 2.3, rot: 1 },
      { model: 'tarp-crates', x: 24.9, z: 7.55, rot: 1 },
      { model: 'cones', x: 20.6, z: 7.7 },
      { model: 'drums', x: 20.5, z: 2.5 },
      { model: 'cables', x: 21.6, z: 6.8, solid: false },
      { model: 'work-lamp', x: 24.6, z: 4.9, rot: 3 },
    ],
    lights: [
      [5.6, 3.1, '#ffb35c', 3],
      [5.6, 6.3, '#ffa24a', 2.4, 'neon'],
      [10, 5, '#ffd9a0', 1.6],
      [14.3, 2.3, '#fff0d8', 3.2],
      [14.3, 6.9, '#ff7a2a', 3, 'fire'],
      [17.9, 4.6, '#ffb060', 2.2, 'neon'],
      [12.4, 9.7, '#ffb45e', 3.4],
      [14.2, 11.8, '#ff9f5a', 3, 'fire'],
    ],
  },

  // ======================================================== Pont principal
  {
    id: 0,
    name: tr('Pont principal', 'Main deck'),
    layout: SHIP_LAYOUTS['0'],
    rooms: {
      e: tr('Salle des machines', 'Engine room'),
      c: tr('Coursive', 'Corridor'),
      q: tr('Infirmerie', 'Medical bay'),
      r: tr('Salle de sport', 'Gym'),
      m: 'Mess',
      s: tr('Salon d\'arcade', 'Arcade lounge'),
      b: tr('Poste de pilotage', 'Cockpit'),
      l: tr('Labo du L.J.P.C.', 'L.J.P.C. lab'),
      v: 'La Voie',
      k: tr('Simulateur Mini-CQC', 'Mini-CQC simulator'),
    },
    closed: {
      v: tr('Porte verrouillée : « Sanctuaire de La Voie — en travaux ». Un symbole est gravé sur le panneau.', 'Locked door: “La Voie sanctuary — under construction”. A symbol is carved into the panel.'),
      k: tr('Porte verrouillée : « Simulateur Mini-CQC — en travaux ». On entend des tirs de laser… enregistrés.', 'Locked door: “Mini-CQC simulator — under construction”. You can hear laser fire… recorded.'),
    },
    floors: { c: 'floor-panel', b: 'floor-detail', l: 'floor-panel' },
    canopy: { b: [0, 1, 2] },
    engine: true,
    props: [
      // --- Poste de pilotage, à la proue : verrières sur l'avant et les flancs ---
      // Le pilote face au tableau de bord, le copilote et le navigateur de part et d'autre, la
      // carte galactique au centre, et le fauteuil du commandant derrière elle.
      {
        model: 'helm-console', x: 37.95, z: 4.5, rot: 3,
        interact: [
          tr(
            'Supercroisière assistée engagée. Destination : Jameson Memorial, Shinrarta Dezhra — 3 sauts.',
            'Supercruise assist engaged. Destination: Jameson Memorial, Shinrarta Dezhra — 3 jumps.',
          ),
          tr('Ordinateur d\'amarrage prêt. Musique d\'approche : « Le Beau Danube bleu ».', 'Docking computer ready. Approach music: “The Blue Danube”.'),
        ],
      },
      {
        model: 'pilot-seat', x: 36.9, z: 4.5, rot: 1,
        interact: tr('Siège du pilote. Quelqu\'un a gravé « o7 » sur l\'accoudoir.', 'Pilot\'s seat. Someone has carved “o7” into the armrest.'),
      },
      { model: 'radar', x: 37.5, z: 4.5, rot: 1 },
      { model: 'side-console', x: 37.55, z: 3, rot: 3, label: 'nav', interact: tr('Poste du navigateur : route tracée, 3 sauts, aucune étoile à neutrons sur le trajet. Dommage.', 'Navigator\'s station: route plotted, 3 jumps, no neutron stars on the way. Pity.') },
      { model: 'crew-seat', x: 36.7, z: 3, rot: 1, interact: tr('Siège du navigateur : l\'accoudoir est usé à force de pianoter sur la carte.', 'Navigator\'s seat: the armrest is worn from tapping on the map.') },
      { model: 'side-console', x: 37.55, z: 6, rot: 3, label: 'comms', interact: tr('Comms : Felicity Farseer attend toujours son Meta-Alloy.', 'Comms: Felicity Farseer is still waiting for her Meta-Alloys.') },
      { model: 'crew-seat', x: 36.7, z: 6, rot: 1, interact: tr('Siège du copilote : il sent encore le café de la dernière veille.', 'Co-pilot\'s seat: it still smells of the last watch\'s coffee.') },
      {
        model: 'galaxy-map', x: 34.5, z: 4.5,
        interact: tr(
          'Carte galactique : 400 milliards d\'étoiles. Colonia à 22 000 al, Beagle Point à 65 279 al.',
          'Galaxy map: 400 billion stars. Colonia is 22,000 ly away, Beagle Point 65,279 ly.',
        ),
      },
      {
        model: 'command-chair', x: 33.1, z: 4.5, rot: 1,
        interact: tr('Fauteuil du commandant. D\'ici, on voit toute la passerelle… et on donne les ordres.', 'The commander\'s chair. From here you see the whole bridge… and give the orders.'),
      },
      {
        model: 'holo-panel', x: 35.3, z: 2.35, rot: 0,
        label: tr('Navigation|Shinrarta Dezhra|Jameson Memorial|12,4 al · 3 sauts', 'Navigation|Shinrarta Dezhra|Jameson Memorial|12.4 ly · 3 jumps'),
      },
      {
        model: 'holo-panel', x: 35.3, z: 6.65, rot: 2,
        label: tr('Systèmes|Boucliers 100 %|Coque 100 %|FSD chargé', 'Systems|Shields 100%|Hull 100%|FSD charged'),
      },
      {
        model: 'computer-screen', x: 33, z: 1, rot: 0,
        interact: tr(
          'Télémétrie : portée de saut 42,7 al, carburant 32 t. Aucune signature thargoïde.',
          'Telemetry: jump range 42.7 ly, fuel 32 t. No Thargoid signatures.',
        ),
      },
      { model: 'computer-screen', x: 33, z: 8, rot: 2, interact: tr('Journal de bord : « Jour 1 : on a agrandi le poste de pilotage. Jour 2 : on cherche encore le café. »', 'Ship\'s log: “Day 1: we enlarged the cockpit. Day 2: still looking for the coffee.”') },
      { model: 'plant-tall', x: 32.1, z: 7.25 },

      // --- Salle des machines ---
      // Guichets aux murs nord/sud ; l’allée est reste libre depuis la coursive.
      { model: 'reward-counter', x: 6.4, z: 0.35, label: 'weekly', interact: tr('Officier de liaison · Weekly', 'Liaison officer · Weekly'), action: tr('Récupérer les crédits', 'Collect credits') },
      { model: 'reward-counter', x: 6.4, z: 8.65, rot: 2, label: 'hunt', interact: tr('Scientifique du LJPC · Chasse galactique', 'LJPC scientist · Galactic Hunt'), action: tr('Récupérer les crédits', 'Collect credits') },
      {
        model: 'computer-system', x: 4.2, z: 0.35, rot: 0,
        interact: tr(
          'Distributeur d\'énergie : 4 pips aux systèmes, 2 aux moteurs, 0 aux armes. Vaisseau pacifiste.',
          'Power distributor: 4 pips to systems, 2 to engines, 0 to weapons. A pacifist ship.',
        ),
      },
      {
        model: 'computer-system', x: 4.2, z: 8.65, rot: 2,
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
      { model: 'pipe-ring-colored', x: 2.8, z: 0.25 },
      { model: 'pipe-ring-colored', x: 2.8, z: 8.75 },
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
      { model: 'employee-board', x: 18.7, z: -0.35, solid: false, interact: 'Employés du mois', action: tr('Consulter les classements', 'View rankings') },
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
      { model: 'jukebox', x: 11.3, z: 5.82, action: tr('Choisir un morceau', 'Pick a song'), music: true },

      // --- Grande salle d'arcade : deux rangées de bornes jouables, les jeux de plateau à l'est, un coin salon ---
      // Au sud, face au nord : Cargaison, Viper, Astéroïdes et Ruelle Fighter II.
      { model: 'arcade', x: 16.7, z: 9.02, rot: 2, label: 'cargo' },
      { model: 'arcade', x: 17.95, z: 9.02, rot: 2, label: 'viper' },
      { model: 'arcade', x: 19.2, z: 9.02, rot: 2, label: 'asteroids' },
      { model: 'arcade', x: 20.6, z: 9.02, rot: 2, label: 'fight' },
      // Au nord, face au sud, de part et d'autre des portes : un deuxième exemplaire des jeux solo,
      // pour que tout le monde joue quand l'équipage est nombreux (le duel de Ruelle Fighter II
      // est unique sur le pont, cf. server/fights.js), et un flipper.
      { model: 'arcade', x: 16.45, z: 5.98, label: 'cargo' },
      { model: 'arcade', x: 19.35, z: 5.98, label: 'viper' },
      { model: 'arcade', x: 20.55, z: 5.98, label: 'asteroids' },
      { model: 'arcade', x: 21.75, z: 5.98, label: 'cargo' },
      { model: 'pinball', x: 24.05, z: 6.1, label: 'thargoid' },
      { model: 'claw-machine', x: 25.0, z: 6.2, rot: 3, label: 'cyan' },
      { model: 'neon-sign', x: 15.72, z: 7.5, rot: 1, label: 'ARCADE' },
      // Tapis colorés : l'allée entre les deux rangées, et le coin des jeux de plateau.
      { model: 'rug', x: 18.6, z: 7.5, label: 'arcade:5.2x1.5', solid: false },
      { model: 'rug', x: 23.3, z: 7.95, label: 'neon:3.9x2.3', solid: false },
      {
        model: 'holo-draughts', x: BOARD_TABLES.draughts.x, z: BOARD_TABLES.draughts.z, action: tr('Jouer aux dames', 'Play draughts'),
        interact: tr('Table holographique : les pièces attendent deux adversaires.', 'Holographic table: the pieces await two opponents.'),
      },
      {
        model: 'guardian-connect', x: BOARD_TABLES['guardian-connect'].x, z: BOARD_TABLES['guardian-connect'].z, action: tr('Jouer à Puissance 4', 'Play Connect Four'),
        interact: tr('Puissance 4 Guardian : alignez quatre cristaux avant votre adversaire.', 'Guardian Connect Four: align four crystals before your opponent.'),
      },
      {
        model: 'imperial-chess', x: BOARD_TABLES['imperial-chess'].x, z: BOARD_TABLES['imperial-chess'].z, action: tr('Jouer aux échecs', 'Play chess'),
        interact: tr('Échec Impérial : stratégie, patience et aucun duel de plasma sur l’échiquier.', 'Imperial Chess: strategy, patience, and no plasma duels on the board.'),
      },
      {
        model: 'sofa', x: 23.3, z: 9.02, rot: 2, label: 'purple',
        interact: tr('Canapé du salon : la meilleure place pour regarder les autres perdre.', 'Lounge sofa: the best seat for watching others lose.'),
      },
      { model: 'beanbag', x: 24.85, z: 9.0, label: 'teal' },
      { model: 'beanbag', x: 21.8, z: 9.0, label: 'mustard' },
      { model: 'plant-tall', x: 25.1, z: 7.1 },

      // --- Labo du L.J.P.C., d'après l'aventure « Connais ton ennemi » : James devant son tableau
      // d'enquête, Julia qui dessine par terre, et Moustache (cf. main.ts), qui ne quitte pas le labo ---
      {
        model: 'ljpc-board', x: 23, z: -0.35, solid: false,
        interact: tr(
          'Tableau d\'enquête : un scout à HIP 17125, un intercepteur à HIP 17862, une base thargoïde entourée trois fois, un QR code et du morse. En gros : CONNAIS TON ENNEMI.',
          'Investigation board: a scout at HIP 17125, an interceptor at HIP 17862, a Thargoid base circled three times, a QR code and some Morse. In big letters: KNOW YOUR ENEMY.',
        ),
      },
      {
        model: 'ljpc-kid', x: 21.95, z: 0.45, label: 'james', action: tr('Parler', 'Talk'),
        interact: [
          tr(
            'James : « Commandant ! Professeur James Hopper, du L.J.P.C. Nous menons des recherches très sérieuses sur la menace qui menace… heu, sur le fléau qui frappe l\'humanité. »',
            'James: “Commander! Professor James Hopper, of the L.J.P.C. We conduct very serious research into the menacing menace… er, the scourge striking humanity.”',
          ),
          tr('James : « Pour la science ! Pour le progrès ! Pour l\'humanité ! » Julia, par terre : « Et pour le goûter. »', 'James: “For science! For progress! For humanity!” Julia, from the floor: “And for snack time.”'),
          tr('James : « Fais moins de bruit, Julia, je parle avec notre associé ! … Veuillez m\'excuser, commandant. »', 'James: “Keep it down, Julia, I\'m talking to our associate! … Please excuse me, commander.”'),
          tr(
            'James : « Notre père est chercheur en biomécanique. Ma sœur et moi, on l\'aide. Nous avons un quotient intellectuel bien au-dessus de la moyenne, vous savez. »',
            'James: “Our father researches biomechanics. My sister and I help him. We have an IQ well above average, you know.”',
          ),
          tr('James : « Vos échantillons du site de crash ? Une véritable mine d\'or ! Moustache, laisse ça tranqui… »', 'James: “Your samples from the crash site? A real gold mine! Moustache, leave that alo…”'),
        ],
      },
      {
        model: 'ljpc-kid', x: 24.15, z: 1.75, label: 'julia', action: tr('Parler', 'Talk'),
        interact: [
          tr('Julia lève les yeux de son dessin : « Ça, c\'est un Thargoïde. Et là, c\'est Moustache qui le fait fuir. »', 'Julia looks up from her drawing: “That\'s a Thargoid. And that\'s Moustache scaring it off.”'),
          tr('Julia : « James fait son sérieux, mais c\'est moi qui ai eu l\'idée du morse ! »', 'Julia: “James acts all serious, but the Morse code was my idea!”'),
          tr('Julia : « Je dessine la base thargoïde. Elle ressemble à un Titan, tu trouves pas ? »', 'Julia: “I\'m drawing the Thargoid base. It looks like a Titan, don\'t you think?”'),
          tr('Julia : « Chut ! Moustache a encore marché sur la console pendant l\'appel du commandant. »', 'Julia: “Shh! Moustache walked on the console again during the commander\'s call.”'),
        ],
      },
      {
        model: 'holo-thargoid', x: 23.15, z: 1.5,
        interact: tr('Hologramme d\'un intercepteur thargoïde. James y a ajouté des flèches, des mesures, et un mot : « méchant ».', 'Hologram of a Thargoid interceptor. James has added arrows, measurements and one word: “mean”.'),
      },
      {
        model: 'containment-pod', x: 21.1, z: 0.1,
        interact: tr(
          'Échantillon biomécanique thargoïde, rapporté par un CMDR de confiance. Près de six ans d\'âge, en excellent état. Étiquette : « NE PAS TOUCHER (toi aussi Moustache) ».',
          'Thargoid biomechanical sample, brought back by a trusted CMDR. Nearly six years old, in excellent condition. Label: “DO NOT TOUCH (you too Moustache)”.',
        ),
      },
      {
        model: 'lab-bench', x: 24.75, z: -0.1,
        interact: [
          tr('Microscope, éprouvettes, boîtes de Petri : les échantillons du scout de HIP 17125, encore en excellent état.', 'Microscope, test tubes, Petri dishes: the samples from the HIP 17125 scout, still in excellent condition.'),
          tr('Le bécher bouillonne. Une étiquette de Julia : « soupe de Thargoïde, ne pas boire ».', 'The beaker bubbles. A label in Julia\'s hand: “Thargoid soup, do not drink”.'),
        ],
      },
      {
        model: 'amadioha-photo', x: 20.65, z: 0.85, rot: 1, solid: false,
        interact: tr('Photo de l\'installation scientifique Amadioha, près de sa naine blanche. En bas, d\'une écriture d\'enfant : « Chez nous ».', 'Photo of the Amadioha Scientific Installation, beside its white dwarf. At the bottom, in a child\'s hand: “Home”.'),
      },
      {
        model: 'ljpc-banner', x: 20.65, z: 1.75, rot: 1, solid: false,
        interact: tr('L.J.P.C. : Laboratoire des Jeunes Prodiges Cosmiques, fondé par James et Julia pour aider leur père… et l\'humanité.', 'L.J.P.C.: Laboratory of Young Cosmic Prodigies, founded by James and Julia to help their father… and humanity.'),
      },
      { model: 'bookshelf', x: 20.85, z: 2.75, rot: 1 },
      { model: 'rug-round', x: 24.15, z: 2, label: 'blue', solid: false },
      { model: 'cat-bed', x: 25, z: 2.9, interact: tr('Le panier de Moustache. Il y a des poils noirs partout, et un stylo de James.', 'Moustache\'s basket. Black hair everywhere, and one of James\'s pens.') },
      { model: 'pet-bowl', x: 25.05, z: 2.3, rot: 1 },

      // --- Pièces en travaux : La Voie au nord, le Mini-CQC au sud ---
      { model: 'works-sign', x: 28, z: 1.6, label: tr('Bientôt|La Voie', 'Coming soon|La Voie') },
      { model: 'tarp-crates', x: 26.9, z: 0.4 },
      { model: 'scaffold', x: 29.5, z: 0.05 },
      { model: 'works-tape', x: 28, z: 1.4, solid: false },
      { model: 'works-sign', x: 28, z: 7.6, rot: 2, label: tr('Bientôt|Mini-CQC', 'Coming soon|Mini-CQC') },
      { model: 'tarp-crates', x: 26.6, z: 8.7 },
      { model: 'tarp-crates', x: 29.45, z: 8.7 },
      { model: 'works-tape', x: 28, z: 7.8, solid: false },
      { model: 'bench', x: 26, z: 3.9, label: 'teal' },
      { model: 'plant-tall', x: 30.4, z: 5.2 },
    ],
    lights: [
      [4.5, 4.5, '#4fd4ff', 6],
      [34.5, 4.5, '#ffa04a', 3.4],
      [37.2, 4.5, '#9fd8ff', 2.4],
      [13, 1.5, '#e8f6ff', 3.2],
      [18, 1.5, '#fff4e4', 3],
      [13, 8, '#ffe2b0', 3],
      [18.3, 7.6, '#ff4fd8', 2.6, 'neon'],
      [16.8, 7.2, '#39d0ff', 2],
      [20.6, 7.5, '#39d0ff', 2],
      [15, 4.5, '#ffffff', 2.5],
      // Coursive prolongée et projecteurs de chantier des pièces en travaux.
      [26, 4.5, '#ffffff', 2.2],
      [23, 1.2, '#e6fbff', 2.4],
      [21.3, 0.4, '#7dffa8', 1.2],
      [24.7, 0.5, '#bff6ff', 1.2],
      [28, 1.6, '#ffe7c2', 2.2],
      [23.3, 7.8, '#b06bff', 2.6],
      [28, 7.4, '#ffe7c2', 2.2],
    ],
  },

  // ======================================================== Pont supérieur : les quartiers
  {
    id: 1,
    name: tr('Pont supérieur', 'Upper deck'),
    theme: 'cozy',
    footsteps: 'soft',
    ambience: { sky: '#ffe6cc', ground: '#3a2a20', hemi: 1.3, sun: '#ffd9b0', sunIntensity: 1.9 },
    layout: SHIP_LAYOUTS['1'],
    rooms: {
      c: tr('Coursive', 'Corridor'),
      k: tr('Cabines d\'équipage', 'Crew cabins'),
      d: tr('Douches', 'Showers'),
      p: tr('Quartiers du commandant', 'Commander\'s quarters'),
      g: tr('Serre hydroponique', 'Hydroponics bay'),
      o: tr('Salon d\'écoute', 'Listening lounge'),
      n: tr('Cinéma', 'Cinema'),
      // Pièces des extensions des quartiers (cf. shared/cabin-wings.js).
      A: tr('Extension gauche', 'Left extension'),
      B: tr('Extension gauche', 'Left extension'),
      C: tr('Extension du milieu', 'Middle extension'),
      D: tr('Extension du milieu', 'Middle extension'),
      E: tr('Extension droite', 'Right extension'),
      F: tr('Extension droite', 'Right extension'),
    },
    windows: { c: 0, k: 0.3, d: 0.2, p: 0.6, g: 0.5, o: 1, n: 0 },
    // On baisse les lumières au cinéma, un peu au salon d'écoute.
    dim: { n: 0.45, o: 0.7 },
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

      // --- Salon d'écoute : casques, fauteuils face aux étoiles, les affiches des deux émissions ---
      { model: 'on-air-sign', x: 15.65, z: 1.05, rot: 1, solid: false },
      {
        model: 'podcast-poster', x: 17.2, z: 7.35, rot: 2, label: 'radio', solid: false,
        interact: tr(
          'Radio Dangereuse : le podcast Elite Dangerous de la communauté. Actus, débats et histoires de CMDR, à retrouver sur radio.elitedangereuse.fr.',
          'Radio Dangereuse: the community\'s Elite Dangerous podcast. News, debates and CMDR stories, on radio.elitedangereuse.fr.',
        ),
      },
      {
        model: 'podcast-poster', x: 15.65, z: 2.9, rot: 1, label: 'galeres', solid: false,
        interact: tr(
          'Les Galères Galactiques : une mini-fiction audio humoristique, où rien ne se passe jamais comme prévu dans l\'espace. Sur galeresgalactiques.fr.',
          'Galères Galactiques: a comedy audio mini-series where nothing in space ever goes to plan. On galeresgalactiques.fr.',
        ),
      },
      {
        model: 'headphone-rack', x: 15.65, z: 5.5, rot: 1, solid: false,
        interact: tr(
          'Casques d\'écoute : un pour Radio Dangereuse, un pour les Galères Galactiques, et un de rechange. Comète mâchouille les câbles.',
          'Headphones: one for Radio Dangereuse, one for Galères Galactiques, and a spare. Comète chews the cables.',
        ),
      },
      // Sous tout le salon, un grand tapis chaud ; les autres tapis sont posés dessus.
      { model: 'rug', x: 17.5, z: 3.6, label: 'cosy:3.6x5.7', solid: false },
      { model: 'armchair', x: 16.55, z: 1.3, rot: 2, label: 'terracotta', interact: tr('Fauteuil sous les hublots : un épisode, les étoiles, et plus rien d\'autre.', 'Armchair under the portholes: an episode, the stars, and nothing else.') },
      { model: 'armchair', x: 18.35, z: 1.3, rot: 2, label: 'teal' },
      { model: 'plant-tall', x: 19.35, z: 1.2 },
      // Le poste d'écoute, entre les deux fauteuils, contre la baie.
      {
        model: 'podcast-console', x: 17.45, z: 0.86, action: tr('Écouter', 'Listen'),
        interact: [
          tr(
            'Casque sur les oreilles : un épisode de Radio Dangereuse, le podcast Elite Dangerous. On en ressort avec trois idées de route et une envie d\'aller miner.',
            'Headphones on: an episode of Radio Dangereuse, the Elite Dangerous podcast. You come out with three route ideas and an urge to go mining.',
          ),
          tr(
            'Vous lancez les Galères Galactiques, la mini-fiction audio humoristique. À bord, rien ne se passe comme prévu, et on rit tout seul dans le salon.',
            'You play Galères Galactiques, the comedy audio mini-series. Aboard, nothing goes to plan, and you laugh alone in the lounge.',
          ),
          tr('Le vumètre danse. Quelqu\'un a laissé le volume sur 11.', 'The VU meter dances. Someone left the volume on 11.'),
        ],
      },
      { model: 'side-table', x: 19.1, z: 3 },
      { model: 'headphone-stand', x: 19.04, z: 2.96, y: 0.3125, label: 'orange', solid: false },
      { model: 'mug', x: 19.18, z: 3.1, y: 0.3125, solid: false },
      { model: 'rug-round', x: 17.65, z: 3.05, y: 0.012, solid: false },
      { model: 'floor-cushion', x: 17.2, z: 3.05, label: 'plum' },
      { model: 'floor-cushion', x: 18.15, z: 2.85, label: 'mustard' },
      {
        model: 'sofa', x: 16.3, z: 5.5, rot: 1, label: 'terracotta',
        interact: tr('Canapé du salon d\'écoute : on s\'y enfonce, casque sur les oreilles, face aux étoiles.', 'The listening lounge sofa: sink in, headphones on, facing the stars.'),
      },
      { model: 'coffee-table', x: 17.35, z: 5.5, rot: 1 },
      { model: 'beanbag', x: 18.5, z: 5, label: 'mustard' },
      { model: 'beanbag', x: 18.5, z: 6, label: 'rose' },
      // L'alcôve : un guéridon, un casque sur son pied, une lampe de papier.
      { model: 'side-table', x: 17.2, z: 7.05 },
      { model: 'headphone-stand', x: 17.14, z: 7.02, y: 0.3125, label: 'navy', solid: false },
      { model: 'candles', x: 17.3, z: 7.12, y: 0.3125, solid: false },
      { model: 'paper-lantern', x: 17.9, z: 7.1, label: 'tall' },

      // --- Cinéma : le grand écran au nord, quatre rangées face à lui, le projecteur au fond ---
      { model: 'rug', x: 24, z: 4.5, label: 'cinema:6.7x7.7', solid: false },
      {
        model: 'cinema-screen', x: 24.2, z: 0.65, action: tr('Regarder', 'Watch'),
        interact: [
          tr('Ce soir : la bande-annonce en boucle. Le film ? Prochainement. Comme toujours.', 'Tonight: the trailer, on a loop. The film? Coming soon. As always.'),
          tr('Le Cobra passe devant la géante gazeuse. Toute la salle retient son souffle.', 'The Cobra crosses the gas giant. The whole room holds its breath.'),
          tr('Quelqu\'un chuchote : « C\'est tourné dans Colonia, en vrai. »', 'Someone whispers: “They actually shot it in Colonia.”'),
        ],
      },
      { model: 'cinema-row', x: 24.2, z: 3.46, rot: 2 },
      { model: 'cinema-row', x: 24.2, z: 4.46, rot: 2 },
      { model: 'cinema-row', x: 24.2, z: 5.46, rot: 2 },
      { model: 'cinema-row', x: 24.2, z: 6.46, rot: 2 },
      { model: 'projection-chair', x: 26.65, z: 7.55, rot: 2, action: tr('Prendre la régie', 'Take the controls'),
        interact: tr('Fauteuil de diffusion : choisissez la séance pour tout le bord.', 'Projection chair: choose the screening for everyone aboard.') },
      // Le projecteur, perché au mur du fond : son faisceau file jusqu'à la toile.
      { model: 'film-projector', x: 24.2, z: 8.35, rot: 2, label: '7.62', solid: false },
      {
        model: 'popcorn-machine', x: 21.1, z: 7.8, rot: 1, action: tr('Se servir', 'Help yourself'),
        interact: [
          tr('Un cornet de pop-corn, bien beurré. Il en tombe la moitié entre les fauteuils.', 'A cone of popcorn, well buttered. Half of it ends up between the seats.'),
          tr('Pop-corn sucré-salé : le seul compromis accepté par tout l\'équipage.', 'Sweet and salty popcorn: the only compromise the whole crew accepts.'),
          tr('La machine claque et crépite. Comète regarde les grains sauter, fascinée.', 'The machine pops and crackles. Comète watches the kernels jump, spellbound.'),
        ],
      },
      { model: 'movie-poster', x: 20.65, z: 1.6, rot: 1, label: 'hutton', solid: false },
      { model: 'sconce', x: 20.65, z: 2.3, rot: 1, solid: false },
      { model: 'movie-poster', x: 20.65, z: 3.0, rot: 1, label: 'thargoid', solid: false },
      { model: 'exit-sign', x: 20.65, z: 5.9, rot: 1, solid: false },
      { model: 'sconce', x: 20.65, z: 6.6, rot: 1, solid: false },
      { model: 'movie-poster', x: 20.65, z: 7.35, rot: 1, label: 'jameson', solid: false },
      { model: 'sconce', x: 27.35, z: 2.3, rot: 3, solid: false },
      { model: 'sconce', x: 27.35, z: 6.6, rot: 3, solid: false },
    ],
    lights: [
      [12, 4.6, '#ffd9a8', 2],
      [9.6, 2, '#ffcf99', 2.2],
      [13.8, 2, '#e6f6ff', 2],
      [10.2, 8.4, '#ffc98f', 2.3],
      [6, 4.5, '#ffb3e6', 2.6],
      [17.4, 5.2, '#ffb36b', 1.9, 'fire'],
      [17.6, 2.2, '#ffc98a', 1.6],
      [24.2, 1.8, '#9fb8ff', 1.8, 'screen'],
      [21.4, 7.4, '#ffb45e', 0.9],
      [26.4, 5.4, '#ff9a5a', 0.5],
      // Les deux dernières lumières sont celles des objets de la cabine (Holo-Me, cheminée…).
    ],
  },
]
