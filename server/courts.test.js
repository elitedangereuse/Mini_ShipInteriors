import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DIRS, ShipMap } from '../shared/ship-map.js'
import { CARD_ROOM, SHIP_LAYOUTS, SPORT_COURTS, shipMapOptions } from '../shared/ship-layouts.js'

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
  // La porte du cinéma est double : deux arêtes voisines, côté est du foyer ; celle du Comptoir des
  // Cartes Dangereuses aussi, au fond du hall.
  const east = map.doors.filter((d) => map.room(d.x, d.z) === 'h' && d.dir === 1)
  assert.deepEqual(east.map((d) => `${d.x},${d.z}`).sort(), ['22,4', '22,5', '30,10', '30,9'])
})

test('pont supérieur : le salon d\'écoute descend jusqu\'au hall, large de deux tuiles, qui mène au Comptoir', () => {
  // Le salon : cinq tuiles sur cinq, sans trou.
  for (let z = 4; z <= 8; z++) for (let x = 16; x <= 20; x++) assert.equal(map.room(x, z), 'o', `salon en ${x}, ${z}`)
  // Le hall : deux rangées, du planétarium à la porte du Comptoir.
  for (const z of [9, 10]) for (let x = 16; x <= 30; x++) assert.equal(map.room(x, z), 'h', `hall en ${x}, ${z}`)
  assert.ok(links.has('hx'), 'porte du Comptoir')
  // Le Comptoir : sa pièce tient dans les murs annoncés, et on n'y entre que par le hall.
  const { room, minX, maxX, minZ, maxZ, counter } = CARD_ROOM
  for (let z = Math.ceil(minZ); z <= Math.floor(maxZ); z++) for (let x = Math.ceil(minX); x <= Math.floor(maxX); x++) assert.equal(map.room(x, z), room, `Comptoir en ${x}, ${z}`)
  assert.equal(map.room(Math.round(counter.x), Math.round(counter.z)), room)
  for (const link of [...links].filter((l) => l.startsWith(room))) assert.equal(link, room + 'h')
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
