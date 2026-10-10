// Récupération de cargaison en zone thargoïde (SOC-06) : règles communes au relais, qui arbitre
// la partie (ennemis, colis, casiers, fusées, captures), et au client, qui la dessine.
//
// La baie infestée a un plan fixe (BAY) ; la graine que le relais tire au lancement y dispose les
// colis, les fusées, les ennemis et le décor, et chacun en construit exactement la même
// (générateur pseudo-aléatoire, entiers seulement). Une lettre par tuile, comme les ponts (cf.
// ship-map.js) : 'z' la baie, 'x' le sas d'extraction ; les conteneurs bloquent des tuiles
// entières (`blocked`), la vue comme le passage.
//
// Trois choses changent la façon de s'y déplacer :
// - les zones éclairées (BAY_LIT) : on y voit de loin, mais on y est vu de loin ;
// - la passerelle du hall de fret, surélevée : on n'y monte que par ses escaliers, et de là-haut,
//   on voit par-dessus les conteneurs (eux aussi voient qui s'y tient) ;
// - les sols : le verre brisé crisse sous les pas (un bruit, même en marchant), les flaques
//   caustiques ralentissent.

import { DIRS, ShipMap } from './ship-map.js'
import { lineOfSight } from './sight.js'

/** « Pont » de la baie infestée : sous la cale, hors du vaisseau (cf. LEVEL_HEIGHT côté client). */
export const ZONE_LEVEL = -2
/** Le lobby : le sas de la cale, pièce 'h' du pont -1 (cf. shared/ship-layouts.js). */
export const LOBBY = { level: -1, room: 'h' }
/** Où l'on revient dans le lobby (fin de partie, capture, abandon) : devant la porte blindée. */
export const LOBBY_RETURN = { x: 24, z: 0.9 }

/**
 * Chiffres de la partie (tuiles et secondes). Le mode léger n'y change rien : même vue, même bruit.
 * - vitesses du joueur (celles de src/player.ts) et ralentissement du porteur ;
 * - vue : rayon autour du joueur (il ne grandit pas avec le zoom), réduit dans un casier, et
 *   portée du regard sur une zone éclairée ;
 * - endurance : dépense en courant (plus en portant), récupération en marchant ou à l'arrêt,
 *   seuil à retrouver après l'épuisement ;
 * - bruit : portée d'écoute des ennemis (en chemin dans le labyrinthe, par-dessus les garde-corps) ;
 * - casiers, fusées d'appel, ennemis (vitesses, vue, cône, portée de capture, mémoire) ;
 * - la ruche : à chaque colis livré, les ennemis s'agitent un peu plus (jusqu'à `hive` au dernier).
 */
export const RULES = {
  /** Lobbys du sas : autant d'équipes qui peuvent se former (et partir) en même temps. */
  lobbies: 4,
  team: 4,
  parcels: { min: 1, max: 6 },
  enemies: { min: 1, max: 6 },
  walk: 1.7,
  sprint: 3.4,
  carry: 0.62,
  vision: 5.2,
  /** Caché : on voit dehors par les fentes du casier, un peu moins loin. */
  hiddenVision: 4.2,
  /** Une zone éclairée se voit de plus loin (en ligne de vue) que le reste de la baie. */
  litVision: 8.5,
  /** Hauteur de la passerelle ; au-delà de `high`, on voit (et l'on est vu) par-dessus les conteneurs. */
  deck: 0.5,
  high: 0.35,
  /** Flaque caustique : on y avance moins vite. */
  goo: 0.68,
  stamina: { drain: 0.13, carryDrain: 0.2, walkRegen: 0.15, idleRegen: 0.3, recover: 0.25 },
  /** glass : un pas sur du verre brisé ; lift : le monte-charge du sas, à chaque colis livré. */
  noise: { sprint: 6, carrySprint: 7, locker: 3, drop: 5, eject: 4.5, glass: 3.5, lift: 6 },
  /** betray : un poursuivant plus près que ça quand on s'y glisse le fouille ; plus loin, il perd sa trace. */
  locker: { max: 30, cooldown: 4, enter: 0.55, betray: 2 },
  flare: { carry: 2, burn: 15, radius: 12, range: 6.5 },
  monster: {
    patrol: 0.8, investigate: 1.2, chase: 2.0, lured: 1.6,
    sight: 4.2, fov: 0.5, sense: 1.1, touch: 0.45, memory: 2.5, attack: 1.6, search: 2.2, look: 3,
    /** Un joueur dans une zone éclairée se voit de plus loin (toujours dans le cône). */
    litSight: 6.5,
  },
  /**
   * La ruche s'agite : au dernier colis, patrouille et enquête plus rapides (speed), rôde plus
   * souvent du côté des joueurs (roam), oreille plus fine (hearing). La poursuite, elle, ne change pas.
   */
  hive: { speed: 0.3, roam: 0.35, hearing: 0.3 },
  /** Portée de la vue d'une caméra de surveillance (spectateurs), montée haut : par-dessus les conteneurs. */
  camera: 6,
  /** Portée pour ramasser un colis ou une fusée, se cacher dans un casier. */
  reach: 1.15,
  /** Au départ, personne n'est capturé tout de suite (le temps d'arriver et de se repérer). */
  grace: 8,
  /** Au-delà, la mission est annulée (partie oubliée, équipe coincée). */
  maxDuration: 1800,
  /** Une équipe se lance quelques secondes après que tous ses membres sont prêts. */
  countdown: 3,
  /** Après une déconnexion, la place d'un joueur en course l'attend ce temps-là (s). */
  reconnect: 60,
}

/** Récompense par membre d'une équipe victorieuse (cf. `salvage` dans economy.json, relu par le site). */
export function salvageReward(economy, parcels, enemies) {
  const e = economy ?? { parcel: 1000, enemyBonus: 0.3 }
  return Math.round((e.parcel * parcels * (1 + e.enemyBonus * (enemies - 1))) / 100) * 100
}

/**
 * Durée minimale (s) d'une mission réussie : plus rapide, ni le relais ni le site ne la paient.
 * `minPerParcel` secondes par tournée de colis, les membres portant en même temps (6 colis à
 * quatre : deux tournées). Le plus court aller-retour du sas à un colis prend déjà 20 s environ.
 */
export function salvageMinDuration(economy, parcels, team) {
  const per = economy?.minPerParcel ?? 15
  return per * Math.ceil(parcels / Math.max(1, team))
}

