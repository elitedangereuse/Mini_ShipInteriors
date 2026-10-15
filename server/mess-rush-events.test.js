// MESS RUSH, les imprévus et le partage du travail (shared/mess-rush.js) : un imprévu à la fois, ni
// trop tôt ni dans les dernières secondes, et chacun se règle en jouant : le plateau renversé bloque
// la passe jusqu'au nettoyage, le chat mange ce qu'on laisse si on ne le chasse pas, la surchauffe
// fait cuire et brûler plus vite, le coup de feu ajoute des bons ; le tirage est équitable ; les
// visiteurs de marque (des personnages du vaisseau) viennent à leur heure ; et à plusieurs,
// chacun a sa part du travail.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GUESTS, PROCESSES, RECIPES } from '../shared/mess-rush-catalog.js'
import { EVENT_KINDS, RULES, createService, guide, isBlocked, recipeValue, resolveAction, stepService } from '../shared/mess-rush.js'
import { cookRecipe, kitchen, must } from './mess-rush-helpers.js'

const service = (players = 1, recipes, seed = 7) => {
  const members = ['a', 'b', 'c', 'd'].slice(0, players)
  return kitchen(createService({ id: 'g', seed, players, now: 0, members, ...(recipes ? { recipes } : {}) }))
}
/** Un imprévu imposé, et plus d'autre tirage pendant l'essai. */
const force = (k, event) => {
  k.state.event = { at: k.now, ...event }
  k.state.nextEventAt = Infinity
}
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

test('un imprévu à la fois, pas avant la première minute, jamais dans les dernières secondes', () => {
  const seen = new Set()
  for (const seed of [1, 2, 3, 4, 5]) {
    const k = service(2, undefined, seed)
    let active = null
    let count = 0
    for (let t = 0; t < RULES.service; t += 0.1) {
      k.advance(0.1)
      // Un plateau renversé reste là tant qu'on ne nettoie pas : le cuisinier de l'est s'en charge.
      if (k.state.event?.kind === 'spill' && !k.state.work.b) k.use('b', 'passe')
      for (const e of k.events.splice(0)) {
        if (e.kind === 'event') {
          count++
          seen.add(e.event)
          assert.ok(k.now >= RULES.events.first * 1000, `trop tôt : ${k.now}`)
          assert.ok(k.now < k.state.endsAt - RULES.events.quiet * 1000, 'trop tard')
          // (Le coup de feu ne dure pas : pas d'imprévu en cours.)
          if (['spill', 'cat', 'overheat'].includes(e.event)) {
            assert.equal(active, null, 'deux imprévus à la fois')
            active = e.event
          }
        }
        if (e.kind === 'event-end') active = null
      }
    }
    assert.ok(count >= 2, `graine ${seed} : ${count} imprévus`)
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
  must(k.use('a', 'comptoir-fond'))
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
  must(k.use('a', 'comptoir-fond'))
  must(k.use('a', 'passe'))
  assert.equal(k.state.served, 1)
})

test('le chat du bord : il mange ce qu\'on a laissé si personne ne le chasse ; la touche le chasse', () => {
  const k = service(1, ['ragout-lapin'])
  k.waitOrder()
  ingredient(k, 'x1', 'lapin-ceti', 1)
  k.state.stations['comptoir-fond'].item = 'x1'
  force(k, { kind: 'cat', until: k.now + RULES.events.cat * 1000, station: 'comptoir-fond' })
  assert.ok(isBlocked(k.state, 'comptoir-fond'))
  // Quoi qu'on tienne, la touche le chasse ; c'est la première chose que montre le guidage.
  assert.deepEqual(resolveAction(k.state, 'a', 'comptoir-fond'), { kind: 'shoo' })
  assert.deepEqual(guide(k.state, 'a'), { step: 'shoo', stations: ['comptoir-fond'] })
  // Personne ne vient : il mange le lapin et s'en va.
  k.advance(RULES.events.cat + 0.1)
  assert.equal(k.state.stations['comptoir-fond'].item, null)
  assert.equal(k.state.items.x1, undefined)
  assert.ok(k.events.some((e) => e.kind === 'eaten' && e.station === 'comptoir-fond' && e.ing === 'lapin-ceti'))
  assert.equal(k.state.event, null)
  // Il revient sur une planche où l'on coupe : la coupe s'arrête ; chassé, il ne mange rien.
  must(k.use('a', 'caisse-legumes'))
  must(k.use('a', 'plan-1'))
  must(k.use('a', 'plan-1'))
  force(k, { kind: 'cat', until: k.now + RULES.events.cat * 1000, station: 'plan-1' })
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
  for (let seed = 1; seed < 400; seed++) {
    const k = service(1, ['crevettes-pommes'], seed)
    k.state.guests = []
    k.advance(RULES.events.first + 0.2)
    const at = k.events.find((e) => e.kind === 'event' && e.event === 'rush')
    if (!at) continue
    const i = k.events.indexOf(at)
    assert.equal(k.events.slice(i + 1, i + 3).filter((e) => e.kind === 'order').length, 2)
    return
  }
  assert.fail('jamais de coup de feu')
})

test('le tirage des imprévus est équitable, et ce qui est déjà arrivé revient moins', () => {
  const first = {}
  let again = 0, pairs = 0
  for (let seed = 1; seed <= 400; seed++) {
    const k = service(2, undefined, seed)
    const seen = []
    for (let t = 0; t < RULES.service && seen.length < 2; t += 1) {
      k.advance(1)
      if (k.state.event?.kind === 'spill' && !k.state.work.b) k.use('b', 'passe')
      for (const e of k.events.splice(0)) if (e.kind === 'event') seen.push(e.event)
    }
    first[seen[0]] = (first[seen[0]] ?? 0) + 1
    if (seen.length === 2) {
      pairs++
      if (seen[1] === seen[0]) again++
    }
  }
  // Chacun sort à peu près une fois sur quatre (le chat aussi : plus de « Moustache » à chaque service).
  for (const kind of EVENT_KINDS) assert.ok(first[kind] > 400 * 0.15 && first[kind] < 400 * 0.35, `${kind} : ${first[kind]} / 400`)
  // Le même deux fois de suite : bien moins d'une fois sur quatre.
  assert.ok(again / pairs < 0.16, `${again} / ${pairs}`)
  assert.equal(RULES.events.repeat < 1, true)
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
  k.state.nextEventAt = undefined
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
