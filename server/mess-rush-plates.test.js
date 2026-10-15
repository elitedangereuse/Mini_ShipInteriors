// MESS RUSH 2.0, les assiettes (shared/mess-rush.js) : réunir deux assiettes, une pile limitée, la
// vaisselle sale qui revient après chaque plat servi, et la plonge où on la lave.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RULES, createService, guide, resolveAction } from '../shared/mess-rush.js'
import { cookRecipe, kitchen, must } from './mess-rush-helpers.js'

/** Une partie sans imprévu. */
const service = (players, recipes) => {
  const members = ['a', 'b', 'c', 'd'].slice(0, players)
  const k = kitchen(createService({ id: 'g', seed: 7, players, now: 0, members, ...(recipes ? { recipes } : {}) }))
  k.state.nextEventAt = undefined
  return k
}
const plate = (k, id, contents) => (k.state.items[id] = { id, kind: 'plate', contents })

test('deux assiettes se réunissent : le riz d\'un côté, les crevettes de l\'autre, et le plat est complet', () => {
  const k = service(1, ['riz-crevettes'])
  k.waitOrder()
  plate(k, 'p1', [['riz-jaroua', 'cuit']])
  k.state.stations['comptoir-1'].item = 'p1'
  plate(k, 'p2', [['crevettes-baltahsine', 'saisi']])
  k.state.hands.a = 'p2'
  assert.equal(resolveAction(k.state, 'a', 'comptoir-1').kind, 'merge')
  must(k.use('a', 'comptoir-1'))
  // On garde son assiette, vide ; le plat est sur le comptoir.
  assert.equal(k.state.hands.a, 'p2')
  assert.deepEqual(k.state.items.p2.contents, [])
  assert.deepEqual(k.state.items.p1.contents, [['riz-jaroua', 'cuit'], ['crevettes-baltahsine', 'saisi']])
  assert.ok(k.events.some((e) => e.kind === 'merged' && e.station === 'comptoir-1' && e.by === 'a'))
  // L'assiette vide posée, le plat complet : à la passe.
  must(k.use('a', 'comptoir-n'))
  must(k.use('a', 'comptoir-1'))
  must(k.use('a', 'passe'))
  assert.equal(k.state.served, 1)
})

test('on ne réunit ni deux assiettes vides, ni au-delà de ce que tient une assiette', () => {
  const k = service(1, ['riz-crevettes'])
  k.waitOrder()
  plate(k, 'p1', [])
  k.state.stations['comptoir-1'].item = 'p1'
  plate(k, 'p2', [])
  k.state.hands.a = 'p2'
  assert.equal(resolveAction(k.state, 'a', 'comptoir-1'), null)
  k.state.items.p1.contents = [['riz-jaroua', 'cuit'], ['riz-jaroua', 'cuit'], ['riz-jaroua', 'cuit']]
  k.state.items.p2.contents = [['crevettes-baltahsine', 'saisi'], ['crevettes-baltahsine', 'saisi']]
  assert.ok(3 + 2 > RULES.plateCapacity)
  assert.equal(resolveAction(k.state, 'a', 'comptoir-1'), null)
})

test('le guidage fait réunir deux assiettes entamées qui font un plat', () => {
  const k = service(1, ['riz-crevettes'])
  k.waitOrder()
  plate(k, 'p1', [['riz-jaroua', 'cuit']])
  plate(k, 'p2', [['crevettes-baltahsine', 'saisi']])
  k.state.stations['comptoir-1'].item = 'p1'
  k.state.stations['comptoir-n'].item = 'p2'
  const take = guide(k.state, 'a')
  assert.equal(take.step, 'take-merge')
  must(k.use('a', take.stations[0]))
  const merge = guide(k.state, 'a')
  assert.equal(merge.step, 'merge')
  must(k.use('a', merge.stations[0]))
  // L'assiette vide en main : on la pose, puis le plat complet part à la passe.
  assert.equal(guide(k.state, 'a').step, 'wait')
  must(k.use('a', guide(k.state, 'a').stations[0]))
  assert.equal(guide(k.state, 'a').step, 'take-dish')
})

test('la vaisselle : la pile est limitée, l\'assiette servie revient sale, on la lave à la plonge', () => {
  const k = service(1, ['pommes-aerial'])
  k.waitOrder()
  const rack = k.state.stations.assiettes
  const back = k.state.stations.retour
  const sink = k.state.stations.plonge
  assert.equal(rack.count, RULES.plates[1])
  cookRecipe(k, 'a', 'pommes-aerial')
  assert.equal(rack.count, RULES.plates[1] - 1)
  // Elle revient au retour de vaisselle un peu plus tard.
  k.advance(RULES.plateReturn - 0.2)
  assert.equal(back.count, 0)
  k.advance(0.3)
  assert.equal(back.count, 1)
  assert.ok(k.events.some((e) => e.kind === 'dirty' && e.count === 1))
  // Plus d'assiette propre : la pile ne donne plus rien.
  rack.count = 0
  assert.equal(resolveAction(k.state, 'a', 'assiettes'), null)
  // Une seconde sale revient : on prend tout le retour d'un coup, et ce qui revient ensuite s'empile dans les mains.
  back.count = 2
  must(k.use('a', 'retour'))
  back.count = 1
  assert.equal(resolveAction(k.state, 'a', 'retour').kind, 'take-dirty')
  must(k.use('a', 'retour'))
  const pile = k.state.items[k.state.hands.a]
  assert.deepEqual([pile.kind, pile.count], ['dirty', 3])
  // Posée sur un comptoir, une autre pile s'y ajoute.
  must(k.use('a', 'comptoir-1'))
  k.state.items.d2 = { id: 'd2', kind: 'dirty', count: 1 }
  k.state.hands.a = 'd2'
  assert.equal(resolveAction(k.state, 'a', 'comptoir-1').kind, 'stack')
  must(k.use('a', 'comptoir-1'))
  assert.equal(pile.count, 4)
  // À la plonge : on la dépose, puis la touche, les mains vides, lave une assiette après l'autre.
  must(k.use('a', 'comptoir-1'))
  assert.equal(resolveAction(k.state, 'a', 'plonge').kind, 'put-dirty')
  must(k.use('a', 'plonge'))
  assert.equal(sink.count, 4)
  assert.equal(k.state.hands.a, null)
  assert.deepEqual(resolveAction(k.state, 'a', 'plonge'), { kind: 'wash', busy: false })
  must(k.use('a', 'plonge'))
  k.advance(RULES.wash + 0.05)
  assert.equal(rack.count, 1)
  assert.equal(sink.count, 3)
  assert.ok(k.events.some((e) => e.kind === 'washed' && e.by === 'a'))
  // S'éloigner arrête la plonge ; rester la vide.
  k.near = () => false
  k.advance(0.5)
  assert.equal(k.state.work.a, undefined)
  k.near = () => true
  must(k.use('a', 'plonge'))
  k.advance(3 * RULES.wash + 0.1)
  assert.equal(rack.count, 4)
  assert.equal(sink.count, 0)
  assert.equal(k.state.work.a, undefined)
})
