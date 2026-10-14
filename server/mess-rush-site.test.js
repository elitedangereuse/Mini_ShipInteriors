// MESS RUSH et le site (server/site.js, postMessRushResult) : ce que le relais envoie, et ce qu'il
// comprend de chaque réponse (cf. docs/mess-rush-site.md).
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { postMessRushResult } from './site.js'

const RESULT = { game: '9f2c4e1a7b3d5c60', version: 1, startedAt: 1792000000000, endedAt: 1792000300000, duration: 300, players: 2, score: 412, medal: 'silver', won: true, served: 11, expired: 2, bestCombo: 6, wasted: 0 }
const OPTS = { cmdrUrl: 'https://site.test/outils/mini-shipinteriors-cmdr.php', secret: 'clé', error: () => {} }
const reply = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => (body === undefined ? Promise.reject(new Error('vide')) : body) })

test('la requête : l\'endpoint du site, le cookie du joueur, la clé du relais, le résultat tel quel', async () => {
  let seen
  await postMessRushResult('ED_LOGGED_CMDR_ID=jeton', RESULT, { ...OPTS, fetcher: async (url, init) => { seen = { url: String(url), init }; return reply(200, { status: 'success', reward: 'none' })() } })
  assert.equal(seen.url, 'https://site.test/outils/mini-shipinteriors-messrush.php')
  assert.equal(seen.init.method, 'POST')
  assert.equal(seen.init.headers.Cookie, 'ED_LOGGED_CMDR_ID=jeton')
  assert.equal(seen.init.headers['X-Relay-Key'], 'clé')
  assert.equal(seen.init.redirect, 'error')
  assert.deepEqual(JSON.parse(seen.init.body), RESULT)
})

test('le booster de la semaine, les crédits, le plafond, une partie déjà présentée', async () => {
  assert.deepEqual(
    await postMessRushResult('ED_LOGGED_CMDR_ID=jeton', RESULT, { ...OPTS, fetcher: reply(200, { status: 'success', reward: 'booster', boosters: 1, earned: 0, balance: 184200, already: false, week: '2026-10-15T07:00:00Z' }) }),
    { status: 'success', reward: 'booster', boosters: 1, earned: 0, balance: 184200, already: false, week: '2026-10-15T07:00:00Z' },
  )
  assert.deepEqual(
    await postMessRushResult('ED_LOGGED_CMDR_ID=jeton', RESULT, { ...OPTS, fetcher: reply(200, { status: 'success', reward: 'credits', earned: 2000, balance: 32000, already: true }) }),
    { status: 'success', reward: 'credits', boosters: 0, earned: 2000, balance: 32000, already: true },
  )
  assert.equal((await postMessRushResult('ED_LOGGED_CMDR_ID=jeton', RESULT, { ...OPTS, fetcher: reply(200, { status: 'success', reward: 'capped' }) })).reward, 'capped')
  // Une récompense inconnue n'est pas annoncée.
  assert.equal((await postMessRushResult('ED_LOGGED_CMDR_ID=jeton', RESULT, { ...OPTS, fetcher: reply(200, { status: 'success', reward: 'voiture' }) })).reward, 'none')
})

test('pas encore d\'endpoint (404) ou pas de clé : les récompenses ne sont pas en service', async () => {
  assert.deepEqual(await postMessRushResult('ED_LOGGED_CMDR_ID=jeton', RESULT, { ...OPTS, fetcher: reply(404, undefined) }), { status: 'unavailable' })
  assert.deepEqual(await postMessRushResult('ED_LOGGED_CMDR_ID=jeton', RESULT, { ...OPTS, secret: '', fetcher: reply(200, {}) }), { status: 'unavailable' })
})

test('refusé par le site (clé, compte, résultat invalide), ou sans cookie : pas de nouvelle tentative', async () => {
  assert.deepEqual(await postMessRushResult('ED_LOGGED_CMDR_ID=jeton', RESULT, { ...OPTS, fetcher: reply(422, { status: 'error', error: 'invalid' }) }), { status: 'refused', code: 'invalid' })
  assert.deepEqual(await postMessRushResult('ED_LOGGED_CMDR_ID=jeton', RESULT, { ...OPTS, fetcher: reply(401, { error: 'key' }) }), { status: 'refused', code: 'key' })
  assert.deepEqual(await postMessRushResult(null, RESULT, { ...OPTS, fetcher: reply(200, {}) }), { status: 'refused', code: 'cmdr' })
})

test('site en erreur ou injoignable : on pourra lui représenter la même partie', async () => {
  assert.deepEqual(await postMessRushResult('ED_LOGGED_CMDR_ID=jeton', RESULT, { ...OPTS, fetcher: reply(502, { error: 'down' }) }), { status: 'retry' })
  assert.deepEqual(await postMessRushResult('ED_LOGGED_CMDR_ID=jeton', RESULT, { ...OPTS, fetcher: reply(200, undefined) }), { status: 'retry' })
  assert.deepEqual(await postMessRushResult('ED_LOGGED_CMDR_ID=jeton', RESULT, { ...OPTS, fetcher: async () => { throw new Error('ECONNREFUSED') } }), { status: 'retry' })
})
