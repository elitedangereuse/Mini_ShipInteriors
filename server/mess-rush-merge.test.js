// MESS RUSH 1.3 (shared/mess-rush.js) : réunir deux assiettes, le fil rouge de ce qu'on tient, le
// four et les nouvelles cuissons, et, à deux, des rôles variés où chacun prend, prépare, cuit, dresse
// et livre.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PROCESSES, RECIPES } from '../shared/mess-rush-catalog.js'
import { RULES, STATION_BY_ID, createService, guide, resolveAction, threadOf } from '../shared/mess-rush.js'
import { kitchen, must } from './mess-rush-helpers.js'

const service = (players, recipes, seed = 7) => {
  const members = ['a', 'b', 'c', 'd'].slice(0, players)
  return kitchen(createService({ id: 'g', seed, players, now: 0, members, ...(recipes ? { recipes } : {}) }))
}
const plate = (k, id, contents) => (k.state.items[id] = { id, kind: 'plate', contents })

test('deux assiettes se réunissent : le riz d\'un côté, les crevettes de l\'autre, et le plat est complet', () => {
  const k = service(1, ['riz-crevettes'])
  k.waitOrder()
  plate(k, 'p1', [['riz-jaroua', 'cuit']])
  k.state.stations['comptoir-1'].item = 'p1'
  plate(k, 'p2', [['crevettes-baltahsine', 'saisi']])
  k.state.hands.a = 'p2'
  assert.equal(resolveAction(k.state, 'a', 'comptoir-1').use.kind, 'merge')
  must(k.use('a', 'comptoir-1'))
  assert.equal(k.state.hands.a, null)
  assert.equal(k.state.items.p2, undefined)
  assert.deepEqual(k.state.items.p1.contents, [['riz-jaroua', 'cuit'], ['crevettes-baltahsine', 'saisi']])
  assert.ok(k.events.some((e) => e.kind === 'merged' && e.station === 'comptoir-1' && e.by === 'a'))
  // Le plat complet : à la passe.
  must(k.use('a', 'comptoir-1'))
  must(k.use('a', 'passe-1'))
  assert.equal(k.state.served, 1)
})

test('on ne réunit ni deux assiettes vides, ni au-delà de ce que tient une assiette', () => {
  const k = service(1, ['riz-crevettes'])
  k.waitOrder()
  plate(k, 'p1', [])
  k.state.stations['comptoir-1'].item = 'p1'
  plate(k, 'p2', [])
  k.state.hands.a = 'p2'
  assert.equal(resolveAction(k.state, 'a', 'comptoir-1').use, null)
  k.state.items.p1.contents = [['riz-jaroua', 'cuit'], ['riz-jaroua', 'cuit'], ['riz-jaroua', 'cuit']]
  k.state.items.p2.contents = [['crevettes-baltahsine', 'saisi'], ['crevettes-baltahsine', 'saisi']]
  assert.ok(3 + 2 > RULES.plateCapacity)
  assert.equal(resolveAction(k.state, 'a', 'comptoir-1').use, null)
})

test('le guidage fait réunir deux assiettes entamées qui font un plat', () => {
  const k = service(1, ['riz-crevettes'])
  k.waitOrder()
  plate(k, 'p1', [['riz-jaroua', 'cuit']])
  plate(k, 'p2', [['crevettes-baltahsine', 'saisi']])
  k.state.stations['comptoir-1'].item = 'p1'
  k.state.stations['comptoir-2'].item = 'p2'
  const take = guide(k.state, 'a')
  assert.equal(take.step, 'take-merge')
  must(k.use('a', take.stations[0]))
  const merge = guide(k.state, 'a')
  assert.equal(merge.step, 'merge')
  must(k.use('a', merge.stations[0]))
  assert.equal(guide(k.state, 'a').step, 'take-dish')
})

