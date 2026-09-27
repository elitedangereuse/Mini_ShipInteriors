import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'
import { sanitizeLayout } from './cabin.js'

let server, normalizeLayout, catalog, filterArt
before(async () => {
  globalThis.document = { documentElement: { lang: 'fr' } }
  server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  ;({ normalizeLayout } = await server.ssrLoadModule('/src/cabin/layout.ts'))
  catalog = await server.ssrLoadModule('/src/cabin/catalog.ts')
  ;({ filterArt } = await server.ssrLoadModule('/src/cabin/art-choice.ts'))
})
after(async () => { await server?.close(); delete globalThis.document })
const bounds = { minX: 7.65, maxX: 15.35, minZ: 5.65, maxZ: 10.35 }
const pieces = [
  { m: 'site-card', v: 'card:3598ce6f965b2481', x: 10, z: 5.65, r: 0 },
  { m: 'site-badge', v: 'badge:f4a0b55168767494', x: 11, z: 5.65, r: 0 },
  { m: 'adventure-poster', v: 'adv:9400f1b21cb527d7', x: 12, z: 5.65, r: 0 },
]

test('les trois décorations traversent le relais et restent visibles chez un autre CMDR', () => {
  for (const id of pieces.map((p) => p.m)) assert.equal(catalog.entryOf(id).variants.length, 0)
  const sent = sanitizeLayout({ items: pieces })
  const received = normalizeLayout(sent, bounds)
  assert.deepEqual(received.items.filter((p) => p.m !== 'holo-me'), pieces)
})
test('un identifiant mal formé ou une carte dans un cadre de badge est écarté', () => {
  const result = normalizeLayout({ items: [
    { ...pieces[1], v: pieces[0].v },
    { ...pieces[0], v: 'https://other.example/image' },
    { ...pieces[2], v: 'adv:../../secret' },
    { ...pieces[0], v: '' },
    pieces[2],
  ] }, bounds)
  assert.deepEqual(result.items.filter((p) => p.m !== 'holo-me'), [pieces[2]])
})

// The relay validates ownership against the authenticated site, never client-provided URLs.
import { createServer as httpServer } from 'node:http'
import { siteArtworkAllowed } from './site.js'
test('le relais refuse un visuel non possédé ou une réponse du site indisponible', async () => {
  let mode = 'owned', calls = 0
  const site = httpServer((req, res) => {
    calls++
    assert.equal(req.url, '/outils/mini-shipinteriors-site.php?ownership=1')
    assert.equal(req.headers.cookie, 'ED_LOGGED_CMDR_ID=opaque')
    res.setHeader('Content-Type', 'application/json')
    if (mode === 'unavailable') { res.writeHead(503); res.end('{}'); return }
    res.end(JSON.stringify({ status: 'success', art: mode === 'owned' ? pieces.map((p) => ({ id: p.v, kind: p.v.split(':')[0] })) : [] }))
  })
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${site.address().port}/outils/mini-shipinteriors-cmdr.php`
  try {
    assert.equal(await siteArtworkAllowed({ items: pieces }, 'ED_LOGGED_CMDR_ID=opaque', url), true)
    mode = 'not-owned'
    assert.equal(await siteArtworkAllowed({ items: pieces }, 'ED_LOGGED_CMDR_ID=opaque', url), false)
    mode = 'unavailable'
    assert.equal(await siteArtworkAllowed({ items: pieces }, 'ED_LOGGED_CMDR_ID=opaque', url), false)
    assert.equal(await siteArtworkAllowed({ items: pieces }, '', ''), false)
    const before = calls
    assert.equal(await siteArtworkAllowed({ items: [{ m: 'sofa' }] }, '', ''), true)
    assert.equal(calls, before)
  } finally { await new Promise((resolve) => site.close(resolve)) }
})

// Large collections remain searchable without altering the selected artwork or inventing choices.
test('la recherche de cartes ignore accents, casse et ordre des mots', () => {
  const choices = [{ id: 'a', label: 'Élite — Carte de Comète' }, { id: 'b', label: 'Carte de voyage' }]
  assert.deepEqual(filterArt(choices, ' COMETE elite '), [choices[0]])
  assert.deepEqual(filterArt(choices, 'carte'), choices)
  assert.deepEqual(filterArt(choices, '  '), choices)
  assert.deepEqual(filterArt(choices, 'introuvable'), [])
  assert.equal(choices.length, 2)
})
