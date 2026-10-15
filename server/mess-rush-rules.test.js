// MESS RUSH, les règles (shared/mess-rush.js) : commandes et délais, la touche unique à chaque poste,
// actions refusées, prises simultanées, livraisons uniques, couper, cuire et brûler, score, combos,
// médailles et fin de service.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PROCESSES } from '../shared/mess-rush-catalog.js'
import {
  MESS_BOUNDS, MESS_LAYOUT, MESS_SPAWNS, QUEUE, RULES, SERVICE_COUNTER, STATIONS, comboMultiplier, createService, dropHeld, medalOf, onMessFloor,
  resolveAction, serviceResult, serviceView, speedBonus, workStation,
} from '../shared/mess-rush.js'
import { ShipMap } from '../shared/ship-map.js'
import { cookRecipe, first, kitchen, must } from './mess-rush-helpers.js'

/** Une partie sans imprévu (cf. mess-rush-events.test.js pour eux). */
const solo = (recipes = ['crevettes-saisies'], players = 1) => {
  const k = kitchen(createService({ id: 'g1', seed: 42, players, now: 0, recipes }))
  k.state.nextEventAt = undefined
  return k
}
const ingredient = (k, id, ing, step = 0) => (k.state.items[id] = { id, kind: 'ingredient', ing, step, progress: 0 })
const pending = (k) => k.state.orders.filter((o) => o.status === 'pending').length

test('la cuisine : une seule pièce, les postes et les arrivées sur son sol', () => {
  const map = new ShipMap(MESS_LAYOUT)
  for (const s of MESS_SPAWNS) {
    assert.ok(onMessFloor(s.x, s.z))
    assert.ok(map.isFloor(Math.round(s.x), Math.round(s.z)))
  }
  // Les postes sont dans la pièce (ceux du comptoir de service, sur lui : on les atteint de la cuisine).
  for (const s of STATIONS) assert.ok(s.x > MESS_BOUNDS.minX && s.x < MESS_BOUNDS.maxX && s.z > MESS_BOUNDS.minZ && s.z < MESS_BOUNDS.maxZ, s.id)
  for (const s of STATIONS) assert.ok(onMessFloor(s.x, s.z) || s.z > SERVICE_COUNTER.minZ || s.x < 8.3, s.id)
  // Personne ne cuisine dans la file des clients.
  assert.ok(!onMessFloor(12, QUEUE.z))
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
  assert.equal(pending(k), 2)
  k.advance(24)
  assert.equal(pending(k), 2)
  // À quatre : cinq au plus, une toutes les 13 s.
  const four = solo(['crevettes-saisies'], 4)
  four.advance(3.1 + 13 * 4)
  assert.equal(pending(four), 5)
  four.advance(13)
  assert.equal(pending(four), 5)
})

test('une commande expirée est retirée et pénalisée, remet le combo à zéro, et le score ne descend pas sous 0', () => {
  const k = solo()
  k.waitOrder()
  const order = k.state.orders[0]
  // Crevettes saisies : 60 s, × 1,4 seul.
  assert.equal(order.until - order.at, 84000)
  k.state.score = 30
  k.state.combo = 3
  k.advance(84)
  assert.equal(order.status, 'expired')
  assert.equal(k.state.score, 20)
  assert.equal(k.state.combo, 0)
  assert.equal(k.state.expired, 1)
  assert.ok(k.events.some((e) => e.kind === 'expired' && e.order === order.id && e.penalty === 10))
  k.state.score = 5
  k.advance(200)
  assert.equal(k.state.score, 0)
})

