// Tests du relais : identité par le cookie du site, contrôle d'origine, rediffusion, quartiers.
//   npm test
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { after, afterEach, before, describe, mock, test } from 'node:test'
import { io as connect } from 'socket.io-client'
import { MAX_ITEMS, sanitizeLayout } from './cabin.js'
import { cookieValue } from './cmdr.js'
import { attachRelay, WS_PATH } from './relay.js'
import { PILOT_SEAT, SYSTEM_IDS } from '../shared/systems.js'
import { PATROL_HOLD, PATROL_LEVEL, patrolAt } from '../shared/patrol.js'
import { CHEF_COOK, CHEF_HOLD, CHEF_LEVEL, chefAt } from '../shared/chef.js'
import { NURSE_BEDS, NURSE_CARE, NURSE_CARE_MIN, NURSE_HOLD, NURSE_LEVEL, NURSE_PATCH, nurseAt } from '../shared/nurse.js'

/** Faux site : reconnaît deux cookies, comme outils/mini-shipinteriors-cmdr.php. */
const ACCOUNTS = { 'jeton-adam': 'Adam Fauster', 'jeton-rackam': 'Rackam' }
const seen = []
const cinemaTrailer = { id: 42, title: 'Le Détournement', image: '/outils/mini-shipinteriors-cinema.php?image=42', video: 'JMo_6uawuBg' }
const site = createServer((req, res) => {
  if (req.url === '/outils/mini-shipinteriors-cinema.php') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ status: 'success', trailers: [cinemaTrailer], live: false, liveTitle: '' }))
    return
  }
  seen.push(req.headers.cookie)
  const name = ACCOUNTS[cookieValue(req.headers.cookie)] ?? null
  res.setHeader('Content-Type', 'application/json')
  if (req.url === '/outils/mini-shipinteriors-site.php?ownership=1') {
    res.end(JSON.stringify({ status: 'success', art: name ? [{ id: 'card:3598ce6f965b2481', kind: 'card' }] : [] }))
  } else res.end(JSON.stringify({ cmdr: name, ljpc: name === 'Adam Fauster', voie: name === 'Adam Fauster' }))
})

test('cinéma : seul le fauteuil de régie programme le trailer reçu par tout le bord', async () => {
  const operator = client()
  const audience = client()
  const catalog = next(operator, 'cinema:state', (m) => m.trailers.some((t) => t.id === cinemaTrailer.id))
  const ow = await welcome(operator)
  await welcome(audience)
  await catalog
  const denied = next(audience, 'cinema:error')
  audience.emit('cinema:choose', { id: cinemaTrailer.id })
  assert.equal((await denied).reason, 'seat')
  const occupied = next(operator, 'cinema:state', (m) => m.operator === ow.id)
  operator.emit('state', { x: 26.65, z: 7.51, level: 1, yaw: 0, anim: 'idle', pose: 'sit', py: 0.31 })
  await occupied
  const shown = next(audience, 'cinema:state', (m) => m.selected === cinemaTrailer.id)
  operator.emit('cinema:choose', { id: cinemaTrailer.id })
  const state = await shown
  assert.equal(state.trailers.find((t) => t.id === state.selected).video, cinemaTrailer.video)
  assert.ok(state.since > 0)
  const late = client()
  const restored = next(late, 'cinema:state', (m) => m.selected === cinemaTrailer.id)
  await welcome(late)
  assert.equal((await restored).since, state.since)
})

test('cinéma : une vidéo cherchée par la régie est reçue par toute la salle', async () => {
  const operator = client()
  const audience = client()
  await welcome(operator)
  await welcome(audience)
  const occupied = next(operator, 'cinema:state', (m) => m.operator !== null)
  operator.emit('state', { x: 26.65, z: 7.51, level: 1, yaw: 0, anim: 'idle', pose: 'sit', py: 0.31 })
  await occupied
  const denied = await audience.timeout(3000).emitWithAck('cinema:search', { query: 'cobra' })
  assert.equal(denied.reason, 'seat')
  const found = await operator.timeout(3000).emitWithAck('cinema:search', { query: 'cobra' })
  assert.equal(found.videos[0].video, 'dQw4w9WgXcQ')
  const shown = next(audience, 'cinema:state', (m) => m.youtube?.video === found.videos[0].video)
  operator.emit('cinema:video', { video: found.videos[0].video })
  assert.equal((await shown).youtube.title, 'Cobra Mk III')
})

