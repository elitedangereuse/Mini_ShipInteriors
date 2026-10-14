// MESS RUSH : la cuisine coopérative du mess (de 1 à 4 joueurs), règles communes au relais, qui
// arbitre la partie, et au client, qui la dessine et calcule ses invites (cf. docs/mess-rush.md).
//
// La partie se joue dans une instance : le mess agrandi (10 × 8 tuiles), hors des ponts du
// vaisseau. Des commandes arrivent ; on prend les ingrédients aux distributeurs, on les prépare
// (rincer, couper, fouetter : un geste actif, au poste), on les cuit (marmite, poêle, fontaine :
// une cuisson passive), on dresse l'assiette et on la pose à la passe. Le score est collectif.
//
// Tout l'état d'une partie est un objet JSON (pas de Map, pas de classe) : le relais l'envoie tel
// quel aux joueurs, et le client y relit ce que ferait chaque touche (`resolveAction`, la même
// fonction que l'arbitre). Les fonctions qui le changent sont pures, à l'horloge près (`now`, en
// ms), que l'appelant fournit.

import { DIFFICULTIES, INGREDIENTS, PROCESSES, PROTOTYPE_RECIPES, RECIPES } from './mess-rush-catalog.js'

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
 * de z 5 à 12). Au nord la salle, au milieu le comptoir du self, au sud la cuisine.
 */
export const MESS_LAYOUT = [
  '', '', '', '', '',
  ...Array.from({ length: 8 }, () => `${' '.repeat(8)}${'m'.repeat(10)}`),
]

/** Bords intérieurs de la pièce (faces des murs). */
export const MESS_BOUNDS = { minX: 7.65, maxX: 17.35, minZ: 4.65, maxZ: 12.35 }

/** Où l'on arrive dans la cuisine : l'allée, entre le comptoir et les postes. */
export const MESS_SPAWNS = [
  { x: 11.2, z: 10.6 },
  { x: 12.5, z: 10.6 },
  { x: 13.8, z: 10.6 },
  { x: 15, z: 10.6 },
]

/** Une position est-elle sur le sol de la cuisine ? */
export function onMessFloor(x, z) {
  return x > MESS_BOUNDS.minX && x < MESS_BOUNDS.maxX && z > MESS_BOUNDS.minZ && z < MESS_BOUNDS.maxZ
}

/**
 * Les postes, là où l'on agit (coordonnées de l'instance). `kind` dit ce qu'on y fait :
 * - `fridge`, `pantry` : distributeurs (on y prend un ingrédient) ;
 * - `board` (plan de travail), `sink` (plonge) : une place, et le geste actif du poste ;
 * - `pot` (marmite), `pan` (poêle) : sur les fourneaux, des ingrédients qui cuisent ensemble ;
 * - `fountain` : la fontaine, où l'on infuse le café et le thé, servis en tasse ;
 * - `plates` : la pile d'assiettes propres ;
 * - `counter` : une place sur le comptoir, qu'on atteint des deux côtés ;
 * - `pass` : la passe, où l'on livre ;
 * - `trash` : le recyclage, où l'on jette.
 */
export const STATIONS = [
  { id: 'frigo', kind: 'fridge', x: 8.15, z: 12.075 },
  { id: 'garde-manger', kind: 'pantry', x: 9.25, z: 12.14 },
  { id: 'plan-1', kind: 'board', x: 10.55, z: 12.075 },
  { id: 'marmite-1', kind: 'pot', x: 11.62, z: 12.075 },
  { id: 'poele-1', kind: 'pan', x: 12.28, z: 12.075 },
  { id: 'marmite-2', kind: 'pot', x: 13.07, z: 12.075 },
  { id: 'poele-2', kind: 'pan', x: 13.73, z: 12.075 },
  { id: 'plan-2', kind: 'board', x: 14.8, z: 12.075 },
  { id: 'plonge', kind: 'sink', x: 16.05, z: 12.075 },
  { id: 'recyclage', kind: 'trash', x: 16.98, z: 12.0 },
  { id: 'assiettes', kind: 'plates', x: 9.45, z: 9.3 },
  { id: 'comptoir-1', kind: 'counter', x: 10.4, z: 9.3 },
  { id: 'comptoir-2', kind: 'counter', x: 11.3, z: 9.3 },
  { id: 'comptoir-3', kind: 'counter', x: 13.7, z: 9.3 },
  { id: 'comptoir-4', kind: 'counter', x: 14.6, z: 9.3 },
  { id: 'passe', kind: 'pass', x: 15.55, z: 9.3 },
  { id: 'fontaine', kind: 'fountain', x: 8.3, z: 4.85 },
]

