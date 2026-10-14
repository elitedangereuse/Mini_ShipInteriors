// MESS RUSH : la cuisine coopérative du mess (de 1 à 4 joueurs), règles communes au relais, qui
// arbitre la partie, et au client, qui la dessine et calcule ses invites (cf. docs/mess-rush.md).
//
// La partie se joue dans une instance : la cuisine du mess, seule (sans la salle du self), hors des
// ponts du vaisseau. Des clients font la queue devant le comptoir de service, un bon chacun ; on
// prend les ingrédients aux distributeurs, on les prépare (rincer, éplucher, couper, émincer,
// fouetter : un geste actif, au poste), on les cuit (cuire, mijoter, saisir, poêler, enfourner,
// infuser : une cuisson passive), on dresse l'assiette (ou l'on réunit deux assiettes) et on la
// pose à la passe. Le score est collectif.
//
// Tout l'état d'une partie est un objet JSON (pas de Map, pas de classe) : le relais l'envoie tel
// quel aux joueurs, et le client y relit ce que ferait chaque touche (`resolveAction`, la même
// fonction que l'arbitre). Les fonctions qui le changent sont pures, à l'horloge près (`now`, en
// ms), que l'appelant fournit.

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
 * de z 7 à 12). Au nord, la file des clients, derrière le comptoir de service ; au milieu, l'îlot ;
 * au sud, les postes adossés au mur.
 */
export const MESS_LAYOUT = [
  '', '', '', '', '', '', '',
  ...Array.from({ length: 6 }, () => `${' '.repeat(8)}${'m'.repeat(10)}`),
]

/** Bords intérieurs de la pièce (faces des murs). */
export const MESS_BOUNDS = { minX: 7.65, maxX: 17.35, minZ: 6.65, maxZ: 12.35 }

/**
 * Les grands meubles de la cuisine (cf. mess-rush/level.ts) : le comptoir de service, d'un mur à
 * l'autre (les clients sont derrière), et l'îlot, avec un passage à chaque bout.
 */
export const SERVICE_COUNTER = { minX: MESS_BOUNDS.minX, maxX: MESS_BOUNDS.maxX, minZ: 7.75, maxZ: 8.35 }
export const ISLAND = { minX: 8.95, maxX: 16.05, minZ: 9.8, maxZ: 10.35 }

/** Le sol des cuisiniers : du comptoir de service au mur du fond. */
export const KITCHEN_FLOOR = { minX: MESS_BOUNDS.minX, maxX: MESS_BOUNDS.maxX, minZ: SERVICE_COUNTER.maxZ, maxZ: MESS_BOUNDS.maxZ }

/** La file des clients, de l'autre côté du comptoir de service (cf. src/mess-rush/queue.ts). */
export const QUEUE = { minX: 8.2, maxX: 16.8, z: 7.15 }

/** Où l'on arrive dans la cuisine ouverte (un seul cuisinier) : l'allée du fond, devant les postes. */
export const MESS_SPAWNS = [
  { x: 10.6, z: 11.05 },
  { x: 14.6, z: 11.05 },
  { x: 10.6, z: 9.05 },
  { x: 14.6, z: 9.05 },
]

/** Une position est-elle sur le sol des cuisiniers ? */
export function onMessFloor(x, z) {
  return x > KITCHEN_FLOOR.minX && x < KITCHEN_FLOOR.maxX && z > KITCHEN_FLOOR.minZ && z < KITCHEN_FLOOR.maxZ
}

/**
 * Les postes, là où l'on agit (coordonnées de l'instance). `kind` dit ce qu'on y fait :
 * - `fridge`, `pantry` : distributeurs (on y prend un ingrédient) ;
 * - `board` (plan de travail), `sink` (plonge) : une place, et le geste actif du poste ;
 * - `pot` (marmite), `pan` (poêle), `oven` (four) : des ingrédients qui cuisent ensemble ;
 * - `fountain` : la machine à café, où l'on infuse le café et le thé, servis en tasse ;
 * - `plates` : une pile d'assiettes propres ;
 * - `counter` : une place de comptoir (de l'îlot, ou du comptoir de service) ;
 * - `pass` : une passe, au comptoir de service, où l'on livre ;
 * - `trash` : une poubelle, dans un coin.
 *
 * Le long du mur du fond, l'ouest a le frigo, la plonge et les poêles ; l'est, les marmites, le four
 * et le garde-manger. L'îlot porte les plans de travail, les assiettes et des places de comptoir ;
 * le comptoir de service, les deux passes et la machine à café. Ce sont tous les postes possibles :
 * une cuisine ne garde que ceux de son plan (cf. KITCHENS) ; les passe-plats de la cloison du
 * milieu n'existent qu'à plusieurs.
 */
export const STATIONS = [
  // Le mur du fond (z 12,075) : une poubelle dans chaque coin.
  { id: 'poubelle-so', kind: 'trash', x: 7.98, z: 12.02 },
  { id: 'frigo', kind: 'fridge', x: 8.9, z: 12.075 },
  { id: 'plonge', kind: 'sink', x: 10.0, z: 12.075 },
  { id: 'poele-1', kind: 'pan', x: 10.93, z: 12.075 },
  { id: 'poele-2', kind: 'pan', x: 11.57, z: 12.075 },
  { id: 'marmite-1', kind: 'pot', x: 13.28, z: 12.075 },
  { id: 'marmite-2', kind: 'pot', x: 13.92, z: 12.075 },
  { id: 'garde-manger', kind: 'pantry', x: 15.0, z: 12.14 },
  { id: 'comptoir-6', kind: 'counter', x: 16.15, z: 12.075 },
  { id: 'poubelle-se', kind: 'trash', x: 17.02, z: 12.02 },
  // L'îlot (z 10,075) : on l'atteint des deux côtés.
  { id: 'assiettes', kind: 'plates', x: 9.35, z: 10.075 },
  { id: 'plan-1', kind: 'board', x: 10.2, z: 10.075 },
  { id: 'comptoir-1', kind: 'counter', x: 11.05, z: 10.075 },
  { id: 'comptoir-2', kind: 'counter', x: 11.85, z: 10.075 },
  { id: 'passe-plat-ilot', kind: 'counter', x: 12.675, z: 10.075 },
  { id: 'comptoir-3', kind: 'counter', x: 13.5, z: 10.075 },
  { id: 'plan-2', kind: 'board', x: 14.3, z: 10.075 },
  { id: 'comptoir-4', kind: 'counter', x: 15.05, z: 10.075 },
  { id: 'assiettes-2', kind: 'plates', x: 15.7, z: 10.075 },
  // Le comptoir de service (z 8,05) : les passes et la machine à café ; une poubelle dans chaque coin.
  { id: 'poubelle-no', kind: 'trash', x: 7.98, z: 8.62 },
  { id: 'fontaine', kind: 'fountain', x: 9.3, z: 8.05 },
  { id: 'passe-1', kind: 'pass', x: 10.6, z: 8.05 },
  { id: 'passe-2', kind: 'pass', x: 14.6, z: 8.05 },
  { id: 'four', kind: 'oven', x: 16.0, z: 8.05 },
  { id: 'poubelle-ne', kind: 'trash', x: 17.02, z: 8.62 },
  // Les passe-plats de la cloison du milieu (à plusieurs).
  { id: 'passe-plat-nord', kind: 'counter', x: 12.675, z: 9.05 },
  { id: 'passe-plat-sud', kind: 'counter', x: 12.675, z: 11.1 },
]

