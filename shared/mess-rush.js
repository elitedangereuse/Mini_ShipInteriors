// MESS RUSH : la cuisine coopérative du mess (de 1 à 4 joueurs), règles communes au relais, qui
// arbitre la partie, et au client, qui la dessine et calcule ses invites (cf. docs/mess-rush.md).
//
// La partie se joue dans une instance : la cuisine du mess, seule, hors des ponts du vaisseau. Des
// clients font la queue devant la passe, un bon chacun. Comme dans Overcooked, tout se fait d'une
// seule touche, selon ce qu'on tient et ce qu'on vise : prendre un ingrédient à sa caisse, le couper
// sur une planche (on reste devant), le poser dans une marmite ou une poêle (la cuisson part toute
// seule ; oubliée sur le feu, elle brûle), dresser l'assiette, la poser à la passe. Les assiettes
// sont comptées : elles reviennent sales, et on les lave à la plonge. Le score est collectif.
//
// Tout l'état d'une partie est un objet JSON (pas de Map, pas de classe) : le relais l'envoie tel
// quel aux joueurs, et le client y relit ce que ferait la touche (`resolveAction`, la même fonction
// que l'arbitre). Les fonctions qui le changent sont pures, à l'horloge près (`now`, en ms), que
// l'appelant fournit.

import { DIFFICULTIES, INGREDIENTS, PROCESSES, RECIPES, SERVICE_RECIPES } from './mess-rush-catalog.js'

/** « Pont » de la cuisine de MESS RUSH : une instance hors des ponts du vaisseau. */
export const MESS_LEVEL = -6

/**
 * Le salon : au vrai mess du pont principal (pièce 'm'). On y prend le service au rail des bons,
 * et on garde sa place dans un salon tant qu'on reste dans le mess.
 */
export const MESS_LOBBY = { level: 0, room: 'm', rail: { x: 11.5, z: 10 } }
/** Où l'on revient au vrai mess, à la fin du service : devant le rail des bons, côté salle. */
export const MESS_RETURN = { level: 0, x: 11.5, z: 9.15, yaw: Math.PI }

/**
 * Plan de l'instance (cf. ShipMap) : une seule pièce, 'm' comme le mess (ses tuiles de x 8 à 17,
 * de z 7 à 12). Au nord, la rangée des caisses et le comptoir de service (les clients derrière) ;
 * au sud, les postes adossés au mur du fond.
 */
export const MESS_LAYOUT = [
  '', '', '', '', '', '', '',
  ...Array.from({ length: 6 }, () => `${' '.repeat(8)}${'m'.repeat(10)}`),
]

/** Bords intérieurs de la pièce (faces des murs). */
export const MESS_BOUNDS = { minX: 7.65, maxX: 17.35, minZ: 6.65, maxZ: 12.35 }

/**
 * Les meubles du nord (cf. mess-rush/level.ts) : à l'ouest, la rangée des caisses ; ailleurs, le
 * comptoir de service, d'une cloison au mur est, les clients derrière.
 */
export const CRATE_ROW = { minX: MESS_BOUNDS.minX, maxX: 10.75, minZ: 7.75, maxZ: 8.35 }
export const SERVICE_COUNTER = { minX: 10.75, maxX: MESS_BOUNDS.maxX, minZ: 7.75, maxZ: 8.35 }

/** Le sol des cuisiniers : des caisses et du comptoir de service au mur du fond. */
export const KITCHEN_FLOOR = { minX: MESS_BOUNDS.minX, maxX: MESS_BOUNDS.maxX, minZ: SERVICE_COUNTER.maxZ, maxZ: MESS_BOUNDS.maxZ }

/** La file des clients, de l'autre côté du comptoir de service (cf. src/mess-rush/queue.ts). */
export const QUEUE = { minX: 11.2, maxX: 16.9, z: 7.15 }

/** Hauteur du dessus des meubles de la cuisine : à la taille des cuisiniers (0,67 m), comme dans Overcooked. */
export const COUNTER_TOP = 0.34

/** Où l'on arrive dans la cuisine ouverte (un seul cuisinier) : au milieu, devant les fourneaux. */
export const MESS_SPAWNS = [
  { x: 12.4, z: 10.3 },
  { x: 9.4, z: 10.6 },
  { x: 15.6, z: 10.3 },
  { x: 9.4, z: 9.1 },
]

/** Une position est-elle sur le sol des cuisiniers ? */
export function onMessFloor(x, z) {
  return x > KITCHEN_FLOOR.minX && x < KITCHEN_FLOOR.maxX && z > KITCHEN_FLOOR.minZ && z < KITCHEN_FLOOR.maxZ
}

/**
 * Les postes, là où l'on agit (coordonnées de l'instance). `kind` dit ce qu'on y fait :
 * - `crate` : une caisse, d'un seul ingrédient (`ing`), sans fond ;
 * - `board` : une planche, où l'on coupe (on reste devant, la jauge avance) ;
 * - `pot` (marmite), `pan` (poêle) : ce qu'on y pose cuit tout seul, et brûle si on l'oublie ;
 * - `plates` : la pile d'assiettes propres (comptées) ;
 * - `return` : le retour de vaisselle, où reviennent les assiettes sales après chaque plat servi ;
 * - `sink` : la plonge, où l'on lave les assiettes sales (on reste devant) ;
 * - `counter` : une place de comptoir (les passe-plats : dans une cloison, entre deux zones) ;
 * - `pass` : la passe, où l'on livre ;
 * - `trash` : une poubelle, dans un coin.
 *
 * À l'ouest, le garde-manger et la découpe (les caisses, deux planches) ; au milieu, les fourneaux
 * (deux marmites, deux poêles) et la pile d'assiettes ; à l'est, la passe, le retour de vaisselle et
 * la plonge. Ce sont tous les postes possibles : une cuisine ne garde que ceux de son plan (cf.
 * KITCHENS) ; les passe-plats n'existent qu'avec leur cloison.
 */
export const STATIONS = [
  // L'ouest : la rangée des caisses (au nord), une planche et un comptoir au mur ouest ; au fond, une
  // planche et deux caisses, et la poubelle dans le coin.
  { id: 'caisse-lapin', kind: 'crate', ing: 'lapin-ceti', x: 8.05, z: 8.05 },
  { id: 'caisse-crevettes', kind: 'crate', ing: 'crevettes-baltahsine', x: 8.75, z: 8.05 },
  { id: 'comptoir-n', kind: 'counter', x: 9.5, z: 8.05 },
  { id: 'comptoir-o', kind: 'counter', x: 10.25, z: 8.05 },
  { id: 'plan-2', kind: 'board', x: 7.925, z: 9.25 },
  { id: 'comptoir-so', kind: 'counter', x: 7.925, z: 10.95 },
  { id: 'poubelle-so', kind: 'trash', x: 7.98, z: 12.02 },
  { id: 'plan-1', kind: 'board', x: 8.85, z: 12.075 },
  { id: 'caisse-legumes', kind: 'crate', ing: 'legumes', x: 9.75, z: 12.075 },
  // Le milieu : les fourneaux au fond ; au nord, la caisse de riz, un comptoir et la pile d'assiettes.
  { id: 'marmite-1', kind: 'pot', x: 11.45, z: 12.075 },
  { id: 'marmite-2', kind: 'pot', x: 12.05, z: 12.075 },
  { id: 'poele-1', kind: 'pan', x: 12.85, z: 12.075 },
  { id: 'poele-2', kind: 'pan', x: 13.45, z: 12.075 },
  { id: 'caisse-riz', kind: 'crate', ing: 'riz-jaroua', x: 11.4, z: 8.05 },
  { id: 'comptoir-1', kind: 'counter', x: 12.2, z: 8.05 },
  { id: 'assiettes', kind: 'plates', x: 13.3, z: 8.05 },
  // L'est : la passe, le retour de vaisselle et la caisse de pommes au comptoir de service ; la
  // plonge et une planche au fond ; une poubelle dans chaque coin.
  { id: 'passe', kind: 'pass', x: 14.8, z: 8.05 },
  { id: 'retour', kind: 'return', x: 15.7, z: 8.05 },
  { id: 'caisse-pommes', kind: 'crate', ing: 'pommes-aerial', x: 16.5, z: 8.05 },
  { id: 'poubelle-ne', kind: 'trash', x: 17.02, z: 8.62 },
  { id: 'plonge', kind: 'sink', x: 14.75, z: 12.075 },
  { id: 'plan-3', kind: 'board', x: 15.85, z: 12.075 },
  { id: 'poubelle-se', kind: 'trash', x: 17.02, z: 12.02 },
  // Les passe-plats : deux dans chaque cloison, et, à quatre, un dans la cloison de l'ouest.
  { id: 'passe-plat-o-n', kind: 'counter', x: 10.875, z: 9.15 },
  { id: 'passe-plat-o-s', kind: 'counter', x: 10.875, z: 11.0 },
  { id: 'passe-plat-e-n', kind: 'counter', x: 14.025, z: 9.15 },
  { id: 'passe-plat-e-s', kind: 'counter', x: 14.025, z: 11.0 },
  { id: 'passe-plat-ouest', kind: 'counter', x: 9.3, z: 10.075 },
]

