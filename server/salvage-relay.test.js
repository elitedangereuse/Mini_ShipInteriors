// Zone thargoïde à travers le relais : équipe au lobby, départ, isolement de la baie (positions,
// chat), et résultat transmis au site avec la clé du relais.
//   npm test
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { after, afterEach, before, test } from 'node:test'
import { io as connect } from 'socket.io-client'
import { attachRelay, WS_PATH } from './relay.js'
import { postSalvageResult } from './site.js'
import { findPath, generateZone, RULES, ZONE_LEVEL } from '../shared/salvage.js'

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
const LOBBY = { x: 22, z: 5, yaw: 0, level: -1, anim: 'idle' }

test('une équipe se forme au lobby, part en mission, et la baie reste entre coéquipiers', async () => {
  const adam = client('ED_LOGGED_CMDR_ID=jeton-adam')
  const rackam = client('ED_LOGGED_CMDR_ID=jeton-rackam')
  const other = client()
  const [wa, wr, wo] = await Promise.all([welcome(adam), welcome(rackam), welcome(other)])
  assert.deepEqual(wa.salvage.teams.map((t) => [t.id, t.members.length]), [[1, 0], [2, 0], [3, 0], [4, 0]])
  adam.emit('state', LOBBY)
  rackam.emit('state', { ...LOBBY, x: 23 })
  await next(other, 'state', (m) => m.id === wr.id)
  const created = next(rackam, 'salvage:lobby', (m) => m.teams[0].members.length === 1)
  adam.emit('salvage:join', { team: 1 })
  const team = (await created).teams[0]
  assert.equal(team.leader, wa.id)
  rackam.emit('salvage:join', { team: team.id })
  await next(adam, 'salvage:lobby', (m) => m.teams[0]?.members.length === 2)
  const started = Promise.all([next(adam, 'salvage:start'), next(rackam, 'salvage:start')])
  adam.emit('salvage:ready', { ready: true })
  rackam.emit('salvage:ready', { ready: true })
  const [sa, sr] = await started
  assert.equal(sa.seed, sr.seed)

  // Entrée dans la baie : le coéquipier suit ; le reste du bord apprend seulement qu'il y est.
  const seenByMate = next(rackam, 'state', (m) => m.id === wa.id && m.level === ZONE_LEVEL)
  const seenByOther = next(other, 'state', (m) => m.id === wa.id && m.level === ZONE_LEVEL)
  adam.emit('state', { x: sa.spawn.x, z: sa.spawn.z, yaw: 0, level: ZONE_LEVEL, anim: 'idle' })
  await Promise.all([seenByMate, seenByOther])
  const mateAgain = next(rackam, 'state', (m) => m.id === wa.id && m.yaw === 1)
  const quiet = silent(other, 'state', (m) => m.id === wa.id)
  adam.emit('state', { x: sa.spawn.x, z: sa.spawn.z, yaw: 1, level: ZONE_LEVEL, anim: 'idle' })
  await Promise.all([mateAgain, quiet])

  // Radio d'équipe : le chat de la baie ne sort pas de l'équipe.
  const heard = next(rackam, 'chat', (m) => m.text === 'ça gratte là-dedans')
  const unheard = silent(other, 'chat')
  adam.emit('chat', { text: 'ça gratte là-dedans' })
  await Promise.all([heard, unheard])

  // La partie tourne : l'état arrive dix fois par seconde aux membres.
  const state = await next(adam, 'salvage:state')
  assert.equal(state.monsters.length, sa.enemies)
  assert.equal(state.cargo.length, sa.parcels)
  // Une position impossible (au bout de la baie, à l'opposé du point de départ) est ignorée.
  const far = { x: sa.spawn.x < 23 ? 45 : 0, z: sa.spawn.z < 17 ? 33 : 0 }
  const ignored = silent(rackam, 'state', (m) => m.id === wa.id && m.x === far.x && m.z === far.z, 300)
  adam.emit('state', { ...far, yaw: 0, level: ZONE_LEVEL, anim: 'idle' })
  await ignored
  assert.ok(RULES.team >= 2 && wo.id)
})