/** Les postes, par identifiant. */
export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]))

// ---------------------------------------------------------------- les plans de la cuisine

/**
 * Les cloisons, comme dans Overcooked : à plusieurs, chacun tient sa zone et l'on se passe les
 * plats par-dessus les comptoirs. La cloison du milieu (x 12,5 à 12,85, un plan de travail étroit)
 * va du comptoir de service au mur du fond, en traversant l'îlot, et sépare l'ouest de l'est ; à
 * quatre, deux portillons ferment les passages au bout de l'îlot, qui sépare alors le nord du sud.
 */
const MID = { minX: 12.5, maxX: 12.85 }
const MID_NORTH = { ...MID, minZ: SERVICE_COUNTER.maxZ, maxZ: ISLAND.minZ }
const MID_SOUTH = { ...MID, minZ: ISLAND.maxZ, maxZ: 11.8 }
/** Les portillons, au bout de l'îlot. */
const WEST_GATE = { minX: MESS_BOUNDS.minX, maxX: ISLAND.minX, minZ: ISLAND.minZ, maxZ: ISLAND.maxZ }
const EAST_GATE = { minX: ISLAND.maxX, maxX: MESS_BOUNDS.maxX, minZ: ISLAND.minZ, maxZ: ISLAND.maxZ }

const WEST = { minX: MESS_BOUNDS.minX, maxX: MID.minX }
const EAST = { minX: MID.maxX, maxX: MESS_BOUNDS.maxX }
const NORTH = { minZ: KITCHEN_FLOOR.minZ, maxZ: ISLAND.minZ }
const SOUTH = { minZ: ISLAND.maxZ, maxZ: KITCHEN_FLOOR.maxZ }
const ALL_X = { minX: KITCHEN_FLOOR.minX, maxX: KITCHEN_FLOOR.maxX }
const ALL_Z = { minZ: KITCHEN_FLOOR.minZ, maxZ: KITCHEN_FLOOR.maxZ }

/**
 * Les postes de chaque coin de la cuisine. Chacun prend, prépare et cuit : le sud-ouest a le frigo,
 * la plonge et les poêles (viandes, fruits de mer, œufs) ; le sud-est le garde-manger, les marmites
 * et le four (légumes, riz, gâteaux, café) ; l'îlot, partagé entre le nord et le sud, les plans de
 * travail et les assiettes ; le nord, le comptoir de service, ses passes et la machine à café.
 */
const ISLAND_W = ['assiettes', 'plan-1', 'comptoir-1', 'comptoir-2', 'passe-plat-ilot']
const ISLAND_E = ['passe-plat-ilot', 'comptoir-3', 'plan-2', 'comptoir-4', 'assiettes-2']
const SW = ['poubelle-so', 'frigo', 'plonge', 'poele-1', 'poele-2', ...ISLAND_W, 'passe-plat-sud']
const SE = ['marmite-1', 'marmite-2', 'garde-manger', 'comptoir-6', 'poubelle-se', ...ISLAND_E, 'passe-plat-sud']
const NW = [...ISLAND_W, 'poubelle-no', 'fontaine', 'passe-1', 'passe-plat-nord']
const NE = [...ISLAND_E, 'passe-2', 'four', 'poubelle-ne', 'passe-plat-nord']
const OPEN = STATIONS.map((s) => s.id).filter((id) => id !== 'passe-plat-nord' && id !== 'passe-plat-sud')
const union = (...lists) => [...new Set(lists.flat())]

/**
 * Le plan de la cuisine selon le nombre de cuisiniers : ses zones (une par joueur, dans l'ordre du
 * salon), et les cloisons à élever. Chaque zone dit son sol (`bounds`), où l'on y arrive, et les
 * postes qu'on y atteint ; un poste partagé par deux zones est un passe-plat.
 * - 1 : toute la cuisine ;
 * - 2 : l'ouest (frigo, plonge, poêles) et l'est (garde-manger, marmites, four, café), chacun avec
 *   son plan de travail, ses assiettes et sa passe : les plats qui mêlent les deux se finissent en
 *   réunissant deux assiettes, par les passe-plats ;
 * - 3 : l'ouest, le sud-est et le nord-est ;
 * - 4 : les quatre coins.
 */
