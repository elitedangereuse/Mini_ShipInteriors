import type * as THREE from 'three'
import type { FloorFinish, StationModel, Theme } from './assets'
import type { ShipMapOptions } from '../shared/ship-map.js'
import type { ZoneKit } from './salvage/kit'
import type { GroundDef } from './base/kit'
import type { CabinDef } from './cabin/view'
import type { CustomModel } from './furniture'
import { tr } from './i18n'
import { BOARD_TABLES, SHIP_LAYOUTS, SPORT_COURTS } from '../shared/ship-layouts.js'
import { HOUSING_LEVEL, LANDING_ROOM, PLOT_DOOR, PLOT_ORIGIN, PLOT_ROOM } from '../shared/housing-plot.js'
import { PILOT_SEAT } from '../shared/systems.js'
import { FISHING_DOCK, FISHING_FEED, FISHING_POND } from '../shared/fishing.js'

/** Orientation en quarts de tour : 0 = face +z (sud), 1 = +x (est), 2 = -z (nord), 3 = -x (ouest). */
export type Rot = 0 | 1 | 2 | 3

export interface Prop {
  /** Modèle du kit Kenney, ou meuble fait main (cf. src/furniture/), ou objet déjà construit (`object`). */
  model: StationModel | CustomModel | 'prebuilt'
  /** Objet déjà construit (`model: 'prebuilt'`) : les conteneurs et le décor de la baie infestée. */
  object?: THREE.Object3D
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
  /** false : on ne s'y installe pas, même si le meuble a une place (les platines du DJ du Zorb). */
  seats?: false
  /** On y choisit la musique (le jukebox, cf. src/music.ts). */
  music?: boolean
  /**
   * Où l'on se tient pour agir sur un très grand meuble (le Krait du hangar) : son centre est hors
   * de portée de main. Par défaut, le centre du meuble.
   */
  reach?: { x: number; z: number }
}

/** Lumière : x, z, couleur, intensité, et au besoin sa façon de vaciller (néon fatigué, feu de cheminée). */
/**
 * Vacillement d'une lumière : néon fatigué, feu de cheminée ; ou lumière de soirée, qui bat au
 * tempo de la piste de danse (pulse), en changeant de couleur (disco) ; ou reflet de l'écran de
 * cinéma, qui suit les scènes du film (screen).
 */
export type Flicker = 'neon' | 'fire' | 'disco' | 'pulse' | 'screen'

/** Lumière : x, z, couleur, intensité, vacillement, et portée (7 par défaut ; les projecteurs de la baie portent plus loin). */
export type LightDef = [number, number, string, number, Flicker?, number?]

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
  /** Sol repeint par pièce, quel que soit le thème du pont (cf. floorFinishes dans assets.ts). */
  floorFinish?: Record<string, FloorFinish>
  /** Proportion de murs extérieurs percés d'un hublot, par pièce (défaut : 1/3). */
  windows?: Record<string, number>
  /**
   * Coins d'une pièce qui portent leur propre nom (tuiles comprises entre min et max) : la
   * Promenade, qui s'ouvre sur la coursive sans mur, n'est pas « la coursive ».
   */
  areas?: { name: string; minX: number; maxX: number; minZ: number; maxZ: number }[]
  /** Nom de l'étage de la mezzanine du pont (cf. MEZZANINES dans shared/ship-layouts.js). */
  mezzanine?: string
  /** Cloisons sans pilier (milieu de l'arête) : là où un meuble s'adosse au mur. */
  plainWalls?: { x: number; z: number }[]
  /** Verrières : par pièce, les côtés (0 nord, 1 est, 2 sud, 3 ouest) dont les murs extérieurs sont vitrés. */
  canopy?: Record<string, number[]>
  /**
   * Hangars ouverts sur l'espace : par pièce, les côtés (0 nord, 1 est, 2 sud, 3 ouest) dont le mur
   * extérieur est un bouclier bleu (cf. src/shield.ts) ; on n'y passe pas plus qu'à travers un mur.
   */
  shield?: Record<string, number[]>
  /**
   * Serres : pièces dont tous les murs extérieurs sont vitrés à la façon d'une serre (allège de
   * brique, montants blancs, verre à peine vert), comme leurs cloisons vitrées (cf. `glazed`), et
   * qui ont une verrière pour plafond (vue subjective).
   */
  greenhouse?: string[]
  /** Cloisons vitrées, comme les verrières : paires de pièces (deux lettres) dont le mur mitoyen est une vitre. */
  glazed?: string[]
  props: Prop[]
  /** La réserve en éclaire 8 à la fois, les plus proches du joueur (cf. applyLights dans main.ts). */
  lights: LightDef[]
  /**
   * Pièces tamisées : quand on y entre, la lumière d'ambiance du pont (ciel, soleil) descend à
   * cette fraction, en fondu (cf. main.ts).
   */
  dim?: Record<string, number>
  /** Salle des machines : centre du cœur du réacteur (ses tuyères, elles, sont sous tous les ponts). */
  engine?: { x: number; z: number }
  /**
   * Portes doubles, sur deux tuiles (deux battants, ouverture de 1,6) : la première arête (tuile et
   * bord, comme ShipMap.addDoor) ; la seconde est sa voisine le long du mur (x + 1 pour un bord
   * nord ou sud, z + 1 pour un bord est ou ouest). Les deux sont des portes du plan ('+').
   * `padded` : battants capitonnés de velours rouge (le cinéma).
   */
  doubleDoors?: { x: number; z: number; dir: number; padded?: boolean }[]
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
  /**
   * Baie infestée de la zone thargoïde (cf. src/salvage/) : son plan (murs du labyrinthe, portes
   * du sas), le kit de ses murs, sols et portes, et la couleur des projecteurs sur le sol des
   * zones éclairées (`glow`). Ni coque, ni ascenseur, ni tuyères.
   */
  zone?: { kit: ZoneKit; map: ShipMapOptions; glow?: (x: number, z: number) => string | null }
  /**
   * Base au sol (cf. src/base/) : un plateau à ciel ouvert, sans murs (le bord arrête les pas, ses
   * falaises plongent dans le vide), ni coque, ni ascenseur, ni tuyères, ni plafond.
   */
  ground?: GroundDef
  /**
   * Pont des quartiers (housing v2, cf. src/housing/) : le palier de l'ascenseur, et la parcelle du
   * joueur, une bulle sous champ de force construite à la volée (cf. Deck.setPlot). Pas de coque ni
   * de tuyères : la parcelle repose sur son socle.
   */
  bubble?: boolean
  /** Plan du pont : portes et pièces fermées, à la place de celles de shipMapOptions. */
  mapOptions?: ShipMapOptions
  /**
   * Conduits de ventilation (cf. src/vents.ts) : des gaines hors des ponts du vaisseau. Ni coque,
   * ni ascenseur, ni tuyères ; on n'y voit qu'autour de soi.
   */
  vents?: boolean
}

/** Écart vertical entre deux ponts. */
export const LEVEL_HEIGHT = 1.6

/** L'ascenseur est au même endroit sur chaque pont. */
export const LIFT = { x: 10, z: 5 }

/**
 * On se réveille dans ses quartiers, à deux pas du Holo-Me (cf. main.ts) ; à défaut, ici, à
 * l'entrée de sa parcelle (même valeur que dans server/relay.js).
 */
export const SPAWN = { level: HOUSING_LEVEL, x: PLOT_ORIGIN.x + 1, z: PLOT_DOOR.z }
/** Comète vit dans les quartiers, près de son panier (ou ici, s'il n'y en a pas). */
export const CAT_SPAWN = { level: HOUSING_LEVEL, x: PLOT_ORIGIN.x + 2, z: PLOT_DOOR.z + 2 }

/** Ce qu'on lit aux balises du bouclier du hangar. */
const SHIELD_TEXT = [
  tr('Le bouclier retient l\'air du hangar et laisse passer les vaisseaux. Les commandants, non : il ne vaut mieux pas essayer.', 'The shield keeps the hangar\'s air in and lets ships through. Commanders, no: better not try.'),
  tr('Derrière le champ de force, les étoiles. On sent un léger picotement au bout des doigts, et une odeur d\'ozone.', 'Beyond the force field, the stars. A faint tingle in your fingertips, and a smell of ozone.'),
]

/**
 * Pont des quartiers (cf. docs/housing-v2.md), au-dessus du pont supérieur : le palier
 * de l'ascenseur, et derrière sa porte, la parcelle de chacun (cf. shared/housing-plot.js).
 */
export const QUARTERS_DECK: LevelDef = {
  id: HOUSING_LEVEL,
  name: tr('Quartiers', 'Quarters'),
  theme: 'cozy',
  footsteps: 'soft',
  ambience: { sky: '#ffe6cc', ground: '#3a2a20', hemi: 1.3, sun: '#ffd9b0', sunIntensity: 1.9 },
  layout: SHIP_LAYOUTS[String(HOUSING_LEVEL) as '2'],
  rooms: {
    [LANDING_ROOM]: tr('Palier des quartiers', 'Quarters landing'),
    [PLOT_ROOM]: tr('Quartiers', 'Quarters'),
  },
  windows: { [LANDING_ROOM]: 0.5 },
  bubble: true,
  // La cabine de chaque joueur : sa parcelle, son entrée derrière la porte du palier (cf. src/housing/).
  cabin: { room: PLOT_ROOM, door: { x: PLOT_ORIGIN.x, z: PLOT_DOOR.z } },
  props: [
    { model: 'plant-tall', x: 8.25, z: 3.25 },
    { model: 'plant-tall', x: 8.25, z: 6.75 },
  ],
  lights: [[9.6, 5, '#ffe2bf', 1.6]],
}

