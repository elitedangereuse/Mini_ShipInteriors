// MESS RUSH, les imprévus et le partage du travail (shared/mess-rush.js) : un imprévu à la fois, ni
// trop tôt ni dans les dernières secondes ; la panne fige les cuissons, la plonge bouchée ne rince
// plus, le plateau renversé bloque la passe jusqu'au nettoyage, le coup de feu et l'amiral ajoutent
// des bons ; et à deux, le coin du frigo ne fait plus presque tout.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PROCESSES } from '../shared/mess-rush-catalog.js'
import { RULES, createService, guide, isBlocked, resolveAction, stepService } from '../shared/mess-rush.js'
import { kitchen, must } from './mess-rush-helpers.js'

const service = (players = 1, recipes, seed = 7) => {
  const members = ['a', 'b', 'c', 'd'].slice(0, players)
  return kitchen(createService({ id: 'g', seed, players, now: 0, members, ...(recipes ? { recipes } : {}) }))
}

/** Les imprévus d'un service entier (personne ne cuisine, on nettoie la passe), dans l'ordre. */
function timeline(seed) {
  const k = service(2, undefined, seed)
  for (let t = 0; t <= RULES.service; t += 0.5) {
    k.advance(0.5)
    if (k.state.event?.kind === 'spill' && !k.state.work.b) k.work('b', 'passe')
  }
  return k.events.filter((e) => e.kind === 'event' || e.kind === 'event-end')
}

test('un imprévu à la fois, pas avant la première minute, jamais dans les dernières secondes', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const k = service(2, undefined, seed)
    let active = null
    let count = 0
    for (let t = 0; t < RULES.service; t += 0.1) {
      k.advance(0.1)
      // Un plateau renversé reste là tant qu'on ne nettoie pas : le cuisinier de l'est s'en charge.
      if (k.state.event?.kind === 'spill' && !k.state.work.b) k.work('b', 'passe')
      for (const e of k.events.splice(0)) {
        if (e.kind === 'event') {
          count++
          assert.ok(k.now >= RULES.events.first * 1000, `trop tôt : ${k.now}`)
          assert.ok(k.now < k.state.endsAt - RULES.events.quiet * 1000, 'trop tard')
          // (Le coup de feu et l'amiral ne durent pas : pas d'imprévu en cours.)
          if (['outage', 'sink', 'spill'].includes(e.event)) {
            assert.equal(active, null, 'deux imprévus à la fois')
            active = e.event
          }
        }
        if (e.kind === 'event-end') active = null
      }
    }
    assert.ok(count >= 2, `graine ${seed} : ${count} imprévus`)
  }
  // La même graine, les mêmes imprévus : tout le monde vit le même service.
  assert.deepEqual(timeline(3), timeline(3))
})

test('panne de courant : les cuissons s\'arrêtent où elles en sont, puis reprennent', () => {
  const k = service(1, ['escargots-irukama'])
  k.waitOrder()
  must(k.use('a', 'frigo', 'escargots-irukama'))
  must(k.use('a', 'plonge'))
  must(k.work('a', 'plonge'))
  k.advance(PROCESSES.rincer.duration + 0.2)
  must(k.use('a', 'plonge'))
  must(k.use('a', 'poele-1'))
  must(k.work('a', 'poele-1'))
  k.advance(2)
  k.state.event = { kind: 'outage', at: k.now, until: k.now + RULES.events.outage * 1000 }
  k.state.nextEventAt = Infinity
  k.advance(RULES.events.outage - 0.5)
  assert.equal(k.state.stations['poele-1'].done, false, 'cuit pendant la panne')
  k.advance(1)
  assert.equal(k.state.event, null)
  assert.ok(k.events.some((e) => e.kind === 'event-end' && e.event === 'outage'))
  // Il restait 3 s de cuisson avant la panne : elles restent à faire.
  k.advance(PROCESSES.poele.duration - 2 - 0.6)
  assert.equal(k.state.stations['poele-1'].done, false)
  k.advance(0.8)
  assert.equal(k.state.stations['poele-1'].done, true)
})

test('plonge bouchée : on y pose, mais on n\'y rince plus, et le guidage ne l\'y envoie pas', () => {
  const k = service(1, ['escargots-irukama'])
  k.waitOrder()
  k.state.event = { kind: 'sink', at: k.now, until: k.now + RULES.events.sink * 1000 }
  k.state.nextEventAt = Infinity
  assert.ok(isBlocked(k.state, 'plonge'))
  must(k.use('a', 'frigo', 'escargots-irukama'))
  assert.notEqual(guide(k.state, 'a')?.stations?.[0], 'plonge')
  must(k.use('a', 'plonge'))
  assert.equal(resolveAction(k.state, 'a', 'plonge').work, null)
  assert.equal(k.work('a', 'plonge').ok, false)
  k.advance(RULES.events.sink + 0.2)
  assert.equal(isBlocked(k.state, 'plonge'), false)
  must(k.work('a', 'plonge'))
})