test('une livraison rapporte la valeur de la recette, le bonus de rapidité et le combo ; l\'assiette ne sert qu\'une fois', () => {
  const k = solo()
  k.waitOrder()
  cookRecipe(k, 'p1', 'crevettes-saisies')
  const order = k.state.orders[0]
  assert.equal(order.status, 'served')
  // Livrée vite : +50 %, premier plat : × 1.
  assert.equal(order.points, 30)
  assert.equal(k.state.score, 30)
  assert.equal(k.state.combo, 1)
  // Plus rien en main : la touche ne fait rien à la passe.
  assert.equal(resolveAction(k.state, 'p1', 'passe'), null)
  assert.deepEqual(k.use('p1', 'passe'), { ok: false, code: 'state' })
  // La suivante, en combo : × 1,1.
  k.waitOrder()
  cookRecipe(k, 'p1', 'crevettes-saisies')
  assert.equal(k.state.orders.find((o) => o.points && o !== order).points, Math.round(20 * 1.5 * 1.1))
  assert.equal(k.state.served, 2)
  assert.equal(k.state.bestCombo, 2)
})

test('une seule touche : ce qu\'elle fait dépend du poste et de ce qu\'on tient', () => {
  const k = solo(['bouillon-legumes', 'pommes-aerial'])
  k.waitOrder()
  const act = (sid) => resolveAction(k.state, 'p1', sid)?.kind ?? null
  // Les mains vides : la caisse donne son ingrédient, la pile une assiette ; rien à faire à la passe ni à la poubelle.
  assert.deepEqual(resolveAction(k.state, 'p1', 'caisse-legumes'), { kind: 'take-ingredient', ing: 'legumes' })
  assert.equal(act('assiettes'), 'take-plate')
  assert.equal(act('passe'), null)
  assert.equal(act('poubelle-se'), null)
  assert.equal(act('plonge'), null)
  // Un légume en main : on le pose (planche, comptoir), on le jette ; ni marmite (pas coupé) ni caisse.
  must(k.use('p1', 'caisse-legumes'))
  assert.equal(act('plan-1'), 'put')
  assert.equal(act('comptoir-1'), 'put')
  assert.equal(act('poubelle-se'), 'trash')
  assert.equal(act('marmite-1'), null)
  assert.equal(act('caisse-pommes'), null)
  assert.equal(act('assiettes'), null)
  // Posé sur la planche : la même touche, les mains vides, coupe ; une fois coupé, elle le reprend.
  must(k.use('p1', 'plan-1'))
  assert.deepEqual(resolveAction(k.state, 'p1', 'plan-1'), { kind: 'work', busy: false })
  must(k.use('p1', 'plan-1'))
  assert.deepEqual(k.state.work.p1, { station: 'plan-1', item: k.state.stations['plan-1'].item })
  k.advance(PROCESSES.couper.duration + 0.1)
  assert.ok(k.events.some((e) => e.kind === 'prepared' && e.process === 'couper' && e.by === 'p1'))
  assert.equal(act('plan-1'), 'take')
  must(k.use('p1', 'plan-1'))
  // Coupé : dans la marmite, et ça cuit tout seul.
  assert.equal(act('marmite-1'), 'fill')
  assert.equal(act('poele-1'), null)
  must(k.use('p1', 'marmite-1'))
  assert.ok(k.state.stations['marmite-1'].cook)
  assert.ok(k.events.some((e) => e.kind === 'cooking' && e.station === 'marmite-1'))
  // `mess:work` (l'ancienne seconde touche) fait la même chose que `mess:use`.
  must(k.use('p1', 'caisse-pommes'))
  must(k.use('p1', 'plan-2'))
  const r = workStation(k.state, 'p1', 'plan-2', k.now)
  assert.equal(r.ok, true)
  assert.equal(k.state.work.p1.station, 'plan-2')
})

