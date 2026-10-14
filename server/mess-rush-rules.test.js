// MESS RUSH, les règles (shared/mess-rush.js) : commandes et délais, transitions des objets et des
// postes, actions refusées, prises simultanées, livraisons uniques, gestes et cuissons, score,
// combos, médailles et fin de service.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MESS_LAYOUT, MESS_SPAWNS, RULES, STATIONS, comboMultiplier, createService, dropHeld, medalOf, onMessFloor,
  resolveAction, serviceResult, serviceView, speedBonus,
} from '../shared/mess-rush.js'
import { ShipMap } from '../shared/ship-map.js'
import { cookRecipe, first, kitchen, must } from './mess-rush-helpers.js'

const solo = (recipes = ['escargots-irukama'], players = 1) => kitchen(createService({ id: 'g1', seed: 42, players, now: 0, recipes }))

test('la cuisine : une seule pièce, les postes et les arrivées sur son sol', () => {
  const map = new ShipMap(MESS_LAYOUT)
  for (const s of MESS_SPAWNS) {
    assert.ok(onMessFloor(s.x, s.z))
    assert.ok(map.isFloor(Math.round(s.x), Math.round(s.z)))
  }
  for (const s of STATIONS) assert.ok(onMessFloor(s.x, s.z), s.id)
  assert.equal(new Set(STATIONS.map((s) => s.id)).size, STATIONS.length)
})

test('les commandes arrivent au rythme du nombre de joueurs, sans dépasser le plafond', () => {
  const k = solo()
  k.advance(2.9)
  assert.equal(k.state.orders.length, 0)
  k.advance(0.2)
  assert.equal(k.state.orders.length, 1)
  // Seul : deux au plus, une toutes les 25 s.
  k.advance(25)
  assert.equal(k.state.orders.filter((o) => o.status === 'pending').length, 2)
  k.advance(24)
  assert.equal(k.state.orders.filter((o) => o.status === 'pending').length, 2)
  // À quatre : cinq au plus, une toutes les 11 s.
  const four = solo(['escargots-irukama'], 4)
  four.advance(3.1 + 11 * 4)
  assert.equal(four.state.orders.filter((o) => o.status === 'pending').length, 5)
  four.advance(11)
  assert.equal(four.state.orders.filter((o) => o.status === 'pending').length, 5)
})

test('une commande expirée est retirée et pénalisée, remet le combo à zéro, et le score ne descend pas sous 0', () => {
  const k = solo()
  k.waitOrder()
  const order = k.state.orders[0]
  // Escargots : 90 s, × 1,3 seul.
  assert.equal(order.until - order.at, 117000)
  k.state.score = 30
  k.state.combo = 3
  k.advance(117)
  assert.equal(order.status, 'expired')
  assert.equal(k.state.score, 10)
  assert.equal(k.state.combo, 0)
  assert.equal(k.state.expired, 1)
  assert.ok(k.events.some((e) => e.kind === 'expired' && e.order === order.id && e.penalty === 20))
  k.state.score = 5
  k.advance(200)
  assert.equal(k.state.score, 0)
})

test('une livraison rapporte la valeur de la recette, le bonus de rapidité et le combo ; l\'assiette ne sert qu\'une fois', () => {
  const k = solo()
  k.waitOrder()
  cookRecipe(k, 'p1', 'escargots-irukama')
  const order = k.state.orders[0]
  assert.equal(order.status, 'served')
  // Livrée vite : +50 %, premier plat : × 1.
  assert.equal(order.points, 60)
  assert.equal(k.state.score, 60)
  assert.equal(k.state.combo, 1)
  // Plus rien en main : livrer de nouveau n'a pas de sens.
  assert.deepEqual(resolveAction(k.state, 'p1', 'passe'), { use: null, work: null })
  assert.equal(k.use('p1', 'passe').ok, false)
  // La suivante, en combo : × 1,1.
  k.waitOrder()
  cookRecipe(k, 'p1', 'escargots-irukama')
  assert.equal(k.state.orders.find((o) => o.points && o !== order).points, Math.round(40 * 1.5 * 1.1))
  assert.equal(k.state.served, 2)
  assert.equal(k.state.bestCombo, 2)
})

test('un plat qui ne correspond à aucune commande est refusé et reste en main', () => {
  const k = solo(['escargots-irukama', 'ragout-lapin'])
  k.waitOrder()
  k.state.orders[0].recipe = 'escargots-irukama'
  must(k.use('p1', 'assiettes'))
  must(k.use('p1', 'comptoir-1'))
  must(k.use('p1', 'frigo', 'lapin-ceti'))
  // Un lapin cru dans l'assiette : ce n'est pas un plat de la carte.
  must(k.use('p1', 'comptoir-1'))
  must(k.use('p1', 'comptoir-1'))
  const plate = k.state.items[k.state.hands.p1]
  assert.deepEqual(plate.contents, [['lapin-ceti', 'brut']])
  assert.equal(resolveAction(k.state, 'p1', 'passe').use.order, null)
  assert.deepEqual(k.use('p1', 'passe'), { ok: false, code: 'nomatch' })
  assert.equal(k.state.hands.p1, plate.id)
  // Au recyclage : l'assiette se vide, on la garde ; c'est du gaspillage.
  must(k.use('p1', 'recyclage'))
  assert.deepEqual(plate.contents, [])
  assert.equal(k.state.hands.p1, plate.id)
  assert.equal(k.state.wasted, 1)
})

