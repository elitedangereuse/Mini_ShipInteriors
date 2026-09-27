// Tests du relais : identité par le cookie du site, contrôle d'origine, rediffusion, quartiers.
//   npm test
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { after, before, describe, test } from 'node:test'
import { io as connect } from 'socket.io-client'
import { MAX_ITEMS, sanitizeLayout } from './cabin.js'
import { cookieValue } from './cmdr.js'
import { attachRelay, WS_PATH } from './relay.js'

/** Faux site : reconnaît deux cookies, comme outils/mini-shipinteriors-cmdr.php. */
const ACCOUNTS = { 'jeton-adam': 'Adam Fauster', 'jeton-rackam': 'Rackam' }
const seen = []
const site = createServer((req, res) => {
  seen.push(req.headers.cookie)
  const name = ACCOUNTS[cookieValue(req.headers.cookie)] ?? null
  res.setHeader('Content-Type', 'application/json')
  if (req.url === '/outils/mini-shipinteriors-site.php?ownership=1') {
    res.end(JSON.stringify({ status: 'success', art: name ? [{ id: 'card:3598ce6f965b2481', kind: 'card' }] : [] }))
  } else res.end(JSON.stringify({ cmdr: name }))
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
  relay = attachRelay(game, { log: () => {}, error: () => {}, cmdrUrl: `${siteUrl}/outils/mini-shipinteriors-cmdr.php` })
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

/** Prochain message `event` reçu par `socket` qui satisfait `match`. */
const next = (socket, event, match = () => true) =>
  new Promise((resolve) => {
    const on = (m) => {
      if (!match(m)) return
      socket.off(event, on)
      resolve(m)
    }
    socket.on(event, on)
  })

/** Vrai si `socket` reçoit `event` dans les `ms` millisecondes. */
const receives = (socket, event, ms = 150) =>
  new Promise((resolve) => {
    const on = () => resolve(true)
    socket.once(event, on)
    setTimeout(() => {
      socket.off(event, on)
      resolve(false)
    }, ms)
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

  test('la pose sur un meuble passe avec la position, et un nouveau venu la voit', async () => {
    const a = client({ auth: { name: 'CMDR Assise' } })
    const wa = await welcome(a)
    const b = client({ auth: { name: 'CMDR Regard' } })
    await welcome(b)
    const state = { x: 12.5, z: 7.24, yaw: 0, level: 0, anim: 'idle' }
    a.emit('state', { ...state, pose: 'sit', py: 0.25 })
    assert.deepEqual(await next(b, 'state', (m) => m.id === wa.id), { id: wa.id, ...state, pose: 'sit', py: 0.25 })
    // Un nouveau venu voit qui est assis où.
    const c = client({ auth: { name: 'CMDR Tardif' } })
    const seen = (await welcome(c)).players.find((p) => p.id === wa.id)
    assert.deepEqual([seen.pose, seen.py], ['sit', 0.25])
    // Une pose inconnue n'en est pas une ; la hauteur reste bornée.
    a.emit('state', { ...state, pose: 'lévitation', py: 3 })
    assert.deepEqual(await next(b, 'state', (m) => m.id === wa.id), { id: wa.id, ...state })
    a.emit('state', { ...state, pose: 'lie', py: 3 })
    assert.equal((await next(b, 'state', (m) => m.id === wa.id)).py, 1.2)
    for (const socket of [a, b, c]) socket.disconnect()
  })

  test('le jukebox du pont principal s\'entend de tous, et d\'un nouveau venu, au bon moment du morceau', async () => {
    const a = client({ auth: { name: 'CMDR Disco' } })
    const wa = await welcome(a)
    // À l'arrivée, le silence aussi est dit (un joueur reconnecté arrête le morceau d'avant).
    assert.equal(wa.music.track, null)
    const b = client({ auth: { name: 'CMDR Oreille' } })
    await welcome(b)
    a.emit('music', { where: 'deck', track: 'Disco!', x: 11.3, z: 6.32 }) // identifiant invalide : ignoré
    a.emit('music', { where: 'deck', track: 'disco', x: 11.3, z: 6.32 })
    const heard = await next(b, 'music')
    assert.deepEqual({ ...heard, at: 0 }, { id: wa.id, where: 'deck', track: 'disco', at: 0, x: 11.3, z: 6.32 })
    // Le nouveau venu arrive en plein morceau.
    await new Promise((r) => setTimeout(r, 120))
    const c = client({ auth: { name: 'CMDR Retard' } })
    const m = (await welcome(c)).music
    assert.equal(m.track, 'disco')
    assert.ok(m.at >= 0.1 && m.at < 5, `écoulé : ${m.at}`)
    a.emit('music', { where: 'deck', track: null, x: 11.3, z: 6.32 })
    assert.equal((await next(b, 'music')).track, null)
    for (const socket of [a, b, c]) socket.disconnect()
  })

  test('trop de choix d\'un coup au jukebox : le demandeur retrouve le morceau de tous', async () => {
    const a = client({ auth: { name: 'CMDR Zappeur' } })
    await welcome(a)
    const b = client({ auth: { name: 'CMDR Patient' } })
    await welcome(b)
    const refused = next(a, 'music')
    for (const track of ['disco', 'lofi', 'space', 'lounge']) a.emit('music', { where: 'deck', track, x: 11.3, z: 6.32 })
    const m = await refused
    assert.equal(m.busy, true)
    assert.equal(m.track, 'space', 'le dernier choix accepté')
    assert.equal(await receives(b, 'music', 150), false, 'le choix refusé n\'est pas diffusé')
    await new Promise((r) => setTimeout(r, 2100))
    a.emit('music', { where: 'deck', track: null, x: 11.3, z: 6.32 })
    assert.equal((await next(b, 'music')).track, null)
    a.disconnect()
    b.disconnect()
  })

  test('une partie de Puissance 4 est créée et rediffuse les coups aux deux joueurs', async () => {
    const a = client({ auth: { name: 'CMDR Rouge' } })
    await welcome(a)
    a.emit('state', { x: 19, z: 7.45, yaw: 0, level: 0, anim: 'idle' })
    const first = next(a, 'board:state')
    a.emit('board:join', { game: 'guardian-connect', table: 'guardian-connect' })
    assert.equal((await first).players.length, 1)

    const b = client({ auth: { name: 'CMDR Jaune' } })
    await welcome(b)
    b.emit('state', { x: 19, z: 7.45, yaw: 0, level: 0, anim: 'idle' })
    const seenByA = next(a, 'board:state', (m) => m.players.length === 2)
    const seenByB = next(b, 'board:state', (m) => m.players.length === 2)
    b.emit('board:join', { game: 'guardian-connect', table: 'guardian-connect' })
    await Promise.all([seenByA, seenByB])

    const moved = next(b, 'board:state', (m) => m.board[5][0] === 'red')
    a.emit('board:move', { game: 'guardian-connect', table: 'guardian-connect', move: { column: 0 } })
    assert.equal((await moved).turn, 'yellow')
    a.disconnect()
    b.disconnect()
  })
})

const LAYOUT = { v: 1, items: [{ m: 'holo-me', x: 11.6, z: 8.4, r: 0 }, { m: 'sofa', x: 14.25, z: 9.97, r: 2, v: 'teal' }] }

describe('jeux de plateau : remplacement du premier joueur', () => {
  for (const [game, firstColor, secondColor, opening, reply] of [
    ['draughts', 'red', 'blue', { from: [0, 5], to: [1, 4] }, { from: [1, 2], to: [0, 3] }],
    ['guardian-connect', 'red', 'yellow', { column: 0 }, { column: 1 }],
    ['imperial-chess', 'white', 'black', { from: [4, 6], to: [4, 4] }, { from: [4, 1], to: [4, 3] }],
  ]) {
    test(`${game} : le remplaçant reçoit la couleur libre et les deux camps peuvent jouer`, { timeout: 5000 }, async () => {
      const a = client(), b = client(), c = client()
      try {
        const [wa, wb, wc] = await Promise.all([welcome(a), welcome(b), welcome(c)])
        for (const socket of [a, b, c]) socket.emit('state', { x: 18, z: 8, yaw: 0, level: 0, anim: 'idle' })
        const first = next(a, 'board:state')
        a.emit('board:join', { game, table: game })
        assert.equal((await first).players[0].color, firstColor)
        const joined = next(b, 'board:state', m => m.players.length === 2)
        b.emit('board:join', { game, table: game })
        await joined
        const reset = next(b, 'board:state', m => m.players.length === 1)
        a.emit('board:leave', {})
        const waiting = await reset
        assert.equal(waiting.status, 'waiting')
        assert.deepEqual(waiting.players.map(p => [p.id, p.color]), [[wb.id, secondColor]])
        const replaced = next(c, 'board:state', m => m.players.length === 2)
        c.emit('board:join', { game, table: game })
        const state = await replaced
        assert.equal(state.players.find(p => p.id === wc.id).color, firstColor)
        assert.equal(new Set(state.players.map(p => p.color)).size, 2)
        assert.ok(!state.players.some(p => p.id === wa.id))
        const moved = next(b, 'board:state', m => m.turn === secondColor)
        c.emit('board:move', { game, table: game, move: opening })
        await moved
        const answered = next(c, 'board:state', m => m.turn === firstColor)
        b.emit('board:move', { game, table: game, move: reply })
        await answered
      } finally {
        for (const socket of [a, b, c]) socket.disconnect()
      }
    })
  }
})

describe('quartiers', () => {
  /** Un CMDR vérifié (Rackam) qui reçoit, et un invité qui se promène. */
  async function hostAndGuest() {
    const host = client({ cookie: 'ED_LOGGED_CMDR_ID=jeton-rackam' })
    const wh = await welcome(host)
    const guest = client({ auth: { name: 'CMDR Solo' } })
    const wg = await welcome(guest)
    return { host, wh, guest, wg }
  }

  test('chacun commence dans ses propres quartiers', async () => {
    const { wh, wg } = await hostAndGuest()
    const seen = wg.players.find((p) => p.id === wh.id)
    assert.equal(seen.cabin, wh.id)
  })

  test('sur invitation, le visiteur entre, reçoit l\'aménagement, puis chacun de ses changements', async () => {
    const { host, wh, guest, wg } = await hostAndGuest()
    const other = client({ auth: { name: 'CMDR Kirk' } })
    await welcome(other)
    host.emit('cabin', { layout: LAYOUT })
    const invited = next(guest, 'invite')
    host.emit('invite', { to: wg.id })
    assert.deepEqual(await invited, { id: wh.id, name: 'CMDR Rackam', verified: true })

    const layout = next(guest, 'cabin')
    const entered = next(host, 'visit', (m) => m.id === wg.id)
    guest.emit('visit', { host: wh.id })
    assert.deepEqual(await layout, { id: wh.id, layout: LAYOUT })
    assert.deepEqual(await entered, { id: wg.id, cabin: wh.id })

    // Un changement de l'hôte : son visiteur le voit, pas les autres.
    const moved = { v: 1, items: [{ m: 'holo-me', x: 12, z: 9, r: 1 }] }
    const update = next(guest, 'cabin')
    const elsewhere = receives(other, 'cabin')
    host.emit('cabin', { layout: moved })
    assert.deepEqual(await update, { id: wh.id, layout: moved })
    assert.equal(await elsewhere, false)

    // Il repart : il rentre chez lui.
    const left = next(host, 'visit', (m) => m.id === wg.id)
    guest.emit('visit', { host: null })
    assert.deepEqual(await left, { id: wg.id, cabin: wg.id })
  })

  test('un visiteur voit les cartes possédées, sans recevoir une décoration usurpée', async () => {
    const { host, wh, guest, wg } = await hostAndGuest()
    host.emit('cabin', { layout: LAYOUT })
    const invited = next(guest, 'invite')
    host.emit('invite', { to: wg.id })
    await invited
    const initial = next(guest, 'cabin')
    guest.emit('visit', { host: wh.id })
    await initial
    const earned = { v: 1, items: [...LAYOUT.items, { m: 'site-card', v: 'card:3598ce6f965b2481', x: 10, z: 5.65, r: 0 }] }
    const update = next(guest, 'cabin')
    host.emit('cabin', { layout: earned })
    assert.deepEqual(await update, { id: wh.id, layout: earned })
    const forged = { v: 1, items: [...LAYOUT.items, { m: 'site-card', v: 'card:0000000000000000', x: 10, z: 5.65, r: 0 }] }
    const leaked = receives(guest, 'cabin')
    host.emit('cabin', { layout: forged })
    assert.equal(await leaked, false)
  })

  test('sans invitation, on n\'entre pas ; une invitation ne sert qu\'une fois', async () => {
    const { host, wh, guest, wg } = await hostAndGuest()
    const refused = next(guest, 'visit')
    guest.emit('visit', { host: wh.id })
    assert.deepEqual(await refused, { id: wg.id, cabin: wg.id, expired: true })

    host.emit('invite', { to: wg.id })
    await next(guest, 'invite')
    guest.emit('visit', { host: wh.id })
    await next(guest, 'visit', (m) => m.cabin === wh.id)
    guest.emit('visit', { host: null })
    await next(guest, 'visit', (m) => m.cabin === wg.id)
    const again = next(guest, 'visit')
    guest.emit('visit', { host: wh.id })
    assert.deepEqual(await again, { id: wg.id, cabin: wg.id, expired: true })
  })

  test('chez un hôte, une invitation expirée d\'un autre CMDR laisse le visiteur où il est', async () => {
    const { host, wh, guest, wg } = await hostAndGuest()
    const other = client({ cookie: 'ED_LOGGED_CMDR_ID=jeton-adam' })
    const wo = await welcome(other)
    host.emit('invite', { to: wg.id })
    await next(guest, 'invite')
    guest.emit('visit', { host: wh.id })
    await next(guest, 'visit', (m) => m.cabin === wh.id)
    const refused = next(guest, 'visit')
    guest.emit('visit', { host: wo.id })
    assert.deepEqual(await refused, { id: wg.id, cabin: wh.id, expired: true })
  })

  test('l\'hôte apprend si son invitation est partie, ou pourquoi', async () => {
    const { host, wh, guest, wg } = await hostAndGuest()
    const invite = (socket, to) => socket.timeout(2000).emitWithAck('invite', { to })
    assert.deepEqual(await invite(host, wg.id), { ok: true })
    assert.deepEqual(await invite(guest, wh.id), { ok: false, reason: 'guest' })
    assert.deepEqual(await invite(host, wh.id), { ok: false, reason: 'gone' })
    assert.deepEqual(await invite(host, 99999), { ok: false, reason: 'gone' })
    guest.emit('visit', { host: wh.id })
    await next(guest, 'visit', (m) => m.cabin === wh.id)
    assert.deepEqual(await invite(host, wg.id), { ok: false, reason: 'here' })
    // Trois invitations d'un coup, pas une de plus (une de plus toutes les quatre secondes).
    const others = await Promise.all(['CMDR Kirk', 'CMDR Spock', 'CMDR Uhura'].map((name) => welcome(client({ auth: { name } }))))
    const replies = []
    for (const w of others) replies.push(await invite(host, w.id))
    assert.deepEqual(replies.map((r) => r.ok), [true, true, false])
    assert.equal(replies[2].reason, 'busy')
  })

  test('un invité n\'aménage pas de quartiers et n\'invite personne', async () => {
    const { host, wh, guest } = await hostAndGuest()
    guest.emit('cabin', { layout: LAYOUT })
    const invited = receives(host, 'invite')
    guest.emit('invite', { to: wh.id })
    assert.equal(await invited, false)
  })

  test('décliner une invitation prévient l\'hôte', async () => {
    const { host, wh, guest, wg } = await hostAndGuest()
    host.emit('invite', { to: wg.id })
    await next(guest, 'invite')
    const declined = next(host, 'decline')
    guest.emit('decline', { to: wh.id })
    assert.deepEqual(await declined, { id: wg.id, name: 'CMDR Solo' })
  })

  test('le jukebox des quartiers ne s\'entend que chez l\'hôte, et on le retrouve en entrant', async () => {
    const host = client({ cookie: 'ED_LOGGED_CMDR_ID=jeton-rackam' })
    const wh = await welcome(host)
    const guest = client({ auth: { name: 'CMDR Voisin' } })
    const wg = await welcome(guest)
    host.emit('music', { where: 'cabin', track: 'lounge', x: 13, z: 8 })
    assert.equal(await receives(guest, 'music'), false, 'hors des quartiers, le voisin n\'entend rien')
    host.emit('invite', { to: wg.id })
    await next(guest, 'invite')
    const heard = next(guest, 'music')
    guest.emit('visit', { host: wh.id })
    const m = await heard
    assert.deepEqual([m.where, m.track, m.x, m.z], ['cabin', 'lounge', 13, 8])
    // Il rentre chez lui : ses quartiers à lui se taisent.
    const home = next(guest, 'music')
    guest.emit('visit', { host: null })
    assert.equal((await home).track, null)
    host.disconnect()
    guest.disconnect()
  })

  test('un hôte reconnecté rend au relais sa musique, là où elle en était', async () => {
    const { host, wh, guest, wg } = await hostAndGuest()
    host.emit('music', { where: 'cabin', track: 'lofi', x: 13, z: 8, at: 42 })
    host.emit('invite', { to: wg.id })
    await next(guest, 'invite')
    const heard = next(guest, 'music')
    guest.emit('visit', { host: wh.id })
    const m = await heard
    assert.equal(m.track, 'lofi')
    assert.ok(m.at >= 42 && m.at < 45, `écoulé : ${m.at}`)
    host.disconnect()
    guest.disconnect()
  })

  test('l\'hôte raccompagne son visiteur ; s\'il débarque, ses visiteurs rentrent chez eux', async () => {
    const { host, wh, guest, wg } = await hostAndGuest()
    host.emit('invite', { to: wg.id })
    await next(guest, 'invite')
    guest.emit('visit', { host: wh.id })
    await next(guest, 'visit', (m) => m.cabin === wh.id)
    const kicked = next(guest, 'visit', (m) => m.id === wg.id)
    host.emit('kick', { id: wg.id })
    assert.deepEqual(await kicked, { id: wg.id, cabin: wg.id, by: wh.id })

    host.emit('invite', { to: wg.id })
    await next(guest, 'invite')
    guest.emit('visit', { host: wh.id })
    await next(guest, 'visit', (m) => m.cabin === wh.id)
    const home = next(guest, 'visit', (m) => m.id === wg.id)
    host.disconnect()
    assert.deepEqual(await home, { id: wg.id, cabin: wg.id })
  })

  test('la forme d\'un aménagement est vérifiée, objet par objet', () => {
    assert.equal(sanitizeLayout(null), null)
    assert.equal(sanitizeLayout({ items: 'lit' }), null)
    const out = sanitizeLayout({
      items: [
        { m: 'mug', x: 1.23456, z: 2, r: 3, y: 0.40004, s: 12, v: 'warm:2x1.4', extra: 'ignoré' },
        { m: 'Mug', x: 1, z: 1 },
        { m: 'mug', x: '1', z: 1 },
        { m: 'mug', x: 99, z: 1 },
        { m: 'mug', x: 1, z: 1, r: 7, v: 'ÉLITE', y: -1, s: 1.5 },
      ],
    })
    assert.deepEqual(out.items, [
      { m: 'mug', x: 1.235, z: 2, r: 3, v: 'warm:2x1.4', y: 0.4, s: 12 },
      { m: 'mug', x: 1, z: 1, r: 0 },
    ])
    const full = sanitizeLayout({ items: Array.from({ length: 80 }, () => ({ m: 'plant', x: 10, z: 8, r: 0 })) })
    assert.equal(full.items.length, MAX_ITEMS)
  })

  test('les revêtements des murs et du sol passent, s\'ils ont la bonne forme', () => {
    const items = [{ m: 'mug', x: 1, z: 1, r: 0 }]
    assert.deepEqual(sanitizeLayout({ items, wall: { style: 'damask', color: '#7a2e3a', extra: 1 }, floor: { style: 'planks', color: '#b08556' } }), {
      v: 1,
      items,
      wall: { style: 'damask', color: '#7a2e3a' },
      floor: { style: 'planks', color: '#b08556' },
    })
    for (const bad of [{ style: 'Damask', color: '#7a2e3a' }, { style: 'damask', color: 'red' }, { style: 'damask', color: '#7A2E3A' }, { style: 'damask' }, 'damask', null]) {
      assert.deepEqual(sanitizeLayout({ items, wall: bad, floor: bad }), { v: 1, items })
    }
  })
})