export const KITCHENS = {
  1: {
    walls: [],
    zones: [{ id: 'all', bounds: { ...ALL_X, ...ALL_Z }, spawn: MESS_SPAWNS[0], stations: OPEN }],
  },
  2: {
    walls: [MID_NORTH, MID_SOUTH],
    zones: [
      { id: 'west', bounds: { ...WEST, ...ALL_Z }, spawn: { x: 10.6, z: 11.05 }, stations: union(SW, NW) },
      { id: 'east', bounds: { ...EAST, ...ALL_Z }, spawn: { x: 14.6, z: 11.05 }, stations: union(SE, NE) },
    ],
  },
  3: {
    walls: [MID_NORTH, MID_SOUTH, EAST_GATE],
    zones: [
      { id: 'west', bounds: { ...WEST, ...ALL_Z }, spawn: { x: 10.6, z: 11.05 }, stations: union(SW, NW) },
      { id: 'south-east', bounds: { ...EAST, ...SOUTH }, spawn: { x: 14.6, z: 11.05 }, stations: SE },
      { id: 'north-east', bounds: { ...EAST, ...NORTH }, spawn: { x: 14.6, z: 9.05 }, stations: NE },
    ],
  },
  4: {
    walls: [MID_NORTH, MID_SOUTH, WEST_GATE, EAST_GATE],
    zones: [
      { id: 'south-west', bounds: { ...WEST, ...SOUTH }, spawn: { x: 10.6, z: 11.05 }, stations: SW },
      { id: 'south-east', bounds: { ...EAST, ...SOUTH }, spawn: { x: 14.6, z: 11.05 }, stations: SE },
      { id: 'north-west', bounds: { ...WEST, ...NORTH }, spawn: { x: 10.6, z: 9.05 }, stations: NW },
      { id: 'north-east', bounds: { ...EAST, ...NORTH }, spawn: { x: 14.6, z: 9.05 }, stations: NE },
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

/**
 * Un cuisinier quitte la brigade pour de bon : les cloisons tombent, et chacun atteint tous les
 * postes (sinon, sa zone n'aurait plus personne, et des plats deviendraient impossibles). La
 * cuisine reprend le plan d'un cuisinier seul : ce que portaient les passe-plats va sur la place
 * libre la plus proche (ou à la poubelle, s'il n'y en a plus).
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
    // La place libre du comptoir la plus proche du passe-plat qui disparaît.
    const from = STATION_BY_ID[id]
    const far = (s) => Math.hypot(STATION_BY_ID[s].x - from.x, STATION_BY_ID[s].z - from.z)
    const free = kept.filter((s) => STATION_BY_ID[s].kind === 'counter' && state.stations[s] && !state.stations[s].item).sort((a, b) => far(a) - far(b))[0]
    if (free) state.stations[free].item = item
    else {
      delete state.items[item]
      state.wasted += 1
    }
  }
  return [{ kind: 'open' }]
}

/** Noms des postes (invites, bulles). */
export const STATION_NAMES = {
  fridge: { fr: 'Frigo', en: 'Fridge' },
  pantry: { fr: 'Garde-manger', en: 'Pantry' },
  board: { fr: 'Plan de travail', en: 'Prep counter' },
  sink: { fr: 'Plonge', en: 'Sink' },
  pot: { fr: 'Marmite', en: 'Stockpot' },
  pan: { fr: 'Poêle', en: 'Pan' },
  oven: { fr: 'Four', en: 'Oven' },
  fountain: { fr: 'Machine à café', en: 'Coffee machine' },
  plates: { fr: 'Pile d\'assiettes', en: 'Plates' },
  counter: { fr: 'Comptoir', en: 'Counter' },
  pass: { fr: 'Passe', en: 'Pass' },
  trash: { fr: 'Poubelle', en: 'Bin' },
}

/** Les ustensiles où cuisent ensemble plusieurs ingrédients (la machine à café n'en prend qu'un). */
const UTENSILS = ['pot', 'pan', 'oven']

/** Combien d'ingrédients tient un ustensile. */
function capacity(kind, rules) {
  return kind === 'pot' ? rules.potCapacity : kind === 'oven' ? rules.ovenCapacity : rules.panCapacity
}

/** La cuisson d'un ingrédient (cuire, mijoter, saisir, poêler, enfourner, infuser), ou null. */
function cookProcess(ing) {
  return INGREDIENTS[ing].cook[0] ?? null
}

/**
 * La cuisson d'un ustensile : celle qui y est lancée, sinon celle de ce qu'il contient (ce qu'on
 * met ensemble cuit de la même façon), ou null s'il est vide.
 */
export function cookOf(state, stationId) {
  const s = state.stations[stationId]
  if (!s) return null
  if (s.cook?.process) return s.cook.process
  const first = s.items?.[0] ?? s.item
  const it = first ? state.items[first] : null
  return it?.kind === 'ingredient' ? cookProcess(it.ing) : null
}

/**
 * Chiffres de la partie (secondes, points), tous des réglages de départ à équilibrer.
 * - salon : salons, joueurs par salon, compte à rebours, arrivée, reconnexion, résultat gardé ;
 * - service : durée, portée d'une action côté relais (celle du client, 1,45, plus le retard de la
 *   dernière position reçue), capacités de l'assiette et des ustensiles ;
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
  ovenCapacity: 2,
  firstOrder: 3,
  complexAfter: 120,
  // Le rythme et les médailles sortent de la simulation (scripts/mess-rush-balance.mjs) : des
  // débutants y font le bronze, des joueurs moyens l'argent, l'or demande 90 % du score d'experts.
  // À plusieurs, les cloisons (cf. KITCHENS) obligent à se passer les plats, ce que la simulation
  // ne sait pas faire : délais allongés et seuils baissés d'environ 15 % au jugé. À confirmer en jeu.
  byPlayers: {
    1: { maxOrders: 2, every: 25, timeScale: 1.3, without: ['riz-crevettes', 'bouillon-imperial'] },
    2: { maxOrders: 3, every: 15, timeScale: 1.3, without: ['bouillon-imperial'] },
    3: { maxOrders: 4, every: 13, timeScale: 1.3, without: [] },
    4: { maxOrders: 5, every: 11, timeScale: 1.25, without: [] },
  },
  speedBonus: [[2 / 3, 0.5], [1 / 3, 0.25]],
  combo: { step: 0.1, max: 1.5 },
  expiredPenalty: 0.5,
  // Les imprévus (cf. EVENT_KINDS) : le premier après `first` secondes, puis un toutes les `every`
  // (de… à…) secondes après la fin du précédent, jamais dans les `quiet` dernières ; la panne et la
  // plonge bouchée durent ce temps-là (s), la flaque se nettoie en `clean` secondes (Espace), le
  // bon de l'amiral rapporte `vip.points` fois plus en `vip.time` fois moins de temps.
  events: { first: 60, every: [35, 55], quiet: 20, outage: 10, sink: 12, clean: 2.5, vip: { points: 2, time: 0.75 } },
  medals: {
    1: [230, 390, 490],
    2: [410, 580, 650],
    3: [450, 700, 770],
    4: [450, 700, 830],
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
    if (UTENSILS.includes(s.kind)) stations[s.id] = { items: [], cook: null, done: false }
    else if (s.kind === 'fountain') stations[s.id] = { item: null, cook: null, done: false }
    else if (s.kind === 'board' || s.kind === 'sink' || s.kind === 'counter') stations[s.id] = { item: null }
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

/** L'état d'un ingrédient : brut, puis le résultat de son dernier geste, ou de sa cuisson. */
export function ingredientState(item) {
  if (item.cooked) return PROCESSES[item.cooked].result
  if (!item.step) return 'brut'
  return PROCESSES[INGREDIENTS[item.ing].prep[item.step - 1]].result
}

/** Le prochain geste d'un ingrédient (rincer, couper, fouetter), ou null s'il est prêt. */
export function nextPrep(item) {
  if (item.kind !== 'ingredient' || item.cooked) return null
  return INGREDIENTS[item.ing].prep[item.step] ?? null
}

/**
 * L'ingrédient peut-il cuire à ce poste (marmite, poêle, four, machine à café) ? Il faut que ses
 * gestes soient faits, que sa cuisson se fasse là, et qu'elle soit celle de ce qui y est déjà.
 */
function canCook(state, item, stationId) {
  if (item.kind !== 'ingredient' || item.cooked || nextPrep(item) !== null) return false
  const cook = cookProcess(item.ing)
  if (!cook || PROCESSES[cook].station !== STATION_BY_ID[stationId].kind) return false
  const already = cookOf(state, stationId)
  return !already || already === cook
}

/** Ce que contient un plat (assiette ou tasse) : des paires [ingrédient, état]. */
function contentsOf(item) {
  return item.contents ?? []
}

/** Le plat (assiette ou tasse) correspond-il exactement à la recette ? */
export function dishMatches(item, recipeId) {
  const dish = RECIPES[recipeId].dish
  if ((item.kind === 'cup' ? 'cup' : item.kind === 'plate' ? 'plate' : null) !== dish.container) return false
  const want = dish.contents.map(([i, s]) => `${i}:${s}`).sort()
  const got = contentsOf(item).map(([i, s]) => `${i}:${s}`).sort()
  return want.length === got.length && want.every((w, k) => w === got[k])
}

/** La commande en attente la plus ancienne que ce plat sert, ou null. */
export function matchingOrder(state, item) {
  if (!item || (item.kind !== 'plate' && item.kind !== 'cup') || !contentsOf(item).length) return null
  return state.orders.filter((o) => o.status === 'pending').sort((a, b) => a.at - b.at).find((o) => dishMatches(item, o.recipe)) ?? null
}

/**
 * Les ingrédients qu'offre un distributeur : ceux des recettes des commandes en attente (de la
 * plus ancienne à la plus récente), puis ceux des autres recettes de la partie.
 */
export function dispenserChoices(state, stationId) {
  const kind = STATION_BY_ID[stationId]?.kind
  if (kind !== 'fridge' && kind !== 'pantry') return []
  const out = []
  const add = (recipe) => {
    for (const [ing] of RECIPES[recipe].dish.contents) if (INGREDIENTS[ing].source === kind && !out.includes(ing)) out.push(ing)
  }
  for (const o of [...state.orders].filter((o) => o.status === 'pending').sort((a, b) => a.at - b.at)) add(o.recipe)
  for (const r of state.recipes) add(r)
  return out
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

/** Une assiette (ou tasse) a-t-elle encore `n` places ? */
function room(plate, n, rules) {
  return plate.kind === 'plate' && contentsOf(plate).length + n <= rules.plateCapacity
}

/**
 * Ce que feraient les deux touches à ce poste, pour ce joueur : `use` (E, prendre ou poser) et
 * `work` (Espace, le geste ou la cuisson du poste). null : rien à faire. `pick` : l'ingrédient
 * choisi au distributeur. Le relais arbitre avec cette même fonction ; le client en tire ses invites.
 * @returns {{ use: { kind: string, ing?: string, order?: string | null } | null, work: { kind: string, process?: string, busy?: boolean } | null }}
 */
export function resolveAction(state, pid, stationId, pick, rules = RULES) {
  const none = { use: null, work: null }
  const station = STATION_BY_ID[stationId]
  if (!station || state.status !== 'running' || !canReach(state, pid, stationId)) return none
  const hand = held(state, pid)
  const s = state.stations[stationId]
  switch (station.kind) {
    case 'fridge':
    case 'pantry': {
      const choices = dispenserChoices(state, stationId)
      if (!choices.length) return none
      const ing = choices.includes(pick) ? pick : choices[0]
      return {
        use: hand ? null : { kind: 'take-ingredient', ing },
        work: !hand && choices.length > 1 ? { kind: 'cycle' } : null,
      }
    }
    case 'plates':
      return { use: hand ? null : { kind: 'take-plate' }, work: null }
    case 'board':
    case 'sink':
    case 'counter': {
      const slot = s.item ? state.items[s.item] : null
      let use = null
      if (!hand && slot) use = { kind: 'take' }
      else if (hand && !slot && (station.kind === 'counter' || hand.kind === 'ingredient')) use = { kind: 'put' }
      else if (hand && slot && hand.kind === 'plate' && slot.kind === 'ingredient' && room(hand, 1, rules)) use = { kind: 'plate-pick' }
      else if (hand && slot && hand.kind === 'ingredient' && slot.kind === 'plate' && room(slot, 1, rules)) use = { kind: 'plate-add' }
      // Deux assiettes : on verse celle qu'on tient dans celle qui est posée (riz d'un côté, crevettes de l'autre).
      else if (hand && slot && hand.kind === 'plate' && slot.kind === 'plate' && contentsOf(hand).length + contentsOf(slot).length > 0 && room(slot, contentsOf(hand).length, rules)) use = { kind: 'merge' }
      let work = null
      const next = slot ? nextPrep(slot) : null
      // (La plonge bouchée ne rince plus, cf. EVENT_KINDS.)
      if (!hand && next && PROCESSES[next].station === station.kind && !isBlocked(state, stationId)) {
        const other = workerAt(state, stationId)
        work = { kind: 'process', process: next, busy: !!other && other !== String(pid) }
      }
      return { use, work }
    }
    // Pas encore en cuisson, on reprend (E, les mains vides) le dernier ingrédient mis ; en cuisson
    // ou cuit, Espace vide l'ustensile (on s'est trompé : c'est perdu).
    case 'pot':
    case 'pan':
    case 'oven': {
      const idle = !s.cook && !s.done
      let use = null
      if (hand && canCook(state, hand, stationId) && idle && s.items.length < capacity(station.kind, rules)) use = { kind: 'fill' }
      else if (hand && hand.kind === 'plate' && s.done && room(hand, s.items.length, rules)) use = { kind: 'serve-utensil' }
      else if (!hand && idle && s.items.length) use = { kind: 'take-back' }
      const work = !s.items.length ? null : idle ? { kind: 'cook', process: cookOf(state, stationId) } : { kind: 'empty' }
      return { use, work }
    }
    case 'fountain': {
      const idle = !s.cook && !s.done
      let use = null
      if (hand && canCook(state, hand, stationId) && !s.item) use = { kind: 'fill' }
      else if (!hand && s.done && s.item) use = { kind: 'take' }
      else if (!hand && idle && s.item) use = { kind: 'take-back' }
      const work = !s.item ? null : idle ? { kind: 'cook', process: 'infuser' } : { kind: 'empty' }
      return { use, work }
    }
    case 'pass': {
      // Un plateau renversé sur la passe : on nettoie d'abord (Espace, les mains vides).
      if (isBlocked(state, stationId)) {
        const other = workerAt(state, stationId)
        return { use: null, work: hand ? null : { kind: 'clean', busy: !!other && other !== String(pid) } }
      }
      if (!hand || (hand.kind !== 'plate' && hand.kind !== 'cup') || !contentsOf(hand).length) return none
      return { use: { kind: 'deliver', order: matchingOrder(state, hand)?.id ?? null }, work: null }
    }
    case 'trash':
      return { use: hand ? { kind: 'trash' } : null, work: null }
  }
  return none
}

/** L'état où les recettes attendent un ingrédient : cuit (ou infusé) s'il cuit, sinon celui de son dernier geste. */
export function finalState(ing) {
  const info = INGREDIENTS[ing]
  if (info.cook.length) return PROCESSES[info.cook[0]].result
  const last = info.prep[info.prep.length - 1]
  return last ? PROCESSES[last].result : 'brut'
}

const componentKey = (ing, st) => `${ing}:${st}`

/**
 * Le prochain geste utile d'un joueur, pour les flèches et la consigne du bandeau (cf.
 * src/mess-rush/client.ts). `step` dit quoi, `stations` où : des postes de sa zone, ou, quand le
 * poste utile est chez un coéquipier, un passe-plat vers lui (`handoff`). null : rien d'évident.
 *
 * Les mains pleines : le geste qui fait avancer ce qu'on tient (préparer, cuire, dresser, livrer,
 * jeter ce qui ne sert à rien). Les mains vides, dans l'ordre : un plat prêt à livrer, quelque
 * chose de prêt à dresser (prendre une assiette ; sans pile d'assiettes dans sa zone, attendre qu'on
 * en passe une : `need-plate`, sans poste), un geste à faire sur un poste, un ustensile garni à
 * lancer, un ingrédient posé qu'on sait traiter, puis ce qui manque aux bons, au distributeur.
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
  const wanted = (ing) => pending.some((o) => RECIPES[o.recipe].dish.contents.some(([i]) => i === ing))
  /** Ces composants tiennent-ils ensemble dans l'assiette d'un bon en attente ? */
  const fits = (keys) => pending.some((o) => {
    const dish = RECIPES[o.recipe].dish
    if (dish.container !== 'plate') return false
    const left = dish.contents.map(([i, st]) => componentKey(i, st))
    return keys.every((k) => { const at = left.indexOf(k); if (at < 0) return false; left.splice(at, 1); return true })
  })
  /** L'ustensile prend-il un ingrédient de cette cuisson (libre, pas lancé, de la même cuisson) ? */
  const accepts = (id, cook) => {
    const s = slot(id)
    if (!s) return false
    if (kind(id) === 'fountain') return !s.item
    return !s.cook && !s.done && s.items.length < capacity(kind(id), rules) && (!cook || !cookOf(state, id) || cookOf(state, id) === cook)
  }
  /** Les composants d'une assiette (« riz-jaroua:cuit »). */
  const keysOf = (it) => contentsOf(it).map(([i, st]) => componentKey(i, st))
  /** Une assiette entamée posée sur un comptoir, qui ne sert encore aucun bon. */
  const partial = (id) => {
    const it = kind(id) === 'counter' ? itemAt(id) : null
    return it?.kind === 'plate' && contentsOf(it).length > 0 && !matchingOrder(state, it)
  }
  /** Les postes qui conviennent, dans sa zone ; sinon, un passe-plat libre vers une zone qui en a. */
  const toward = (step, ok, extra = {}) => {
    const all = kitchen.stations.filter(ok)
    const here = all.filter(mine)
    if (here.length) return { step, stations: here, ...extra }
    if (!all.length) return null
    const zones = kitchen.zones.filter((z) => z.stations.some((id) => all.includes(id)))
    const shared = kitchen.stations.filter((id) => kind(id) === 'counter' && mine(id) && !itemAt(id) && zones.some((z) => z.stations.includes(id)))
    return shared.length ? { step: 'handoff', stations: shared, ...extra } : null
  }
  /** Les postes qui conviennent, dans sa zone seulement (les mains vides, on ne passe rien). */
  const here = (step, ok, extra = {}) => {
    const list = kitchen.stations.filter((id) => ok(id) && mine(id))
    return list.length ? { step, stations: list, ...(typeof extra === 'function' ? extra(list[0]) : extra) } : null
  }
  const hand = held(state, pid)
  if (!hand) return idle()
  // Rien de mieux à faire de ce qu'on tient : on le pose, pour garder les mains libres ; nulle part
  // où le poser, un ingrédient part au bac (jamais un plat : on le garde).
  return holding(hand) ?? toward('put', (id) => kind(id) === 'counter' && !itemAt(id))
    ?? (hand.kind === 'ingredient' ? toward('trash', (id) => kind(id) === 'trash') : null)

  function holding(hand) {
    if (hand.kind === 'ingredient') {
      // Un poste libre de la bonne sorte. Tous pris : chez un coéquipier, on le lui passe quand même ;
      // dans sa zone, on le pose (cf. plus bas) pour avoir les mains libres, et on le reprendra.
      const next = nextPrep(hand)
      const busyHere = (ok) => kitchen.stations.some((id) => ok(id) && mine(id))
      if (next) {
        // (Pas à la plonge bouchée : on le pose en attendant.)
        const prepAt = (id) => kind(id) === PROCESSES[next].station && !isBlocked(state, id)
        return toward('prep', (id) => prepAt(id) && !itemAt(id), { ing: hand.ing, process: next }) ?? (busyHere(prepAt) ? null : toward('prep', prepAt, { ing: hand.ing, process: next }))
      }
      const cook = INGREDIENTS[hand.ing].cook[0]
      if (cook && !hand.cooked) {
        const cookAt = (id) => kind(id) === PROCESSES[cook].station
        return toward('cook', (id) => cookAt(id) && accepts(id, cook), { ing: hand.ing, process: cook }) ?? (busyHere(cookAt) ? null : toward('cook', cookAt, { ing: hand.ing, process: cook }))
      }
      // Prêt à dresser : dans une assiette posée qu'il complète pour un bon, sinon sur une place libre du comptoir.
      const key = componentKey(hand.ing, ingredientState(hand))
      return toward('plate', (id) => {
        const it = itemAt(id)
        return it?.kind === 'plate' && room(it, 1, rules) && fits([...contentsOf(it).map(([i, st]) => componentKey(i, st)), key])
      }, { ing: hand.ing })
        ?? toward('put', (id) => kind(id) === 'counter' && !itemAt(id), { ing: hand.ing })
    }
    // Une assiette, une tasse : à une passe libre. Toutes renversées chez soi : on le pose, le temps de nettoyer.
    if (matchingOrder(state, hand)) {
      const open = (id) => kind(id) === 'pass' && !isBlocked(state, id)
      const spilled = kitchen.stations.some((id) => kind(id) === 'pass' && mine(id)) && !kitchen.stations.some((id) => open(id) && mine(id))
      return spilled ? toward('put', (id) => kind(id) === 'counter' && !itemAt(id)) ?? { step: 'hold', stations: [] } : toward('deliver', open)
    }
    if (hand.kind === 'plate') {
      // Les bons que cette assiette peut encore devenir, et ce qui leur manque.
      const got = contentsOf(hand).map(([i, s]) => componentKey(i, s))
      const missing = new Set()
      for (const o of pending) {
        const dish = RECIPES[o.recipe].dish
        if (dish.container !== 'plate') continue
        const left = dish.contents.map(([i, s]) => componentKey(i, s))
        if (!got.every((g) => { const k = left.indexOf(g); if (k < 0) return false; left.splice(k, 1); return true })) continue
        for (const k of left) missing.add(k)
      }
      if (missing.size) {
        const fill = toward(got.length ? 'complete' : 'fill-plate', (id) => {
          const s = slot(id)
          if (s?.items) return s.done && s.items.length > 0 && room(hand, s.items.length, rules) && s.items.every((i) => missing.has(componentKey(state.items[i].ing, ingredientState(state.items[i]))))
          const it = itemAt(id)
          return it?.kind === 'ingredient' && missing.has(componentKey(it.ing, ingredientState(it)))
        })
        // (Prêt chez un coéquipier : on lui passe l'assiette.)
        if (fill) return fill
        // Ce qui manque est dans une autre assiette entamée : on réunit les deux (on verse la sienne dedans).
        if (got.length) {
          const merge = toward('merge', (id) => partial(id) && room(itemAt(id), got.length, rules) && fits([...keysOf(itemAt(id)), ...got]))
          if (merge) return merge
        }
        // Rien de prêt pour elle (ou pas de passe-plat libre) : entamée, on la pose en attendant ;
        // vide, elle repart au bac (posées, les assiettes vides finissent par boucher les comptoirs).
        return (got.length ? toward('wait', (id) => kind(id) === 'counter' && !itemAt(id)) : toward('trash', (id) => kind(id) === 'trash')) ?? { step: 'hold', stations: [] }
      }
      if (!got.length) return toward('trash', (id) => kind(id) === 'trash')
    }
    return toward('trash', (id) => kind(id) === 'trash')
  }

  function idle() {
    // Les mains vides. Un plateau renversé sur la passe, si on l'atteint : on nettoie d'abord.
    const spill = here('clean', (id) => kind(id) === 'pass' && isBlocked(state, id))
    if (spill) return spill
    // Un plat complet posé (ou une tasse prête) : à livrer, si l'on atteint la passe (sinon, c'est
    // un coéquipier qui l'a posé là pour la livrer).
    const reachPass = kitchen.stations.some((id) => kind(id) === 'pass' && mine(id))
    const done = (id) => {
      const it = itemAt(id)
      return !!it && (it.kind === 'plate' || it.kind === 'cup') && !!matchingOrder(state, it) && (kind(id) === 'counter' || kind(id) === 'fountain')
    }
    // Posé là où aucune zone qui atteint la passe ne le prendra : à reprendre, pour le faire passer.
    const passZones = kitchen.zones.filter((z) => z.stations.some((id) => kind(id) === 'pass'))
    const dish = here('take-dish', (id) => done(id) && (reachPass || !passZones.some((z) => z.stations.includes(id))))
    if (dish) return dish
    // Deux assiettes entamées, à sa portée, qui font ensemble (ou en partie) le plat d'un bon : on en
    // prend une pour la verser dans l'autre.
    const pair = here('take-merge', (id) => partial(id) && kitchen.stations.some((q) => q !== id && mine(q) && partial(q) && fits([...keysOf(itemAt(id)), ...keysOf(itemAt(q))])))
    if (pair) return pair
    // Prêt à dresser : un ustensile cuit, ou un ingrédient prêt posé sur un plan, à la plonge ou au
    // comptoir. Il lui faut une assiette : la pile, ou une assiette vide posée ; chez un coéquipier,
    // on la lui passera (cf. fill-plate).
    const readyAt = (id) => {
      const s = slot(id)
      if (s?.items) return s.done && s.items.length > 0 && s.items.every((i) => wanted(state.items[i].ing))
      const it = itemAt(id)
      return it?.kind === 'ingredient' && wanted(it.ing) && ingredientState(it) === finalState(it.ing) && ['board', 'sink', 'counter'].includes(kind(id))
    }
    const emptyPlate = (id) => kind(id) === 'counter' && itemAt(id)?.kind === 'plate' && contentsOf(itemAt(id)).length === 0
    /** Ce qui est prêt à ce poste, en composants (« lapin-ceti:cuit »). */
    const readyKeys = (id) => (slot(id)?.items ?? [slot(id)?.item]).filter(Boolean).map((i) => componentKey(state.items[i].ing, ingredientState(state.items[i])))
    /** Une assiette posée qui peut recevoir ce qui est prêt en `ready` : vide, ou entamée pour un bon que cela complète. */
    const plateFor = (ready) => (id) => {
      const it = kind(id) === 'counter' ? itemAt(id) : null
      if (it?.kind !== 'plate') return false
      return !contentsOf(it).length || fits([...contentsOf(it).map(([i, st]) => componentKey(i, st)), ...readyKeys(ready)])
    }
    // Sans assiette à sa portée, on fait autre chose en attendant (libérer un passe-plat, par exemple),
    // et l'on ne dit qu'à la fin qu'il en faut une.
    const readyHere = kitchen.stations.find((id) => mine(id) && readyAt(id))
    // (Une assiette entamée qu'il complète d'abord, puis une vide.)
    const plate = readyHere ? here('take-plate', (id) => plateFor(readyHere)(id) && contentsOf(itemAt(id)).length > 0) ?? here('take-plate', (id) => kind(id) === 'plates' || plateFor(readyHere)(id)) : null
    if (plate) return plate
    const takePlate = () => here('take-plate', (id) => kind(id) === 'plates' || emptyPlate(id))
    // Prêt chez un coéquipier qui n'a pas d'assiettes, et aucune assiette vide ne l'attend (posée à
    // sa portée, ou déjà en main chez lui) : on lui en passe une.
    const stranded = kitchen.stations.some((id) => {
      if (!readyAt(id)) return false
      const zones = kitchen.zones.filter((z) => z.stations.includes(id))
      const reach = (pred) => zones.some((z) => z.stations.some(pred))
      const holds = Object.entries(state.hands).some(([p, h]) => {
        const it = h ? state.items[h] : null
        return it?.kind === 'plate' && zones.includes(zoneOf(state, p)) && contentsOf(it).length === 0
      })
      // (Et un passe-plat libre vers lui : sinon, l'assiette n'irait nulle part.)
      const free = kitchen.stations.some((s) => kind(s) === 'counter' && mine(s) && !itemAt(s) && zones.some((z) => z.stations.includes(s)))
      return !reach((s) => kind(s) === 'plates') && !reach(plateFor(id)) && !holds && free
    })
    if (stranded && kitchen.stations.some((id) => kind(id) === 'plates' && mine(id))) {
      const plate = takePlate()
      if (plate) return plate
    }
    // Un geste à faire : un ingrédient posé là où on le prépare.
    const prep = here('work', (id) => {
      const it = itemAt(id)
      const next = it ? nextPrep(it) : null
      return !!next && PROCESSES[next].station === kind(id) && wanted(it.ing) && !isBlocked(state, id)
    }, (id) => ({ ing: itemAt(id).ing, process: nextPrep(itemAt(id)) }))
    if (prep) return prep
    // Un ustensile garni, pas encore lancé.
    const start = here('start', (id) => {
      const s = slot(id)
      return !!s && s.cook !== undefined && !s.cook && !s.done && (s.items ? s.items.length > 0 : !!s.item)
    })
    if (start) return start
    // Un ingrédient posé (comptoir, plan, plonge), qui attend ailleurs un geste ou une cuisson qu'on fait dans sa zone.
    const station = (it) => {
      const next = nextPrep(it)
      if (next) return PROCESSES[next].station
      const cook = INGREDIENTS[it.ing].cook[0]
      return cook && !it.cooked ? PROCESSES[cook].station : null
    }
    // (Ou qu'aucune zone qui sait le traiter n'atteint : on le reprend pour le lui passer, s'il y a
    // un passe-plat libre vers elle.)
    const take = here('take', (id) => {
      const it = itemAt(id)
      const need = it?.kind === 'ingredient' && wanted(it.ing) ? station(it) : null
      if (!['counter', 'board', 'sink'].includes(kind(id)) || !need || need === kind(id)) return false
      const open = (s) => kind(s) === need && ([...UTENSILS, 'fountain'].includes(need) ? accepts(s, cookProcess(it.ing)) : !itemAt(s))
      if (kitchen.stations.some((s) => mine(s) && open(s))) return true
      const able = kitchen.zones.filter((z) => z.stations.some((s) => kind(s) === need))
      const passable = kitchen.stations.some((s) => s !== id && kind(s) === 'counter' && mine(s) && !itemAt(s) && able.some((z) => z.stations.includes(s)))
      return !able.some((z) => z.stations.includes(id)) && passable
    }, (id) => ({ ing: itemAt(id).ing }))
    if (take) return take
    // Une assiette vide qui bouche un passe-plat, sans rien de prêt pour elle : on débarrasse.
    const tidy = here('tidy', (id) => emptyPlate(id) && kitchen.zones.filter((z) => z.stations.includes(id)).length > 1
      && !kitchen.stations.some((r) => readyAt(r) && kitchen.zones.some((z) => z.stations.includes(r) && z.stations.includes(id))))
    if (tidy) return tidy
    // Ce qui manque aux bons (du plus ancien au plus récent) : au distributeur, s'il est dans sa zone.
    const have = new Map()
    const count = (ing) => have.set(ing, (have.get(ing) ?? 0) + 1)
    for (const it of Object.values(state.items)) {
      if (it.kind === 'ingredient') count(it.ing)
      else for (const [ing] of contentsOf(it)) count(ing)
    }
    for (const o of pending) {
      for (const [ing] of RECIPES[o.recipe].dish.contents) {
        if ((have.get(ing) ?? 0) > 0) {
          have.set(ing, have.get(ing) - 1)
          continue
        }
        const fetch = here('fetch', (id) => kind(id) === INGREDIENTS[ing].source, { ing })
        if (fetch) return fetch
      }
    }
    return readyHere ? { step: 'need-plate', stations: [] } : null
  }
}

/**
 * Le fil rouge d'un objet qu'on tient (cf. src/mess-rush/client.ts) : le bon pour lequel on le
 * prépare (le plus ancien qui l'attend), et son chemin jusqu'à la passe, étape par étape, chacune
 * faite ou non. Un ingrédient : son distributeur, ses gestes, sa cuisson, l'assiette (ou la tasse) ;
 * une assiette ou une tasse : chacun des ingrédients du plat. null : il ne sert à aucun bon.
 * @returns {{ order: { id: string, recipe: string }, steps: { kind: string, process?: string, ing?: string, state?: string, done: boolean }[] } | null}
 */
export function threadOf(state, item) {
  if (!item) return null
  const pending = state.orders.filter((o) => o.status === 'pending').sort((a, b) => a.at - b.at)
  const pass = { kind: 'pass', done: false }
  if (item.kind === 'ingredient') {
    const order = pending.find((o) => RECIPES[o.recipe].dish.contents.some(([i]) => i === item.ing))
    if (!order) return null
    const info = INGREDIENTS[item.ing]
    const steps = [{ kind: info.source, ing: item.ing, done: true }]
    info.prep.forEach((p, k) => steps.push({ kind: PROCESSES[p].station, process: p, done: k < (item.step ?? 0) }))
    for (const c of info.cook) steps.push({ kind: PROCESSES[c].station, process: c, done: !!item.cooked })
    if (RECIPES[order.recipe].dish.container === 'plate') steps.push({ kind: 'plates', done: false })
    steps.push(pass)
    return { order: { id: order.id, recipe: order.recipe }, steps }
  }
  const got = contentsOf(item).map(([i, st]) => componentKey(i, st))
  const order = matchingOrder(state, item) ?? pending.find((o) => {
    const dish = RECIPES[o.recipe].dish
    if (dish.container !== (item.kind === 'cup' ? 'cup' : 'plate')) return false
    const left = dish.contents.map(([i, st]) => componentKey(i, st))
    return got.every((g) => { const k = left.indexOf(g); if (k < 0) return false; left.splice(k, 1); return true })
  })
  if (!order || (item.kind === 'plate' && !got.length)) return null
  const left = [...got]
  const steps = RECIPES[order.recipe].dish.contents.map(([ing, st]) => {
    const k = left.indexOf(componentKey(ing, st))
    if (k >= 0) left.splice(k, 1)
    return { kind: 'plates', ing, state: st, done: k >= 0 }
  })
  steps.push(pass)
  return { order: { id: order.id, recipe: order.recipe }, steps }
}

function newItem(state, item) {
  state.seq += 1
  const id = `i${state.seq}`
  state.items[id] = { id, ...item }
  return id
}

/**
 * La touche E (prendre, poser, servir, livrer, jeter) à ce poste. Refus : `{ ok: false, code }`.
 * @returns {{ ok: true, events: object[] } | { ok: false, code: string }}
 */
export function useStation(state, pid, stationId, pick, now, rules = RULES) {
  const { use } = resolveAction(state, pid, stationId, pick, rules)
  if (!use) return { ok: false, code: state.status !== 'running' ? 'over' : 'state' }
  const s = state.stations[stationId]
  const hand = held(state, pid)
  const events = []
  switch (use.kind) {
    case 'take-ingredient':
      state.hands[pid] = newItem(state, { kind: 'ingredient', ing: use.ing, step: 0, progress: 0 })
      break
    case 'take-plate':
      state.hands[pid] = newItem(state, { kind: 'plate', contents: [] })
      break
    case 'take':
      state.hands[pid] = s.item
      s.item = null
      if (s.done !== undefined) {
        s.done = false
        s.cook = null
      }
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
    case 'merge': {
      const plate = state.items[s.item]
      plate.contents.push(...contentsOf(hand))
      delete state.items[hand.id]
      state.hands[pid] = null
      events.push({ kind: 'merged', station: stationId, by: pid })
      break
    }
    case 'fill':
      if (STATION_BY_ID[stationId].kind === 'fountain') s.item = hand.id
      else s.items.push(hand.id)
      state.hands[pid] = null
      break
    case 'take-back':
      if (STATION_BY_ID[stationId].kind === 'fountain') {
        state.hands[pid] = s.item
        s.item = null
      } else state.hands[pid] = s.items.pop()
      break
    case 'serve-utensil':
      for (const id of s.items) {
        const it = state.items[id]
        hand.contents.push([it.ing, ingredientState(it)])
        delete state.items[id]
      }
      s.items = []
      s.done = false
      s.cook = null
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
      events.push({ kind: 'served', order: order.id, recipe: order.recipe, points, combo: state.combo, by: pid, ...(order.vip ? { vip: true } : {}) })
      break
    }
    case 'trash':
      if (hand.kind === 'plate' && contentsOf(hand).length) hand.contents = []
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

/**
 * La touche Espace à ce poste : un geste actif (il avance dans `stepService`, tant que le joueur
 * reste au poste) ou le lancement d'une cuisson.
 * @returns {{ ok: true, events: object[] } | { ok: false, code: string }}
 */
export function workStation(state, pid, stationId, now, rules = RULES) {
  const { work } = resolveAction(state, pid, stationId, undefined, rules)
  if (!work || work.kind === 'cycle') return { ok: false, code: state.status !== 'running' ? 'over' : 'state' }
  if (work.busy) return { ok: false, code: 'busy' }
  const s = state.stations[stationId]
  if (work.kind === 'process') {
    state.work[pid] = { station: stationId, item: s.item }
    return { ok: true, events: [] }
  }
  if (work.kind === 'clean') {
    state.work[pid] = { station: stationId, clean: true }
    return { ok: true, events: [] }
  }
  if (work.kind === 'empty') {
    const ids = s.items ?? [s.item]
    for (const id of ids) delete state.items[id]
    if (s.items) s.items = []
    else s.item = null
    s.cook = null
    s.done = false
    state.wasted += ids.length
    return { ok: true, events: [{ kind: 'emptied', station: stationId, by: pid }] }
  }
  s.cook = { start: now, until: now + PROCESSES[work.process].duration * 1000, process: work.process }
  return { ok: true, events: [{ kind: 'cooking', station: stationId, process: work.process, by: pid }] }
}

/** Le joueur cesse son geste (il s'éloigne, il bouge) : la progression reste sur l'ingrédient. */
export function stopWork(state, pid) {
  delete state.work[pid]
}

/**
 * Un joueur quitte la cuisine (coupure, abandon) : ce qu'il tenait est posé sur la première place
 * libre du comptoir (de sa zone d'abord), ou jeté s'il n'y en a pas.
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
  delete state.items[id]
  state.wasted += 1
  return [{ kind: 'wasted', by: pid }]
}

/**
 * Une commande a expiré : les ingrédients qu'aucun bon en attente n'utilise disparaissent, où
 * qu'ils soient (dans les mains, sur un poste, dans un ustensile, dans une assiette ou une tasse).
 * Les assiettes restent, vidées de ce qui ne sert plus. Sans pénalité ni gaspillage compté.
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
  /** L'objet reste-t-il ? Une assiette perd ce qui ne sert plus ; une tasse, un ingrédient, s'en va. */
  const keep = (id) => {
    const item = state.items[id]
    if (!item) return false
    if (item.kind === 'plate') {
      const before = item.contents.length
      item.contents = item.contents.filter(([ing]) => needed.has(ing))
      count += before - item.contents.length
      return true
    }
    const ing = item.kind === 'cup' ? item.contents[0][0] : item.ing
    if (needed.has(ing)) return true
    drop(id)
    return false
  }
  for (const [pid, id] of Object.entries(state.hands)) if (id && !keep(id)) state.hands[pid] = null
  for (const s of Object.values(state.stations)) {
    if (s.items) {
      s.items = s.items.filter(keep)
      if (!s.items.length) {
        s.cook = null
        s.done = false
      }
    } else if (s.item && !keep(s.item)) {
      s.item = null
      if (s.cook !== undefined) {
        s.cook = null
        s.done = false
      }
    }
  }
  return count
}

// ---------------------------------------------------------------- les imprévus

/**
 * Les imprévus, comme dans Overcooked : un à la fois, tirés au sort par le relais (la graine du
 * service), annoncés à toute l'équipe.
 * - `outage` (panne de courant) : les fourneaux et la fontaine s'arrêtent, les cuissons restent où
 *   elles en sont (RULES.events.outage secondes) ;
 * - `sink` (plonge bouchée) : on ne rince plus (RULES.events.sink secondes) ;
 * - `spill` (un plateau renversé sur la passe) : plus de livraison tant qu'on ne l'a pas nettoyée
 *   (Espace, les mains vides, RULES.events.clean secondes) : du travail pour la salle ;
 * - `rush` (coup de feu) : deux bons d'un coup ;
 * - `vip` (l'amiral à bord) : un bon doré, plus pressé, qui rapporte plus.
 */
export const EVENT_KINDS = ['outage', 'sink', 'spill', 'rush', 'vip']

/** Un poste hors d'usage à cause d'un imprévu (la plonge bouchée, la passe où le plateau s'est renversé) ? */
export function isBlocked(state, stationId) {
  const kind = STATION_BY_ID[stationId]?.kind
  const e = state.event
  return (e?.kind === 'sink' && kind === 'sink') || (e?.kind === 'spill' && kind === 'pass' && (e.station ?? stationId) === stationId)
}

/** Une durée tirée au sort entre `[a, b]` secondes. */
function between(state, [a, b]) {
  return a + random(state) * (b - a)
}

/** L'imprévu en cours finit (le temps est passé, ou la passe est propre) ; le suivant est tiré. */
function endEvent(state, now, rules, by) {
  const kind = state.event?.kind
  state.event = null
  state.nextEventAt = now + between(state, rules.events.every) * 1000
  return kind ? [{ kind: 'event-end', event: kind, ...(by !== undefined ? { by } : {}) }] : []
}

/** Les imprévus à ce pas : la fin de celui en cours, ou le suivant, s'il est temps. */
function stepEvent(state, now, rules) {
  const e = state.event
  if (e) return e.until && now >= e.until ? endEvent(state, now, rules) : []
  if (state.nextEventAt === undefined || now < state.nextEventAt || now >= state.endsAt - rules.events.quiet * 1000) return []
  const possible = EVENT_KINDS.filter((k) => {
    if (k === 'sink') return kitchenOf(state).stations.some((id) => STATION_BY_ID[id].kind === 'sink')
    return true
  })
  const kind = possible[Math.floor(random(state) * possible.length)]
  const r = rules.events
  const events = []
  if (kind === 'outage' || kind === 'sink') {
    state.event = { kind, at: now, until: now + r[kind] * 1000 }
    events.push({ kind: 'event', event: kind, until: state.event.until })
  } else if (kind === 'spill') {
    // Sur l'une des passes (l'autre sert toujours).
    const passes = kitchenOf(state).stations.filter((id) => STATION_BY_ID[id].kind === 'pass')
    const station = passes[Math.floor(random(state) * passes.length)]
    state.event = { kind, at: now, progress: 0, station }
    events.push({ kind: 'event', event: kind, station })
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
 * avancent (pour qui est encore à son poste, cf. `near`), les cuissons finissent, les commandes
 * arrivent et expirent, le service se termine.
 * @param {(pid: string, stationId: string) => boolean} near
 * @returns {object[]} les évènements de ce pas
 */
export function stepService(state, now, dt, near, rules = RULES) {
  if (state.status !== 'running') return []
  const events = []
  // Les gestes actifs.
  for (const [pid, w] of Object.entries(state.work)) {
    // Nettoyer la passe : tant qu'on y reste, les mains vides.
    if (w.clean) {
      const spill = state.event?.kind === 'spill' ? state.event : null
      if (!spill || state.hands[pid] || !near(pid, w.station)) {
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
    const item = state.items[w.item]
    const s = state.stations[w.station]
    const next = item ? nextPrep(item) : null
    if (!item || s.item !== w.item || !next || state.hands[pid] || !near(pid, w.station)) {
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
  // Les cuissons (en panne de courant, elles s'arrêtent où elles en sont).
  const outage = state.event?.kind === 'outage'
  for (const st of STATIONS) {
    const s = state.stations[st.id]
    if (!s?.cook || s.done) continue
    if (outage) {
      s.cook.start += dt * 1000
      s.cook.until += dt * 1000
      continue
    }
    if (now < s.cook.until) continue
    s.done = true
    const process = s.cook.process ?? cookOf(state, st.id)
    if (st.kind === 'fountain') {
      const ing = state.items[s.item]
      delete state.items[s.item]
      s.item = newItem(state, { kind: 'cup', contents: [[ing.ing, PROCESSES[process].result]] })
    } else for (const id of s.items) state.items[id].cooked = process
    events.push({ kind: 'cooked', station: st.id, process })
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
