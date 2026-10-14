// MESS RUSH, la cuisine cloisonnée et ce qui aide à s'y retrouver (shared/mess-rush.js) : les plans
// selon le nombre de joueurs (zones, cloisons, passe-plats), la carte de chaque effectif, ce qui
// disparaît quand un bon expire, et le guidage (la flèche et la consigne).
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INGREDIENTS, PROCESSES, RECIPES, SERVICE_RECIPES } from '../shared/mess-rush-catalog.js'
import {
  KITCHENS, MESS_BOUNDS, RULES, STATION_BY_ID, canReach, createService, guide, inZone, menuFor, onMessFloor, openKitchen, resolveAction, wallsOf,
} from '../shared/mess-rush.js'
import { kitchen, must } from './mess-rush-helpers.js'

/** Une partie sans imprévu (cf. mess-rush-events.test.js pour eux). */
const service = (players, recipes, members = ['a', 'b', 'c', 'd'].slice(0, players)) => {
  const k = kitchen(createService({ id: 'g', seed: 7, players, now: 0, members, ...(recipes ? { recipes } : {}) }))
  k.state.nextEventAt = undefined
  return k
}

/** Distance d'un point à un rectangle (0 dedans). */
const toRect = (b, x, z) => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ))

test('chaque plan : une zone par joueur, des arrivées sur son sol, des postes à portée de sa zone', () => {
  for (const n of [1, 2, 3, 4]) {
    const k = KITCHENS[n]
    assert.equal(k.zones.length, n)
    for (const zone of k.zones) {
      const { spawn, bounds } = zone
      assert.ok(onMessFloor(spawn.x, spawn.z), `${n} ${zone.id}`)
      assert.ok(toRect(bounds, spawn.x, spawn.z) === 0, `arrivée hors zone : ${n} ${zone.id}`)
      for (const wall of k.walls) assert.ok(toRect(wall, spawn.x, spawn.z) > 0.3, `arrivée dans une cloison : ${n} ${zone.id}`)
      // La portée de l'invite (1,45 m) depuis le sol de la zone.
      for (const id of zone.stations) assert.ok(toRect(bounds, STATION_BY_ID[id].x, STATION_BY_ID[id].z) < 1.2, `${id} hors de portée de ${n} ${zone.id}`)
    }
    // Toutes les zones se relient par des passe-plats (des places de comptoir partagées).
    const linked = new Set([0])
    for (let grew = true; grew;) {
      grew = false
      for (const [i, z] of k.zones.entries()) {
        if (linked.has(i)) continue
        const shares = [...linked].some((j) => k.zones[j].stations.some((id) => STATION_BY_ID[id].kind === 'counter' && z.stations.includes(id)))
        if (shares) {
          linked.add(i)
          grew = true
        }
      }
    }
    assert.equal(linked.size, n, `zones isolées à ${n}`)
    // Toute la cuisine : chaque sorte de poste existe, chaque ingrédient a sa caisse, et les poubelles sont dans les coins.
    for (const kind of ['crate', 'board', 'pot', 'pan', 'sink', 'plates', 'return', 'counter', 'pass', 'trash']) {
      assert.ok(k.stations.some((id) => STATION_BY_ID[id].kind === kind), `${kind} à ${n}`)
    }
    for (const ing of Object.keys(INGREDIENTS)) assert.ok(k.stations.some((id) => STATION_BY_ID[id].ing === ing), `caisse ${ing} à ${n}`)
    for (const id of k.stations.filter((id) => STATION_BY_ID[id].kind === 'trash')) {
      const { x } = STATION_BY_ID[id]
      assert.ok(Math.min(x - MESS_BOUNDS.minX, MESS_BOUNDS.maxX - x) < 0.5, `${id} dans un coin`)
    }
  }
})

