// Les habitués du mess (shared/diners.js) : ils restent dans la salle, n'entrent jamais en cuisine,
// ne traversent ni les tables, ni le comptoir, ni les meubles, ne sautent jamais d'un point à un
// autre, ne se marchent pas dessus, et vivent leur journée dans l'ordre (plateau, repas, retour du
// plateau, café, retour de la tasse).
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DINER_SPEED, DINERS, DINERS_PERIOD, DINING_AREA, dinerAt, dinerSeat, dinerSteps } from '../shared/diners.js'

/** Carrure d'un personnage (cf. RADIUS dans src/player.ts). */
const RADIUS = 0.18

/**
 * Ce que la salle du mess contient (cf. levels.ts, pont principal), en coordonnées du pont : les
 * deux tables de cantine et leurs bancs, le comptoir du self (et, à l'ouest, le passage de l'arche
 * vers la cuisine), et les meubles du mur nord (fontaine, distributeur, coin café, retour plateaux).
 */
const TABLES = [
  { name: 'table 1', minX: 9.15, maxX: 11.25, minZ: 6.73, maxZ: 8.17 },
  { name: 'table 2', minX: 12.75, maxX: 14.85, minZ: 6.73, maxZ: 8.17 },
]
const OBSTACLES = [
  ...TABLES,
  { name: 'comptoir et passages', minX: 8.5, maxX: 15.5, minZ: 9.7, maxZ: 10.3 },
  { name: 'fontaine', minX: 9.1, maxX: 9.5, minZ: 5.65, maxZ: 6 },
  { name: 'distributeur', minX: 10.97, maxX: 11.63, minZ: 5.65, maxZ: 6.07 },
  { name: 'coin café', minX: 11.73, maxX: 12.31, minZ: 5.65, maxZ: 6.01 },
  { name: 'retour plateaux', minX: 14.32, maxX: 15.18, minZ: 5.65, maxZ: 6.03 },
]

/** Distance d'un point à un rectangle. */
function distance(p, r) {
  const dx = Math.max(r.minX - p.x, 0, p.x - r.maxX)
  const dz = Math.max(r.minZ - p.z, 0, p.z - r.maxZ)
  return Math.hypot(dx, dz)
}

/** Les instants d'une période, tous les `dt`. */
function* period(dt = 0.05) {
  for (let t = 0; t < DINERS_PERIOD; t += dt) yield t
}

test('trois habitués, chacun à sa place : une vraie place des tables de cantine, pas la même', () => {
  assert.equal(DINERS.length, 3)
  const seats = DINERS.map((_, i) => dinerSeat(i))
  assert.equal(new Set(seats.map((s) => `${s.x},${s.z}`)).size, 3)
  for (const s of seats) {
    const table = [10.2, 13.8].find((x) => [-0.62, 0, 0.62].some((dx) => Math.abs(s.x - (x + dx)) < 1e-9))
    assert.ok(table, `place ${s.x}`)
    assert.ok([7.45 - 0.6, 7.45 + 0.6].some((z) => Math.abs(s.z - z) < 1e-9), `place ${s.z}`)
    // On s'y assoit depuis son abord, de l'autre côté du banc (cf. seats.ts).
    assert.ok(Math.abs(s.from.x - s.x) < 1e-9 && Math.abs(Math.abs(s.from.z - 7.45) - 0.98) < 0.03)
  }
})

test('ils restent dans la salle du mess, et n\'entrent jamais en cuisine', () => {
  for (let i = 0; i < DINERS.length; i++) {
    for (const t of period()) {
      const d = dinerAt(i, t)
      assert.ok(d.x >= DINING_AREA.minX && d.x <= DINING_AREA.maxX && d.z >= DINING_AREA.minZ && d.z <= DINING_AREA.maxZ, `${DINERS[i].id} à ${t.toFixed(2)} s : ${d.x.toFixed(2)}, ${d.z.toFixed(2)}`)
      // La cuisine commence au comptoir (z = 9,7), passages compris.
      assert.ok(d.z < 9.7 - RADIUS, `${DINERS[i].id} en cuisine à ${t.toFixed(2)} s`)
    }
  }
})

