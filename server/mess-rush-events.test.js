// MESS RUSH, les imprévus et le partage du travail (shared/mess-rush.js) : deux imprévus par service
// (un dans chaque moitié), jamais deux fois le même, et chacun se règle en jouant : le plateau
// renversé bloque la passe jusqu'au nettoyage, Moustache se promène puis mange ce qu'on laisse si on
// ne la chasse pas, la surchauffe fait cuire et brûler plus vite, le coup de feu ajoute des bons, le
// saut en hyperespace fait trembler les mains, le feu s'éteint à l'extincteur ; les visiteurs de
// marque (des personnages du vaisseau) viennent à leur heure ; et à plusieurs, chacun a sa part du
// travail.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GUESTS, PROCESSES, RECIPES } from '../shared/mess-rush-catalog.js'
import { EVENT_KINDS, RULES, createService, dropHeld, guide, isBlocked, recipeValue, resolveAction, stepService } from '../shared/mess-rush.js'
import { cookRecipe, kitchen, must } from './mess-rush-helpers.js'

const service = (players = 1, recipes, seed = 7) => {
  const members = ['a', 'b', 'c', 'd'].slice(0, players)
  return kitchen(createService({ id: 'g', seed, players, now: 0, members, ...(recipes ? { recipes } : {}) }))
}
/** Un imprévu imposé, et plus d'autre tirage pendant l'essai. */
const force = (k, event) => {
  k.state.event = { at: k.now, ...event }
  k.state.eventPlan = []
}
/** Moustache, déjà sur son plan (sa promenade finie). */
const perched = (k, station) => force(k, { kind: 'cat', perchAt: k.now, station, until: k.now + RULES.events.cat.perch * 1000 })
const ingredient = (k, id, ing, step = 0) => (k.state.items[id] = { id, kind: 'ingredient', ing, step, progress: 0 })

/** Les imprévus d'un service entier (personne ne cuisine, l'est nettoie la passe), dans l'ordre. */
function timeline(seed) {
  const k = service(2, undefined, seed)
  for (let t = 0; t <= RULES.service; t += 0.5) {
    k.advance(0.5)
    if (k.state.event?.kind === 'spill' && !k.state.work.b) k.use('b', 'passe')
  }
  return k.events.filter((e) => e.kind === 'event' || e.kind === 'event-end')
}

test('deux imprévus par service : un dans chaque moitié, à un moment tiré au sort, jamais deux fois le même', () => {
  const seen = new Set()
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const k = service(2, undefined, seed)
    let active = null
    const starts = []
    for (let t = 0; t < RULES.service; t += 0.1) {
      k.advance(0.1)
      // Un plateau renversé reste là tant qu'on ne nettoie pas : quelqu'un s'en charge.
      if (k.state.event?.kind === 'spill' && !k.state.work.b) k.use('b', 'passe')
      for (const e of k.events.splice(0)) {
        if (e.kind === 'event') {
          starts.push([k.now, e.event])
          seen.add(e.event)
          assert.ok(k.now < k.state.endsAt - RULES.events.quiet * 1000, 'trop tard')
          // (Le coup de feu ne dure pas : pas d'imprévu en cours.)
          if (e.event !== 'rush') {
            assert.equal(active, null, 'deux imprévus à la fois')
            active = e.event
          }
        }
        if (e.kind === 'event-end') active = null
      }
    }
    assert.equal(starts.length, 2, `graine ${seed} : ${starts.length} imprévus`)
    const [[t1, k1], [t2, k2]] = starts
    const [s1, s2] = RULES.events.slots
    assert.ok(t1 >= s1[0] * 1000 && t1 <= s1[1] * 1000 + 100, `premier à ${t1}`)
    assert.ok(t1 <= 150000, 'le premier dans les deux minutes et demie')
    assert.ok(t2 >= s2[0] * 1000 && t2 >= 150000, `second à ${t2}`)
    assert.notEqual(k1, k2)
  }
  assert.ok(seen.size >= 4, [...seen].join(', '))
  // La même graine, les mêmes imprévus : tout le monde vit le même service.
  assert.deepEqual(timeline(3), timeline(3))
})

