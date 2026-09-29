// Ronde du sergent (shared/patrol.js) : la même position partout pour un même instant, sans saut
// d'un tour à l'autre, et une horloge que l'arrêt fige puis relâche.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PATROL_HOLD, PATROL_PERIOD, PATROL_POSTS, PATROL_SPEED, holdPatrol, patrolAt, patrolTime } from '../shared/patrol.js'

test('le sergent avance sans jamais sauter, y compris d\'un tour au suivant', () => {
  const dt = 0.01
  let prev = patrolAt(-dt)
  for (let t = 0; t <= PATROL_PERIOD * 1.2; t += dt) {
    const at = patrolAt(t)
    assert.ok(Number.isFinite(at.x) && Number.isFinite(at.z) && Number.isFinite(at.yaw))
    assert.ok(Math.hypot(at.x - prev.x, at.z - prev.z) <= PATROL_SPEED * dt + 1e-6, `saut à t = ${t.toFixed(2)}`)
    prev = at
  }
})

test('il s\'arrête à chaque poste, le temps de sa garde', () => {
  for (const [index, post] of PATROL_POSTS.entries()) {
    const [x, z] = post.path[post.path.length - 1]
    let watched = 0
    for (let t = 0; t < PATROL_PERIOD; t += 0.05) {
      const at = patrolAt(t)
      if (!at.walking && at.post === index && at.x === x && at.z === z) watched += 0.05
    }
    assert.ok(Math.abs(watched - post.watch) < 0.11, `poste ${index} (${post.room}) : ${watched.toFixed(2)} s`)
  }
})

test('pour un même instant, le même sergent, quel que soit le tour', () => {
  for (const t of [0.5, 3.3, 17.8, 42.42]) {
    const a = patrolAt(t), b = patrolAt(t + PATROL_PERIOD * 3)
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-6 && Math.abs(a.yaw - b.yaw) < 1e-6)
    assert.equal(a.post, b.post)
  }
})

test('lui parler fige la ronde, qui reprend ensuite là où elle s\'était arrêtée', () => {
  const start = { tau: 10, at: 1000, holdUntil: 0 }
  assert.equal(patrolTime(start, 3000), 12)
  const held = holdPatrol(start, 3000)
  assert.equal(patrolTime(held, 3000 + PATROL_HOLD * 500), 12)
  // Une seconde réplique relance l'arrêt, sans l'additionner à la première.
  const again = holdPatrol(held, 5000)
  assert.equal(again.holdUntil, 5000 + PATROL_HOLD * 1000)
  assert.equal(patrolTime(again, again.holdUntil), 12)
  assert.equal(patrolTime(again, again.holdUntil + 2000), 14)
})
