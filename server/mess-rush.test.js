// MESS RUSH côté relais (server/mess-rush.js, server/lobby.js) : salons au vrai mess, départ,
// positions plausibles, actions arbitrées au poste, actions simultanées, fin de service, abandon,
// coupure et reprise par ticket, présentation au site des seules victoires.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMessRush, inMessLobby } from './mess-rush.js'
import { MESS_LEVEL, RULES, STATION_BY_ID } from '../shared/mess-rush.js'
import { mulberry32 } from '../shared/salvage.js'

/** Relais simulé : joueurs, horloge, messages envoyés et victoires présentées au site. */
function harness(options = {}) {
  let t = 1_000_000
  const seeds = mulberry32(20261014)
  const players = new Map()
  const sent = []
  const broadcasts = []
  const rewards = []
  const mess = createMessRush({
    playerById: (id) => players.get(id),
    emit: (id, event, data) => sent.push({ id, event, data }),
    broadcast: (event, data) => broadcasts.push({ event, data }),
    reward: async (member, result) => {
      rewards.push({ member: member.id, result })
      return { status: 'success', reward: 'credits', earned: 1000, balance: 31000 }
    },
    now: () => t,
    seed: () => Math.floor(seeds() * 0xffffffff),
    ...options,
  })
  const add = (id, verified = true) => {
    const p = { id, name: `CMDR ${id}`, verified, level: 0, x: 12, z: 8, anim: 'idle', cookie: verified ? `ED_LOGGED_CMDR_ID=jeton-${id}` : null }
    players.set(id, p)
    return p
  }
  const advance = (seconds) => {
    for (let i = 0; i < Math.round(seconds * 10); i++) {
      t += 100
      mess.tick()
    }
  }
  const last = (id, event, match = () => true) => [...sent].reverse().find((m) => m.id === id && m.event === event && match(m.data))?.data
  const all = (id, event) => sent.filter((m) => m.id === id && m.event === event).map((m) => m.data)
  /** Le joueur arrive dans la cuisine, à son point d'arrivée. */
  const arrive = (p) => {
    const start = last(p.id, 'mess:start')
    Object.assign(p, { level: MESS_LEVEL, x: start.spawn.x, z: start.spawn.z })
    assert.ok(mess.accepts(p, p.x, p.z))
    mess.moved(p)
  }
  /** Le joueur va (en deux secondes) devant un poste. */
  const goto = (p, stationId) => {
    const s = STATION_BY_ID[stationId]
    const x = s.x
    const z = s.z > 11 ? 11.3 : s.z > 9 ? 10 : s.z + 0.8
    t += 2000
    assert.ok(mess.accepts(p, x, z), `vers ${stationId}`)
    Object.assign(p, { x, z })
    mess.moved(p)
  }
  const team = (...ids) => {
    const members = ids.map((id) => add(id, id !== 99))
    const id = mess.snapshot().teams.find((tm) => !tm.members.length).id
    for (const p of members) mess.handle(p, 'mess:join', { team: id })
    return { members, id }
  }
  const launch = (members) => {
    for (const p of members) mess.handle(p, 'mess:ready', { ready: true })
    advance(RULES.countdown + 0.2)
    for (const p of members) arrive(p)
    return mess.gameOf(members[0])
  }
  return { mess, players, sent, broadcasts, rewards, add, advance, last, all, arrive, goto, team, launch, now: () => t }
}

test('le salon se tient au vrai mess du pont principal', () => {
  assert.equal(inMessLobby({ level: 0, x: 12, z: 8 }), true)
  assert.equal(inMessLobby({ level: 0, x: 12, z: 4 }), false)
  assert.equal(inMessLobby({ level: -1, x: 12, z: 8 }), false)
  assert.equal(inMessLobby({ level: MESS_LEVEL, x: 12, z: 8 }), false)
})

