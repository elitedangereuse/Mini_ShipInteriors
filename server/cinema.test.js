import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { cinemaOperator, createCinema, PROJECTION_SEAT } from './cinema.js'

const trailer = { id: 42, title: 'Le Détournement', image: '/outils/mini-shipinteriors-cinema.php?image=42', video: 'JMo_6uawuBg' }

test('la régie choisit la séance commune, qui s’arrête pour tous à la fin du trailer', async () => {
  let payload = { status: 'success', trailers: [trailer], live: false, liveTitle: '' }
  const site = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload)) })
  site.listen(0, '127.0.0.1')
  await once(site, 'listening')
  const players = [
    { id: 1, level: 1, x: 24, z: 5, pose: 'sit' },
    { id: 2, ...PROJECTION_SEAT, pose: 'sit' },
  ]
  const sent = []
  let clock = Date.now()
  let scheduled = null
  const cinema = createCinema({ cmdrUrl: `http://127.0.0.1:${site.address().port}`, players: () => players,
    emit: (_name, state) => sent.push(state), error: () => {}, now: () => clock,
    schedule: (fn, ms) => { scheduled = { fn, ms, unref() {} }; return scheduled },
    cancel: (timer) => { if (scheduled === timer) scheduled = null },
  })
  try {
    await cinema.refresh()
    assert.equal(cinemaOperator(players), 2)
    assert.equal(await cinema.choose(players[0], 42), 'seat')
    assert.equal(cinema.snapshot().selected, null)
    assert.equal(await cinema.choose(players[1], 42), null)
    const snapshot = cinema.snapshot()
    assert.equal(snapshot.selected, 42)
    assert.ok(snapshot.since > 0 && snapshot.now >= snapshot.since)
    assert.equal(snapshot.trailers[0].video, trailer.video)
    assert.equal(sent.at(-1).selected, 42)

    assert.equal(cinema.reportDuration(42, snapshot.since - 1, 5), false)
    assert.equal(cinema.reportDuration(42, snapshot.since, 5), true)
    assert.equal(scheduled.ms, 5000)
    clock += 5000
    scheduled.fn()
    assert.equal(cinema.snapshot().selected, null)
    assert.equal(cinema.snapshot().since, 0)
    assert.equal(sent.at(-1).selected, null)

    assert.equal(await cinema.choose(players[1], 42), null)

    assert.equal(cinema.reportDuration(42, cinema.snapshot().since, 5), true)
    assert.equal(await cinema.choose(players[1], null), null)
    assert.equal(scheduled, null)
    assert.equal(cinema.snapshot().selected, null)
    assert.equal(cinema.snapshot().since, 0)
    assert.equal(sent.at(-1).selected, null)
    assert.equal(await cinema.choose(players[1], 42), null)

    payload = { ...payload, live: true, liveTitle: 'En direct' }
    await cinema.refresh(true)
    assert.equal(cinema.snapshot().live, true)
    assert.equal(cinema.snapshot().selected, null)
    assert.equal(await cinema.choose(players[1], 42), 'live')
    assert.equal(sent.at(-1).live, true)
  } finally {
    cinema.dispose()
    site.closeAllConnections()
    site.close()
  }
})

test('la régie cherche une vidéo YouTube et la diffuse à tous, sauf pendant un direct Twitch', async () => {
  let payload = { status: 'success', trailers: [trailer], live: false, liveTitle: '' }
  const site = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload)) })
  site.listen(0, '127.0.0.1')
  await once(site, 'listening')
  const audience = { id: 1, level: 1, x: 24, z: 5, pose: 'sit' }
  const operator = { id: 2, ...PROJECTION_SEAT, pose: 'sit' }
  const sent = []
  let clock = Date.now()
  let scheduled = null
  let searches = 0
  const youtube = { video: 'dQw4w9WgXcQ', title: 'Une vidéo quelconque', image: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' }
  const cinema = createCinema({ cmdrUrl: `http://127.0.0.1:${site.address().port}`, players: () => [audience, operator],
    emit: (_name, state) => sent.push(state), error: () => {}, now: () => clock, youtubeKey: 'test-secret',
    fetcher: async (url) => {
      searches++
      assert.equal(url.searchParams.get('key'), 'test-secret')
      assert.equal(url.searchParams.get('videoEmbeddable'), 'true')
      return { ok: true, json: async () => ({ items: [
        { id: { videoId: youtube.video }, snippet: { title: youtube.title, liveBroadcastContent: 'none' } },
        { id: { videoId: 'invalid' }, snippet: { title: 'Invalid' } },
      ] }) }
    },
    schedule: (fn, ms) => { scheduled = { fn, ms, unref() {} }; return scheduled },
    cancel: (timer) => { if (scheduled === timer) scheduled = null },
  })
  try {
    assert.equal((await cinema.search(audience, 'quelconque')).reason, 'seat')
    assert.equal((await cinema.search(operator, 'quelconque')).videos[0].video, youtube.video)
    assert.equal((await cinema.search(operator, 'quelconque')).videos.length, 1)
    assert.equal(searches, 1, 'une même recherche utilise le cache')
    assert.equal(await cinema.chooseVideo(audience, youtube.video), 'seat')
    assert.equal(await cinema.chooseVideo(operator, 'abcdefghijk'), 'invalid')
    assert.equal(await cinema.chooseVideo(operator, youtube.video), null)
    const state = cinema.snapshot()
    assert.deepEqual(state.youtube, youtube)
    assert.equal(state.selected, null)
    assert.deepEqual(sent.at(-1).youtube, youtube)
    assert.equal(cinema.reportDuration(youtube.video, state.since, 5400), true)
    assert.equal(scheduled.ms, 5400000)
    clock += 5400000
    scheduled.fn()
    assert.equal(cinema.snapshot().youtube, null)
    assert.equal(cinema.snapshot().since, 0)
    payload = { ...payload, live: true }
    await cinema.refresh(true)
    assert.equal((await cinema.search(operator, 'quelconque')).reason, 'live')
    assert.equal(await cinema.chooseVideo(operator, youtube.video), 'live')
  } finally {
    cinema.dispose()
    site.closeAllConnections()
    site.close()
  }
})

test('sans clé API, un lien YouTube peut tout de même être projeté', async () => {
  const operator = { id: 3, ...PROJECTION_SEAT, pose: 'sit' }
  const cinema = createCinema({ cmdrUrl: '', players: () => [operator], emit: () => {}, error: () => {}, youtubeKey: '' })
  try {
    assert.equal((await cinema.search(operator, 'exploration spatiale')).reason, 'unavailable')
    assert.equal((await cinema.search(operator, 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ')).reason, 'unavailable')
    const found = await cinema.search(operator, 'https://youtu.be/dQw4w9WgXcQ?t=4')
    assert.equal(found.videos[0].video, 'dQw4w9WgXcQ')
    assert.equal(await cinema.chooseVideo(operator, found.videos[0].video), null)
    assert.equal(cinema.snapshot().youtube.video, 'dQw4w9WgXcQ')
  } finally { cinema.dispose() }
})
