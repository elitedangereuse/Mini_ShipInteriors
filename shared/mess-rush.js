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

import { DIFFICULTIES, GUESTS, GUEST_RECIPES, INGREDIENTS, PROCESSES, RECIPES, SERVICE_RECIPES } from './mess-rush-catalog.js'

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
 * Le comptoir du nord : à l'ouest, une rangée de plans de travail ; ailleurs, le comptoir de service,
 * les clients derrière. On n'y range aucun ingrédient : les caisses sont au mur ouest, près des planches.
 */
export const NORTH_ROW = { minX: MESS_BOUNDS.minX, maxX: 10.75, minZ: 7.75, maxZ: 8.35 }
export const SERVICE_COUNTER = { minX: 10.75, maxX: MESS_BOUNDS.maxX, minZ: 7.75, maxZ: 8.35 }

/** Le sol des cuisiniers : du comptoir du nord au mur du fond. */
export const KITCHEN_FLOOR = { minX: MESS_BOUNDS.minX, maxX: MESS_BOUNDS.maxX, minZ: SERVICE_COUNTER.maxZ, maxZ: MESS_BOUNDS.maxZ }

/** La file des clients, de l'autre côté du comptoir de service (cf. src/mess-rush/queue.ts). */
export const QUEUE = { minX: 11.2, maxX: 16.9, z: 7.15 }

/** Hauteur du dessus des meubles de la cuisine : à la taille des cuisiniers (0,67 m), comme dans Overcooked. */
export const COUNTER_TOP = 0.34

/** Où arrive chaque cuisinier (dans l'ordre du salon) : au milieu de la cuisine, face aux fourneaux. */
export const MESS_SPAWNS = [
  { x: 11.4, z: 10.4 },
  { x: 13.4, z: 10.4 },
  { x: 11.4, z: 9.3 },
  { x: 13.4, z: 9.3 },
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
 * - `counter` : une place de comptoir, où poser ce qu'on veut ;
 * - `extinguisher` : le crochet de l'extincteur, au mur entre les fourneaux (cf. l'imprévu `fire`) ;
 * - `pass` : la passe, où l'on livre ;
 * - `trash` : une poubelle, dans un coin.
 *
 * Une seule cuisine ouverte, comme dans Overcooked, des comptoirs tout autour et le milieu libre :
 * chacun choisit ce qu'il fait. Elle se lit comme une chaîne, d'ouest en est : les caisses au mur
 * ouest, les planches juste à côté (au fond et au nord), puis les fourneaux (deux marmites, deux poêles), la plonge
 * et les assiettes propres à l'est ; au nord, le comptoir de service avec la passe et le retour de
 * vaisselle, les clients derrière.
 */
