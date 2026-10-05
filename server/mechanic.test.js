// Tournée du mécano du hangar (shared/mechanic.js) : la même position partout pour un même
// instant, sans saut, toujours dans le hangar et jamais à travers le Krait ou un meuble ; il va
// attendre son aide devant le nez du Krait et revient ; une horloge que l'arrêt et les révisions
// figent, puis relâchent.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  KRAIT_BURN, KRAIT_COCKPIT, MECH_CATCH_UP, MECH_HOLD, MECH_LEVEL, MECH_OBSTACLES, MECH_PANIC, MECH_PERIOD, MECH_POSTS, MECH_RELIEF, MECH_ROOM, MECH_RUSH,
  MECH_SNAP, MECH_SPEED, MECH_WAIT, helpMech, holdMech, inCockpit, mechAt, mechClear, mechReturn, mechRoute, mechStep, mechTime, panicMech,
} from '../shared/mechanic.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { ShipMap } from '../shared/ship-map.js'

const map = new ShipMap(SHIP_LAYOUTS[MECH_LEVEL], shipMapOptions(MECH_LEVEL))

/** Dans un meuble, à sa carrure près (un peu moins que celle des trajets) : il n'y passe jamais. */
const inFurniture = ({ x, z }) => MECH_OBSTACLES.find((r) => x > r.minX - 0.12 && x < r.maxX + 0.12 && z > r.minZ - 0.12 && z < r.maxZ + 0.12)
/** Dans le hangar, à distance des murs (faces intérieures à 0,15 des bords des tuiles). */
const inRoom = ({ x, z }) => map.room(Math.round(x), Math.round(z)) === MECH_ROOM && x > 25.8 && x < 37.2 && z > -0.2 && z < 10.2
const at = ({ x, z }) => `(${x.toFixed(2)}, ${z.toFixed(2)})`

test('le hangar est collé au lobby, à l\'est, par une porte double', () => {
  for (let z = 0; z <= 10; z++) for (let x = 26; x <= 37; x++) assert.equal(map.room(x, z), MECH_ROOM, `tuile (${x}, ${z})`)
  assert.equal(map.room(38, 5), null)
  // Les deux tuiles de porte appartiennent au hangar, et s'ouvrent sur le lobby, juste à côté.
  for (const z of [4, 5]) {
    assert.equal(map.room(25, z), 'h')
    assert.equal(map.edge(26, z, 3), 'door')
  }
})

test('il avance sans jamais sauter, y compris d\'un tour au suivant', () => {
  const dt = 0.01
  let prev = mechAt(-dt)
  for (let t = 0; t <= MECH_PERIOD * 1.2; t += dt) {
    const p = mechAt(t)
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.yaw))
    assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) <= MECH_SPEED * dt + 1e-6, `saut à t = ${t.toFixed(2)}`)
    prev = p
  }
})

test('il reste dans le hangar, et ne traverse ni le Krait ni un meuble', () => {
  for (let t = 0; t < MECH_PERIOD; t += 0.02) {
    const p = mechAt(t)
    assert.ok(inRoom(p), `hors du hangar en ${at(p)}`)
    assert.ok(!inFurniture(p), `dans un meuble en ${at(p)}`)
  }
})

test('il travaille à chaque poste le temps prévu, et fait le tour du Krait', () => {
  for (const [index, post] of MECH_POSTS.entries()) {
    let worked = 0
    for (let t = 0; t < MECH_PERIOD; t += 0.05) {
      const p = mechAt(t)
      if (!p.walking && p.post === index && p.x === post.x && p.z === post.z) worked += 0.05
    }
    assert.ok(Math.abs(worked - post.watch) < 0.11, `poste ${index} (${post.at}) : ${worked.toFixed(2)} s`)
  }
  // Des postes des quatre côtés du Krait (x de 28,03 à 34,6, z de 1,98 à 8,02).
  assert.ok(MECH_POSTS.some((p) => p.z < 1.98) && MECH_POSTS.some((p) => p.z > 8.02))
  assert.ok(MECH_POSTS.some((p) => p.x < 28.03) && MECH_POSTS.some((p) => p.x > 34.6))
  assert.ok(MECH_POSTS.some((p) => p.x === MECH_WAIT.x && p.z === MECH_WAIT.z))
})

test('ses trajets contournent le Krait par l\'allée', () => {
  // De l'établi (nord-ouest) au ravitaillement (sud) : pas tout droit, le Krait est entre les deux.
  const from = { x: 27.9, z: 0.78 }, to = { x: 32.4, z: 9.3 }
  const route = mechRoute(from, to)
  assert.ok(route.length > 1)
  let prev = [from.x, from.z]
  for (const p of route) {
    assert.ok(mechClear(prev, p), `segment ${at({ x: prev[0], z: prev[1] })} → ${at({ x: p[0], z: p[1] })}`)
    prev = p
  }
  assert.deepEqual(route.at(-1), [to.x, to.z])
  // Dans l'allée nord : tout droit.
  assert.deepEqual(mechRoute({ x: 28, z: 1.2 }, { x: 35, z: 1.2 }), [[35, 1.2]])
})

/** Une image du jeu : il avance vers sa place comme dans src/mechanic.ts. */
const DT = 1 / 30
const frame = (pos, goal) => mechStep(pos, goal, MECH_SPEED * MECH_CATCH_UP * DT)

test('il suit sa tournée pas à pas, sans détour', () => {
  let pos = mechAt(0)
  for (let t = DT; t < MECH_PERIOD * 1.2; t += DT) {
    const s = frame(pos, mechAt(t))
    assert.ok(s.left < 0.1, `écart de ${s.left.toFixed(2)} à t = ${t.toFixed(2)}`)
    pos = s
    assert.ok(!inFurniture(pos), `dans un meuble en ${at(pos)}`)
  }
})