test('les cloisons ferment vraiment : une zone ne touche pas le sol d\'une autre', () => {
  for (const n of [2, 3, 4]) {
    const { zones } = KITCHENS[n]
    for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i].bounds, b = zones[j].bounds
      const overlap = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 0 && Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > 0
      assert.ok(!overlap, `${n} : ${zones[i].id} et ${zones[j].id} se chevauchent`)
    }
    for (const w of KITCHENS[n].walls) assert.ok(w.minX >= MESS_BOUNDS.minX && w.maxX <= MESS_BOUNDS.maxX)
  }
})

test('à deux : le commis prend et coupe, le chef cuit, dresse, sert et lave ; un départ fait tomber la cloison', () => {
  const k = service(2)
  k.waitOrder()
  for (const id of ['caisse-lapin', 'caisse-crevettes', 'caisse-legumes', 'plan-1', 'plan-2', 'poubelle-so']) assert.ok(canReach(k.state, 'a', id), id)
  for (const id of ['marmite-1', 'poele-1', 'caisse-riz', 'caisse-pommes', 'plan-3', 'assiettes', 'passe', 'retour', 'plonge']) assert.ok(canReach(k.state, 'b', id), id)
  for (const id of ['marmite-1', 'assiettes', 'passe']) assert.ok(!canReach(k.state, 'a', id), id)
  assert.ok(!canReach(k.state, 'b', 'caisse-lapin'))
  for (const pid of ['a', 'b']) for (const id of ['passe-plat-o-n', 'passe-plat-o-s']) assert.ok(canReach(k.state, pid, id))
  // Hors de sa zone, aucune action.
  assert.equal(resolveAction(k.state, 'b', 'caisse-lapin'), null)
  assert.equal(k.use('b', 'caisse-lapin').ok, false)
  assert.ok(inZone(k.state, 'a', 9.5, 11))
  assert.ok(!inZone(k.state, 'a', 15, 11))
  assert.equal(wallsOf(k.state).length, 1)
  // Le passe-plat : l'un pose, l'autre prend.
  must(k.use('a', 'caisse-lapin'))
  must(k.use('a', 'passe-plat-o-n'))
  must(k.use('b', 'passe-plat-o-n'))
  assert.ok(k.state.hands.b)
  // Quelqu'un part : la cuisine s'ouvre, une fois ; ce qui était sur le passe-plat va à la place libre la plus proche.
  must(k.use('b', 'passe-plat-o-n'))
  const passed = k.state.stations['passe-plat-o-n'].item
  assert.deepEqual(openKitchen(k.state), [{ kind: 'open' }])
  assert.equal(k.state.stations['passe-plat-o-n'], undefined)
  assert.ok(!canReach(k.state, 'a', 'passe-plat-o-n'))
  assert.equal(k.state.stations['comptoir-o'].item, passed)
  assert.deepEqual(openKitchen(k.state), [])
  assert.deepEqual(wallsOf(k.state), [])
  assert.ok(canReach(k.state, 'a', 'marmite-1'))
  assert.ok(inZone(k.state, 'a', 15, 11))
  // Seul, il n'y a jamais rien à ouvrir.
  assert.deepEqual(openKitchen(service(1).state), [])
})

test('la carte suit le nombre de joueurs', () => {
  assert.ok(!menuFor(1).includes('festin-du-bord'))
  for (const n of [2, 3, 4]) assert.deepEqual(menuFor(n), SERVICE_RECIPES)
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
  k.state.stations['comptoir-1'].item = 'x4'
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
  const k = service(1, ['crevettes-saisies'])
  k.waitOrder()
  const step = () => guide(k.state, 'a')
  const ing = 'crevettes-baltahsine'
  assert.deepEqual(step(), { step: 'fetch', stations: ['caisse-crevettes'], ing })
  must(k.use('a', 'caisse-crevettes'))
  assert.deepEqual(step(), { step: 'prep', stations: ['plan-2', 'plan-1', 'plan-3'], ing, process: 'couper' })
  must(k.use('a', 'plan-2'))
  assert.deepEqual(step(), { step: 'work', stations: ['plan-2'], ing, process: 'couper' })
  must(k.use('a', 'plan-2'))
  k.advance(PROCESSES.couper.duration + 0.1)
  assert.deepEqual(step(), { step: 'take', stations: ['plan-2'], ing })
  must(k.use('a', 'plan-2'))
  assert.deepEqual(step(), { step: 'cook', stations: ['poele-1', 'poele-2'], ing, process: 'saisir' })
  must(k.use('a', 'poele-1'))
  // Ça saisit tout seul : rien à faire en attendant.
  assert.equal(step(), null)
  k.advance(PROCESSES.saisir.duration + 0.1)
  assert.deepEqual(step(), { step: 'take-plate', stations: ['assiettes'] })
  must(k.use('a', 'assiettes'))
  assert.deepEqual(step(), { step: 'fill-plate', stations: ['poele-1'] })
  must(k.use('a', 'poele-1'))
  assert.deepEqual(step(), { step: 'deliver', stations: ['passe'] })
  // Une assiette qui ne correspond à rien : à la poubelle.
  k.state.items[k.state.hands.a].contents = [['legumes', 'cuit']]
  assert.equal(step().step, 'trash')
})