test('plateau renversé : la passe refuse les plats tant qu\'on ne l\'a pas nettoyée', () => {
  const k = service(1, ['cafe-goman'])
  k.waitOrder()
  must(k.use('a', 'garde-manger', 'cafe-goman'))
  must(k.use('a', 'fontaine'))
  must(k.work('a', 'fontaine'))
  k.advance(PROCESSES.infuser.duration + 0.2)
  must(k.use('a', 'fontaine'))
  k.state.event = { kind: 'spill', at: k.now, progress: 0 }
  k.state.nextEventAt = Infinity
  // La tasse en main : la passe la refuse, et le guidage la fait poser.
  assert.equal(resolveAction(k.state, 'a', 'passe').use, null)
  assert.equal(guide(k.state, 'a').step, 'put')
  must(k.use('a', 'comptoir-1'))
  // Les mains vides : on nettoie (Espace) ; s'éloigner arrête le geste.
  assert.deepEqual(guide(k.state, 'a'), { step: 'clean', stations: ['passe'] })
  must(k.work('a', 'passe'))
  k.near = () => false
  k.advance(0.5)
  assert.equal(k.state.work.a, undefined)
  k.near = () => true
  must(k.work('a', 'passe'))
  k.advance(RULES.events.clean + 0.2)
  assert.equal(k.state.event, null)
  assert.ok(k.events.some((e) => e.kind === 'event-end' && e.event === 'spill' && e.by === 'a'))
  must(k.use('a', 'comptoir-1'))
  must(k.use('a', 'passe'))
  assert.equal(k.state.served, 1)
})

test('l\'amiral à bord : un bon plus pressé, qui rapporte le double ; le coup de feu : deux bons d\'un coup', () => {
  const pick = (kind) => {
    for (let seed = 1; seed < 400; seed++) {
      const k = service(1, ['cafe-goman'], seed)
      k.advance(RULES.events.first + 0.2)
      if (k.events.some((e) => e.kind === 'event' && e.event === kind)) return k
    }
    return null
  }
  const vip = pick('vip')
  assert.ok(vip, 'jamais d\'amiral')
  const order = vip.state.orders.find((o) => o.vip)
  assert.ok(order)
  const normal = vip.state.orders.find((o) => !o.vip)
  assert.ok(order.until - order.at < normal.until - normal.at)
  // Le café de l'amiral, servi : deux fois les points d'un café ordinaire (au même bonus et combo).
  const before = vip.state.orders.filter((o) => o.status === 'pending' && !o.vip)
  for (const o of before) o.status = 'expired'
  must(vip.use('a', 'garde-manger', 'cafe-goman'))
  must(vip.use('a', 'fontaine'))
  must(vip.work('a', 'fontaine'))
  vip.advance(PROCESSES.infuser.duration + 0.2)
  must(vip.use('a', 'fontaine'))
  must(vip.use('a', 'passe'))
  const served = vip.events.find((e) => e.kind === 'served')
  assert.equal(served.vip, true)
  assert.ok(served.points >= 2 * 20)
  const rush = pick('rush')
  assert.ok(rush, 'jamais de coup de feu')
  const at = rush.events.find((e) => e.kind === 'event' && e.event === 'rush')
  const i = rush.events.indexOf(at)
  assert.equal(rush.events.slice(i + 1, i + 3).filter((e) => e.kind === 'order').length, 2)
})

test('à deux, le coin du frigo ne fait plus presque tout : chacun sa part du travail', () => {
  const share = { a: 0, b: 0 }
  for (const seed of [1, 2, 3, 4]) {
    const k = service(2, undefined, seed)
    while (k.state.status === 'running') {
      k.advance(1)
      for (const pid of ['a', 'b']) {
        if (k.state.work[pid]) { share[pid]++; continue }
        const g = guide(k.state, pid)
        if (!g?.stations.length) continue
        const r = ['work', 'start', 'clean'].includes(g.step) ? k.work(pid, g.stations[0]) : k.use(pid, g.stations[0], g.ing)
        if (r.ok) share[pid]++
      }
    }
  }
  const total = share.a + share.b
  for (const pid of ['a', 'b']) assert.ok(share[pid] / total > 0.4 && share[pid] / total < 0.6, `${pid} : ${Math.round((share[pid] / total) * 100)} %`)
})

test('un service fini n\'a plus d\'imprévu', () => {
  const k = service(1)
  k.advance(RULES.service + 1)
  assert.equal(k.state.status, 'ended')
  assert.deepEqual(stepService(k.state, k.now + 100000, 0.1, () => true), [])
})