test('un plat qui ne correspond à aucune commande est refusé et reste en main', () => {
  const k = solo(['crevettes-saisies', 'pommes-aerial'])
  k.waitOrder()
  k.state.orders[0].recipe = 'crevettes-saisies'
  must(k.use('p1', 'assiettes'))
  must(k.use('p1', 'comptoir-1'))
  must(k.use('p1', 'caisse-pommes'))
  must(k.use('p1', 'plan-1'))
  must(k.use('p1', 'plan-1'))
  k.advance(PROCESSES.couper.duration + 0.1)
  must(k.use('p1', 'plan-1'))
  // La pomme coupée dans l'assiette posée, puis l'assiette en main : ce n'est pas le plat attendu.
  assert.equal(resolveAction(k.state, 'p1', 'comptoir-1').kind, 'plate-add')
  must(k.use('p1', 'comptoir-1'))
  must(k.use('p1', 'comptoir-1'))
  const plate = k.state.items[k.state.hands.p1]
  assert.deepEqual(plate.contents, [['pommes-aerial', 'coupé']])
  assert.deepEqual(resolveAction(k.state, 'p1', 'passe'), { kind: 'deliver', order: null })
  assert.deepEqual(k.use('p1', 'passe'), { ok: false, code: 'nomatch' })
  assert.equal(k.state.hands.p1, plate.id)
  // À la poubelle : l'assiette se vide, on la garde ; c'est du gaspillage.
  must(k.use('p1', 'poubelle-se'))
  assert.deepEqual(plate.contents, [])
  assert.equal(k.state.hands.p1, plate.id)
  assert.equal(k.state.wasted, 1)
})

test('les transitions invalides sont refusées : pas coupé, mauvais ustensile, poêle pleine, mains pleines', () => {
  const k = solo(['ragout-lapin', 'riz-crevettes'])
  k.waitOrder()
  must(k.use('p1', 'caisse-lapin'))
  // Le lapin n'est pas coupé : ni marmite, ni poêle.
  assert.deepEqual(k.use('p1', 'marmite-1'), { ok: false, code: 'state' })
  assert.equal(k.use('p1', 'poele-1').ok, false)
  // Mains pleines : on ne prend rien d'autre ; la plonge ne prend que la vaisselle.
  assert.equal(k.use('p1', 'caisse-legumes').ok, false)
  assert.equal(k.use('p1', 'assiettes').ok, false)
  assert.equal(k.use('p1', 'plonge').ok, false)
  // Coupé : la poêle, toujours pas (le lapin cuit à la marmite).
  k.state.items[k.state.hands.p1].step = 1
  assert.equal(k.use('p1', 'poele-1').ok, false)
  must(k.use('p1', 'marmite-1'))
  // Les crevettes coupées vont à la poêle, une à la fois ; pas à la marmite.
  ingredient(k, 'c1', 'crevettes-baltahsine', 1)
  ingredient(k, 'c2', 'crevettes-baltahsine', 1)
  k.state.hands.p1 = 'c1'
  assert.equal(k.use('p1', 'marmite-2').ok, false)
  must(k.use('p1', 'poele-1'))
  k.state.hands.p1 = 'c2'
  assert.equal(k.use('p1', 'poele-1').ok, false)
  must(k.use('p1', 'poele-2'))
  // Les mains vides devant ce qui cuit : rien (ni reprise, ni vidage) ; une assiette avant la fin : rien non plus.
  assert.equal(resolveAction(k.state, 'p1', 'marmite-1'), null)
  must(k.use('p1', 'assiettes'))
  assert.equal(resolveAction(k.state, 'p1', 'marmite-1'), null)
  assert.equal(resolveAction(k.state, 'p1', 'poele-1'), null)
  // Une assiette ne se pose pas sur une planche.
  assert.equal(k.use('p1', 'plan-1').ok, false)
  // Saisi : l'assiette le prend.
  k.advance(PROCESSES.saisir.duration + 0.1)
  assert.equal(resolveAction(k.state, 'p1', 'poele-1').kind, 'serve')
  must(k.use('p1', 'poele-1'))
  assert.deepEqual(k.state.items[k.state.hands.p1].contents, [['crevettes-baltahsine', 'saisi']])
  assert.deepEqual(k.state.stations['poele-1'], { items: [], cook: null, done: false, burnt: false })
})