test('d\'où qu\'il parte, il rejoint le nez du Krait puis revient à sa place, sans sauter ni traverser un meuble', () => {
  for (let t0 = 0; t0 < MECH_PERIOD; t0 += 0.9) {
    let pos = mechAt(t0)
    const when = `révision à t = ${t0.toFixed(1)}`
    const walk = (goalAt, seconds) => {
      for (let t = 0; t < seconds; t += DT) {
        const s = frame(pos, goalAt(t))
        assert.ok(s.left <= MECH_SNAP, `${when} : il aurait sauté (${s.left.toFixed(2)})`)
        pos = s
        assert.ok(!inFurniture(pos), `${when} : dans un meuble en ${at(pos)}`)
        assert.ok(inRoom(pos), `${when} : hors du hangar en ${at(pos)}`)
      }
    }
    walk(() => MECH_WAIT, 25)
    assert.ok(Math.hypot(pos.x - MECH_WAIT.x, pos.z - MECH_WAIT.z) < 0.01, `${when} : pas arrivé au nez du Krait`)
    walk(() => mechAt(t0), mechReturn(t0))
    const home = mechAt(t0)
    assert.ok(Math.hypot(pos.x - home.x, pos.z - home.z) < 0.01, `${when} : pas revenu à temps`)
    walk((t) => mechAt(t0 + t), 6)
  }
})

test('réacteurs en route : d\'où qu\'il parte, il court au pied de l\'escabeau, puis revient, sans rien traverser', () => {
  assert.ok(inRoom(MECH_PANIC) && !inFurniture(MECH_PANIC))
  // Face au cockpit.
  assert.ok(Math.abs(Math.atan2(KRAIT_COCKPIT.x - MECH_PANIC.x, KRAIT_COCKPIT.z - MECH_PANIC.z) - MECH_PANIC.yaw) < 1e-9)
  for (let t0 = 0; t0 < MECH_PERIOD; t0 += 1.3) {
    let pos = mechAt(t0)
    const when = `réacteurs à t = ${t0.toFixed(1)}`
    const walk = (goalAt, seconds, rush) => {
      for (let t = 0; t < seconds; t += DT) {
        const s = mechStep(pos, goalAt(t), MECH_SPEED * (rush ? MECH_RUSH : MECH_CATCH_UP) * DT)
        assert.ok(s.left <= MECH_SNAP, `${when} : il aurait sauté (${s.left.toFixed(2)})`)
        pos = s
        assert.ok(!inFurniture(pos), `${when} : dans un meuble en ${at(pos)}`)
        assert.ok(inRoom(pos), `${when} : hors du hangar en ${at(pos)}`)
      }
    }
    // Il arrive au pied de l'escabeau avant que les réacteurs ne se coupent d'eux-mêmes.
    walk(() => MECH_PANIC, KRAIT_BURN, true)
    assert.ok(Math.hypot(pos.x - MECH_PANIC.x, pos.z - MECH_PANIC.z) < 0.01, `${when} : pas arrivé au pied de l'escabeau`)
    walk(() => mechAt(t0), mechReturn(t0, MECH_PANIC))
    const home = mechAt(t0)
    assert.ok(Math.hypot(pos.x - home.x, pos.z - home.z) < 0.01, `${when} : pas revenu à temps`)
  }
})

test('réacteurs en route : la tournée reste figée tant que ça tourne, plus souffler et revenir', () => {
  const start = { tau: 20, at: 0, holdUntil: 0 }
  const back = (MECH_RELIEF + mechReturn(22, MECH_PANIC)) * 1000
  const burning = panicMech(start, 2000, 14000)
  assert.equal(mechTime(burning, 13000), 22)
  assert.ok(Math.abs(burning.holdUntil - (14000 + back)) < 1e-6)
  const cut = panicMech(burning, 5000, 0)
  assert.ok(Math.abs(cut.holdUntil - (5000 + back)) < 1e-6)
  // Aux commandes : assis dans le siège du pilote, pas à côté, pas debout.
  assert.ok(inCockpit({ ...KRAIT_COCKPIT, pose: 'pilot' }))
  assert.ok(!inCockpit({ x: KRAIT_COCKPIT.x + 1, z: KRAIT_COCKPIT.z, pose: 'pilot' }))
  assert.ok(!inCockpit({ ...KRAIT_COCKPIT, pose: null }))
})

test('lui parler fige la tournée quelques secondes', () => {
  const start = { tau: 10, at: 1000, holdUntil: 0 }
  const held = holdMech(start, 3000)
  assert.equal(held.holdUntil, 3000 + MECH_HOLD * 1000)
  assert.equal(mechTime(held, held.holdUntil), 12)
  assert.equal(mechTime(held, held.holdUntil + 1000), 13)
})

test('une révision le retient au nez du Krait, puis lui laisse le temps de revenir', () => {
  const start = { tau: 20, at: 0, holdUntil: 0 }
  const back = mechReturn(22) * 1000
  assert.ok(back > 0)
  const helping = helpMech(start, 2000, 30000)
  assert.equal(mechTime(helping, 29000), 22)
  assert.ok(Math.abs(helping.holdUntil - (30000 + back)) < 1e-6)
  const done = helpMech(helping, 12000, 0)
  assert.equal(mechTime(done, 12000), 22)
  assert.ok(Math.abs(done.holdUntil - (12000 + back)) < 1e-6)
})
