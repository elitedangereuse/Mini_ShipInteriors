// MESS RUSH à travers le relais : salon au vrai mess, départ, isolement de la cuisine (positions,
// chat), et actions arbitrées au poste.
//   npm test
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { after, afterEach, before, test } from 'node:test'
import { io as connect } from 'socket.io-client'
import { attachRelay, WS_PATH } from './relay.js'
import { MESS_LEVEL, RULES } from '../shared/mess-rush.js'

const ACCOUNTS = { 'jeton-adam': 'Adam Fauster', 'jeton-rackam': 'Rackam' }
const site = createServer((req, res) => {
  const name = ACCOUNTS[/ED_LOGGED_CMDR_ID=([^;]+)/.exec(req.headers.cookie ?? '')?.[1]] ?? null
  res.setHeader('Content-Type', 'application/json')
  if (req.url.startsWith('/outils/mini-shipinteriors-cinema.php')) return res.end(JSON.stringify({ status: 'success', trailers: [], live: false, liveTitle: '' }))
  res.end(JSON.stringify({ cmdr: name, ljpc: false, voie: false }))
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
  relay = attachRelay(game, { log: () => {}, error: () => {}, cmdrUrl: `${siteUrl}/outils/mini-shipinteriors-cmdr.php`, relaySecret: 'secret-test' })
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

function client(cookie) {
  const socket = connect(url, { path: WS_PATH, auth: { skin: 'human.male.c' }, extraHeaders: { Origin: url, ...(cookie ? { Cookie: cookie } : {}) }, reconnection: false, forceNew: true })
  clients.push(socket)
  return socket
}
const welcome = (socket) => new Promise((resolve, reject) => {
  socket.once('welcome', resolve)
  socket.once('connect_error', reject)
})
const next = (socket, event, match = () => true, ms = 6000) => new Promise((resolve, reject) => {
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
const LOBBY = { x: 12, z: 8, yaw: 0, level: 0, anim: 'idle' }

test('un salon se forme au mess, part en service, et la cuisine reste entre coéquipiers', async () => {
  const adam = client('ED_LOGGED_CMDR_ID=jeton-adam')
  const rackam = client('ED_LOGGED_CMDR_ID=jeton-rackam')
  const other = client()
  const [wa, wr] = await Promise.all([welcome(adam), welcome(rackam), welcome(other)])
  assert.deepEqual(wa.mess.teams.map((t) => [t.id, t.members.length]), [[1, 0], [2, 0], [3, 0], [4, 0]])
  adam.emit('state', LOBBY)
  rackam.emit('state', { ...LOBBY, x: 13 })
  await next(other, 'state', (m) => m.id === wr.id)
  const created = next(rackam, 'mess:lobby', (m) => m.teams[0].members.length === 1)
  adam.emit('mess:join', { team: 1 })
  assert.equal((await created).teams[0].leader, wa.id)
  rackam.emit('mess:join', { team: 1 })
  await next(adam, 'mess:lobby', (m) => m.teams[0]?.members.length === 2)
  const started = Promise.all([next(adam, 'mess:start'), next(rackam, 'mess:start')])
  adam.emit('mess:ready', { ready: true })
  rackam.emit('mess:ready', { ready: true })
  const [sa, sr] = await started
  assert.equal(sa.game, sr.game)
  assert.equal(sa.state.players, 2)

  // Entrée dans la cuisine : le coéquipier suit ; le reste du bord apprend seulement qu'il y est.
  const seenByMate = next(rackam, 'state', (m) => m.id === wa.id && m.level === MESS_LEVEL)
  const seenByOther = next(other, 'state', (m) => m.id === wa.id && m.level === MESS_LEVEL)
  adam.emit('state', { x: sa.spawn.x, z: sa.spawn.z, yaw: 0, level: MESS_LEVEL, anim: 'idle' })
  rackam.emit('state', { x: sr.spawn.x, z: sr.spawn.z, yaw: 0, level: MESS_LEVEL, anim: 'idle' })
  await Promise.all([seenByMate, seenByOther])
  const mateAgain = next(rackam, 'state', (m) => m.id === wa.id && m.yaw === 1)
  const quiet = silent(other, 'state', (m) => m.id === wa.id)
  adam.emit('state', { x: sa.spawn.x, z: sa.spawn.z, yaw: 1, level: MESS_LEVEL, anim: 'idle' })
  await Promise.all([mateAgain, quiet])

  // Le chat de la cuisine ne sort pas de l'équipe.
  const heard = next(rackam, 'chat', (m) => m.text === 'deux ragoûts, ça presse')
  const unheard = silent(other, 'chat')
  adam.emit('chat', { text: 'deux ragoûts, ça presse' })
  await Promise.all([heard, unheard])

  // Au frigo (dans l'allée, devant lui), après la première commande : on prend un ingrédient,
  // et l'équipe le voit dans ses mains.
  await next(adam, 'mess:event', (m) => m.events.some((e) => e.kind === 'order'), RULES.firstOrder * 1000 + 3000)
  adam.emit('state', { x: 8.6, z: 11.2, yaw: 0, level: MESS_LEVEL, anim: 'idle' })
  await next(rackam, 'state', (m) => m.id === wa.id && m.x === 8.6)
  const held = next(rackam, 'mess:state', (m) => !!m.state.hands[String(wa.id)])
  adam.emit('mess:use', { station: 'frigo' })
  await held
  // Loin du poste : refusé.
  const refused = next(rackam, 'mess:refused')
  rackam.emit('mess:use', { station: 'frigo' })
  assert.equal((await refused).code, 'far')
})
