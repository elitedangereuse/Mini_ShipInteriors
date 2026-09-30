// Tournée de la jardinière de la serre (shared/gardener.js) : la même position partout pour un
// même instant, sans saut, toujours dans la serre et jamais à travers un bac ou un meuble ; elle va
// attendre son aide sur les pas japonais et revient ; une horloge que l'arrêt et les fiches de
// culture figent, puis relâchent.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  GARDEN_CATCH_UP, GARDEN_HOLD, GARDEN_LEVEL, GARDEN_OBSTACLES, GARDEN_PERIOD, GARDEN_POSTS, GARDEN_ROOM, GARDEN_SNAP, GARDEN_SPEED, GARDEN_WAIT,
  gardenAt, gardenClear, gardenReturn, gardenRoute, gardenStep, gardenTime, helpGarden, holdGarden,
} from '../shared/gardener.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { ShipMap } from '../shared/ship-map.js'

const map = new ShipMap(SHIP_LAYOUTS[GARDEN_LEVEL], shipMapOptions(GARDEN_LEVEL))

/** Dans un meuble, à sa carrure près (un peu moins que celle des trajets) : elle n'y passe jamais. */
const inFurniture = ({ x, z }) => GARDEN_OBSTACLES.find((r) => x > r.minX - 0.12 && x < r.maxX + 0.12 && z > r.minZ - 0.12 && z < r.maxZ + 0.12)
/** Dans la serre, à distance des murs (faces intérieures à 0,15 des bords des tuiles). */
const inRoom = ({ x, z }) => map.room(Math.round(x), Math.round(z)) === GARDEN_ROOM && x > -0.35 && x < 7.35 && z > -0.35 && z < 6.35
const at = ({ x, z }) => `(${x.toFixed(2)}, ${z.toFixed(2)})`

test('la serre, agrandie vers la poupe, s\'ouvre sur la coursive par sa porte', () => {
  let tiles = 0
  for (let z = 0; z <= 6; z++) for (let x = 0; x <= 7; x++) if (map.room(x, z) === GARDEN_ROOM) tiles++
  assert.ok(tiles >= 50, `${tiles} tuiles`)
  // Les coins cassés.
  for (const [x, z] of [[0, 0], [1, 0], [0, 1], [0, 6]]) assert.equal(map.room(x, z), null, `tuile (${x}, ${z})`)
  // La porte, entre la serre et la coursive.
  assert.equal(map.room(7, 4), GARDEN_ROOM)
  assert.equal(map.room(9, 4), 'c')
  assert.ok(map.doors.some((d) => d.x === 8 && d.z === 4))
})

test('elle avance sans jamais sauter, y compris d\'un tour au suivant', () => {
  const dt = 0.01
  let prev = gardenAt(-dt)
  for (let t = 0; t <= GARDEN_PERIOD * 1.2; t += dt) {
    const p = gardenAt(t)
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.yaw))
    assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) <= GARDEN_SPEED * dt + 1e-6, `saut à t = ${t.toFixed(2)}`)
    prev = p
  }
})

test('elle reste dans la serre, et ne traverse ni un bac ni un meuble', () => {
  for (let t = 0; t < GARDEN_PERIOD; t += 0.02) {
    const p = gardenAt(t)
    assert.ok(inRoom(p), `hors de la serre en ${at(p)}`)
    assert.ok(!inFurniture(p), `dans un meuble en ${at(p)}`)
  }
  assert.ok(inRoom(GARDEN_WAIT) && !inFurniture(GARDEN_WAIT))
})

test('elle travaille à chaque poste le temps prévu', () => {
  for (const [index, post] of GARDEN_POSTS.entries()) {
    let worked = 0
    for (let t = 0; t < GARDEN_PERIOD; t += 0.05) {
      const p = gardenAt(t)
      if (!p.walking && p.post === index && p.x === post.x && p.z === post.z) worked += 0.05
    }
    assert.ok(Math.abs(worked - post.watch) < 0.11, `poste ${index} (${post.at}) : ${worked.toFixed(2)} s`)
  }
})