test('le fil rouge : pour quel bon, et le chemin qui reste, d\'un ingrédient ou d\'une assiette', () => {
  const k = service(1, ['riz-crevettes'])
  k.waitOrder()
  const order = k.state.orders[0]
  must(k.use('a', 'frigo', 'crevettes-baltahsine'))
  const shrimp = k.state.items[k.state.hands.a]
  let t = threadOf(k.state, shrimp)
  assert.deepEqual(t.order, { id: order.id, recipe: 'riz-crevettes' })
  assert.deepEqual(t.steps.map((s) => [s.kind, s.process ?? '', s.done]), [
    ['fridge', '', true], ['sink', 'rincer', false], ['pan', 'saisir', false], ['plates', '', false], ['pass', '', false],
  ])
  must(k.use('a', 'plonge'))
  must(k.work('a', 'plonge'))
  k.advance(PROCESSES.rincer.duration + 0.2)
  must(k.use('a', 'plonge'))
  t = threadOf(k.state, shrimp)
  assert.deepEqual(t.steps.map((s) => s.done), [true, true, false, false, false])
  // Une assiette entamée : ce qui y est, ce qui manque.
  plate(k, 'p1', [['riz-jaroua', 'cuit']])
  t = threadOf(k.state, k.state.items.p1)
  assert.equal(t.order.recipe, 'riz-crevettes')
  assert.deepEqual(t.steps.map((s) => [s.ing ?? 'passe', s.done]), [['riz-jaroua', true], ['crevettes-baltahsine', false], ['passe', false]])
  // Ce qui ne sert à aucun bon n'a pas de fil rouge.
  plate(k, 'p2', [['legumes', 'mijoté']])
  assert.equal(threadOf(k.state, k.state.items.p2), null)
  assert.equal(threadOf(k.state, k.state.items.x ?? null), null)
})

test('le four dore le Ma Corn et les gâteaux, deux à la fois ; la marmite cuit ou mijote, jamais les deux ensemble', () => {
  const k = service(1, ['ma-corn-diso', 'gateaux-wheemete'])
  k.waitOrder()
  must(k.use('a', 'garde-manger', 'ma-corn-diso'))
  // Pas dans une poêle : le Ma Corn passe au four.
  assert.equal(k.use('a', 'poele-1').ok, false)
  must(k.use('a', 'four'))
  must(k.use('a', 'garde-manger', 'gateaux-wheemete'))
  must(k.use('a', 'four'))
  must(k.use('a', 'garde-manger', 'ma-corn-diso'))
  assert.equal(k.use('a', 'four').ok, false, `pas plus de ${RULES.ovenCapacity}`)
  must(k.use('a', 'poubelle-so'))
  assert.equal(resolveAction(k.state, 'a', 'four').work.process, 'enfourner')
  must(k.work('a', 'four'))
  k.advance(PROCESSES.enfourner.duration + 0.2)
  assert.ok(k.state.stations.four.done)
  must(k.use('a', 'assiettes'))
  must(k.use('a', 'four'))
  assert.deepEqual(k.state.items[k.state.hands.a].contents, [['ma-corn-diso', 'doré'], ['gateaux-wheemete', 'doré']])
})

test('à deux, chacun prend, prépare, cuit, dresse et livre : plus de coin qui ne fait que fournir', () => {
  const kinds = { a: new Set(), b: new Set() }
  const share = { a: 0, b: 0 }
  let merged = 0
  for (const seed of [1, 2, 3]) {
    const k = service(2, undefined, seed)
    while (k.state.status === 'running') {
      k.advance(1)
      for (const pid of ['a', 'b']) {
        if (k.state.work[pid]) { share[pid]++; continue }
        const g = guide(k.state, pid)
        if (!g?.stations.length) continue
        const r = ['work', 'start', 'clean'].includes(g.step) ? k.work(pid, g.stations[0]) : k.use(pid, g.stations[0], g.ing)
        if (r.ok) {
          share[pid]++
          kinds[pid].add(STATION_BY_ID[g.stations[0]].kind)
        }
      }
    }
    merged += k.events.filter((e) => e.kind === 'merged').length
    assert.ok(k.state.served >= 15, `graine ${seed} : ${k.state.served} plats`)
  }
  for (const pid of ['a', 'b']) {
    const did = kinds[pid]
    // Un distributeur, un geste au poste, une cuisson, des assiettes, la passe.
    assert.ok((did.has('fridge') || did.has('pantry')) && (did.has('board') || did.has('sink')), `${pid} : ${[...did]}`)
    assert.ok(['pot', 'pan', 'oven'].some((c) => did.has(c)) && did.has('plates') && did.has('pass'), `${pid} : ${[...did]}`)
    const part = share[pid] / (share.a + share.b)
    assert.ok(part > 0.4 && part < 0.6, `${pid} : ${Math.round(part * 100)} %`)
  }
  // Les plats qui mêlent le frigo et le garde-manger se finissent en réunissant des assiettes.
  assert.ok(merged > 0)
})

test('chaque plat a sa couleur, et deux plats n\'ont jamais la même', () => {
  const colors = Object.values(RECIPES).map((r) => r.color)
  assert.ok(colors.every((c) => /^#[0-9a-f]{6}$/i.test(c)))
  assert.equal(new Set(colors.map((c) => c.toLowerCase())).size, colors.length)
})