/** Les postes, par identifiant. */
export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]))

/** Noms des postes (invites, bulles). */
export const STATION_NAMES = {
  fridge: { fr: 'Frigo', en: 'Fridge' },
  pantry: { fr: 'Garde-manger', en: 'Pantry' },
  board: { fr: 'Plan de travail', en: 'Prep counter' },
  sink: { fr: 'Plonge', en: 'Sink' },
  pot: { fr: 'Marmite', en: 'Stockpot' },
  pan: { fr: 'Poêle', en: 'Pan' },
  fountain: { fr: 'Fontaine', en: 'Water fountain' },
  plates: { fr: 'Pile d\'assiettes', en: 'Plates' },
  counter: { fr: 'Comptoir', en: 'Counter' },
  pass: { fr: 'Passe', en: 'Pass' },
  trash: { fr: 'Recyclage', en: 'Recycling' },
}

/** Ce que cuit chaque ustensile (cf. PROCESSES dans le catalogue). */
const COOKS = { pot: 'marmite', pan: 'poele', fountain: 'infuser' }

/**
 * Chiffres de la partie (secondes, points), tous des réglages de départ à équilibrer.
 * - salon : salons, joueurs par salon, compte à rebours, arrivée, reconnexion, résultat gardé ;
 * - service : durée, portée d'une action côté relais (celle du client, 1,45, plus le retard de la
 *   dernière position reçue), capacités de l'assiette et des ustensiles ;
 * - commandes : première commande, recettes complexes, rythme selon le nombre de joueurs ;
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
  firstOrder: 3,
  complexAfter: 120,
  byPlayers: {
    1: { maxOrders: 2, every: 30, timeScale: 1.3 },
    2: { maxOrders: 3, every: 24, timeScale: 1.1 },
    3: { maxOrders: 4, every: 20, timeScale: 1 },
    4: { maxOrders: 4, every: 16, timeScale: 1 },
  },
  speedBonus: [[2 / 3, 0.5], [1 / 3, 0.25]],
  combo: { step: 0.1, max: 1.5 },
  expiredPenalty: 0.5,
  medals: {
    1: [100, 180, 260],
    2: [160, 280, 400],
    3: [200, 340, 480],
    4: [240, 400, 560],
  },
}

export const MEDALS = ['none', 'bronze', 'silver', 'gold']

/** Le rythme des commandes pour `players` joueurs (1 à 4). */
export function pace(players, rules = RULES) {
  return rules.byPlayers[Math.min(4, Math.max(1, players))]
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
 * Une nouvelle partie, en service dès `now`. `recipes` : les recettes qui peuvent sortir (la
 * sélection du prototype par défaut).
 * @param {{ id: string, seed: number, players: number, now: number, recipes?: string[], rules?: typeof RULES }} o
 */
export function createService({ id, seed, players, now, recipes = PROTOTYPE_RECIPES, rules = RULES }) {
  const stations = {}
  for (const s of STATIONS) {
    if (s.kind === 'pot' || s.kind === 'pan') stations[s.id] = { items: [], cook: null, done: false }
    else if (s.kind === 'fountain') stations[s.id] = { item: null, cook: null, done: false }
    else if (s.kind === 'board' || s.kind === 'sink' || s.kind === 'counter') stations[s.id] = { item: null }
  }
  return {
    id,
    players: Math.min(4, Math.max(1, players)),
    recipes: [...recipes],
    startedAt: now,
    endsAt: now + rules.service * 1000,
    status: 'running',
    rng: seed >>> 0,
    seq: 0,
    orderSeq: 0,
    nextOrderAt: now + rules.firstOrder * 1000,
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

/** L'ingrédient peut-il cuire dans cet ustensile (`pot`, `pan`, `fountain`) ? */
function canCook(item, kind) {
  return item.kind === 'ingredient' && !item.cooked && nextPrep(item) === null && INGREDIENTS[item.ing].cook.includes(COOKS[kind])
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
  if (!station || state.status !== 'running') return none
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
      let work = null
      const next = slot ? nextPrep(slot) : null
      if (!hand && next && PROCESSES[next].station === station.kind) {
        const other = workerAt(state, stationId)
        work = { kind: 'process', process: next, busy: !!other && other !== String(pid) }
      }
      return { use, work }
    }
    case 'pot':
    case 'pan': {
      const cap = station.kind === 'pot' ? rules.potCapacity : rules.panCapacity
      let use = null
      if (hand && canCook(hand, station.kind) && !s.cook && !s.done && s.items.length < cap) use = { kind: 'fill' }
      else if (hand && hand.kind === 'plate' && s.done && room(hand, s.items.length, rules)) use = { kind: 'serve-utensil' }
      const work = !s.cook && !s.done && s.items.length ? { kind: 'cook', process: COOKS[station.kind] } : null
      return { use, work }
    }
    case 'fountain': {
      let use = null
      if (hand && canCook(hand, 'fountain') && !s.item) use = { kind: 'fill' }
      else if (!hand && s.done && s.item) use = { kind: 'take' }
      const work = s.item && !s.cook && !s.done ? { kind: 'cook', process: 'infuser' } : null
      return { use, work }
    }
    case 'pass': {
      if (!hand || (hand.kind !== 'plate' && hand.kind !== 'cup') || !contentsOf(hand).length) return none
      return { use: { kind: 'deliver', order: matchingOrder(state, hand)?.id ?? null }, work: null }
    }
    case 'trash':
      return { use: hand ? { kind: 'trash' } : null, work: null }
  }
  return none
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
    case 'fill':
      if (STATION_BY_ID[stationId].kind === 'fountain') s.item = hand.id
      else s.items.push(hand.id)
      state.hands[pid] = null
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
      const points = Math.round(base * (1 + speedBonus(remaining, rules)) * comboMultiplier(state.combo, rules))
      order.status = 'served'
      order.done = now
      order.points = points
      state.score += points
      state.served += 1
      delete state.items[hand.id]
      state.hands[pid] = null
      events.push({ kind: 'served', order: order.id, recipe: order.recipe, points, combo: state.combo, by: pid })
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
  s.cook = { start: now, until: now + PROCESSES[work.process].duration * 1000 }
  return { ok: true, events: [{ kind: 'cooking', station: stationId, by: pid }] }
}

/** Le joueur cesse son geste (il s'éloigne, il bouge) : la progression reste sur l'ingrédient. */
export function stopWork(state, pid) {
  delete state.work[pid]
}

/**
 * Un joueur quitte la cuisine (coupure, abandon) : ce qu'il tenait est posé sur la première place
 * libre du comptoir, ou jeté s'il n'y en a pas.
 */
export function dropHeld(state, pid) {
  stopWork(state, pid)
  const id = state.hands[pid]
  delete state.hands[pid]
  if (!id) return []
  const free = STATIONS.find((s) => s.kind === 'counter' && !state.stations[s.id].item)
  if (free) {
    state.stations[free.id].item = id
    return [{ kind: 'dropped', by: pid, station: free.id }]
  }
  delete state.items[id]
  state.wasted += 1
  return [{ kind: 'wasted', by: pid }]
}

function spawnOrder(state, now, rules) {
  const elapsed = (now - state.startedAt) / 1000
  const pool = state.recipes.filter((r) => RECIPES[r].difficulty !== 'complexe' || elapsed >= rules.complexAfter)
  if (!pool.length) return null
  const recipe = pool[Math.floor(random(state) * pool.length)]
  const { time } = recipeValue(recipe)
  state.orderSeq += 1
  const order = { id: `c${state.orderSeq}`, recipe, at: now, until: now + time * pace(state.players, rules).timeScale * 1000, status: 'pending' }
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
  // Les cuissons.
  for (const st of STATIONS) {
    const s = state.stations[st.id]
    if (!s?.cook || s.done || now < s.cook.until) continue
    s.done = true
    const process = COOKS[st.kind]
    if (st.kind === 'fountain') {
      const ing = state.items[s.item]
      delete state.items[s.item]
      s.item = newItem(state, { kind: 'cup', contents: [[ing.ing, PROCESSES[process].result]] })
    } else for (const id of s.items) state.items[id].cooked = process
    events.push({ kind: 'cooked', station: st.id })
  }
  // Les commandes qui expirent.
  for (const o of state.orders) {
    if (o.status !== 'pending' || now < o.until) continue
    o.status = 'expired'
    o.done = now
    const penalty = Math.round(recipeValue(o.recipe).points * rules.expiredPenalty)
    state.score = Math.max(0, state.score - penalty)
    state.combo = 0
    state.expired += 1
    events.push({ kind: 'expired', order: o.id, recipe: o.recipe, penalty })
  }
  // La fin du service : les commandes encore en attente ne comptent ni pour ni contre.
  if (now >= state.endsAt) {
    state.status = 'ended'
    state.endedAt = now
    state.work = {}
    events.push({ kind: 'end' })
    return events
  }
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