test('au fond de la baie (au-delà de z = 30, elle en fait 34), la position passe et le colis se ramasse', async () => {
  const a = client()
  const wa = await welcome(a)
  const errors = []
  a.on('salvage:error', (e) => errors.push(e.code))
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // Un lobby libre (celui du test d'avant attend encore ses membres déconnectés).
  const team = wa.salvage.teams.find((t) => t.status === 'forming' && !t.members.length).id
  a.emit('state', LOBBY)
  await sleep(100)
  // La baie est tirée au hasard : on repart jusqu'à en avoir une avec un colis au fond, pas trop loin.
  for (let attempt = 0; attempt < 15; attempt++) {
    const started = next(a, 'salvage:start')
    a.emit('salvage:join', { team })
    a.emit('salvage:settings', { parcels: 6, enemies: 1 })
    a.emit('salvage:ready', { ready: true })
    const st = await started
    const zone = generateZone(st.seed, { team: st.team, parcels: st.parcels, enemies: st.enemies })
    let at = { x: st.spawn.x, z: st.spawn.z }
    a.emit('state', { ...at, yaw: 0, level: ZONE_LEVEL, anim: 'walk' })
    // Le plus proche des colis du fond, à moins de soixante pas : on y est avant la fin de la trêve
    // du départ (RULES.grace), sans risquer d'être capturé en route.
    const [cargo, path] = zone.cargo.filter((c) => c.z > 30)
      .map((c) => [c, findPath(zone, at, { x: Math.round(c.x), z: Math.round(c.z) })])
      .filter(([, p]) => p && p.length <= 60)
      .sort(([, p], [, q]) => p.length - q.length)[0] ?? []
    if (!path) {
      a.emit('salvage:quit', {})
      a.emit('state', LOBBY)
      await sleep(150)
      continue
    }
    // Par demi-tuile : chaque pas reste dans la marge du relais, même reçu d'un coup.
    for (const step of path.slice(1)) {
      for (const k of [0.5, 1]) {
        a.emit('state', { x: at.x + (step.x - at.x) * k, z: at.z + (step.z - at.z) * k, yaw: 0, level: ZONE_LEVEL, anim: 'walk' })
        await sleep(50)
      }
      at = step
    }
    await sleep(150)
    const picked = next(a, 'salvage:event', (e) => e.kind === 'pickup' && e.id === wa.id && e.cargo === cargo.id)
    a.emit('salvage:pickup', { kind: 'cargo', id: cargo.id })
    await picked
    assert.deepEqual(errors, [])
    a.emit('salvage:quit', {})
    return
  }
  assert.fail('pas de colis au fond de la baie en quinze missions')
})

test('le résultat part au site avec le cookie du CMDR et la clé du relais', async () => {
  const calls = []
  const fetcher = async (u, init) => {
    calls.push({ url: String(u), init })
    return { ok: true, json: async () => ({ status: 'success', earned: 4500, balance: 34500, boosters: 1, badge: 'zone-thargoide' }) }
  }
  const result = { game: 'abc', won: true, parcels: 2, enemies: 2, team: 1, delivered: 2, duration: 300 }
  const r = await postSalvageResult('ED_LOGGED_CMDR_ID=jeton-adam', result, { cmdrUrl: 'https://site.test/outils/mini-shipinteriors-cmdr.php', secret: 'clé', fetcher })
  // Avec les crédits, ce que la victoire rapporte sur le site : booster de la semaine, badge de la zone.
  assert.deepEqual(r, { earned: 4500, balance: 34500, boosters: 1, badge: true })
  assert.equal(calls[0].url, 'https://site.test/outils/mini-shipinteriors-salvage.php')
  assert.equal(calls[0].init.headers['X-Relay-Key'], 'clé')
  assert.equal(calls[0].init.headers.Cookie, 'ED_LOGGED_CMDR_ID=jeton-adam')
  assert.deepEqual(JSON.parse(calls[0].init.body), result)
  // Sans clé ou sans cookie : rien n'est demandé.
  assert.equal(await postSalvageResult('ED_LOGGED_CMDR_ID=x', result, { cmdrUrl: 'https://site.test/', secret: '', fetcher, error: () => {} }), null)
  assert.equal(await postSalvageResult(null, result, { cmdrUrl: 'https://site.test/', secret: 'clé', fetcher }), null)
  assert.equal(calls.length, 1)
  // Missions payées du jour faites : pas de prime, mais le booster de la semaine reste dû.
  const capped = async () => ({ ok: false, status: 409, json: async () => ({ status: 'error', error: 'max', boosters: 1, badge: null }) })
  assert.deepEqual(await postSalvageResult('ED_LOGGED_CMDR_ID=jeton-adam', result, { cmdrUrl: 'https://site.test/', secret: 'clé', fetcher: capped }),
    { earned: 0, capped: true, boosters: 1, badge: false })
  // Un site d'avant les boosters ne les annonce pas : zéro, pas de badge.
  const old = async () => ({ ok: true, json: async () => ({ status: 'success', earned: 1500, balance: 31500 }) })
  assert.deepEqual(await postSalvageResult('ED_LOGGED_CMDR_ID=jeton-adam', result, { cmdrUrl: 'https://site.test/', secret: 'clé', fetcher: old }),
    { earned: 1500, balance: 31500, boosters: 0, badge: false })
})
