// Les quêtes du bord (shared/quests.js) : les règles du journal, les pièces qu'elles ferment, la
// liste que le site recopie ; et le relais, qui ne laisse entrer dans ces pièces qu'une fois la
// quête terminée.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { after, afterEach, before, describe, test } from 'node:test'
import { io as connect } from 'socket.io-client'
import { cookieValue } from './cmdr.js'
import { attachRelay, WS_PATH } from './relay.js'
import { fetchQuestsDone } from './site.js'
import {
  knownQuests, QUEST_ROOMS, QUEST_UNLOCKS, questAdvance, questById, questFlag, questOfRoom, QUESTS, questStarted, stepComplete,
} from '../shared/quests.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { DIRS, ShipMap } from '../shared/ship-map.js'

const ECONOMY = JSON.parse(readFileSync(new URL('../src/economy/economy.json', import.meta.url), 'utf8'))

test('les quêtes : des identifiants uniques, des étapes, des récompenses que le jeu connaît', () => {
  assert.equal(new Set(QUESTS.map((q) => q.id)).size, QUESTS.length)
  for (const q of QUESTS) {
    assert.match(q.id, /^[a-z0-9-]{1,32}$/)
    assert.ok(q.steps.length > 0)
    // Les éléments d'une étape tiennent dans `flags` (SMALLINT côté site).
    for (const parts of q.steps) assert.ok(Number.isInteger(parts) && parts >= 0 && parts <= 16)
    assert.equal(questById(q.id), q)
    for (const item of q.reward?.items ?? []) assert.ok(item in ECONOMY.items, `${q.id} : ${item} est au catalogue`)
    for (const skin of q.reward?.skins ?? []) assert.ok(skin in ECONOMY.skins, `${q.id} : ${skin} est au Holo-Me`)
  }
  assert.equal(questById('inconnue'), undefined)
  assert.equal(QUEST_UNLOCKS['pet-chien'], 'gamelle-vide')
  assert.equal(QUEST_UNLOCKS['skin:robot.d'], 'quatre-cent-douze')
  assert.equal(QUEST_UNLOCKS['skin:holo.echo'], 'essayage')
  assert.deepEqual(knownQuests(['poids-lourds', 'inconnue', 'poids-lourds', 3]), ['poids-lourds'])
  assert.deepEqual(knownQuests('poids-lourds'), [])
})

test('une étape simple passe à la suivante, sans rien sauter ; une demande répétée ne casse rien', () => {
  const def = { id: 'x', steps: [0, 3, 0, 0] }
  const start = questStarted()
  assert.deepEqual(start, { step: 0, flags: 0, done: false })
  assert.deepEqual(questAdvance(def, start, 1), { step: 1, flags: 0, done: false })
  assert.equal(questAdvance(def, start, 2), 'order')
  assert.equal(questAdvance(def, start, 0), 'order')
  assert.equal(questAdvance(def, start, 5), 'order')
  assert.equal(questAdvance(def, start, 1.5), 'order')
  const later = { step: 2, flags: 0, done: false }
  assert.equal(questAdvance(def, later, 1), later)
  assert.equal(questAdvance(def, later, 2), later)
})

test('une étape à éléments ne se quitte que tout réuni, dans l\'ordre qu\'on veut', () => {
  const def = { id: 'x', steps: [0, 3, 0, 0] }
  let state = { step: 1, flags: 0, done: false }
  assert.equal(stepComplete(def, state), false)
  assert.equal(questAdvance(def, state, 2), 'flags')
  assert.equal(questFlag(def, state, 0, 0), 'order')
  assert.equal(questFlag(def, state, 1, 3), 'format')
  assert.equal(questFlag(def, state, 1, -1), 'format')
  for (const flag of [2, 0, 2]) state = questFlag(def, state, 1, flag)
  assert.equal(state.flags, 0b101)
  assert.equal(questAdvance(def, state, 2), 'flags')
  state = questFlag(def, state, 1, 1)
  assert.ok(stepComplete(def, state))
  assert.deepEqual(questAdvance(def, state, 2), { step: 2, flags: 0, done: false })
})

test('la dernière étape termine la quête, pour de bon', () => {
  const def = { id: 'x', steps: [0, 0] }
  const done = questAdvance(def, questAdvance(def, questStarted(), 1), 2)
  assert.deepEqual(done, { step: 2, flags: 0, done: true })
  assert.equal(questAdvance(def, done, 2), done)
  assert.equal(questFlag(def, done, 2, 0), 'done')
})

