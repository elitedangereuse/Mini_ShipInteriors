// Base au sol (shared/ground-base.js) : un plateau d'un seul tenant, des arrivées sur son sol, et la
// ronde d'Ada, sans saut et sans jamais quitter le plateau.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DIRS, ShipMap } from '../shared/ship-map.js'
import {
  BASE_ARRIVAL, BASE_COCKPIT, BASE_LADDER, BASE_LAYOUT, CHIEF_HOLD, CHIEF_PERIOD, CHIEF_POSTS, CHIEF_SPEED, chiefAt, chiefTime, holdChief, inBaseCockpit,
  BASE_LEVEL,
} from '../shared/ground-base.js'

const map = new ShipMap(BASE_LAYOUT)
const onPlateau = (x, z) => map.isFloor(Math.round(x), Math.round(z))

test('le plateau est d\'un seul tenant : on atteint chaque tuile depuis l\'arrivée', () => {
  const start = `${Math.round(BASE_ARRIVAL.x)},${Math.round(BASE_ARRIVAL.z)}`
  const seen = new Set([start])
  const todo = [start]
  while (todo.length) {
    const [x, z] = todo.pop().split(',').map(Number)
    for (const d of DIRS) {
      const k = `${x + d.dx},${z + d.dz}`
      if (!seen.has(k) && map.isFloor(x + d.dx, z + d.dz)) {
        seen.add(k)
        todo.push(k)
      }
    }
  }
  let floor = 0
  for (let z = 0; z < map.height; z++) for (let x = 0; x < map.width; x++) if (map.isFloor(x, z)) floor++
  assert.equal(seen.size, floor)
  // Et il tient dans les bornes des positions que le relais accepte (x de -5 à 50, z de -5 à 30).
  assert.ok(map.width <= 50 && map.height <= 30)
})

test('l\'arrivée, l\'escabeau et le cockpit du Krait sont sur le plateau', () => {
  for (const p of [BASE_ARRIVAL, BASE_LADDER, BASE_COCKPIT]) assert.ok(onPlateau(p.x, p.z), `${p.x}, ${p.z}`)
  assert.ok(inBaseCockpit({ level: BASE_LEVEL, pose: 'pilot', x: BASE_COCKPIT.x + 0.2, z: BASE_COCKPIT.z }))
  assert.ok(!inBaseCockpit({ level: BASE_LEVEL, pose: 'sit', x: BASE_COCKPIT.x, z: BASE_COCKPIT.z }))
  assert.ok(!inBaseCockpit({ level: -1, pose: 'pilot', x: BASE_COCKPIT.x, z: BASE_COCKPIT.z }))
})

test('Ada avance sans jamais sauter, et sans quitter le plateau', () => {
  const dt = 0.01
  let prev = chiefAt(-dt)
  for (let t = 0; t <= CHIEF_PERIOD * 1.2; t += dt) {
    const at = chiefAt(t)
    assert.ok(Number.isFinite(at.x) && Number.isFinite(at.z) && Number.isFinite(at.yaw))
    assert.ok(Math.hypot(at.x - prev.x, at.z - prev.z) <= CHIEF_SPEED * dt + 1e-6, `saut à t = ${t.toFixed(2)}`)
    assert.ok(onPlateau(at.x, at.z), `hors du plateau à t = ${t.toFixed(2)}`)
    prev = at
  }
})

test('elle s\'arrête à chaque poste, le temps prévu, et lui parler fige sa ronde', () => {
  for (const [index, post] of CHIEF_POSTS.entries()) {
    const [x, z] = post.path[post.path.length - 1]
    let watched = 0
    for (let t = 0; t < CHIEF_PERIOD; t += 0.05) {
      const at = chiefAt(t)
      if (!at.walking && at.post === index && at.x === x && at.z === z) watched += 0.05
    }
    assert.ok(Math.abs(watched - post.watch) < 0.11, `poste ${index} (${post.at}) : ${watched.toFixed(2)} s`)
  }
  const held = holdChief({ tau: 10, at: 1000, holdUntil: 0 }, 3000)
  assert.equal(chiefTime(held, 3000 + CHIEF_HOLD * 500), 12)
  assert.equal(chiefTime(held, held.holdUntil + 1000), 13)
})