export const STATIONS = [
  // Le mur ouest : les cinq caisses, une par ingrédient.
  { id: 'caisse-lapin', kind: 'crate', ing: 'lapin-ceti', x: 7.95, z: 8.75 },
  { id: 'caisse-legumes', kind: 'crate', ing: 'legumes', x: 7.95, z: 9.42 },
  { id: 'caisse-crevettes', kind: 'crate', ing: 'crevettes-baltahsine', x: 7.95, z: 10.09 },
  { id: 'caisse-riz', kind: 'crate', ing: 'riz-jaroua', x: 7.95, z: 10.76 },
  { id: 'caisse-pommes', kind: 'crate', ing: 'pommes-aerial', x: 7.95, z: 11.43 },
  // Le mur du fond : un comptoir dans le coin, deux planches (près des dernières caisses), un comptoir,
  // les fourneaux et, entre eux, l'extincteur (son panneau au mur), un comptoir, la plonge, et la
  // poubelle dans le coin.
  { id: 'comptoir-so', kind: 'counter', x: 8.3, z: 12.075 },
  { id: 'plan-1', kind: 'board', x: 9.05, z: 12.075 },
  { id: 'plan-2', kind: 'board', x: 9.8, z: 12.075 },
  { id: 'comptoir-fo', kind: 'counter', x: 10.55, z: 12.075 },
  { id: 'marmite-1', kind: 'pot', x: 11.43, z: 12.075 },
  { id: 'marmite-2', kind: 'pot', x: 12.07, z: 12.075 },
  { id: 'extincteur', kind: 'extinguisher', x: 12.85, z: 12.075 },
  { id: 'poele-1', kind: 'pan', x: 13.63, z: 12.075 },
  { id: 'poele-2', kind: 'pan', x: 14.27, z: 12.075 },
  { id: 'comptoir-se', kind: 'counter', x: 15.0, z: 12.075 },
  { id: 'plonge', kind: 'sink', x: 15.9, z: 12.075 },
  { id: 'poubelle-se', kind: 'trash', x: 16.95, z: 12.02 },
  // Le mur est : la pile d'assiettes propres (près de la plonge) et deux comptoirs.
  { id: 'assiettes', kind: 'plates', x: 17.075, z: 11.2 },
  { id: 'comptoir-e1', kind: 'counter', x: 17.075, z: 10.35 },
  { id: 'comptoir-e2', kind: 'counter', x: 17.075, z: 9.5 },
  // Le nord : la poubelle dans le coin, une planche (près des premières caisses) et des plans de
  // travail, puis le comptoir de service (la passe, le retour de vaisselle) ; aucun ingrédient près
  // de la caisse.
  { id: 'poubelle-no', kind: 'trash', x: 7.98, z: 8.05 },
  { id: 'plan-3', kind: 'board', x: 8.75, z: 8.05 },
  { id: 'comptoir-n2', kind: 'counter', x: 9.5, z: 8.05 },
  { id: 'comptoir-n3', kind: 'counter', x: 10.25, z: 8.05 },
  { id: 'comptoir-n4', kind: 'counter', x: 11.2, z: 8.05 },
  { id: 'comptoir-n5', kind: 'counter', x: 12.0, z: 8.05 },
  { id: 'passe', kind: 'pass', x: 13.2, z: 8.05 },
  { id: 'retour', kind: 'return', x: 14.5, z: 8.05 },
  { id: 'comptoir-n6', kind: 'counter', x: 15.5, z: 8.05 },
  { id: 'comptoir-n7', kind: 'counter', x: 16.3, z: 8.05 },
  { id: 'comptoir-ne', kind: 'counter', x: 17.0, z: 8.05 },
]

/** Les postes, par identifiant. */
export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]))
const STATION_IDS = STATIONS.map((s) => s.id)