test('les pièces fermées par une quête existent, et toutes leurs portes donnent sur une pièce ouverte', () => {
  assert.deepEqual(QUEST_ROOMS.map((r) => `${r.level}:${r.room}`).sort(), ['-1:r', '0:r', '1:b', '1:f'])
  for (const { quest, level, room } of QUEST_ROOMS) {
    const map = new ShipMap(SHIP_LAYOUTS[String(level)], shipMapOptions(level))
    assert.equal(questOfRoom(level, room), quest)
    const doors = map.doors.filter((d) => [map.room(d.x, d.z), map.room(d.x + DIRS[d.dir].dx, d.z + DIRS[d.dir].dz)].includes(room))
    assert.ok(doors.length > 0, `${quest} : la pièce a une porte`)
    for (const d of doors) {
      const sides = [map.room(d.x, d.z), map.room(d.x + DIRS[d.dir].dx, d.z + DIRS[d.dir].dz)]
      const other = sides.find((r) => r !== room)
      // De l'autre côté : une pièce où l'on peut être, ni fermée par une autre quête, ni en travaux.
      assert.ok(other && questOfRoom(level, other) === null && !shipMapOptions(level).closed.includes(other), `${quest} : porte vers ${other}`)
    }
  }
  assert.equal(questOfRoom(0, 'c'), null)
  assert.equal(questOfRoom(2, 'r'), null)
  assert.equal(questOfRoom(-1, null), null)
})

test('le site suit les mêmes quêtes, aux mêmes étapes et aux mêmes récompenses (phputils/mini_shipinteriors/quest_list.php)', (t) => {
  const php = new URL('../../../phputils/mini_shipinteriors/quest_list.php', import.meta.url)
  // Le dépôt du jeu peut être cloné seul : la liste du site n'est alors pas là.
  if (!existsSync(php)) return t.skip('dépôt du site absent')
  const source = readFileSync(php, 'utf8')
  const list = source.slice(source.indexOf('const MSI_QUESTS = ['), source.indexOf('];', source.indexOf('const MSI_QUESTS = [')))
  const numbers = (s) => (s.trim() ? s.split(',').map((n) => Number(n.trim())) : [])
  const names = (s) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1])
  const site = [...list.matchAll(/'([a-z0-9-]+)' => \['steps' => \[([^\]]*)\], 'credits' => (\d+), 'items' => \[([^\]]*)\], 'skins' => \[([^\]]*)\]\]/g)]
    .map((m) => ({ id: m[1], steps: numbers(m[2]), credits: Number(m[3]), items: names(m[4]), skins: names(m[5]) }))
  assert.deepEqual(site, QUESTS.map((q) => ({ id: q.id, steps: q.steps, credits: q.reward?.credits ?? 0, items: q.reward?.items ?? [], skins: q.reward?.skins ?? [] })))
})

// ------------------------------------------------------------------ le relais

/** Faux site : un CMDR, ses quêtes terminées (à la connexion, puis à chaque demande du relais). */
const siteQuests = { done: ['poids-lourds'], known: true }
const site = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json')
  const cmdr = cookieValue(req.headers.cookie) === 'jeton-adam' ? 'Adam Fauster' : null
  if (req.url.startsWith('/outils/mini-shipinteriors-quests.php')) {
    if (!siteQuests.known) return void res.writeHead(503).end(JSON.stringify({ status: 'error', error: 'unavailable' }))
    return void res.end(JSON.stringify({
      status: 'success',
      quests: cmdr ? { ...Object.fromEntries(siteQuests.done.map((id) => [id, { step: 3, flags: 0, done: true }])), 'gamelle-vide': { step: 1, flags: 1, done: false } } : null,
    }))
  }
  if (req.url.startsWith('/outils/mini-shipinteriors-cinema.php')) return void res.end(JSON.stringify({ status: 'success', trailers: [], live: false, liveTitle: '' }))
  res.end(JSON.stringify({ cmdr, ljpc: false, voie: false, bar: false, welcome: false, quests: cmdr && siteQuests.known ? siteQuests.done : null }))
})

