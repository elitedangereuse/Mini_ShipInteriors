// MESS RUSH côté relais (server/mess-rush.js, server/lobby.js) : salons au vrai mess, départ,
// positions plausibles, actions arbitrées au poste, actions simultanées, fin de service, abandon,
// coupure et reprise par ticket, présentation au site des seules victoires.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REWARD_RETRIES, createMessRush, inMessLobby } from './mess-rush.js'
import { MESS_LEVEL, RULES, STATION_BY_ID, serviceView } from '../shared/mess-rush.js'
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
  /**
   * Le joueur va (en deux secondes) devant un poste : au mur du fond, aux murs ouest et est, devant le
   * comptoir du nord ; `dx` : un peu de côté (deux joueurs au même poste).
   */
  const goto = (p, stationId, dx = 0) => {
    const s = STATION_BY_ID[stationId]
    const x = s.x < 8.3 ? 8.6 : s.x > 16.8 ? 16.4 : s.x + dx
    const z = s.z > 11.5 ? 11.3 : s.z < 8.4 ? 8.85 : s.z
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
  // Loin de la caisse de lapin (au bout de la cuisine, devant la plonge).
  h.goto(a, 'plonge')
  h.mess.handle(a, 'mess:use', { station: 'caisse-lapin' })
  assert.deepEqual(h.last(1, 'mess:refused'), { game: h.mess.gameOf(a).id, station: 'caisse-lapin', code: 'far' })
  h.goto(a, 'caisse-lapin')
  const before = h.all(2, 'mess:state').length
  h.mess.handle(a, 'mess:use', { station: 'caisse-lapin' })
  h.advance(0.1)
  const state = h.last(2, 'mess:state')
  assert.ok(h.all(2, 'mess:state').length > before)
  assert.ok(state.state.hands['1'])
  // Un poste inconnu, ou une action invalide : refusée avec son code.
  h.mess.handle(a, 'mess:use', { station: 'nulle-part' })
  h.mess.handle(a, 'mess:use', { station: 'caisse-lapin' })
  assert.equal(h.last(1, 'mess:refused').code, 'state')
})

test('à deux, chacun arrive à sa place, et va où il veut dans la cuisine ouverte', () => {
  const h = harness()
  const { members: [a, b] } = h.team(1, 2)
  h.launch([a, b])
  const [sa, sb] = [h.last(1, 'mess:start').spawn, h.last(2, 'mess:start').spawn]
  assert.ok(Math.hypot(sa.x - sb.x, sa.z - sb.z) > 1)
  h.advance(2)
  // Pas de cloison : chacun traverse toute la cuisine (à la vitesse d'une course).
  assert.equal(h.mess.accepts(a, sa.x + 2.5, sa.z), true)
  assert.equal(h.mess.accepts(b, sb.x - 2.5, sb.z), true)
})

test('deux joueurs prennent le même objet en même temps : un seul l\'a', () => {
  const h = harness()
  const { members: [a, b] } = h.team(1, 2)
  const game = h.launch([a, b])
  h.advance(RULES.firstOrder + 0.2)
  h.goto(a, 'caisse-lapin')
  h.mess.handle(a, 'mess:use', { station: 'caisse-lapin' })
  // Un comptoir du nord : chacun s'y tient, côte à côte.
  h.goto(a, 'comptoir-n3', -0.4)
  h.mess.handle(a, 'mess:use', { station: 'comptoir-n3' })
  h.goto(b, 'comptoir-n3', 0.4)
  const item = game.state.stations['comptoir-n3'].item
  assert.ok(item)
  // Les deux demandes arrivent avant le pas suivant.
  h.mess.handle(a, 'mess:use', { station: 'comptoir-n3' })
  h.mess.handle(b, 'mess:use', { station: 'comptoir-n3' })
  assert.equal(game.state.hands['1'], item)
  assert.equal(game.state.hands['2'] ?? null, null)
  assert.equal(h.last(2, 'mess:refused').code, 'state')
})