/**
 * Temps de référence (s) d'une mission, pour la note : une minute pour se repérer, puis 50 s par
 * tournée de colis (les membres portant ensemble).
 */
export function salvagePar(parcels, team) {
  return 60 + 50 * Math.ceil(parcels / Math.max(1, team))
}

/**
 * Note de fin de mission (S, A, B, C ou D) : S sans capture sous le temps de référence, A avec
 * au plus une capture sous une fois et demie ce temps, B pour toute autre victoire ; C pour une
 * défaite qui a rapporté au moins la moitié des colis, D sinon.
 * @param {{ won: boolean, delivered: number, parcels: number, team: number, duration: number, captures: number }} r
 */
export function salvageGrade(r) {
  if (!r.won) return r.delivered * 2 >= r.parcels && r.delivered > 0 ? 'C' : 'D'
  const par = salvagePar(r.parcels, r.team)
  if (r.captures === 0 && r.duration <= par) return 'S'
  if (r.captures <= 1 && r.duration <= par * 1.5) return 'A'
  return 'B'
}

/** Générateur pseudo-aléatoire (mulberry32) : même graine, même suite, dans Node comme dans le navigateur. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const int = (random, lo, hi) => lo + Math.floor(random() * (hi - lo + 1))
function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

/**
 * Plan de la baie, le même à chaque mission (36 × 26) : trois bandes séparées par des cloisons
 * percées de passages larges, et, au milieu, la grande allée qui la traverse d'ouest en est.
 * - Au nord : le hall de fret et sa passerelle surélevée (deux escaliers), les bureaux (salle de
 *   pause, local radio, open space) et la serre hydroponique, sous ses rampes violettes (éclairée).
 * - La grande allée, trois tuiles de large ; au milieu, le guichet de sécurité où s'est barricadé
 *   le technicien, sous la lumière ambrée du carrefour (éclairé).
 * - Au milieu : la salle des machines, l'aire de stockage (conteneurs) et le nid thargoïde
 *   (excroissances, flaques caustiques, cristaux), le coin le plus noir.
 * - Au sud : l'atelier, le quai de chargement et ses projecteurs (éclairé), le sas d'extraction
 *   au milieu du bord sud, et la zone effondrée (verre brisé) avec l'infirmerie de fortune.
 * Une lettre par tuile (colonne = x, ligne = z) :
 *   '.'  sol de la baie        'x'  sas d'extraction
 *   '#'  cloison (plein : ni sol, ni passage, ni vue)
 *   'L'  sol, avec un casier contre la paroi ou le conteneur voisin
 *   '='  conteneur couché (par paires, de gauche à droite)
 *   'H'  conteneur debout (par paires, de haut en bas)
 *   'c'  pile de fûts ou de caisses (une tuile)   'm'  générateur (une tuile)
 *   'p'  bac de culture de la serre : il bloque le passage, pas la vue
 *   'o'  excroissance thargoïde : haute, elle arrête tout, même le regard d'en haut
 *   'u'  passerelle (surélevée de RULES.deck)     'r'  escalier : monte vers la passerelle voisine
 *   'g'  guichet de sécurité : on y voit par la vitre, on n'y entre pas
 */
export const BAY = [
  'L...L....L..L#........#L...........L',
  '.==.==..==.==#........#.............',
  '.............#........#..pp..pp..pp.',
  '.ruuuuuuuuur.#........#.............',
  '.ruuuuuuuuur.#...........pp..pp..pp.',
  '....................................',
  '.H.==..==.H...........#..pp..pp..pp.',
  '.H........H.L#..ggg...#L...L....L..L',
  '###...##########ggg#########...#####',
  'L.......L..............L..........L.',
  '....................................',
  '..L.......L..c........L..c........L.',
  '#####...########...##########...####',
  'L...m..m...L#.==..H..==.#...o....o..',
  '.mm......mm.#.....H.......o....o....',
  '..............H.......H......o....o.',
  '.m..mm..m.....H..==...H.#..o....o...',
  'L.....L....L#L.........L#L......o..L',
  '####..##########...##########..#####',
  '........L.#L...........L#...c......L',
  '..........#.........................',
  '.....cc......cc.....cc....c.....c...',
  '........................#....c......',
  '.c........#.............#..c........',
  '..........#L....xxx....L#...........',
  'L...L...L.#.c...xxx...c.#L...L......',
]
/** Le sas : adossé au bord sud (2), ouvert vers le nord (0) par deux portes, la plateforme au fond. */
const BAY_AIRLOCK = { side: 2, inward: 0, pad: { x: 17, z: 25 }, doors: [{ x: 16, z: 24, dir: 0 }, { x: 18, z: 24, dir: 0 }] }

/**
 * Le guichet de sécurité : ses tuiles ('g'), la vitre (côté `window`, 2 : sud), où se tient le
 * technicien derrière, et où l'on se met pour lui parler, devant le comptoir.
 */
export const BAY_BOOTH = { x: 16, z: 7, w: 3, d: 2, window: 2, technician: { x: 17, z: 7.85 }, counter: { x: 17, z: 9 } }

/**
 * Petites pièces à l'éclairage de fortune : un rectangle de tuiles entouré de cloisons fines
 * (sauf aux portes : l'arête `dir` de la tuile x, z), une seule lampe qui vacille, et leurs
 * meubles (modèles du jeu, cf. src/furniture/) ; un meuble `block` occupe sa tuile, ou les tuiles
 * listées (ni passage, ni vue au sol). Côté client, un meuble arrête le joueur à sa taille réelle,
 * pas à celle de sa tuile ; sauf `solid: false` (marquages au sol, tuyaux, panneaux), il est solide.
 * Sur la tuile d'un meuble, bloquant ou non, on ne pose rien (ni colis, ni fusée, ni décor).
 */
