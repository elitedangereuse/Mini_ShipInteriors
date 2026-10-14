// MESS RUSH, la cuisine cloisonnée et ce qui aide à s'y retrouver (shared/mess-rush.js) : les plans
// selon le nombre de joueurs (zones, cloisons, passe-plats), la carte de chaque effectif, vider un
// ustensile, ce qui disparaît quand un bon expire, et le guidage (les flèches).
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INGREDIENTS, PROCESSES, RECIPES, SERVICE_RECIPES } from '../shared/mess-rush-catalog.js'
import {
  KITCHENS, MESS_BOUNDS, RULES, STATION_BY_ID, canReach, createService, guide, inZone, menuFor, onMessFloor, openKitchen, resolveAction, wallsOf,
} from '../shared/mess-rush.js'
import { kitchen, must } from './mess-rush-helpers.js'

const service = (players, recipes, members = ['a', 'b', 'c', 'd'].slice(0, players)) =>
  kitchen(createService({ id: 'g', seed: 7, players, now: 0, members, ...(recipes ? { recipes } : {}) }))

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
    // Toute la cuisine : chaque sorte de poste existe, et chaque zone a sa poubelle, dans un coin.
    for (const kind of ['fridge', 'pantry', 'board', 'sink', 'pot', 'pan', 'oven', 'fountain', 'plates', 'counter', 'pass', 'trash']) {
      assert.ok(k.stations.some((id) => STATION_BY_ID[id].kind === kind), `${kind} à ${n}`)
    }
    for (const zone of k.zones) {
      const bins = zone.stations.filter((id) => STATION_BY_ID[id].kind === 'trash')
      assert.ok(bins.length >= 1, `poubelle : ${n} ${zone.id}`)
      for (const id of bins) {
        const { x, z } = STATION_BY_ID[id]
        assert.ok(Math.min(x - MESS_BOUNDS.minX, MESS_BOUNDS.maxX - x) < 0.5, `${id} dans un coin`)
      }
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

test('à deux : chacun ses postes, les passe-plats aux deux ; un départ fait tomber les cloisons', () => {
  const k = service(2)
  k.waitOrder()
  // Chacun prend, prépare, cuit et livre : l'ouest a le frigo, la plonge, les poêles ; l'est le garde-manger, les marmites, le four.
  for (const id of ['frigo', 'plonge', 'poele-1', 'plan-1', 'assiettes', 'passe-1', 'fontaine']) assert.ok(canReach(k.state, 'a', id), id)
  for (const id of ['garde-manger', 'marmite-1', 'four', 'plan-2', 'assiettes-2', 'passe-2']) assert.ok(canReach(k.state, 'b', id), id)
  assert.ok(!canReach(k.state, 'a', 'garde-manger'))
  assert.ok(!canReach(k.state, 'b', 'frigo'))
  for (const pid of ['a', 'b']) assert.ok(canReach(k.state, pid, 'passe-plat-sud'))
  // Hors de sa zone, aucune action.
  assert.deepEqual(resolveAction(k.state, 'b', 'frigo'), { use: null, work: null })
  assert.equal(k.use('b', 'frigo').ok, false)
  assert.ok(inZone(k.state, 'a', 10, 11))
  assert.ok(!inZone(k.state, 'a', 15, 11))
  assert.equal(wallsOf(k.state).length, 2)
  // Le passe-plat : l'un pose, l'autre prend.
  must(k.use('a', 'frigo'))
  must(k.use('a', 'passe-plat-sud'))
  must(k.use('b', 'passe-plat-sud'))
  assert.ok(k.state.hands.b)
  // Quelqu'un part : la cuisine s'ouvre, une fois ; ce qui était sur le passe-plat va à la place libre la plus proche.
  must(k.use('b', 'passe-plat-sud'))
  const passed = k.state.stations['passe-plat-sud'].item
  assert.deepEqual(openKitchen(k.state), [{ kind: 'open' }])
  assert.equal(k.state.stations['passe-plat-sud'], undefined)
  assert.ok(!canReach(k.state, 'a', 'passe-plat-sud'))
  assert.equal(k.state.stations['passe-plat-ilot'].item, passed)
  assert.deepEqual(openKitchen(k.state), [])
  assert.deepEqual(wallsOf(k.state), [])
  assert.ok(canReach(k.state, 'a', 'garde-manger'))
  assert.ok(inZone(k.state, 'a', 15, 11))
  // Seul, il n'y a jamais rien à ouvrir.
  assert.deepEqual(openKitchen(service(1).state), [])
})

test('la carte suit le nombre de joueurs', () => {
  assert.ok(!menuFor(1).includes('bouillon-imperial'))
  assert.ok(!menuFor(1).includes('riz-crevettes'))
  assert.ok(!menuFor(2).includes('bouillon-imperial'))
  assert.deepEqual(menuFor(4), SERVICE_RECIPES)
  assert.deepEqual(service(1).state.recipes, menuFor(1))
  // Une liste imposée (serveur de dev) reste telle quelle.
  assert.deepEqual(service(1, ['bouillon-imperial']).state.recipes, ['bouillon-imperial'])
})

test('vider une marmite ou une fontaine, reprendre ce qu\'on vient d\'y mettre', () => {
  const k = service(1, ['ragout-lapin', 'cafe-goman'])
  k.waitOrder()
  const lapin = { id: 'x1', kind: 'ingredient', ing: 'lapin-ceti', step: 1, progress: 0 }
  const legumes = { id: 'x2', kind: 'ingredient', ing: 'legumes', step: 2, progress: 0 }
  Object.assign(k.state.items, { x1: lapin, x2: legumes })
  k.state.hands.a = 'x1'
  must(k.use('a', 'marmite-1'))
  // Pas encore lancée : E reprend le dernier ingrédient mis.
  assert.equal(resolveAction(k.state, 'a', 'marmite-1').use.kind, 'take-back')
  must(k.use('a', 'marmite-1'))
  assert.equal(k.state.hands.a, 'x1')
  assert.deepEqual(k.state.stations['marmite-1'].items, [])
  must(k.use('a', 'marmite-1'))
  k.state.hands.a = 'x2'
  must(k.use('a', 'marmite-1'))
  must(k.work('a', 'marmite-1'))
  // En cuisson : Espace vide la marmite, c'est perdu.
  assert.equal(resolveAction(k.state, 'a', 'marmite-1').work.kind, 'empty')
  must(k.work('a', 'marmite-1'))
  assert.deepEqual(k.state.stations['marmite-1'], { items: [], cook: null, done: false })
  assert.equal(k.state.items.x1, undefined)
  assert.equal(k.state.wasted, 2)
  assert.ok(k.events.some((e) => e.kind === 'emptied' && e.station === 'marmite-1' && e.by === 'a'))
  // La fontaine, une fois la tasse prête : on peut aussi la vider.
  must(k.use('a', 'garde-manger', 'cafe-goman'))
  must(k.use('a', 'fontaine'))
  must(k.work('a', 'fontaine'))
  k.advance(PROCESSES.infuser.duration + 0.2)
  assert.equal(resolveAction(k.state, 'a', 'fontaine').work.kind, 'empty')
  must(k.work('a', 'fontaine'))
  assert.equal(k.state.stations.fontaine.item, null)
  assert.equal(k.state.wasted, 3)
})

test('un bon expire : ce qu\'on lui préparait disparaît, sauf ce qu\'un autre bon attend', () => {
  const k = service(1, ['ragout-lapin'])
  k.waitOrder()
  const ragout = k.state.orders[0]
  // Un second bon, qui veut des escargots.
  k.state.orders.push({ id: 'c9', recipe: 'escargots-irukama', at: k.now, until: k.now + 600000, status: 'pending' })
  Object.assign(k.state.items, {
    x1: { id: 'x1', kind: 'ingredient', ing: 'lapin-ceti', step: 1, progress: 0 },
    x2: { id: 'x2', kind: 'ingredient', ing: 'legumes', step: 0, progress: 1 },
    x3: { id: 'x3', kind: 'ingredient', ing: 'escargots-irukama', step: 1, progress: 0 },
    x4: { id: 'x4', kind: 'plate', contents: [['lapin-ceti', 'mijoté'], ['escargots-irukama', 'poêlé']] },
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
  // Les escargots servent encore : ils restent, et l'assiette ne garde qu'eux.
  assert.deepEqual(k.state.stations['poele-1'].items, ['x3'])
  assert.deepEqual(k.state.items.x4.contents, [['escargots-irukama', 'poêlé']])
  assert.ok(k.events.some((e) => e.kind === 'cleared' && e.recipe === 'ragout-lapin' && e.count === 3))
  assert.equal(k.state.wasted, 0)
})

test('le guidage mène une recette de bout en bout, seul', () => {
  const k = service(1, ['escargots-irukama'])
  k.waitOrder()
  const step = () => guide(k.state, 'a')
  assert.deepEqual(step(), { step: 'fetch', stations: ['frigo'], ing: 'escargots-irukama' })
  must(k.use('a', 'frigo', 'escargots-irukama'))
  assert.deepEqual(step(), { step: 'prep', stations: ['plonge'], ing: 'escargots-irukama', process: 'rincer' })
  must(k.use('a', 'plonge'))
  assert.equal(step().step, 'work')
  must(k.work('a', 'plonge'))
  k.advance(PROCESSES.rincer.duration + 0.2)
  must(k.use('a', 'plonge'))
  assert.deepEqual(step(), { step: 'cook', stations: ['poele-1', 'poele-2'], ing: 'escargots-irukama', process: 'poeler' })
  must(k.use('a', 'poele-1'))
  assert.deepEqual(step(), { step: 'start', stations: ['poele-1'] })
  must(k.work('a', 'poele-1'))
  k.advance(PROCESSES.poeler.duration + 0.2)
  assert.deepEqual(step(), { step: 'take-plate', stations: ['assiettes', 'assiettes-2'] })
  must(k.use('a', 'assiettes'))
  assert.deepEqual(step(), { step: 'fill-plate', stations: ['poele-1'] })
  must(k.use('a', 'poele-1'))
  assert.deepEqual(step(), { step: 'deliver', stations: ['passe-1', 'passe-2'] })
  // Une assiette qui ne correspond à rien : à la poubelle.
  k.state.items[k.state.hands.a].contents = [['legumes', 'mijoté']]
  assert.equal(step().step, 'trash')
})

test('à plusieurs, le guidage passe par les passe-plats', () => {
  const k = service(2, ['ragout-lapin'])
  k.waitOrder()
  // Le lapin sort du frigo (l'ouest), les légumes du garde-manger (l'est) : chacun va chercher le sien.
  assert.deepEqual(guide(k.state, 'a'), { step: 'fetch', stations: ['frigo'], ing: 'lapin-ceti' })
  assert.deepEqual(guide(k.state, 'b'), { step: 'fetch', stations: ['garde-manger'], ing: 'legumes' })
  // Le lapin coupé mijote dans une marmite de l'est : le passe-plat.
  k.state.items.x1 = { id: 'x1', kind: 'ingredient', ing: 'lapin-ceti', step: 1, progress: 0 }
  k.state.hands.a = 'x1'
  const pass = guide(k.state, 'a')
  assert.equal(pass.step, 'handoff')
  assert.ok(pass.stations.every((id) => canReach(k.state, 'b', id)))
  must(k.use('a', pass.stations[0]))
  // L'est le voit, le prend, le met à mijoter.
  assert.deepEqual(guide(k.state, 'b'), { step: 'take', stations: [pass.stations[0]], ing: 'lapin-ceti' })
  // À quatre, chaque zone a quelque chose à faire ou à attendre, et rien n'est indiqué hors de sa zone.
  const four = service(4, ['ragout-lapin'])
  four.waitOrder()
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
        const kinds = [info.source, ...[...info.prep, ...info.cook].map((p) => PROCESSES[p].station)]
        for (const kind of kinds) assert.ok(k.stations.some((s) => STATION_BY_ID[s].kind === kind), `${id} à ${n} : ${kind}`)
      }
    }
  }
  assert.ok(RULES.byPlayers[4].timeScale >= 1)
})

test('des cuisiniers qui ne font que suivre le guidage tiennent un service entier, à tous les effectifs', () => {
  // Sans trajets (chacun agit une fois par seconde, au poste indiqué) : on vérifie que le guidage ne
  // tourne jamais en rond et ne laisse personne bloqué, cloisons comprises.
  for (const n of [1, 2, 3, 4]) {
    for (const seed of [1, 7]) {
      const pids = ['a', 'b', 'c', 'd'].slice(0, n)
      const k = kitchen(createService({ id: 'g', seed, players: n, now: 0, members: pids }))
      while (k.state.status === 'running') {
        k.advance(1)
        for (const pid of pids) {
          if (k.state.work[pid]) continue
          const g = guide(k.state, pid)
          if (!g?.stations.length) continue
          if (g.step === 'work' || g.step === 'start' || g.step === 'clean') k.work(pid, g.stations[0])
          else k.use(pid, g.stations[0], g.ing)
        }
      }
      assert.ok(k.state.served >= 12, `${n} joueurs, graine ${seed} : ${k.state.served} plats servis`)
      assert.ok(k.state.expired <= 3, `${n} joueurs, graine ${seed} : ${k.state.expired} expirés`)
    }
  }
})