test('salon : chef au premier arrivé, complet à quatre, prêt remis à zéro, on le quitte en sortant du mess', () => {
  const h = harness()
  const { members: [a, b], id } = h.team(1, 2)
  let lobby = h.mess.snapshot().teams.find((tm) => tm.id === id)
  assert.equal(lobby.leader, 1)
  assert.deepEqual(lobby.members.map((m) => m.id), [1, 2])
  for (const n of [3, 4]) h.mess.handle(h.add(n), 'mess:join', { team: id })
  h.mess.handle(h.add(5), 'mess:join', { team: id })
  assert.deepEqual(h.last(5, 'mess:error'), { code: 'full' })
  // Hors du mess : pas de salon.
  const away = h.add(6)
  Object.assign(away, { x: 12, z: 4 })
  h.mess.handle(away, 'mess:join', { team: 2 })
  assert.deepEqual(h.last(6, 'mess:error'), { code: 'lobby' })
  // Prêt, puis quelqu'un part : tout le monde redit qu'il est prêt.
  h.mess.handle(a, 'mess:ready', { ready: true })
  Object.assign(b, { z: 4 })
  h.mess.moved(b)
  lobby = h.mess.snapshot().teams.find((tm) => tm.id === id)
  assert.deepEqual(lobby.members.map((m) => m.id), [1, 3, 4])
  assert.ok(lobby.members.every((m) => !m.ready))
  // Le chef part : le suivant prend sa place.
  h.mess.handle(a, 'mess:leave')
  assert.equal(h.mess.snapshot().teams.find((tm) => tm.id === id).leader, 3)
})

test('tous prêts : compte à rebours, départ, arrivée dans la cuisine, positions plausibles seulement', () => {
  const h = harness()
  const { members: [a, b] } = h.team(1, 2)
  h.mess.handle(a, 'mess:ready', { ready: true })
  h.mess.handle(b, 'mess:ready', { ready: true })
  assert.equal(h.mess.snapshot().teams[0].status, 'countdown')
  h.advance(RULES.countdown + 0.2)
  const start = h.last(1, 'mess:start')
  assert.ok(start.ticket && start.game && start.state)
  assert.equal(start.state.players, 2)
  assert.notEqual(h.last(2, 'mess:start').ticket, start.ticket)
  assert.equal(h.mess.snapshot().teams[0].status, 'playing')
  // Arrivée : près de son point d'arrivée seulement.
  assert.equal(h.mess.accepts({ ...a, level: MESS_LEVEL }, 16, 6), false)
  h.arrive(a)
  h.arrive(b)
  // Hors du sol, ou plus vite qu'on ne court : refusé.
  assert.equal(h.mess.accepts(a, 20, 10), false)
  assert.equal(h.mess.accepts(a, 16.5, 5.2), false)
  // Un joueur qui n'est pas de la partie n'a rien à faire dans la cuisine.
  assert.equal(h.mess.accepts({ ...h.add(7), level: MESS_LEVEL }, 12, 10.6), false)
})

test('une action loin du poste est refusée ; au poste, elle passe et l\'état part à l\'équipe', () => {
  const h = harness()
  const { members: [a, b] } = h.team(1, 2)
  h.launch([a, b])
  h.advance(RULES.firstOrder + 0.2)
  // Loin du frigo (à l'autre bout de l'allée).
  h.goto(a, 'plonge')
  h.mess.handle(a, 'mess:use', { station: 'frigo' })
  assert.deepEqual(h.last(1, 'mess:refused'), { game: h.mess.gameOf(a).id, station: 'frigo', code: 'far' })
  h.goto(a, 'frigo')
  const before = h.all(2, 'mess:state').length
  h.mess.handle(a, 'mess:use', { station: 'frigo' })
  h.advance(0.1)
  const state = h.last(2, 'mess:state')
  assert.ok(h.all(2, 'mess:state').length > before)
  assert.ok(state.state.hands['1'])
  // Un poste inconnu, ou une action invalide : refusée avec son code.
  h.mess.handle(a, 'mess:use', { station: 'nulle-part' })
  h.mess.handle(a, 'mess:use', { station: 'frigo' })
  assert.equal(h.last(1, 'mess:refused').code, 'state')
})