export const BAY_ROOMS = [
  {
    id: 'pause', x: 14, z: 0, w: 4, d: 3, doors: [{ x: 15, z: 2, dir: 2 }, { x: 16, z: 2, dir: 2 }],
    light: { x: 16, z: 1, color: '#ffc875', intensity: 1.1, flicker: 'neon' },
    furniture: [
      // La table et ses bancs, en longueur le long de x : on passe derrière, et les portes restent libres.
      { model: 'canteen-table', x: 15.5, z: 1, rot: 0, block: [[15, 1], [16, 1]] },
      { model: 'water-fountain', x: 17, z: 0.2, rot: 0, block: true },
      { model: 'mug', x: 15.9, z: 1.05, y: 0.418, solid: false },
    ],
  },
  {
    id: 'radio', x: 18, z: 0, w: 4, d: 3, doors: [{ x: 19, z: 2, dir: 2 }, { x: 20, z: 2, dir: 2 }],
    light: { x: 19.5, z: 0.6, color: '#5fb4ff', intensity: 0.9, flicker: 'neon' },
    furniture: [
      { model: 'computer-system', x: 19, z: 0.25, rot: 0, block: true },
      { model: 'side-console', x: 20, z: 0.25, rot: 0, block: true },
      { model: 'chair', x: 19.5, z: 1.1, rot: 2 },
      { model: 'headphone-stand', x: 18.3, z: 0.3, rot: 0, solid: false },
    ],
  },
  {
    id: 'workshop', x: 0, z: 19, w: 4, d: 3, doors: [{ x: 3, z: 20, dir: 1 }],
    light: { x: 1.8, z: 19.6, color: '#ff9a3c', intensity: 1.2, flicker: 'fire' },
    furniture: [
      { model: 'workbench', x: 2, z: 19.25, rot: 0, block: true },
      { model: 'tool-rack', x: 0.25, z: 20.2, rot: 1, block: true },
      { model: 'work-lamp', x: 2.8, z: 21.3, rot: 3, solid: false },
      { model: 'crate', x: 2, z: 21.3, rot: 0, block: true },
    ],
  },
  {
    id: 'infirmary', x: 32, z: 22, w: 4, d: 4, doors: [{ x: 32, z: 23, dir: 3 }],
    light: { x: 34, z: 23.5, color: '#cfe8ff', intensity: 0.9, flicker: 'neon' },
    furniture: [
      // Le lit (en longueur le long de z) contre le mur est, la cantine à son pied.
      { model: 'bunk-bed', x: 35.15, z: 22.1, rot: 0, block: [[35, 22]] },
      { model: 'footlocker', x: 35.1, z: 23, rot: 0 },
      { model: 'wheelchair', x: 33.2, z: 24.4, rot: 1 },
      { model: 'stain', x: 34, z: 23.8, rot: 0, solid: false },
    ],
  },
]

/**
 * Meubles posés dans les grands espaces (comme ceux des petites pièces) : l'open space des
 * bureaux, les rampes et la cuve de la serre, les établis et la vapeur de la salle des machines,
 * les bâches de l'aire de stockage, les marquages au sol et les projecteurs du quai.
 */
export const BAY_PROPS = [
  // Open space des bureaux, entre les petites pièces et le guichet.
  { model: 'computer-wide', x: 14.2, z: 4, rot: 1, block: true },
  { model: 'chair', x: 14.95, z: 4.1, rot: 3 },
  { model: 'computer-wide', x: 20.8, z: 3, rot: 3, block: true },
  { model: 'chair', x: 20.05, z: 3.1, rot: 1 },
  { model: 'crew-board', x: 17.5, z: 2.7, rot: 0, solid: false },
  { model: 'k-box-open', x: 21.2, z: 6.2, rot: 1, block: true },
  // La serre : rampes de culture et cuve nutritive contre le mur nord.
  { model: 'hydro-rack', x: 27.5, z: 0.25, rot: 0, block: [[27, 0], [28, 0]] },
  { model: 'nutrient-tank', x: 30, z: 0.3, rot: 0, block: true },
  { model: 'hydro-rack', x: 32.5, z: 0.25, rot: 0, block: [[32, 0], [33, 0]] },
  { model: 'potting-bench', x: 24, z: 6.98, rot: 1, block: true },
  // Salle des machines.
  { model: 'engineer-bench', x: 3, z: 12.75, rot: 0, block: true },
  { model: 'steam-vent', x: 6, z: 15, rot: 0, solid: false },
  { model: 'pipe-run', x: 9, z: 12.6, rot: 0, solid: false },
  // Aire de stockage.
  { model: 'tarp-crates', x: 20, z: 15, rot: 1, block: true },
  // Le quai de chargement : aires de chargement et flèches peintes vers le sas, projecteurs aux quatre coins.
  { model: 'dock-marking', x: 13.5, z: 21, rot: 0, label: '2.8,1.6', solid: false },
  { model: 'dock-marking', x: 20.5, z: 21, rot: 0, label: '2.8,1.6', solid: false },
  { model: 'floor-arrow', x: 17, z: 19.5, rot: 0, solid: false },
  { model: 'floor-arrow', x: 17, z: 22, rot: 0, solid: false },
  { model: 'floor-arrow', x: 17, z: 14.2, rot: 0, solid: false },
  { model: 'floodlight', x: 11.25, z: 20.2, rot: 1, label: '#fff0d6', solid: false },
  { model: 'floodlight', x: 22.75, z: 20.2, rot: 3, label: '#fff0d6', solid: false },
  { model: 'floodlight', x: 11.25, z: 23.6, rot: 1, label: '#fff0d6', solid: false },
  { model: 'floodlight', x: 22.75, z: 23.6, rot: 3, label: '#fff0d6', solid: false },
  // Le carrefour du guichet, dans la grande allée.
  { model: 'floodlight', x: 13.3, z: 9.25, rot: 0, label: '#ffcf7a', solid: false },
  { model: 'floodlight', x: 20.7, z: 9.25, rot: 0, label: '#ffcf7a', solid: false },
]

/**
 * Coins de la baie, chacun son décor au sol (tiré par la graine) et ses lueurs. Le premier qui
 * contient une tuile la nomme (cf. le cartouche du pont côté client).
 */