test('un geste n\'avance que si le joueur reste au poste', () => {
  const h = harness()
  const { members: [a] } = h.team(1)
  const game = h.launch([a])
  h.advance(RULES.firstOrder + 0.2)
  h.goto(a, 'caisse-crevettes')
  h.mess.handle(a, 'mess:use', { station: 'caisse-crevettes' })
  h.goto(a, 'plan-1')
  h.mess.handle(a, 'mess:use', { station: 'plan-1' })
  // La même touche coupe (le relais accepte encore `mess:work`, l'ancienne seconde touche).
  h.mess.handle(a, 'mess:work', { station: 'plan-1' })
  h.advance(1)
  const krill = game.state.items[game.state.stations['plan-1'].item]
  assert.ok(krill.progress > 0.8)
  // Parti à la passe : le geste s'arrête.
  h.goto(a, 'passe')
  h.advance(2)
  assert.equal(krill.step, 0)
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
  // Le même résultat pour l'invité, à ceci près que sa victoire ne part pas au site.
  assert.equal(end.rewarding, true)
  assert.deepEqual(h.last(99, 'mess:end'), { ...end, rewarding: false })
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
  // Rentrés au mess, ils n'attendent pas de résultat ; le service, lui, est clos sans en avoir.
  assert.ok(h.last(2, 'mess:left'))
  assert.equal(h.last(2, 'mess:end'), undefined)
  assert.equal(h.mess.gameOf(b), null)
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
  h.goto(a, 'caisse-lapin')
  h.mess.handle(a, 'mess:use', { station: 'caisse-lapin' })
  const held = game.state.hands['1']
  const { ticket } = h.last(1, 'mess:start')
  h.mess.leave(a)
  assert.equal(game.state.stations['comptoir-so'].item, held)
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

test('serveur de dev seulement : `mess:debug` raccourcit le service et choisit les recettes', () => {
  const prod = harness()
  const { members: [a] } = prod.team(1)
  const game = prod.launch([a])
  const endsAt = game.state.endsAt
  prod.mess.handle(a, 'mess:debug', { endIn: 5 })
  assert.equal(game.state.endsAt, endsAt)
  const dev = harness({ debug: true })
  const { members: [b] } = dev.team(1)
  const g = dev.launch([b])
  dev.mess.handle(b, 'mess:debug', { endIn: 5, recipes: ['lapin-pommes', 'inconnue', 'constructor', '__proto__', 'toString'], score: RULES.medals[1][0] })
  assert.deepEqual(g.state.recipes, ['lapin-pommes'])
  assert.equal(g.state.score, RULES.medals[1][0])
  dev.advance(5.2)
  assert.equal(dev.last(b.id, 'mess:end').medal, 'bronze')
})

test('à quatre : le rythme de quatre ; qui quitte rejoint un autre salon, l\'équipe continue', () => {
  const h = harness()
  const { members } = h.team(1, 2, 3, 4)
  const game = h.launch(members)
  assert.equal(game.state.players, 4)
  assert.equal(h.last(4, 'mess:start').state.players, 4)
  // Cinq commandes au plus, une toutes les 13 s (sans imprévu : un coup de feu en ajouterait).
  game.state.eventPlan = []
  h.advance(RULES.firstOrder + 0.2 + RULES.byPlayers[4].every * 4)
  assert.equal(game.state.orders.filter((o) => o.status === 'pending').length, 5)
  // Le quatrième abandonne : il rentre au mess, et peut prendre un autre salon.
  const [, , , d] = members
  h.mess.handle(d, 'mess:quit')
  assert.ok(h.last(4, 'mess:left'))
  Object.assign(d, { level: 0, x: 12, z: 8 })
  h.mess.moved(d)
  h.mess.handle(d, 'mess:join', { team: 2 })
  const lobby = h.mess.snapshot().teams
  assert.deepEqual(lobby[1].members.map((m) => m.id), [4])
  assert.deepEqual(lobby[0].members.map((m) => m.id), [1, 2, 3])
  // Les trois autres cuisinent toujours, entre eux.
  assert.equal(h.mess.gameOf(members[0]), game)
  assert.deepEqual([...h.mess.mates(members[0])].sort(), [1, 2, 3])
})

test('deux livraisons au même instant, pour deux commandes de la même recette : chacune la sienne', () => {
  const h = harness()
  const { members: [a, b] } = h.team(1, 2)
  const game = h.launch([a, b])
  game.state.recipes = ['crevettes-pommes']
  game.state.guests = []
  // Cuisine ouverte (après un départ) : les deux atteignent la passe.
  game.state.open = true
  h.advance(RULES.firstOrder + 0.2 + RULES.byPlayers[2].every)
  const pending = game.state.orders.filter((o) => o.status === 'pending')
  assert.equal(pending.length, 2)
  for (const [pid, id] of [['1', 'x1'], ['2', 'x2']]) {
    game.state.items[id] = { id, kind: 'plate', contents: [['crevettes-baltahsine', 'saisi'], ['pommes-aerial', 'coupé']] }
    game.state.hands[pid] = id
  }
  h.goto(a, 'passe')
  h.goto(b, 'passe', 0.4)
  h.mess.handle(a, 'mess:use', { station: 'passe' })
  h.mess.handle(b, 'mess:use', { station: 'passe' })
  assert.deepEqual(pending.map((o) => o.status), ['served', 'served'])
  assert.equal(game.state.served, 2)
  assert.equal(game.state.combo, 2)
  // Une troisième assiette, sans commande en attente : refusée, elle reste en main.
  game.state.items.x3 = { id: 'x3', kind: 'plate', contents: [['crevettes-baltahsine', 'saisi'], ['pommes-aerial', 'coupé']] }
  game.state.hands['1'] = 'x3'
  h.mess.handle(a, 'mess:use', { station: 'passe' })
  assert.equal(h.last(1, 'mess:refused').code, 'nomatch')
  assert.equal(game.state.hands['1'], 'x3')
})

test('l\'état envoyé à l\'équipe reste léger, même à quatre en plein coup de feu', () => {
  const h = harness()
  const { members } = h.team(1, 2, 3, 4)
  const game = h.launch(members)
  h.advance(RULES.service - 10)
  for (const [i, p] of members.entries()) {
    const id = `p${i}`
    game.state.items[id] = { id, kind: 'plate', contents: [['lapin-ceti', 'mijoté'], ['legumes', 'mijoté']] }
    game.state.hands[String(p.id)] = id
  }
  const size = JSON.stringify(serviceView(game.state)).length
  assert.ok(size < 8000, `${size} octets`)
})

test('le site ne répond pas : la même victoire lui est représentée, puis le joueur apprend que rien n\'est confirmé', async () => {
  const later = []
  let calls = 0
  const h = harness({
    later: (fn, ms) => later.push({ fn, ms }),
    reward: async () => (++calls < 3 ? { status: 'retry' } : { status: 'success', reward: 'booster', boosters: 1, earned: 0, balance: 30000, already: false }),
  })
  const { members: [a] } = h.team(1)
  const game = h.launch([a])
  game.state.score = 5000
  h.advance(RULES.service + 1)
  const flush = () => new Promise((resolve) => setImmediate(resolve))
  await flush()
  assert.deepEqual(later.map((l) => l.ms), [REWARD_RETRIES[0] * 1000])
  later.shift().fn()
  await flush()
  later.shift().fn()
  await flush()
  assert.equal(calls, 3)
  assert.deepEqual(h.last(1, 'mess:reward'), { game: game.id, status: 'success', reward: 'booster', boosters: 1, earned: 0, balance: 30000, already: false })
  // Toujours muet après toutes les tentatives : « rien n'est confirmé ».
  const quiet = harness({ later: (fn) => fn(), reward: async () => ({ status: 'retry' }) })
  const { members: [b] } = quiet.team(1)
  const g = quiet.launch([b])
  g.state.score = 5000
  quiet.advance(RULES.service + 1)
  for (let i = 0; i < 6; i++) await flush()
  assert.deepEqual(quiet.last(1, 'mess:reward'), { game: g.id, status: 'failed' })
})

test('revenu après la fin : le résultat, et la récompense que le site a confirmée entre-temps', async () => {
  const h = harness()
  const { members: [a, b] } = h.team(1, 2)
  const game = h.launch([a, b])
  const { ticket } = h.last(1, 'mess:start')
  // Parti moins d'une minute avant la fin : sa victoire est présentée au site quand même.
  h.advance(RULES.service - 20)
  h.mess.leave(a)
  game.state.score = 5000
  h.advance(21)
  await new Promise((resolve) => setImmediate(resolve))
  const back = h.add(13)
  back.name = a.name
  h.mess.handle(back, 'mess:resume', { game: game.id, ticket })
  assert.equal(h.last(13, 'mess:end').late, true)
  assert.deepEqual(h.last(13, 'mess:reward'), { game: game.id, status: 'success', reward: 'credits', earned: 1000, balance: 31000 })
})

test('quatre salons en service en même temps : chacun sa cuisine, ses commandes, son résultat', () => {
  const h = harness()
  const teams = [[1, 2], [3], [4, 5, 6], [7, 8]].map((ids) => h.team(...ids))
  const games = teams.map((t) => h.launch(t.members))
  assert.equal(new Set(games.map((g) => g.id)).size, 4)
  assert.deepEqual(games.map((g) => g.state.players), [2, 1, 3, 2])
  h.advance(RULES.firstOrder + 0.2)
  // Ce qu'on prend dans une cuisine n'existe pas dans les autres.
  const [a] = teams[0].members
  h.goto(a, 'caisse-lapin')
  h.mess.handle(a, 'mess:use', { station: 'caisse-lapin' })
  assert.ok(games[0].state.hands['1'])
  for (const g of games.slice(1)) assert.equal(Object.values(g.state.hands).filter(Boolean).length, 0)
  // L'équipe de chacun : les siens, pas ceux des autres salons.
  assert.deepEqual([...h.mess.mates(a)].sort(), [1, 2])
  assert.deepEqual([...h.mess.mates(teams[2].members[0])].sort(), [4, 5, 6])
  games[2].state.score = 5000
  h.advance(RULES.service)
  assert.deepEqual([1, 3, 4, 7].map((id) => h.last(id, 'mess:end').game), games.map((g) => g.id))
  assert.equal(h.last(4, 'mess:end').medal, 'gold')
  assert.equal(h.last(1, 'mess:end').medal, 'none')
})

test('après la fin du service, une action en retard est ignorée ; une seule présentation au site par CMDR', async () => {
  const h = harness()
  const { members: [a, b] } = h.team(1, 2)
  const game = h.launch([a, b])
  game.state.score = 5000
  h.advance(RULES.service + 1)
  // L'action arrive après la fin : la partie n'est plus là, rien ne bouge, rien ne casse.
  h.mess.handle(a, 'mess:use', { station: 'passe' })
  h.mess.handle(a, 'mess:quit')
  h.mess.leave(b)
  h.advance(RULES.reconnect + 1)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(h.rewards.map((r) => r.member).sort(), [1, 2])
  assert.equal(h.all(1, 'mess:end').length, 1)
})

test('pendant le compte à rebours : un nouveau venu ou un départ le remettent à zéro', () => {
  const h = harness()
  const { members: [a, b], id } = h.team(1, 2)
  h.mess.handle(a, 'mess:ready', { ready: true })
  h.mess.handle(b, 'mess:ready', { ready: true })
  assert.equal(h.mess.snapshot().teams[id - 1].status, 'countdown')
  h.advance(1)
  h.mess.handle(h.add(3), 'mess:join', { team: id })
  assert.equal(h.mess.snapshot().teams[id - 1].status, 'forming')
  h.advance(RULES.countdown + 1)
  assert.equal(h.mess.gameOf(a), null)
  // Tous prêts de nouveau, puis l'un sort du mess : pas de départ.
  for (const p of [a, b, h.players.get(3)]) h.mess.handle(p, 'mess:ready', { ready: true })
  Object.assign(b, { z: 4 })
  h.mess.moved(b)
  h.advance(RULES.countdown + 1)
  assert.equal(h.mess.gameOf(a), null)
  assert.equal(h.mess.snapshot().teams[id - 1].status, 'forming')
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

test('qui quitte n\'entend plus parler de l\'ancien service, même quand il finit', () => {
  const h = harness()
  const { members: [a, b] } = h.team(1, 2)
  const game = h.launch([a, b])
  h.mess.handle(b, 'mess:quit')
  const since = h.sent.length
  // Il prend un autre salon et lance son propre service.
  Object.assign(b, { level: 0, x: 12, z: 8 })
  h.mess.moved(b)
  h.mess.handle(b, 'mess:join', { team: 2 })
  h.mess.handle(b, 'mess:ready', { ready: true })
  h.advance(RULES.countdown + 0.2)
  h.arrive(b)
  h.advance(RULES.service)
  const old = h.sent.slice(since).filter((m) => m.id === 2 && m.data?.game === game.id)
  assert.deepEqual(old.map((m) => m.event), [])
  assert.ok(h.last(1, 'mess:end', (d) => d.game === game.id))
  assert.ok(h.last(2, 'mess:end', (d) => d.game !== game.id))
})

test('revenu pendant que le site réfléchit : l\'attente, puis sa réponse, à sa nouvelle liaison', async () => {
  let answer
  const h = harness({ reward: () => new Promise((resolve) => (answer = resolve)) })
  const { members: [a] } = h.team(1)
  const game = h.launch([a])
  const { ticket } = h.last(1, 'mess:start')
  game.state.score = 5000
  h.advance(RULES.service + 1)
  assert.equal(h.last(1, 'mess:end').rewarding, true)
  await new Promise((resolve) => setImmediate(resolve))
  // Il recharge la page avant que le site ait répondu.
  h.mess.leave(a)
  const back = h.add(15)
  back.name = a.name
  h.mess.handle(back, 'mess:resume', { game: game.id, ticket })
  assert.deepEqual({ late: h.last(15, 'mess:end').late, rewarding: h.last(15, 'mess:end').rewarding }, { late: true, rewarding: true })
  assert.deepEqual(h.last(15, 'mess:reward'), { game: game.id, status: 'pending' })
  answer({ status: 'success', reward: 'booster', boosters: 1, earned: 0, balance: 30000, already: false })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.last(15, 'mess:reward').status, 'success')
})

test('parti trop longtemps : la victoire de l\'équipe ne lui rapporte rien, et il le sait', () => {
  const h = harness()
  const { members: [a, b] } = h.team(1, 2)
  const game = h.launch([a, b])
  const { ticket } = h.last(1, 'mess:start')
  h.mess.leave(a)
  h.advance(RULES.reconnect + 0.2)
  game.state.score = 5000
  h.advance(RULES.service)
  assert.equal(h.last(2, 'mess:end').rewarding, true)
  const back = h.add(16)
  back.name = a.name
  h.mess.handle(back, 'mess:resume', { game: game.id, ticket })
  assert.deepEqual({ won: h.last(16, 'mess:end').won, rewarding: h.last(16, 'mess:end').rewarding }, { won: true, rewarding: false })
  assert.equal(h.last(16, 'mess:reward'), undefined)
})

test('une rafale de positions ne cumule pas la marge : pas de téléportation d\'un poste à l\'autre', () => {
  const h = harness()
  const { members: [a] } = h.team(1)
  h.launch([a])
  // Huit petits pas au même instant : la marge n'en laisse passer qu'un.
  let accepted = 0
  for (let i = 1; i <= 8; i++) {
    const x = a.x + 0.85
    if (!h.mess.accepts(a, x, a.z)) continue
    accepted++
    Object.assign(a, { x })
    h.mess.moved(a)
  }
  assert.equal(accepted, 1)
  // Une seconde plus tard, une seconde de course (≈ 4,3 m, marge comprise) ; pas davantage.
  h.advance(1)
  assert.ok(h.mess.accepts(a, a.x - 2, a.z))
  Object.assign(a, { x: a.x - 2 })
  h.mess.moved(a)
  assert.ok(h.mess.accepts(a, a.x + 2, a.z))
  Object.assign(a, { x: a.x + 2 })
  h.mess.moved(a)
  assert.equal(h.mess.accepts(a, a.x + 1.5, a.z), false)
})

test('une vraie course passe toujours : dix positions par seconde, et la gigue du réseau', () => {
  const h = harness()
  const { members: [a] } = h.team(1)
  h.launch([a])
  // Des allers-retours dans l'allée, au sprint (3,4 m/s, cf. src/player.ts), une position toutes
  // les 100 ms ; le réseau les livre parfois par paquets de trois, 300 ms plus tard.
  const speed = 3.4
  let x = a.x
  let dir = 1
  let refused = 0
  const queue = []
  for (let i = 0; i < 200; i++) {
    x += dir * speed * 0.1
    if (x > 16.5 || x < 8.5) dir = -dir
    queue.push(x)
    if (i % 7 < 4 || i % 7 === 6) {
      for (const qx of queue.splice(0)) {
        if (!h.mess.accepts(a, qx, a.z)) { refused++; continue }
        Object.assign(a, { x: qx })
        h.mess.moved(a)
      }
    }
    h.advance(0.1)
  }
  assert.equal(refused, 0)
})
