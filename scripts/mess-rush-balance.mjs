#!/usr/bin/env node
/**
 * MESS RUSH : équilibrage par simulation. Des équipes de 1 à 4 cuisiniers jouent des services
 * complets avec les vraies règles (shared/mess-rush.js) et le vrai catalogue, à trois niveaux de
 * jeu : débutant, moyen, expert. Les temps de marche viennent du plan de la cuisine (le détour par
 * un passage pour franchir le comptoir), à une vitesse et avec un temps de réaction propres à
 * chaque niveau ; un cuisinier attend la fin de ses cuissons au lieu d'en profiter (un humain fait
 * mieux : c'est une estimation prudente).
 *
 * Usage : node scripts/mess-rush-balance.mjs [services par cas, 40 par défaut] [--recipes=a,b,c] [--pace=1:2:25:1.3,…]
 * Sortie : score, commandes servies et expirées, par nombre de joueurs et par niveau ; et les
 * seuils de médailles qui en découlent (bronze : débutants ; argent : moyens ; or : experts).
 */
import { INGREDIENTS, PROCESSES, RECIPES } from '../shared/mess-rush-catalog.js'
import { RULES, STATIONS, STATION_BY_ID, createService, stepService, useStation, workStation } from '../shared/mess-rush.js'

const RUNS = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 40)
const RECIPE_ARG = process.argv.find((a) => a.startsWith('--recipes='))
const POOL = RECIPE_ARG ? RECIPE_ARG.slice(10).split(',') : Object.keys(RECIPES)
// --pace=1:2:25:1.3,2:3:18:1.15 : essayer un autre rythme (joueurs:commandes max:toutes les s:délais ×).
const PACE_ARG = process.argv.find((a) => a.startsWith('--pace='))
if (PACE_ARG) for (const part of PACE_ARG.slice(7).split(',')) {
  const [n, maxOrders, every, timeScale] = part.split(':').map(Number)
  RULES.byPlayers[n] = { maxOrders, every, timeScale }
}

/** Niveaux de jeu : vitesse de marche (m/s, la course comprise), temps de réaction par action (s). */
const PROFILES = {
  débutant: { speed: 1.6, react: 1.4 },
  moyen: { speed: 2.1, react: 0.8 },
  expert: { speed: 2.8, react: 0.35 },
}

/** Où l'on se tient devant chaque poste. */
function stand(id) {
  const s = STATION_BY_ID[id]
  if (s.kind === 'fountain') return { x: s.x, z: s.z + 0.75 }
  if (s.z > 11) return { x: s.x, z: 11.3 }
  return { x: s.x, z: 10 }
}
const PASSAGES = [{ x: 8.25, z: 9.3 }, { x: 16.75, z: 9.3 }]
const kitchenSide = (p) => p.z > 9.4
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
/** Longueur du trajet : en ligne (un peu de détour), ou par le passage le plus court si l'on franchit le comptoir. */
function walk(a, b) {
  if (kitchenSide(a) === kitchenSide(b)) return d(a, b) * 1.15
  return Math.min(...PASSAGES.map((p) => d(a, p) + d(p, b))) * 1.15
}

const COOK = { marmite: 'pot', poele: 'pan', infuser: 'fountain' }

/**
 * Le plan d'une recette pour un cuisinier : une suite d'actions (aller, prendre/poser, geste,
 * cuisson, attente). Les postes libres sont choisis au moment d'agir.
 */
function* plan(recipeId) {
  const dish = RECIPES[recipeId].dish
  const utensils = new Map()
  const counters = []
  for (const [ing] of dish.contents) {
    const info = INGREDIENTS[ing]
    yield { use: info.source, pick: ing }
    for (const p of info.prep) {
      const st = yield { find: PROCESSES[p].station }
      yield { use: st }
      yield { work: st, wait: PROCESSES[p].duration }
      yield { use: st }
    }
    const cook = info.cook[0]
    if (cook) {
      const kind = COOK[cook]
      if (!utensils.has(kind)) utensils.set(kind, yield { find: kind })
      yield { use: utensils.get(kind) }
    } else {
      const st = yield { find: 'counter' }
      yield { use: st }
      counters.push(st)
    }
  }
  for (const [kind, sid] of utensils) yield { work: sid, cook: PROCESSES[Object.keys(COOK).find((c) => COOK[c] === kind)].duration }
  for (const [, sid] of utensils) yield { await: sid }
  if (dish.container === 'cup') yield { use: utensils.get('fountain') }
  else {
    yield { use: 'plates' }
    for (const sid of counters) yield { use: sid }
    for (const [, sid] of utensils) yield { use: sid }
  }
  yield { use: 'pass' }
}

