// MESS RUSH, la cuisine ouverte et les robots du guidage (shared/mess-rush.js) : le plan (des
// comptoirs tout autour, les caisses au mur ouest, loin du comptoir de service), chacun atteint tout,
// la carte de chaque effectif, ce qui disparaît quand un bon expire, et le guidage qui mène les robots
// des essais (le jeu, lui, ne montre rien : c'est aux joueurs de s'organiser).
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INGREDIENTS, PROCESSES, RECIPES, SERVICE_RECIPES } from '../shared/mess-rush-catalog.js'
import {
  MESS_BOUNDS, MESS_SPAWNS, RULES, SERVICE_COUNTER, STATIONS, STATION_BY_ID, createService, guide, menuFor, onMessFloor, resolveAction,
} from '../shared/mess-rush.js'
import { kitchen, must } from './mess-rush-helpers.js'

/** Une partie sans imprévu ni visiteur de marque (cf. mess-rush-events.test.js pour eux). */
const service = (players, recipes) => {
  const k = kitchen(createService({ id: 'g', seed: 7, players, now: 0, ...(recipes ? { recipes } : {}) }))
  k.state.eventPlan = []
  k.state.guests = []
  return k
}

test('la cuisine ouverte : des arrivées sur le sol, chaque sorte de poste, une caisse par ingrédient, les poubelles dans les coins', () => {
  for (const s of MESS_SPAWNS) assert.ok(onMessFloor(s.x, s.z), `${s.x},${s.z}`)
  // Au milieu, rien : le sol entre les comptoirs reste libre (aucun poste à moins d'un mètre des arrivées).
  for (const p of MESS_SPAWNS) for (const s of STATIONS) assert.ok(Math.hypot(s.x - p.x, s.z - p.z) > 1, `${s.id} trop près de l'arrivée`)
  for (const kind of ['crate', 'board', 'pot', 'pan', 'sink', 'plates', 'return', 'counter', 'pass', 'trash']) {
    assert.ok(STATIONS.some((s) => s.kind === kind), kind)
  }
  for (const ing of Object.keys(INGREDIENTS)) assert.equal(STATIONS.filter((s) => s.ing === ing).length, 1, `caisse ${ing}`)
  for (const s of STATIONS.filter((s) => s.kind === 'trash')) {
    assert.ok(Math.min(s.x - MESS_BOUNDS.minX, MESS_BOUNDS.maxX - s.x) < 0.5, `${s.id} dans un coin`)
  }
  // Tous les postes sont contre un mur ou au comptoir du nord : des comptoirs tout autour.
  for (const s of STATIONS) {
    const wall = Math.min(s.x - MESS_BOUNDS.minX, MESS_BOUNDS.maxX - s.x, MESS_BOUNDS.maxZ - s.z, s.z - SERVICE_COUNTER.minZ)
    assert.ok(wall < 0.75, `${s.id} au milieu de la pièce`)
  }
})

test('les caisses sont au mur ouest, près des planches, loin du comptoir de service', () => {
  const crates = STATIONS.filter((s) => s.kind === 'crate')
  for (const c of crates) {
    assert.ok(c.x < 8.3, `${c.id} au mur ouest`)
    assert.ok(c.z > SERVICE_COUNTER.maxZ + 0.2, `${c.id} pas au comptoir de service`)
  }
  // La planche la plus proche est à quelques pas de chaque caisse.
  const boards = STATIONS.filter((s) => s.kind === 'board')
  for (const c of crates) assert.ok(Math.min(...boards.map((b) => Math.hypot(b.x - c.x, b.z - c.z))) < 2.4, c.id)
  // Le comptoir de service porte la passe et le retour de vaisselle, aucune caisse.
  const north = STATIONS.filter((s) => s.z < SERVICE_COUNTER.maxZ && s.x > SERVICE_COUNTER.minX)
  assert.ok(north.some((s) => s.kind === 'pass') && north.some((s) => s.kind === 'return'))
  assert.ok(!north.some((s) => s.kind === 'crate'))
})

test('à plusieurs, la cuisine est ouverte : chacun atteint tous les postes et choisit ce qu\'il fait', () => {
  const k = service(4)
  k.waitOrder()
  for (const pid of ['a', 'b', 'c', 'd']) {
    for (const s of STATIONS.filter((s) => s.kind === 'crate')) assert.deepEqual(resolveAction(k.state, pid, s.id), { kind: 'take-ingredient', ing: s.ing })
  }
  assert.equal(k.state.zones, undefined)
  assert.equal(k.state.open, undefined)
  // Ce que l'un pose, n'importe qui le reprend.
  must(k.use('a', 'caisse-lapin'))
  must(k.use('a', 'comptoir-n3'))
  must(k.use('d', 'comptoir-n3'))
  assert.ok(k.state.hands.d)
})

