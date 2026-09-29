// Tournée du chef (shared/chef.js) : la même position partout pour un même instant, sans saut,
// toujours dans le mess et jamais à travers le comptoir ; une horloge que l'arrêt et les commandes
// figent, puis relâchent.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CHEF_CATCH_UP, CHEF_HOLD, CHEF_LEVEL, CHEF_PASSE, CHEF_PERIOD, CHEF_POSTS, CHEF_ROOM, CHEF_SNAP, CHEF_SPEED, CHEF_WAIT,
  chefAt, chefReturn, chefRoute, chefStep, chefTime, cookChef, holdChef, pathLength,
} from '../shared/chef.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { ShipMap } from '../shared/ship-map.js'

const map = new ShipMap(SHIP_LAYOUTS[CHEF_LEVEL], shipMapOptions(CHEF_LEVEL))
/** Le comptoir du self (cf. src/levels.ts), un peu élargi : on ne le traverse pas. */
const COUNTER = { minX: 8.5, maxX: 13.95, minZ: 9.6, maxZ: 10.35 }

test('le chef avance sans jamais sauter, y compris d\'un tour au suivant', () => {
  const dt = 0.01
  let prev = chefAt(-dt)
  for (let t = 0; t <= CHEF_PERIOD * 1.2; t += dt) {
    const at = chefAt(t)
    assert.ok(Number.isFinite(at.x) && Number.isFinite(at.z) && Number.isFinite(at.yaw))
    assert.ok(Math.hypot(at.x - prev.x, at.z - prev.z) <= CHEF_SPEED * dt + 1e-6, `saut à t = ${t.toFixed(2)}`)
    prev = at
  }
})

test('il reste dans le mess, et ne passe jamais à travers le comptoir', () => {
  for (let t = 0; t < CHEF_PERIOD; t += 0.02) {
    const { x, z } = chefAt(t)
    assert.equal(map.room(Math.round(x), Math.round(z)), CHEF_ROOM, `hors du mess en (${x.toFixed(2)}, ${z.toFixed(2)})`)
    const inCounter = x > COUNTER.minX && x < COUNTER.maxX && z > COUNTER.minZ && z < COUNTER.maxZ
    assert.ok(!inCounter, `dans le comptoir en (${x.toFixed(2)}, ${z.toFixed(2)})`)
  }
})

test('il travaille à chaque poste, le temps prévu', () => {
  for (const [index, post] of CHEF_POSTS.entries()) {
    const [x, z] = post.path[post.path.length - 1]
    let worked = 0
    for (let t = 0; t < CHEF_PERIOD; t += 0.05) {
      const at = chefAt(t)
      if (!at.walking && at.post === index && at.x === x && at.z === z) worked += 0.05
    }
    assert.ok(Math.abs(worked - post.watch) < 0.11, `poste ${index} (${post.at}) : ${worked.toFixed(2)} s`)
  }
})

test('pour changer de côté du comptoir, il passe par le passage', () => {
  const route = chefRoute({ x: 12, z: 9.2 }, CHEF_PASSE)
  assert.equal(route.length, 3)
  assert.deepEqual(route.at(-1), [CHEF_PASSE.x, CHEF_PASSE.z])
  for (const [x] of route.slice(0, 2)) assert.ok(x > COUNTER.maxX)
  // Du même côté : tout droit.
  assert.deepEqual(chefRoute({ x: 9.15, z: 11.45 }, CHEF_PASSE), [[CHEF_PASSE.x, CHEF_PASSE.z]])
  assert.ok(Math.abs(pathLength([[0, 0], [3, 4], [3, 5]]) - 6) < 1e-9)
})

/** Dans le comptoir (élargi) : le chef n'y passe jamais. */
const inCounter = ({ x, z }) => x > COUNTER.minX && x < COUNTER.maxX && z > COUNTER.minZ && z < COUNTER.maxZ
/** Une image du jeu : il avance vers sa place comme dans src/chef.ts. */
const DT = 1 / 30
const frame = (pos, goal) => chefStep(pos, goal, CHEF_SPEED * CHEF_CATCH_UP * DT)