test('deux joueurs prennent le même objet en même temps : un seul l\'a', () => {
  const h = harness()
  const { members: [a, b] } = h.team(1, 2)
  const game = h.launch([a, b])
  h.advance(RULES.firstOrder + 0.2)
  h.goto(a, 'frigo')
  h.mess.handle(a, 'mess:use', { station: 'frigo' })
  h.goto(a, 'comptoir-1')
  h.mess.handle(a, 'mess:use', { station: 'comptoir-1' })
  h.goto(b, 'comptoir-1')
  const item = game.state.stations['comptoir-1'].item
  // Les deux demandes arrivent avant le pas suivant.
  h.mess.handle(a, 'mess:use', { station: 'comptoir-1' })
  h.mess.handle(b, 'mess:use', { station: 'comptoir-1' })
  assert.equal(game.state.hands['1'], item)
  assert.equal(game.state.hands['2'] ?? null, null)
  assert.equal(h.last(2, 'mess:refused').code, 'state')
})

test('un geste n\'avance que si le joueur reste au poste', () => {
  const h = harness()
  const { members: [a] } = h.team(1)
  const game = h.launch([a])
  h.advance(RULES.firstOrder + 0.2)
  h.goto(a, 'frigo')
  h.mess.handle(a, 'mess:use', { station: 'frigo', pick: 'escargots-irukama' })
  h.goto(a, 'plonge')
  h.mess.handle(a, 'mess:use', { station: 'plonge' })
  h.mess.handle(a, 'mess:work', { station: 'plonge' })
  h.advance(1)
  const snail = game.state.items[game.state.stations.plonge.item]
  assert.ok(snail.progress > 0.8)
  // Parti au frigo : le geste s'arrête.
  h.goto(a, 'frigo')
  h.advance(2)
  assert.equal(snail.step, 0)
  assert.equal(game.state.work['1'], undefined)
})

test('fin du service : le résultat à chacun, le salon se reforme, seules les victoires des CMDR vont au site', async () => {
  const h = harness()
  const { members: [a, guest] } = h.team(1, 99)
  const game = h.launch([a, guest])
  // Un score d'or, même après les commandes expirées d'un service où personne ne cuisine.
  game.state.score = 5000
  h.advance(RULES.service + 1)
  const end = h.last(1, 'mess:end')
  assert.equal(end.reason, 'end')
  assert.equal(end.medal, 'gold')
  assert.equal(end.won, true)
  assert.equal(end.duration, RULES.service)
  assert.deepEqual(h.last(99, 'mess:end'), end)
  assert.equal(h.mess.gameOf(a), null)
  const lobby = h.mess.snapshot().teams[0]
  assert.equal(lobby.status, 'forming')
  assert.deepEqual(lobby.members.map((m) => m.id), [1, 99])
  await new Promise((resolve) => setImmediate(resolve))
  // L'invité joue, sans être présenté au site.
  assert.deepEqual(h.rewards.map((r) => r.member), [1])
  // D'abord l'annonce que la récompense est en route, puis ce que le site a confirmé.
  assert.deepEqual(h.all(1, 'mess:reward')[0], { game: end.game, status: 'pending' })
  assert.equal(h.rewards[0].result.game, end.game)
  assert.equal(h.rewards[0].result.endedAt - h.rewards[0].result.startedAt, RULES.service * 1000)
  assert.deepEqual(h.last(1, 'mess:reward'), { game: end.game, status: 'success', reward: 'credits', earned: 1000, balance: 31000 })
})

test('sans site prêt (pas de `reward`), une victoire n\'est présentée à personne', async () => {
  const h = harness({ reward: undefined })
  const { members: [a] } = h.team(1)
  const game = h.launch([a])
  game.state.score = 5000
  h.advance(RULES.service + 1)
  assert.equal(h.last(1, 'mess:end').won, true)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.last(1, 'mess:reward'), undefined)
})