function simulate(players, profile, seed) {
  const state = createService({ id: 'sim', seed, players, now: 0, recipes: POOL })
  const claimed = new Set()
  const reserved = new Set()
  const cooks = Array.from({ length: players }, (_, i) => ({ pid: `c${i}`, at: stand('assiettes'), busy: 0, gen: null, order: null, next: undefined, station: null }))
  let now = 0
  const kindOf = (k) => ({ fridge: 'frigo', pantry: 'garde-manger', plates: 'assiettes', pass: 'passe' }[k])
  const free = (kind) => STATIONS.find((s) => s.kind === kind && !reserved.has(s.id) && (() => {
    const u = state.stations[s.id]
    return u && !u.item && !u.cook && !u.done && !(u.items?.length)
  })())
  const go = (c, id) => {
    const t = walk(c.at, stand(id)) / profile.speed + profile.react
    c.at = stand(id)
    c.station = id
    return t
  }
  while (state.status === 'running') {
    for (const c of cooks) {
      // Pas avant d'être arrivé au poste, ni avant d'y avoir agi.
      if (now < c.busy || c.pending) continue
      if (!c.gen) {
        const order = state.orders.filter((o) => o.status === 'pending' && !claimed.has(o.id)).sort((a, b) => a.at - b.at)[0]
        if (!order) { c.busy = now + 0.5; continue }
        claimed.add(order.id)
        c.order = order
        c.gen = plan(order.recipe)
        c.next = undefined
        c.reserved = []
      }
      // La commande a expiré en route : on jette ce qu'on tient, et l'on passe à la suivante.
      if (c.order.status !== 'pending') {
        if (state.hands[c.pid]) useStation(state, c.pid, 'recyclage', undefined, now)
        for (const r of c.reserved) reserved.delete(r)
        c.gen = null
        c.busy = now + go(c, 'recyclage')
        continue
      }
      const step = c.gen.next(c.next)
      c.next = undefined
      if (step.done) {
        for (const r of c.reserved) reserved.delete(r)
        c.gen = null
        continue
      }
      const a = step.value
      if (a.find) {
        const s = free(a.find)
        if (!s) { c.busy = now + 0.5; c.gen = rewind(c, a); continue }
        reserved.add(s.id)
        c.reserved.push(s.id)
        c.next = s.id
        continue
      }
      const id = kindOf(a.use ?? a.work ?? a.await) ?? a.use ?? a.work ?? a.await
      if (a.await) {
        const u = state.stations[id]
        c.busy = now + (u.cook && !u.done ? (u.cook.until - now * 1000) / 1000 + 0.1 : 0)
        continue
      }
      const travel = c.station === id ? profile.react : go(c, id)
      c.busy = now + travel
      c.pending = a
      c.target = id
    }
    // Les actions arrivent au poste après le trajet.
    for (const c of cooks) {
      if (!c.pending || now + 1e-9 < c.busy) continue
      const a = c.pending
      c.pending = null
      if (a.use) {
        const r = useStation(state, c.pid, c.target, a.pick, now * 1000)
        if (!r.ok) { c.busy = now + 0.5; c.pending = a; continue }
      } else if (a.work) {
        const r = workStation(state, c.pid, c.target, now * 1000)
        if (!r.ok) { c.busy = now + 0.5; c.pending = a; continue }
        if (a.wait) c.busy = now + a.wait + 0.1
      }
    }
    now += 0.1
    stepService(state, Math.round(now * 1000), 0.1, (pid, sid) => cooks.find((c) => c.pid === pid)?.station === sid)
  }
  return { score: state.score, served: state.served, expired: state.expired }
}

/** Un `find` sans poste libre : on recommencera ce plan au même point (le générateur est déjà avancé). */
function rewind(c, a) {
  const gen = c.gen
  let first = true
  return {
    next(v) {
      if (first) {
        first = false
        return { done: false, value: a }
      }
      return gen.next(v)
    },
  }
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length
const rows = []
for (let players = 1; players <= 4; players++) {
  for (const [name, profile] of Object.entries(PROFILES)) {
    const runs = Array.from({ length: RUNS }, (_, i) => simulate(players, profile, 1000 + i * 7919))
    rows.push({ players, name, score: Math.round(mean(runs.map((r) => r.score))), served: mean(runs.map((r) => r.served)).toFixed(1), expired: mean(runs.map((r) => r.expired)).toFixed(1) })
  }
}
console.log(`Recettes : ${POOL.join(', ')} — ${RUNS} services par cas, ${RULES.service} s\n`)
console.log('joueurs  niveau     score  servies  expirées  médaille actuelle')
for (const r of rows) {
  const [b, s, g] = RULES.medals[r.players]
  const medal = r.score >= g ? 'or' : r.score >= s ? 'argent' : r.score >= b ? 'bronze' : '—'
  console.log(`${String(r.players).padEnd(9)}${r.name.padEnd(11)}${String(r.score).padStart(5)}  ${r.served.padStart(7)}  ${r.expired.padStart(8)}  ${medal}`)
}
const round10 = (v) => Math.max(10, Math.round(v / 10) * 10)
console.log('\nSeuils suggérés [bronze, argent, or] : débutants, moyens, 90 % des experts')
for (let players = 1; players <= 4; players++) {
  const at = (n) => rows.find((r) => r.players === players && r.name === n).score
  console.log(`  ${players} : [${round10(at('débutant'))}, ${round10(at('moyen'))}, ${round10(at('expert') * 0.9)}]`)
}
