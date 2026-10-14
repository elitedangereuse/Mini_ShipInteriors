// Outils des tests de MESS RUSH (pas un test : `npm test` ne lance que les *.test.js) : une
// cuisine à l'horloge simulée, et un cuisinier qui sait faire n'importe quelle recette du catalogue.
import assert from 'node:assert/strict'
import { INGREDIENTS, PROCESSES, RECIPES } from '../shared/mess-rush-catalog.js'
import { STATIONS, stepService, useStation, workStation } from '../shared/mess-rush.js'

/**
 * Une partie à l'horloge simulée : `advance(s)` la fait avancer par pas de 100 ms ; `near` dit
 * qui est à son poste (tout le monde, par défaut) ; `events` garde tous les évènements.
 */
export function kitchen(state) {
  const k = {
    state,
    now: state.startedAt,
    events: [],
    near: () => true,
    advance(seconds) {
      for (let i = 0; i < Math.round(seconds * 10); i++) {
        k.now += 100
        k.events.push(...stepService(k.state, k.now, 0.1, (pid, sid) => k.near(pid, sid)))
      }
    },
    /** Avance jusqu'à ce qu'une commande attende (au plus `max` secondes). */
    waitOrder(max = 300) {
      const until = k.now + max * 1000
      while (!k.state.orders.some((o) => o.status === 'pending') && k.now < until) k.advance(0.1)
    },
    use(pid, sid, pick) {
      const r = useStation(k.state, pid, sid, pick, k.now)
      if (r.ok) k.events.push(...r.events)
      return r
    },
    work(pid, sid) {
      const r = workStation(k.state, pid, sid, k.now)
      if (r.ok) k.events.push(...r.events)
      return r
    },
  }
  return k
}

/** L'action a réussi (sinon, son code de refus dans le message). */
export function must(r, what = '') {
  assert.ok(r.ok, `${what} refusé : ${r.code}`)
}

/** Le premier poste de ce type qui convient. */
export function first(kind, ok = () => true) {
  const s = STATIONS.find((s) => s.kind === kind && ok(s))
  assert.ok(s, `pas de poste ${kind} libre`)
  return s
}

/**
 * Cuisine une recette de bout en bout, seul, et la livre : chaque ingrédient sort de sa caisse, est
 * coupé, puis attend dans son ustensile (la cuisson part toute seule ; un ustensile par cuisson) ou
 * sur le comptoir ; on dresse l'assiette et on la livre à la passe.
 */
export function cookRecipe(k, pid, recipeId) {
  const dish = RECIPES[recipeId].dish
  const utensils = new Map()
  const counters = []
  const free = (s) => {
    const u = k.state.stations[s.id]
    return !!u && !u.item && !u.cook && !u.done && !u.items?.length
  }
  for (const [ing] of dish.contents) {
    const info = INGREDIENTS[ing]
    must(k.use(pid, STATIONS.find((s) => s.kind === 'crate' && s.ing === ing).id), `prendre ${ing}`)
    for (const p of info.prep) {
      const st = first(PROCESSES[p].station, free)
      must(k.use(pid, st.id), `poser ${ing}`)
      must(k.use(pid, st.id), `${p} ${ing}`)
      k.advance(PROCESSES[p].duration + 0.2)
      must(k.use(pid, st.id), `reprendre ${ing}`)
    }
    const cook = info.cook[0]
    if (cook) {
      // Un ustensile par cuisson : ce qui cuit ensemble cuit de la même façon.
      if (!utensils.has(cook)) utensils.set(cook, first(PROCESSES[cook].station, free).id)
      must(k.use(pid, utensils.get(cook)), `mettre ${ing} à cuire`)
    } else {
      const st = first('counter', free)
      must(k.use(pid, st.id), `poser ${ing} au comptoir`)
      counters.push(st.id)
    }
  }
  // Le temps que tout cuise (la marmite s'allonge d'un peu à chaque ingrédient en plus).
  let longest = 0
  for (const [cook, sid] of utensils) longest = Math.max(longest, (k.state.stations[sid].cook.until - k.now) / 1000, 0)
  k.advance(longest + 0.2)
  must(k.use(pid, 'assiettes'), 'prendre une assiette')
  for (const sid of counters) must(k.use(pid, sid), 'dresser depuis le comptoir')
  for (const [, sid] of utensils) must(k.use(pid, sid), 'servir l\'ustensile')
  must(k.use(pid, 'passe'), 'livrer')
}