export const BAY_AREAS = [
  { id: 'freight', x: 0, z: 0, w: 13, d: 8, density: 0.12, decor: ['cables', 'barrel', 'barrel', 'debris'], lights: [{ x: 6, z: 0.4, color: '#7fa6d6', intensity: 0.7, flicker: 'neon' }] },
  { id: 'offices', x: 14, z: 3, w: 8, d: 5, density: 0.22, decor: ['papers', 'papers', 'cables'], lights: [{ x: 17.5, z: 4.6, color: '#dfe9ff', intensity: 0.8, flicker: 'neon' }] },
  { id: 'greenhouse', x: 23, z: 0, w: 13, d: 8, density: 0.16, decor: ['soil', 'soil', 'debris'], lights: [] },
  { id: 'avenue', x: 0, z: 9, w: 36, d: 3, density: 0.05, decor: ['cables', 'barrel', 'debris'], lights: [{ x: 3, z: 9.2, color: '#ff3322', intensity: 0.7, flicker: 'neon' }, { x: 31, z: 9.2, color: '#ff3322', intensity: 0.7, flicker: 'neon' }] },
  { id: 'machines', x: 0, z: 13, w: 12, d: 5, density: 0.16, decor: ['cables', 'cables', 'barrel', 'debris'], lights: [{ x: 6, z: 15.6, color: '#ff5a36', intensity: 0.9, flicker: 'fire' }] },
  { id: 'storage', x: 13, z: 13, w: 11, d: 5, density: 0.1, decor: ['barrel', 'debris', 'cables'], lights: [] },
  { id: 'nest', x: 25, z: 13, w: 11, d: 5, density: 0.4, decor: ['crystals', 'crystals', 'goo', 'goo', 'goo', 'bones'], lights: [{ x: 30.5, z: 14.4, color: '#39ff88', intensity: 0.9, flicker: 'neon' }, { x: 27, z: 16.6, color: '#2fd873', intensity: 0.7 }] },
  { id: 'workshop', x: 0, z: 19, w: 10, d: 7, density: 0.12, decor: ['cables', 'debris', 'barrel'], lights: [{ x: 6.5, z: 23, color: '#ffaa55', intensity: 0.6, flicker: 'neon' }] },
  { id: 'dock', x: 11, z: 19, w: 13, d: 7, density: 0.04, decor: ['barrel', 'cables'], lights: [] },
  { id: 'collapse', x: 25, z: 19, w: 11, d: 7, density: 0.3, decor: ['glass', 'glass', 'glass', 'debris', 'debris', 'bones', 'cables'], lights: [{ x: 28.4, z: 21.2, color: '#ffaa55', intensity: 0.8, flicker: 'neon' }] },
]

/**
 * Zones éclairées : des projecteurs qui marchent encore. On y voit de loin (RULES.litVision), et
 * un ennemi y voit de loin qui s'y tient (RULES.monster.litSight). Leurs lampes sont fortes : le
 * client les allume en priorité.
 */
export const BAY_LIT = [
  { id: 'greenhouse', x: 23, z: 0, w: 13, d: 8, color: '#e08cff', intensity: 2.6, lamps: [{ x: 26, z: 2 }, { x: 32, z: 2 }, { x: 26, z: 5.6 }, { x: 32, z: 5.6 }] },
  { id: 'crossroads', x: 13, z: 9, w: 9, d: 3, color: '#ffcf7a', intensity: 3, lamps: [{ x: 14.5, z: 10 }, { x: 19.5, z: 10 }] },
  { id: 'dock', x: 11, z: 19, w: 13, d: 7, color: '#fff0d6', intensity: 4, lamps: [{ x: 13, z: 20.6 }, { x: 21, z: 20.6 }, { x: 13, z: 23.4 }, { x: 21, z: 23.4 }] },
]

/**
 * Caméras de surveillance de la baie : ceux qui ont été capturés les suivent du lobby, en plus
 * des caméras de leurs coéquipiers. Montées haut, elles voient par-dessus les conteneurs.
 */
export const BAY_CAMERAS = [
  { id: 'dock', x: 17, z: 21.6 },
  { id: 'avenue-west', x: 7, z: 10 },
  { id: 'crossroads', x: 17, z: 10.4 },
  { id: 'avenue-east', x: 28, z: 10 },
  { id: 'freight', x: 6, z: 3.5 },
  { id: 'greenhouse', x: 28, z: 3 },
  { id: 'machines', x: 6, z: 15.2 },
  { id: 'storage', x: 18, z: 15.4 },
  { id: 'nest', x: 30, z: 15 },
  { id: 'collapse', x: 30, z: 21 },
]

/** Sols qui comptent : le verre brisé crisse (FX.glass), la flaque caustique ralentit (FX.goo). */
export const FX = { none: 0, glass: 1, goo: 2 }
const areaOf = (x, z) => BAY_AREAS.find((a) => x >= a.x && z >= a.z && x < a.x + a.w && z < a.z + a.d) ?? null

/**
 * La baie d'une mission : le plan fixe (BAY), et ce que la graine y dispose (colis, fusées,
 * ennemis, décor), différent à chaque partie.
 * @param {number} seed graine choisie par le relais
 * @param {{ team: number, parcels: number, enemies: number }} settings
 */