test('les transitions invalides sont refusées : ingrédient pas prêt, mauvais ustensile, ustensile en cuisson, mains pleines', () => {
  const k = solo(['ragout-lapin', 'escargots-irukama'])
  k.waitOrder()
  must(k.use('p1', 'frigo', 'lapin-ceti'))
  // Le lapin n'est pas coupé : ni marmite, ni poêle.
  assert.equal(k.use('p1', 'marmite-1').ok, false)
  assert.equal(k.use('p1', 'poele-1').ok, false)
  // Mains pleines : on ne prend rien d'autre.
  assert.equal(k.use('p1', 'garde-manger', 'legumes').ok, false)
  assert.equal(k.use('p1', 'assiettes').ok, false)
  // Couper à la plonge : non (le lapin se coupe au plan de travail).
  must(k.use('p1', 'plonge'))
  assert.equal(k.work('p1', 'plonge').ok, false)
  must(k.use('p1', 'plonge'))
  must(k.use('p1', 'plan-1'))
  must(k.work('p1', 'plan-1'))
  k.advance(2.6)
  must(k.use('p1', 'plan-1'))
  // Coupé : la marmite, oui ; la poêle, toujours pas (le lapin mijote).
  assert.equal(k.use('p1', 'poele-1').ok, false)
  must(k.use('p1', 'marmite-1'))
  must(k.work('p1', 'marmite-1'))
  // En cuisson : on n'y ajoute rien, on ne relance pas (Espace la viderait).
  must(k.use('p1', 'garde-manger', 'legumes'))
  must(k.use('p1', 'plan-1'))
  must(k.work('p1', 'plan-1'))
  k.advance(2.6)
  must(k.use('p1', 'plan-1'))
  assert.equal(k.use('p1', 'marmite-1').ok, false)
  assert.equal(resolveAction(k.state, 'p1', 'marmite-1').work.kind, 'empty')
  // Cuit : sans assiette, on ne sert pas.
  k.advance(8)
  must(k.use('p1', 'marmite-2'))
  assert.equal(k.use('p1', 'marmite-1').ok, false)
})

test('deux joueurs prennent le même objet en même temps : un seul l\'a', () => {
  const k = solo(['escargots-irukama'], 2)
  k.waitOrder()
  must(k.use('p1', 'frigo', 'escargots-irukama'))
  must(k.use('p1', 'comptoir-2'))
  const id = k.state.stations['comptoir-2'].item
  // Les deux demandes arrivent dans le même pas : le relais les traite l'une après l'autre.
  const a = k.use('p1', 'comptoir-2')
  const b = k.use('p2', 'comptoir-2')
  assert.equal(a.ok, true)
  assert.deepEqual(b, { ok: false, code: 'state' })
  assert.equal(k.state.hands.p1, id)
  assert.equal(k.state.hands.p2 ?? null, null)
})

test('deux joueurs livrent le même plat : la commande n\'est servie qu\'une fois', () => {
  const k = solo(['escargots-irukama'], 2)
  k.waitOrder()
  cookRecipe(k, 'p1', 'escargots-irukama')
  assert.equal(k.state.served, 1)
  // Une seconde assiette identique, sans seconde commande en attente : refusée.
  k.state.items.x = { id: 'x', kind: 'plate', contents: [['escargots-irukama', 'cuit']] }
  k.state.hands.p2 = 'x'
  assert.deepEqual(k.use('p2', 'passe'), { ok: false, code: 'nomatch' })
  assert.equal(k.state.served, 1)
})

test('un geste avance tant qu\'on reste au poste, se met en pause loin du poste, et un seul joueur à la fois', () => {
  const k = solo(['escargots-irukama'], 2)
  k.waitOrder()
  must(k.use('p1', 'frigo', 'escargots-irukama'))
  must(k.use('p1', 'plonge'))
  must(k.work('p1', 'plonge'))
  // Un second joueur ne rince pas en même temps.
  assert.equal(resolveAction(k.state, 'p2', 'plonge').work.busy, true)
  assert.deepEqual(k.work('p2', 'plonge'), { ok: false, code: 'busy' })
  k.advance(1)
  // On s'éloigne : le geste s'arrête, la progression reste.
  k.near = () => false
  k.advance(0.5)
  const item = k.state.items[k.state.stations.plonge.item]
  assert.ok(Math.abs(item.progress - 1) < 1e-6)
  assert.equal(k.state.work.p1, undefined)
  k.near = () => true
  // Le second joueur reprend où l'on en était.
  must(k.work('p2', 'plonge'))
  k.advance(0.9)
  assert.equal(item.step, 0)
  k.advance(0.1)
  assert.equal(item.step, 1)
  assert.ok(k.events.some((e) => e.kind === 'prepared' && e.by === 'p2' && e.process === 'rincer'))
})