const listen = async (server) => {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}`
}

let game, url, relay

/** Devant le jukebox du mess (pont principal). */
const AT_JUKEBOX = { x: 11.3, z: 6.6, yaw: 0, level: 0, anim: 'idle' }
const clients = []

afterEach(() => {
  for (const socket of clients.splice(0)) socket.disconnect()
})

before(async () => {
  const siteUrl = await listen(site)
  game = createServer()
  relay = attachRelay(game, { log: () => {}, error: () => {}, cmdrUrl: `${siteUrl}/outils/mini-shipinteriors-cmdr.php`,
    youtubeKey: 'test', youtubeFetch: async () => ({ ok: true, json: async () => ({ items: [
      { id: { videoId: 'dQw4w9WgXcQ' }, snippet: { title: 'Cobra Mk III', liveBroadcastContent: 'none' } },
    ] }) }) })
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
    assert.deepEqual(w.you, { name: 'CMDR Adam Fauster', verified: true, ljpc: true, voie: true })
    // Seul le cookie du site est relayé, pas les autres cookies du navigateur.
    assert.equal(seen.at(-1), 'ED_LOGGED_CMDR_ID=jeton-adam')
  })

  test('sans cookie, invité avec le nom de son choix', async () => {
    const before = seen.length
    const w = await welcome(client({ auth: { name: 'CMDR Ripley' } }))
    assert.deepEqual(w.you, { name: 'CMDR Ripley', verified: false, ljpc: false, voie: false })
    assert.equal(seen.length, before, 'le site n\'est pas interrogé sans cookie')
  })

  test('un cookie inconnu du site reste invité', async () => {
    const w = await welcome(client({ cookie: 'ED_LOGGED_CMDR_ID=jeton-bidon', auth: { name: 'CMDR Solo' } }))
    assert.deepEqual(w.you, { name: 'CMDR Solo', verified: false, ljpc: false, voie: false })
  })

  test('hors serveur de dev, le nom de CMDR envoyé par le client est ignoré', async () => {
    const w = await welcome(client({ auth: { name: 'CMDR Kirk', cmdr: 'Adam Fauster' } }))
    assert.deepEqual(w.you, { name: 'CMDR Kirk', verified: false, ljpc: false, voie: false })
  })

  test('un invité ne prend pas le nom d\'un CMDR vérifié à bord', async () => {
    await welcome(client({ cookie: 'ED_LOGGED_CMDR_ID=jeton-rackam' }))
    const w = await welcome(client({ auth: { name: 'cmdr rackam' } }))
    assert.deepEqual(w.you, { name: 'cmdr rackam (invité)', verified: false, ljpc: false, voie: false })
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

  test('le labo L.J.P.C. refuse les non-membres et accepte le badge de l’aventure', async () => {
    const observer = client()
    await welcome(observer)
    const guest = client({ cookie: 'ED_LOGGED_CMDR_ID=jeton-rackam' })
    const guestWelcome = await welcome(guest)
    assert.equal(guestWelcome.you.ljpc, false)
    const guestState = next(observer, 'state', (m) => m.id === guestWelcome.id)
    guest.emit('state', { x: 23, z: 1, level: 0, yaw: 0, anim: 'idle' })
    guest.emit('state', { x: 23, z: 4, level: 0, yaw: 0, anim: 'idle' })
    assert.equal((await guestState).z, 4)

    const member = client({ cookie: 'ED_LOGGED_CMDR_ID=jeton-adam' })
    const memberWelcome = await welcome(member)
    assert.equal(memberWelcome.you.ljpc, true)
    const memberState = next(observer, 'state', (m) => m.id === memberWelcome.id)
    member.emit('state', { x: 23, z: 1, level: 0, yaw: 0, anim: 'idle' })
    assert.equal((await memberState).z, 1)
  })

  test('le sanctuaire de la Voie refuse les non-adeptes et accepte l’épreuve accomplie', async () => {
    const observer = client()
    await welcome(observer)
    const guest = client({ cookie: 'ED_LOGGED_CMDR_ID=jeton-rackam' })
    const guestWelcome = await welcome(guest)
    assert.equal(guestWelcome.you.voie, false)
    const guestState = next(observer, 'state', (m) => m.id === guestWelcome.id)
    guest.emit('state', { x: 2, z: 9, level: -1, yaw: 0, anim: 'idle' })
    guest.emit('state', { x: 2, z: 7, level: -1, yaw: 0, anim: 'idle' })
    assert.equal((await guestState).z, 7)

    const adept = client({ cookie: 'ED_LOGGED_CMDR_ID=jeton-adam' })
    const adeptWelcome = await welcome(adept)
    assert.equal(adeptWelcome.you.voie, true)
    const adeptState = next(observer, 'state', (m) => m.id === adeptWelcome.id)
    adept.emit('state', { x: 2, z: 9, level: -1, yaw: 0, anim: 'idle' })
    assert.equal((await adeptState).z, 9)
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
const receives = (socket, event, ms = 150, match = () => true) =>
  new Promise((resolve) => {
    const on = (message) => { if (match(message)) resolve(true) }
    socket.on(event, on)
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
    b.emit('emote', { emote: 'o7' })
    assert.deepEqual((await once(a, 'emote'))[0], { id: wb.id, emote: 'o7' })
    b.emit('emote', { emote: 'braben' }) // réaction : un médaillon du site
    assert.deepEqual((await once(a, 'emote'))[0], { id: wb.id, emote: 'braben' })

    b.emit('state', { x: 999, z: 3, yaw: 0, level: 0, anim: 'moonwalk' })
    assert.deepEqual((await once(a, 'state'))[0], { id: wb.id, x: 50, z: 3, yaw: 0, level: 0, anim: 'idle' })

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
    a.emit('state', AT_JUKEBOX)
    a.emit('music', { where: 'deck', track: 'Disco!', x: 11.3, z: 5.82 }) // identifiant invalide : ignoré
    a.emit('music', { where: 'deck', track: 'disco', x: 11.3, z: 5.82 })
    const heard = await next(b, 'music')
    assert.deepEqual({ ...heard, at: 0 }, { id: wa.id, where: 'deck', track: 'disco', at: 0, x: 11.3, z: 5.82 })
    // Le nouveau venu arrive en plein morceau.
    await new Promise((r) => setTimeout(r, 120))
    const c = client({ auth: { name: 'CMDR Retard' } })
    const m = (await welcome(c)).music
    assert.equal(m.track, 'disco')
    assert.ok(m.at >= 0.1 && m.at < 5, `écoulé : ${m.at}`)
    a.emit('music', { where: 'deck', track: null, x: 11.3, z: 5.82 })
    assert.equal((await next(b, 'music')).track, null)
    for (const socket of [a, b, c]) socket.disconnect()
  })

  test('le titre choisi dans un album, la boucle et le mélange suivent les nouveaux venus', async () => {
    const a = client({ auth: { name: 'CMDR Album' } })
    await welcome(a)
    const b = client({ auth: { name: 'CMDR Duo' } })
    await welcome(b)
    a.emit('state', AT_JUKEBOX)
    const heard = next(b, 'music')
    a.emit('music', { where: 'deck', track: 'dangerous-spaces', song: 2, loop: true, shuffle: true, seed: 12345, x: 11.3, z: 5.82 })
    const m = await heard
    assert.deepEqual([m.track, m.song, m.loop, m.shuffle, m.seed], ['dangerous-spaces', 2, true, true, 12345])
    const c = client({ auth: { name: 'CMDR Arrivée' } })
    const late = (await welcome(c)).music
    assert.deepEqual([late.track, late.song, late.loop, late.shuffle, late.seed], ['dangerous-spaces', 2, true, true, 12345])
    for (const socket of [a, b, c]) socket.disconnect()
  })

  test('le jukebox du bar de la cale joue à part de celui du mess, et se choisit depuis la cale', async () => {
    const a = client({ auth: { name: 'CMDR Comptoir' } })
    const wa = await welcome(a)
    assert.equal(wa.hold.track, null)
    const b = client({ auth: { name: 'CMDR Habitué' } })
    await welcome(b)
    // Depuis le mess, le jukebox du bar est hors de portée (autre pont).
    a.emit('state', AT_JUKEBOX)
    const far = next(a, 'music')
    a.emit('music', { where: 'hold', track: 'lounge', x: 8.83, z: 9.6 })
    assert.equal((await far).far, true)
    // Au bar, devant le jukebox.
    a.emit('state', { x: 9.6, z: 9.8, yaw: 0, level: -1, anim: 'idle' })
    a.emit('music', { where: 'hold', track: 'lounge', x: 8.83, z: 9.6 })
    const heard = await next(b, 'music')
    assert.deepEqual({ ...heard, at: 0 }, { id: wa.id, where: 'hold', track: 'lounge', at: 0, x: 8.83, z: 9.6 })
    // Le nouveau venu apprend les deux : le bar joue, le mess se tait.
    const c = client({ auth: { name: 'CMDR Tardif' } })
    const wc = await welcome(c)
    assert.equal(wc.hold.track, 'lounge')
    assert.equal(wc.music.track, null)
    a.emit('music', { where: 'hold', track: null, x: 8.83, z: 9.6 })
    assert.equal((await next(b, 'music')).track, null)
    for (const socket of [a, b, c]) socket.disconnect()
  })

  test('trop de choix d\'un coup au jukebox : le demandeur retrouve le morceau de tous', async () => {
    const a = client({ auth: { name: 'CMDR Zappeur' } })
    await welcome(a)
    const b = client({ auth: { name: 'CMDR Patient' } })
    await welcome(b)
    a.emit('state', AT_JUKEBOX)
    const refused = next(a, 'music')
    for (const track of ['disco', 'lofi', 'space', 'lounge']) a.emit('music', { where: 'deck', track, x: 11.3, z: 5.82 })
    const m = await refused
    assert.equal(m.busy, true)
    assert.equal(m.track, 'space', 'le dernier choix accepté')
    assert.equal(await receives(b, 'music', 150, (m) => m.track === 'lounge'), false, 'le choix refusé n\'est pas diffusé')
    await new Promise((r) => setTimeout(r, 2100))
    a.emit('music', { where: 'deck', track: null, x: 11.3, z: 5.82 })
    assert.equal((await next(b, 'music')).track, null)
    a.disconnect()
    b.disconnect()
  })

  test('le jukebox et les tables ne s\'utilisent pas à travers un mur', async () => {
    const a = client({ auth: { name: 'CMDR Passe-Muraille' } })
    await welcome(a)
    const b = client({ auth: { name: 'CMDR Témoin' } })
    await welcome(b)
    // Coursive, juste au nord du mur du mess : le jukebox est à portée de main, mais derrière le mur.
    a.emit('state', { x: 11, z: 5, yaw: 0, level: 0, anim: 'idle' })
    const far = next(a, 'music')
    a.emit('music', { where: 'deck', track: 'disco', x: 11.3, z: 5.82 })
    assert.equal((await far).far, true)
    assert.equal(await receives(b, 'music', 150), false, 'le choix refusé n\'est pas diffusé')
    // Même chose pour Puissance 4, depuis la coursive, au nord de la salle d'arcade, hors de sa porte.
    a.emit('state', { x: 23.9, z: 5.4, yaw: 0, level: 0, anim: 'idle' })
    const refused = next(a, 'board:error')
    a.emit('board:join', { game: 'guardian-connect', table: 'guardian-connect' })
    assert.equal((await refused).code, 'far')
    a.disconnect()
    b.disconnect()
  })

  test('une partie de Puissance 4 est créée et rediffuse les coups aux deux joueurs', async () => {
    const a = client({ auth: { name: 'CMDR Rouge' } })
    await welcome(a)
    a.emit('state', { x: 23.3, z: 7.05, yaw: 0, level: 0, anim: 'idle' })
    const first = next(a, 'board:state')
    a.emit('board:join', { game: 'guardian-connect', table: 'guardian-connect' })
    assert.equal((await first).players.length, 1)

    const b = client({ auth: { name: 'CMDR Jaune' } })
    await welcome(b)
    b.emit('state', { x: 23.3, z: 7.05, yaw: 0, level: 0, anim: 'idle' })
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

describe('saut FSD', () => {
  test('le pilote installé lance un saut, que tout le bord vit, un à la fois', async () => {
    const pilot = client({ auth: { name: 'CMDR Pilote' } })
    const start = (await welcome(pilot)).system
    assert.ok(SYSTEM_IDS.includes(start))
    const crew = client({ auth: { name: 'CMDR Passager' } })
    await welcome(crew)
    // Debout à côté du siège : rien ne se passe.
    pilot.emit('state', { x: PILOT_SEAT.x, z: PILOT_SEAT.z, yaw: 0, level: 0, anim: 'idle' })
    pilot.emit('jump')
    assert.equal(await receives(crew, 'jump', 150), false)
    // Aux commandes : le saut part, vers un autre système, annoncé à tous.
    pilot.emit('state', { x: PILOT_SEAT.x, z: PILOT_SEAT.z, yaw: 0, level: 0, anim: 'idle', pose: 'pilot', py: 0.3 })
    const heard = next(crew, 'jump')
    const own = next(pilot, 'jump')
    pilot.emit('jump')
    const jump = await heard
    assert.equal(jump.name, 'CMDR Pilote')
    assert.notEqual(jump.system, start)
    assert.deepEqual(await own, jump)
    // Un second saut pendant le premier est ignoré ; un nouveau venu arrive dans le nouveau système.
    pilot.emit('jump')
    assert.equal(await receives(crew, 'jump', 150), false)
    const late = client({ auth: { name: 'CMDR Retardataire' } })
    assert.equal((await welcome(late)).system, jump.system)
  })
})

describe('patrouille', () => {
  test('le sergent est le même pour tous ; lui parler l\'arrête pour tout le bord', async () => {
    const talker = client({ auth: { name: 'CMDR Bavard' } })
    const crew = client({ auth: { name: 'CMDR Témoin' } })
    const first = (await welcome(talker)).patrol
    const seen = (await welcome(crew)).patrol
    assert.equal(first.hold, 0)
    // Même horloge pour les deux, à quelques millisecondes près.
    assert.ok(Math.abs(seen.tau - first.tau) < 0.5)
    // Depuis les quartiers (autre pont), on ne lui parle pas.
    talker.emit('patrol:talk')
    assert.equal(await receives(crew, 'patrol', 150), false)
    // À côté de lui : il s'arrête, face au joueur, pour tous.
    const at = patrolAt(first.tau + 0.4)
    talker.emit('state', { x: at.x, z: at.z, yaw: 0, level: PATROL_LEVEL, anim: 'idle' })
    const heard = next(crew, 'patrol')
    const own = next(talker, 'patrol')
    talker.emit('patrol:talk')
    const held = await heard
    assert.ok(held.hold > PATROL_HOLD - 0.5)
    assert.deepEqual(held.face, { x: at.x, z: at.z })
    assert.deepEqual(await own, held)
    // Une réplique toutes les 2 s au plus.
    talker.emit('patrol:talk')
    assert.equal(await receives(crew, 'patrol', 150), false)
    // Un nouveau venu le trouve arrêté, au même point de la ronde.
    const late = client({ auth: { name: 'CMDR Retardataire' } })
    const joined = (await welcome(late)).patrol
    assert.ok(joined.hold > 0)
    assert.ok(Math.abs(joined.tau - held.tau) < 1e-6)
  })
})

describe('chef du mess', () => {
  test('le chef est le même pour tous ; lui parler l\'arrête, cuisiner le retient au bout du self', async () => {
    const cook = client({ auth: { name: 'CMDR Commis' } })
    const crew = client({ auth: { name: 'CMDR Gourmand' } })
    const first = (await welcome(cook)).chef
    const seen = (await welcome(crew)).chef
    assert.equal(first.hold, 0)
    assert.equal(first.cook, 0)
    assert.ok(Math.abs(seen.tau - first.tau) < 0.5)
    // Hors du mess (dans les quartiers), on ne cuisine pas, et on ne lui parle pas.
    cook.emit('chef:cook', { on: true })
    cook.emit('chef:talk')
    assert.equal(await receives(crew, 'chef', 150), false)
    // À côté de lui : il s'arrête, face au joueur, pour tous.
    const at = chefAt(first.tau + 0.4)
    cook.emit('state', { x: at.x, z: at.z, yaw: 0, level: CHEF_LEVEL, anim: 'idle' })
    const talked = next(crew, 'chef')
    cook.emit('chef:talk')
    const held = await talked
    assert.ok(held.hold > CHEF_HOLD - 0.5)
    assert.deepEqual(held.face, { x: at.x, z: at.z })
    // Une commande, depuis la salle : il attend au bout du self, pour tous, le temps de la commande et du retour.
    cook.emit('state', { x: 12, z: 9.2, yaw: 0, level: CHEF_LEVEL, anim: 'idle' })
    const cooking = next(crew, 'chef', (m) => m.cook > 0)
    cook.emit('chef:cook', { on: true })
    const order = await cooking
    assert.ok(order.cook > CHEF_COOK - 1)
    assert.ok(order.hold > order.cook)
    assert.ok(Math.abs(order.tau - held.tau) < 0.5)
    // Un nouveau venu le trouve au bout du self.
    const late = client({ auth: { name: 'CMDR Retardataire' } })
    assert.ok((await welcome(late)).chef.cook > 0)
    // La commande servie, il repart : plus de commande, juste le temps de revenir.
    const done = next(crew, 'chef', (m) => m.cook === 0)
    cook.emit('chef:cook', { on: false })
    const back = await done
    assert.ok(back.hold > 0 && back.hold < 10)
    // Un commis qui s'en va sans finir libère le chef aussi.
    cook.emit('chef:cook', { on: true })
    await next(crew, 'chef', (m) => m.cook > 0)
    const left = next(crew, 'chef', (m) => m.cook === 0)
    cook.disconnect()
    await left
  })
})

describe('infirmière', () => {
  /** Allongé sur un lit de l'infirmerie (cf. seats.ts : la tête vers l'oreiller). */
  const lying = (bed) => ({ x: NURSE_BEDS[bed].x, z: NURSE_BEDS[bed].z + 0.08, yaw: 0, level: NURSE_LEVEL, anim: 'idle', pose: 'lie', py: 0.3 })

  test('Betty est la même pour tous ; lui parler l\'arrête, l\'appeler d\'un lit l\'amène au chevet', async () => {
    const patient = client({ auth: { name: 'CMDR Patient' } })
    const crew = client({ auth: { name: 'CMDR Visiteur' } })
    const first = (await welcome(patient)).nurse
    const seen = (await welcome(crew)).nurse
    assert.equal(first.hold, 0)
    assert.equal(first.care, 0)
    assert.equal(first.bed, -1)
    assert.deepEqual(first.patched, [])
    assert.ok(Math.abs(seen.tau - first.tau) < 0.5)
    // Depuis les quartiers (autre pont), on ne lui parle pas, et on ne l'appelle pas.
    patient.emit('nurse:talk')
    patient.emit('nurse:care', { on: true })
    assert.equal(await receives(crew, 'nurse', 150), false)
    // À côté d'elle : elle s'arrête, face au joueur, pour tous.
    const at = nurseAt(first.tau + 0.4)
    patient.emit('state', { x: at.x, z: at.z, yaw: 0, level: NURSE_LEVEL, anim: 'idle' })
    const talked = next(crew, 'nurse')
    patient.emit('nurse:talk')
    const held = await talked
    assert.ok(held.hold > NURSE_HOLD - 0.5)
    assert.deepEqual(held.face, { x: at.x, z: at.z })
    // Debout dans l'infirmerie, on ne l'appelle pas : il faut être allongé sur un lit.
    patient.emit('nurse:care', { on: true })
    assert.equal(await receives(crew, 'nurse', 150), false)
    // Allongé sur le deuxième lit : elle vient au chevet, pour tous, le temps de la consultation et du retour.
    patient.emit('state', lying(1))
    const called = next(crew, 'nurse', (m) => m.care > 0)
    patient.emit('nurse:care', { on: true })
    const consult = await called
    assert.equal(consult.bed, 1)
    assert.equal(consult.patient, (await welcome(client())).players.find((p) => p.name === 'CMDR Patient').id)
    assert.ok(consult.care > NURSE_CARE - 1)
    assert.ok(consult.hold > consult.care)
    // Une consultation à la fois : un autre patient allongé attend son tour.
    const other = client({ auth: { name: 'CMDR Suivant' } })
    await welcome(other)
    other.emit('state', lying(0))
    other.emit('nurse:care', { on: true })
    assert.equal(await receives(crew, 'nurse', 150), false)
    // Un nouveau venu la trouve au chevet.
    assert.equal((await welcome(client())).nurse.bed, 1)
    // Relevé trop tôt : pas de pansement, elle repart.
    const done = next(crew, 'nurse', (m) => m.care === 0)
    patient.emit('nurse:care', { on: false, healed: true })
    const back = await done
    assert.deepEqual(back.patched, [])
    assert.ok(back.hold > 0 && back.hold < 12)
  })

  test('une consultation menée à son terme laisse un pansement, que tout le bord voit, jusqu\'au départ du patient', async () => {
    const patient = client({ auth: { name: 'CMDR Soigné' } })
    const crew = client({ auth: { name: 'CMDR Témoin' } })
    const id = (await welcome(patient)).id
    await welcome(crew)
    patient.emit('state', lying(2))
    const called = next(crew, 'nurse', (m) => m.care > 0)
    patient.emit('nurse:care', { on: true })
    await called
    // La consultation dure : on avance l'horloge du relais.
    mock.timers.enable({ apis: ['Date'], now: Date.now() })
    try {
      mock.timers.tick((NURSE_CARE_MIN + 1) * 1000)
      const healed = next(crew, 'nurse', (m) => m.care === 0)
      patient.emit('nurse:care', { on: false, healed: true })
      const [[who, secs]] = (await healed).patched
      assert.equal(who, id)
      assert.ok(secs > NURSE_PATCH - 1)
      const late = (await welcome(client())).nurse
      assert.deepEqual(late.patched.map(([p]) => p), [id])
    } finally {
      mock.timers.reset()
    }
    // Il débarque : son pansement part avec lui.
    const gone = next(crew, 'nurse', (m) => m.patched.length === 0)
    patient.disconnect()
    await gone
  })

  test('un patient qui s\'en va sans finir libère l\'infirmière', async () => {
    const patient = client({ auth: { name: 'CMDR Pressé' } })
    const crew = client({ auth: { name: 'CMDR Témoin' } })
    await welcome(patient)
    await welcome(crew)
    patient.emit('state', lying(0))
    const called = next(crew, 'nurse', (m) => m.care > 0)
    patient.emit('nurse:care', { on: true })
    await called
    const left = next(crew, 'nurse', (m) => m.care === 0)
    patient.disconnect()
    assert.deepEqual((await left).patched, [])
  })
})

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
        for (const socket of [a, b, c]) socket.emit('state', { x: 23.3, z: 8.2, yaw: 0, level: 0, anim: 'idle' })
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
    const full = sanitizeLayout({ items: Array.from({ length: 200 }, () => ({ m: 'plant', x: 10, z: 8, r: 0 })) })
    assert.equal(full.items.length, MAX_ITEMS)
  })

  test('les pièces d\'extension passent, avec une forme connue et leurs revêtements', () => {
    const items = [{ m: 'mug', x: 11, z: 12, r: 0 }]
    const out = sanitizeLayout({
      items,
      wings: {
        middle: { shape: 'deux-pieces', wall: { style: 'damask', color: '#7a2e3a' }, floor: { style: 'planks', color: 'rouge' } },
        left: { shape: 'pentagone' },
        attic: { shape: 'carre' },
      },
    })
    assert.deepEqual(out.wings, { middle: { shape: 'deux-pieces', wall: { style: 'damask', color: '#7a2e3a' } } })
    assert.equal(sanitizeLayout({ items, wings: 'toutes' }).wings, undefined)
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