export function generateZone(seed, settings) {
  const random = mulberry32(seed)
  const team = clampInt(settings.team, 1, RULES.team)
  const parcels = clampInt(settings.parcels, RULES.parcels.min, RULES.parcels.max)
  const enemies = clampInt(settings.enemies, RULES.enemies.min, RULES.enemies.max)
  const H = BAY.length, W = BAY[0].length
  const N = W * H
  const idx = (x, z) => z * W + x
  const inside = (x, z) => x >= 0 && z >= 0 && x < W && z < H
  const cell = (x, z) => (inside(x, z) ? BAY[z][x] : '#')
  const room = new Array(N)
  const blocked = new Uint8Array(N)
  const booth = new Uint8Array(N)
  const low = new Uint8Array(N)
  const tall = new Uint8Array(N)
  const elev = new Float32Array(N)
  const stairs = new Int8Array(N).fill(-1)
  const lit = new Uint8Array(N)
  const fx = new Uint8Array(N)
  const furnished = new Uint8Array(N)
  const hall = new Int16Array(N)
  const open = new Uint8Array(N * 4)
  const rail = new Uint8Array(N * 4)
  const airlock = []
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const c = cell(x, z)
      const i = idx(x, z)
      room[i] = c === 'x' ? 'x' : c === '#' ? ' ' : 'z'
      if (c === 'x') airlock.push({ x, z })
      if ('=Hcm#gpo'.includes(c)) blocked[i] = 1
      if (c === 'g') booth[i] = 1
      if (c === 'p') low[i] = 1
      if (c === '#' || c === 'o') tall[i] = 1
      if (c === 'u') elev[i] = RULES.deck
      if (c === 'r') elev[i] = RULES.deck / 2
    }
  }
  for (const l of BAY_LIT) {
    for (let z = l.z; z < l.z + l.d; z++) for (let x = l.x; x < l.x + l.w; x++) if (inside(x, z) && room[idx(x, z)] !== ' ') lit[idx(x, z)] = 1
  }
  // Escaliers : ils montent vers la passerelle voisine ; le bas donne sur le sol de la baie.
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (cell(x, z) !== 'r') continue
      const up = [0, 1, 2, 3].find((d) => cell(x + DIRS[d].dx, z + DIRS[d].dz) === 'u')
      const down = up === undefined ? '#' : cell(x - DIRS[up].dx, z - DIRS[up].dz)
      if (up === undefined || !'.L'.includes(down)) throw new Error(`Escalier mal placé en (${x}, ${z})`)
      stairs[idx(x, z)] = up
    }
  }
  // Sol d'un seul tenant dans une même pièce ; le sas ne s'ouvre que par ses portes.
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      for (let dir = 0; dir < 4; dir++) {
        const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
        if (inside(nx, nz) && room[idx(x, z)] !== ' ' && room[idx(x, z)] === room[idx(nx, nz)]) open[idx(x, z) * 4 + dir] = 1
      }
    }
  }
  const doors = BAY_AIRLOCK.doors.map((d) => ({ ...d }))
  for (const d of doors) {
    open[idx(d.x, d.z) * 4 + d.dir] = 1
    open[idx(d.x + DIRS[d.dir].dx, d.z + DIRS[d.dir].dz) * 4 + ((d.dir + 2) % 4)] = 1
  }
  const isOpen = (x, z, dir) => open[idx(x, z) * 4 + dir] === 1
  const walls = []
  const wallUp = (x, z, dir) => {
    const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
    if (!inside(nx, nz) || !isOpen(x, z, dir)) return
    open[idx(x, z) * 4 + dir] = 0
    open[idx(nx, nz) * 4 + ((dir + 2) % 4)] = 0
    walls.push(dir === 1 || dir === 2 ? { x, z, dir } : { x: nx, z: nz, dir: (dir + 2) % 4 })
  }
  // Petites pièces : cloisons fines tout autour, sauf aux portes ; leurs meubles occupent leur tuile.
  for (const r of BAY_ROOMS) {
    const within = (x, z) => x >= r.x && z >= r.z && x < r.x + r.w && z < r.z + r.d
    for (let z = r.z; z < r.z + r.d; z++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        for (let dir = 0; dir < 4; dir++) {
          if (within(x + DIRS[dir].dx, z + DIRS[dir].dz)) continue
          if (r.doors.some((d) => d.x === x && d.z === z && d.dir === dir)) continue
          wallUp(x, z, dir)
        }
      }
    }
  }
  for (const f of [...BAY_ROOMS.flatMap((r) => r.furniture), ...BAY_PROPS]) {
    if (f.solid !== false) furnished[idx(Math.round(f.x), Math.round(f.z))] = 1
    if (!f.block) continue
    for (const [x, z] of f.block === true ? [[Math.round(f.x), Math.round(f.z)]] : f.block) {
      blocked[idx(x, z)] = 1
      furnished[idx(x, z)] = 1
    }
  }
  // Le guichet : cloisonné, sauf la vitre (le passage reste fermé : ses tuiles sont bloquées).
  for (let z = BAY_BOOTH.z; z < BAY_BOOTH.z + BAY_BOOTH.d; z++) {
    for (let x = BAY_BOOTH.x; x < BAY_BOOTH.x + BAY_BOOTH.w; x++) {
      for (let dir = 0; dir < 4; dir++) {
        const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
        if (inside(nx, nz) && booth[idx(nx, nz)]) continue
        if (dir !== BAY_BOOTH.window) wallUp(x, z, dir)
      }
    }
  }
  // Garde-corps : la passerelle ne se rejoint que par ses escaliers (et un escalier que par son
  // bas et son haut, ou par l'escalier jumeau d'à côté). La vue et le bruit passent au-dessus.
  const tier = (x, z) => (cell(x, z) === 'u' ? 'u' : cell(x, z) === 'r' ? 'r' : 'g')
  const joins = (x, z, dir) => {
    const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
    const a = tier(x, z), b = tier(nx, nz)
    const sa = stairs[idx(x, z)], sb = inside(nx, nz) ? stairs[idx(nx, nz)] : -1
    if (a === b && a !== 'r') return true
    if (a === 'r' && b === 'u') return sa === dir
    if (a === 'u' && b === 'r') return sb === (dir + 2) % 4
    if (a === 'r' && b === 'g') return sa === (dir + 2) % 4
    if (a === 'g' && b === 'r') return sb === dir
    return a === 'r' && b === 'r' && sa === sb && dir % 2 !== sa % 2
  }
  const rails = []
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (tier(x, z) === 'g') continue
      for (let dir = 0; dir < 4; dir++) {
        const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
        if (!inside(nx, nz) || !isOpen(x, z, dir) || joins(x, z, dir)) continue
        const back = idx(nx, nz) * 4 + ((dir + 2) % 4)
        if (rail[back]) continue
        rail[idx(x, z) * 4 + dir] = 1
        rail[back] = 1
        rails.push({ x, z, dir })
      }
    }
  }

  // Conteneurs : les paires de '=' (couchés) et de 'H' (debout), les piles de caisses, les bacs de
  // la serre et les excroissances du nid. Couleurs tirées de la position : la baie a toujours la
  // même allure.
  const containers = []
  const done = new Uint8Array(N)
  const KIND = { '=': 'container', H: 'container', c: 'crates', m: 'crates', p: 'planter', o: 'growth' }
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const c = cell(x, z)
      if (done[idx(x, z)] || !KIND[c]) continue
      const w = c === '=' ? 2 : 1, d = c === 'H' ? 2 : 1
      for (let tz = z; tz < z + d; tz++) for (let tx = x; tx < x + w; tx++) done[idx(tx, tz)] = 1
      // Un générateur est la pile de variante 0 (cf. src/salvage/kit.ts).
      const tint = c === 'm' ? 0 : (x * 7 + z * 13) % 3
      containers.push({ x, z, w, d, kind: KIND[c], color: tint, flip: c !== 'm' && (x + z) % 2 === 1 })
    }
  }

  const layout = BAY.map((line) => line.replace(/#/g, ' ').replace(/[^x ]/g, 'z'))
  const zone = {
    seed, width: W, height: H, team, parcels, enemies,
    layout, walls, doors, booth, rooms: BAY_ROOMS, areas: BAY_AREAS, props: BAY_PROPS, lights: BAY_LIT, cameras: BAY_CAMERAS,
    airlock: { side: BAY_AIRLOCK.side, tiles: airlock, pad: { ...BAY_AIRLOCK.pad }, inward: BAY_AIRLOCK.inward },
    halls: [], containers, blocked, low, tall, elev, stairs, lit, fx, furnished, open, rail, rails, room, hall,
    lockers: [], flares: [], cargo: [], monsters: [], decor: [],
  }
  buildGraph(zone)

  // Casiers : ceux du plan, adossés de préférence à la paroi de la baie, sinon au conteneur voisin.
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (cell(x, z) !== 'L') continue
      const against = [0, 1, 2, 3].filter((dir) => !inside(x + DIRS[dir].dx, z + DIRS[dir].dz) || !isOpen(x, z, dir))
      const behind = against.length ? against : [0, 1, 2, 3].filter((dir) => blocked[idx(x + DIRS[dir].dx, z + DIRS[dir].dz)])
      zone.lockers.push({ id: zone.lockers.length, x, z, dir: behind[0] })
    }
  }

  const fromAirlock = distances(zone, zone.doors.map((d) => ({ x: d.x + DIRS[d.dir].dx, z: d.z + DIRS[d.dir].dz })))
  const dist = (t) => fromAirlock[idx(t.x, t.z)]
  const taken = new Set(zone.lockers.map((l) => `${l.x},${l.z}`))
  const key = (t) => `${t.x},${t.z}`
  // Devant les portes du sas et devant le comptoir du guichet, on ne pose rien.
  const nearDoor = (t) => zone.doors.some((d) => Math.abs(t.x - d.x - DIRS[d.dir].dx) + Math.abs(t.z - d.z - DIRS[d.dir].dz) <= 1)
    || (t.z === BAY_BOOTH.z + BAY_BOOTH.d && t.x >= BAY_BOOTH.x - 1 && t.x <= BAY_BOOTH.x + BAY_BOOTH.w)
  const free = (t) => room[idx(t.x, t.z)] === 'z' && !blocked[idx(t.x, t.z)] && !furnished[idx(t.x, t.z)] && !taken.has(key(t)) && !nearDoor(t)
  const tiles = (keep) => {
    const out = []
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (free({ x, z }) && keep({ x, z })) out.push({ x, z })
    return out
  }
  // Un coin à l'abri : au moins deux côtés fermés (paroi, conteneur), pas au milieu d'un passage.
  const sheltered = (t) => [0, 1, 2, 3].filter((dir) => !walkable(zone, t.x + DIRS[dir].dx, t.z + DIRS[dir].dz)).length >= 2
  const flat = (t) => stairs[idx(t.x, t.z)] < 0

  // Colis : loin du sas (le retour est le plus risqué), à l'abri contre une paroi, écartés.
  const far = Math.max(...Array.from(fromAirlock).filter((d) => d >= 0))
  let cargoSpots = tiles((t) => dist(t) >= far * 0.45 && sheltered(t) && flat(t))
  if (cargoSpots.length < parcels) cargoSpots = tiles((t) => dist(t) >= 4 && flat(t))
  for (const t of spread(cargoSpots, parcels, [BAY_AIRLOCK.pad], random)) {
    zone.cargo.push({ id: zone.cargo.length, x: t.x, z: t.z })
    taken.add(key(t))
  }

  // Fusées d'appel : réparties dans toute la baie.
  for (const t of spread(tiles(flat), 4 + team + Math.floor(parcels / 2), [BAY_AIRLOCK.pad, ...zone.cargo], random)) {
    zone.flares.push({ id: zone.flares.length, x: t.x, z: t.z })
    taken.add(key(t))
  }

  // Ennemis : loin du sas, répartis.
  for (const t of spread(tiles((t) => dist(t) >= 9), enemies, [BAY_AIRLOCK.pad], random)) zone.monsters.push({ id: zone.monsters.length, x: t.x, z: t.z })

  // Décor : câbles, ossements, cristaux thargoïdes, fûts renversés, papiers, terreau, verre brisé,
  // flaques ; celui de chaque coin (cf. BAY_AREAS), jamais sur un passage entre deux coins, sur la
  // passerelle, ni dans les petites pièces (elles ont leurs meubles). Le verre et les flaques couvrent leur tuile,
  // et comptent (FX) : les autres se rangent contre une paroi.
  const inRoom = (x, z) => BAY_ROOMS.some((r) => x >= r.x && z >= r.z && x < r.x + r.w && z < r.z + r.d)
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const area = areaOf(x, z)
      const i = idx(x, z)
      if (!area || room[i] !== 'z' || blocked[i] || furnished[i] || elev[i] > 0 || taken.has(key({ x, z })) || nearDoor({ x, z }) || inRoom(x, z) || random() > area.density) continue
      const walled = [0, 1, 2, 3].filter((dir) => !walkable(zone, x + DIRS[dir].dx, z + DIRS[dir].dz))
      const kind = area.decor[Math.floor(random() * area.decor.length)]
      const covers = kind === 'glass' || kind === 'goo'
      // Contre une paroi ou un conteneur quand il y en a un : on passe au milieu.
      const dir = walled.length && !covers ? walled[Math.floor(random() * walled.length)] : -1
      const lateral = (random() - 0.5) * 0.4
      const px = dir < 0 ? x + (random() - 0.5) * 0.3 : x + DIRS[dir].dx * 0.26 + (DIRS[dir].dz ? lateral : 0)
      const pz = dir < 0 ? z + (random() - 0.5) * 0.3 : z + DIRS[dir].dz * 0.26 + (DIRS[dir].dx ? lateral : 0)
      zone.decor.push({ kind, x: round3(covers ? x : px), z: round3(covers ? z : pz), rot: int(random, 0, 3), wall: dir })
      if (kind === 'glass') fx[i] = FX.glass
      else if (kind === 'goo') fx[i] = FX.goo
    }
  }
  return zone
}

