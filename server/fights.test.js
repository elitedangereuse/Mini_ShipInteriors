import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { io as connect } from 'socket.io-client'
import { attachRelay, WS_PATH } from './relay.js'
import { FightSimulation } from '../shared/fight.js'

const pad = (held = [], pressed = []) => ({ held: new Set(held), pressed: new Set(pressed) })
const advance = (game, seconds, input = pad()) => { for (let i = 0; i < Math.round(seconds * 120); i++) game.step(1 / 120, i ? { ...input, pressed: new Set(), ...(input.second ? { second: { ...input.second, pressed: new Set() } } : {}) } : input) }
const ready = () => { const g = new FightSimulation('versus'); advance(g, 2); g.fighters[0].x = 200; g.fighters[1].x = 240; return g }

test('un coup inflige une seule fois ses dégâts ; hors portée il ne touche pas', () => {
  const g = ready(); advance(g, 0.4, pad([], ['a'])); assert.equal(g.fighters[1].hp, 92)
  g.fighters[1].x = 420; advance(g, 0.5, pad([], ['b'])); assert.equal(g.fighters[1].hp, 92)
})
test('reculer bloque ; un coup bas exige une garde basse', () => {
  const g = ready(); g.fighters[1].x = 235; const input = pad([], ['a']); input.second = pad(['right'])
  advance(g, 0.4, input); assert.equal(g.fighters[1].hp, 99)
  const low = ready(); const p = pad(['down'], ['b']); p.second = pad(['right'])
  advance(low, 0.5, p); assert.equal(low.fighters[1].hp, 86)
})
test('les attaques simultanées touchent les deux combattants', () => {
  const g = ready(); const p = pad([], ['a']); p.second = pad([], ['a'])
  // Relâcher les deux fronts après la première image.
  g.step(1 / 120, p); advance(g, 0.35)
  assert.equal(g.fighters[0].hp, 92); assert.equal(g.fighters[1].hp, 92)
})
test('le plasma consomme la jauge et le saut permet de l’éviter', () => {
  const g = ready(); g.fighters[1].x = 310
  const p = pad([], ['c']); g.step(1 / 120, p); advance(g, 0.32)
  const jump = pad(); jump.second = pad([], ['up']); g.step(1 / 120, jump); advance(g, 0.5)
  assert.equal(g.fighters[1].hp, 100); assert.ok(g.fighters[0].energy < 25)
})
test('un KO et un timeout départagent les manches ; deux victoires terminent le match', () => {
  const g = ready(); g.fighters[1].hp = 8; advance(g, 0.2, pad([], ['a']))
  assert.equal(g.phase, 'round'); assert.equal(g.fighters[0].wins, 1)
  advance(g, 4.5); assert.equal(g.phase, 'fight'); assert.equal(g.fighters[1].hp, 100)
  g.fighters[1].hp = 50; g.remaining = 0.01; advance(g, 2.3)
  assert.equal(g.over, true); assert.equal(g.winner, 0)
})
test('une égalité rejoue la manche sans attribuer de victoire', () => {
  const g = ready(); g.remaining = 0.01; advance(g, 0.1)
  assert.equal(g.roundWinner, null); assert.deepEqual(g.fighters.map(f => f.wins), [0, 0])
})
test('les entrées très brèves survivent jusqu’au prochain pas de simulation', () => {
  const g = ready(); g.step(1 / 240, pad([], ['a'])); g.step(1 / 240, pad()); advance(g, 0.3)
  assert.equal(g.fighters[1].hp, 92)
})
test('le mode solo attaque et une démonstration se termine sans intervention', () => {
  const solo = new FightSimulation('solo'); advance(solo, 20); assert.ok(solo.fighters[0].hp < 100 || solo.fighters[1].wins > 0)
  const demo = new FightSimulation('demo'); advance(demo, 240); assert.equal(demo.over, true)
})

let relay, url
const clients = []
before(async () => {
  const http = createServer(); relay = attachRelay(http, { log() {}, error() {} })
  http.listen(0, '127.0.0.1'); await once(http, 'listening'); url = `http://127.0.0.1:${http.address().port}`
})
after(() => { clients.forEach(c => c.disconnect()); relay.close() })
const next = (socket, event, predicate = () => true) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { socket.off(event, listener); reject(new Error(`Timeout: ${event}`)) }, 4000)
  const listener = msg => { if (predicate(msg)) { clearTimeout(timeout); socket.off(event, listener); resolve(msg) } }
  socket.on(event, listener)
})
const client = async name => {
  const s = connect(url, { path: WS_PATH, auth: { name, skin: 'robot.g' }, reconnection: false, forceNew: true })
  clients.push(s); const welcome = await next(s, 'welcome'); s.playerId = welcome.id
  s.emit('state', { x: 16.5, z: 7, yaw: 0, level: 0, pose: 'arcade', anim: 'idle' }); return s
}

