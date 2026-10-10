// L'arène à travers le relais : salon au lobby, départ, isolement de la partie (positions, chat),
// tirs relayés et dégâts comptés.
//   npm test
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { after, afterEach, before, test } from 'node:test'
import { io as connect } from 'socket.io-client'
import { attachRelay, WS_PATH } from './relay.js'
import { ARENA_LEVEL, ARENA_RULES } from '../shared/arena.js'
import { VENT_LEVEL } from '../shared/vents.js'
import { ZONE_LEVEL } from '../shared/salvage.js'
import { TUTORIAL_LEVEL } from '../shared/tutorial.js'
import { WEAPON_STATS } from '../shared/weapons.js'

const site = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json')
  if (req.url.startsWith('/outils/mini-shipinteriors-cinema.php')) return res.end(JSON.stringify({ status: 'success', trailers: [], live: false, liveTitle: '' }))
  res.end(JSON.stringify({ cmdr: null, ljpc: false, voie: false }))
})

let game, url, relay
const clients = []
const listen = async (server) => {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}`
}
before(async () => {
  const siteUrl = await listen(site)
  game = createServer()
  relay = attachRelay(game, { log: () => {}, error: () => {}, cmdrUrl: `${siteUrl}/outils/mini-shipinteriors-cmdr.php` })
  url = await listen(game)
})
afterEach(() => {
  for (const socket of clients.splice(0)) socket.disconnect()
})
after(() => {
  relay.close()
  site.closeAllConnections()
  site.close()
})

function client() {
  const socket = connect(url, { path: WS_PATH, auth: { skin: 'human.male.c' }, extraHeaders: { Origin: url }, reconnection: false, forceNew: true })
  clients.push(socket)
  return socket
}
const welcome = (socket) => new Promise((resolve, reject) => {
  socket.once('welcome', resolve)
  socket.once('connect_error', reject)
})
const next = (socket, event, match = () => true, ms = 8000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`pas de ${event}`)), ms)
  const on = (data) => {
    if (!match(data)) return
    clearTimeout(timer)
    socket.off(event, on)
    resolve(data)
  }
  socket.on(event, on)
})
const silent = (socket, event, match = () => true, ms = 400) => new Promise((resolve, reject) => {
  const on = (data) => { if (match(data)) reject(new Error(`${event} inattendu`)) }
  socket.on(event, on)
  setTimeout(() => { socket.off(event, on); resolve() }, ms)
})
const LOBBY = { x: 24, z: 8, yaw: 0, level: -1, anim: 'idle' }

test('l\'arène a son propre « pont », distinct des autres lieux hors du vaisseau', () => {
  assert.equal(new Set([ARENA_LEVEL, ZONE_LEVEL, VENT_LEVEL, TUTORIAL_LEVEL]).size, 4)
})

test('un salon se forme au lobby, la partie part, et l\'arène reste entre ses joueurs', async () => {
  const a = client(), b = client(), other = client()
  const [wa, wb, wo] = await Promise.all([welcome(a), welcome(b), welcome(other)])
  assert.deepEqual(wa.arena, { rooms: [] })
  a.emit('state', LOBBY)
  b.emit('state', { ...LOBBY, x: 23 })
  await next(other, 'state', (m) => m.id === wb.id)
  const opened = next(b, 'arena:lobby', (m) => m.rooms.length === 1)
  a.emit('arena:create', { weapon: 'pistol' })
  const room = (await opened).rooms[0]
  assert.equal(room.leader, wa.id)
  a.emit('arena:settings', { size: 1, bots: false })
  await next(b, 'arena:lobby', (m) => m.rooms[0].size === 1 && !m.rooms[0].bots)
  b.emit('arena:join', { room: room.id })
  await next(a, 'arena:lobby', (m) => m.rooms[0].members.length === 2)
  const started = Promise.all([next(a, 'arena:start'), next(b, 'arena:start')])
  a.emit('arena:ready', { ready: true })
  b.emit('arena:ready', { ready: true })
  const [sa, sb] = await started
  assert.equal(sa.game, sb.game)
  assert.deepEqual([sa.team, sb.team], [0, 1])

  // Entrée dans l'arène : l'adversaire suit ; le reste du bord apprend seulement qu'il y est.
  const at = (s, yaw = 0) => ({ x: s.spawn.x, z: s.spawn.z, yaw, level: ARENA_LEVEL, anim: 'idle' })
  const seenByFoe = next(b, 'state', (m) => m.id === wa.id && m.level === ARENA_LEVEL)
  const seenByOther = next(other, 'state', (m) => m.id === wa.id && m.level === ARENA_LEVEL)
  a.emit('state', at(sa))
  b.emit('state', at(sb))
  await Promise.all([seenByFoe, seenByOther])
  const foeAgain = next(b, 'state', (m) => m.id === wa.id && m.yaw === 1)
  const quiet = silent(other, 'state', (m) => m.id === wa.id)
  a.emit('state', at(sa, 1))
  await Promise.all([foeAgain, quiet])
  // Le chat de l'arène ne sort pas de la partie.
  const heard = next(b, 'chat', (m) => m.text === 'bien joué')
  const unheard = silent(other, 'chat')
  a.emit('chat', { text: 'bien joué' })
  await Promise.all([heard, unheard])
  // Une position impossible (à l'autre bout de l'arène) est ignorée.
  const ignored = silent(b, 'state', (m) => m.id === wa.id && m.x === 12, 300)
  a.emit('state', { x: 12, z: 0, yaw: 0, level: ARENA_LEVEL, anim: 'idle' })
  await ignored

  // Après le coup d'envoi, un tir est montré à l'adversaire seulement.
  await next(a, 'arena:state', (m) => m.warmup === 0, (ARENA_RULES.warmup + 3) * 1000)
  const shown = next(b, 'arena:event', (m) => m.kind === 'shot' && m.id === wa.id)
  const notMine = silent(a, 'arena:event', (m) => m.kind === 'shot')
  const notTheirs = silent(other, 'arena:event')
  a.emit('arena:fire', { o: [sa.spawn.x, ARENA_RULES.aim, sa.spawn.z], d: [[1, 0, 0]] })
  const shot = await shown
  await Promise.all([notMine, notTheirs])
  assert.equal(shot.weapon, 'pistol')
  assert.equal(shot.d.length, WEAPON_STATS.pistol.pellets)
  assert.ok(wo.id)
})
