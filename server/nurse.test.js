// Tournée de l'infirmière (shared/nurse.js) : la même position partout pour un même instant, sans
// saut, toujours dans l'infirmerie et jamais à travers un meuble ; au chevet de chaque lit et
// retour ; une horloge que l'arrêt et les consultations figent, puis relâchent.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  NURSE_BEDS, NURSE_CATCH_UP, NURSE_DESK, NURSE_HOLD, NURSE_LEVEL, NURSE_OBSTACLES, NURSE_PERIOD, NURSE_POSTS, NURSE_ROOM, NURSE_SNAP,
  NURSE_SPEED, bedOf, careNurse, holdNurse, nurseAt, nurseClear, nurseReturn, nurseRoute, nurseStep, nurseTime,
} from '../shared/nurse.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { ShipMap } from '../shared/ship-map.js'

const map = new ShipMap(SHIP_LAYOUTS[NURSE_LEVEL], shipMapOptions(NURSE_LEVEL))

/** Dans un meuble, à sa carrure près (un peu moins que celle des trajets) : elle n'y passe jamais. */
const inFurniture = ({ x, z }) => NURSE_OBSTACLES.find((r) => x > r.minX - 0.12 && x < r.maxX + 0.12 && z > r.minZ - 0.12 && z < r.maxZ + 0.12)
/** Dans l'infirmerie, à distance des murs (faces intérieures à 0,15 des bords des tuiles). */
const inRoom = ({ x, z }) => map.room(Math.round(x), Math.round(z)) === NURSE_ROOM && x > 8.8 && x < 15.2 && z > -0.2 && z < 3.2
const at = ({ x, z }) => `(${x.toFixed(2)}, ${z.toFixed(2)})`

test('l\'infirmerie occupe la place laissée libre jusqu\'à la salle commune', () => {
  for (let z = 0; z <= 3; z++) for (let x = 9; x <= 15; x++) assert.equal(map.room(x, z), NURSE_ROOM, `tuile (${x}, ${z})`)
  assert.equal(map.room(8, 1), 'e')
  assert.equal(map.room(16, 1), 'r')
})

test('elle avance sans jamais sauter, y compris d\'un tour au suivant', () => {
  const dt = 0.01
  let prev = nurseAt(-dt)
  for (let t = 0; t <= NURSE_PERIOD * 1.2; t += dt) {
    const p = nurseAt(t)
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.yaw))
    assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) <= NURSE_SPEED * dt + 1e-6, `saut à t = ${t.toFixed(2)}`)
    prev = p
  }
})

test('elle reste dans l\'infirmerie, et ne traverse aucun meuble', () => {
  for (let t = 0; t < NURSE_PERIOD; t += 0.02) {
    const p = nurseAt(t)
    assert.ok(inRoom(p), `hors de l'infirmerie en ${at(p)}`)
    assert.ok(!inFurniture(p), `dans un meuble en ${at(p)}`)
  }
})

test('elle travaille à chaque poste, le temps prévu, et passe par son comptoir', () => {
  for (const [index, post] of NURSE_POSTS.entries()) {
    const [x, z] = post.path[post.path.length - 1]
    let worked = 0
    for (let t = 0; t < NURSE_PERIOD; t += 0.05) {
      const p = nurseAt(t)
      if (!p.walking && p.post === index && p.x === x && p.z === z) worked += 0.05
    }
    assert.ok(Math.abs(worked - post.watch) < 0.11, `poste ${index} (${post.at}) : ${worked.toFixed(2)} s`)
  }
  assert.ok(NURSE_POSTS.some((p) => p.at === 'desk' && p.path.at(-1)[0] === NURSE_DESK.x && p.path.at(-1)[1] === NURSE_DESK.z))
})

test('chaque lit a son chevet, libre, dans l\'infirmerie ; on retrouve le lit d\'un joueur allongé', () => {
  for (const [i, bed] of NURSE_BEDS.entries()) {
    assert.ok(inRoom(bed.side), `chevet ${i} hors de l'infirmerie`)
    assert.ok(!inFurniture(bed.side), `chevet ${i} dans un meuble`)
    // Tournée vers le patient (allongé au milieu du lit).
    const toward = Math.atan2(bed.x - bed.side.x, bed.z - bed.side.z)
    assert.ok(Math.abs(toward - bed.side.yaw) < 1e-9)
    // Allongé, la tête vers l'oreiller (cf. seats.ts) : on est sur son lit.
    assert.equal(bedOf({ x: bed.x, z: bed.z + 0.08 }), i)
  }
  assert.equal(bedOf({ x: 13, z: 2 }), -1)
})