/** Les postes, par identifiant. */
export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]))

// ---------------------------------------------------------------- les plans de la cuisine

/**
 * Les cloisons, comme dans Overcooked : à plusieurs, chacun tient sa zone et l'on se passe les
 * plats par-dessus. Des comptoirs bas, de la rangée du nord au mur du fond : entre l'ouest et les
 * fourneaux, entre les fourneaux et l'est ; à quatre, une cloison coupe aussi l'ouest en deux.
 * Les deux premières courent du nord au sud, dans l'axe de la caméra : elles ne cachent personne.
 */
const WALL_WM = { minX: 10.75, maxX: 11.0, minZ: KITCHEN_FLOOR.minZ, maxZ: 11.8 }
const WALL_ME = { minX: 13.9, maxX: 14.15, minZ: KITCHEN_FLOOR.minZ, maxZ: 11.8 }
const WALL_WEST = { minX: 8.2, maxX: WALL_WM.minX, minZ: 9.95, maxZ: 10.2 }

const ALL_Z = { minZ: KITCHEN_FLOOR.minZ, maxZ: KITCHEN_FLOOR.maxZ }
const WEST = { minX: MESS_BOUNDS.minX, maxX: WALL_WM.minX }
const MIDDLE = { minX: WALL_WM.maxX, maxX: WALL_ME.minX }
const EAST = { minX: WALL_ME.maxX, maxX: MESS_BOUNDS.maxX }

/**
 * Les postes de chaque coin de la cuisine. L'ouest prend et coupe (le nord : le lapin, les
 * légumes et le riz ; le sud : les crevettes et les pommes) ; le milieu cuit et dresse ; l'est sert,
 * dessert et lave : une chaîne où chacun attend l'autre, comme dans Overcooked.
 */
const W_N = ['caisse-lapin', 'caisse-crevettes', 'comptoir-n', 'comptoir-o', 'plan-2', 'passe-plat-o-n', 'passe-plat-ouest']
const W_S = ['poubelle-so', 'plan-1', 'caisse-legumes', 'comptoir-so', 'passe-plat-o-s', 'passe-plat-ouest']
const MID = ['marmite-1', 'marmite-2', 'poele-1', 'poele-2', 'caisse-riz', 'comptoir-1', 'assiettes', 'passe-plat-o-n', 'passe-plat-o-s', 'passe-plat-e-n', 'passe-plat-e-s']
const E = ['passe', 'retour', 'caisse-pommes', 'poubelle-ne', 'plonge', 'plan-3', 'poubelle-se', 'passe-plat-e-n', 'passe-plat-e-s']
const union = (...lists) => [...new Set(lists.flat())]
const without = (list, ...ids) => list.filter((id) => !ids.includes(id))
const W = without(union(W_N, W_S), 'passe-plat-ouest')
const OPEN = STATIONS.map((s) => s.id).filter((id) => !id.startsWith('passe-plat'))

/**
 * Le plan de la cuisine selon le nombre de cuisiniers : ses zones (une par joueur, dans l'ordre du
 * salon), et les cloisons à élever. Chaque zone dit son sol (`bounds`), où l'on y arrive, et les
 * postes qu'on y atteint ; un poste partagé par deux zones est un passe-plat.
 * - 1 : toute la cuisine ;
 * - 2 : l'ouest, le commis (prendre et couper le lapin, les légumes, les crevettes), et l'est, le
 *   chef (le riz, les pommes, la cuisson, le dressage, la passe, la vaisselle), séparés par la cloison
 *   de l'ouest ;
 * - 3 : l'ouest (prendre, couper), le milieu (cuire, dresser), l'est (servir, laver) ;
 * - 4 : l'ouest coupé en deux (le nord et le sud ont chacun leurs caisses et leur planche), le milieu, l'est.
 */
export const KITCHENS = {
  1: {
    walls: [],
    zones: [{ id: 'all', bounds: { minX: MESS_BOUNDS.minX, maxX: MESS_BOUNDS.maxX, ...ALL_Z }, spawn: MESS_SPAWNS[0], stations: OPEN }],
  },
  2: {
    walls: [WALL_WM],
    zones: [
      { id: 'west', bounds: { ...WEST, ...ALL_Z }, spawn: { x: 9.4, z: 10.6 }, stations: W },
      { id: 'east', bounds: { minX: WALL_WM.maxX, maxX: MESS_BOUNDS.maxX, ...ALL_Z }, spawn: { x: 13.0, z: 10.3 }, stations: without(union(MID, E), 'passe-plat-e-n', 'passe-plat-e-s') },
    ],
  },
  3: {
    walls: [WALL_WM, WALL_ME],
    zones: [
      { id: 'west', bounds: { ...WEST, ...ALL_Z }, spawn: { x: 9.4, z: 10.6 }, stations: W },
      { id: 'middle', bounds: { ...MIDDLE, ...ALL_Z }, spawn: { x: 12.4, z: 10.3 }, stations: MID },
      { id: 'east', bounds: { ...EAST, ...ALL_Z }, spawn: { x: 15.6, z: 10.3 }, stations: E },
    ],
  },
  4: {
    walls: [WALL_WM, WALL_ME, WALL_WEST],
    zones: [
      { id: 'west-north', bounds: { ...WEST, minZ: KITCHEN_FLOOR.minZ, maxZ: WALL_WEST.minZ }, spawn: { x: 9.4, z: 9.1 }, stations: W_N },
      { id: 'middle', bounds: { ...MIDDLE, ...ALL_Z }, spawn: { x: 12.4, z: 10.3 }, stations: MID },
      { id: 'east', bounds: { ...EAST, ...ALL_Z }, spawn: { x: 15.6, z: 10.3 }, stations: E },
      { id: 'west-south', bounds: { ...WEST, minZ: WALL_WEST.maxZ, maxZ: KITCHEN_FLOOR.maxZ }, spawn: { x: 9.4, z: 11.1 }, stations: W_S },
    ],
  },
}

// Les postes de chaque plan : ceux de toutes ses zones.
for (const k of Object.values(KITCHENS)) k.stations = union(...k.zones.map((z) => z.stations))

/** Le plan de la cuisine de cette partie (ouverte : celui d'un cuisinier seul, sans cloison). */
export function kitchenOf(state) {
  return state.open ? KITCHENS[1] : KITCHENS[state.kitchen ?? 1] ?? KITCHENS[1]
}

/** La zone d'un joueur, ou null : cuisine ouverte (seul, ou après un départ), ou joueur inconnu. */
export function zoneOf(state, pid) {
  if (state.open) return null
  const i = state.zones?.[String(pid)]
  return i === undefined ? null : kitchenOf(state).zones[i] ?? null
}

/** Le joueur atteint-il ce poste, de sa zone ? (Cuisine ouverte : tous ceux de la cuisine.) */
export function canReach(state, pid, stationId) {
  return (zoneOf(state, pid) ?? kitchenOf(state)).stations.includes(stationId)
}

/** Les cloisons élevées dans cette partie (aucune une fois la cuisine ouverte). */
export function wallsOf(state) {
  return state.open ? [] : kitchenOf(state).walls
}

/** Une position est-elle sur le sol de la zone du joueur (à `margin` près) ? */
export function inZone(state, pid, x, z, margin = 0.15) {
  const zone = zoneOf(state, pid)
  if (!zone) return onMessFloor(x, z)
  const b = zone.bounds
  return x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin
}

/** Range un objet qui n'a plus de place : une assiette retourne à la pile, la vaisselle sale au retour. */
function stow(state, id) {
  const item = state.items[id]
  delete state.items[id]
  if (item?.kind === 'plate' && state.stations.assiettes) state.stations.assiettes.count += 1
  else if (item?.kind === 'dirty' && state.stations.retour) state.stations.retour.count += item.count
  else state.wasted += 1
}

