// Tests du relais : identité par le cookie du site, contrôle d'origine, rediffusion.
//   npm test
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { after, before, describe, test } from 'node:test'
import { io as connect } from 'socket.io-client'
import { cookieValue } from './cmdr.js'
import { attachRelay, WS_PATH } from './relay.js'

/** Faux site : reconnaît deux cookies, comme outils/mini-shipinteriors-cmdr.php. */
const ACCOUNTS = { 'jeton-adam': 'Adam Fauster', 'jeton-rackam': 'Rackam' }
const seen = []
const site = createServer((req, res) => {
  seen.push(req.headers.cookie)
  const name = ACCOUNTS[cookieValue(req.headers.cookie)] ?? null
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ cmdr: name }))
})

const listen = async (server) => {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}`
}

let game, url, relay
const clients = []

before(async () => {
  const siteUrl = await listen(site)
  game = createServer()
  relay = attachRelay(game, { log: () => {}, cmdrUrl: `${siteUrl}/outils/mini-shipinteriors-cmdr.php` })
  url = await listen(game)
})

after(async () => {
  for (const c of clients) c.disconnect()
  relay.close()
  // fetch garde ses connexions ouvertes (keep-alive) : sans cela, le process ne se termine pas.
  site.closeAllConnections()
  site.close()
})

/** Client socket.io « navigateur » : même origine que le jeu par défaut. */
function client({ cookie, origin = url, auth = {}, transports } = {}) {
  const extraHeaders = { Origin: origin }
  if (cookie) extraHeaders.Cookie = cookie
  const socket = connect(url, { path: WS_PATH, auth: { skin: 'human.male.c', ...auth }, extraHeaders, transports, reconnection: false, forceNew: true })
  clients.push(socket)
  return socket
}

const welcome = (socket) =>
  new Promise((resolve, reject) => {
    socket.once('welcome', resolve)
    socket.once('connect_error', reject)
  })

describe('identité', () => {
  test('un cookie reconnu par le site donne un CMDR vérifié', async () => {
    const w = await welcome(client({ cookie: 'autre=1; ED_LOGGED_CMDR_ID=jeton-adam', auth: { name: 'CMDR Usurpateur' } }))
    assert.deepEqual(w.you, { name: 'CMDR Adam Fauster', verified: true })
    // Seul le cookie du site est relayé, pas les autres cookies du navigateur.
    assert.equal(seen.at(-1), 'ED_LOGGED_CMDR_ID=jeton-adam')
  })

  test('sans cookie, invité avec le nom de son choix', async () => {
    const before = seen.length
    const w = await welcome(client({ auth: { name: 'CMDR Ripley' } }))
    assert.deepEqual(w.you, { name: 'CMDR Ripley', verified: false })
    assert.equal(seen.length, before, 'le site n\'est pas interrogé sans cookie')
  })

  test('un cookie inconnu du site reste invité', async () => {
    const w = await welcome(client({ cookie: 'ED_LOGGED_CMDR_ID=jeton-bidon', auth: { name: 'CMDR Solo' } }))
    assert.deepEqual(w.you, { name: 'CMDR Solo', verified: false })
  })

  test('hors serveur de dev, le nom de CMDR envoyé par le client est ignoré', async () => {
    const w = await welcome(client({ auth: { name: 'CMDR Kirk', cmdr: 'Adam Fauster' } }))
    assert.deepEqual(w.you, { name: 'CMDR Kirk', verified: false })
  })

  test('un invité ne prend pas le nom d\'un CMDR vérifié à bord', async () => {
    await welcome(client({ cookie: 'ED_LOGGED_CMDR_ID=jeton-rackam' }))
    const w = await welcome(client({ auth: { name: 'cmdr rackam' } }))
    assert.deepEqual(w.you, { name: 'cmdr rackam (invité)', verified: false })
  })

  test('un CMDR vérifié ne change pas de nom en jeu', async () => {
    const socket = client({ cookie: 'ED_LOGGED_CMDR_ID=jeton-adam' })
    const w = await welcome(socket)
    socket.emit('profile', { name: 'CMDR Autre', skin: 'robot.g' })
    const [p] = await once(socket, 'profile')
    assert.equal(p.id, w.id)
    assert.equal(p.name, 'CMDR Adam Fauster')
    assert.equal(p.skin, 'robot.g')
  })

  test('en WebSocket direct aussi, le cookie de la poignée de main identifie le CMDR', async () => {
    const w = await welcome(client({ cookie: 'ED_LOGGED_CMDR_ID=jeton-adam', transports: ['websocket'] }))
    assert.equal(w.you.verified, true)
  })
})

describe('origine', () => {
  test('une page d\'un autre site est refusée, en polling comme en WebSocket', async () => {
    for (const transports of [['polling'], ['websocket']]) {
      const socket = client({ cookie: 'ED_LOGGED_CMDR_ID=jeton-adam', origin: 'https://pirate.example', transports })
      await assert.rejects(welcome(socket))
    }
  })
})

describe('rediffusion', () => {
  test('chat, emote et position passent d\'un joueur aux autres, validés', async () => {
    const a = client({ cookie: 'ED_LOGGED_CMDR_ID=jeton-adam' })
    const wa = await welcome(a)
    const b = client({ auth: { name: 'CMDR Ripley' } })
    const joined = once(a, 'join')
    const wb = await welcome(b)
    assert.ok(wb.players.some((p) => p.id === wa.id && p.name === 'CMDR Adam Fauster' && p.verified))
    assert.equal((await joined)[0].player.id, wb.id)

    b.emit('chat', { text: '  o7\u0007 CMDR  ' })
    const [chat] = await once(a, 'chat')
    assert.deepEqual(chat, { id: wb.id, name: 'CMDR Ripley', verified: false, text: 'o7 CMDR' })

    b.emit('emote', { emote: 'pirouette' }) // inconnue : ignorée
    b.emit('emote', { emote: 'danse' })
    assert.deepEqual((await once(a, 'emote'))[0], { id: wb.id, emote: 'danse' })

    b.emit('state', { x: 999, z: 3, yaw: 0, level: 0, anim: 'moonwalk' })
    assert.deepEqual((await once(a, 'state'))[0], { id: wb.id, x: 40, z: 3, yaw: 0, level: 0, anim: 'idle' })

    const left = once(a, 'leave')
    b.disconnect()
    assert.equal((await left)[0].id, wb.id)
  })
})