export const LEVELS: LevelDef[] = [
  // ======================================================== Cale : minage, bricolage, réparation, un bar clandestin réservé à ses habitués, et une boîte de nuit d'aliens
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
      h: tr('Lobby de la zone thargoïde', 'Thargoid zone lobby'),
      t: tr('Poste de sécurité de la zone', 'Zone security post'),
      k: tr('Hangar', 'Hangar'),
      e: tr('Salle des machines', 'Engine room'),
      v: tr('Sanctuaire de la Voie', 'Sanctuary of the Path'),
      u: tr('Couloir de service', 'Service corridor'),
      // Le nom de la boîte de nuit ne se traduit pas.
      n: 'Le Zorb',
    },
    closed: {
      t: [
        tr('Poste de sécurité de la zone thargoïde : accès réservé au personnel. La porte ne s\'ouvre que de l\'intérieur, et Odile ne l\'ouvre jamais.', 'Thargoid zone security post: staff only. The door only opens from inside, and Odile never opens it.'),
        tr('Sur la porte, un autocollant : « Pour parler à la sécurité, utilisez l\'interphone. Pour le café, non. »', 'A sticker on the door: “To talk to security, use the intercom. For coffee, don\'t.”'),
      ],
      v: tr(
        'Une porte sans poignée, cachée derrière les machines. Sur le panneau, un symbole gravé : six pétales autour d’un hexagone. « Seuls les Adeptes peuvent trouver la Voie. » Terminez L’Épreuve de la Voie pour entrer.',
        'A door with no handle, hidden behind the machinery. A symbol is carved into the panel: six petals around a hexagon. “Only Adepts can find the Path.” Complete The Trial of the Path to enter.',
      ),
      // Chez Jacques : l'IA de la porte ne l'ouvre qu'aux habitués (cf. BAR_ROOM) ; les autres l'entendent
      // dire ceci. On ne devient habitué qu'en y entrant par les conduits de ventilation (cf. src/vents.ts).
      b: [
        tr('Un œil rouge s\'allume au-dessus de la porte. Une voix synthétique, polie et sans appel : « Seulement pour les habitués. »', 'A red eye lights up above the door. A synthetic voice, polite and final: “Regulars only.”'),
        tr('L\'IA de la porte : « Identification… Inconnu au comptoir. Seulement pour les habitués. » L\'œil rouge s\'éteint. La porte, elle, n\'a pas bougé.', 'The door AI: “Identifying… Not known at the counter. Regulars only.” The red eye goes dark. The door has not moved.'),
        tr('L\'IA de la porte : « Seulement pour les habitués. » Puis, plus bas : « Aucun d\'eux n\'est entré par ici la première fois. »', 'The door AI: “Regulars only.” Then, more quietly: “None of them came in this way the first time.”'),
      ],
      // Le Zorb : sa porte ne s'ouvre qu'aux aliens (cf. CLUB_ROOM) ; les autres lisent ceci.
      n: [
        tr('La porte vibre sous les basses. Le videur pose une main dessus, sans te regarder : « Soirée privée. Pas d\'humains. »', 'The door throbs with the bass. The bouncer rests a hand on it without looking at you: “Private party. No humans.”'),
        tr('Tu pousses la porte. Elle ne bouge pas. Le videur, lui, a bougé : il est maintenant entre elle et toi.', 'You push the door. It does not move. The bouncer did: he is now between it and you.'),
        tr('Sur la porte, un pictogramme : un humain, barré. En dessous, au feutre : « même déguisés » ; puis, d\'une autre écriture : « surtout mal déguisés ».', 'A pictogram on the door: a human, crossed out. Below, in marker: “even in disguise”; then, in another hand: “especially in a bad disguise”.'),
      ],
    },
    // Le bar est tenu plus proprement que le reste de la cale : dalles lisses, pas un hublot.
    floors: { u: 'floor-panel', a: 'floor-panel', j: 'floor-panel', r: 'floor-panel', m: 'floor-panel', g: 'floor-panel', h: 'floor-panel', k: 'floor-panel', t: 'floor-panel' },
    windows: { n: 0, u: 0, a: 0.1, j: 0, r: 0.12, m: 0, g: 0.1, b: 0, h: 0, e: 0, v: 0, k: 0.15, t: 0 },
    // Le poste de sécurité du lobby : des vitres blindées côté lobby (sa porte reste verrouillée).
    glazed: ['ht'],
    // Le hangar s'ouvre sur l'espace à la proue : son mur est est un bouclier (cf. src/shield.ts).
    shield: { k: [1] },
    // Et un sol d'acier brossé argenté, qui tranche avec l'acier noirci du reste de la cale.
    floorFinish: { k: 'silver' },
    // Du lobby de la zone thargoïde au hangar, une porte double (dans le mur est du lobby).
    doubleDoors: [{ x: 26, z: 4, dir: 3 }],
    // Le cœur du réacteur, au milieu de la salle des machines.
    engine: { x: 1.5, z: 5 },
    // Le sanctuaire de la Voie n'est éclairé que par ses flammes et son portail ; le Zorb, par sa
    // piste de danse ; son couloir, par deux néons.
    dim: { v: 0.5, n: 0.3, u: 0.6 },
    props: [
      // --- Sanctuaire de la Voie, caché derrière la salle des machines : d'après L'Épreuve, La
      // Cérémonie et Les Reliques de la Voie. On entre au nord ; le portail de Raxxla est au mur
      // ouest, gardé par l'Adepte Supérieur, l'emblème au sol devant lui. Ce qui compte est contre
      // les murs nord et ouest, ceux qu'on voit de la caméra ---
      { model: 'voie-floor', x: 2, z: 10, solid: false },
      { model: 'voie-drape', x: -0.35, z: 8.55, rot: 1, label: '1.7', solid: false },
      { model: 'voie-drape', x: 2, z: 12.35, rot: 2, label: '4.6', solid: false },
      { model: 'voie-drape', x: 4.35, z: 10, rot: 3, label: '4.6', solid: false },
      {
        model: 'raxxla-gate', x: -0.35, z: 10, rot: 1, action: tr('Contempler', 'Behold'),
        interact: [
          tr(
            'Le portail de Raxxla. Au fond du puits, des étoiles qui ne figurent sur aucune carte tournent, et tombent.',
            'The gate of Raxxla. Deep in the well, stars that appear on no map spin, and fall.',
          ),
          tr(
            'Au-dessus du portail : « Suis la Voie de Raxxla ». Tu tends la main : le vortex est froid, et il murmure ton nom.',
            'Above the gate: “Follow the Path of Raxxla”. You reach out: the vortex is cold, and it whispers your name.',
          ),
          tr(
            'Les Enfants de Raxxla le cherchaient dans les étoiles. La Voie l\'a trouvé ici, au fond de la cale. Du moins, c\'est ce qu\'on raconte.',
            'The Children of Raxxla searched the stars for it. The Path found it here, at the bottom of the hold. Or so they say.',
          ),
        ],
      },
      {
        model: 'chronicles-lectern', x: 0.7, z: 10, rot: 1, action: tr('Lire', 'Read'),
        interact: [
          tr(
            'Chroniques de la Voie : « Fondée dans l\'obscurité de l\'espace lointain, la Voie travaille depuis longtemps à éclairer la vérité sur les événements qui ont façonné la galaxie. »',
            'Chronicles of the Path: “Founded in the darkness of deep space, the Path has long worked to shed light on the events that shaped the galaxy.”',
          ),
          tr(
            'Chroniques de la Voie : « Le Guide voulut rejoindre The Dark Wheel. On le refusa, pour des raisons inconnues. Alors il fonda la Voie. »',
            'Chronicles of the Path: “The Guide sought to join The Dark Wheel. He was refused, for reasons unknown. So he founded the Path.”',
          ),
          tr(
            'Chroniques de la Voie : « Avec Salomé, pilote des Enfants de Raxxla, le Guide attira des adeptes parmi les pilotes désabusés de la galaxie. »',
            'Chronicles of the Path: “With Salomé, a pilot of the Children of Raxxla, the Guide drew followers from among the galaxy\'s disillusioned pilots.”',
          ),
          tr(
            'Chroniques de la Voie : « Que cachent les artefacts des systèmes aliens ? Que sait vraiment The Dark Wheel ? Et quelle est la véritable nature de Raxxla ? »',
            'Chronicles of the Path: “What lies behind the artefacts of the alien systems? What does The Dark Wheel really know? And what is the true nature of Raxxla?”',
          ),
          tr('« Ainsi la Voie poursuit sa quête… » La suite a été arrachée. Il reste une trace de doigt, verte.', '“And so the Path pursues its quest…” The rest has been torn out. A green fingerprint remains.'),
        ],
      },
      {
        model: 'salome-shrine', x: 0.8, z: 7.65, action: tr('Se recueillir', 'Pay respects'),
        interact: [
          tr(
            'Kahina Tijani Loren, dite Salomé. Sénatrice impériale, elle a tout quitté pour révéler une conspiration, et le groupe occulte qui en tirait les ficelles.',
            'Kahina Tijani Loren, known as Salomé. An Imperial senator, she left everything behind to expose a conspiracy, and the occult group pulling its strings.',
          ),
          tr('Les cierges de l\'icône ne s\'éteignent jamais. Personne ne se souvient de les avoir allumés.', 'The candles by the icon never go out. Nobody remembers lighting them.'),
          tr('Un mot glissé sous la rose : « Elle n\'est pas morte. Elle nous attend au bout de la Voie. »', 'A note slipped under the rose: “She is not dead. She is waiting for us at the end of the Path.”'),
          tr('Derrière le cadre, un petit bouton. Tu appuies. Rien ne se passe. Le cadeau n\'est pas celui que tu penses.', 'Behind the frame, a small button. You press it. Nothing happens. The gift is not the one you think.'),
        ],
      },
      {
        model: 'voie-terminal', x: -0.08, z: 11.25, rot: 1, action: tr('Consulter', 'Use'),
        interact: [
          tr(
            'Le terminal de l\'Épreuve. Un seul compte : adepte@voie. La commande « help » propose ls, cd, cat… et porte.',
            'The Trial terminal. A single account: adept@path. The “help” command lists ls, cd, cat… and door.',
          ),
          tr('Tu tapes « porte ». Le terminal répond : « La clé est vide. »', 'You type “door”. The terminal replies: “The key is empty.”'),
          tr('Tu tapes une clé au hasard. « Ta clé n\'ouvre pas la porte, cherche encore adepte. »', 'You type a random key. “Your key does not open the door, keep looking, adept.”'),
          tr('L\'écran se brouille une seconde. Un nom apparaît en blanc, puis s\'efface : KAHINA.', 'The screen glitches for a second. A name appears in white, then fades: KAHINA.'),
        ],
      },
      {
        model: 'voie-relic', x: 2.95, z: 7.87, label: 'shard',
        interact: [
          tr('Première Relique : un éclat de cristal vert, tiède au toucher. Il bat comme un cœur, très lentement.', 'First Relic: a shard of green crystal, warm to the touch. It beats like a heart, very slowly.'),
          tr('Sur la colonne : « Rassemble les trois Reliques de la Voie et trouve la sortie vers la Vérité. »', 'On the column: “Gather the three Relics of the Path and find the way out to the Truth.”'),
        ],
      },
      {
        model: 'voie-relic', x: 3.5, z: 7.87, label: 'medallion',
        interact: tr('Deuxième Relique : un médaillon hexagonal frappé de l\'emblème. Il est bien plus lourd qu\'il ne devrait.', 'Second Relic: a hexagonal medallion struck with the emblem. It is far heavier than it should be.'),
      },
      {
        model: 'voie-relic', x: 4.05, z: 7.87, label: 'eye',
        interact: tr('Troisième Relique : une sphère de néant cerclée de violet. Quand on la regarde, elle regarde aussi.', 'Third Relic: a sphere of nothingness ringed with violet. When you look at it, it looks back.'),
      },
      {
        model: 'voie-adept', x: 0.4, z: 9, rot: 1, action: tr('Parler', 'Talk'),
        interact: [
          tr('L\'Adepte Supérieur : « Bienvenue, Adepte. Tu es ici chez toi. »', 'The Superior Adept: “Welcome, Adept. You are at home here.”'),
          tr('L\'Adepte Supérieur : « Seuls les Adeptes peuvent trouver la Voie. Tu l\'as trouvée : ne t\'en égare pas. »', 'The Superior Adept: “Only Adepts can find the Path. You have found it: do not stray from it.”'),
          tr('L\'Adepte Supérieur : « Gloire à la Voie. » Il attend, immobile, que tu répondes la même chose.', 'The Superior Adept: “Glory to the Path.” He waits, motionless, for you to say it back.'),
          tr(
            'L\'Adepte Supérieur : « The Dark Wheel a fermé sa porte au Guide. Nous en avons ouvert une autre, et celle-là ne se referme pas. »',
            'The Superior Adept: “The Dark Wheel closed its door on the Guide. We opened another one, and this one does not close.”',
          ),
          tr('L\'Adepte Supérieur : « Pour capter le secret, cherche là où le son est roi. » Il ne dit pas de quel secret il parle.', 'The Superior Adept: “To capture the secret, look where sound is king.” He does not say which secret.'),
          tr('L\'Adepte Supérieur : « Que la lumière te guide, Adepte. o7 »', 'The Superior Adept: “May the light guide you, Adept. o7”'),
          tr('Sous la capuche, il n\'y a rien. Seulement deux lueurs vertes, qui te fixent sans ciller.', 'Under the hood there is nothing. Only two green lights, staring at you without blinking.'),
        ],
      },
      {
        model: 'adept-robes', x: 4.29, z: 8.9, rot: 3, solid: false,
        interact: tr(
          'Robes d\'adepte, vert-noir, galonnées d\'or. L\'une d\'elles est exactement à ta taille. Personne ne t\'a pourtant mesuré.',
          'Adept robes, green-black, trimmed with gold. One of them is exactly your size. Yet nobody ever measured you.',
        ),
      },
      {
        model: 'dark-wheel-dagger', x: 4.29, z: 11, rot: 3, solid: false,
        interact: tr(
          'La roue du Dark Wheel, clouée au mur par une dague et barrée de rouge. Ils ont refusé le Guide. La Voie n\'a pas oublié.',
          'The wheel of The Dark Wheel, nailed to the wall with a dagger and slashed in red. They turned the Guide away. The Path has not forgotten.',
        ),
      },
      { model: 'path-banner', x: -0.3, z: 8.55, rot: 1, solid: false, interact: tr('« Que la lumière te guide, Adepte o7. »', '“May the light guide you, Adept o7.”') },

      // --- Le Zorb, la boîte de nuit des aliens, au-dessus de la salle des machines : on y vient du
      // palier par le couloir de service. Le videur garde la porte (à l'ouest du couloir) et ne
      // laisse entrer que ceux qui portent une apparence d'alien (cf. CLUB_ROOM). Platines contre le
      // mur nord, piste au milieu : on y danse (cf. main.ts). Le videur, le DJ et les habitués sont
      // des personnages du Holo-Me (`label` : leur apparence), posés par src/club.ts ---
      { model: 'dance-floor', x: 1.5, z: 1.3, label: 'neon:2.5x1.75', solid: false, action: tr('Danser', 'Dance'), interact: tr('La piste du Zorb.', 'The Zorb dance floor.') },
      { model: 'disco-ball', x: 1.5, z: 1.3, solid: false },
      { model: 'dj-booth', x: 1.5, z: 0.02, seats: false, interact: tr('Les platines de DJ Glorp. Sur le disque de gauche : « Sewer Nightclub ». Sur celui de droite : le même, mais à l\'envers.', 'DJ Glorp\'s decks. On the left record: “Sewer Nightclub”. On the right one: the same, backwards.') },
      {
        model: 'club-dj', x: 1.5, z: -0.3, label: 'alien.male.e.violet', action: tr('Parler', 'Talk'),
        interact: [
          tr('DJ Glorp : « Zblorp ! » Il lève une main à trois doigts. La salle hurle.', 'DJ Glorp: “Zblorp!” He raises a three-fingered hand. The room roars.'),
          tr('DJ Glorp te tend un casque. Dedans, exactement la même musique, mais plus fort.', 'DJ Glorp hands you a headset. Inside, exactly the same music, only louder.'),
          tr('DJ Glorp : « Ce morceau ? Enregistré dans les égouts de Zorb Prime. L\'acoustique y est incroyable. »', 'DJ Glorp: “This track? Recorded in the sewers of Zorb Prime. The acoustics there are incredible.”'),
        ],
      },
      { model: 'speaker', x: -0.22, z: -0.2, rot: 0 },
      { model: 'speaker', x: 3.22, z: -0.2, rot: 0 },
      { model: 'laser', x: -0.22, z: -0.2, y: 0.58, label: 'green', solid: false },
      { model: 'laser', x: 3.22, z: -0.2, y: 0.58, label: 'rgb', solid: false },
      {
        model: 'club-dancer', x: 0.75, z: 0.95, label: 'alien.male.b.green', solid: false, action: tr('Parler', 'Talk'),
        interact: [
          tr('Le Zorblien te détaille de la tête aux pieds : « Jolies antennes. Elles sont vraies ? » Tu hoches la tête. Elles tiennent.', 'The Zorblian looks you up and down: “Nice antennae. Are they real?” You nod. They stay on.'),
          tr('« Tu viens d\'où ? » Tu réponds « de loin ». Il a l\'air de trouver ça très drôle.', '“Where are you from?” You say “far away”. He seems to find that hilarious.'),
        ],
      },
      {
        model: 'club-dancer', x: 2.3, z: 0.9, label: 'alien.female.d.blue', solid: false, action: tr('Parler', 'Talk'),
        interact: [
          tr('La Cryonienne danse sans s\'arrêter : « Trois jours que je suis là. Ou trois semaines. Le DJ n\'a pas changé de disque. »', 'The Cryonian keeps dancing: “I\'ve been here three days. Or three weeks. The DJ hasn\'t changed the record.”'),
          tr('« Les humains ? Jamais vu un seul ici. On dit qu\'ils dansent très mal. » Tu ralentis un peu.', '“Humans? Never seen one in here. They say they are terrible dancers.” You slow down a bit.'),
        ],
      },
      {
        model: 'club-dancer', x: 1.15, z: 1.85, label: 'alien.male.c.violet', solid: false, action: tr('Parler', 'Talk'),
        interact: [
          tr('Le Nébulien te crie à l\'oreille : « C\'EST MA CHANSON ! » C\'est la seule chanson.', 'The Nebulian shouts in your ear: “THIS IS MY SONG!” It is the only song.'),
          tr('« Le videur ? Un amour. Il a refoulé un Thargoïde la semaine dernière. Tenue incorrecte. »', '“The bouncer? A sweetheart. He turned a Thargoid away last week. Dress code.”'),
        ],
      },
      { model: 'club-dancer', x: 2.2, z: 1.9, label: 'alien.female.e.green', solid: false },
      { model: 'club-dancer', x: 0.2, z: 1.95, label: 'alien.female.a.violet', solid: false },
      // Le couloir : le videur à côté de la porte, l'enseigne au mur nord, le cordon de la file.
      { model: 'club-sign', x: 5.35, z: -0.36, solid: false },
      {
        // Ce qu'il dit à un alien ; à un humain, il répète ce qu'on lit sur la porte (cf. main.ts).
        model: 'club-bouncer', x: 4.2, z: 0.3, rot: 1, label: 'alien.male.a.green', action: tr('Parler au videur', 'Talk to the bouncer'),
        interact: [
          tr('Le videur baisse ses lunettes, compte tes antennes, hoche la tête : « Deux. C\'est bon. Entre. »', 'The bouncer lowers his shades, counts your antennae, nods: “Two. Fine. Go in.”'),
          tr('Le videur : « Bonne soirée. Si tu vois un humain à l\'intérieur, tu me le signales. Ils se déguisent, maintenant. »', 'The bouncer: “Have a good night. If you see a human inside, tell me. They wear disguises now.”'),
          tr('Le videur te renifle longuement. « Tu sens le Holo-Me. » Un silence. « Comme tout le monde ici. Entre. »', 'The bouncer sniffs you for a long time. “You smell of Holo-Me.” A pause. “Like everyone here. Go in.”'),
        ],
      },
      { model: 'club-rope', x: 5.6, z: 0.5, label: '1.6' },
      { model: 'crate', x: 6.15, z: -0.1 },
      { model: 'cables', x: 8.2, z: 1, solid: false },
      { model: 'stain', x: 6.9, z: 1.1, solid: false },

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

      // --- Salle des machines, derrière l'atelier : le réacteur au centre, le FSD au nord ---
      {
        model: 'fsd', x: 1.3, z: 3, rot: 0,
        interact: tr(
          'Réacteur FSD 5A, modifié par Felicity Farseer (portée augmentée). Ne pas toucher pendant la charge.',
          '5A frame shift drive, engineered by Felicity Farseer (increased range). Do not touch while charging.',
        ),
      },
      {
        model: 'computer-system', x: 0, z: 4.2, rot: 1,
        interact: tr(
          'Distributeur d\'énergie : 4 pips aux systèmes, 2 aux moteurs, 0 aux armes. Vaisseau pacifiste.',
          'Power distributor: 4 pips to systems, 2 to engines, 0 to weapons. A pacifist ship.',
        ),
      },
      {
        model: 'computer-system', x: 0, z: 5.8, rot: 1,
        interact: tr('Support vital : oxygène 100 %. Filtres à remplacer dans 42 jours.', 'Life support: oxygen 100%. Filters due for replacement in 42 days.'),
      },
      {
        model: 'container-tall', x: 0, z: 7,
        interact: tr(
          'Réservoir : 32 t d\'hydrogène. Pour le plein, écoper une étoile K, G, B, F, O, A ou M.',
          'Fuel tank: 32 t of hydrogen. To refuel, scoop a K, G, B, F, O, A or M star.',
        ),
      },
      { model: 'container-wide', x: 1.4, z: 7.05 },
      { model: 'container-tall', x: 3, z: 3 },
      { model: 'pipe-ring-colored', x: 2.8, z: 7.25 },
      { model: 'structure-panel', x: 1.5, z: 6.4, y: 0.005, solid: false },

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
        model: 'welder', x: 4.2, z: 6.1, rot: 1,
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

      // --- Lobby de la zone thargoïde (SOC-06) : on y forme son équipe au terminal, on suit les
      // coéquipiers sur les caméras, et la porte blindée, au fond de l'alcôve nord, mène à la baie
      // infestée. Derrière les vitres du poste de sécurité (au nord-ouest), Odile, la contrôleuse
      // de la zone (cf. src/salvage/controller.ts), devant le mur des caméras de la baie ; on lui
      // parle à l'interphone. Au sud, la table de briefing (le plan de la baie) et le vestiaire ---
      {
        model: 'salvage-terminal', x: 22.6, z: 4.4, action: tr('Préparer une mission', 'Prepare a mission'),
        interact: tr('Terminal de mission : récupération de cargaison en zone thargoïde.', 'Mission terminal: cargo recovery in a Thargoid zone.'),
      },
      // Le poste de sécurité : les écrans de la baie au mur, le bureau d'Odile, ses classeurs.
      { model: 'surveillance-wall', x: 21, z: -0.16, solid: false },
      { model: 'security-desk', x: 21, z: 1.12 },
      { model: 'k-side-table-drawers', x: 19.85, z: 1.15, rot: 1 },
      { model: 'k-potted-plant', x: 22.2, z: -0.15 },
      { model: 'intercom', x: 21.75, z: 1.78, solid: false },
      // L'alcôve : la porte blindée, sa zone de dépôt, le portique de décontamination.
      { model: 'blast-door', x: 24, z: -0.46, solid: false, interact: tr(
        'La porte blindée ne s\'ouvre qu\'au départ d\'une mission. Derrière, on entend gratter.',
        'The blast door only opens when a mission starts. Something is scratching on the other side.',
      ) },
      { model: 'drop-zone', x: 24, z: 0.55, solid: false },
      { model: 'bio-sign', x: 25.15, z: -0.44, solid: false, interact: tr(
        '« Contamination caustique. Tout colis rapporté passe au scanner avant de quitter le sas. »',
        '“Caustic contamination. Every recovered crate is scanned before it leaves the airlock.”',
      ) },
      { model: 'decon-arch', x: 24, z: 1.55, solid: false, interact: tr(
        'Portique de décontamination : il balaie tout ce qui revient de la baie. Il a déjà sonné pour une chaussette.',
        'Decontamination gate: it scans everything coming back from the bay. It once went off for a sock.',
      ) },
      // Le mur ouest : le classement, les caméras pour suivre son équipe, le vestiaire.
      { model: 'salvage-board', x: 19.68, z: 3.2, rot: 1, action: tr('Classement', 'Leaderboard') },
      {
        model: 'surveillance-wall', x: 19.62, z: 7, rot: 1, action: tr('Caméras', 'Cameras'),
        interact: [
          tr('Dix caméras dans la baie de stockage. Sur la trois, quelque chose vient de passer. Ou pas.', 'Ten cameras in the storage bay. On number three, something just walked past. Or not.'),
          tr('Les caméras filment la baie infestée. En mission, elles suivent l\'équipe.', 'The cameras watch the infested bay. During a mission, they follow the crew.'),
        ],
      },
      { model: 'locker-row', x: 19.8, z: 9.3, rot: 1, interact: tr(
        'Vestiaire du sas : combinaisons, lampes frontales, et un mot scotché : « Dans la baie, ne restez jamais plus de vingt secondes dans un casier. »',
        'Airlock locker room: suits, head torches, and a taped note: “In the bay, never stay in a locker for more than twenty seconds.”',
      ) },
      // La table de briefing, et ce qui traîne au sud.
      { model: 'bay-holo', x: 22.9, z: 8.2, action: tr('Étudier le plan', 'Study the map'), interact: [
        tr('Le plan de la baie 7. Au nord, le hall de fret et sa passerelle, les bureaux, la serre (violette : éclairée). La grande allée la traverse d\'ouest en est.', 'The map of bay 7. North: the freight hall and its catwalk, the offices, the hydroponics (purple: lit). The main avenue crosses it west to east.'),
        tr('Au milieu, la salle des machines, l\'aire de stockage et le nid, en vert. Au sud, le quai de chargement éclairé, le sas d\'extraction, et la zone effondrée.', 'In the middle, the machine room, the storage yard and the nest, in green. South, the lit loading dock, the extraction airlock, and the collapsed zone.'),
        tr('Un écho rouge tourne autour du nid. La légende dit « échos simulés ». La légende ment peut-être.', 'A red echo circles the nest. The legend says “simulated echoes”. The legend may be lying.'),
      ] },
      { model: 'flare-crate', x: 24.95, z: 10.05, interact: tr(
        'Des fusées d\'appel rouges. Lancées dans la baie, elles attirent ce qui y rôde pendant quelques secondes.',
        'Red decoy flares. Thrown in the bay, they draw whatever prowls there for a few seconds.',
      ) },
      { model: 'dock-marking', x: 22.9, z: 8.2, label: '2.4,1.7', solid: false },
      { model: 'k-low-bench', x: 20.65, z: 9.3, rot: 1 },
      { model: 'drums', x: 25.05, z: 9.15 },
      { model: 'cables', x: 21.3, z: 6, solid: false },
      { model: 'crate', x: 20.3, z: 10.1 },

      // --- Hangar, derrière le lobby de la zone thargoïde : le Krait Mk II sur son pad, nez vers le
      // bouclier (à l\'est). Au nord, l\'atelier de Nico, le mécano (cf. src/mechanic.ts) ; au sud,
      // le ravitaillement et le chariot à outils ; à l\'est, l\'escabeau du cockpit et le pupitre du
      // hangar. Les postes de sa tournée, et les obstacles de ses trajets, sont dans
      // shared/mechanic.js : à tenir à jour si l\'on déplace un meuble ici.
      { model: 'hangar-pad', x: 31.4, z: 5, rot: 1, label: '7', solid: false },
      // Gyrophares aux coins du carré peint du pad : franchissables, comme les balises du bouclier
      // (posés entre deux centres de tuiles, ils arrêteraient un joueur en chemin).
      { model: 'hangar-beacon', x: 28.05, z: 1.65, solid: false },
      { model: 'hangar-beacon', x: 34.75, z: 1.65, solid: false },
      { model: 'hangar-beacon', x: 28.05, z: 8.35, solid: false },
      { model: 'hangar-beacon', x: 34.75, z: 8.35, solid: false },
      {
        model: 'krait-mk2', x: 31.4, z: 5, rot: 1, reach: { x: 31.4, z: 8.5 },
        interact: [
          tr(
            'Krait Mk II de Faulcon DeLacy : un delta de soixante-treize mètres, trois places, un hangar à chasseur. Nico l\'appelle « la Princesse ».',
            'Faulcon DeLacy Krait Mk II: a seventy-three-metre delta, three seats, a fighter bay. Nico calls her “the Princess”.',
          ),
          tr(
            'La coque est encore tiède, les tuyères couvent. Sur le bord d\'attaque, gravé au tournevis : « Rayé = mort. Nico ».',
            'The hull is still warm, the thrusters glowing. Scratched into the leading edge with a screwdriver: “Scratch it = dead. Nico”.',
          ),
          tr(
            'Une étiquette sur le train avant : « NE PAS TOUCHER. JE SAIS QUE C\'EST TOI. » Tu retires ta main.',
            'A label on the nose gear: “DO NOT TOUCH. I KNOW IT\'S YOU.” You take your hand back.',
          ),
        ],
      },
      // Solide : on ne le traverse pas, on monte ses marches pour aller au cockpit (cf. SEATS).
      { model: 'krait-ladder', x: 35.15, z: 5, rot: 3 },
      { model: 'gear-chock', x: 30.45, z: 1.62, solid: false, label: 'port', interact: tr(
        'Les cales du train bâbord, peintes en jaune. Quelqu\'un a écrit dessus au feutre : « À RETIRER AVANT LE DÉCOLLAGE (OUI, TOI) ».',
        'The port gear chocks, painted yellow. Someone wrote on them in marker: “REMOVE BEFORE TAKE-OFF (YES, YOU)”.',
      ) },
      { model: 'gear-chock', x: 30.45, z: 8.38, rot: 2, solid: false, label: 'starboard', interact: tr(
        'Les cales du train tribord. Une clé traîne à côté : Nico la cherche depuis ce matin.',
        'The starboard gear chocks. A spanner lies next to them: Nico has been looking for it all morning.',
      ) },
      { model: 'workbench', x: 27.9, z: 0.05, interact: tr(
        'L\'établi de Nico : un démarreur de propulseur en pièces, trois tournevis, et un dessin du Krait scotché, avec des cœurs.',
        'Nico\'s workbench: a thruster starter in pieces, three screwdrivers, and a taped drawing of the Krait, with hearts.',
      ) },
      { model: 'tool-rack', x: 29.5, z: -0.15 },
      { model: 'hangar-sign', x: 31, z: -0.35, solid: false },
      { model: 'parts-rack', x: 32.6, z: -0.1, interact: tr(
        'Joints de tuyère, bobines de câble, une tuyère de rechange. Sur l\'étiquette : « Tout est compté. Boulon compte. »',
        'Thruster seals, cable reels, a spare nozzle. The label says: “Everything is counted. Bolt counts.”',
      ) },
      { model: 'welder', x: 34.4, z: 0.15, interact: tr(
        'Le poste de soudure de Nico. Sur le masque, un autocollant : « Je ne suis pas en colère, je soude. »',
        'Nico\'s welding station. A sticker on the mask: “I\'m not angry, I\'m welding.”',
      ) },
      {
        // On y demande une révision du Krait à Nico (cf. src/hangar.ts).
        model: 'hangar-console', x: 37, z: 1, rot: 3, action: tr('Demander une révision', 'Ask for a service job'),
        interact: tr('Pupitre du hangar : carburant 100 %, bouclier actif, pad verrouillé. Autorisation de décollage : refusée (« demandez à Nico »).', 'Hangar console: fuel 100%, shield active, pad locked. Launch clearance: denied (“ask Nico”).'),
      },
      { model: 'shield-beacon', x: 37.05, z: 3.2, solid: false, interact: SHIELD_TEXT },
      { model: 'shield-beacon', x: 37.05, z: 6.8, solid: false, interact: SHIELD_TEXT },
      { model: 'thruster-stand', x: 26.75, z: 8.3, interact: tr(
        'Une tuyère de rechange de Krait sur son berceau. Étiquette : « Pour la Princesse. Ne pas vendre. Ne PAS vendre. »',
        'A spare Krait thruster on its cradle. The label says: “For the Princess. Do not sell. Do NOT sell.”',
      ) },
      { model: 'work-lamp', x: 26.4, z: 2.6, rot: 1 },
      { model: 'cables', x: 27.2, z: 6.4, rot: 1, solid: false },
      { model: 'tool-cart', x: 28.6, z: 9.25, interact: tr(
        'Le chariot à outils de Nico : chaque tiroir a son étiquette, et aucune n\'est la bonne.',
        'Nico\'s tool cart: every drawer has a label, and none of them is right.',
      ) },
      { model: 'fuel-station', x: 32.4, z: 10.1, rot: 2, label: '1,3.2', interact: tr(
        'Station de ravitaillement : hydrogène raffiné, qualité Fleet Carrier. Le tuyau court jusque sous l\'aile du Krait.',
        'Fuel station: refined hydrogen, Fleet Carrier grade. The hose runs all the way under the Krait\'s wing.',
      ) },
      { model: 'crate', x: 36.85, z: 9.85 },
      { model: 'crate', x: 36.85, z: 9.85, y: 0.4 },
      { model: 'crate', x: 36.3, z: 9.95 },
    ],
    lights: [
      [1.5, 5, '#4fd4ff', 4],
      // Le Zorb : la piste, les platines ; dans le couloir, l'enseigne et un néon fatigué.
      [1.5, 1.3, '#b04cff', 3.2, 'disco'],
      [1.5, -0.1, '#39ff9a', 1.8, 'pulse'],
      [4.3, 0.4, '#ff3df0', 2, 'neon'],
      [8.5, 1, '#ffa24a', 1.6, 'neon'],
      // Sanctuaire de la Voie : le portail, les bougies autour de l'emblème, les cierges de Salomé, les Reliques.
      [0.3, 10, '#3dffb0', 2.8],
      [2, 10, '#b8ffd9', 2, 'fire'],
      [0.85, 8.2, '#ffb45e', 1.5, 'fire'],
      [3.5, 8.3, '#8a5cff', 1.6],
      [5.6, 3.1, '#ffb35c', 3],
      [5.6, 6.3, '#ffa24a', 2.4, 'neon'],
      [10, 5, '#ffd9a0', 1.6],
      [14.3, 2.3, '#fff0d8', 3.2],
      [14.3, 6.9, '#ff7a2a', 3, 'fire'],
      [17.9, 4.6, '#ffb060', 2.2, 'neon'],
      [12.4, 9.7, '#ffb45e', 3.4],
      [14.2, 11.8, '#ff9f5a', 3, 'fire'],
      // Lobby de la zone thargoïde : lumière froide, gyrophare de la porte blindée, écrans verts
      // des caméras, le bleu du poste de sécurité, la table de briefing, le portique.
      [22.6, 4.6, '#cfe6ff', 2.4],
      [24.2, 0.4, '#ff3b2f', 2.2, 'neon'],
      [20.4, 7, '#6dff9a', 1.3],
      [21, 0.4, '#8fd0ff', 1.8],
      [22.9, 8.2, '#5fd4ff', 1.6],
      [21.6, 9.6, '#ffd9a0', 1.2, 'neon'],
      [24, 1.6, '#6dff9a', 1],
      // Hangar : projecteurs blancs aux quatre coins du pad, lueur bleue du bouclier, soudure.
      [28.5, 1.4, '#e6f0ff', 2.6],
      [34.3, 1.4, '#e6f0ff', 2.6],
      [28.5, 8.6, '#e6f0ff', 2.6],
      [34.3, 8.6, '#e6f0ff', 2.6],
      [36.8, 5, '#3fa8ff', 3],
      [34.4, 0.7, '#ffb45e', 1.2, 'neon'],
    ],
  },

  // ======================================================== Pont principal
  {
    id: 0,
    name: tr('Pont principal', 'Main deck'),
    layout: SHIP_LAYOUTS['0'],
    rooms: {
      e: tr('Salle commune', 'Common room'),
      c: tr('Coursive', 'Corridor'),
      q: tr('Infirmerie', 'Medical bay'),
      r: tr('Salle de sport', 'Gym'),
      m: 'Mess',
      s: tr('Salon d\'arcade', 'Arcade lounge'),
      b: tr('Poste de pilotage', 'Cockpit'),
      l: tr('Labo du L.J.P.C.', 'L.J.P.C. lab'),
    },
    closed: {
      l: tr('Accès réservé aux membres du L.J.P.C. Terminez l’aventure « Connais ton ennemi » pour entrer.', 'Access reserved for L.J.P.C. members. Complete the “Know Your Enemy” adventure to enter.'),
    },
    areas: [{ name: tr('Promenade', 'Promenade deck'), minX: 26, maxX: 30, minZ: 0, maxZ: 9 }],
    // L'étage de la salle commune (cf. MEZZANINES).
    mezzanine: tr('Mezzanine de la salle commune', 'Common room mezzanine'),
    floors: { c: 'floor-panel', b: 'floor-detail', l: 'floor-panel' },
    // Le poste de pilotage et la Promenade sont vitrés sur l'espace ; le hall de la salle commune
    // aussi, au nord et au sud (la mezzanine, à la poupe, a ses grandes baies).
    canopy: { b: [0, 1, 2], c: [0, 1, 2], e: [0, 2] },
    // Le poste de pilotage et la salle commune s'ouvrent sur la coursive par une porte double,
    // sur ses deux tuiles.
    doubleDoors: [{ x: 31, z: 4, dir: 1 }, { x: 8, z: 4, dir: 1 }],
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
        model: 'pilot-seat', x: PILOT_SEAT.x, z: PILOT_SEAT.z, rot: 1,
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

      // --- Salle commune, à la poupe : le hall du vaisseau, comme le concourse d'une station
      // Coriolis. Au milieu, l'îlot du hall (banquette ronde, plantes, le monument du vaisseau) ;
      // au nord et au sud, face à face, les comptoirs de l'officier de liaison et de la
      // scientifique du LJPC ; dans l'axe des portes, la façade de la mezzanine, son tableau
      // d'honneur, et ses deux volées d'escalier. À l'étage, sous les grandes baies : le jukebox,
      // deux salons qui donnent sur le hall, des plantes (cf. MEZZANINES). ---
      {
        model: 'concourse-planter', x: 5.75, z: 4.5,
        interact: tr(
          'L\'îlot du hall : des fougères, des buissons fleuris, et au-dessus des têtes, le blason du vaisseau en lévitation : « MINI SHIP INTERIORS ». Quelqu\'un a collé une gommette « vous êtes ici » sur le petit vaisseau entre les ailes.',
          'The hall island: ferns, flowering shrubs, and above everyone\'s heads, the ship\'s crest hovering in mid-air: “MINI SHIP INTERIORS”. Someone has stuck a “you are here” sticker on the little ship between the wings.',
        ),
      },
      { model: 'reward-counter', x: 5.9, z: 0.35, label: 'weekly', interact: tr('Officier de liaison · Weekly', 'Liaison officer · Weekly'), action: tr('Récupérer les crédits', 'Collect credits') },
      { model: 'reward-counter', x: 5.9, z: 8.65, rot: 2, label: 'hunt', interact: tr('Scientifique du LJPC · Chasse galactique', 'LJPC scientist · Galactic Hunt'), action: tr('Récupérer les crédits', 'Collect credits') },
      // Le tableau d'honneur de l'équipage, sur la façade de la mezzanine, face aux portes.
      { model: 'employee-board', x: 2.57, z: 4.5, y: -0.53, rot: 1, solid: false, interact: tr('Tableau d’honneur', 'Hall of honour'), action: tr('Consulter les classements', 'View rankings') },
      // Deux canapés tournés vers l'îlot, adossés aux escaliers.
      {
        model: 'sofa', x: 4.17, z: 1.95, rot: 1, label: 'teal',
        interact: tr('Canapé du hall : on s\'y retrouve entre deux missions, et on refait la galaxie.', 'Hall sofa: where the crew meets between missions to put the galaxy to rights.'),
      },
      { model: 'sofa', x: 4.17, z: 7.05, rot: 1, label: 'terracotta' },
      // Des plantes partout : aux coins, de part et d'autre des portes.
      { model: 'monstera', x: 4.1, z: 0.05 },
      { model: 'plant-tall', x: 7.3, z: 1.05 },
      { model: 'plant-tall', x: 8.05, z: 2.85 },
      { model: 'plant-tall', x: 8.05, z: 6.75 },
      { model: 'plant-tall', x: 7.95, z: 7.95 },
      { model: 'monstera', x: 4.1, z: 8.95 },
      { model: 'plant', x: 7.1, z: 0.0 },
      { model: 'plant', x: 7.1, z: 9.0 },

      // À l'étage : le jukebox au milieu des baies (tout le pont l'entend, cf. src/music.ts), deux
      // salons de part et d'autre, tournés vers le hall, et des plantes aux paliers.
      { model: 'jukebox', x: -0.17, z: 4.5, rot: 1, action: tr('Choisir un morceau', 'Pick a song'), music: true },
      { model: 'rug-round', x: 1.05, z: 4.5, solid: false },
      { model: 'plant-tall', x: -0.08, z: 3.62 },
      { model: 'plant-tall', x: -0.08, z: 5.38 },
      { model: 'sofa', x: 0.0, z: 2.35, rot: 1, label: 'mustard', interact: tr('Le salon de la mezzanine : d\'ici, on voit tout le hall, et derrière soi, toute la galaxie.', 'The mezzanine lounge: from here you can see the whole hall, and behind you, the whole galaxy.') },
      { model: 'coffee-table', x: 1.3, z: 2.35, rot: 1 },
      { model: 'sofa', x: 0.0, z: 6.65, rot: 1, label: 'navy' },
      { model: 'coffee-table', x: 1.3, z: 6.65, rot: 1 },
      { model: 'bookshelf', x: 2.0, z: -0.2, interact: tr('Bibliothèque commune : guides de minage, romans de Drew Wagar, et un manuel du Cobra annoté au crayon.', 'Shared bookshelf: mining guides, Drew Wagar novels, and a Cobra manual annotated in pencil.') },
      { model: 'monstera', x: 1.1, z: 1.1 },
      { model: 'floor-lamp', x: 0.05, z: 1.55 },
      { model: 'monstera', x: 1.1, z: 7.9 },
      { model: 'floor-lamp', x: 0.05, z: 7.45 },
      { model: 'beanbag', x: 2.1, z: 8.95, label: 'rose' },
      { model: 'beanbag', x: 2.95, z: 9.05, label: 'teal' },

      // --- Infirmerie : le domaine de Betty (cf. src/nurse.ts). Trois lits en box le long du mur
      // nord (on s'y allonge, et Betty vient en consultation, cf. src/infirmary.ts), le scanner, le
      // frigo à vaccins et le négatoscope ; le poste de soins au sud-ouest, face aux lits ; la
      // pharmacie et l'échelle d'acuité au mur ouest ; la salle d'attente près de la porte ; la
      // quarantaine, le défibrillateur, le lavabo et le fauteuil roulant à l'est. L'allée du milieu
      // (z ≈ 1,2 à 2,3) reste libre : c'est là que passe Betty (cf. shared/nurse.js). ---
      ...[9.2, 10.5, 11.8].map((x): Prop => ({ model: 'med-bed', x, z: 0.3, label: 'left' })),
      ...[9.85, 11.15].map((x): Prop => ({ model: 'med-curtain', x, z: 0, solid: false })),
      ...[9.65, 10.95, 12.25].map((x): Prop => ({ model: 'iv-stand', x, z: -0.12 })),
      {
        model: 'body-scan', x: 13.2, z: 0.4,
        interact: tr(
          'Scanner médical : constantes de l\'équipage normales. Le chat est en léger surpoids.',
          'Medical scanner: crew vital signs normal. The cat is slightly overweight.',
        ),
      },
      {
        model: 'med-fridge', x: 14.25, z: -0.12,
        interact: tr(
          'Réfrigérateur à vaccins, +4 °C : antidote au venin de Thargoïde (expérimental), vaccin contre la grippe de Lave, et le yaourt de Betty. Surtout, ne touchez pas au yaourt de Betty.',
          'Vaccine fridge, +4 °C: Thargoid venom antidote (experimental), Lave flu vaccine, and Betty\'s yoghurt. Whatever you do, don\'t touch Betty\'s yoghurt.',
        ),
      },
      {
        model: 'xray-board', x: 14.95, z: -0.35, solid: false,
        interact: [
          tr('Radio du thorax : RAS. Le commentaire au feutre dit « joli sternum ».', 'Chest X-ray: all clear. The marker note says “nice sternum”.'),
          tr('Radio de l\'abdomen : un limpet de collecte. Le patient jure qu\'il ne sait pas comment c\'est arrivé là.', 'Abdominal X-ray: a collector limpet. The patient swears he has no idea how it got there.'),
        ],
      },
      {
        model: 'med-cabinet', x: 8.82, z: 1.3, rot: 1,
        interact: tr(
          'Armoire à pharmacie : trousses de soin, cellules d\'énergie et pansements Pioneer Supplies.',
          'Medicine cabinet: medkits, energy cells and Pioneer Supplies plasters.',
        ),
      },
      {
        model: 'eye-chart', x: 8.65, z: 2.1, rot: 1, solid: false,
        interact: tr('Échelle d\'acuité : dernière ligne, « o7 o7 ». Si vous la lisez, vous êtes pilote de chasse.', 'Eye chart: bottom line, “o7 o7”. If you can read it, you\'re a fighter pilot.'),
      },
      { model: 'med-poster', x: 8.65, z: 2.75, rot: 1, solid: false },
      {
        model: 'nurse-station', x: 9.6, z: 2.6, rot: 2,
        interact: [
          tr('Poste de soins de Betty : un bocal de sucettes « pour les courageux », et des roses. Personne ne sait qui les envoie.', 'Betty\'s nurses\' station: a jar of lollipops “for the brave”, and roses. Nobody knows who sends them.'),
          tr('Sur le dossier du dessus : « Sergent Rourke — 3e visite cette semaine. Toujours rien. »', 'On the top file: “Sergeant Rourke — 3rd visit this week. Still nothing wrong.”'),
          tr('Une tasse de café marquée de rouge à lèvres. Et un mot : « Ne pas sonner pour rien. Sauf si vous êtes mignon. »', 'A coffee mug with a lipstick mark. And a note: “Don\'t ring for nothing. Unless you\'re cute.”'),
        ],
      },
      // Salle d'attente.
      { model: 'chair', x: 11, z: 3.05, rot: 2 },
      { model: 'chair', x: 11.55, z: 3.05, rot: 2 },
      {
        model: 'med-scale', x: 12.25, z: 3.15, rot: 2,
        interact: [
          tr('Pèse-personne : 72 kg, dont 3 de café.', 'Scales: 72 kg, 3 of which are coffee.'),
          tr('Toise : 1,75 m. Sous 0,8 g, vous avez gagné deux centimètres.', 'Height gauge: 1.75 m. At 0.8 g, you\'ve gained two centimetres.'),
        ],
      },
      {
        model: 'med-sink', x: 14, z: 3.35, rot: 2,
        interact: tr('Lavabo chirurgical : savon, gel, gants. Betty vérifie. Betty vérifie toujours.', 'Surgical sink: soap, gel, gloves. Betty checks. Betty always checks.'),
      },
      { model: 'wheelchair', x: 14.85, z: 2.95, rot: 3, interact: tr('Fauteuil roulant. Quelqu\'un a peint des flammes sur les roues.', 'Wheelchair. Someone has painted flames on the wheels.') },
      {
        model: 'sample-tank', x: 15.05, z: 1.35,
        interact: tr('Quarantaine : Bacterium Aurasus. Il bouge quand on ne le regarde pas.', 'Quarantine: Bacterium Aurasus. It moves when nobody is looking.'),
      },
      {
        model: 'defibrillator', x: 15.35, z: 2.2, rot: 3, solid: false,
        interact: tr('Défibrillateur. Betty dit qu\'elle n\'en a jamais eu besoin : elle a un meilleur effet sur les cœurs.', 'Defibrillator. Betty says she has never needed it: she has a better effect on hearts.'),
      },

      // --- Salle de sport ---
      // Au mur nord : les records des trois appareils (cf. src/gym.ts).
      { model: 'score-board', x: 18.7, z: -0.35, label: 'gym', solid: false, interact: tr('Records de la salle de sport', 'Gym records'), action: tr('Consulter les records', 'View records') },
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

      // --- Mess : un self. Au nord, la salle et ses deux tables de cantine ; le comptoir la traverse
      // d'ouest en est (plateaux, bain-marie, passe du chef, desserts, boissons) ; derrière, la
      // cuisine de Marcel (cf. chef.ts), où l'on entre par le passage à l'est du comptoir. ---
      { model: 'canteen-table', x: 10.2, z: 7.45, label: '1' },
      { model: 'canteen-table', x: 13.8, z: 7.45, label: '2' },
      {
        model: 'menu-board', x: 8.66, z: 7.45, rot: 1, solid: false,
        interact: tr('Le menu du jour.', 'Today\'s menu.'),
      },
      {
        model: 'water-fountain', x: 9.3, z: 5.8, action: tr('Boire un verre d\'eau', 'Drink a glass of water'),
        interact: [
          tr('Glou glou. Une eau recyclée cent fois, et toujours aussi fraîche.', 'Glug glug. Water recycled a hundred times, and still just as fresh.'),
          tr('La bonbonne fait une grosse bulle. Vous faites semblant de ne pas avoir sursauté.', 'The water jug lets out a big bubble. You pretend you didn\'t jump.'),
          tr('Un gobelet d\'eau. Au fond, un logo de Hutton Orbital à moitié effacé.', 'A cup of water. At the bottom, a half-worn Hutton Orbital logo.'),
        ],
      },
      {
        model: 'tray-return', x: 14.75, z: 5.84,
        interact: tr('Retour plateaux : le tapis emporte tout vers la plonge. Enfin, en théorie.', 'Tray return: the belt carries everything to the dishwashing station. In theory.'),
      },
      { model: 'self-counter', x: 11.25, z: 10, rot: 2, label: '5.2' },
      {
        model: 'tray-stack', x: 9.05, z: 10, y: 0.46, rot: 2, solid: false, action: tr('Prendre un plateau', 'Take a tray'),
        interact: tr('Plateaux, couverts, serviettes : le self commence ici.', 'Trays, cutlery, napkins: the line starts here.'),
      },
      {
        model: 'order-rail', x: 11.5, z: 10, y: 0.46, rot: 2, solid: false, action: tr('Prendre une commande', 'Take an order'),
        interact: tr('Le rail des bons de commande, à la passe du chef.', 'The order ticket rail, at the chef\'s pass.'),
      },
      { model: 'rug', x: 12, z: 11.33, label: 'bath:6.6x2', solid: false },
      {
        model: 'kitchen-fridge', x: 9.15, z: 12.075, rot: 2,
        interact: [
          tr('Le frigo : protéines, lapin de Ceti, et une ration marquée « SERGENT » qui a déjà un coin en moins.', 'The fridge: protein, Ceti rabbit, and a ration marked “SERGEANT” that already has a corner missing.'),
          tr('Vous ouvrez le frigo. Il fait −4 °C. Un escargot d\'Irukama vous regarde. Vous refermez.', 'You open the fridge. It is −4 °C. An Irukama snail looks at you. You close it again.'),
        ],
      },
      {
        model: 'kitchen-prep', x: 10.35, z: 12.075, rot: 2,
        interact: tr('Plan de travail : planche, couteaux bien affûtés. Marcel les compte tous les soirs.', 'Prep counter: board, well-sharpened knives. Marcel counts them every night.'),
      },
      {
        model: 'kitchen-range', x: 11.8, z: 12.075, rot: 2,
        interact: [
          tr('Le fourneau : la marmite mijote depuis ce matin. Personne ne sait vraiment ce qu\'il y a dedans.', 'The range: the stockpot has been simmering since this morning. Nobody really knows what\'s in it.'),
          tr('Quatre feux, un four, une hotte qui ronronne. Le cockpit de Marcel.', 'Four burners, an oven, a humming hood. Marcel\'s cockpit.'),
        ],
      },
      {
        model: 'kitchen-sink', x: 13.15, z: 12.075, rot: 2,
        interact: tr('La plonge : eau chaude, éponge fatiguée, et un égouttoir plein.', 'The dishwashing station: hot water, a tired sponge, and a full drying rack.'),
      },
      {
        model: 'kitchen-pantry', x: 14.65, z: 12.14, rot: 2,
        interact: tr('Garde-manger : riz de Jaroua, farine, piments d\'Ochoeng. Et trois bidons de protéines « goût neutre ».', 'Pantry: Jaroua rice, flour, Ochoeng chillies. And three canisters of “neutral flavour” protein.'),
      },
      {
        model: 'vending-machine', x: 11.3, z: 5.65, action: tr('Acheter un snack', 'Buy a snack'),
        interact: [
          tr('Distributeur : plus de Brandy de Lave. Il reste du café lyophilisé et une tasse de Hutton Orbital.', 'Vending machine: out of Lavian Brandy. There is freeze-dried coffee left, and a Hutton Orbital mug.'),
          tr('Clonk ! Une barre protéinée « goût Achenar » tombe dans le bac. Personne ne sait quel goût a Achenar.', 'Clonk! An “Achenar flavour” protein bar drops into the tray. Nobody knows what Achenar tastes like.'),
          tr('La machine avale vos crédits et réfléchit longuement. Puis elle vous rend une canette de Lavian Cola.', 'The machine swallows your credits and thinks it over. Then it hands you a can of Lavian Cola.'),
        ],
      },

      // --- Grande salle d'arcade : deux rangées de bornes jouables, les jeux de plateau à l'est, un coin salon ---
      // Au sud, face au nord : Cargaison, Viper, Astéroïdes et un deuxième Cargaison.
      { model: 'arcade', x: 16.7, z: 9.02, rot: 2, label: 'cargo' },
      { model: 'arcade', x: 17.95, z: 9.02, rot: 2, label: 'viper' },
      { model: 'arcade', x: 19.2, z: 9.02, rot: 2, label: 'asteroids' },
      { model: 'arcade', x: 20.6, z: 9.02, rot: 2, label: 'cargo' },
      // Au nord, face au sud, de part et d'autre des portes : Ruelle Fighter II à gauche de la porte
      // ouest (son duel est unique sur le pont, cf. server/fights.js), un deuxième exemplaire des
      // jeux solo pour que tout le monde joue quand l'équipage est nombreux, Thargoid Invaders, et
      // un flipper.
      { model: 'arcade', x: 16.45, z: 5.98, label: 'fight' },
      { model: 'arcade', x: 19.35, z: 5.98, label: 'viper' },
      { model: 'arcade', x: 20.55, z: 5.98, label: 'asteroids' },
      { model: 'arcade', x: 21.75, z: 5.98, label: 'invaders' },
      { model: 'pinball', x: 24.05, z: 6.1, label: 'thargoid' },
      { model: 'claw-machine', x: 25.0, z: 6.2, rot: 3, label: 'cyan' },
      { model: 'neon-sign', x: 15.72, z: 6.75, rot: 1, label: 'ARCADE' },
      // Au mur ouest, sous le néon : les high scores de chaque borne.
      { model: 'score-board', x: 15.65, z: 8.2, rot: 1, label: 'arcade', solid: false, interact: 'High scores', action: tr('Consulter les high scores', 'View high scores') },
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
        model: 'amadioha-photo', x: 25.35, z: 1, rot: 3, solid: false,
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

      // --- La Promenade : la coursive s'élargit en atrium vitré, et contourne la maquette du Cobra ---
      {
        model: 'cobra-monument', x: 28, z: 4.5,
        interact: [
          tr('Cobra Mk III, à l\'échelle 1/40. Le vaisseau de départ de milliers de commandants, et de quelques-uns qui n\'en sont jamais descendus.', 'Cobra Mk III, 1:40 scale. The starter ship of thousands of commanders, and of a few who never got out of it.'),
          tr('Sur le socle, quelqu\'un a collé un post-it : « 1984 – toujours en service. o7 »', 'On the plinth, someone has stuck a note: “1984 – still in service. o7”'),
        ],
      },
      { model: 'bench', x: 28, z: 0.45, label: 'teal', interact: tr('Banc face à la verrière : on y regarde défiler les systèmes.', 'A bench facing the canopy: watch the systems go by.') },
      { model: 'bench', x: 28, z: 8.55, label: 'teal' },
      { model: 'plant-tall', x: 26.1, z: 1.05 },
      { model: 'monstera', x: 29.9, z: 1.05 },
      { model: 'monstera', x: 26.1, z: 7.95 },
      { model: 'plant-tall', x: 29.9, z: 7.95 },
      { model: 'telescope', x: 29.85, z: 2.6, rot: 1, interact: tr('Longue-vue : on y voit la station la plus proche… et le parking de Fleet Carriers.', 'Spyglass: you can see the nearest station… and the Fleet Carrier car park.') },
      { model: 'telescope', x: 26.15, z: 6.4, rot: 3 },
    ],
    lights: [
      // La salle commune : l'îlot du hall, les deux comptoirs, les salons de la mezzanine et le
      // jukebox (cf. Deck : à l'étage, les lampes montent avec le plancher).
      [5.75, 4.5, '#fff1dd', 3],
      [5.9, 1.5, '#d6ecff', 1.8],
      [5.9, 7.5, '#bff7ec', 1.8],
      [0.7, 2.4, '#ffd9a8', 1.8],
      [0.7, 6.6, '#ffd9a8', 1.8],
      [0.5, 4.5, '#ff7ad9', 1.4, 'neon'],
      [34.5, 4.5, '#ffa04a', 3.4],
      [37.2, 4.5, '#9fd8ff', 2.4],
      // L'infirmerie : lumière clinique sur les lits, et la lampe rosée du poste de Betty.
      [10.2, 1.4, '#eef8ff', 2.6],
      [13.8, 1.4, '#e8f6ff', 2.6],
      [9.6, 2.9, '#ffc2d6', 1.2],
      [18, 1.5, '#fff4e4', 3],
      // Le mess : la salle, les lampes chauffantes de la passe, la cuisine.
      [12, 7.5, '#ffe2b0', 3],
      [11.5, 9.9, '#ff9a4a', 1.4],
      [11.8, 11.4, '#fff4e0', 2.8],
      [18.3, 7.6, '#ff4fd8', 2.6, 'neon'],
      [16.8, 7.2, '#39d0ff', 2],
      [20.6, 7.5, '#39d0ff', 2],
      [15, 4.5, '#ffffff', 2.5],
      // La Promenade : le monument, et la lueur bleutée des verrières.
      [28, 4.5, '#cfe6ff', 2.6],
      [23, 1.2, '#e6fbff', 2.4],
      [21.3, 0.4, '#7dffa8', 1.2],
      [24.7, 0.5, '#bff6ff', 1.2],
      [28, 1, '#9fd8ff', 1.4],
      [23.3, 7.8, '#b06bff', 2.6],
      [28, 8, '#9fd8ff', 1.4],
    ],
  },

  // ======================================================== Pont supérieur : la vie à bord
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
      d: tr('Toilettes', 'Restrooms'),
      // À la place des anciens quartiers du commandant.
      p: tr('Planétarium', 'Planetarium'),
      g: tr('Serre hydroponique', 'Hydroponics bay'),
      o: tr('Salon d\'écoute', 'Listening lounge'),
      s: tr('Studio Radio Dangereuse', 'Radio Dangereuse studio'),
      n: tr('Cinéma', 'Cinema'),
      h: tr('Foyer', 'Foyer'),
      b: tr('Terrain de basket', 'Basketball court'),
      f: tr('Terrain de foot', 'Football pitch'),
    },
    windows: { c: 0, k: 0.3, d: 0, p: 0.6, g: 0.5, o: 1, n: 0, s: 0, h: 0, b: 0, f: 0.4 },
    // Le sud de la serre, sans mur entre les deux : le jardin exotique et son étang.
    areas: [{ name: tr('Jardin exotique', 'Exotic garden'), minX: 0, maxX: 7, minZ: 9, maxZ: 14 }],
    // Du foyer, on entre au cinéma par une porte double, capitonnée de rouge.
    doubleDoors: [{ x: 22, z: 4, dir: 1, padded: true }],
    // Derrière le lavabo ouest des toilettes : un pilier lui passait au travers.
    plainWalls: [{ x: 12.5, z: 3 }],
    // La serre, tout en verre : les plantes voient les étoiles. Sol de tomettes.
    greenhouse: ['g'],
    floorFinish: { g: 'terracotta' },
    // Le salon voit le studio par sa vitre ; de la coursive, on voit la serre.
    glazed: ['os', 'gc'],
    // On baisse les lumières au cinéma, un peu au salon d'écoute ; au planétarium, la nuit tombe.
    dim: { n: 0.45, o: 0.7, p: 0.3 },
    props: [
      // --- Coursive ---
      { model: 'rug', x: 12.9, z: 5, label: 'warm:3.8x0.7', solid: false },
      { model: 'bench', x: 12.3, z: 3.9, label: 'teal' },
      { model: 'plant-tall', x: 15.1, z: 5.2 },

      // --- Toilettes : trois cabines contre le mur nord, dont la porte se referme sur l'occupant
      // (cf. updateStalls dans main.ts) ; deux lavabos de part et d'autre de l'entrée.
      ...([13.1, 14, 14.9] as const).map((x): Prop => ({
        model: 'toilet-stall', x, z: 1.15,
        interact: tr('Toilettes à dépression. Ne pas utiliser pendant un saut FSD.', 'Vacuum toilet. Do not use during an FSD jump.'),
      })),
      {
        model: 'sink', x: 12.88, z: 2.85, rot: 1,
        interact: tr('Lavabo : le miroir affiche la météo de la station la plus proche.', 'Washbasin: the mirror shows the weather at the nearest station.'),
      },
      {
        model: 'sink', x: 15.12, z: 2.85, rot: 3,
        interact: tr('Lavabo : un filet d\'eau recyclée, tiède. Mieux vaut ne pas demander recyclée d\'où.', 'Washbasin: a trickle of lukewarm recycled water. Best not to ask recycled from where.'),
      },
      { model: 'rug', x: 14, z: 2.45, label: 'bath:1.2x0.7', solid: false },
      { model: 'towel-rail', x: 12.65, z: 2.05, rot: 1, solid: false, interact: tr('Porte-serviettes chauffant : les serviettes sont tièdes, et sentent la lavande de synthèse.', 'Heated towel rail: the towels are warm, and smell of synthetic lavender.') },

      // --- Serre hydroponique, sous verrière : grainothèque, bacs hydroponiques, cuve et récupérateur
      // d\'eau au nord ; mur végétal à l\'ouest ; bacs potagers au milieu ; à l\'ouest, la pelouse,
      // l\'arbre fruitier et son banc ; l\'arche fleurie à l\'entrée. L\'établi, le compost, les
      // cactus et les citrouilles font la limite avec le jardin exotique, au sud (plus bas). Les
      // postes du mini-jeu de Capucine sont ici (cf. src/greenhouse.ts), et ses trajets les
      // contournent (cf. GARDEN_OBSTACLES dans shared/gardener.js).
      { model: 'lawn', x: 1.3, z: 4.55, label: '2.6x3.9', solid: false },
      { model: 'stepping-stones', x: 4.6, z: 5, label: '4.4', solid: false },
      { model: 'garden-arch', x: 7.0, z: 5, rot: 1, label: '1.1', solid: false },
      {
        model: 'seed-cabinet', x: 2.5, z: 0.72,
        interact: [
          tr('Grainothèque : cent vingt-cinq tiroirs, de la laitue de Sol au poivron d\'Achenar. Un tiroir est fermé à clé : « Ne pas planter. Jamais. »', 'Seed library: a hundred and twenty-five drawers, from Sol lettuce to Achenar peppers. One drawer is locked: “Do not plant. Ever.”'),
          tr('Sur une étiquette, de la main de Capucine : « Graines de Colonia, récoltées à 22 000 années-lumière. Manipuler avec respect. »', 'On a label, in Capucine\'s hand: “Colonia seeds, harvested 22,000 light years away. Handle with respect.”'),
        ],
      },
      {
        model: 'hydro-rack', x: 3.75, z: 0.8,
        interact: [
          tr('Hydroponie : tomates, basilic et un piment de Lave.', 'Hydroponics: tomatoes, basil and a Lave chilli.'),
          tr('Les plantes poussent sous des LED roses. Elles ont l\'air heureuses.', 'The plants grow under pink LEDs. They look happy.'),
        ],
      },
      {
        model: 'hydro-rack', x: 5.05, z: 0.8,
        interact: tr('Deuxième étage : des fraises. Il en manque trois. Comète nie tout.', 'Second tier: strawberries. Three are missing. Comète denies everything.'),
      },
      {
        model: 'nutrient-tank', x: 5.95, z: 0.9,
        interact: tr('Cuve de solution nutritive : azote, phosphore, potassium, et une pointe de poussière d\'astéroïde.', 'Nutrient tank: nitrogen, phosphorus, potassium, and a pinch of asteroid dust.'),
      },
      {
        model: 'water-barrel', x: 0.2, z: 6.2, rot: 1,
        interact: tr('Récupérateur d\'eau : la condensation de la coque, filtrée trois fois. Le chef Marcel dit qu\'elle a un goût de vaisseau.', 'Water butt: condensation from the hull, filtered three times. Chef Marcel says it tastes of starship.'),
      },
      {
        model: 'vine-trellis', x: -0.42, z: 4.5, rot: 1, label: '3.8', solid: false,
        interact: [
          tr('Une vigne grimpe sur la verrière : du raisin de Lave, noir et sucré. Capucine rêve d\'en faire du vin. Marcel aussi.', 'A vine climbs up the glass: Lave grapes, dark and sweet. Capucine dreams of making wine. So does Marcel.'),
          tr('Entre deux feuilles de vigne, on voit défiler les étoiles. Les grappes, elles, ne bougent pas.', 'Between two vine leaves, you watch the stars go by. The grapes stay put.'),
        ],
      },
      {
        model: 'fruit-tree', x: 1.3, z: 2.3,
        interact: [
          tr('Un pommier de Lave, nain. Ses fruits luisent la nuit. Capucine jure qu\'ils sont comestibles. Elle n\'en a jamais mangé.', 'A dwarf Lave apple tree. Its fruit glows at night. Capucine swears it\'s edible. She\'s never eaten one.'),
          tr('Gravé sur le bac : « Planté au départ de Jameson Memorial. » L\'arbre a vu plus de systèmes que la plupart des pilotes.', 'Carved on the planter: “Planted on leaving Jameson Memorial.” The tree has seen more systems than most pilots.'),
        ],
      },
      {
        model: 'bench', x: 1.3, z: 5.5, rot: 2, label: 'teal',
        interact: tr('Un banc sous le pommier. Le bassin des carpes était ici, avant de déménager au jardin exotique : Capucine a gardé le banc, « pour les regretter assis ».', 'A bench under the apple tree. The koi pond used to be here before it moved to the exotic garden: Capucine kept the bench, “to miss them sitting down”.'),
      },
      { model: 'butterflies', x: 1.3, z: 4, label: '0.9', solid: false },
      {
        model: 'garden-bed', x: 3.9, z: 2.5, label: 'tomato',
        interact: tr('Bac à tomates : cœur-de-bœuf, cerises, et une « Anaconda » qui grimpe plus haut que les autres.', 'Tomato bed: beefsteak, cherry, and an “Anaconda” that climbs higher than the others.'),
      },
      {
        model: 'garden-bed', x: 5.9, z: 2.5, label: 'herbs',
        interact: tr('Herbes aromatiques : basilic, ciboulette, thym. Marcel en vole une poignée chaque matin et laisse un mot.', 'Herbs: basil, chives, thyme. Marcel steals a handful every morning and leaves a note.'),
      },
      {
        model: 'garden-bed', x: 4.5, z: 3.9, label: 'lettuce',
        interact: tr('Salades et carottes, en rangs impeccables. Capucine les compte le soir. Toutes.', 'Lettuce and carrots in perfect rows. Capucine counts them every evening. All of them.'),
      },
      {
        model: 'garden-bed', x: 4.0, z: 6.2, label: 'flowers',
        interact: tr('Massif de fleurs : elles ne se mangent pas, elles ne servent à rien, et c\'est le coin préféré de l\'équipage.', 'Flower bed: you can\'t eat them, they serve no purpose, and it\'s the crew\'s favourite spot.'),
      },
      { model: 'butterflies', x: 4.0, z: 6.2, label: '0.8', solid: false },
      { model: 'pollinator-drone', x: 4.9, z: 2.5, label: '0.9' },
      { model: 'pollinator-drone', x: 4.4, z: 1.2, label: '0.6' },
      {
        model: 'harvest-crate', x: 6.95, z: 0.95,
        interact: tr('Caisses de récolte, pour le mess. Sur l\'étiquette : « Pour Marcel. Pas pour Jacques. Surtout pas pour Jacques. »', 'Harvest crates, for the mess. On the label: “For Marcel. Not for Jacques. Especially not for Jacques.”'),
      },
      {
        model: 'potting-bench', x: 5.6, z: 8.12, rot: 2,
        interact: [
          tr('Établi de rempotage : des semis de laitue, de la terre sous les ongles, et un arrosoir qui fuit.', 'Potting bench: lettuce seedlings, soil under your nails, and a leaky watering can.'),
          tr('Un bocal étiqueté « graines de Colonia — NE PAS MANGER ». Quelqu\'un en a mangé.', 'A jar labelled “Colonia seeds — DO NOT EAT”. Someone ate some.'),
        ],
      },
      {
        model: 'compost-bin', x: 6.95, z: 8.05,
        interact: tr('Le compost : épluchures du mess, marc de café CD-75, et ce qu\'il reste des soufflés ratés de Marcel.', 'The compost: peelings from the mess, CD-75 coffee grounds, and what\'s left of Marcel\'s failed soufflés.'),
      },
      { model: 'monstera', x: 0.25, z: 7.45 },
      {
        model: 'cactus-bed', x: 2.55, z: 8.1,
        interact: tr('Le coin des cactus : ils ne demandent rien, sauf qu\'on ne s\'asseye pas dessus.', 'The cactus corner: they ask for nothing, except that you don\'t sit on them.'),
      },
      {
        model: 'pumpkin-patch', x: 3.75, z: 8.05,
        interact: tr('Citrouilles et melons, sur un lit de paille. La plus grosse est réservée pour une soirée à thème, au salon.', 'Pumpkins and melons on a bed of straw. The biggest one is saved for a themed party in the lounge.'),
      },
      // --- La verdure : palmiers en pot, bambous, buissons, fougères, herbes et fleurs sauvages (Nature Kit).
      { model: 'potted-palm', x: 0.2, z: 4, label: 'bend' },
      { model: 'potted-palm', x: 6.3, z: 5.85, label: 'fan' },
      {
        model: 'bamboo', x: 7.1, z: 4.05, rot: 1,
        interact: tr('Du bambou : il pousse de trois centimètres par jour. Capucine le mesure. Tous les jours.', 'Bamboo: it grows three centimetres a day. Capucine measures it. Every day.'),
      },
      { model: 'bush', x: 0.2, z: 3, label: 'detailed' },
      { model: 'fern', x: 0.2, z: 5.35 },
      { model: 'mushrooms', x: 1.85, z: 2.6, solid: false },
      { model: 'wildflowers', x: 0.7, z: 3.45, label: 'purple', solid: false },
      { model: 'wildflowers', x: 2.15, z: 3.85, label: 'mixed', solid: false },
      { model: 'wildflowers', x: 2.05, z: 6.45, label: 'yellow', solid: false },
      { model: 'wildflowers', x: 0.85, z: 6.55, label: 'red', solid: false },
      { model: 'grass-tuft', x: 2.05, z: 4.75, label: 'tall', solid: false },
      { model: 'grass-tuft', x: 0.45, z: 4.7, label: 'leafs', solid: false },
      { model: 'grass-tuft', x: 2.1, z: 5.95, label: 'wide', solid: false },
      { model: 'grass-tuft', x: 3.1, z: 4.55, label: 'leafs', solid: false },
      { model: 'grass-tuft', x: 5.35, z: 4.55, label: 'tall', solid: false },
      { model: 'grass-tuft', x: 6.45, z: 4.95, label: 'wide', solid: false },
      { model: 'wildflowers', x: 2.9, z: 5.5, label: 'mixed', solid: false },
      // La rangée du sud, entre le massif et l'établi.
      { model: 'grass-tuft', x: 3.05, z: 7.15, label: 'leafs', solid: false },
      { model: 'wildflowers', x: 4.95, z: 7.05, label: 'purple', solid: false },
      { model: 'grass-tuft', x: 6.4, z: 7.1, label: 'wide', solid: false },
      { model: 'hanging-basket', x: -0.45, z: 7.0, rot: 1, solid: false },
      { model: 'hanging-basket', x: -0.45, z: 9.0, rot: 1, solid: false },
      { model: 'hanging-basket', x: 1.55, z: 1.05, rot: 1, solid: false },
      { model: 'flowers', x: 6.1, z: 4.45 },
      { model: 'exobio-plant', x: 6.95, z: 6, label: 'crystal' },

      // --- Jardin exotique, au sud de la serre (sans mur : on y passe sous l'arche, à l'ouest, ou
      // entre les citrouilles et l'établi) : une plage de sable, le grand étang et ses carpes, le
      // ponton d'où l'on pêche et le livre des prises (cf. src/fishing/ et shared/fishing.js),
      // des palmiers en pleine terre, des bambous, des plantes d'exobiologie.
      // Une rangée de tuiles reste libre tout autour de l'étang (cf. FISHING_POND) : le décor qui
      // arrête le passage se range contre les murs (x = 0 et 7, z = 14).
      { model: 'sand-patch', x: 3.55, z: 11.5, label: '7.6x5.6', solid: false },
      { model: 'garden-arch', x: 1.35, z: 8.2, label: '1.3', solid: false },
      {
        model: 'fishing-pond', x: FISHING_POND.x, z: FISHING_POND.z, reach: FISHING_FEED,
        interact: [
          tr('Trois carpes koï : Faulcon, DeLacy et Gutamaya. Gutamaya est la plus chère à nourrir. Sous elles, des ombres bien plus grosses passent lentement.', 'Three koi: Faulcon, DeLacy and Gutamaya. Gutamaya is the most expensive to feed. Beneath them, much larger shadows drift slowly by.'),
          tr('La grenouille de pierre crache son filet d\'eau. En gravité artificielle, il retombe presque droit.', 'The stone frog spits its trickle of water. In artificial gravity, it falls almost straight.'),
          tr('L\'étang est bien plus profond qu\'il n\'en a l\'air. Capucine dit qu\'il communique avec les ballasts. Nico dit que non. Personne n\'est allé voir.', 'The pond is much deeper than it looks. Capucine says it connects to the ballast tanks. Nico says it doesn\'t. Nobody has gone to check.'),
        ],
      },
      // Le ponton et le livre : leur texte fait d'eux des objets qu'on actionne (touche E), la
      // pêche et le livre s'y branchent (cf. main.ts).
      {
        model: 'fishing-dock', x: FISHING_DOCK.x, z: FISHING_DOCK.z, solid: false, action: tr('Pêcher', 'Fish'),
        interact: tr('Le ponton de pêche : des cannes, des appâts, et un étang plein d\'ombres.', 'The fishing dock: rods, bait, and a pond full of shadows.'),
      },
      {
        model: 'fish-book', x: 7.12, z: 11.35, rot: 3, action: tr('Ouvrir le livre des prises', 'Open the catch book'),
        interact: tr('Le livre des prises : chaque poisson sorti de l\'étang y a sa page.', 'The catch book: every fish landed from the pond has its page.'),
      },
      {
        model: 'jungle-palm', x: 0.15, z: 9.9, label: 'bend',
        interact: tr('Un palmier qui penche au-dessus de l\'étang. Les carpes apprécient l\'ombre, Capucine un peu moins les feuilles mortes.', 'A palm leaning over the pond. The koi enjoy the shade; Capucine less so the dead leaves.'),
      },
      { model: 'jungle-palm', x: 7.2, z: 9.9, label: 'fan' },
      { model: 'jungle-palm', x: 2.0, z: 14.2, label: 'short' },
      { model: 'jungle-palm', x: 7.1, z: 14.15, label: 'bend' },
      {
        model: 'bamboo', x: 7.15, z: 12.75, rot: 3,
        interact: tr('Encore du bambou. Capucine jure qu\'elle n\'en a planté qu\'un pied, de l\'autre côté de la serre.', 'More bamboo. Capucine swears she only planted one, on the other side of the greenhouse.'),
      },
      {
        model: 'exobio-plant', x: 0.15, z: 12.5, label: 'anemone',
        interact: tr('Une anémone d\'exobiologie, rapportée d\'une lune sans nom. Elle se tourne vers ceux qui pêchent. Par curiosité, sans doute.', 'An exobiology anemone, brought back from a nameless moon. It turns towards whoever is fishing. Out of curiosity, no doubt.'),
      },
      { model: 'exobio-plant', x: 4.5, z: 14.2, label: 'brain' },
      { model: 'bush', x: 2.9, z: 14.15, label: 'large' },
      { model: 'bush', x: 5.5, z: 14.15, label: 'triangle' },
      { model: 'fern', x: 0.1, z: 10.9 },
      { model: 'fern', x: 3.7, z: 14.2 },
      { model: 'butterflies', x: 2.4, z: 12.1, label: '1.1', solid: false },
      { model: 'butterflies', x: 5.0, z: 10.6, label: '1', solid: false },
      { model: 'wildflowers', x: 0.3, z: 11.7, label: 'red', solid: false },
      { model: 'wildflowers', x: 7.1, z: 13.5, label: 'purple', solid: false },
      { model: 'wildflowers', x: 2.2, z: 9.3, label: 'yellow', solid: false },
      { model: 'wildflowers', x: 5.2, z: 9.3, label: 'mixed', solid: false },
      { model: 'grass-tuft', x: 0.3, z: 13.0, label: 'tall', solid: false },
      { model: 'grass-tuft', x: 7.1, z: 10.6, label: 'leafs', solid: false },
      { model: 'grass-tuft', x: 6.3, z: 14.2, label: 'wide', solid: false },
      { model: 'mushrooms', x: 1.3, z: 14.1, solid: false },

      // --- Studio Radio Dangereuse : trois animateurs autour de la table ronde, face à la vitre ---
      { model: 'studio-table', x: 17.45, z: 2.0 },
      // Dans le studio, `interact` est ce qu'on lit en s'installant au micro.
      ...([[16.5, 2.0, 1], [17.45, 1.08, 0], [18.4, 2.0, 3]] as const).map(([x, z, rot]): Prop => ({
        model: 'studio-chair', x, z, rot, action: tr('Prendre le micro', 'Take the mic'),
        interact: [
          tr('Vous approchez le micro : « Bonsoir à tous, et bienvenue dans Radio Dangereuse ! »', 'You lean into the mic: “Good evening everyone, and welcome to Radio Dangereuse!”'),
          tr('Casque sur les oreilles, vous entendez votre propre voix. Elle sonne bien plus grave qu\'en vrai.', 'Headphones on, you hear your own voice. It sounds much deeper than in real life.'),
          tr('Sujet du jour : « Faut-il vraiment aller à Hutton Orbital ? » Le débat promet d\'être long.', 'Today\'s topic: “Should you really fly to Hutton Orbital?” The debate promises to be long.'),
          tr('Vous tapotez le micro : « Un, deux… un, deux… On est en direct, là ? » Le néon ON AIR répond pour vous.', 'You tap the mic: “One, two… one, two… Are we live?” The ON AIR sign answers for you.'),
        ],
      })),
      { model: 'mug', x: 17.2, z: 2.28, y: 0.415, solid: false },
      { model: 'acoustic-panel', x: 16.3, z: 0.65 },
      { model: 'wall-clock', x: 17.45, z: 0.65, solid: false, interact: tr('L\'horloge du studio : l\'émission commence à l\'heure. En théorie.', 'The studio clock: the show starts on time. In theory.') },
      { model: 'acoustic-panel', x: 18.6, z: 0.65 },
      {
        model: 'podcast-poster', x: 15.65, z: 1.15, rot: 1, label: 'radio', solid: false,
        interact: tr(
          'Radio Dangereuse : le podcast Elite Dangerous de la communauté. Actus, débats et histoires de CMDR, à retrouver sur radio.elitedangereuse.fr.',
          'Radio Dangereuse: the community\'s Elite Dangerous podcast. News, debates and CMDR stories, on radio.elitedangereuse.fr.',
        ),
      },
      {
        model: 'headphone-rack', x: 15.65, z: 2.5, rot: 1, solid: false,
        interact: tr(
          'Casques de rechange du studio : un pour chaque invité, un pour Comète, qui mâchouille les câbles.',
          'Spare studio headphones: one for each guest, one for Comète, who chews the cables.',
        ),
      },
      // Au-dessus de la vitre, côté salon : le néon de l'émission et son « ON AIR ».
      { model: 'radio-neon', x: 17.2, z: 3.5, solid: false },

      // --- Salon d'écoute : fauteuils et poufs tournés vers le studio, les affiches des Galères ---
      { model: 'rug', x: 17.5, z: 5.0, label: 'cosy:3.6x2.6', solid: false },
      {
        model: 'podcast-poster', x: 15.65, z: 4.95, rot: 1, label: 'gg', solid: false,
        interact: tr(
          'Le nouveau logo des Galères Galactiques : deux G et une étoile à neutrons. Toujours rien qui se passe comme prévu, sur galeresgalactiques.fr.',
          'The new Galères Galactiques logo: two Gs and a neutron star. Still nothing goes to plan, on galeresgalactiques.fr.',
        ),
      },
      // Le poste d'écoute, contre le mur ouest.
      {
        model: 'podcast-console', x: 15.84, z: 5.82, rot: 1, action: tr('Écouter', 'Listen'),
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
      {
        model: 'armchair', x: 16.62, z: 6.02, rot: 2, label: 'terracotta',
        interact: tr('Fauteuil du salon : un épisode, la vitre du studio, et plus rien d\'autre.', 'Lounge armchair: an episode, the studio window, and nothing else.'),
      },
      { model: 'armchair', x: 17.6, z: 6.02, rot: 2, label: 'teal' },
      { model: 'side-table', x: 18.45, z: 6.1 },
      { model: 'headphone-stand', x: 18.4, z: 6.07, y: 0.3125, label: 'orange', solid: false },
      { model: 'mug', x: 18.52, z: 6.17, y: 0.3125, solid: false },
      // Les poufs, au premier rang.
      { model: 'beanbag', x: 16.55, z: 5.0, label: 'mustard' },
      { model: 'floor-cushion', x: 17.2, z: 5.02, label: 'plum' },
      { model: 'beanbag', x: 18.45, z: 5.0, label: 'rose' },
      // L'alcôve : un guéridon, un casque sur son pied, une lampe de papier, l'ancienne affiche des Galères.
      { model: 'side-table', x: 17.2, z: 7.05 },
      { model: 'headphone-stand', x: 17.14, z: 7.02, y: 0.3125, label: 'navy', solid: false },
      { model: 'candles', x: 17.3, z: 7.12, y: 0.3125, solid: false },
      { model: 'paper-lantern', x: 17.9, z: 7.1, label: 'tall' },
      {
        model: 'podcast-poster', x: 17.2, z: 7.35, rot: 2, label: 'galeres', solid: false,
        interact: tr(
          'L\'ancienne affiche des Galères Galactiques, gardée en souvenir : une mini-fiction audio humoristique, où rien ne se passe jamais comme prévu dans l\'espace.',
          'The old Galères Galactiques poster, kept as a keepsake: a comedy audio mini-series where nothing in space ever goes to plan.',
        ),
      },

      // --- Planétarium (8 × 8), à la place des anciens quartiers : l'observatoire de Bugenhagen, comme
      // à Cosmo Canyon dans Final Fantasy VII. La carte du ciel au sol ; au centre, le projecteur et
      // l'hologramme du système, qui emplit la pièce et qu'on traverse ; Bugenhagen y flotte, au
      // nord-ouest du soleil. Les bibliothèques aux murs, la lunette près de la porte, des
      // coussins tout autour pour regarder tourner les planètes (cf. src/furniture/planetarium.ts) : s'y
      // asseoir, ou observer au projecteur, lance la séance (cf. src/planetarium.ts).
      { model: 'planetarium-floor', x: 11.5, z: 9.5, solid: false },
      // « Observer » lance la séance (cf. src/planetarium.ts), comme de s'asseoir sur un coussin.
      {
        model: 'planetarium-projector', x: 11.5, z: 9.5, action: tr('Observer', 'Observe'),
        interact: tr('Le projecteur du planétarium : une lentille de cristal, une monture de laiton, et tout un système qui en sort.', 'The planetarium projector: a crystal lens, a brass mount, and a whole star system pouring out of it.'),
      },
      { model: 'planetarium-sky', x: 11.5, z: 9.5, solid: false },
      {
        model: 'bugenhagen', x: 10.0, z: 8.3, action: tr('Parler à Bugenhagen', 'Talk to Bugenhagen'),
        interact: [
          tr('Bugenhagen : « Hou hou houuu ! Un visiteur ! Approche, approche… Les étoiles n\'attendent personne, mais elles aiment qu\'on les regarde. »', 'Bugenhagen: “Ho ho hooo! A visitor! Come closer, come closer… The stars wait for no one, but they like being looked at.”'),
          tr('Bugenhagen : « Tu entends ? Non ? Écoute mieux. La galaxie gémit. Quatre cents milliards d\'étoiles, et chacune a sa voix. »', 'Bugenhagen: “Do you hear it? No? Listen harder. The galaxy is groaning. Four hundred billion stars, and every one has a voice.”'),
          tr('Bugenhagen : « Cent trente ans que j\'observe le ciel. J\'en sais beaucoup… et surtout, je sais tout ce que j\'ignore. Hou hou hou ! »', 'Bugenhagen: “A hundred and thirty years watching the sky. I know a great deal… and above all, I know everything I don\'t. Ho ho ho!”'),
          tr('Bugenhagen : « Savoir, c\'est compter les étoiles. Comprendre, c\'est savoir pourquoi on les compte. »', 'Bugenhagen: “Knowing is counting the stars. Understanding is knowing why you count them.”'),
          tr('Bugenhagen : « Tout ce qui vit retourne aux étoiles, un jour. Ton vaisseau, toi, moi… La galaxie n\'oublie rien : elle recommence. »', 'Bugenhagen: “Everything that lives returns to the stars, one day. Your ship, you, me… The galaxy forgets nothing: it begins again.”'),
          tr('Bugenhagen : « Les jeunes pilotes filent vers Sagittarius A* pour dire qu\'ils y sont allés. Les vieux y vont pour en revenir. »', 'Bugenhagen: “Young pilots rush to Sagittarius A* to say they\'ve been. Old ones go there to come back.”'),
          tr('Bugenhagen : « Les Thargoïdes ? Ni bons ni mauvais. Ils étaient là bien avant nous, voilà tout. Celui qui ne comprend pas cela ne comprend pas le ciel. »', 'Bugenhagen: “The Thargoids? Neither good nor evil. They were here long before us, that\'s all. Whoever can\'t grasp that can\'t grasp the sky.”'),
          tr('Bugenhagen : « Raxxla, la Voie… On cherche toujours une porte au bout du ciel. J\'ai trouvé la mienne : c\'est cette pièce. Hou hou ! »', 'Bugenhagen: “Raxxla, the Path… Everyone looks for a door at the end of the sky. I found mine: this room. Ho ho!”'),
          tr('Bugenhagen : « Assieds-toi et regarde-les tourner. Celui qui se presse ne voit que des lignes rouges ; celui qui attend voit des orbites. »', 'Bugenhagen: “Sit down and watch them turn. Those in a hurry see only red lines; those who wait see orbits.”'),
          tr('Bugenhagen : « Un jour, toi aussi, tu seras vieux. Si tu as bien regardé le ciel, tu ne le regretteras pas. Hou hou houuu ! »', 'Bugenhagen: “One day you too will be old. If you have looked well at the sky, you won\'t regret it. Ho ho hooo!”'),
          tr('Bugenhagen plisse les yeux derrière ses lunettes noires, montre du doigt la géante aux anneaux, et sourit. Il n\'a rien besoin de dire.', 'Bugenhagen squints behind his dark glasses, points at the ringed giant, and smiles. He doesn\'t need to say a thing.'),
        ],
      },
      {
        model: 'brass-telescope', x: 8.55, z: 6.45,
        interact: [
          tr('La lunette de Bugenhagen, braquée sur la coupole et non sur le ciel. « Le vrai, je le connais par cœur », dit-il.', 'Bugenhagen\'s telescope, trained on the dome rather than the sky. “The real one I know by heart,” he says.'),
          tr('Dans l\'oculaire, la géante aux anneaux passe, énorme. Elle ne fait que trente centimètres, en vrai.', 'Through the eyepiece, the ringed giant drifts by, enormous. It\'s barely a foot across, really.'),
        ],
      },
      {
        model: 'star-shelf', x: 7.82, z: 7.6, rot: 1,
        interact: [
          tr('Des grimoires d\'astronomie, reliés de cuir. L\'un s\'intitule « Les étoiles de la galaxie, tome 1 sur 400 milliards ».', 'Leather-bound astronomy tomes. One is titled “The Stars of the Galaxy, volume 1 of 400 billion”.'),
          tr('Un carnet de Bugenhagen, ouvert : des orbites calculées à la main, et dans la marge, « Ne pas oublier de manger ».', 'One of Bugenhagen\'s notebooks, open: orbits worked out by hand, and in the margin, “Remember to eat”.'),
        ],
      },
      {
        model: 'star-shelf', x: 7.82, z: 11.4, rot: 1,
        interact: tr('Des cartes du ciel roulées, des registres d\'observations, et un crâne de bête dont personne ne connaît l\'espèce. Pas même Bugenhagen, qui trouve ça très drôle.', 'Rolled-up star charts, observation logs, and a beast\'s skull of unknown species. Not even Bugenhagen knows, and he finds that hilarious.'),
      },
      {
        model: 'star-shelf', x: 13.6, z: 5.82,
        interact: tr('Sur le dos d\'un vieux livre : « Le Cycle de la vie des étoiles ». Les pages les plus usées parlent de la fin… et du recommencement.', 'On the spine of an old book: “The Life Cycle of Stars”. The most worn pages are about the end… and the new beginning.'),
      },
      { model: 'candles', x: 7.95, z: 9.5, solid: false },
      { model: 'candles', x: 14.75, z: 5.95, solid: false },
      // Les coussins des spectateurs, en cercle autour de l'hologramme (rayon 2,95, un tous les
      // 36°) ; aucun au nord : c'est le passage de la porte.
      ...(['mustard', 'teal', 'plum', 'rose', 'navy', 'terracotta', 'plum', 'teal', 'rose'] as const).map((label, i): Prop => {
        const a = ((i < 5 ? i : i + 1) * Math.PI) / 5
        return { model: 'floor-cushion', x: +(11.5 + 2.95 * Math.sin(a)).toFixed(2), z: +(9.5 + 2.95 * Math.cos(a)).toFixed(2), label }
      }),

      // --- Cinéma : le grand écran au nord, quatre rangées face à lui, le projecteur au fond ---
      { model: 'rug', x: 26, z: 4.5, label: 'cinema:6.7x7.7', solid: false },
      {
        model: 'cinema-screen', x: 26.2, z: 0.65, action: tr('Regarder', 'Watch'),
        interact: [
          tr('Ce soir : la bande-annonce en boucle. Le film ? Prochainement. Comme toujours.', 'Tonight: the trailer, on a loop. The film? Coming soon. As always.'),
          tr('Le Cobra passe devant la géante gazeuse. Toute la salle retient son souffle.', 'The Cobra crosses the gas giant. The whole room holds its breath.'),
          tr('Quelqu\'un chuchote : « C\'est tourné dans Colonia, en vrai. »', 'Someone whispers: “They actually shot it in Colonia.”'),
        ],
      },
      { model: 'cinema-row', x: 26.2, z: 3.46, rot: 2 },
      { model: 'cinema-row', x: 26.2, z: 4.46, rot: 2 },
      { model: 'cinema-row', x: 26.2, z: 5.46, rot: 2 },
      { model: 'cinema-row', x: 26.2, z: 6.46, rot: 2 },
      { model: 'projection-chair', x: 28.65, z: 7.55, rot: 2, action: tr('Prendre la régie', 'Take the controls'),
        interact: tr('Fauteuil de diffusion : choisissez la séance pour tout le bord.', 'Projection chair: choose the screening for everyone aboard.') },
      // Le projecteur, perché au mur du fond : son faisceau file jusqu'à la toile.
      { model: 'film-projector', x: 26.2, z: 8.35, rot: 2, label: '7.62', solid: false },
      {
        model: 'popcorn-machine', x: 23.1, z: 7.8, rot: 1, action: tr('Se servir', 'Help yourself'),
        interact: [
          tr('Un cornet de pop-corn, bien beurré. Il en tombe la moitié entre les fauteuils.', 'A cone of popcorn, well buttered. Half of it ends up between the seats.'),
          tr('Pop-corn sucré-salé : le seul compromis accepté par tout l\'équipage.', 'Sweet and salty popcorn: the only compromise the whole crew accepts.'),
          tr('La machine claque et crépite. Comète regarde les grains sauter, fascinée.', 'The machine pops and crackles. Comète watches the kernels jump, spellbound.'),
        ],
      },
      { model: 'movie-poster', x: 22.65, z: 1.6, rot: 1, label: 'hutton', solid: false },
      { model: 'sconce', x: 22.65, z: 2.3, rot: 1, solid: false },
      { model: 'movie-poster', x: 22.65, z: 3.0, rot: 1, label: 'thargoid', solid: false },
      { model: 'exit-sign', x: 22.65, z: 5.9, rot: 1, solid: false },
      { model: 'sconce', x: 22.65, z: 6.6, rot: 1, solid: false },
      { model: 'movie-poster', x: 22.65, z: 7.35, rot: 1, label: 'jameson', solid: false },
      { model: 'sconce', x: 29.35, z: 2.3, rot: 3, solid: false },
      { model: 'sconce', x: 29.35, z: 6.6, rot: 3, solid: false },

      // --- Foyer : le couloir du cinéma, tapis rouge et films à l'affiche ; au sud, le hall de la
      // zone sportive, d'où l'on entre sur les deux terrains ---
      { model: 'rug', x: 21.5, z: 5.5, label: 'cinema:1.5x5.6', solid: false },
      { model: 'neon-sign', x: 21.5, z: 2.68, label: tr('CINÉMA', 'CINEMA') },
      { model: 'plant-tall', x: 20.92, z: 2.92 },
      { model: 'movie-poster', x: 20.65, z: 3.6, rot: 1, label: 'jameson', solid: false },
      { model: 'sconce', x: 20.65, z: 6.3, rot: 1, solid: false },
      { model: 'movie-poster', x: 20.65, z: 7.1, rot: 1, label: 'hutton', solid: false },
      { model: 'movie-poster', x: 20.65, z: 7.9, rot: 1, label: 'thargoid', solid: false },
      {
        model: 'water-fountain', x: 17.92, z: 9, rot: 1,
        interact: tr('Fontaine à eau du hall : fraîche, et presque sans goût de vaisseau. On s\'y bouscule après un match.', 'The hall water cooler: cold, and almost free of that starship taste. There\'s a queue after every game.'),
      },
      {
        model: 'vending-machine', x: 27.28, z: 9, rot: 3,
        interact: [
          tr('Le distributeur du hall : boissons isotoniques, barres de céréales, et une canette de Lavian Brandy coincée depuis des mois.', 'The hall vending machine: isotonic drinks, cereal bars, and a can of Lavian Brandy that has been stuck for months.'),
          tr('Une affichette : « Après le sport, on s\'hydrate. Pas chez Jacques. »', 'A notice: “After sport, hydrate. Not at Jacques\'.”'),
        ],
      },

      // --- Terrain de basket : un demi-terrain, le panier sur sa glissière au mur ouest ; on tire
      // depuis la marque, face au panier (cf. src/court.ts, SPORT_COURTS) ---
      { model: 'court-floor', x: 19, z: 12.5, rot: 1, label: 'basket:5.7x6.7', solid: false },
      {
        model: 'basket-hoop', x: 15.66, z: SPORT_COURTS['gym-basket'].center, rot: 1, solid: false,
        interact: tr('Le panier coulisse sur sa glissière : plus le score monte, plus il se promène. Le filet a déjà été recousu trois fois.', 'The hoop slides along its rail: the higher the score, the more it wanders. The net has been stitched back up three times.'),
      },
      {
        model: 'shoot-spot', ...SPORT_COURTS['gym-basket'].spot, label: 'basket', solid: false, action: tr('Tirer au panier', 'Shoot hoops'),
        interact: tr('La marque du tireur.', 'The shooter\'s mark.'),
      },
      {
        model: 'ball-rack', x: 21.3, z: 13.7, rot: 3, label: 'basket', action: tr('Tirer au panier', 'Shoot hoops'),
        interact: tr('Le chariot à ballons.', 'The ball cart.'),
      },
      { model: 'score-board', x: 16.9, z: 9.65, label: 'basket', solid: false, interact: tr('Les meilleurs tireurs du bord', 'The ship\'s top shooters'), action: tr('Consulter le classement', 'View rankings') },
      { model: 'neon-sign', x: 21.15, z: 9.68, label: 'BASKET' },
      { model: 'bench', x: 21.15, z: 9.9, label: 'terracotta' },

      // --- Terrain de foot : la cage au mur ouest, et son gardien, une silhouette de carton sur un rail ---
      { model: 'court-floor', x: 26, z: 12.5, rot: 1, label: 'foot:5.7x6.7', solid: false },
      {
        model: 'foot-goal', x: 22.66, z: SPORT_COURTS['gym-foot'].center, rot: 1,
        interact: [
          tr('Le gardien est en carton. Il a pourtant arrêté plus de tirs que la moitié de l\'équipage.', 'The keeper is made of cardboard. He has still saved more shots than half the crew.'),
          tr('Sur le dos du carton, au feutre : « Propriété de Marcel. Ne pas viser la tête. »', 'On the back of the cutout, in marker: “Property of Marcel. Do not aim at the head.”'),
        ],
      },
      {
        model: 'shoot-spot', ...SPORT_COURTS['gym-foot'].spot, label: 'foot', solid: false, action: tr('Tirer au but', 'Take penalties'),
        interact: tr('Le point de penalty.', 'The penalty spot.'),
      },
      {
        model: 'ball-rack', x: 28.5, z: 13.7, rot: 3, label: 'foot', action: tr('Tirer au but', 'Take penalties'),
        interact: tr('Le chariot à ballons.', 'The ball cart.'),
      },
      { model: 'score-board', x: 24.1, z: 9.65, label: 'foot', solid: false, interact: tr('Les meilleurs buteurs du bord', 'The ship\'s top scorers'), action: tr('Consulter le classement', 'View rankings') },
      { model: 'neon-sign', x: 28.15, z: 9.68, label: 'FOOT' },
      { model: 'bench', x: 28.15, z: 9.9, label: 'teal' },
    ],
    lights: [
      [12, 4.6, '#ffd9a8', 2],
      [9.6, 2, '#ffcf99', 2.2],
      [14, 2.2, '#e6f6ff', 2],
      // Le planétarium : le soleil de l'hologramme, et les lueurs bleue et violette de la coupole.
      [11.5, 9.5, '#ffd58a', 2],
      [8.7, 12.4, '#7a80ff', 1.1],
      [14.3, 7.1, '#b07bff', 0.9],
      // La serre : les LED des bacs, le soleil de la pelouse, la lueur verte du massif.
      [4.6, 2.3, '#ffb3e6', 2.4],
      [1.4, 4.2, '#fff1c4', 2.3],
      [4.6, 6.2, '#d8ffc8', 1.8],
      // Le jardin exotique : le reflet de l'étang, le soleil de la plage.
      [3.55, 11.35, '#c4f2ff', 2.1],
      [1.2, 13, '#ffe2a8', 1.7],
      [6.4, 9.6, '#fff1c4', 1.6],
      [17.4, 5.4, '#ffb36b', 1.9, 'fire'],
      // Le studio, et la lueur du néon sur la vitre.
      [17.45, 1.9, '#fff0dc', 1.8],
      [17.2, 3.9, '#ff9a3c', 1.1, 'neon'],
      [26.2, 1.8, '#9fb8ff', 1.8, 'screen'],
      [23.4, 7.4, '#ffb45e', 0.9],
      [28.4, 5.4, '#ff9a5a', 0.5],
      // Le foyer et son hall, puis les projecteurs des deux terrains.
      [21.5, 5.6, '#ffb070', 1.3],
      [22.5, 9, '#fff0dc', 1.2],
      [19, 12.5, '#fff4e0', 2.4],
      [26, 12.5, '#f2fff4', 2.4],
    ],
  },
  QUARTERS_DECK,
]