test('plateau renversé : la passe refuse les plats tant qu\'on ne l\'a pas nettoyée', () => {
  const k = service(1, ['lapin-pommes'])
  k.waitOrder()
  k.state.items.d = { id: 'd', kind: 'plate', contents: [['lapin-ceti', 'cuit'], ['pommes-aerial', 'coupé']] }
  k.state.hands.a = 'd'
  force(k, { kind: 'spill', progress: 0, station: 'passe' })
  assert.ok(isBlocked(k.state, 'passe'))
  // Le plat en main : la passe le refuse, et le guidage le fait poser.
  assert.equal(resolveAction(k.state, 'a', 'passe'), null)
  assert.equal(guide(k.state, 'a').step, 'put')
  must(k.use('a', 'comptoir-fo'))
  // Les mains vides : la touche nettoie ; s'éloigner arrête le geste.
  assert.deepEqual(guide(k.state, 'a'), { step: 'clean', stations: ['passe'] })
  assert.equal(resolveAction(k.state, 'a', 'passe').kind, 'clean')
  must(k.use('a', 'passe'))
  k.near = () => false
  k.advance(0.5)
  assert.equal(k.state.work.a, undefined)
  k.near = () => true
  must(k.use('a', 'passe'))
  k.advance(RULES.events.clean + 0.2)
  assert.equal(k.state.event, null)
  assert.ok(k.events.some((e) => e.kind === 'event-end' && e.event === 'spill' && e.by === 'a'))
  must(k.use('a', 'comptoir-fo'))
  must(k.use('a', 'passe'))
  assert.equal(k.state.served, 1)
})

test('Moustache est là : elle se promène d\'abord (intouchable), puis saute sur une préparation ; la touche la chasse, sinon elle mange', () => {
  const k = service(1, ['ragout-lapin'])
  k.waitOrder()
  ingredient(k, 'x1', 'lapin-ceti', 1)
  k.state.stations['comptoir-fo'].item = 'x1'
  force(k, { kind: 'cat', perchAt: k.now + RULES.events.cat.prowl * 1000, path: [{ x: 9, z: 10 }, { x: 12, z: 10.5 }], station: null })
  // La promenade : on la voit, on ne peut rien lui faire, elle ne bloque rien.
  for (const id of ['comptoir-fo', 'plan-1', 'passe']) assert.ok(!isBlocked(k.state, id))
  assert.notEqual(resolveAction(k.state, 'a', 'comptoir-fo')?.kind, 'shoo')
  assert.notEqual(guide(k.state, 'a')?.step, 'shoo')
  k.advance(RULES.events.cat.prowl - 0.5)
  assert.equal(k.state.event.station, null)
  // Elle saute sur la seule préparation posée : le lapin.
  k.advance(0.6)
  assert.equal(k.state.event.station, 'comptoir-fo')
  assert.ok(k.events.some((e) => e.kind === 'perch' && e.station === 'comptoir-fo'))
  assert.ok(isBlocked(k.state, 'comptoir-fo'))
  // Quoi qu'on tienne, la touche la chasse ; c'est la première chose que montre le guidage.
  assert.deepEqual(resolveAction(k.state, 'a', 'comptoir-fo'), { kind: 'shoo' })
  assert.deepEqual(guide(k.state, 'a'), { step: 'shoo', stations: ['comptoir-fo'] })
  // Personne ne vient : elle mange le lapin et s'en va.
  k.advance(RULES.events.cat.perch + 0.1)
  assert.equal(k.state.stations['comptoir-fo'].item, null)
  assert.equal(k.state.items.x1, undefined)
  assert.ok(k.events.some((e) => e.kind === 'eaten' && e.station === 'comptoir-fo' && e.ing === 'lapin-ceti'))
  assert.equal(k.state.event, null)
  // Sur une planche où l'on coupe : la coupe s'arrête ; chassée, elle ne mange rien.
  must(k.use('a', 'caisse-legumes'))
  must(k.use('a', 'plan-1'))
  must(k.use('a', 'plan-1'))
  perched(k, 'plan-1')
  k.advance(0.2)
  assert.equal(k.state.work.a, undefined)
  must(k.use('a', 'plan-1'))
  assert.ok(k.events.some((e) => e.kind === 'shooed' && e.station === 'plan-1' && e.by === 'a'))
  assert.ok(k.events.some((e) => e.kind === 'event-end' && e.event === 'cat' && e.by === 'a'))
  assert.equal(k.state.event, null)
  assert.ok(k.state.stations['plan-1'].item)
  must(k.use('a', 'plan-1'))
  assert.equal(k.state.work.a.station, 'plan-1')
})