test('deux clients rejoignent le même duel, partagent la simulation et libèrent la borne', async () => {
  const a = await client('Nova'), b = await client('Vesper'), c = await client('Spectateur')
  const waiting = next(a, 'fight:state', s => s.status === 'waiting'); a.emit('fight:join'); assert.equal((await waiting).players.length, 1)
  const playingA = next(a, 'fight:state', s => s.status === 'playing'), playingB = next(b, 'fight:state', s => s.status === 'playing')
  b.emit('fight:join'); const [sa, sb] = await Promise.all([playingA, playingB]); assert.deepEqual(sa, sb)
  const full = next(c, 'fight:error'); c.emit('fight:join'); assert.equal((await full).code, 'full')
  // Un spectateur ne peut pas envoyer les commandes d'un combattant.
  c.emit('fight:input', { session: sa.session, held: ['left'], pressed: ['c'] })
  const active = await next(a, 'fight:state', s => s.snapshot.phase === 'fight')
  assert.ok(active.snapshot.fighters[0].energy >= 40)
  const moved = next(b, 'fight:state', s => s.snapshot.fighters[0].x > 132)
  a.emit('fight:input', { session: sa.session, held: ['right'], pressed: [], hp: 0, winner: 0 }); await moved
  const staleRelease = await next(b, 'fight:state', s => s.snapshot.remaining < 59.4)
  assert.ok(staleRelease.snapshot.fighters[0].x < 185, 'une commande perdue ne reste pas tenue')
  const left = next(a, 'fight:state', s => s.status === 'waiting'); b.disconnect(); const state = await left
  assert.equal(state.snapshot, null); assert.equal(state.players[0].id, a.playerId)
  const joined = next(a, 'fight:state', s => s.status === 'playing'); c.emit('fight:join'); await joined
  const movedDeck = next(c, 'fight:state', s => s.status === 'waiting'); a.emit('state', { x: 1, z: 1, yaw: 0, level: -1 }); await movedDeck
  a.disconnect(); c.disconnect()
})

test('la revanche attend les deux accords et les cabines restent séparées', async t => {
  const { fightRelay } = await import('./fights.js')
  const { EventEmitter } = await import('node:events')
  let clock = 0, tick
  const epoch = Date.now()
  t.mock.method(Date, 'now', () => epoch + clock)
  t.mock.method(performance, 'now', () => clock)
  t.mock.method(globalThis, 'setInterval', callback => { tick = callback; return { unref() {} } })
  t.mock.method(globalThis, 'clearInterval', () => {})
  const players = new Map(), sockets = new Map()
  const manager = fightRelay(id => players.get(id), id => sockets.get(id))
  const add = (id, cabin) => {
    const player = { id, name: `Player ${id}`, level: 1, cabin }
    const socket = new EventEmitter(); socket.on('fight:state', s => { socket.state = s })
    players.set(id, player); sockets.set(id, socket); manager.connect(socket, player); socket.emit('fight:join'); return socket
  }
  const a = add(1, 1), isolated = add(2, 2)
  assert.equal(a.state.status, 'waiting'); assert.equal(isolated.state.status, 'waiting')
  const b = add(3, 1); assert.equal(a.state.status, 'playing')
  for (let frame = 0; frame < 20000 && a.state.status !== 'ended'; frame++) {
    const session = a.state.session
    a.emit('fight:input', { session, held: ['right'], pressed: ['b'] })
    b.emit('fight:input', { session, held: [], pressed: [] })
    clock += 1000 / 60; tick()
  }
  assert.equal(a.state.status, 'ended'); assert.equal(a.state.snapshot.winner, 0)
  const previous = a.state.session
  a.emit('fight:rematch'); assert.equal(a.state.session, previous); assert.equal(a.state.status, 'ended')
  b.emit('fight:rematch'); assert.ok(a.state.session > previous); assert.equal(a.state.status, 'playing')
  assert.deepEqual(a.state.snapshot.fighters.map(f => f.wins), [0, 0])
  assert.equal(isolated.state.status, 'waiting')
  for (const player of players.values()) manager.leave(player)
})