const listen = async (server) => {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}`
}

describe('relais : les pièces fermées par une quête', () => {
  let game, url, siteUrl
  const clients = []
  const client = (options = {}) => {
    const socket = connect(url, { path: WS_PATH, forceNew: true, reconnection: false, ...options })
    clients.push(socket)
    return socket
  }
  const next = (socket, event, accept = () => true) => new Promise((resolve) => {
    const listener = (m) => {
      if (!accept(m)) return
      socket.off(event, listener)
      resolve(m)
    }
    socket.on(event, listener)
  })
  /** Un témoin voit-il le joueur `id` arriver en (x, z) ? Sinon, le relais a refusé la position. */
  const seenAt = async (witness, mover, id, at) => {
    const seen = []
    const listener = (m) => { if (m.id === id) seen.push(m) }
    witness.on('state', listener)
    mover.emit('state', { yaw: 0, anim: 'idle', ...at })
    // Une position permise derrière : dès que le témoin la voit, celle d'avant est passée ou non.
    const landing = next(witness, 'state', (m) => m.id === id && m.level === 0 && m.x === 12 && m.z === 4)
    mover.emit('state', { x: 12, z: 4, level: 0, yaw: 0, anim: 'idle' })
    await landing
    witness.off('state', listener)
    return seen.some((m) => m.level === at.level && m.x === at.x && m.z === at.z)
  }
  /** Au milieu de chaque pièce fermée. */
  const INSIDE = { 'permis-de-tir': { x: 14, z: 1, level: -1 }, 'poids-lourds': { x: 18, z: 1, level: 0 }, 'silence-on-dribble': { x: 19, z: 13, level: 1 }, 'dernier-match': { x: 26, z: 13, level: 1 } }

  before(async () => {
    siteUrl = await listen(site)
    game = createServer()
    attachRelay(game, { log: () => {}, error: () => {}, cmdrUrl: `${siteUrl}/outils/mini-shipinteriors-cmdr.php` })
    url = await listen(game)
  })
  after(() => {
    game.close()
    site.close()
  })
  afterEach(() => {
    for (const socket of clients.splice(0)) socket.disconnect()
    siteQuests.done = ['poids-lourds']
    siteQuests.known = true
  })

  test('chaque position d\'essai est bien dans sa pièce', () => {
    for (const { quest, level, room } of QUEST_ROOMS) {
      const map = new ShipMap(SHIP_LAYOUTS[String(level)], shipMapOptions(level))
      assert.equal(map.room(INSIDE[quest].x, INSIDE[quest].z), room, quest)
    }
  })

  test('un invité n\'entre dans aucune de ces pièces, puis dans celles des quêtes qu\'il annonce terminées', async () => {
    const witness = client()
    const guest = client()
    await next(witness, 'welcome')
    const { id } = await next(guest, 'welcome')
    for (const quest of Object.keys(INSIDE)) assert.equal(await seenAt(witness, guest, id, INSIDE[quest]), false, `${quest} fermée`)
    // Un invité joue dans son navigateur : le relais le croit, pour les quêtes qu'il connaît.
    const reply = await guest.timeout(3000).emitWithAck('quests', { done: ['permis-de-tir', 'inconnue'] })
    assert.deepEqual(reply, { ok: true, done: ['permis-de-tir'] })
    assert.equal(await seenAt(witness, guest, id, INSIDE['permis-de-tir']), true)
    assert.equal(await seenAt(witness, guest, id, INSIDE['poids-lourds']), false)
  })

  test('pour un CMDR, le site fait foi : à la connexion, puis quand il annonce une quête terminée', async () => {
    const witness = client()
    const cmdr = client({ extraHeaders: { cookie: 'ED_LOGGED_CMDR_ID=jeton-adam' } })
    await next(witness, 'welcome')
    const { id, you } = await next(cmdr, 'welcome')
    assert.equal(you.verified, true)
    assert.equal(await seenAt(witness, cmdr, id, INSIDE['poids-lourds']), true, 'terminée d\'après le site')
    assert.equal(await seenAt(witness, cmdr, id, INSIDE['dernier-match']), false)
    // Il prétend avoir tout terminé : le relais redemande au site, qui n'en connaît qu'une.
    const lied = await cmdr.timeout(3000).emitWithAck('quests', { done: Object.keys(INSIDE) })
    assert.deepEqual(lied, { ok: true, done: ['poids-lourds'] })
    assert.equal(await seenAt(witness, cmdr, id, INSIDE['dernier-match']), false)
    // Il la termine pour de bon : le site le sait, le relais l'apprend.
    siteQuests.done = ['poids-lourds', 'dernier-match']
    const told = await cmdr.timeout(3000).emitWithAck('quests', { done: [] })
    assert.deepEqual(told.done.sort(), ['dernier-match', 'poids-lourds'])
    assert.equal(await seenAt(witness, cmdr, id, INSIDE['dernier-match']), true)
  })

  test('le site ne sait rien dire des quêtes (table absente) : le relais croit le CMDR, comme un invité', async () => {
    siteQuests.known = false
    const witness = client()
    const cmdr = client({ extraHeaders: { cookie: 'ED_LOGGED_CMDR_ID=jeton-adam' } })
    await next(witness, 'welcome')
    const { id } = await next(cmdr, 'welcome')
    assert.equal(await seenAt(witness, cmdr, id, INSIDE['poids-lourds']), false)
    const reply = await cmdr.timeout(3000).emitWithAck('quests', { done: ['silence-on-dribble'] })
    assert.deepEqual(reply, { ok: true, done: ['silence-on-dribble'] })
    assert.equal(await seenAt(witness, cmdr, id, INSIDE['silence-on-dribble']), true)
  })

  test('les quêtes terminées d\'un CMDR, lues sur le site ; null quand il ne sait pas', async () => {
    const options = { cmdrUrl: `${siteUrl}/outils/mini-shipinteriors-cmdr.php` }
    assert.deepEqual(await fetchQuestsDone('ED_LOGGED_CMDR_ID=jeton-adam', options), ['poids-lourds'])
    assert.equal(await fetchQuestsDone('ED_LOGGED_CMDR_ID=inconnu', options), null, 'un invité')
    assert.equal(await fetchQuestsDone('', options), null)
    siteQuests.known = false
    assert.equal(await fetchQuestsDone('ED_LOGGED_CMDR_ID=jeton-adam', options), null)
  })
})
