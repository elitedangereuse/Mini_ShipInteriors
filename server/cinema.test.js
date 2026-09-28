import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { cinemaOperator, createCinema, PROJECTION_SEAT } from './cinema.js'

const trailer = { id: 42, title: 'Le Détournement', image: '/outils/mini-shipinteriors-cinema.php?image=42', video: 'JMo_6uawuBg' }

test('seul le fauteuil de régie choisit la séance commune ; un arrivant retrouve son temps de départ', async () => {
  let payload = { status: 'success', trailers: [trailer], live: false, liveTitle: '' }
  const site = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload)) })
  site.listen(0, '127.0.0.1')
  await once(site, 'listening')
  const players = [
    { id: 1, level: 1, x: 24, z: 5, pose: 'sit' },
    { id: 2, ...PROJECTION_SEAT, pose: 'sit' },
  ]
  const sent = []
  const cinema = createCinema({ cmdrUrl: `http://127.0.0.1:${site.address().port}`, players: () => players, emit: (_name, state) => sent.push(state), error: () => {} })
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

    assert.equal(await cinema.choose(players[1], null), null)
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