const round3 = (v) => Math.round(v * 1000) / 1000
function clampInt(v, lo, hi) {
  const n = Number.isInteger(v) ? v : lo
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Choisit `count` tuiles parmi `spots`, aussi loin que possible les unes des autres et des
 * points `away` (tirage du plus éloigné, avec un peu de hasard).
 */
function spread(spots, count, away, random) {
  const chosen = []
  const pool = [...spots]
  while (chosen.length < count && pool.length) {
    let best = -1, bestScore = -Infinity
    for (let i = 0; i < pool.length; i++) {
      const t = pool[i]
      let d = Infinity
      for (const o of [...away, ...chosen]) d = Math.min(d, Math.abs(t.x - o.x) + Math.abs(t.z - o.z))
      const score = (d === Infinity ? 100 : d) + random() * 3
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    chosen.push(pool[best])
    pool.splice(best, 1)
  }
  return chosen
}

/**
 * Graphe de la baie : voisins accessibles de chaque tuile (4 directions ; -1 : mur, bord,
 * conteneur, garde-corps), pour les joueurs et pour les ennemis (qui n'entrent pas dans le sas),
 * et pour le bruit, qui passe par-dessus les garde-corps.
 */
function buildGraph(zone) {
  const { width: W, height: H } = zone
  const N = W * H
  const inside = (x, z) => x >= 0 && z >= 0 && x < W && z < H
  zone.adj = new Int32Array(N * 4).fill(-1)
  zone.monsterAdj = new Int32Array(N * 4).fill(-1)
  zone.hearAdj = new Int32Array(N * 4).fill(-1)
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x
      if (zone.blocked[i]) continue
      for (let dir = 0; dir < 4; dir++) {
        const e = i * 4 + dir
        if (!zone.open[e]) continue
        const j = (z + DIRS[dir].dz) * W + x + DIRS[dir].dx
        if (zone.blocked[j]) continue
        const bay = zone.room[i] === 'z' && zone.room[j] === 'z'
        if (bay) zone.hearAdj[e] = j
        if (zone.rail[e]) continue
        zone.adj[e] = j
        if (bay) zone.monsterAdj[e] = j
      }
    }
  }
  zone.map = new ShipMap(zone.layout, { walls: zone.walls, doors: zone.doors })
  const room = (x, z) => (inside(x, z) ? zone.room[z * W + x] : null)
  const edgeOf = (pass) => (x, z, dir) => {
    const nx = x + DIRS[dir].dx, nz = z + DIRS[dir].dz
    if (!inside(x, z) || !inside(nx, nz)) return 'wall'
    return pass(z * W + x, nz * W + nx, (z * W + x) * 4 + dir) ? 'open' : 'wall'
  }
  // Plans « de vue » (des milliers de rayons à chaque image pour la vue du joueur, lus dans les
  // tableaux de la baie). Au sol, un conteneur arrête le regard comme un mur (il se voit, pas ce
  // qu'il cache) ; la vitre du guichet, un bac de la serre ou un garde-corps, non. D'en haut (la
  // passerelle), seuls les cloisons et les excroissances du nid l'arrêtent.
  const seeThrough = (i) => !zone.blocked[i] || !!zone.booth[i] || !!zone.low[i]
  zone.sightMap = {
    isFloor: (x, z) => inside(x, z) && seeThrough(z * W + x),
    room,
    edge: edgeOf((i, j, e) => zone.open[e] && seeThrough(i) && seeThrough(j)),
  }
  zone.highSightMap = {
    isFloor: (x, z) => inside(x, z) && !zone.tall[z * W + x],
    room,
    edge: edgeOf((i, j, e) => zone.open[e] && !zone.tall[i] && !zone.tall[j]),
  }
  // Plan « de marche » : pour filer tout droit, chaque arête franchie doit être un passage.
  zone.walkMap = {
    isFloor: (x, z) => walkable(zone, x, z),
    room,
    edge: edgeOf((i, j, e) => zone.adj[e] >= 0),
  }
}