test('la carte suit le nombre de joueurs', () => {
  // Les clients du mess commandent les plats à deux ingrédients, à tous les effectifs.
  for (const n of [1, 2, 3, 4]) assert.deepEqual(menuFor(n), SERVICE_RECIPES)
  assert.ok(!menuFor(1).includes('festin-du-bord'))
  assert.deepEqual(service(1).state.recipes, menuFor(1))
  // Une liste imposée (serveur de dev) reste telle quelle.
  assert.deepEqual(service(1, ['festin-du-bord']).state.recipes, ['festin-du-bord'])
})

test('un bon expire : ce qu\'on lui préparait disparaît, sauf ce qu\'un autre bon attend', () => {
  const k = service(1, ['ragout-lapin'])
  k.waitOrder()
  const ragout = k.state.orders[0]
  // Un second bon, qui veut du riz aux crevettes.
  k.state.orders.push({ id: 'c9', recipe: 'riz-crevettes', at: k.now, until: k.now + 600000, status: 'pending' })
  Object.assign(k.state.items, {
    x1: { id: 'x1', kind: 'ingredient', ing: 'lapin-ceti', step: 1, progress: 0 },
    x2: { id: 'x2', kind: 'ingredient', ing: 'legumes', step: 0, progress: 1 },
    x3: { id: 'x3', kind: 'ingredient', ing: 'crevettes-baltahsine', step: 1, progress: 0 },
    x4: { id: 'x4', kind: 'plate', contents: [['lapin-ceti', 'cuit'], ['crevettes-baltahsine', 'saisi']] },
  })
  k.state.hands.a = 'x1'
  k.state.stations['plan-1'].item = 'x2'
  k.state.work.a = { station: 'plan-1', item: 'x2' }
  k.state.stations['poele-1'].items = ['x3']
  k.state.stations['comptoir-fo'].item = 'x4'
  k.advance((ragout.until - k.now) / 1000 + 0.1)
  assert.equal(ragout.status, 'expired')
  assert.equal(k.state.hands.a, null)
  assert.equal(k.state.items.x1, undefined)
  assert.equal(k.state.stations['plan-1'].item, null)
  assert.equal(k.state.work.a, undefined)
  // Les crevettes servent encore : elles restent, et l'assiette ne garde qu'elles.
  assert.deepEqual(k.state.stations['poele-1'].items, ['x3'])
  assert.deepEqual(k.state.items.x4.contents, [['crevettes-baltahsine', 'saisi']])
  assert.ok(k.events.some((e) => e.kind === 'cleared' && e.recipe === 'ragout-lapin' && e.count === 3))
  assert.equal(k.state.wasted, 0)
})

test('le guidage mène une recette de bout en bout, seul, à une seule touche', () => {
  const k = service(1, ['crevettes-pommes'])
  k.waitOrder()
  const step = () => guide(k.state, 'a')
  const krill = 'crevettes-baltahsine', apple = 'pommes-aerial'
  // Les crevettes : la caisse, la planche, la poêle (ça saisit tout seul).
  assert.deepEqual(step(), { step: 'fetch', stations: ['caisse-crevettes'], ing: krill })
  must(k.use('a', 'caisse-crevettes'))
  assert.deepEqual(step(), { step: 'prep', stations: ['plan-1', 'plan-2', 'plan-3'], ing: krill, process: 'couper' })
  must(k.use('a', 'plan-2'))
  assert.deepEqual(step(), { step: 'work', stations: ['plan-2'], ing: krill, process: 'couper' })
  must(k.use('a', 'plan-2'))
  k.advance(PROCESSES.couper.duration + 0.1)
  assert.deepEqual(step(), { step: 'take', stations: ['plan-2'], ing: krill })
  must(k.use('a', 'plan-2'))
  assert.deepEqual(step(), { step: 'cook', stations: ['poele-1', 'poele-2'], ing: krill, process: 'saisir' })
  must(k.use('a', 'poele-1'))
  // Pendant que ça saisit : la pomme, coupée, qui se sert crue.
  assert.deepEqual(step(), { step: 'fetch', stations: ['caisse-pommes'], ing: apple })
  must(k.use('a', 'caisse-pommes'))
  must(k.use('a', step().stations[0]))
  must(k.use('a', step().stations[0]))
  k.advance(PROCESSES.couper.duration + 0.1)
  // La pomme est prête, et les crevettes saisies : une assiette, la pomme, les crevettes, la passe.
  k.advance(PROCESSES.saisir.duration)
  assert.deepEqual(step(), { step: 'take-plate', stations: ['assiettes'] })
  must(k.use('a', 'assiettes'))
  assert.equal(step().step, 'fill-plate')
  must(k.use('a', step().stations[0]))
  assert.equal(step().step, 'complete')
  must(k.use('a', step().stations[0]))
  assert.deepEqual(step(), { step: 'deliver', stations: ['passe'] })
  must(k.use('a', 'passe'))
  assert.equal(k.state.served, 1)
  // Une assiette qui ne correspond à rien : à la poubelle.
  must(k.use('a', 'assiettes'))
  k.state.items[k.state.hands.a].contents = [['legumes', 'cuit'], ['lapin-ceti', 'brûlé']]
  k.waitOrder()
  assert.equal(step().step, 'trash')
})