test('passage en hyperespace : tout tremble, couper et laver vont moins vite, la cuisson continue', () => {
  const k = service(1, ['ragout-lapin'])
  k.waitOrder()
  must(k.use('a', 'caisse-lapin'))
  must(k.use('a', 'plan-1'))
  ingredient(k, 'l2', 'legumes', 1)
  k.state.stations['comptoir-fo'].item = 'l2'
  force(k, { kind: 'hyperspace', until: k.now + RULES.events.hyperspace.time * 1000 })
  must(k.use('a', 'plan-1'))
  k.advance(1)
  const lapin = k.state.items[k.state.stations['plan-1'].item]
  assert.ok(Math.abs(lapin.progress - RULES.events.hyperspace.slow) < 0.02, String(lapin.progress))
  // La marmite, elle, cuit à son rythme.
  must(k.use('a', 'comptoir-fo'))
  must(k.use('a', 'marmite-1'))
  const pot = k.state.stations['marmite-1']
  const until = pot.cook.until
  k.advance(RULES.events.hyperspace.time)
  assert.equal(k.state.event, null)
  assert.ok(k.events.some((e) => e.kind === 'event-end' && e.event === 'hyperspace'))
  assert.equal(pot.cook.until, until)
  assert.equal(pot.done, true)
})

test('au feu ! une marmite s\'enflamme : on prend l\'extincteur au mur et on l\'éteint ; laissée, elle brûle', () => {
  const k = service(1, ['ragout-lapin'])
  k.waitOrder()
  ingredient(k, 'l1', 'lapin-ceti', 1)
  k.state.hands.a = 'l1'
  must(k.use('a', 'marmite-1'))
  const pot = k.state.stations['marmite-1']
  const until = pot.cook.until
  force(k, { kind: 'fire', station: 'marmite-1', until: k.now + RULES.events.fire.time * 1000, progress: 0 })
  assert.ok(isBlocked(k.state, 'marmite-1'))
  // Les mains vides, ou autre chose en main : rien à faire au feu. Le guidage envoie à l'extincteur.
  assert.equal(resolveAction(k.state, 'a', 'marmite-1'), null)
  assert.deepEqual(guide(k.state, 'a'), { step: 'take-extinguisher', stations: ['extincteur'] })
  // Pendant le feu, la cuisson s'arrête.
  k.advance(3)
  assert.ok(pot.cook.until - until >= 2900)
  must(k.use('a', 'extincteur'))
  assert.equal(k.state.items[k.state.hands.a].kind, 'extinguisher')
  assert.equal(k.state.stations.extincteur.item, null)
  assert.deepEqual(resolveAction(k.state, 'a', 'marmite-1'), { kind: 'extinguish', busy: false })
  assert.deepEqual(guide(k.state, 'a'), { step: 'extinguish', stations: ['marmite-1'] })
  must(k.use('a', 'marmite-1'))
  k.advance(RULES.events.fire.put + 0.1)
  assert.equal(k.state.event, null)
  assert.ok(k.events.some((e) => e.kind === 'event-end' && e.event === 'fire' && e.by === 'a'))
  assert.equal(pot.burnt, false)
  // On raccroche l'extincteur (le guidage le propose) ; la marmite reprend sa cuisson.
  assert.deepEqual(guide(k.state, 'a'), { step: 'hang', stations: ['extincteur'] })
  must(k.use('a', 'extincteur'))
  assert.equal(k.state.stations.extincteur.item, 'ext')
  k.advance(PROCESSES.cuire.duration)
  assert.equal(pot.done, true)
  // Un autre feu, laissé : ce qu'il y avait brûle, et le feu retombe.
  force(k, { kind: 'fire', station: 'marmite-1', until: k.now + RULES.events.fire.time * 1000, progress: 0 })
  k.advance(RULES.events.fire.time + 0.1)
  assert.equal(pot.burnt, true)
  assert.equal(k.state.event, null)
  // L'extincteur ne se jette pas, et revient à son crochet quand celui qui le tient s'en va.
  must(k.use('a', 'extincteur'))
  assert.equal(resolveAction(k.state, 'a', 'poubelle-no'), null)
  must(k.use('a', 'comptoir-fo'))
  must(k.use('a', 'comptoir-fo'))
  dropHeld(k.state, 'a')
  assert.equal(k.state.stations.extincteur.item, 'ext')
})