/** Tuile (x, z) de la baie : null hors du plan. */
export function tileOf(zone, p) {
  const x = Math.round(p.x), z = Math.round(p.z)
  return x >= 0 && z >= 0 && x < zone.width && z < zone.height ? { x, z } : null
}

/** On peut s'y tenir : sol de la baie ou du sas, sans conteneur. */
export function walkable(zone, x, z) {
  return x >= 0 && z >= 0 && x < zone.width && z < zone.height && !zone.blocked[z * zone.width + x]
}

/** Dans le sas d'extraction (la zone sûre) ? */
export function inAirlock(zone, p) {
  const t = tileOf(zone, p)
  return !!t && zone.room[t.z * zone.width + t.x] === 'x'
}

/** Hauteur du sol en `p` : celle de la passerelle, qui monte le long d'un escalier. */
export function groundHeight(zone, p) {
  const t = tileOf(zone, p)
  if (!t) return 0
  const i = t.z * zone.width + t.x
  const up = zone.stairs[i]
  if (up < 0) return zone.elev[i]
  const s = (p.x - t.x) * DIRS[up].dx + (p.z - t.z) * DIRS[up].dz
  return RULES.deck * Math.min(1, Math.max(0, s + 0.5))
}

/** En hauteur (sur la passerelle, ou en haut de ses escaliers) : on y voit par-dessus les conteneurs. */
export function elevated(zone, p) {
  return groundHeight(zone, p) > RULES.high
}

/** Tuile d'une zone éclairée ? */
export function isLit(zone, p) {
  const t = tileOf(zone, p)
  return !!t && zone.lit[t.z * zone.width + t.x] === 1
}

/** Ce que le sol fait sous les pieds en `p` (cf. FX) : verre qui crisse, flaque qui ralentit. */
export function floorFx(zone, p) {
  const t = tileOf(zone, p)
  return t ? zone.fx[t.z * zone.width + t.x] : FX.none
}

/**
 * Distances (en tuiles de chemin) depuis `sources` ; -1 : inaccessible.
 * @param {{ monster?: boolean, hear?: boolean, max?: number }} [options] monster : sans entrer dans
 *   le sas ; hear : le chemin du bruit (sans entrer dans le sas, par-dessus les garde-corps)
 */
