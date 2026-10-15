// MESS RUSH, le catalogue (shared/mess-rush-catalog.js) : tout se tient (ingrédients, postes,
// gestes, recettes, sources, statuts), et chaque recette se cuisine de bout en bout avec les règles
// de la partie (shared/mess-rush.js).
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DIFFICULTIES, INGREDIENTS, PROCESSES, PROTOTYPE_RECIPES, RECIPES, SOURCES } from '../shared/mess-rush-catalog.js'
import { STATIONS, createService } from '../shared/mess-rush.js'
import { cookRecipe, kitchen } from './mess-rush-helpers.js'

const KINDS = new Set(STATIONS.map((s) => s.kind))
const STATUSES = new Set(['canonique', 'adaptation', 'création'])
const filled = (name) => typeof name?.fr === 'string' && name.fr.trim() !== '' && typeof name?.en === 'string' && name.en.trim() !== ''

test('chaque ingrédient a ses noms, sa caisse, ses gestes, sa cuisson, son statut et ses sources', () => {
  for (const [id, ing] of Object.entries(INGREDIENTS)) {
    assert.ok(filled(ing.name), `${id} : nom`)
    assert.ok(filled(ing.short), `${id} : nom court`)
    assert.ok(['ms', 'fs', 'mp', 'fp'].includes(ing.gender), `${id} : genre du nom court`)
    // Chaque ingrédient a sa caisse, et une seule.
    assert.equal(STATIONS.filter((s) => s.kind === 'crate' && s.ing === id).length, 1, `${id} : caisse`)
    assert.ok(typeof ing.model === 'string' && ing.model !== '', `${id} : modèle`)
    for (const p of ing.prep) assert.ok(PROCESSES[p]?.active, `${id} : geste ${p}`)
    for (const c of ing.cook) assert.ok(PROCESSES[c] && !PROCESSES[c].active, `${id} : cuisson ${c}`)
    // Un seul mode de cuisson : le plat dit « cuit », sans dire où.
    assert.ok(ing.cook.length <= 1, `${id} : une seule cuisson`)
    assert.ok(STATUSES.has(ing.status), `${id} : statut`)
    assert.ok(ing.sources.length > 0 && ing.sources.every((s) => SOURCES[s]), `${id} : sources`)
    // Le nom canonique d'Elite n'existe que pour ce qui est attesté.
    if (ing.status === 'canonique') assert.ok(typeof ing.canonical === 'string' && ing.canonical !== '', `${id} : nom canonique`)
    else assert.equal(ing.canonical, null, `${id} : pas de nom canonique inventé`)
  }
})

test('chaque geste et chaque cuisson se font à un poste de la cuisine', () => {
  for (const [id, p] of Object.entries(PROCESSES)) {
    assert.ok(KINDS.has(p.station), `${id} : poste ${p.station}`)
    assert.ok(p.duration > 0, `${id} : durée`)
    assert.ok(filled(p.verb), `${id} : verbe`)
  }
})

test('chaque recette a ses noms, sa difficulté, un plat atteignable, des étapes cohérentes, son statut et ses sources', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    assert.ok(filled(r.name), `${id} : nom`)
    assert.ok(DIFFICULTIES[r.difficulty], `${id} : difficulté`)
    assert.ok(filled(r.success) && filled(r.failure), `${id} : conditions de réussite et d'échec`)
    assert.ok(STATUSES.has(r.status), `${id} : statut`)
    assert.ok(r.sources.length > 0 && r.sources.every((s) => SOURCES[s]), `${id} : sources`)
    assert.equal(r.dish.container, 'plate', `${id} : contenant`)
    assert.match(r.color, /^#[0-9a-f]{6}$/, `${id} : couleur`)
    assert.ok(r.dish.contents.length >= 1 && r.dish.contents.length <= 4, `${id} : contenu`)
    for (const [ing, state] of r.dish.contents) {
      const i = INGREDIENTS[ing]
      assert.ok(i, `${id} : ingrédient ${ing}`)
      // L'état attendu est celui où l'ingrédient finit : cuit s'il cuit, sinon après son dernier geste.
      const final = i.cook.length ? PROCESSES[i.cook[0]].result : i.prep.length ? PROCESSES[i.prep.at(-1)].result : 'brut'
      assert.equal(state, final, `${id} : ${ing} doit être ${final}`)
    }
    // Les étapes : chaque ingrédient sort de sa caisse, chaque geste et cuisson a son poste.
    for (const step of r.steps) {
      assert.ok(KINDS.has(step[0]), `${id} : poste ${step[0]}`)
      if (step[1] && PROCESSES[step[1]]) assert.equal(PROCESSES[step[1]].station, step[0], `${id} : ${step[1]} au bon poste`)
      if (step[1] && INGREDIENTS[step[1]]) assert.equal(step[0], 'crate', `${id} : ${step[1]} sort de sa caisse`)
    }
    for (const [ing] of r.dish.contents) assert.ok(r.steps.some((s) => s[1] === ing), `${id} : étape pour ${ing}`)
    assert.equal(r.steps.at(-1)[0], 'pass', `${id} : on finit à la passe`)
  }
  // Une couleur par plat.
  const colors = Object.values(RECIPES).map((r) => r.color)
  assert.equal(new Set(colors).size, colors.length)
})

test('la sélection du prototype : trois recettes, qui passent par tous les postes de la cuisine', () => {
  assert.deepEqual(PROTOTYPE_RECIPES.sort(), ['bouillon-legumes', 'crevettes-saisies', 'pommes-aerial'])
  const used = new Set(PROTOTYPE_RECIPES.flatMap((id) => RECIPES[id].steps.map((s) => s[0])))
  for (const kind of ['crate', 'board', 'pot', 'pan', 'plates', 'pass']) assert.ok(used.has(kind), kind)
})

test('chaque recette se cuisine de bout en bout, et la commande est servie', () => {
  for (const id of Object.keys(RECIPES)) {
    const k = kitchen(createService({ id: 'g', seed: 7, players: 1, now: 0, recipes: [id] }))
    // Sans imprévu : un plateau renversé sur la passe ferait attendre la livraison.
    k.state.nextEventAt = undefined
    k.waitOrder()
    const order = k.state.orders[0]
    assert.equal(order.recipe, id)
    cookRecipe(k, 'p1', id)
    assert.equal(order.status, 'served', `${id} servie`)
    assert.ok(order.points >= DIFFICULTIES[RECIPES[id].difficulty].points, `${id} : points`)
    assert.equal(k.state.hands.p1, null)
  }
})