test('ils ne traversent ni les tables, ni le comptoir, ni les meubles (sauf pour s\'asseoir à leur place)', () => {
  for (let i = 0; i < DINERS.length; i++) {
    for (const s of dinerSteps(i)) {
      // S'asseoir, manger, se relever : sur le banc de sa table, par définition.
      if (s.kind === 'sit' || s.kind === 'rise' || s.seated) continue
      for (let k = 0; k <= 1; k += 0.02) {
        const p = { x: s.from[0] + (s.to[0] - s.from[0]) * k, z: s.from[1] + (s.to[1] - s.from[1]) * k }
        for (const o of OBSTACLES) assert.ok(distance(p, o) >= RADIUS - 1e-9, `${DINERS[i].id}, poste ${s.post} (${s.kind}) : trop près de ${o.name} en ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`)
      }
    }
  }
})

test('ils marchent, sans jamais sauter d\'un point à un autre, y compris d\'une période à la suivante', () => {
  const dt = 0.05
  for (let i = 0; i < DINERS.length; i++) {
    let prev = dinerAt(i, -dt)
    for (const t of period(dt)) {
      const d = dinerAt(i, t)
      const moved = Math.hypot(d.x - prev.x, d.z - prev.z)
      // Au pas, ou en s'asseyant (un demi-mètre en SIT_TIME).
      assert.ok(moved <= Math.max(DINER_SPEED, 0.6) * dt + 1e-6, `${DINERS[i].id} saute de ${moved.toFixed(3)} à ${t.toFixed(2)} s`)
      prev = d
    }
  }
})

test('ils ne se marchent pas dessus', () => {
  let closest = Infinity
  for (const t of period()) {
    const all = DINERS.map((_, i) => dinerAt(i, t))
    for (let a = 0; a < all.length; a++) {
      for (let b = a + 1; b < all.length; b++) {
        const d = Math.hypot(all[a].x - all[b].x, all[a].z - all[b].z)
        closest = Math.min(closest, d)
        assert.ok(d >= 2 * RADIUS, `${DINERS[a].id} et ${DINERS[b].id} à ${d.toFixed(2)} l'un de l'autre, à ${t.toFixed(2)} s`)
      }
    }
  }
  assert.ok(closest < Infinity)
})

test('leur journée, dans l\'ordre : un plateau, le repas assis, le plateau rendu, un café, la tasse rendue', () => {
  for (let i = 0; i < DINERS.length; i++) {
    const seen = []
    let last = null
    for (const t of period(0.25)) {
      const d = dinerAt(i, t)
      const state = d.eating ? 'mange' : d.tray ? 'plateau' : d.cup ? 'café' : 'libre'
      if (state !== last) seen.push(state)
      last = state
      // On mange assis, plateau en main ; jamais avec une tasse.
      if (d.eating) assert.ok(d.seated === 1 && d.tray && !d.cup)
      if (d.tray) assert.ok(!d.cup)
    }
    // La journée tourne en rond : on la lit deux fois de suite, d'où qu'elle commence (sans compter
    // deux fois l'état à cheval sur le raccord).
    if (seen.length > 1 && seen[0] === seen[seen.length - 1]) seen.pop()
    const cycle = seen.join(' > ')
    assert.ok(`${cycle} > ${cycle}`.includes('plateau > mange > plateau > libre > café > libre'), `${DINERS[i].id} : ${cycle}`)
  }
})

test('le repas avance pendant qu\'il mange, et reste fini jusqu\'au retour du plateau', () => {
  for (let i = 0; i < DINERS.length; i++) {
    let maxDuring = 0
    for (const t of period(0.25)) {
      const d = dinerAt(i, t)
      if (d.eating) maxDuring = Math.max(maxDuring, d.meal)
      if (d.tray && !d.eating && d.act === 'return') assert.equal(d.meal, 1)
    }
    assert.ok(maxDuring > 0.95)
  }
})
