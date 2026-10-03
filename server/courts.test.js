import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DIRS, ShipMap } from '../shared/ship-map.js'
import { SHIP_LAYOUTS, SPORT_COURTS, shipMapOptions } from '../shared/ship-layouts.js'

const map = new ShipMap(SHIP_LAYOUTS['1'], shipMapOptions(1))
/** Pièces que relie chaque porte du pont supérieur (« ab » : de a vers b). */
const links = new Set(map.doors.flatMap((d) => {
  const a = map.room(d.x, d.z), b = map.room(d.x + DIRS[d.dir].dx, d.z + DIRS[d.dir].dz)
  return [a + b, b + a]
}))

test('zone sportive : du salon d\'écoute au foyer, puis au cinéma et aux deux terrains', () => {
  for (const link of ['oh', 'hn', 'hb', 'hf']) assert.ok(links.has(link), `porte ${link}`)
  // Le cinéma ne s'ouvre plus sur le salon, et les terrains ne communiquent pas entre eux.
  for (const link of ['on', 'bf', 'nf']) assert.ok(!links.has(link), `pas de porte ${link}`)
  // La porte du cinéma est double : deux arêtes voisines, côté est du foyer.
  assert.equal(map.doors.filter((d) => map.room(d.x, d.z) === 'h' && d.dir === 1).length, 2)
})

test('zone sportive : chaque marque de tir est sur son terrain, face au mur ouest de la pièce', () => {
  for (const [game, court] of Object.entries(SPORT_COURTS)) {
    const x = Math.round(court.spot.x), z = Math.round(court.spot.z)
    assert.equal(map.room(x, z), court.room, game)
    // Du mur visé à la marque, rien que le terrain ; derrière le mur, une autre pièce ou le vide.
    const first = Math.round(court.wall + 0.35)
    for (let tx = first; tx <= x; tx++) assert.equal(map.room(tx, Math.round(court.center)), court.room, `${game} en x = ${tx}`)
    assert.notEqual(map.room(first - 1, Math.round(court.center)), court.room, game)
    assert.ok(Math.abs(court.wall - (first - 0.35)) < 1e-9, `${game} : face du mur`)
  }
})