test('une défaite (sans médaille) n\'est pas présentée au site', async () => {
  const h = harness()
  const { members: [a] } = h.team(1)
  h.launch([a])
  h.advance(RULES.service + 1)
  assert.equal(h.last(1, 'mess:end').won, false)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.rewards.length, 0)
})

test('tout le monde quitte le service : abandonné, sans résultat ni site', async () => {
  const h = harness()
  const { members: [a, b] } = h.team(1, 2)
  const game = h.launch([a, b])
  game.state.score = 500
  h.mess.handle(a, 'mess:quit')
  assert.ok(h.last(1, 'mess:left'))
  assert.equal(h.mess.gameOf(b), game)
  // Revenir au vaisseau en plein service : c'est quitter aussi.
  Object.assign(b, { level: 0, x: 12, z: 8 })
  h.mess.moved(b)
  h.advance(0.1)
  assert.equal(h.last(2, 'mess:end').reason, 'abandoned')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.rewards.length, 0)
  // Ceux qui ont quitté ne sont plus du salon.
  assert.equal(h.mess.snapshot().teams[0].members.length, 0)
})

test('coupure : ce qu\'on tenait est posé, la place attend une minute, et l\'on revient avec son ticket', () => {
  const h = harness()
  const { members: [a, b] } = h.team(1, 2)
  const game = h.launch([a, b])
  h.advance(RULES.firstOrder + 0.2)
  h.goto(a, 'frigo')
  h.mess.handle(a, 'mess:use', { station: 'frigo' })
  const held = game.state.hands['1']
  const { ticket } = h.last(1, 'mess:start')
  h.mess.leave(a)
  assert.equal(game.state.stations['comptoir-1'].item, held)
  assert.ok(h.last(2, 'mess:event', (d) => d.events.some((e) => e.kind === 'away')))
  // Un autre ticket : refusé. Le bon : on revient, sous un nouvel identifiant.
  const back = h.add(11)
  back.name = a.name
  h.mess.handle(back, 'mess:resume', { game: game.id, ticket: 'faux' })
  assert.deepEqual(h.last(11, 'mess:error'), { code: 'resume' })
  h.advance(30)
  h.mess.handle(back, 'mess:resume', { game: game.id, ticket })
  const resumed = h.last(11, 'mess:start')
  assert.equal(resumed.resumed, true)
  assert.equal(resumed.you, '11')
  h.arrive(back)
  assert.ok(h.mess.mates(b).has(11))
  assert.equal(h.mess.snapshot().teams[0].members.some((m) => m.id === 11), true)
})

test('coupure trop longue : la place est perdue ; une partie finie se raconte à qui revient', () => {
  const h = harness()
  const { members: [a, b] } = h.team(1, 2)
  const game = h.launch([a, b])
  const { ticket } = h.last(1, 'mess:start')
  h.mess.leave(a)
  h.advance(RULES.reconnect + 0.2)
  assert.ok(h.last(2, 'mess:event', (d) => d.events.some((e) => e.kind === 'gone' && e.by === '1')))
  assert.equal(h.mess.mates(b).has(1), false)
  const back = h.add(12)
  back.name = a.name
  h.mess.handle(back, 'mess:resume', { game: game.id, ticket })
  assert.deepEqual(h.last(12, 'mess:error'), { code: 'resume' })
  // La fin du service, puis un retour : le résultat, en retard.
  h.advance(RULES.service)
  h.mess.handle(back, 'mess:resume', { game: game.id, ticket })
  assert.equal(h.last(12, 'mess:end').late, true)
})

test('arrivée manquée : un membre qui n\'entre pas dans la cuisine à temps est retiré', () => {
  const h = harness()
  const { members: [a, b] } = h.team(1, 2)
  for (const p of [a, b]) h.mess.handle(p, 'mess:ready', { ready: true })
  h.advance(RULES.countdown + 0.2)
  h.arrive(a)
  h.advance(RULES.arrival + 0.2)
  assert.ok(h.last(2, 'mess:left'))
  assert.equal(h.mess.mates(a).has(2), false)
  assert.ok(h.mess.gameOf(a))
})