test('surchauffe : tout cuit, et brûle, plus vite ; il faut surveiller ses feux', () => {
  const k = service(1, ['crevettes-pommes'])
  k.waitOrder()
  ingredient(k, 'c1', 'crevettes-baltahsine', 1)
  ingredient(k, 'c2', 'crevettes-baltahsine', 1)
  k.state.hands.a = 'c1'
  must(k.use('a', 'poele-1'))
  force(k, { kind: 'overheat', until: k.now + RULES.events.overheat.time * 1000 })
  k.state.hands.a = 'c2'
  must(k.use('a', 'poele-2'))
  // Saisir prend 4 s ; en surchauffe, 4 / 1,7.
  const fast = PROCESSES.saisir.duration / RULES.events.overheat.speed
  k.advance(fast + 0.2)
  assert.equal(k.state.stations['poele-2'].done, true)
  // Et ça brûle plus vite aussi.
  k.advance(RULES.cook.burn.pan / RULES.events.overheat.speed + 0.2)
  assert.equal(k.state.stations['poele-1'].burnt, true)
  assert.equal(k.state.stations['poele-2'].burnt, true)
  // La surchauffe passe : les feux reviennent à la normale.
  k.advance(RULES.events.overheat.time)
  assert.equal(k.state.event, null)
  assert.ok(k.events.some((e) => e.kind === 'event-end' && e.event === 'overheat'))
  must(k.use('a', 'poele-1'))
  ingredient(k, 'c3', 'crevettes-baltahsine', 1)
  k.state.hands.a = 'c3'
  must(k.use('a', 'poele-1'))
  k.advance(PROCESSES.saisir.duration - 0.3)
  assert.equal(k.state.stations['poele-1'].done, false)
})

test('le coup de feu : deux bons d\'un coup', () => {
  const k = service(1, ['crevettes-pommes'])
  k.state.guests = []
  k.waitOrder()
  force(k, { kind: 'rush' })
  k.state.event = null
  k.state.eventCounts = { spill: 1, cat: 1, overheat: 1, hyperspace: 1, fire: 1 }
  k.state.eventPlan = [k.now + 100]
  const before = k.state.orders.length
  k.advance(0.2)
  assert.ok(k.events.some((e) => e.kind === 'event' && e.event === 'rush'))
  assert.equal(k.state.orders.length - before, 2)
})

test('le tirage des imprévus est équitable', () => {
  const first = {}
  for (let seed = 1; seed <= 600; seed++) {
    const k = service(2, undefined, seed)
    k.advance(RULES.events.slots[0][1] + 1)
    const e = k.events.find((x) => x.kind === 'event')
    first[e.event] = (first[e.event] ?? 0) + 1
  }
  // Chacun sort à peu près une fois sur six (Moustache aussi).
  for (const kind of EVENT_KINDS) assert.ok(first[kind] > 600 * 0.09 && first[kind] < 600 * 0.25, `${kind} : ${first[kind]} / 600`)
})