test('ses trajets contournent les meubles, par l\'allée ou l\'entrée du comptoir', () => {
  // Du comptoir au chevet du premier lit : pas tout droit (le comptoir est entre les deux).
  const route = nurseRoute(NURSE_DESK, NURSE_BEDS[0].side)
  assert.ok(route.length > 1)
  let from = [NURSE_DESK.x, NURSE_DESK.z]
  for (const p of route) {
    assert.ok(nurseClear(from, p), `segment ${at({ x: from[0], z: from[1] })} → ${at({ x: p[0], z: p[1] })}`)
    from = p
  }
  assert.deepEqual(route.at(-1), [NURSE_BEDS[0].side.x, NURSE_BEDS[0].side.z])
  // Dans l'allée : tout droit.
  assert.deepEqual(nurseRoute({ x: 10, z: 1.65 }, { x: 13, z: 1.65 }), [[13, 1.65]])
})

/** Une image du jeu : elle avance vers sa place comme dans src/nurse.ts. */
const DT = 1 / 30
const frame = (pos, goal) => nurseStep(pos, goal, NURSE_SPEED * NURSE_CATCH_UP * DT)

test('elle suit sa tournée pas à pas, sans détour', () => {
  let pos = nurseAt(0)
  for (let t = DT; t < NURSE_PERIOD * 1.2; t += DT) {
    const s = frame(pos, nurseAt(t))
    assert.ok(s.left < 0.1, `écart de ${s.left.toFixed(2)} à t = ${t.toFixed(2)}`)
    pos = s
    assert.ok(!inFurniture(pos), `dans un meuble en ${at(pos)}`)
  }
})

test('d\'où qu\'elle parte, elle rejoint le chevet de chaque lit puis revient à sa place, sans sauter ni traverser un meuble', () => {
  for (const [bed, { side }] of NURSE_BEDS.entries()) {
    for (let t0 = 0; t0 < NURSE_PERIOD; t0 += 0.9) {
      let pos = nurseAt(t0)
      const when = `lit ${bed}, appel à t = ${t0.toFixed(1)}`
      const walk = (goalAt, seconds) => {
        for (let t = 0; t < seconds; t += DT) {
          const s = frame(pos, goalAt(t))
          assert.ok(s.left <= NURSE_SNAP, `${when} : elle aurait sauté (${s.left.toFixed(2)})`)
          pos = s
          assert.ok(!inFurniture(pos), `${when} : dans un meuble en ${at(pos)}`)
          assert.ok(inRoom(pos), `${when} : hors de l'infirmerie en ${at(pos)}`)
        }
      }
      // La consultation : elle va au chevet (sa tournée est figée).
      walk(() => side, 14)
      assert.ok(Math.hypot(pos.x - side.x, pos.z - side.z) < 0.01, `${when} : pas arrivée au chevet`)
      // Finie : sa tournée reste figée le temps du retour, puis reprend.
      walk(() => nurseAt(t0), nurseReturn(t0, bed))
      const home = nurseAt(t0)
      assert.ok(Math.hypot(pos.x - home.x, pos.z - home.z) < 0.01, `${when} : pas revenue à temps`)
      walk((t) => nurseAt(t0 + t), 6)
    }
  }
})

test('lui parler fige la tournée quelques secondes', () => {
  const start = { tau: 10, at: 1000, holdUntil: 0 }
  const held = holdNurse(start, 3000)
  assert.equal(held.holdUntil, 3000 + NURSE_HOLD * 1000)
  assert.equal(nurseTime(held, held.holdUntil), 12)
  assert.equal(nurseTime(held, held.holdUntil + 1000), 13)
})

test('une consultation la retient au chevet, puis lui laisse le temps de revenir', () => {
  const start = { tau: 20, at: 0, holdUntil: 0 }
  const back = nurseReturn(22, 1) * 1000
  assert.ok(back > 0)
  // Appelée à 2 s, jusqu'à 30 s : la tournée reste à 22 s jusqu'au retour.
  const caring = careNurse(start, 2000, 30000, 1)
  assert.equal(nurseTime(caring, 29000), 22)
  assert.ok(Math.abs(caring.holdUntil - (30000 + back)) < 1e-6)
  // Finie plus tôt, à 12 s : elle repart du chevet tout de suite.
  const done = careNurse(caring, 12000, 0, 1)
  assert.equal(nurseTime(done, 12000), 22)
  assert.ok(Math.abs(done.holdUntil - (12000 + back)) < 1e-6)
  assert.ok(Math.abs(nurseTime(done, done.holdUntil + 1000) - 23) < 1e-9)
})