test('la vaisselle : quand la pile est vide, le guidage envoie laver', () => {
  const k = service(1, ['crevettes-pommes'])
  k.waitOrder()
  k.state.stations.assiettes.count = 0
  k.state.stations.retour.count = 2
  k.state.items.c = { id: 'c', kind: 'ingredient', ing: 'crevettes-baltahsine', step: 1, progress: 0, cooked: 'saisir' }
  k.state.stations['poele-1'] = { items: ['c'], cook: { start: k.now - 4000, until: k.now, burnAt: k.now + 6000, process: 'saisir' }, done: true, burnt: false }
  assert.deepEqual(guide(k.state, 'a'), { step: 'take-dirty', stations: ['retour'] })
  must(k.use('a', 'retour'))
  assert.deepEqual(guide(k.state, 'a'), { step: 'wash', stations: ['plonge'] })
  must(k.use('a', 'plonge'))
  assert.deepEqual(guide(k.state, 'a'), { step: 'wash', stations: ['plonge'] })
  must(k.use('a', 'plonge'))
  k.advance(RULES.wash + 0.1)
  // Une assiette propre : on dresse ce qui attend.
  assert.equal(k.state.stations.assiettes.count, 1)
  assert.deepEqual(guide(k.state, 'a'), { step: 'take-plate', stations: ['assiettes'] })
})

test('à plusieurs, les robots se répartissent les postes : jamais deux à la même planche', () => {
  const k = service(2, ['ragout-lapin'])
  k.waitOrder()
  // Le lapin pour l'un, les légumes pour l'autre ; puis chacun sa planche.
  for (const pid of ['a', 'b']) must(k.use(pid, guide(k.state, pid).stations[0]), pid)
  assert.deepEqual(['a', 'b'].map((p) => k.state.items[k.state.hands[p]]?.ing).sort(), ['lapin-ceti', 'legumes'])
  for (const pid of ['a', 'b']) must(k.use(pid, guide(k.state, pid).stations[0]), pid)
  for (const pid of ['a', 'b']) {
    const g = guide(k.state, pid)
    assert.equal(g.step, 'work')
    must(k.use(pid, g.stations[0]), pid)
  }
  assert.equal(new Set(Object.values(k.state.work).map((w) => w.station)).size, 2)
})

test('chaque recette de la carte : chaque geste a son poste', () => {
  for (const id of SERVICE_RECIPES) {
    for (const [ing] of RECIPES[id].dish.contents) {
      for (const p of [...INGREDIENTS[ing].prep, ...INGREDIENTS[ing].cook]) assert.ok(STATIONS.some((s) => s.kind === PROCESSES[p].station), `${id} : ${p}`)
    }
  }
  assert.ok(RULES.byPlayers[4].timeScale >= 1)
})

test('des cuisiniers qui ne font que suivre le guidage tiennent un service entier, à tous les effectifs', () => {
  // Sans trajets (chacun appuie une fois par seconde, au poste indiqué), avec les imprévus : on
  // vérifie que le guidage ne tourne jamais en rond et ne laisse personne bloqué.
  for (const n of [1, 2, 3, 4]) {
    for (const seed of [1, 7]) {
      const pids = ['a', 'b', 'c', 'd'].slice(0, n)
      const k = kitchen(createService({ id: 'g', seed, players: n, now: 0 }))
      while (k.state.status === 'running') {
        k.advance(1)
        for (const pid of pids) {
          if (k.state.work[pid]) continue
          const g = guide(k.state, pid)
          if (g?.stations.length) k.use(pid, g.stations[0])
        }
      }
      assert.ok(k.state.served >= 12, `${n} joueurs, graine ${seed} : ${k.state.served} plats servis`)
      assert.ok(k.state.expired <= 3, `${n} joueurs, graine ${seed} : ${k.state.expired} expirés`)
      // Les robots décrochent au moins le bronze (les médailles sont réglées sur eux).
      assert.ok(k.state.score >= RULES.medals[n][0], `${n} joueurs, graine ${seed} : ${k.state.score} points`)
    }
  }
})