test('la cuisson part toute seule, s\'allonge à chaque ajout, finit, puis brûle si on l\'oublie', () => {
  const k = solo(['bouillon-legumes'])
  k.waitOrder()
  const pot = k.state.stations['marmite-1']
  ingredient(k, 'l1', 'legumes', 1)
  ingredient(k, 'l2', 'legumes', 1)
  ingredient(k, 'l3', 'legumes', 1)
  k.state.hands.p1 = 'l1'
  must(k.use('p1', 'marmite-1'))
  const t0 = k.now
  assert.equal(pot.cook.until - t0, PROCESSES.cuire.duration * 1000)
  // Un second légume : 1,5 s de plus.
  k.state.hands.p1 = 'l2'
  must(k.use('p1', 'marmite-1'))
  assert.equal(pot.cook.until - t0, (PROCESSES.cuire.duration + RULES.cook.potExtra) * 1000)
  assert.equal(pot.cook.burnAt - pot.cook.until, RULES.cook.burn.pot * 1000)
  k.advance(PROCESSES.cuire.duration + RULES.cook.potExtra + 0.1)
  assert.equal(pot.done, true)
  assert.ok(k.events.some((e) => e.kind === 'cooked' && e.station === 'marmite-1' && e.process === 'cuire'))
  // Le troisième, dans la marmite déjà cuite : elle se remet à cuire, le temps qu'il cuise aussi.
  k.state.hands.p1 = 'l3'
  must(k.use('p1', 'marmite-1'))
  assert.equal(pot.done, false)
  assert.equal(pot.cook.until - k.now, 2 * RULES.cook.potExtra * 1000)
  k.advance(2 * RULES.cook.potExtra + 0.1)
  assert.equal(pot.done, true)
  // Oubliée : elle brûle ; ce qui est brûlé ne sert plus, la touche vide la marmite.
  k.advance(RULES.cook.burn.pot)
  assert.equal(pot.burnt, true)
  assert.ok(k.events.some((e) => e.kind === 'burnt' && e.station === 'marmite-1'))
  must(k.use('p1', 'assiettes'))
  assert.equal(resolveAction(k.state, 'p1', 'marmite-1'), null)
  must(k.use('p1', 'comptoir-1'))
  assert.deepEqual(resolveAction(k.state, 'p1', 'marmite-1'), { kind: 'empty' })
  must(k.use('p1', 'marmite-1'))
  assert.deepEqual(pot, { items: [], cook: null, done: false, burnt: false })
  assert.equal(k.state.wasted, 3)
  assert.ok(k.events.some((e) => e.kind === 'emptied' && e.station === 'marmite-1' && e.by === 'p1'))
  // La poêle brûle plus vite.
  assert.ok(RULES.cook.burn.pan < RULES.cook.burn.pot)
})

test('deux joueurs prennent le même objet en même temps : un seul l\'a', () => {
  const k = solo(['crevettes-saisies'], 2)
  k.waitOrder()
  must(k.use('p1', 'caisse-crevettes'))
  must(k.use('p1', 'comptoir-1'))
  const id = k.state.stations['comptoir-1'].item
  // Les deux demandes arrivent dans le même pas : le relais les traite l'une après l'autre.
  const a = k.use('p1', 'comptoir-1')
  const b = k.use('p2', 'comptoir-1')
  assert.equal(a.ok, true)
  assert.deepEqual(b, { ok: false, code: 'state' })
  assert.equal(k.state.hands.p1, id)
  assert.equal(k.state.hands.p2 ?? null, null)
})