export function distances(zone, sources, options = {}) {
  const adj = options.hear ? zone.hearAdj : options.monster ? zone.monsterAdj : zone.adj
  const max = options.max ?? Infinity
  const out = new Int16Array(zone.width * zone.height).fill(-1)
  const queue = []
  for (const s of sources) {
    const t = tileOf(zone, s)
    if (!t) continue
    const i = t.z * zone.width + t.x
    if (out[i] >= 0) continue
    out[i] = 0
    queue.push(i)
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    if (out[i] >= max) continue
    for (let dir = 0; dir < 4; dir++) {
      const j = adj[i * 4 + dir]
      if (j < 0 || out[j] >= 0) continue
      out[j] = out[i] + 1
      queue.push(j)
    }
  }
  return out
}

/**
 * Chemin de tuiles de `from` à `to` (inclus), le plus court ; null s'il n'y en a pas.
 * @param {{ monster?: boolean }} [options]
 */
export function findPath(zone, from, to, options = {}) {
  const a = tileOf(zone, from), b = tileOf(zone, to)
  if (!a || !b) return null
  const W = zone.width
  const adj = options.monster ? zone.monsterAdj : zone.adj
  const start = a.z * W + a.x, goal = b.z * W + b.x
  if (zone.blocked[goal]) return null
  const came = new Int32Array(W * zone.height).fill(-1)
  came[start] = start
  const queue = [start]
  for (let head = 0; head < queue.length && came[goal] < 0; head++) {
    const i = queue[head]
    for (let dir = 0; dir < 4; dir++) {
      const j = adj[i * 4 + dir]
      if (j < 0 || came[j] >= 0) continue
      came[j] = i
      queue.push(j)
    }
  }
  if (came[goal] < 0) return null
  const path = []
  for (let i = goal; ; i = came[i]) {
    path.push({ x: i % W, z: Math.floor(i / W) })
    if (i === start) break
  }
  return path.reverse()
}

/**
 * D'où l'on regarde : `p`, ou, s'il déborde sur une tuile bloquée (au ras d'un meuble plus petit
 * que sa tuile), le point le plus proche d'une tuile libre voisine ; sans quoi la ligne de vue
 * partirait de l'intérieur de l'obstacle, et l'on ne verrait plus rien.
 */
export function sightOrigin(zone, p) {
  const x = Math.round(p.x), z = Math.round(p.z)
  if (walkable(zone, x, z)) return p
  if (x < 0 || z < 0 || x >= zone.width || z >= zone.height) return p
  // Une voisine du même côté des cloisons (arête ouverte), jamais à travers une cloison.
  let best = null, bestD = Infinity
  for (let dir = 0; dir < 4; dir++) {
    const tx = x + DIRS[dir].dx, tz = z + DIRS[dir].dz
    if (!zone.open[(z * zone.width + x) * 4 + dir] || !walkable(zone, tx, tz)) continue
    const q = { x: Math.min(tx + 0.45, Math.max(tx - 0.45, p.x)), z: Math.min(tz + 0.45, Math.max(tz - 0.45, p.z)) }
    const d = Math.hypot(q.x - p.x, q.z - p.z)
    if (d < bestD) {
      bestD = d
      best = q
    }
  }
  return best ?? p
}

/**
 * Rien ne sépare `from` de `to` : ni mur, ni conteneur (un conteneur visé se voit lui-même). Si
 * l'un des deux est en hauteur (ou `high` : une caméra montée au plafond), les conteneurs
 * n'arrêtent plus le regard.
 */
export function zoneSight(zone, from, to, high) {
  const up = high ?? (elevated(zone, from) || elevated(zone, to))
  return lineOfSight(up ? zone.highSightMap : zone.sightMap, from, to)
}

/**
 * Ligne droite praticable (pour lisser un chemin) : chaque arête franchie est un passage, au
 * centre et de part et d'autre, à la largeur d'un marcheur.
 */
export function straightWalk(zone, from, to, radius = 0.2) {
  const dx = to.x - from.x, dz = to.z - from.z
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return true
  const ox = (-dz / len) * radius, oz = (dx / len) * radius
  for (const k of [0, 1, -1]) {
    const a = { x: from.x + ox * k, z: from.z + oz * k }, b = { x: to.x + ox * k, z: to.z + oz * k }
    if (!walkable(zone, Math.round(a.x), Math.round(a.z)) || !walkable(zone, Math.round(b.x), Math.round(b.z))) return false
    if (!lineOfSight(zone.walkMap, a, b)) return false
  }
  return true
}

/** Raccourcit un chemin de tuiles : on file tout droit tant que c'est praticable. */
export function smoothPath(zone, from, tiles) {
  const out = []
  let at = from
  let i = 0
  while (i < tiles.length) {
    let j = tiles.length - 1
    while (j > i && !straightWalk(zone, at, tiles[j])) j--
    out.push(tiles[j])
    at = tiles[j]
    i = j + 1
  }
  return out
}

/**
 * Où les joueurs apparaissent : des tuiles au hasard, loin des ennemis (en chemin), hors du sas et
 * écartées les unes des autres.
 */
export function pickSpawns(zone, count, monsters, random) {
  const fromMonsters = distances(zone, monsters)
  const W = zone.width
  const lockerTiles = new Set(zone.lockers.map((l) => `${l.x},${l.z}`))
  let min = 8
  let spots = []
  while (min >= 3) {
    spots = []
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < W; x++) {
        const i = z * W + x
        if (zone.room[i] !== 'z' || zone.blocked[i] || zone.furnished[i] || zone.stairs[i] >= 0 || lockerTiles.has(`${x},${z}`)) continue
        if (fromMonsters[i] >= 0 && fromMonsters[i] < min) continue
        spots.push({ x, z })
      }
    }
    if (spots.length >= count) break
    min--
  }
  const chosen = []
  for (const t of shuffle(spots, random)) {
    if (chosen.length >= count) break
    if (chosen.every((o) => Math.abs(o.x - t.x) + Math.abs(o.z - t.z) >= 3)) chosen.push(t)
  }
  while (chosen.length < count && spots.length) chosen.push(spots[chosen.length % spots.length])
  return chosen
}

/** Place d'un casier : au fond de sa tuile, contre son mur ; on s'y cache en son centre. */
export function lockerSpot(locker) {
  return { x: locker.x + DIRS[locker.dir].dx * 0.2, z: locker.z + DIRS[locker.dir].dz * 0.2 }
}

/** Devant le casier, où l'on en sort (et d'où un ennemi le fouille). */
export function lockerFront(locker) {
  return { x: locker.x - DIRS[locker.dir].dx * 0.12, z: locker.z - DIRS[locker.dir].dz * 0.12 }
}