test('ses trajets contournent les bacs', () => {
  // Du pied de l'arbre (ouest) à la cuve (nord-est) : les bacs potagers sont entre les deux.
  const from = { x: 1.3, z: 2.2 }, to = { x: 5.95, z: 0.6 }
  for (const [a, b] of [[from, to], [{ x: 4.0, z: 4.45 }, { x: 3.9, z: 0.7 }]]) {
    const route = gardenRoute(a, b)
    let prev = [a.x, a.z]
    for (const p of route) {
      assert.ok(gardenClear(prev, p), `segment ${at({ x: prev[0], z: prev[1] })} → ${at({ x: p[0], z: p[1] })}`)
      prev = p
    }
    assert.deepEqual(route.at(-1), [b.x, b.z])
  }
  // Le long des pas japonais : tout droit.
  assert.deepEqual(gardenRoute({ x: 2.6, z: 4.0 }, { x: 6.8, z: 4.0 }), [[6.8, 4.0]])
})

/** Une image du jeu : elle avance vers sa place comme dans src/gardener.ts. */
const DT = 1 / 30
const frame = (pos, goal) => gardenStep(pos, goal, GARDEN_SPEED * GARDEN_CATCH_UP * DT)

test('elle suit sa tournée pas à pas, sans détour', () => {
  let pos = gardenAt(0)
  for (let t = DT; t < GARDEN_PERIOD * 1.2; t += DT) {
    const s = frame(pos, gardenAt(t))
    assert.ok(s.left < 0.1, `écart de ${s.left.toFixed(2)} à t = ${t.toFixed(2)}`)
    pos = s
    assert.ok(!inFurniture(pos), `dans un meuble en ${at(pos)}`)
  }
})

test('d\'où qu\'elle parte, elle rejoint les pas japonais puis revient à sa place, sans sauter ni traverser un meuble', () => {
  for (let t0 = 0; t0 < GARDEN_PERIOD; t0 += 0.9) {
    let pos = gardenAt(t0)
    const when = `fiche à t = ${t0.toFixed(1)}`
    const walk = (goalAt, seconds) => {
      for (let t = 0; t < seconds; t += DT) {
        const s = frame(pos, goalAt(t))
        assert.ok(s.left <= GARDEN_SNAP, `${when} : elle aurait sauté (${s.left.toFixed(2)})`)
        pos = s
        assert.ok(!inFurniture(pos), `${when} : dans un meuble en ${at(pos)}`)
        assert.ok(inRoom(pos), `${when} : hors de la serre en ${at(pos)}`)
      }
    }
    walk(() => GARDEN_WAIT, 25)
    assert.ok(Math.hypot(pos.x - GARDEN_WAIT.x, pos.z - GARDEN_WAIT.z) < 0.01, `${when} : pas arrivée aux pas japonais`)
    walk(() => gardenAt(t0), gardenReturn(t0))
    const home = gardenAt(t0)
    assert.ok(Math.hypot(pos.x - home.x, pos.z - home.z) < 0.01, `${when} : pas revenue à temps`)
    walk((t) => gardenAt(t0 + t), 6)
  }
})

test('lui parler fige la tournée quelques secondes', () => {
  const start = { tau: 10, at: 1000, holdUntil: 0 }
  const held = holdGarden(start, 3000)
  assert.equal(held.holdUntil, 3000 + GARDEN_HOLD * 1000)
  assert.equal(gardenTime(held, held.holdUntil), 12)
  assert.equal(gardenTime(held, held.holdUntil + 1000), 13)
})

test('une fiche de culture la retient sur les pas japonais, puis lui laisse le temps de revenir', () => {
  const start = { tau: 20, at: 0, holdUntil: 0 }
  const back = gardenReturn(22) * 1000
  const helping = helpGarden(start, 2000, 30000)
  assert.equal(gardenTime(helping, 29000), 22)
  assert.ok(Math.abs(helping.holdUntil - (30000 + back)) < 1e-6)
  const done = helpGarden(helping, 12000, 0)
  assert.equal(gardenTime(done, 12000), 22)
  assert.ok(Math.abs(done.holdUntil - (12000 + back)) < 1e-6)
})