/** Range un objet qui n'a plus de place : une assiette retourne à la pile, la vaisselle sale au retour, l'extincteur à son crochet. */
function stow(state, id) {
  const item = state.items[id]
  // L'extincteur retourne à son crochet.
  if (item?.kind === 'extinguisher' && state.stations.extincteur) {
    state.stations.extincteur.item = id
    return
  }
  delete state.items[id]
  if (item?.kind === 'plate' && state.stations.assiettes) state.stations.assiettes.count += 1
  else if (item?.kind === 'dirty' && state.stations.retour) state.stations.retour.count += item.count
  else state.wasted += 1
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
  extinguisher: { fr: 'Extincteur', en: 'Fire extinguisher' },
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
 * - commandes : première commande, rythme selon le nombre de joueurs (`without` : des recettes
 *   qu'on ne servirait pas à ce nombre) ;
 * - visiteurs de marque : combien par service, quand (`from` après le début, `until` avant la fin),
 *   et combien leur plat rapporte de plus ;
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
  cook: { potExtra: 1.5, burn: { pot: 24, pan: 18 }, warn: 6 },
  plates: { 1: 3, 2: 4, 3: 4, 4: 5 },
  plateReturn: 7,
  wash: 1.5,
  firstOrder: 3,
  byPlayers: {
    1: { maxOrders: 2, every: 30, timeScale: 1.4 },
    2: { maxOrders: 3, every: 24, timeScale: 1.4 },
    3: { maxOrders: 4, every: 20, timeScale: 1.35 },
    4: { maxOrders: 5, every: 17, timeScale: 1.3 },
  },
  // Plus aucun bon en attente : le suivant arrive au plus tard `refill` secondes après (et pas tout de
  // suite : une équipe rapide n'en reçoit pas plus pour autant).
  refill: 6,
  // Les visiteurs de marque (cf. GUESTS) : entre `count[0]` et `count[1]` par service, chacun
  // différent, répartis entre `from` secondes après le début et `until` secondes avant la fin ; leur
  // plat (trois ingrédients) rapporte `points` fois plus.
  guests: { count: [4, 5], from: 30, until: 55, points: 2 },
  speedBonus: [[2 / 3, 0.5], [1 / 3, 0.25]],
  combo: { step: 0.1, max: 1.5 },
  expiredPenalty: 0.5,
  // Les imprévus (cf. EVENT_KINDS) : un dans chaque créneau de `slots` (de… à… secondes après le
  // début), jamais dans les `quiet` dernières. Le plateau renversé se nettoie en `clean` secondes ;
  // Moustache se promène `cat.prowl` secondes, puis mange ce qu'elle convoite au bout de `cat.perch`
  // secondes, si personne ne la chasse ; la surchauffe dure `overheat.time` secondes et fait tout
  // cuire (et brûler) `overheat.speed` fois plus vite ; le saut dure `hyperspace.time` secondes, les
  // gestes y vont `hyperspace.slow` fois moins vite ; le feu s'éteint en `fire.put` secondes, et
  // brûle ce qu'il y a dans l'ustensile au bout de `fire.time`. Le tirage : chaque imprévu a la même
  // chance, jamais deux fois le même (au-delà : multipliée par `repeat` à chaque fois).
  events: {
    slots: [[40, 135], [165, 250]], quiet: 20, clean: 2.5, cat: { prowl: 10, perch: 7 }, overheat: { time: 15, speed: 1.7 },
    hyperspace: { time: 12, slow: 0.5 }, fire: { time: 25, put: 1.5 }, repeat: 0.35,
  },
  // Les médailles : environ 30, 50 et 70 % de ce que font des robots qui suivent le guidage sans
  // jamais marcher (cf. server/mess-rush-kitchens.test.js), dans la cuisine ouverte, visiteurs de
  // marque compris.
  medals: {
    1: [640, 1070, 1500],
    2: [720, 1200, 1675],
    3: [765, 1280, 1790],
    4: [805, 1340, 1880],
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
 * Une nouvelle partie, en service dès `now`. `recipes` : les plats que commandent les clients du
 * mess (la carte du nombre de joueurs par défaut, cf. menuFor) ; les visiteurs de marque, eux, ont
 * leur programme, tiré au sort ici (`guests`, cf. planGuests). La cuisine est ouverte : chacun
 * atteint tous les postes et choisit ce qu'il fait.
 * @param {{ id: string, seed: number, players: number, now: number, recipes?: string[], rules?: typeof RULES }} o
 */
export function createService({ id, seed, players, now, recipes, rules = RULES }) {
  const n = Math.min(4, Math.max(1, players))
  const stations = {}
  for (const s of STATIONS) {
    if (UTENSILS.includes(s.kind)) stations[s.id] = { items: [], cook: null, done: false, burnt: false }
    else if (s.kind === 'board' || s.kind === 'counter') stations[s.id] = { item: null }
    else if (s.kind === 'plates') stations[s.id] = { count: rules.plates[n] }
    else if (s.kind === 'return') stations[s.id] = { count: 0, pending: [] }
    else if (s.kind === 'sink') stations[s.id] = { count: 0, progress: 0 }
  }
  const state = {
    id,
    players: n,
    recipes: [...(recipes ?? menuFor(n, SERVICE_RECIPES, rules))],
    startedAt: now,
    endsAt: now + rules.service * 1000,
    status: 'running',
    rng: seed >>> 0,
    seq: 0,
    orderSeq: 0,
    nextOrderAt: now + rules.firstOrder * 1000,
    event: null,
    eventCounts: {},
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
  // L'extincteur, à son crochet.
  state.items.ext = { id: 'ext', kind: 'extinguisher' }
  state.stations.extincteur = { item: 'ext' }
  state.eventPlan = planEvents(state, rules)
  state.guests = planGuests(state, rules)
  return state
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
  if (!station || state.status !== 'running') return null
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
      // En feu : seul l'extincteur y fait quelque chose.
      if (state.event?.kind === 'fire' && state.event.station === stationId) return hand?.kind === 'extinguisher' ? { kind: 'extinguish', busy: busy() } : null
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
    case 'extinguisher':
      // Le crochet de l'extincteur : on l'y prend, on l'y raccroche.
      if (!hand && s.item) return { kind: 'take' }
      return hand?.kind === 'extinguisher' && !s.item ? { kind: 'put' } : null
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
    case 'extinguish':
      state.work[pid] = { station: stationId, extinguish: true }
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
      const points = Math.round(base * (order.guest ? rules.guests.points : 1) * (1 + speedBonus(remaining, rules)) * comboMultiplier(state.combo, rules))
      order.status = 'served'
      order.done = now
      order.points = points
      state.score += points
      state.served += 1
      delete state.items[hand.id]
      state.hands[pid] = null
      // L'assiette revient sale au retour de vaisselle, un peu plus tard.
      state.stations.retour?.pending.push(now + rules.plateReturn * 1000)
      events.push({ kind: 'served', order: order.id, recipe: order.recipe, points, combo: state.combo, by: pid, ...(order.guest ? { guest: order.guest } : {}) })
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
 * libre du comptoir, ou rangé (une assiette à sa pile, un ingrédient perdu).
 */
export function dropHeld(state, pid) {
  stopWork(state, pid)
  const id = state.hands[pid]
  delete state.hands[pid]
  if (!id) return []
  // L'extincteur retourne à son crochet.
  if (state.items[id]?.kind === 'extinguisher') {
    stow(state, id)
    return [{ kind: 'dropped', by: pid, station: 'extincteur' }]
  }
  const counters = STATIONS.filter((s) => s.kind === 'counter' && state.stations[s.id] && !state.stations[s.id].item)
  const free = counters[0]
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
    if (item.kind === 'dirty' || item.kind === 'extinguisher') return true
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
 * service), annoncés à toute l'équipe. Tous se règlent en jouant :
 * - `spill` (un plateau renversé sur la passe) : plus de livraison tant qu'on ne l'a pas nettoyée
 *   (la touche, les mains vides, RULES.events.clean secondes) ;
 * - `cat` (« Moustache est là ! » : la chatte du labo, qui vient mendier en cuisine) : elle se
 *   promène d'abord dans la cuisine (`prowl` secondes : on la voit, on ne peut rien lui faire), puis
 *   saute sur une préparation (un ingrédient posé, sinon une planche) et la bloque ; elle la mange au
 *   bout de `perch` secondes si personne ne vient la chasser (la touche) ;
 * - `overheat` (surchauffe des fourneaux) : tout cuit, et brûle, plus vite un moment : il faut
 *   surveiller ses marmites ;
 * - `rush` (coup de feu) : deux bons d'un coup ;
 * - `hyperspace` (passage en hyperespace) : le vaisseau saute, tout tremble un moment ; les mains
 *   aussi : couper, laver, nettoyer et éteindre vont deux fois moins vite (la cuisson, elle, continue) ;
 * - `fire` (« Au feu ! ») : une marmite ou une poêle prend feu ; sa cuisson s'arrête et on ne peut plus
 *   s'en servir ; on prend l'extincteur au mur (le poste `extincteur`), et la touche, devant le feu,
 *   l'éteint (`fire.put` secondes) ; laissé `fire.time` secondes, ce qu'elle contenait brûle.
 *
 * Deux imprévus par service, à des moments tirés au sort : un dans chaque créneau de
 * RULES.events.slots (le premier dans les deux minutes et demie, le second ensuite), jamais deux fois
 * le même. Si le précédent dure encore, le suivant attend qu'il finisse. Les visiteurs de marque ne
 * sont pas des imprévus : ils ont leur programme (cf. planGuests).
 */
export const EVENT_KINDS = ['spill', 'cat', 'overheat', 'rush', 'hyperspace', 'fire']

/** Un poste hors d'usage à cause d'un imprévu (la passe renversée, Moustache assise dessus, le feu) ? */
export function isBlocked(state, stationId) {
  const e = state.event
  if (e?.kind === 'cat' || e?.kind === 'fire') return !!e.station && e.station === stationId
  return e?.kind === 'spill' && STATION_BY_ID[stationId]?.kind === 'pass'
}

/** Une durée tirée au sort entre `[a, b]` secondes. */
function between(state, [a, b]) {
  return a + random(state) * (b - a)
}

/** Le programme des imprévus d'un service : une heure dans chaque créneau de RULES.events.slots. */
function planEvents(state, rules) {
  return rules.events.slots.map((slot) => state.startedAt + Math.round(between(state, slot) * 1000))
}

/** L'imprévu en cours finit (le temps est passé, la passe est propre, Moustache est partie, le feu est éteint). */
function endEvent(state, now, rules, by) {
  const kind = state.event?.kind
  state.event = null
  return kind ? [{ kind: 'event-end', event: kind, ...(by !== undefined ? { by } : {}) }] : []
}

/** Où Moustache se promène avant de sauter : quelques points du sol de la cuisine, tirés au sort. */
function prowlPath(state) {
  const path = [{ x: KITCHEN_FLOOR.minX + 0.6, z: 9.2 + random(state) * 2 }]
  for (let i = 0; i < 3; i++) path.push({ x: 9 + random(state) * 7, z: 9 + random(state) * 2.6 })
  return path.map((p) => ({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 }))
}

/** Les imprévus à ce pas : ce que fait celui en cours (Moustache saute, mange ; le feu brûle), ou le suivant, s'il est temps. */
function stepEvent(state, now, rules) {
  const e = state.event
  const r = rules.events
  if (e) {
    // Moustache a fini sa promenade : elle saute sur une préparation (un ingrédient posé, sinon une planche).
    if (e.kind === 'cat' && !e.station && now >= e.perchAt) {
      const perches = STATIONS.filter((s) => ['board', 'counter'].includes(s.kind) && state.stations[s.id]).map((s) => s.id)
      const food = perches.filter((id) => state.items[state.stations[id].item]?.kind === 'ingredient')
      const boards = perches.filter((id) => STATION_BY_ID[id].kind === 'board')
      const list = food.length ? food : boards.length ? boards : perches
      e.station = list[Math.floor(random(state) * list.length)]
      e.until = now + r.cat.perch * 1000
      return [{ kind: 'perch', station: e.station, until: e.until }]
    }
    if (!e.until || now < e.until) return []
    const events = []
    // Moustache n'a pas été chassée : elle mange ce qui était sur le comptoir.
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
    // Le feu n'a pas été éteint : ce que contenait l'ustensile brûle, le feu retombe.
    if (e.kind === 'fire') {
      const s = state.stations[e.station]
      if (s?.items.length) {
        s.burnt = true
        s.done = true
        for (const id of s.items) state.items[id].burnt = true
        events.push({ kind: 'burnt', station: e.station })
      }
    }
    return [...events, ...endEvent(state, now, rules)]
  }
  const plan = state.eventPlan ?? []
  if (!plan.length || now < plan[0] || now >= state.endsAt - r.quiet * 1000) return []
  plan.shift()
  const seen = (state.eventCounts ??= {})
  const fresh = EVENT_KINDS.filter((k) => !seen[k])
  const kind = weighted(state, (fresh.length ? fresh : EVENT_KINDS).map((k) => [k, r.repeat ** (seen[k] ?? 0)]))
  seen[kind] = (seen[kind] ?? 0) + 1
  const events = []
  if (kind === 'spill') {
    state.event = { kind, at: now, progress: 0, station: 'passe' }
    events.push({ kind: 'event', event: kind, station: 'passe' })
  } else if (kind === 'cat') {
    state.event = { kind, at: now, perchAt: now + r.cat.prowl * 1000, path: prowlPath(state), station: null }
    events.push({ kind: 'event', event: kind, until: state.event.perchAt })
  } else if (kind === 'overheat' || kind === 'hyperspace') {
    state.event = { kind, at: now, until: now + r[kind].time * 1000 }
    events.push({ kind: 'event', event: kind, until: state.event.until })
  } else if (kind === 'fire') {
    // Le feu prend de préférence là où ça cuit.
    const utensils = STATIONS.filter((s) => UTENSILS.includes(s.kind)).map((s) => s.id)
    const busy = utensils.filter((id) => state.stations[id].items.length && !state.stations[id].burnt)
    const list = busy.length ? busy : utensils
    const station = list[Math.floor(random(state) * list.length)]
    state.event = { kind, at: now, until: now + r.fire.time * 1000, station, progress: 0 }
    events.push({ kind: 'event', event: kind, station, until: state.event.until })
  } else {
    // Le coup de feu : deux bons, tout de suite (un peu au-delà du plafond).
    events.push({ kind: 'event', event: kind })
    const { maxOrders } = pace(state.players, rules)
    for (let i = 0; i < 2; i++) {
      if (state.orders.filter((o) => o.status === 'pending').length >= maxOrders + 2) break
      const order = spawnOrder(state, now, rules)
      if (order) events.push({ kind: 'order', order: order.id, recipe: order.recipe })
    }
  }
  return events
}

/** Tire au sort dans une liste pondérée de paires [valeur, poids]. */
function weighted(state, list) {
  let r = random(state) * list.reduce((t, [, w]) => t + w, 0)
  for (const [value, w] of list) if ((r -= w) < 0) return value
  return list[list.length - 1][0]
}

/**
 * Le programme des visiteurs de marque d'un service : entre RULES.guests.count[0] et [1]
 * personnages du vaisseau (cf. GUESTS), tous différents, chacun à son heure, répartis sur le service
 * (un par tranche, à un moment tiré au sort dans sa tranche).
 */
function planGuests(state, rules) {
  const g = rules.guests
  const n = g.count[0] + Math.floor(random(state) * (g.count[1] - g.count[0] + 1))
  const pool = Object.keys(GUESTS)
  const picked = []
  while (picked.length < n && pool.length) picked.push(pool.splice(Math.floor(random(state) * pool.length), 1)[0])
  const from = state.startedAt + g.from * 1000
  const slot = (state.endsAt - g.until * 1000 - from) / Math.max(1, picked.length)
  return picked.map((guest, i) => ({ guest, at: Math.round(from + slot * (i + random(state) * 0.6)) }))
}

/**
 * Un nouveau bon : d'un client du mess (un plat de la carte, cf. `state.recipes`), ou d'un visiteur
 * de marque (`guest` : son plat préféré, à trois ingrédients).
 */
function spawnOrder(state, now, rules, guest) {
  const pool = guest ? [GUESTS[guest]?.dish ?? GUEST_RECIPES[0]] : state.recipes
  if (!pool.length) return null
  const recipe = pool[Math.floor(random(state) * pool.length)]
  const { time } = recipeValue(recipe)
  state.orderSeq += 1
  const scale = pace(state.players, rules).timeScale
  const order = { id: `c${state.orderSeq}`, recipe, at: now, until: now + Math.round(time * scale * 1000), status: 'pending', ...(guest ? { guest } : {}) }
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
  // Les gestes actifs (en hyperespace, les mains tremblent : ils vont moins vite).
  const gdt = state.event?.kind === 'hyperspace' ? dt * rules.events.hyperspace.slow : dt
  for (const [pid, w] of Object.entries(state.work)) {
    const away = !!state.hands[pid] || !near(pid, w.station)
    // Éteindre le feu : devant l'ustensile, l'extincteur en main.
    if (w.extinguish) {
      const fire = state.event?.kind === 'fire' && state.event.station === w.station ? state.event : null
      if (!fire || !near(pid, w.station) || held(state, pid)?.kind !== 'extinguisher') {
        delete state.work[pid]
        continue
      }
      fire.progress = (fire.progress ?? 0) + gdt
      if (fire.progress >= rules.events.fire.put - 1e-3) {
        delete state.work[pid]
        events.push(...endEvent(state, now, rules, pid))
      }
      continue
    }
    // Nettoyer la passe : tant qu'on y reste, les mains vides.
    if (w.clean) {
      const spill = state.event?.kind === 'spill' ? state.event : null
      if (!spill || away) {
        delete state.work[pid]
        continue
      }
      spill.progress = (spill.progress ?? 0) + gdt
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
      sink.progress += gdt
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
    item.progress = (item.progress ?? 0) + gdt
    // (à un millième près : des pas de 0,1 s ne tombent pas juste en virgule flottante)
    if (item.progress >= PROCESSES[next].duration - 1e-3) {
      item.step += 1
      item.progress = 0
      delete state.work[pid]
      events.push({ kind: 'prepared', station: w.station, ing: item.ing, process: next, by: pid })
    }
  }
  // Les cuissons : cuit à l'heure, brûlé si on l'oublie ; en surchauffe, tout va plus vite ; en feu,
  // tout s'arrête (le temps que le feu dure).
  const hot = state.event?.kind === 'overheat' ? (rules.events.overheat.speed - 1) * dt * 1000 : 0
  const burning = state.event?.kind === 'fire' ? state.event.station : null
  for (const st of STATIONS) {
    const s = state.stations[st.id]
    if (!s?.cook || s.burnt) continue
    if (st.id === burning) {
      if (!s.done) s.cook.until += dt * 1000
      s.cook.burnAt += dt * 1000
      continue
    }
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
  // Les visiteurs de marque, à leur heure : ils prennent la place d'un client (le bon suivant attend
  // d'autant), et passent un plafond plein d'une place au plus (sinon, ils attendent un peu).
  const { maxOrders, every } = pace(state.players, rules)
  for (const v of state.guests ?? []) {
    if (v.order || now < v.at) continue
    if (state.orders.filter((o) => o.status === 'pending').length > maxOrders) continue
    const order = spawnOrder(state, now, rules, v.guest)
    if (!order) continue
    v.order = order.id
    state.nextOrderAt = Math.max(state.nextOrderAt, now) + every * 1000
    events.push({ kind: 'order', order: order.id, recipe: order.recipe, guest: v.guest })
  }
  // Les nouvelles commandes : au rythme du nombre de joueurs, sans dépasser le plafond ; la cuisine
  // n'en a plus aucune : la suivante arrive bientôt (RULES.refill), pas tout de suite.
  const pending = state.orders.filter((o) => o.status === 'pending').length
  if (pending === 0) state.nextOrderAt = Math.min(state.nextOrderAt, now + rules.refill * 1000)
  if (now >= state.nextOrderAt && pending < maxOrders) {
    const order = spawnOrder(state, now, rules)
    if (order) events.push({ kind: 'order', order: order.id, recipe: order.recipe })
    state.nextOrderAt = now + every * 1000
  }
  return events
}

// ---------------------------------------------------------------- le guidage

/**
 * Le prochain geste utile d'un joueur, pour les robots des essais et de l'équilibrage (le jeu n'en
 * montre rien : c'est aux joueurs de s'organiser). `step` dit quoi, `stations` où. null : rien
 * d'évident.
 *
 * Les mains pleines : ce qui fait avancer ce qu'on tient (couper, cuire, dresser, livrer, laver la
 * vaisselle, jeter ce qui ne sert à rien). Les mains vides, dans l'ordre : chasser le chat, nettoyer
 * la passe, vider ce qui a brûlé, prendre un plat prêt à livrer, prendre une assiette pour ce qui est
 * prêt, laver s'il n'y a plus d'assiettes, couper, déplacer un ingrédient, réunir deux assiettes,
 * prendre ce qui manque aux bons dans les caisses, puis la vaisselle.
 * @returns {{ step: string, stations: string[], ing?: string, process?: string } | null}
 */
export function guide(state, pid, rules = RULES) {
  if (state.status !== 'running') return null
  const ids = STATION_IDS
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
    if (!utensil(id) || !s?.done || s.burnt || !s.items.length || isBlocked(state, id)) return false
    const got = utensilKeys(state, s).sort().join('|')
    return groups.some((g) => g(s.cook.process) === got)
  }
  /** Un ingrédient prêt à dresser tel quel (coupé, qui ne cuit pas), et qu'un bon attend. */
  const rawReady = (it) => it?.kind === 'ingredient' && !nextPrep(it) && !cookProcess(it.ing) && wanted(it.ing)
  const partial = (id) => kind(id) === 'counter' && itemAt(id)?.kind === 'plate' && contentsOf(itemAt(id)).length > 0 && !matchingOrder(state, itemAt(id))
  const rack = slot('assiettes')
  /** Un coéquipier y fait déjà un geste (couper, laver, nettoyer) : on va ailleurs. */
  const taken = (id) => Object.entries(state.work).some(([p, w]) => p !== String(pid) && w.station === id)

  /** Les postes qui conviennent (`extra` : ce qu'on précise, ou de quoi le calculer au premier). */
  const here = (step, ok, extra = {}) => {
    const list = ids.filter(ok)
    return list.length ? { step, stations: list, ...(typeof extra === 'function' ? extra(list[0]) : extra) } : null
  }
  const toward = here
  const putDown = () => toward('put', freeCounter) ?? { step: 'hold', stations: [] }

  const hand = held(state, pid)
  return hand ? holding(hand) : idle()

  function holding(hand) {
    if (hand.kind === 'dirty') return toward('wash', (id) => kind(id) === 'sink') ?? putDown()
    // L'extincteur : au feu, puis à son crochet.
    if (hand.kind === 'extinguisher') {
      if (state.event?.kind === 'fire') return here('extinguish', (id) => id === state.event.station)
      return here('hang', (id) => kind(id) === 'extinguisher' && !itemAt(id)) ?? putDown()
    }
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
      return toward('put', freeCounter, extra) ?? putDown()
    }
    // Une assiette.
    const got = keysOf(contentsOf(hand))
    if (got.length && matchingOrder(state, hand)) {
      return toward('deliver', (id) => kind(id) === 'pass' && !isBlocked(state, id)) ?? putDown()
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
    return toward('wait', freeCounter) ?? { step: 'hold', stations: [] }
  }

  function idle() {
    // L'urgence : le chat sur un comptoir, la passe renversée, ce qui a brûlé.
    const cat = here('shoo', (id) => state.event?.kind === 'cat' && state.event.station === id)
    if (cat) return cat
    // Au feu : l'extincteur (à son crochet, ou là où on l'a posé).
    const fire = state.event?.kind === 'fire' ? here('take-extinguisher', (id) => itemAt(id)?.kind === 'extinguisher') : null
    if (fire) return fire
    const spill = here('clean', (id) => kind(id) === 'pass' && isBlocked(state, id) && !taken(id))
    if (spill) return spill
    const burnt = here('empty', (id) => utensil(id) && !!slot(id)?.burnt && !isBlocked(state, id))
    if (burnt) return burnt
    // Un plat complet posé : à livrer.
    const dish = here('take-dish', (id) => kind(id) === 'counter' && !!matchingOrder(state, itemAt(id)))
    if (dish) return dish
    // Prêt à dresser (un ustensile cuit, un ingrédient coupé qui se sert cru) : une assiette (entamée qu'il complète, ou la pile).
    const readyAt = (id) => ready(id) || (['board', 'counter'].includes(kind(id)) && rawReady(itemAt(id)))
    const readyKeys = (id) => (utensil(id) ? utensilKeys(state, slot(id)) : [componentKey(itemAt(id).ing, ingredientState(itemAt(id)))])
    const readyHere = ids.filter(readyAt)
    if (readyHere.length) {
      const fitsPlate = (id) => partial(id) && readyHere.some((r) => fits([...keysOf(contentsOf(itemAt(id))), ...readyKeys(r)]))
      const plate = here('take-plate', fitsPlate) ?? here('take-plate', (id) => kind(id) === 'plates' && slot(id).count > 0)
        ?? here('take-plate', (id) => kind(id) === 'counter' && itemAt(id)?.kind === 'plate' && !contentsOf(itemAt(id)).length)
      if (plate) return plate
    }
    // Plus d'assiettes propres : la vaisselle d'abord.
    const sinkFull = (id) => kind(id) === 'sink' && slot(id)?.count > 0 && !taken(id)
    if (rack && rack.count === 0) {
      const wash = here('wash', sinkFull)
      if (wash) return wash
      const dirty = here('take-dirty', (id) => kind(id) === 'return' && slot(id).count > 0)
      if (dirty) return dirty
    }
    // Couper ce qui attend sur une planche.
    const chop = here('work', (id) => kind(id) === 'board' && !!itemAt(id) && nextPrep(itemAt(id)) === 'couper' && wanted(itemAt(id).ing) && !isBlocked(state, id) && !taken(id),
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
      // Prêt à dresser tel quel : on le dressera (cf. plus haut), on ne le déplace pas.
      if (!nextPrep(it) && !cookProcess(it.ing)) return false
      return ids.some(need(it))
    }, (id) => ({ ing: itemAt(id).ing }))
    if (take) return take
    // Deux assiettes entamées qui font ensemble le plat d'un bon : on en prend une.
    const pair = here('take-merge', (id) => partial(id) && ids.some((q) => q !== id && partial(q) && fits([...keysOf(contentsOf(itemAt(id))), ...keysOf(contentsOf(itemAt(q)))])))
    if (pair) return pair
    // Ce qui manque aux bons (du plus ancien au plus récent) : à sa caisse.
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