test('deux joueurs livrent le même plat : la commande n\'est servie qu\'une fois', () => {
  const k = solo(['crevettes-saisies'], 2)
  k.waitOrder()
  cookRecipe(k, 'p1', 'crevettes-saisies')
  assert.equal(k.state.served, 1)
  // Une seconde assiette identique, sans seconde commande en attente : refusée.
  k.state.items.x = { id: 'x', kind: 'plate', contents: [['crevettes-baltahsine', 'saisi']] }
  k.state.hands.p2 = 'x'
  assert.deepEqual(k.use('p2', 'passe'), { ok: false, code: 'nomatch' })
  assert.equal(k.state.served, 1)
})

test('couper avance tant qu\'on reste à la planche, se met en pause loin d\'elle, et un seul joueur à la fois', () => {
  const k = solo(['crevettes-saisies'], 2)
  k.waitOrder()
  must(k.use('p1', 'caisse-crevettes'))
  must(k.use('p1', 'plan-1'))
  must(k.use('p1', 'plan-1'))
  // Un second joueur ne coupe pas en même temps.
  assert.equal(resolveAction(k.state, 'p2', 'plan-1').busy, true)
  assert.deepEqual(k.use('p2', 'plan-1'), { ok: false, code: 'busy' })
  k.advance(1)
  // On s'éloigne : le geste s'arrête, la progression reste.
  k.near = () => false
  k.advance(0.5)
  const item = k.state.items[k.state.stations['plan-1'].item]
  assert.ok(Math.abs(item.progress - 1) < 1e-6)
  assert.equal(k.state.work.p1, undefined)
  k.near = () => true
  // Le second joueur reprend où l'on en était.
  must(k.use('p2', 'plan-1'))
  k.advance(1.4)
  assert.equal(item.step, 0)
  k.advance(0.1)
  assert.equal(item.step, 1)
  assert.ok(k.events.some((e) => e.kind === 'prepared' && e.by === 'p2' && e.process === 'couper'))
})

test('un joueur qui part pose ce qu\'il tenait au comptoir', () => {
  const k = solo()
  k.waitOrder()
  must(k.use('p1', 'caisse-crevettes'))
  const id = k.state.hands.p1
  const at = first('counter').id
  assert.deepEqual(dropHeld(k.state, 'p1'), [{ kind: 'dropped', by: 'p1', station: at }])
  assert.equal(k.state.stations[at].item, id)
  assert.equal(k.state.hands.p1, undefined)
})

test('le service finit à 5:00 : plus d\'action, le résultat et la médaille', () => {
  const k = solo()
  k.waitOrder()
  cookRecipe(k, 'p1', 'crevettes-saisies')
  k.advance(RULES.service)
  assert.equal(k.state.status, 'ended')
  assert.ok(k.events.some((e) => e.kind === 'end'))
  assert.equal(resolveAction(k.state, 'p1', 'caisse-lapin'), null)
  assert.deepEqual(k.use('p1', 'caisse-lapin'), { ok: false, code: 'over' })
  const r = serviceResult(k.state)
  assert.equal(r.game, 'g1')
  assert.equal(r.duration, 300)
  assert.equal(r.served, 1)
  assert.equal(r.medal, 'none')
  assert.equal(r.won, false)
})

test('médailles, combo et rapidité', () => {
  const [bronze, silver, gold] = RULES.medals[1]
  assert.equal(medalOf(bronze - 1, 1), 'none')
  assert.equal(medalOf(bronze, 1), 'bronze')
  assert.equal(medalOf(silver, 1), 'silver')
  assert.equal(medalOf(gold, 1), 'gold')
  assert.equal(medalOf(RULES.medals[4][0] - 1, 4), 'none')
  assert.equal(medalOf(RULES.medals[4][0], 4), 'bronze')
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
  must(k.use('p1', 'caisse-lapin'))
  const view = JSON.parse(JSON.stringify(serviceView(k.state)))
  assert.equal(view.rng, undefined)
  for (const s of STATIONS) for (const pid of ['p1', 'p2']) assert.deepEqual(resolveAction(view, pid, s.id), resolveAction(k.state, pid, s.id), `${s.id} ${pid}`)
  assert.equal(first('pass').id, 'passe')
})