/**
 * Un cuisinier quitte la brigade pour de bon : les cloisons tombent, et chacun atteint tous les
 * postes (sinon, sa zone n'aurait plus personne, et des plats deviendraient impossibles). La
 * cuisine reprend le plan d'un cuisinier seul : ce que portaient les passe-plats va sur la place
 * libre la plus proche (sinon, il est rangé).
 */
export function openKitchen(state) {
  if (state.open || kitchenOf(state).walls.length === 0) return []
  state.open = true
  const kept = KITCHENS[1].stations
  for (const id of Object.keys(state.stations)) {
    if (kept.includes(id)) continue
    const item = state.stations[id].item
    delete state.stations[id]
    if (!item) continue
    const from = STATION_BY_ID[id]
    const far = (s) => Math.hypot(STATION_BY_ID[s].x - from.x, STATION_BY_ID[s].z - from.z)
    const free = kept.filter((s) => STATION_BY_ID[s].kind === 'counter' && state.stations[s] && !state.stations[s].item).sort((a, b) => far(a) - far(b))[0]
    if (free) state.stations[free].item = item
    else stow(state, item)
  }
  return [{ kind: 'open' }]
}

/** Noms des postes (invites). */
export const STATION_NAMES = {
  crate: { fr: 'Caisse', en: 'Crate' },
  board: { fr: 'Planche', en: 'Chopping board' },
  pot: { fr: 'Marmite', en: 'Pot' },
  pan: { fr: 'Poêle', en: 'Pan' },
  sink: { fr: 'Plonge', en: 'Sink' },
  plates: { fr: 'Assiettes', en: 'Plates' },
  return: { fr: 'Retour de vaisselle', en: 'Dirty plates' },
  counter: { fr: 'Comptoir', en: 'Counter' },
  pass: { fr: 'Passe', en: 'Pass' },
  trash: { fr: 'Poubelle', en: 'Bin' },
}

/** Les ustensiles, où ce qu'on pose cuit tout seul. */
const UTENSILS = ['pot', 'pan']

/**
 * Chiffres de la partie (secondes, points), tous des réglages de départ à équilibrer.
 * - salon : salons, joueurs par salon, compte à rebours, arrivée, reconnexion, résultat gardé ;
 * - service : durée, portée d'une action côté relais (celle du client, 1,45, plus le retard de la
 *   dernière position reçue), capacités de l'assiette et des ustensiles ;
 * - cuisson : le temps qu'ajoute un ingrédient de plus dans la marmite, le temps avant que ce qui
 *   est cuit ne brûle (marmite, poêle), et l'alerte avant (`warn`) ;
 * - vaisselle : les assiettes au départ (selon le nombre de joueurs), le temps avant qu'une
 *   assiette servie ne revienne sale, le temps pour en laver une ;
 * - commandes : première commande, recettes complexes, rythme et carte selon le nombre de joueurs
 *   (`without` : les recettes qu'on ne sert pas à ce nombre) ;
 * - score : bonus de rapidité (part du délai restant → bonus), combo, pénalité d'expiration ;
 * - médailles : seuils selon le nombre de joueurs, [bronze, argent, or]. Bronze = victoire.
 */
export const RULES = {
  lobbies: 4,
  team: 4,
  countdown: 3,
  arrival: 30,
  reconnect: 60,
  keepResult: 600,
  service: 300,
  reach: 2.2,
  plateCapacity: 4,
  potCapacity: 3,
  panCapacity: 1,
  cook: { potExtra: 1.5, burn: { pot: 9, pan: 6 }, warn: 3.5 },
  plates: { 1: 3, 2: 4, 3: 4, 4: 5 },
  plateReturn: 7,
  wash: 1.5,
  firstOrder: 3,
  complexAfter: 120,
  byPlayers: {
    1: { maxOrders: 2, every: 25, timeScale: 1.4, without: ['festin-du-bord'] },
    2: { maxOrders: 3, every: 20, timeScale: 1.4, without: [] },
    3: { maxOrders: 4, every: 16, timeScale: 1.35, without: [] },
    4: { maxOrders: 5, every: 13, timeScale: 1.3, without: [] },
  },
  speedBonus: [[2 / 3, 0.5], [1 / 3, 0.25]],
  combo: { step: 0.1, max: 1.5 },
  expiredPenalty: 0.5,
  // Les imprévus (cf. EVENT_KINDS) : le premier après `first` secondes, puis un toutes les `every`
  // (de… à…) secondes après la fin du précédent, jamais dans les `quiet` dernières. Le plateau
  // renversé se nettoie en `clean` secondes ; le chat mange ce qu'il convoite au bout de `cat`
  // secondes, si personne ne le chasse ; la surchauffe dure `overheat.time` secondes et fait tout
  // cuire (et brûler) `overheat.speed` fois plus vite ; le bon de l'amiral rapporte `vip.points`
  // fois plus en `vip.time` fois moins de temps.
  events: { first: 50, every: [30, 45], quiet: 20, clean: 2.5, cat: 7, overheat: { time: 15, speed: 1.7 }, vip: { points: 2, time: 0.75 } },
  // Les médailles : environ 30, 50 et 70 % de ce que font des robots qui suivent le guidage sans
  // jamais marcher (cf. server/mess-rush-kitchens.test.js) ; à trois, pas moins qu'à deux.
  medals: {
    1: [330, 545, 765],
    2: [510, 850, 1190],
    3: [510, 850, 1190],
    4: [620, 1040, 1450],
  },
}

export const MEDALS = ['none', 'bronze', 'silver', 'gold']

/** Le rythme des commandes pour `players` joueurs (1 à 4). */
export function pace(players, rules = RULES) {
  return rules.byPlayers[Math.min(4, Math.max(1, players))]
}

/** La carte du service pour `players` joueurs : `recipes` (toute la carte par défaut), moins ce qu'on n'y sert pas. */
export function menuFor(players, recipes = SERVICE_RECIPES, rules = RULES) {
  const without = pace(players, rules).without ?? []
  return recipes.filter((r) => !without.includes(r))
}

/** La médaille d'un score, pour `players` joueurs. */
export function medalOf(score, players, rules = RULES) {
  const [bronze, silver, gold] = rules.medals[Math.min(4, Math.max(1, players))]
  return score >= gold ? 'gold' : score >= silver ? 'silver' : score >= bronze ? 'bronze' : 'none'
}

/** Multiplicateur du combo (`combo` livraisons réussies d'affilée, celle-ci comprise). */
export function comboMultiplier(combo, rules = RULES) {
  return Math.min(rules.combo.max, 1 + rules.combo.step * Math.max(0, combo - 1))
}

/** Bonus de rapidité, selon la part du délai qui restait à la livraison (0 à 1). */
export function speedBonus(remaining, rules = RULES) {
  for (const [part, bonus] of rules.speedBonus) if (remaining >= part) return bonus
  return 0
}

/** Valeur de base et délai de base (s) d'une recette. */
export function recipeValue(id) {
  const r = RECIPES[id]
  const d = DIFFICULTIES[r.difficulty]
  return { points: r.points ?? d.points, time: r.time ?? d.time }
}

// ---------------------------------------------------------------- l'état d'une partie