test('il suit sa tournée pas à pas, sans détour ni demi-tour, même au passage du comptoir', () => {
  let pos = chefAt(0)
  for (let t = DT; t < CHEF_PERIOD * 1.2; t += DT) {
    const s = frame(pos, chefAt(t))
    // Toujours sur sa place, à un pas près : jamais renvoyé de l'autre côté du passage.
    assert.ok(s.left < 0.1, `écart de ${s.left.toFixed(2)} à t = ${t.toFixed(2)}`)
    pos = s
    assert.ok(!inCounter(pos), `dans le comptoir en (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`)
  }
})

test('d\'où qu\'il parte, il rejoint le bout du self puis revient à sa place, sans sauter ni traverser le comptoir', () => {
  for (let t0 = 0; t0 < CHEF_PERIOD; t0 += 0.7) {
    let pos = chefAt(t0)
    const at = `commande prise à t = ${t0.toFixed(1)}`
    const walk = (goalAt, seconds) => {
      for (let t = 0; t < seconds; t += DT) {
        const s = frame(pos, goalAt(t))
        assert.ok(s.left <= CHEF_SNAP, `${at} : il aurait sauté (${s.left.toFixed(2)})`)
        pos = s
        assert.ok(!inCounter(pos), `${at} : dans le comptoir en (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`)
      }
    }
    // La commande : il va au bout du self (sa tournée est figée).
    walk(() => CHEF_WAIT, 12)
    assert.ok(Math.hypot(pos.x - CHEF_WAIT.x, pos.z - CHEF_WAIT.z) < 0.01, `${at} : pas arrivé au bout du self`)
    // Finie : sa tournée reste figée le temps du retour, puis reprend.
    walk(() => chefAt(t0), chefReturn(t0))
    const home = chefAt(t0)
    assert.ok(Math.hypot(pos.x - home.x, pos.z - home.z) < 0.01, `${at} : pas revenu à temps`)
    walk((t) => chefAt(t0 + t), 8)
  }
})

test('lui parler fige la tournée quelques secondes', () => {
  const start = { tau: 10, at: 1000, holdUntil: 0 }
  const held = holdChef(start, 3000)
  assert.equal(held.holdUntil, 3000 + CHEF_HOLD * 1000)
  assert.equal(chefTime(held, held.holdUntil), 12)
  assert.equal(chefTime(held, held.holdUntil + 1000), 13)
})

test('pendant une commande, il attend au bout du self, derrière le comptoir et loin de la passe', () => {
  assert.equal(map.room(Math.round(CHEF_WAIT.x), Math.round(CHEF_WAIT.z)), CHEF_ROOM)
  // Côté cuisine, juste derrière le bout est du comptoir, sans le toucher.
  assert.ok(CHEF_WAIT.z > COUNTER.maxZ && CHEF_WAIT.z < COUNTER.maxZ + 0.5)
  assert.ok(CHEF_WAIT.x < COUNTER.maxX && CHEF_WAIT.x > COUNTER.maxX - 1)
  assert.ok(Math.hypot(CHEF_WAIT.x - CHEF_PASSE.x, CHEF_WAIT.z - CHEF_PASSE.z) > 1.5)
})

test('une commande le retient au bout du self, puis lui laisse le temps de revenir', () => {
  const start = { tau: 20, at: 0, holdUntil: 0 }
  const back = chefReturn(22) * 1000
  assert.ok(back > 0)
  // Commande prise à 2 s, jusqu'à 30 s : la tournée reste à 22 s jusqu'au retour.
  const cooking = cookChef(start, 2000, 30000)
  assert.equal(chefTime(cooking, 29000), 22)
  assert.ok(Math.abs(cooking.holdUntil - (30000 + back)) < 1e-6)
  // Finie plus tôt, à 12 s : il repart du bout du self tout de suite.
  const done = cookChef(cooking, 12000, 0)
  assert.equal(chefTime(done, 12000), 22)
  assert.ok(Math.abs(done.holdUntil - (12000 + back)) < 1e-6)
  assert.ok(Math.abs(chefTime(done, done.holdUntil + 1000) - 23) < 1e-9)
})