test('les visiteurs de marque : quatre ou cinq personnages du vaisseau par service, chacun à son heure, son plat rapporte double', () => {
  const counts = new Set()
  for (let seed = 1; seed <= 30; seed++) {
    const k = service(2, undefined, seed)
    const plan = k.state.guests
    counts.add(plan.length)
    assert.ok(plan.length >= RULES.guests.count[0] && plan.length <= RULES.guests.count[1], `${plan.length} visiteurs`)
    assert.equal(new Set(plan.map((v) => v.guest)).size, plan.length, 'deux fois le même')
    for (const v of plan) {
      assert.ok(GUESTS[v.guest], v.guest)
      assert.ok(v.at >= k.state.startedAt + RULES.guests.from * 1000 && v.at <= k.state.endsAt - RULES.guests.until * 1000, 'à son heure')
    }
    // Dans l'ordre, sans se marcher dessus.
    for (let i = 1; i < plan.length; i++) assert.ok(plan[i].at > plan[i - 1].at)
  }
  assert.deepEqual([...counts].sort(), [4, 5])
  // Le premier arrive, à son heure, même quand la file est pleine : son plat préféré, à trois ingrédients.
  const k = service(1, ['crevettes-pommes'])
  k.state.eventPlan = []
  const visit = k.state.guests[0]
  k.advance((visit.at - k.now) / 1000 - 0.2)
  assert.ok(!k.state.orders.some((o) => o.guest))
  k.advance(0.3)
  const order = k.state.orders.find((o) => o.guest === visit.guest)
  assert.ok(order)
  assert.equal(order.recipe, GUESTS[visit.guest].dish)
  assert.equal(RECIPES[order.recipe].dish.contents.length, 3)
  assert.ok(k.events.some((e) => e.kind === 'order' && e.guest === visit.guest))
  // Servi : deux fois les points d'un plat ordinaire de même valeur (au même bonus et combo).
  for (const o of k.state.orders) if (o !== order) o.status = 'expired'
  cookRecipe(k, 'a', order.recipe)
  const served = k.events.find((e) => e.kind === 'served')
  assert.equal(served.guest, visit.guest)
  assert.equal(served.points, Math.round(recipeValue(order.recipe).points * RULES.guests.points * 1.5))
})

test('à plusieurs, chacun sa part du travail : personne ne reste les bras croisés', () => {
  for (const n of [2, 3, 4]) {
    const pids = ['a', 'b', 'c', 'd'].slice(0, n)
    const share = Object.fromEntries(pids.map((p) => [p, 0]))
    for (const seed of [1, 2, 3, 4]) {
      const k = service(n, undefined, seed)
      while (k.state.status === 'running') {
        k.advance(1)
        for (const pid of pids) {
          if (k.state.work[pid]) {
            share[pid]++
            continue
          }
          const g = guide(k.state, pid)
          if (g?.stations.length && k.use(pid, g.stations[0]).ok) share[pid]++
        }
      }
    }
    const total = pids.reduce((t, p) => t + share[p], 0)
    const parts = pids.map((p) => `${p} ${Math.round((share[p] / total) * 100)} %`).join(', ')
    for (const pid of pids) assert.ok(share[pid] / total > 1 / (2 * n), `${n} joueurs : ${parts}`)
    // À deux, à peu près moitié-moitié.
    if (n === 2) for (const pid of pids) assert.ok(share[pid] / total < 0.6, parts)
  }
})

test('un service fini n\'a plus d\'imprévu', () => {
  const k = service(1)
  k.advance(RULES.service + 1)
  assert.equal(k.state.status, 'ended')
  assert.deepEqual(stepService(k.state, k.now + 100000, 0.1, () => true), [])
})