/** Générateur pseudo-aléatoire (mulberry32), dont l'état vit dans la partie (un entier). */
function random(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0
  let t = state.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Une nouvelle partie, en service dès `now`. `recipes` : les recettes qui peuvent sortir (la carte
 * du nombre de joueurs par défaut, cf. menuFor ; les complexes, après RULES.complexAfter).
 * `members` : les joueurs, dans l'ordre du salon ; chacun reçoit la zone du même rang dans le plan
 * de la cuisine (cf. KITCHENS). Sans eux, la cuisine est ouverte à tous.
 * @param {{ id: string, seed: number, players: number, now: number, recipes?: string[], members?: (string | number)[], rules?: typeof RULES }} o
 */
export function createService({ id, seed, players, now, recipes, members = [], rules = RULES }) {
  const n = Math.min(4, Math.max(1, players))
  const kitchen = KITCHENS[n]
  const stations = {}
  for (const s of STATIONS) {
    if (!kitchen.stations.includes(s.id)) continue
    if (UTENSILS.includes(s.kind)) stations[s.id] = { items: [], cook: null, done: false, burnt: false }
    else if (s.kind === 'board' || s.kind === 'counter') stations[s.id] = { item: null }
    else if (s.kind === 'plates') stations[s.id] = { count: rules.plates[n] }
    else if (s.kind === 'return') stations[s.id] = { count: 0, pending: [] }
    else if (s.kind === 'sink') stations[s.id] = { count: 0, progress: 0 }
  }
  return {
    id,
    players: n,
    kitchen: n,
    zones: Object.fromEntries(members.slice(0, kitchen.zones.length).map((m, i) => [String(m), i])),
    open: false,
    recipes: [...(recipes ?? menuFor(n, SERVICE_RECIPES, rules))],
    startedAt: now,
    endsAt: now + rules.service * 1000,
    status: 'running',
    rng: seed >>> 0,
    seq: 0,
    orderSeq: 0,
    nextOrderAt: now + rules.firstOrder * 1000,
    event: null,
    nextEventAt: now + rules.events.first * 1000,
    orders: [],
    items: {},
    stations,
    hands: {},
    work: {},
    score: 0,
    combo: 0,
    bestCombo: 0,
    served: 0,
    expired: 0,
    wasted: 0,
  }
}

/** L'état d'un ingrédient : brut, puis le résultat de son dernier geste, ou de sa cuisson ; brûlé. */
export function ingredientState(item) {
  if (item.burnt) return 'brûlé'
  if (item.cooked) return PROCESSES[item.cooked].result
  if (!item.step) return 'brut'
  return PROCESSES[INGREDIENTS[item.ing].prep[item.step - 1]].result
}

/** Le prochain geste d'un ingrédient (couper), ou null s'il est prêt à cuire ou à servir. */
export function nextPrep(item) {
  if (item.kind !== 'ingredient' || item.cooked || item.burnt) return null
  return INGREDIENTS[item.ing].prep[item.step] ?? null
}

/** La cuisson d'un ingrédient (cuire, saisir), ou null s'il se sert cru. */
function cookProcess(ing) {
  return INGREDIENTS[ing].cook[0] ?? null
}

/** L'état où les recettes attendent un ingrédient : cuit (ou saisi) s'il cuit, sinon celui de son dernier geste. */
export function finalState(ing) {
  const info = INGREDIENTS[ing]
  if (info.cook.length) return PROCESSES[info.cook[0]].result
  const last = info.prep[info.prep.length - 1]
  return last ? PROCESSES[last].result : 'brut'
}

/** Ce que contient une assiette : des paires [ingrédient, état]. */
function contentsOf(item) {
  return item?.contents ?? []
}

const componentKey = (ing, st) => `${ing}:${st}`
const keysOf = (pairs) => pairs.map(([i, st]) => componentKey(i, st))

/** `a` tient-il dans `b` (multi-ensembles de composants) ? */
function within(a, b) {
  const left = [...b]
  return a.every((k) => {
    const at = left.indexOf(k)
    if (at < 0) return false
    left.splice(at, 1)
    return true
  })
}

/** L'assiette correspond-elle exactement à la recette ? */
export function dishMatches(item, recipeId) {
  if (item?.kind !== 'plate') return false
  const want = keysOf(RECIPES[recipeId].dish.contents).sort()
  const got = keysOf(contentsOf(item)).sort()
  return want.length === got.length && want.every((w, k) => w === got[k])
}

/** La commande en attente la plus ancienne que ce plat sert, ou null. */
export function matchingOrder(state, item) {
  if (!item || item.kind !== 'plate' || !contentsOf(item).length) return null
  return state.orders.filter((o) => o.status === 'pending').sort((a, b) => a.at - b.at).find((o) => dishMatches(item, o.recipe)) ?? null
}

/** Qui travaille à ce poste (un geste actif), ou null. */
function workerAt(state, stationId) {
  for (const [pid, w] of Object.entries(state.work)) if (w.station === stationId) return pid
  return null
}

function held(state, pid) {
  const id = state.hands[pid]
  return id ? state.items[id] ?? null : null
}

/** Une assiette a-t-elle encore `n` places ? */
function room(plate, n, rules) {
  return plate.kind === 'plate' && contentsOf(plate).length + n <= rules.plateCapacity
}

/** Ce que donnera un ustensile une fois cuit, en composants. */
function utensilKeys(state, s) {
  return s.items.map((id) => {
    const it = state.items[id]
    return componentKey(it.ing, it.burnt ? 'brûlé' : PROCESSES[cookProcess(it.ing)].result)
  })
}

/**
 * L'ingrédient peut-il aller dans cet ustensile (gestes faits, la bonne cuisson, de la place, pas
 * brûlé) ? Dans une marmite déjà cuite, on peut encore en ajouter : elle se remet à cuire un peu.
 */
function canCook(state, item, stationId, rules) {
  if (item.kind !== 'ingredient' || item.cooked || item.burnt || nextPrep(item) !== null) return false
  const kind = STATION_BY_ID[stationId].kind
  const cook = cookProcess(item.ing)
  const s = state.stations[stationId]
  if (!cook || PROCESSES[cook].station !== kind || s.burnt) return false
  return s.items.length < (kind === 'pot' ? rules.potCapacity : rules.panCapacity)
}

// ---------------------------------------------------------------- la touche

/**
 * Ce que ferait la touche (E, Espace, A, ×… : il n'y en a qu'une) à ce poste, pour ce joueur, selon
 * ce qu'il tient. null : rien à faire. Le relais arbitre avec cette même fonction ; le client en tire
 * son invite. Les mains vides devant une planche où il reste à couper : on coupe (sinon, on prend) ;
 * devant la plonge pleine : on lave ; devant une marmite brûlée : on la vide.
 * @returns {{ kind: string, ing?: string, order?: string | null, busy?: boolean } | null}
 */
export function resolveAction(state, pid, stationId, rules = RULES) {
  const station = STATION_BY_ID[stationId]
  if (!station || state.status !== 'running' || !canReach(state, pid, stationId)) return null
  const hand = held(state, pid)
  const s = state.stations[stationId]
  const busy = () => {
    const other = workerAt(state, stationId)
    return !!other && other !== String(pid)
  }
  // Le chat du bord sur ce poste : d'abord le chasser.
  if (state.event?.kind === 'cat' && state.event.station === stationId) return { kind: 'shoo' }
  switch (station.kind) {
    case 'crate':
      return hand ? null : { kind: 'take-ingredient', ing: station.ing }
    case 'board':
    case 'counter': {
      const slot = s.item ? state.items[s.item] : null
      if (!hand) {
        if (slot && station.kind === 'board' && nextPrep(slot) === 'couper') return { kind: 'work', busy: busy() }
        return slot ? { kind: 'take' } : null
      }
      if (!slot) return station.kind === 'counter' || hand.kind === 'ingredient' ? { kind: 'put' } : null
      if (hand.kind === 'plate' && slot.kind === 'ingredient' && !nextPrep(slot) && !cookProcess(slot.ing) && room(hand, 1, rules)) return { kind: 'plate-pick' }
      if (hand.kind === 'ingredient' && slot.kind === 'plate' && !nextPrep(hand) && !cookProcess(hand.ing) && room(slot, 1, rules)) return { kind: 'plate-add' }
      // Une assiette sur une autre : on verse la sienne dedans (elle reste en main, vide).
      if (hand.kind === 'plate' && slot.kind === 'plate' && contentsOf(hand).length > 0 && room(slot, contentsOf(hand).length, rules)) return { kind: 'merge' }
      if (hand.kind === 'dirty' && slot.kind === 'dirty') return { kind: 'stack' }
      return null
    }
    case 'pot':
    case 'pan': {
      if (s.burnt) return hand ? null : { kind: 'empty' }
      if (hand?.kind === 'ingredient' && canCook(state, hand, stationId, rules)) return { kind: 'fill' }
      if (hand?.kind === 'plate' && s.done && room(hand, s.items.length, rules)) return { kind: 'serve' }
      return null
    }
    case 'plates':
      return !hand && s.count > 0 ? { kind: 'take-plate' } : null
    case 'return':
      return s.count > 0 && (!hand || hand.kind === 'dirty') ? { kind: 'take-dirty' } : null
    case 'sink':
      if (hand?.kind === 'dirty') return { kind: 'put-dirty' }
      return !hand && s.count > 0 ? { kind: 'wash', busy: busy() } : null
    case 'pass':
      // Un plateau renversé sur la passe : on nettoie d'abord (les mains vides).
      if (isBlocked(state, stationId)) return hand ? null : { kind: 'clean', busy: busy() }
      if (hand?.kind !== 'plate' || !contentsOf(hand).length) return null
      return { kind: 'deliver', order: matchingOrder(state, hand)?.id ?? null }
    case 'trash':
      if (hand?.kind === 'ingredient' || (hand?.kind === 'plate' && contentsOf(hand).length)) return { kind: 'trash' }
      return null
  }
  return null
}

function newItem(state, item) {
  state.seq += 1
  const id = `i${state.seq}`
  state.items[id] = { id, ...item }
  return id
}

/**
 * La cuisson part (ou s'allonge) quand on pose un ingrédient dans un ustensile ; déjà cuit, il se
 * remet à cuire, le temps que le nouveau venu cuise aussi.
 */
function heat(state, stationId, process, now, rules) {
  const s = state.stations[stationId]
  const kind = STATION_BY_ID[stationId].kind
  const extra = rules.cook.potExtra * 1000
  if (!s.cook) s.cook = { start: now, until: now + PROCESSES[process].duration * 1000, process }
  else if (s.done) {
    s.done = false
    s.cook.start = now - extra
    s.cook.until = now + 2 * extra
  } else s.cook.until += extra
  s.cook.burnAt = s.cook.until + rules.cook.burn[kind] * 1000
}

/**
 * La touche à ce poste : l'action de resolveAction. Refus : `{ ok: false, code }` (`busy` : quelqu'un
 * y travaille ; `nomatch` : aucun bon n'attend ce plat ; `over` : le service est fini ; `state` :
 * rien à faire). Un geste (couper, laver, nettoyer) avance ensuite dans `stepService`, tant que le
 * joueur reste au poste.
 * @returns {{ ok: true, events: object[] } | { ok: false, code: string }}
 */
export function useStation(state, pid, stationId, _pick, now, rules = RULES) {
  const action = resolveAction(state, pid, stationId, rules)
  if (!action) return { ok: false, code: state.status !== 'running' ? 'over' : 'state' }
  if (action.busy) return { ok: false, code: 'busy' }
  const s = state.stations[stationId]
  const hand = held(state, pid)
  const events = []
  switch (action.kind) {
    case 'shoo':
      events.push({ kind: 'shooed', station: stationId, by: pid }, ...endEvent(state, now, rules, pid))
      break
    case 'clean':
      state.work[pid] = { station: stationId, clean: true }
      break
    case 'work':
      state.work[pid] = { station: stationId, item: s.item }
      break
    case 'wash':
      state.work[pid] = { station: stationId, wash: true }
      break
    case 'take-ingredient':
      state.hands[pid] = newItem(state, { kind: 'ingredient', ing: action.ing, step: 0, progress: 0 })
      break
    case 'take':
      state.hands[pid] = s.item
      s.item = null
      break
    case 'put':
      s.item = hand.id
      state.hands[pid] = null
      break
    case 'plate-pick': {
      const slot = state.items[s.item]
      hand.contents.push([slot.ing, ingredientState(slot)])
      delete state.items[slot.id]
      s.item = null
      break
    }
    case 'plate-add': {
      const plate = state.items[s.item]
      plate.contents.push([hand.ing, ingredientState(hand)])
      delete state.items[hand.id]
      state.hands[pid] = null
      break
    }
    case 'merge':
      state.items[s.item].contents.push(...hand.contents)
      hand.contents = []
      events.push({ kind: 'merged', station: stationId, by: pid })
      break
    case 'stack':
      state.items[s.item].count += hand.count
      delete state.items[hand.id]
      state.hands[pid] = null
      break
    case 'fill':
      s.items.push(hand.id)
      state.hands[pid] = null
      heat(state, stationId, cookProcess(hand.ing), now, rules)
      events.push({ kind: 'cooking', station: stationId, by: pid })
      break
    case 'serve':
      for (const id of s.items) {
        const it = state.items[id]
        hand.contents.push([it.ing, ingredientState(it)])
        delete state.items[id]
      }
      Object.assign(s, { items: [], cook: null, done: false, burnt: false })
      break
    case 'empty':
      for (const id of s.items) delete state.items[id]
      state.wasted += s.items.length
      Object.assign(s, { items: [], cook: null, done: false, burnt: false })
      events.push({ kind: 'emptied', station: stationId, by: pid })
      break
    case 'take-plate':
      s.count -= 1
      state.hands[pid] = newItem(state, { kind: 'plate', contents: [] })
      break
    case 'take-dirty':
      if (hand) hand.count += s.count
      else state.hands[pid] = newItem(state, { kind: 'dirty', count: s.count })
      s.count = 0
      break
    case 'put-dirty':
      s.count += hand.count
      delete state.items[hand.id]
      state.hands[pid] = null
      break
    case 'deliver': {
      const order = matchingOrder(state, hand)
      if (!order) return { ok: false, code: 'nomatch' }
      const { points: base } = recipeValue(order.recipe)
      const remaining = Math.max(0, (order.until - now) / (order.until - order.at))
      state.combo += 1
      state.bestCombo = Math.max(state.bestCombo, state.combo)
      const points = Math.round(base * (order.vip ? rules.events.vip.points : 1) * (1 + speedBonus(remaining, rules)) * comboMultiplier(state.combo, rules))
      order.status = 'served'
      order.done = now
      order.points = points
      state.score += points
      state.served += 1
      delete state.items[hand.id]
      state.hands[pid] = null
      // L'assiette revient sale au retour de vaisselle, un peu plus tard.
      state.stations.retour?.pending.push(now + rules.plateReturn * 1000)
      events.push({ kind: 'served', order: order.id, recipe: order.recipe, points, combo: state.combo, by: pid, ...(order.vip ? { vip: true } : {}) })
      break
    }
    case 'trash':
      if (hand.kind === 'plate') hand.contents = []
      else {
        delete state.items[hand.id]
        state.hands[pid] = null
      }
      state.wasted += 1
      events.push({ kind: 'wasted', by: pid })
      break
  }
  return { ok: true, events }
}

/** La même touche (le relais reçoit encore deux messages, `mess:use` et `mess:work`). */
export function workStation(state, pid, stationId, now, rules = RULES) {
  return useStation(state, pid, stationId, undefined, now, rules)
}

/** Le joueur cesse son geste (il s'éloigne, il bouge) : la progression reste. */
export function stopWork(state, pid) {
  delete state.work[pid]
}

/**
 * Un joueur quitte la cuisine (coupure, abandon) : ce qu'il tenait est posé sur la première place
 * libre du comptoir (de sa zone d'abord), ou rangé (une assiette à sa pile, un ingrédient perdu).
 */
export function dropHeld(state, pid) {
  stopWork(state, pid)
  const id = state.hands[pid]
  delete state.hands[pid]
  if (!id) return []
  const counters = STATIONS.filter((s) => s.kind === 'counter' && state.stations[s.id] && !state.stations[s.id].item)
  const free = counters.find((s) => canReach(state, pid, s.id)) ?? counters[0]
  if (free) {
    state.stations[free.id].item = id
    return [{ kind: 'dropped', by: pid, station: free.id }]
  }
  stow(state, id)
  return [{ kind: 'wasted', by: pid }]
}

/**
 * Une commande a expiré : les ingrédients qu'aucun bon en attente n'utilise disparaissent, où
 * qu'ils soient (dans les mains, sur un poste, dans un ustensile, dans une assiette). Les assiettes
 * restent, vidées de ce qui ne sert plus. Sans pénalité ni gaspillage compté.
 * @returns {number} le nombre d'ingrédients retirés
 */
export function clearUnneeded(state) {
  const needed = new Set()
  for (const o of state.orders) if (o.status === 'pending') for (const [ing] of RECIPES[o.recipe].dish.contents) needed.add(ing)
  let count = 0
  const drop = (id) => {
    delete state.items[id]
    for (const [pid, w] of Object.entries(state.work)) if (w.item === id) delete state.work[pid]
    count += 1
  }
  /** L'objet reste-t-il ? Une assiette perd ce qui ne sert plus ; un ingrédient, s'il ne sert plus, s'en va. */
  const keep = (id) => {
    const item = state.items[id]
    if (!item) return false
    if (item.kind === 'dirty') return true
    if (item.kind === 'plate') {
      const before = item.contents.length
      item.contents = item.contents.filter(([ing]) => needed.has(ing))
      count += before - item.contents.length
      return true
    }
    if (needed.has(item.ing)) return true
    drop(id)
    return false
  }
  for (const [pid, id] of Object.entries(state.hands)) if (id && !keep(id)) state.hands[pid] = null
  for (const s of Object.values(state.stations)) {
    if (s.items) {
      s.items = s.items.filter(keep)
      if (!s.items.length) Object.assign(s, { cook: null, done: false, burnt: false })
    } else if (s.item && !keep(s.item)) s.item = null
  }
  return count
}

// ---------------------------------------------------------------- les imprévus

/**
 * Les imprévus, comme dans Overcooked : un à la fois, tirés au sort par le relais (la graine du
 * service), annoncés à toute l'équipe. Tous se règlent en jouant, aucun ne punit sans recours :
 * - `spill` (un plateau renversé sur la passe) : plus de livraison tant qu'on ne l'a pas nettoyée
 *   (la touche, les mains vides, RULES.events.clean secondes) ;
 * - `cat` (Comète, le chat du bord, saute sur un comptoir ou une planche) : il mange ce qui s'y
 *   trouve au bout de RULES.events.cat secondes, si personne ne vient le chasser (la touche) ;
 * - `overheat` (surchauffe des fourneaux) : tout cuit, et brûle, plus vite un moment : il faut
 *   surveiller ses marmites ;
 * - `rush` (coup de feu) : deux bons d'un coup ;
 * - `vip` (l'amiral à bord) : un bon doré, plus pressé, qui rapporte plus.
 */
export const EVENT_KINDS = ['spill', 'cat', 'overheat', 'rush', 'vip']

/** Un poste hors d'usage à cause d'un imprévu (la passe renversée, le chat assis dessus) ? */
export function isBlocked(state, stationId) {
  const e = state.event
  if (e?.kind === 'cat') return e.station === stationId
  return e?.kind === 'spill' && STATION_BY_ID[stationId]?.kind === 'pass'
}

/** Une durée tirée au sort entre `[a, b]` secondes. */
function between(state, [a, b]) {
  return a + random(state) * (b - a)
}

/** L'imprévu en cours finit (le temps est passé, la passe est propre, le chat est parti) ; le suivant est tiré. */
function endEvent(state, now, rules, by) {
  const kind = state.event?.kind
  state.event = null
  state.nextEventAt = now + between(state, rules.events.every) * 1000
  return kind ? [{ kind: 'event-end', event: kind, ...(by !== undefined ? { by } : {}) }] : []
}

/** Les imprévus à ce pas : la fin de celui en cours, ou le suivant, s'il est temps. */
function stepEvent(state, now, rules) {
  const e = state.event
  if (e) {
    if (!e.until || now < e.until) return []
    // Le chat n'a pas été chassé : il mange ce qui était sur le comptoir.
    const events = []
    if (e.kind === 'cat') {
      const s = state.stations[e.station]
      const it = s?.item ? state.items[s.item] : null
      if (it?.kind === 'ingredient') {
        delete state.items[it.id]
        s.item = null
        for (const [pid, w] of Object.entries(state.work)) if (w.item === it.id) delete state.work[pid]
        events.push({ kind: 'eaten', station: e.station, ing: it.ing })
      }
    }
    return [...events, ...endEvent(state, now, rules)]
  }
  if (state.nextEventAt === undefined || now < state.nextEventAt || now >= state.endsAt - rules.events.quiet * 1000) return []
  const kitchen = kitchenOf(state)
  // Le chat vise d'abord un ingrédient posé ; à défaut, il s'assoit sur une planche ou un comptoir libre.
  const perches = kitchen.stations.filter((id) => ['board', 'counter'].includes(STATION_BY_ID[id].kind) && state.stations[id])
  const food = perches.filter((id) => state.items[state.stations[id].item]?.kind === 'ingredient')
  const possible = EVENT_KINDS.filter((k) => k !== 'cat' || perches.length)
  const kind = possible[Math.floor(random(state) * possible.length)]
  const r = rules.events
  const events = []
  if (kind === 'spill') {
    state.event = { kind, at: now, progress: 0, station: 'passe' }
    events.push({ kind: 'event', event: kind, station: 'passe' })
  } else if (kind === 'cat') {
    const list = food.length ? food : perches
    const station = list[Math.floor(random(state) * list.length)]
    state.event = { kind, at: now, until: now + r.cat * 1000, station }
    events.push({ kind: 'event', event: kind, station, until: state.event.until })
  } else if (kind === 'overheat') {
    state.event = { kind, at: now, until: now + r.overheat.time * 1000 }
    events.push({ kind: 'event', event: kind, until: state.event.until })
  } else {
    // Le coup de feu et l'amiral : des bons, tout de suite (un peu au-delà du plafond).
    events.push({ kind: 'event', event: kind })
    const { maxOrders } = pace(state.players, rules)
    for (let i = 0; i < (kind === 'rush' ? 2 : 1); i++) {
      if (state.orders.filter((o) => o.status === 'pending').length >= maxOrders + 2) break
      const order = spawnOrder(state, now, rules, kind === 'vip')
      if (order) events.push({ kind: 'order', order: order.id, recipe: order.recipe, ...(order.vip ? { vip: true } : {}) })
    }
    state.nextEventAt = now + between(state, r.every) * 1000
  }
  return events
}

function spawnOrder(state, now, rules, vip = false) {
  const elapsed = (now - state.startedAt) / 1000
  const pool = state.recipes.filter((r) => RECIPES[r].difficulty !== 'complexe' || elapsed >= rules.complexAfter)
  if (!pool.length) return null
  const recipe = pool[Math.floor(random(state) * pool.length)]
  const { time } = recipeValue(recipe)
  state.orderSeq += 1
  const scale = pace(state.players, rules).timeScale * (vip ? rules.events.vip.time : 1)
  const order = { id: `c${state.orderSeq}`, recipe, at: now, until: now + time * scale * 1000, status: 'pending', ...(vip ? { vip: true } : {}) }
  state.orders.push(order)
  return order
}

/**
 * Un pas de la partie, à l'heure `now` (`dt` : secondes depuis le pas précédent) : les gestes
 * avancent (pour qui est encore à son poste, cf. `near`), les cuissons finissent puis brûlent, la
 * vaisselle revient, les commandes arrivent et expirent, le service se termine.
 * @param {(pid: string, stationId: string) => boolean} near
 * @returns {object[]} les évènements de ce pas
 */
export function stepService(state, now, dt, near, rules = RULES) {
  if (state.status !== 'running') return []
  const events = []
  // Les gestes actifs.
  for (const [pid, w] of Object.entries(state.work)) {
    const away = !!state.hands[pid] || !near(pid, w.station)
    // Nettoyer la passe : tant qu'on y reste, les mains vides.
    if (w.clean) {
      const spill = state.event?.kind === 'spill' ? state.event : null
      if (!spill || away) {
        delete state.work[pid]
        continue
      }
      spill.progress = (spill.progress ?? 0) + dt
      if (spill.progress >= rules.events.clean - 1e-3) {
        delete state.work[pid]
        events.push(...endEvent(state, now, rules, pid))
      }
      continue
    }
    // Laver : une assiette toutes les RULES.wash secondes, propre sur la pile ; jusqu'à la dernière.
    if (w.wash) {
      const sink = state.stations[w.station]
      if (!sink?.count || away) {
        delete state.work[pid]
        continue
      }
      sink.progress += dt
      if (sink.progress >= rules.wash - 1e-3) {
        sink.progress = 0
        sink.count -= 1
        if (state.stations.assiettes) state.stations.assiettes.count += 1
        events.push({ kind: 'washed', station: w.station, by: pid })
        if (!sink.count) delete state.work[pid]
      }
      continue
    }
    const item = state.items[w.item]
    const s = state.stations[w.station]
    const next = item ? nextPrep(item) : null
    if (!item || s?.item !== w.item || !next || away || isBlocked(state, w.station)) {
      delete state.work[pid]
      continue
    }
    item.progress = (item.progress ?? 0) + dt
    // (à un millième près : des pas de 0,1 s ne tombent pas juste en virgule flottante)
    if (item.progress >= PROCESSES[next].duration - 1e-3) {
      item.step += 1
      item.progress = 0
      delete state.work[pid]
      events.push({ kind: 'prepared', station: w.station, ing: item.ing, process: next, by: pid })
    }
  }
  // Les cuissons : cuit à l'heure, brûlé si on l'oublie ; en surchauffe, tout va plus vite.
  const hot = state.event?.kind === 'overheat' ? (rules.events.overheat.speed - 1) * dt * 1000 : 0
  for (const st of STATIONS) {
    const s = state.stations[st.id]
    if (!s?.cook || s.burnt) continue
    if (hot) {
      if (!s.done) s.cook.until -= hot
      s.cook.burnAt -= hot
    }
    if (!s.done && now >= s.cook.until) {
      s.done = true
      for (const id of s.items) state.items[id].cooked = s.cook.process
      events.push({ kind: 'cooked', station: st.id, process: s.cook.process })
    }
    if (s.done && now >= s.cook.burnAt) {
      s.burnt = true
      for (const id of s.items) state.items[id].burnt = true
      events.push({ kind: 'burnt', station: st.id })
    }
  }
  // La vaisselle sale revient.
  const ret = state.stations.retour
  if (ret?.pending.length) {
    const back = ret.pending.filter((t) => now >= t).length
    if (back) {
      ret.pending = ret.pending.filter((t) => now < t)
      ret.count += back
      events.push({ kind: 'dirty', station: 'retour', count: back })
    }
  }
  // Les commandes qui expirent ; ce qu'on leur préparait et qu'aucun autre bon n'attend disparaît.
  for (const o of state.orders) {
    if (o.status !== 'pending' || now < o.until) continue
    o.status = 'expired'
    o.done = now
    const penalty = Math.round(recipeValue(o.recipe).points * rules.expiredPenalty)
    state.score = Math.max(0, state.score - penalty)
    state.combo = 0
    state.expired += 1
    events.push({ kind: 'expired', order: o.id, recipe: o.recipe, penalty })
    const cleared = clearUnneeded(state)
    if (cleared) events.push({ kind: 'cleared', recipe: o.recipe, count: cleared })
  }
  // La fin du service : les commandes encore en attente ne comptent ni pour ni contre.
  if (now >= state.endsAt) {
    state.status = 'ended'
    state.endedAt = now
    state.work = {}
    events.push({ kind: 'end' })
    return events
  }
  // Les imprévus.
  events.push(...stepEvent(state, now, rules))
  // Les nouvelles commandes : au rythme du nombre de joueurs, sans dépasser le plafond ; tout de
  // suite si la cuisine n'en a plus aucune.
  const { maxOrders, every } = pace(state.players, rules)
  const pending = state.orders.filter((o) => o.status === 'pending').length
  const due = now >= state.nextOrderAt || (pending === 0 && now >= state.startedAt + rules.firstOrder * 1000)
  if (due && pending < maxOrders) {
    const order = spawnOrder(state, now, rules)
    if (order) events.push({ kind: 'order', order: order.id, recipe: order.recipe })
    state.nextOrderAt = now + every * 1000
  }
  return events
}

// ---------------------------------------------------------------- le guidage

/**
 * Le prochain geste utile d'un joueur, pour les flèches et la consigne (cf. src/mess-rush/client.ts),
 * et pour les robots des essais. `step` dit quoi, `stations` où : des postes de sa zone, ou, quand le
 * poste utile est chez un coéquipier, un passe-plat vers lui (`handoff`). null : rien d'évident.
 *
 * Les mains pleines : ce qui fait avancer ce qu'on tient (couper, cuire, dresser, livrer, laver la
 * vaisselle, jeter ce qui ne sert à rien). Les mains vides, dans l'ordre : chasser le chat, nettoyer
 * la passe, vider ce qui a brûlé, prendre un plat prêt à livrer, prendre une assiette pour ce qui est
 * prêt, laver s'il n'y a plus d'assiettes, couper, faire passer un ingrédient, réunir deux assiettes,
 * prendre ce qui manque aux bons dans les caisses, puis la vaisselle.
 * @returns {{ step: string, stations: string[], ing?: string, process?: string } | null}
 */
export function guide(state, pid, rules = RULES) {
  if (state.status !== 'running') return null
  const kitchen = kitchenOf(state)
  const mine = (id) => canReach(state, pid, id)
  const kind = (id) => STATION_BY_ID[id].kind
  const slot = (id) => state.stations[id]
  const itemAt = (id) => (slot(id)?.item ? state.items[slot(id).item] ?? null : null)
  const pending = state.orders.filter((o) => o.status === 'pending').sort((a, b) => a.at - b.at)
  const dishKeys = pending.map((o) => keysOf(RECIPES[o.recipe].dish.contents))
  /** Ces composants tiennent-ils ensemble dans l'assiette d'un bon en attente ? */
  const fits = (keys) => dishKeys.some((d) => within(keys, d))
  const wanted = (ing) => pending.some((o) => RECIPES[o.recipe].dish.contents.some(([i]) => i === ing))
  const utensil = (id) => UTENSILS.includes(kind(id))
  const freeCounter = (id) => kind(id) === 'counter' && !!slot(id) && !itemAt(id)
  /** L'ustensile prend-il cet ingrédient, et le mélange va-t-il dans le plat d'un bon ? */
  const accepts = (id, item) => utensil(id) && !!slot(id) && canCook(state, item, id, rules) && !isBlocked(state, id)
    && fits([...utensilKeys(state, slot(id)), componentKey(item.ing, PROCESSES[cookProcess(item.ing)].result)])
  /**
   * Cuit à point, et complet : ce qu'il contient est tout ce qui cuit de cette façon dans le plat
   * d'un bon (les trois légumes du bouillon, le riz du riz aux crevettes). Incomplet, on attend la suite.
   */
  const groups = pending.map((o) => (process) => keysOf(RECIPES[o.recipe].dish.contents.filter(([i]) => cookProcess(i) === process)).sort().join('|'))
  const ready = (id) => {
    const s = slot(id)
    if (!utensil(id) || !s?.done || s.burnt || !s.items.length) return false
    const got = utensilKeys(state, s).sort().join('|')
    return groups.some((g) => g(s.cook.process) === got)
  }
  /** Un ingrédient prêt à dresser tel quel (coupé, qui ne cuit pas), et qu'un bon attend. */
  const rawReady = (it) => it?.kind === 'ingredient' && !nextPrep(it) && !cookProcess(it.ing) && wanted(it.ing)
  const partial = (id) => kind(id) === 'counter' && itemAt(id)?.kind === 'plate' && contentsOf(itemAt(id)).length > 0 && !matchingOrder(state, itemAt(id))
  const platesHere = kitchen.stations.some((id) => kind(id) === 'plates' && mine(id))
  const rack = slot('assiettes')

  /** Les postes qui conviennent, dans sa zone ; sinon, un passe-plat libre vers une zone qui en a. */
  const toward = (step, ok, extra = {}) => {
    const all = kitchen.stations.filter(ok)
    const here = all.filter(mine)
    if (here.length) return { step, stations: here, ...extra }
    if (!all.length) return null
    const zones = kitchen.zones.filter((z) => z.stations.some((id) => all.includes(id)))
    const shared = kitchen.stations.filter((id) => freeCounter(id) && mine(id) && zones.some((z) => z.stations.includes(id)))
    return shared.length ? { step: 'handoff', stations: shared, ...extra } : null
  }
  /** Les postes qui conviennent, dans sa zone seulement (les mains vides, on ne passe rien). */
  const here = (step, ok, extra = {}) => {
    const list = kitchen.stations.filter((id) => mine(id) && ok(id))
    return list.length ? { step, stations: list, ...(typeof extra === 'function' ? extra(list[0]) : extra) } : null
  }
  const putDown = () => toward('put', freeCounter) ?? { step: 'hold', stations: [] }

  const hand = held(state, pid)
  return hand ? holding(hand) : idle()

  function holding(hand) {
    if (hand.kind === 'dirty') return toward('wash', (id) => kind(id) === 'sink') ?? putDown()
    if (hand.kind === 'ingredient') {
      if (!wanted(hand.ing)) return toward('trash', (id) => kind(id) === 'trash') ?? putDown()
      const extra = { ing: hand.ing }
      const next = nextPrep(hand)
      if (next) return toward('prep', (id) => kind(id) === 'board' && !itemAt(id) && !isBlocked(state, id), { ...extra, process: next }) ?? putDown()
      const cook = cookProcess(hand.ing)
      if (cook) {
        // De préférence dans un ustensile déjà entamé pour le même plat.
        const res = toward('cook', (id) => accepts(id, hand), { ...extra, process: cook })
        if (res?.step === 'cook') res.stations.sort((a, b) => slot(b).items.length - slot(a).items.length)
        return res ?? putDown()
      }
      // Prêt tel quel : dans une assiette entamée qu'il complète, sinon posé près des assiettes.
      const plate = toward('plate', (id) => partial(id) && room(itemAt(id), 1, rules) && fits([...keysOf(contentsOf(itemAt(id))), componentKey(hand.ing, ingredientState(hand))]), extra)
      if (plate) return plate
      return platesHere ? toward('put', (id) => freeCounter(id) && mine(id), extra) ?? putDown() : toward('put', (id) => kind(id) === 'plates', extra) ?? putDown()
    }
    // Une assiette.
    const got = keysOf(contentsOf(hand))
    if (got.length && matchingOrder(state, hand)) {
      const open = (id) => kind(id) === 'pass' && !isBlocked(state, id)
      const spilled = kitchen.stations.some((id) => kind(id) === 'pass' && mine(id)) && !kitchen.stations.some((id) => open(id) && mine(id))
      return spilled ? putDown() : toward('deliver', open) ?? putDown()
    }
    if (got.length && !fits(got)) return toward('trash', (id) => kind(id) === 'trash') ?? putDown()
    const fill = toward(got.length ? 'complete' : 'fill-plate', (id) => {
      if (utensil(id)) return ready(id) && room(hand, slot(id).items.length, rules) && fits([...got, ...utensilKeys(state, slot(id))])
      const it = itemAt(id)
      return ['board', 'counter'].includes(kind(id)) && rawReady(it) && room(hand, 1, rules) && fits([...got, componentKey(it.ing, ingredientState(it))])
    })
    if (fill) return fill
    // Ce qui manque est dans une autre assiette entamée : on verse la sienne dedans.
    if (got.length) {
      const merge = toward('merge', (id) => partial(id) && room(itemAt(id), got.length, rules) && fits([...keysOf(contentsOf(itemAt(id))), ...got]))
      if (merge) return merge
    }
    // Rien de prêt : on la pose en attendant (sur un comptoir de sa zone).
    return toward('wait', (id) => freeCounter(id) && mine(id)) ?? { step: 'hold', stations: [] }
  }

  function idle() {
    // L'urgence : le chat sur un comptoir, la passe renversée, ce qui a brûlé.
    const cat = here('shoo', (id) => state.event?.kind === 'cat' && state.event.station === id)
    if (cat) return cat
    const spill = here('clean', (id) => kind(id) === 'pass' && isBlocked(state, id))
    if (spill) return spill
    const burnt = here('empty', (id) => utensil(id) && !!slot(id)?.burnt)
    if (burnt) return burnt
    // Un plat complet posé : à livrer, si l'on atteint la passe (sinon, un coéquipier l'a posé là pour elle).
    const reachPass = kitchen.stations.some((id) => kind(id) === 'pass' && mine(id))
    const passZones = kitchen.zones.filter((z) => z.stations.some((id) => kind(id) === 'pass'))
    const dish = here('take-dish', (id) => kind(id) === 'counter' && !!matchingOrder(state, itemAt(id)) && (reachPass || !passZones.some((z) => z.stations.includes(id))))
    if (dish) return dish
    // Prêt à dresser (un ustensile cuit, un ingrédient coupé qui se sert cru) : une assiette (entamée qu'il complète, ou la pile).
    const readyAt = (id) => ready(id) || (['board', 'counter'].includes(kind(id)) && rawReady(itemAt(id)))
    const readyKeys = (id) => (utensil(id) ? utensilKeys(state, slot(id)) : [componentKey(itemAt(id).ing, ingredientState(itemAt(id)))])
    const readyHere = kitchen.stations.filter((id) => mine(id) && readyAt(id))
    if (readyHere.length) {
      const fitsPlate = (id) => partial(id) && readyHere.some((r) => fits([...keysOf(contentsOf(itemAt(id))), ...readyKeys(r)]))
      const plate = here('take-plate', fitsPlate) ?? here('take-plate', (id) => kind(id) === 'plates' && slot(id).count > 0)
        ?? here('take-plate', (id) => kind(id) === 'counter' && itemAt(id)?.kind === 'plate' && !contentsOf(itemAt(id)).length)
      if (plate) return plate
    }
    // Plus d'assiettes propres : la vaisselle d'abord.
    const sinkFull = (id) => kind(id) === 'sink' && slot(id)?.count > 0
    if (rack && rack.count === 0) {
      const wash = here('wash', sinkFull)
      if (wash) return wash
      const dirty = here('take-dirty', (id) => kind(id) === 'return' && slot(id).count > 0)
      if (dirty) return dirty
    }
    // Couper ce qui attend sur une planche.
    const chop = here('work', (id) => kind(id) === 'board' && !!itemAt(id) && nextPrep(itemAt(id)) === 'couper' && wanted(itemAt(id).ing) && !isBlocked(state, id),
      (id) => ({ ing: itemAt(id).ing, process: 'couper' }))
    if (chop) return chop
    // Un ingrédient posé qui attend ailleurs une planche, un ustensile ou une assiette.
    const need = (it) => {
      if (nextPrep(it)) return (id) => kind(id) === 'board' && !itemAt(id)
      if (cookProcess(it.ing)) return (id) => accepts(id, it)
      return (id) => kind(id) === 'plates' && slot(id).count > 0
    }
    const take = here('take', (id) => {
      const it = itemAt(id)
      if (!['counter', 'board'].includes(kind(id)) || it?.kind !== 'ingredient' || !wanted(it.ing)) return false
      if (kind(id) === 'board' && nextPrep(it)) return false
      // Prêt à dresser, chez qui a les assiettes : il le dressera (cf. plus haut), on ne le déplace pas.
      if (!nextPrep(it) && !cookProcess(it.ing) && platesHere) return false
      const ok = need(it)
      if (kitchen.stations.some((s) => mine(s) && ok(s))) return true
      // Déjà là où une zone qui sait le traiter l'atteint : on le lui laisse.
      const able = kitchen.zones.filter((z) => z.stations.some(ok))
      if (able.some((z) => z.stations.includes(id))) return false
      return kitchen.stations.some((s) => s !== id && freeCounter(s) && mine(s) && able.some((z) => z.stations.includes(s)))
    }, (id) => ({ ing: itemAt(id).ing }))
    if (take) return take
    // Deux assiettes entamées qui font ensemble le plat d'un bon : on en prend une.
    const pair = here('take-merge', (id) => partial(id) && kitchen.stations.some((q) => q !== id && mine(q) && partial(q) && fits([...keysOf(contentsOf(itemAt(id))), ...keysOf(contentsOf(itemAt(q)))])))
    if (pair) return pair
    // Ce qui manque aux bons (du plus ancien au plus récent) : à sa caisse, si elle est dans sa zone.
    const have = new Map()
    const count = (ing) => have.set(ing, (have.get(ing) ?? 0) + 1)
    for (const it of Object.values(state.items)) {
      if (it.kind === 'ingredient' && !it.burnt) count(it.ing)
      else if (it.kind === 'plate') for (const [ing] of contentsOf(it)) count(ing)
    }
    for (const o of pending) {
      for (const [ing] of RECIPES[o.recipe].dish.contents) {
        if ((have.get(ing) ?? 0) > 0) {
          have.set(ing, have.get(ing) - 1)
          continue
        }
        const fetch = here('fetch', (id) => kind(id) === 'crate' && STATION_BY_ID[id].ing === ing, { ing })
        if (fetch) return fetch
      }
    }
    // Le reste du temps : la vaisselle.
    const wash = here('wash', sinkFull)
    if (wash) return wash
    const dirty = here('take-dirty', (id) => kind(id) === 'return' && slot(id).count > 0)
    if (dirty) return dirty
    return readyHere.length ? { step: 'need-plate', stations: [] } : null
  }
}

/** La médaille du moment (la partie en cours, ou finie). */
export function currentMedal(state, rules = RULES) {
  return medalOf(state.score, state.players, rules)
}

/**
 * Le résultat d'une partie finie, tel que le relais l'envoie au site (cf. docs/mess-rush-site.md).
 * `endedAt` : l'heure de fin, horodatée par le relais (celle qui fait foi pour la semaine).
 */
export function serviceResult(state, endedAt = state.endedAt, rules = RULES) {
  const medal = currentMedal(state, rules)
  return {
    game: state.id,
    version: 1,
    startedAt: state.startedAt,
    endedAt,
    duration: Math.round((endedAt - state.startedAt) / 1000),
    players: state.players,
    score: state.score,
    medal,
    won: medal !== 'none',
    served: state.served,
    expired: state.expired,
    bestCombo: state.bestCombo,
    wasted: state.wasted,
  }
}

/** Ce que les joueurs reçoivent de l'état (tout, sauf la graine). */
export function serviceView(state) {
  const { rng: _rng, ...view } = state
  return view
}
