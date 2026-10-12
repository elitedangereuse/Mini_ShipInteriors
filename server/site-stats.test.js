// La fréquentation racontée au site : relevés, sessions, temps par pièce, et ce qui attend quand
// le site ne répond pas.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSiteStats } from './site-stats.js'

function setup({ ok = () => true, arena = () => null } = {}) {
  const sent = []
  const players = new Set()
  let at = 1_000_000_000_000
  const stats = createSiteStats({
    cmdrUrl: 'https://site.test/outils/mini-shipinteriors-cmdr.php', secret: 'clé', timers: false, players: () => players, zoneOf: (p) => p.zone,
    arena, now: () => at,
    fetcher: async (url, init) => {
      const body = JSON.parse(init.body)
      sent.push({ url: String(url), key: init.headers['X-Relay-Key'], body })
      const fine = ok()
      return { ok: fine, status: fine ? 200 : 503, json: async () => ({ status: fine ? 'success' : 'error' }) }
    },
  })
  const join = (p) => (players.add(p), stats.open(p), p)
  const leave = (p) => (stats.close(p), players.delete(p))
  return { stats, sent, join, leave, wait: (s) => (at += s * 1000) }
}

test('un relevé dit qui est à bord, le pic, les sessions et le temps par pièce', async () => {
  const { stats, sent, join, leave, wait } = setup()
  const adam = join({ stored: 'Adam+fauster', zone: '0:e' })
  const guest = join({ stored: '', zone: '-5' })
  stats.tick()
  stats.tick()
  wait(60)
  leave(guest)
  assert.equal(await stats.pulse(), true)
  const { url, key, body } = sent[0]
  assert.equal(url, 'https://site.test/outils/mini-shipinteriors-stats.php')
  assert.equal(key, 'clé')
  assert.deepEqual(body.samples.map(({ players, cmdrs, peak }) => ({ players, cmdrs, peak })), [{ players: 1, cmdrs: 1, peak: 2 }])
  assert.deepEqual(body.zones, { '0:e': 30, '-5': 30 })
  assert.deepEqual(body.sessions.map((s) => [s.cmdr, s.seconds]), [['', 60], ['Adam+fauster', 60]])
  assert.match(body.sessions[0].id, /^[0-9a-f]{16}$/)

  // Le relevé suivant : la session finie n'est pas renvoyée, celle en cours l'est avec sa durée du moment.
  wait(300)
  await stats.pulse()
  assert.deepEqual(sent[1].body.sessions.map((s) => [s.cmdr, s.seconds]), [['Adam+fauster', 360]])
  assert.equal(sent[1].body.sessions[0].id, body.sessions[1].id)
  assert.deepEqual(sent[1].body.zones, {})
  assert.equal(sent[1].body.samples.length, 1)
  leave(adam)
})

test('ce que le site n\'a pas reçu attend le relevé suivant', async () => {
  let up = false
  const { stats, sent, join, leave, wait } = setup({ ok: () => up })
  const p = join({ stored: '', zone: '1:n' })
  stats.tick()
  wait(90)
  leave(p)
  assert.equal(await stats.pulse(), false)
  up = true
  wait(300)
  assert.equal(await stats.pulse(), true)
  assert.equal(sent[1].body.samples.length, 2)
  assert.deepEqual(sent[1].body.zones, { '1:n': 15 })
  assert.equal(sent[1].body.sessions.length, 1)
  await stats.pulse()
  assert.equal(sent[2].body.sessions.length, 0)
})

test('une session de quelques secondes ne compte pas', async () => {
  const { stats, sent, join, leave, wait } = setup()
  const p = join({ stored: '', zone: '0:c' })
  wait(5)
  leave(p)
  await stats.pulse()
  assert.deepEqual(sent[0].body.sessions, [])
})

test('les statistiques de l\'arène ne partent que si elles ont changé', async () => {
  const data = { games: 1, updated: 1, rows: { 'human|rourke': { picks: 1 } } }
  const { stats, sent } = setup({ arena: () => data })
  await stats.pulse()
  await stats.pulse()
  data.games = 2
  data.updated = 2
  await stats.pulse()
  assert.deepEqual(sent.map((s) => s.body.arena?.games), [1, undefined, 2])
})

test('sans clé du relais, rien ne part', async () => {
  const stats = createSiteStats({ cmdrUrl: 'https://site.test/x', secret: '', fetcher: () => assert.fail('aucun envoi attendu') })
  stats.open({})
  assert.equal(await stats.pulse(), false)
})