test('la vaisselle : quand la pile est vide, le guidage envoie laver', () => {
  const k = service(1, ['crevettes-saisies'])
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

test('à plusieurs, le guidage passe par les passe-plats', () => {
  const k = service(2, ['ragout-lapin'])
  k.waitOrder()
  // Le commis va chercher le lapin ; le chef n'a rien tant que rien n'arrive.
  assert.deepEqual(guide(k.state, 'a'), { step: 'fetch', stations: ['caisse-lapin'], ing: 'lapin-ceti' })
  assert.equal(guide(k.state, 'b'), null)
  // Le lapin coupé cuit dans une marmite du chef : le passe-plat.
  k.state.items.x1 = { id: 'x1', kind: 'ingredient', ing: 'lapin-ceti', step: 1, progress: 0 }
  k.state.hands.a = 'x1'
  const pass = guide(k.state, 'a')
  assert.equal(pass.step, 'handoff')
  assert.ok(pass.stations.length && pass.stations.every((id) => canReach(k.state, 'b', id)))
  must(k.use('a', pass.stations[0]))
  // Le chef le voit, le prend, le met à cuire.
  assert.deepEqual(guide(k.state, 'b'), { step: 'take', stations: [pass.stations[0]], ing: 'lapin-ceti' })
  must(k.use('b', pass.stations[0]))
  assert.equal(guide(k.state, 'b').step, 'cook')
  // À quatre, rien n'est indiqué hors de sa zone.
  const four = service(4, ['festin-du-bord'])
  four.waitOrder(400)
  for (const pid of ['a', 'b', 'c', 'd']) {
    const g = guide(four.state, pid)
    if (g) assert.ok(g.stations.every((id) => canReach(four.state, pid, id)), pid)
  }
})

test('chaque recette de la carte se fait à plusieurs : chaque geste a son poste dans une zone', () => {
  for (const n of [2, 3, 4]) {
    const k = KITCHENS[n]
    for (const id of menuFor(n)) {
      for (const [ing] of RECIPES[id].dish.contents) {
        const info = INGREDIENTS[ing]
        assert.ok(k.stations.some((s) => STATION_BY_ID[s].ing === ing), `${id} à ${n} : caisse ${ing}`)
        for (const p of [...info.prep, ...info.cook]) assert.ok(k.stations.some((s) => STATION_BY_ID[s].kind === PROCESSES[p].station), `${id} à ${n} : ${p}`)
      }
    }
  }
  assert.ok(RULES.byPlayers[4].timeScale >= 1)
})

test('des cuisiniers qui ne font que suivre le guidage tiennent un service entier, à tous les effectifs', () => {
  // Sans trajets (chacun appuie une fois par seconde, au poste indiqué), avec les imprévus : on
  // vérifie que le guidage ne tourne jamais en rond et ne laisse personne bloqué, cloisons comprises.
  for (const n of [1, 2, 3, 4]) {
    for (const seed of [1, 7]) {
      const pids = ['a', 'b', 'c', 'd'].slice(0, n)
      const k = kitchen(createService({ id: 'g', seed, players: n, now: 0, members: pids }))
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