test('la fontaine infuse le café en tasse ; la tasse se livre telle quelle', () => {
  const k = solo(['cafe-goman'])
  k.waitOrder()
  must(k.use('p1', 'garde-manger', 'cafe-goman'))
  must(k.use('p1', 'fontaine'))
  // Pas encore lancée : on reprend le café, on le remet.
  must(k.use('p1', 'fontaine'))
  assert.equal(k.state.items[k.state.hands.p1].ing, 'cafe-goman')
  must(k.use('p1', 'fontaine'))
  must(k.work('p1', 'fontaine'))
  assert.equal(k.use('p1', 'fontaine').ok, false)
  k.advance(4.1)
  must(k.use('p1', 'fontaine'))
  const cup = k.state.items[k.state.hands.p1]
  assert.equal(cup.kind, 'cup')
  must(k.use('p1', 'passe'))
  assert.equal(k.state.served, 1)
})

test('le distributeur propose d\'abord les ingrédients des commandes en attente', () => {
  const k = solo(['escargots-irukama', 'ragout-lapin'])
  k.waitOrder()
  k.state.orders[0].recipe = 'ragout-lapin'
  assert.deepEqual(resolveAction(k.state, 'p1', 'frigo').use, { kind: 'take-ingredient', ing: 'lapin-ceti' })
  assert.deepEqual(resolveAction(k.state, 'p1', 'frigo', 'escargots-irukama').use, { kind: 'take-ingredient', ing: 'escargots-irukama' })
  // Un choix qui n'est pas dans ce distributeur : le premier.
  assert.equal(resolveAction(k.state, 'p1', 'frigo', 'legumes').use.ing, 'lapin-ceti')
  assert.equal(resolveAction(k.state, 'p1', 'frigo').work.kind, 'cycle')
})

test('un joueur qui part pose ce qu\'il tenait au comptoir', () => {
  const k = solo()
  k.waitOrder()
  must(k.use('p1', 'frigo', 'escargots-irukama'))
  const id = k.state.hands.p1
  assert.deepEqual(dropHeld(k.state, 'p1'), [{ kind: 'dropped', by: 'p1', station: 'comptoir-1' }])
  assert.equal(k.state.stations['comptoir-1'].item, id)
  assert.equal(k.state.hands.p1, undefined)
})

test('le service finit à 5:00 : plus d\'action, le résultat et la médaille', () => {
  const k = solo()
  k.waitOrder()
  cookRecipe(k, 'p1', 'escargots-irukama')
  k.advance(RULES.service)
  assert.equal(k.state.status, 'ended')
  assert.ok(k.events.some((e) => e.kind === 'end'))
  assert.deepEqual(resolveAction(k.state, 'p1', 'frigo'), { use: null, work: null })
  assert.deepEqual(k.use('p1', 'frigo'), { ok: false, code: 'over' })
  const r = serviceResult(k.state)
  assert.equal(r.game, 'g1')
  assert.equal(r.duration, 300)
  assert.equal(r.served, 1)
  assert.equal(r.medal, 'none')
  assert.equal(r.won, false)
  // Les commandes restées en attente ne coûtent rien de plus que leurs expirations.
  assert.ok(k.state.orders.every((o) => o.status !== 'pending' || o.until > k.now - 1000 * RULES.service))
})

test('médailles, combo et rapidité', () => {
  assert.equal(medalOf(229, 1), 'none')
  assert.equal(medalOf(230, 1), 'bronze')
  assert.equal(medalOf(390, 1), 'silver')
  assert.equal(medalOf(490, 1), 'gold')
  assert.equal(medalOf(449, 4), 'none')
  assert.equal(medalOf(450, 4), 'bronze')
  // Plus on est nombreux, plus chaque médaille demande de points.
  for (let n = 1; n < 4; n++) for (let m = 0; m < 3; m++) assert.ok(RULES.medals[n][m] <= RULES.medals[n + 1][m])
  assert.equal(medalOf(9999, 9), 'gold')
  assert.equal(comboMultiplier(1), 1)
  assert.equal(comboMultiplier(3), 1.2)
  assert.equal(comboMultiplier(20), 1.5)
  assert.equal(speedBonus(0.9), 0.5)
  assert.equal(speedBonus(0.5), 0.25)
  assert.equal(speedBonus(0.1), 0)
})

test('ce que reçoivent les joueurs suffit pour calculer les mêmes invites, sans la graine', () => {
  const k = solo(['ragout-lapin'])
  k.waitOrder()
  must(k.use('p1', 'frigo', 'lapin-ceti'))
  const view = JSON.parse(JSON.stringify(serviceView(k.state)))
  assert.equal(view.rng, undefined)
  for (const s of STATIONS) for (const pid of ['p1', 'p2']) assert.deepEqual(resolveAction(view, pid, s.id), resolveAction(k.state, pid, s.id), `${s.id} ${pid}`)
  assert.equal(first('pass').id, 'passe')
})
